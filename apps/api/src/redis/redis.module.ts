import { Global, Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants.js';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
          maxRetriesPerRequest: 2,
          retryStrategy: (times) => (times > 10 ? null : Math.min(times * 200, 2000)),
        });
        // ioredis emits 'error' on every failed reconnect; without a listener
        // that becomes an unhandled error event and can kill the process.
        client.on('error', () => {});
        return client;
      },
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
