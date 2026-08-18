import { Global, Module, type OnModuleDestroy } from '@nestjs/common';
import IORedis, { type Redis } from 'ioredis';
import { AppConfigService } from '../config/config.service';

export const REDIS = Symbol('REDIS');
export const REDIS_SUB = Symbol('REDIS_SUB');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): Redis =>
        new IORedis(config.env.REDIS_URL, { maxRetriesPerRequest: null }),
    },
    {
      provide: REDIS_SUB,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): Redis =>
        new IORedis(config.env.REDIS_URL, { maxRetriesPerRequest: null }),
    },
  ],
  exports: [REDIS, REDIS_SUB],
})
export class RedisModule implements OnModuleDestroy {
  constructor() {}
  async onModuleDestroy(): Promise<void> {
    // Connections are closed by the process lifecycle; explicit cleanup could
    // be added here if hot-reloading in a long-lived worker.
  }
}
