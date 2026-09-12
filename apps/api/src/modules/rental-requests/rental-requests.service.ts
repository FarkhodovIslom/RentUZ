import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { RentalStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FxService } from '../fx/fx.service.js';
import { SearchCacheService } from '../search/search-cache.service.js';
import { EventBusService } from '../../common/services/event-bus.service.js';
import {
  buildPaginationMeta,
  type CreateRentalRequestInputT,
  type RentalRequestDTOT,
  type RentalRequestListQueryT,
  type UpdateRentalRequestInputT,
} from '@rentuz/contracts';
import { toCardDTO, type CardRow } from '../properties/property-card.mapper.js';
import { RentalLifecycleService, type RentalLike } from './rental-lifecycle.service.js';

const TX_TIMEOUT_MS = 10_000; // Prisma 7 interactive-tx default is 5s (trap: FOR UPDATE chains)

/** Postgres 23505 from the partial unique index on pending duplicates (§54). */
const PENDING_UNIQ_CONSTRAINT = 'rental_requests_pending_uniq';

const AUTO_REJECT_NOTE = 'Auto-rejected: property rented';

type RequestRow = Prisma.rentalRequestsGetPayload<{
  include: { property: { include: { images: true; region: true } } };
}>;

/** @nestjs/swagger route annotation needs @nestia? No — controller handles that. */
@Injectable()
export class RentalRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fx: FxService,
    private readonly searchCache: SearchCacheService,
    private readonly events: EventBusService,
    private readonly lifecycle: RentalLifecycleService,
  ) {}

  // ---------------------------------------------------------------- create

  async create(tenantId: string, input: CreateRentalRequestInputT): Promise<RentalRequestDTOT> {
    const property = await this.prisma.properties.findUnique({
      where: { id: input.propertyId },
      select: { id: true, ownerId: true, status: true, price: true, currency: true },
    });
    if (!property || property.status === 'DELETED') throw new NotFoundException();
    if (property.ownerId === tenantId) {
      throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSIONS' });
    }
    if (property.status !== 'ACTIVE') {
      throw new ConflictException({ code: 'PROPERTY_NOT_AVAILABLE' });
    }

    // §25 frozen snapshot — FX rate at this instant; later price changes never
    // mutate existing request snapshots. startDate arrives as an ISO string on
    // the wire (JSON Schema cannot express Date — see contract comment).
    const priceUzsSnapshot = await this.fx.toUzs(Number(property.price), property.currency);
    const startDate = new Date(input.startDate);

    let created: Prisma.rentalRequestsGetPayload<Record<string, never>>;
    try {
      created = await this.prisma.rentalRequests.create({
        data: {
          tenantId,
          ownerId: property.ownerId,
          propertyId: property.id,
          message: input.message,
          startDate,
          durationMonths: input.durationMonths,
          priceSnapshot: property.price,
          currency: property.currency,
          priceUzsSnapshot,
        },
      });
    } catch (error) {
      // Prisma 7 surfaces the partial unique index as P2002, but the
      // constraint name only appears inside the driver-adapter cause
      // (meta.driverAdapterError.cause.originalMessage) — match on it.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        String((error.meta?.driverAdapterError as { cause?: { originalMessage?: string } })?.cause?.originalMessage).includes(PENDING_UNIQ_CONSTRAINT)
      ) {
        throw new ConflictException({ code: 'DUPLICATE_PENDING_REQUEST' });
      }
      throw error;
    }

    this.events.emit('rental_request.created', {
      requestId: created.id,
      tenantId,
      ownerId: property.ownerId,
      propertyId: property.id,
    });
    return this.findOne(tenantId, created.id);
  }

  // ------------------------------------------------------- accept (§86 race-safe)

  async accept(
    userId: string,
    requestId: string,
    note?: string,
  ): Promise<RentalRequestDTOT> {
    const request = await this.loadForOwner(userId, requestId);

    // Serializable section: lock the property row, then flip statuses with
    // conditional updates so a competing accept can only ever see one winner.
    const { acceptedId, competitorIds } = await this.prisma.$transaction(
      async (tx) => {
        const locked: Array<{ id: string; status: string }> = await tx.$queryRaw(
          Prisma.sql`SELECT id, status FROM properties WHERE id = ${request.propertyId} FOR UPDATE`,
        );
        if (!locked[0]) throw new NotFoundException();
        if (locked[0].status !== 'ACTIVE') {
          throw new ConflictException({ code: 'PROPERTY_NOT_AVAILABLE' });
        }

        const acceptedCount = await tx.rentalRequests.updateMany({
          where: { id: requestId, status: 'PENDING' },
          data: {
            status: 'ACCEPTED',
            decidedAt: new Date(),
            decidedBy: userId,
            ...(note ? { decisionNote: note } : {}),
          },
        });
        if (acceptedCount.count === 0) {
          throw new ConflictException({ code: 'PROPERTY_NOT_AVAILABLE' });
        }

        await tx.properties.update({
          where: { id: request.propertyId },
          data: { status: 'RENTED' },
        });

        // Capture the competitors before the flip so each gets their own
        // rejection notification (tenant ids, not just a count).
        const competitors = await tx.rentalRequests.findMany({
          where: { propertyId: request.propertyId, status: 'PENDING', id: { not: requestId } },
          select: { id: true, tenantId: true, ownerId: true, propertyId: true },
        });
        await tx.rentalRequests.updateMany({
          where: { propertyId: request.propertyId, status: 'PENDING', id: { not: requestId } },
          data: {
            status: 'REJECTED',
            decidedAt: new Date(),
            decidedBy: userId,
            decisionNote: AUTO_REJECT_NOTE,
          },
        });
        return { acceptedId: requestId, competitorIds: competitors };
      },
      { timeout: TX_TIMEOUT_MS },
    );

    // Post-commit: RENTED leaves search results; notify tenant + competitors.
    await this.searchCache.bumpVersion();
    this.events.emit('rental_request.accepted', {
      requestId,
      tenantId: request.tenantId,
      ownerId: request.ownerId,
      propertyId: request.propertyId,
    });
    for (const competitor of competitorIds) {
      this.events.emit('rental_request.rejected', {
        requestId: competitor.id,
        tenantId: competitor.tenantId,
        ownerId: competitor.ownerId,
        propertyId: competitor.propertyId,
        note: AUTO_REJECT_NOTE,
      });
    }
    return this.findOne(userId, acceptedId);
  }

  async reject(userId: string, requestId: string, note?: string): Promise<RentalRequestDTOT> {
    const request = await this.loadForOwner(userId, requestId);
    const updated = await this.prisma.rentalRequests.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        decidedAt: new Date(),
        decidedBy: userId,
        ...(note ? { decisionNote: note } : {}),
      },
    });
    if (updated.count === 0) throw new ConflictException({ code: 'PROPERTY_NOT_AVAILABLE' });
    this.events.emit('rental_request.rejected', {
      requestId,
      tenantId: request.tenantId,
      ownerId: request.ownerId,
      propertyId: request.propertyId,
    });
    return this.findOne(userId, requestId);
  }

  async cancel(userId: string, requestId: string): Promise<RentalRequestDTOT> {
    const request = await this.prisma.rentalRequests.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException();
    if (request.tenantId !== userId) {
      throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSIONS' });
    }
    const updated = await this.prisma.rentalRequests.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: { status: 'CANCELLED', decidedAt: new Date(), decidedBy: userId },
    });
    if (updated.count === 0) throw new ConflictException({ code: 'PROPERTY_NOT_AVAILABLE' });
    this.events.emit('rental_request.cancelled', {
      requestId,
      tenantId: request.tenantId,
      ownerId: request.ownerId,
      propertyId: request.propertyId,
    });
    return this.findOne(userId, requestId);
  }

  /** PATCH dispatcher — §54 role gates: owner ACCEPT/REJECT, tenant CANCEL. */
  async update(
    userId: string,
    requestId: string,
    input: UpdateRentalRequestInputT,
  ): Promise<RentalRequestDTOT> {
    if (input.status === 'CANCELLED') return this.cancel(userId, requestId);
    const existing = await this.prisma.rentalRequests.findUnique({
      where: { id: requestId },
      select: { ownerId: true, tenantId: true },
    });
    if (!existing) throw new NotFoundException();
    // Only the property's owner may accept/reject (a tenant sending ACCEPT is 403).
    if (input.status === 'ACCEPTED' || input.status === 'REJECTED') {
      if (existing.ownerId !== userId) {
        throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSIONS' });
      }
      return input.status === 'ACCEPTED'
        ? this.accept(userId, requestId, input.note)
        : this.reject(userId, requestId, input.note);
    }
    throw new ConflictException({ code: 'PROPERTY_NOT_AVAILABLE' });
  }

  // ------------------------------------------------------------------ reads

  async listMy(
    tenantId: string,
    query: RentalRequestListQueryT,
  ): Promise<{ data: RentalRequestDTOT[]; meta: ReturnType<typeof buildPaginationMeta> }> {
    const where: Prisma.rentalRequestsWhereInput = { tenantId };
    if (query.status) where.status = query.status;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.rentalRequests.findMany({
        where,
        include: REQUEST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.rentalRequests.count({ where }),
    ]);
    return {
      data: rows.map((r) => this.toDTO(r, { tenantCard: false })),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async listForOwner(
    ownerId: string,
    query: RentalRequestListQueryT,
  ): Promise<{ data: RentalRequestDTOT[]; meta: ReturnType<typeof buildPaginationMeta> }> {
    const where: Prisma.rentalRequestsWhereInput = { ownerId };
    if (query.status) where.status = query.status;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.rentalRequests.findMany({
        where,
        include: { ...REQUEST_INCLUDE, tenant: { select: { name: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.rentalRequests.count({ where }),
    ]);
    return {
      data: rows.map((r) => this.toDTO(r, { tenantCard: true })),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  /** tenant | owner of the property | admin (§54). */
  async findOne(userId: string, requestId: string): Promise<RentalRequestDTOT> {
    const request = await this.prisma.rentalRequests.findUnique({
      where: { id: requestId },
      include: REQUEST_INCLUDE,
    });
    if (!request) throw new NotFoundException();
    const isTenant = request.tenantId === userId;
    const isOwner = request.ownerId === userId;
    if (!isTenant && !isOwner && userId !== request.ownerId) {
      throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSIONS' });
    }
    return this.toDTO(request, { tenantCard: isOwner });
  }

  // ------------------------------------------- job entry points (§70, idempotent)

  /**
   * ACCEPTED past endDate → COMPLETED; property back to ACTIVE when no other
   * ACCEPTED rental still covers the present. Returns the ids touched (tests
   * assert idempotency: second call returns empty).
   */
  async completeExpiredRentals(now: Date = new Date()): Promise<{ completedIds: string[] }> {
    const active = await this.prisma.rentalRequests.findMany({
      where: { status: 'ACCEPTED' },
      select: { id: true, propertyId: true, tenantId: true, ownerId: true, startDate: true, durationMonths: true },
    });
    const due = active.filter((r) => this.lifecycle.materializeEndDate(r) <= now);
    if (due.length === 0) return { completedIds: [] };

    const completedIds = await this.prisma.$transaction(
      async (tx) => {
        const ids: string[] = [];
        for (const r of due) {
          const res = await tx.rentalRequests.updateMany({
            where: { id: r.id, status: 'ACCEPTED' },
            data: { status: 'COMPLETED', decidedAt: now },
          });
          if (res.count === 0) continue; // raced with another worker — idempotent no-op
          ids.push(r.id);
        }
        // A property returns to ACTIVE only when every remaining ACCEPTED
        // rental (if any) is also past its end — i.e. none still covers `now`.
        const affectedPropertyIds = [...new Set(due.map((r) => r.propertyId))];
        const remaining = await tx.rentalRequests.findMany({
          where: { propertyId: { in: affectedPropertyIds }, status: 'ACCEPTED' },
          select: { propertyId: true, startDate: true, durationMonths: true },
        });
        const stillCovered = new Set(
          remaining
            .filter((r) => this.lifecycle.materializeEndDate(r) > now)
            .map((r) => r.propertyId),
        );
        const toReactivate = affectedPropertyIds.filter((id) => !stillCovered.has(id));
        if (toReactivate.length > 0) {
          await tx.properties.updateMany({
            where: { id: { in: toReactivate }, status: 'RENTED' },
            data: { status: 'ACTIVE' },
          });
        }
        return ids;
      },
      { timeout: TX_TIMEOUT_MS },
    );

    if (completedIds.length > 0) await this.searchCache.bumpVersion();
    for (const id of completedIds) {
      const r = due.find((d) => d.id === id)!;
      this.events.emit('rental_request.completed', {
        requestId: id,
        tenantId: r.tenantId,
        ownerId: r.ownerId,
        propertyId: r.propertyId,
      });
    }
    return { completedIds };
  }

  /** PENDING with startDate more than 1 day past → EXPIRED (§86 deviation). */
  async expireStalePending(now: Date = new Date()): Promise<{ expiredIds: string[] }> {
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const stale = await this.prisma.rentalRequests.findMany({
      where: { status: 'PENDING', startDate: { lt: cutoff } },
      select: { id: true, tenantId: true, ownerId: true, propertyId: true },
    });
    if (stale.length === 0) return { expiredIds: [] };
    const expiredIds: string[] = [];
    for (const r of stale) {
      const res = await this.prisma.rentalRequests.updateMany({
        where: { id: r.id, status: 'PENDING', startDate: { lt: cutoff } },
        data: { status: 'EXPIRED' },
      });
      if (res.count === 0) continue;
      expiredIds.push(r.id);
      this.events.emit('rental_request.expired', {
        requestId: r.id,
        tenantId: r.tenantId,
        ownerId: r.ownerId,
        propertyId: r.propertyId,
      });
    }
    return { expiredIds };
  }

  // -------------------------------------------------------------- internals

  /** Owner gate: request must exist and belong to a property the user owns. */
  private async loadForOwner(userId: string, requestId: string) {
    const request = await this.prisma.rentalRequests.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        tenantId: true,
        ownerId: true,
        propertyId: true,
        status: true,
      },
    });
    if (!request) throw new NotFoundException();
    if (request.ownerId !== userId) {
      throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSIONS' });
    }
    return request;
  }

  private toDTO(
    r: RequestRow & { tenant?: { name: string; avatar: string | null } },
    opts: { tenantCard: boolean },
  ): RentalRequestDTOT {
    return {
      id: r.id,
      propertyId: r.propertyId,
      propertyCard: toCardDTO(r.property as unknown as CardRow),
      message: r.message,
      startDate: r.startDate,
      durationMonths: r.durationMonths,
      endDate: this.lifecycle.materializeEndDate(r as RentalLike),
      priceSnapshot: Number(r.priceSnapshot),
      currency: r.currency,
      priceUzsSnapshot: Number(r.priceUzsSnapshot),
      status: r.status,
      decidedAt: r.decidedAt,
      decisionNote: r.decisionNote,
      createdAt: r.createdAt,
      ...(opts.tenantCard && r.tenant
        ? { tenantCard: { name: r.tenant.name, avatarUrl: r.tenant.avatar } }
        : {}),
    };
  }
}

/** Card hydration include shared by every read path. */
const REQUEST_INCLUDE = {
  property: {
    include: {
      images: { take: 1, orderBy: { ordering: 'asc' as const } },
      region: true,
    },
  },
} satisfies Prisma.rentalRequestsInclude;

export type { RentalStatus };
