import { Global, Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetQualityService } from './asset-quality.service';
import { AssetProcessingController } from './asset-processing.controller';
import { AssetProcessingService } from './asset-processing.service';
import { AssetProcessingProcessor } from './asset-processing.processor';
import { AssetWorkerClient } from './asset-worker.client';

@Global()
@Module({
  controllers: [AssetsController, AssetProcessingController],
  providers: [
    AssetQualityService,
    AssetWorkerClient,
    AssetProcessingService,
    AssetProcessingProcessor,
  ],
  exports: [AssetQualityService, AssetProcessingProcessor],
})
export class AssetsModule {}
