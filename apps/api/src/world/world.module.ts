import { Global, Module } from '@nestjs/common';
import { WorldController } from './world.controller';
import { WorldService } from './world.service';
import { WorldProcessor } from './world.processor';
import { WorldWorkerClient } from './world-worker.client';
import { WorldQueueModule } from './world.queue';

@Global()
@Module({
  imports: [WorldQueueModule],
  controllers: [WorldController],
  providers: [WorldService, WorldProcessor, WorldWorkerClient],
  exports: [WorldProcessor],
})
export class WorldModule {}
