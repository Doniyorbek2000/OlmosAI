import { Global, Module } from '@nestjs/common';
import { StorageService } from '@veyra/storage';
import { AppConfigService } from '../config/config.service';

export const STORAGE = Symbol('STORAGE');

@Global()
@Module({
  providers: [
    {
      provide: STORAGE,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): StorageService =>
        new StorageService({
          endpoint: config.env.S3_ENDPOINT,
          region: config.env.S3_REGION,
          bucket: config.env.S3_BUCKET,
          accessKeyId: config.env.S3_ACCESS_KEY_ID,
          secretAccessKey: config.env.S3_SECRET_ACCESS_KEY,
          forcePathStyle: config.env.S3_FORCE_PATH_STYLE,
        }),
    },
  ],
  exports: [STORAGE],
})
export class StorageModule {}
