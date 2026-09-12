import { randomBytes, randomInt, createHash } from 'node:crypto';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { PasswordService } from '../../common/services/password.service.js';
import { FeatureFlagsService } from '../../common/services/feature-flags.service.js';
import { TokenService } from '../../common/services/token.service.js';
import type {
  LoginInputT,
  RegisterInputT,
  ResetPasswordInputT,
  VerifyPhoneInputT,
} from '@rentuz/contracts';
import { SMS_SENDER } from './sms.service.js';
import type { SmsSender } from './sms.service.js';

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const LOGIN_FAIL_LIMIT = 10;
const LOGIN_FAIL_WINDOW_SECONDS = 15 * 60;

export interface AuthResult {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
  /** Present only when AUTH_OTP_DEV_MODE=true (dev/test). */
  otpDev?: string;
}

export interface SafeUser {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  avatar: string | null;
  role: string;
  status: string;
  isPhoneVerified: boolean;
  canListProperties: boolean;
  createdAt: Date;
}

const SAFE_USER_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  avatar: true,
  role: true,
  status: true,
  isPhoneVerified: true,
  canListProperties: true,
  createdAt: true,
} satisfies Prisma.usersSelect;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly flags: FeatureFlagsService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  private static sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  async register(input: RegisterInputT, meta: { ip?: string; userAgent?: string }): Promise<AuthResult> {
    const existing = await this.prisma.users.findFirst({
      where: { phone: input.phone, status: { not: 'DELETED' } },
      select: { id: true },
    });
    if (existing) throw new ConflictException({ code: 'CONFLICT' });

    const user = await this.prisma.users.create({
      data: {
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        passwordHash: await this.passwords.hash(input.password),
        role: 'USER',
        status: 'ACTIVE',
        isPhoneVerified: false,
        canListProperties: false,
      },
      select: SAFE_USER_SELECT,
    });

    const otpDev = await this.issueOtp(user.id, user.phone, 'REGISTRATION');
    return this.issueTokens(user, meta, otpDev);
  }

  async login(input: LoginInputT, meta: { ip?: string; userAgent?: string }): Promise<AuthResult> {
    const failKey = `auth:fail:${input.phone}`;
    const fails = await this.redis.client.get(failKey);
    if (fails && Number(fails) >= LOGIN_FAIL_LIMIT) {
      const retryAfter = Math.max(await this.redis.client.ttl(failKey), 1);
      throw new HttpException(
        {
          success: false,
          message: 'Hisob vaqtincha bloklangan',
          error: { code: 'RATE_LIMITED' },
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.users.findFirst({
      where: { phone: input.phone, status: { not: 'DELETED' } },
      select: { ...SAFE_USER_SELECT, passwordHash: true },
    });
    if (!user) throw new UnauthorizedException();

    const ok = await this.passwords.verify(user.passwordHash, input.password).catch(() => false);
    if (!ok) {
      // Account lockout: 10 fails / 15 min (0_Phase.md §4).
      const multi = this.redis.client.multi();
      multi.incr(failKey);
      multi.expire(failKey, LOGIN_FAIL_WINDOW_SECONDS);
      await multi.exec();
      throw new UnauthorizedException();
    }
    await this.redis.client.del(failKey);
    return this.issueTokens(user, meta);
  }

  /** Rotates the presented refresh token; reuse of a revoked token revokes the family (§53). */
  async refresh(rawToken: string, meta: { ip?: string; userAgent?: string }): Promise<AuthResult> {
    const tokenHash = AuthService.sha256(rawToken);
    const record = await this.prisma.refreshTokens.findFirst({
      where: { tokenHash },
      include: { user: { select: SAFE_USER_SELECT } },
    });
    if (!record) throw new UnauthorizedException();

    if (record.revokedAt) {
      // Reuse detection: a revoked token being replayed revokes the whole family.
      await this.prisma.refreshTokens.updateMany({
        where: { family: record.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException();
    }
    if (record.expiresAt < new Date()) {
      await this.prisma.refreshTokens.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException();
    }

    // Rotate: revoke old, issue new within the same family.
    await this.prisma.refreshTokens.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(record.user, meta, undefined, record.family);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const tokenHash = AuthService.sha256(rawToken);
    await this.prisma.refreshTokens.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async verifyPhone(input: VerifyPhoneInputT, meta: { ip?: string; userAgent?: string }): Promise<AuthResult> {
    const user = await this.prisma.users.findFirst({
      where: { phone: input.phone, status: { not: 'DELETED' } },
      select: { ...SAFE_USER_SELECT, id: true },
    });
    if (!user) throw new UnauthorizedException();

    const otp = await this.prisma.phoneVerifications.findFirst({
      where: {
        phone: input.phone,
        purpose: input.purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw new UnauthorizedException();
    if (otp.attempts >= OTP_MAX_ATTEMPTS) throw new UnauthorizedException();

    if (AuthService.sha256(input.code) !== otp.codeHash) {
      await this.prisma.phoneVerifications.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException();
    }

    await this.prisma.phoneVerifications.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    const updated = await this.prisma.users.update({
      where: { id: user.id },
      data: { isPhoneVerified: true, canListProperties: true },
      select: SAFE_USER_SELECT,
    });
    return this.issueTokens(updated, meta);
  }

  async resendOtp(phone: string, purpose: 'REGISTRATION' | 'RESET'): Promise<{ otpDev?: string }> {
    // Invalidate prior unconsumed codes, then issue a fresh one.
    await this.prisma.phoneVerifications.updateMany({
      where: { phone, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    const user = await this.prisma.users.findFirst({ where: { phone }, select: { id: true } });
    const otpDev = await this.issueOtp(user?.id, phone, purpose);
    return otpDev !== undefined ? { otpDev } : {};
  }

  /** Always 200 — no user enumeration (§"Forgot password"). */
  async forgotPassword(phone: string): Promise<{ otpDev?: string }> {
    const user = await this.prisma.users.findFirst({ where: { phone, status: { not: 'DELETED' } } });
    if (!user) return {};
    const otpDev = await this.issueOtp(user.id, phone, 'RESET');
    return otpDev !== undefined ? { otpDev } : {};
  }

  /** New password → revoke ALL refresh tokens for the user (every device). */
  async resetPassword(input: ResetPasswordInputT, meta: { ip?: string; userAgent?: string }): Promise<AuthResult> {
    const user = await this.prisma.users.findFirst({
      where: { phone: input.phone, status: { not: 'DELETED' } },
      select: { ...SAFE_USER_SELECT, id: true },
    });
    if (!user) throw new UnauthorizedException();

    const otp = await this.prisma.phoneVerifications.findFirst({
      where: { phone: input.phone, purpose: 'RESET', consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) throw new UnauthorizedException();

    if (AuthService.sha256(input.code) !== otp.codeHash) {
      await this.prisma.phoneVerifications.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException();
    }

    await this.prisma.$transaction([
      this.prisma.phoneVerifications.update({
        where: { id: otp.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.users.update({
        where: { id: user.id },
        data: { passwordHash: await this.passwords.hash(input.newPassword) },
      }),
      this.prisma.refreshTokens.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return this.issueTokens(user, meta);
  }

  // ─── helpers ───

  private async issueOtp(
    userId: string | undefined,
    phone: string,
    purpose: 'REGISTRATION' | 'LOGIN' | 'RESET',
  ): Promise<string | undefined> {
    const code = String(randomInt(0, 100000)).padStart(5, '0');
    await this.prisma.phoneVerifications.create({
      data: {
        userId,
        phone,
        purpose,
        codeHash: AuthService.sha256(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
      },
    });
    await this.sms.send({ to: phone, code, purpose });
    // AUTH_OTP_DEV_MODE reads the runtime flag (§5 restart-free overrides;
    // production is hard-false in FeatureFlagsService, so the extra
    // NODE_ENV check is belt-and-braces).
    return (await this.flags.get('AUTH_OTP_DEV_MODE')) === true && process.env.NODE_ENV !== 'production'
      ? code
      : undefined;
  }

  private async issueTokens(
    user: SafeUser,
    meta: { ip?: string; userAgent?: string },
    otpDev?: string,
    family?: string,
  ): Promise<AuthResult> {
    const accessToken = this.tokens.signAccessToken({
      sub: user.id,
      role: user.role,
      status: user.status,
    });
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshTokens.create({
      data: {
        userId: user.id,
        tokenHash: AuthService.sha256(refreshToken),
        family: family ?? randomBytes(16).toString('hex'),
        userAgent: meta.userAgent,
        ip: meta.ip,
        expiresAt: new Date(
          Date.now() + Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30) * 24 * 60 * 60 * 1000,
        ),
      },
    });
    const result: AuthResult = { user, accessToken, refreshToken };
    if (otpDev !== undefined) result.otpDev = otpDev;
    return result;
  }
}
