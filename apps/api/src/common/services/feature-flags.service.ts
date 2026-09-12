import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service.js';

/**
 * §5 "Settings page mutations" (7_Phase.md): runtime feature flags with a
 * Redis override layer (`flags:runtime:*`) on top of env defaults, cached
 * in-process for 5 s so hot paths (every submit / OTP issue) don't pay a
 * Redis round trip. No restart needed to flip a flag.
 *
 * Production hard-guard: AUTO_APPROVE_LISTINGS and AUTH_OTP_DEV_MODE are
 * development conveniences with startup assertions (env.ts). A Redis override
 * must not be able to bypass those assertions at runtime, so the effective
 * value of both is ALWAYS false in production and enabling them via the
 * settings API is refused with 409.
 */
export type FeatureFlagName =
  | 'AUTO_APPROVE_LISTINGS'
  | 'AUTH_OTP_DEV_MODE'
  | 'CHAT_ATTACHMENT_TTL_DAYS'
  | 'NOTIFICATIONS_READ_RETENTION_DAYS'
  | 'NOTIFICATIONS_UNREAD_RETENTION_DAYS';

type FlagValue = boolean | number;

interface FlagDefinition {
  name: FeatureFlagName;
  type: 'boolean' | 'int';
  /** Dev/test booleans that are hard-false in production. */
  productionLocked: boolean;
  envDefault: () => FlagValue;
}

/** CHAT_ATTACHMENT_TTL_DAYS itself arrives with Phase 5's merge — lazy read. */
const FLAG_DEFINITIONS: FlagDefinition[] = [
  {
    name: 'AUTO_APPROVE_LISTINGS',
    type: 'boolean',
    productionLocked: true,
    envDefault: () => process.env.AUTO_APPROVE_LISTINGS === 'true',
  },
  {
    name: 'AUTH_OTP_DEV_MODE',
    type: 'boolean',
    productionLocked: true,
    envDefault: () => process.env.AUTH_OTP_DEV_MODE === 'true',
  },
  {
    name: 'CHAT_ATTACHMENT_TTL_DAYS',
    type: 'int',
    productionLocked: false,
    envDefault: () => {
      const parsed = Number(process.env.CHAT_ATTACHMENT_TTL_DAYS);
      return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 30;
    },
  },
  {
    name: 'NOTIFICATIONS_READ_RETENTION_DAYS',
    type: 'int',
    productionLocked: false,
    envDefault: () => {
      const parsed = Number(process.env.NOTIFICATIONS_READ_RETENTION_DAYS);
      return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 90;
    },
  },
  {
    name: 'NOTIFICATIONS_UNREAD_RETENTION_DAYS',
    type: 'int',
    productionLocked: false,
    envDefault: () => {
      const parsed = Number(process.env.NOTIFICATIONS_UNREAD_RETENTION_DAYS);
      return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 30;
    },
  },
];

export interface FeatureFlagInfo {
  name: FeatureFlagName;
  value: FlagValue;
  source: 'override' | 'env-default';
  productionLocked: boolean;
}

const CACHE_TTL_MS = 5_000;
const REDIS_PREFIX = 'flags:runtime:';

@Injectable()
export class FeatureFlagsService implements FeatureFlagsSource {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private readonly cache = new Map<FeatureFlagName, { value: FlagValue; source: 'override' | 'env-default'; at: number }>();

  constructor(private readonly redis: RedisService) {}

  definitions(): FlagDefinition[] {
    return FLAG_DEFINITIONS;
  }

  private definition(name: FeatureFlagName): FlagDefinition {
    const def = FLAG_DEFINITIONS.find((d) => d.name === name);
    if (!def) throw new Error(`unknown feature flag: ${name}`);
    return def;
  }

  async get(name: FeatureFlagName): Promise<FlagValue> {
    return (await this.getInfo(name)).value;
  }

  async getInfo(name: FeatureFlagName): Promise<FeatureFlagInfo> {
    const def = this.definition(name);
    const cached = this.cache.get(name);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return {
        name,
        value: this.productionClamp(def, cached.value),
        source: cached.source,
        productionLocked: def.productionLocked,
      };
    }

    const override = await this.readOverride(def);
    const info: FeatureFlagInfo = {
      name,
      value: this.productionClamp(def, override?.value ?? def.envDefault()),
      source: override ? 'override' : 'env-default',
      productionLocked: def.productionLocked,
    };
    this.cache.set(name, { value: override?.value ?? def.envDefault(), source: info.source, at: Date.now() });
    return info;
  }

  async all(): Promise<FeatureFlagInfo[]> {
    const out: FeatureFlagInfo[] = [];
    for (const def of FLAG_DEFINITIONS) {
      out.push(await this.getInfo(def.name));
    }
    return out;
  }

  /**
   * Writes the Redis override and invalidates the local cache so the new
   * value is visible immediately on this instance (other instances converge
   * within their 5 s cache window).
   */
  async set(name: FeatureFlagName, value: FlagValue): Promise<void> {
    const def = this.definition(name);
    if (def.type === 'boolean' && typeof value !== 'boolean') {
      throw new ConflictException({ code: 'CONFLICT', message: `${name} boolean qiymat qabul qiladi` });
    }
    if (def.type === 'int' && (typeof value !== 'number' || !Number.isInteger(value) || value < 1)) {
      throw new ConflictException({ code: 'CONFLICT', message: `${name} butun son (≥1) bo'lishi kerak` });
    }
    if (def.productionLocked && process.env.NODE_ENV === 'production' && value === true) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: `${name} ishlab chiqarishda yoqib bo'lmaydi`,
      });
    }
    await this.redis.client.set(`${REDIS_PREFIX}${name}`, String(value));
    this.cache.delete(name);
  }

  private productionClamp(def: FlagDefinition, value: FlagValue): FlagValue {
    if (def.productionLocked && process.env.NODE_ENV === 'production') return false;
    return value;
  }

  private async readOverride(def: FlagDefinition): Promise<{ value: FlagValue } | null> {
    try {
      const raw = await this.redis.client.get(`${REDIS_PREFIX}${def.name}`);
      if (raw === null) return null;
      if (def.type === 'boolean') return { value: raw === 'true' };
      const parsed = Number(raw);
      return { value: Number.isFinite(parsed) ? parsed : def.envDefault() };
    } catch (error) {
      // Redis down → fall back to the env default; flags must never break a request.
      this.logger.warn(
        `flag override read failed (${def.name}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}

/** Minimal read surface other services depend on (keeps mocking easy). */
export interface FeatureFlagsSource {
  get(name: FeatureFlagName): Promise<FlagValue>;
}
