import { Global, Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetQualityService } from './asset-quality.service';

@Global()
@Module({
  controllers: [AssetsController],
  providers: [AssetQualityService],
  exports: [AssetQualityService],
})
export class AssetsModule {}
