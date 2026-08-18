import { Global, Module } from '@nestjs/common';
import { MotionController, AnimationsController } from './motion.controller';
import { MotionService } from './motion.service';
import { MotionProcessor } from './motion.processor';
import { MotionWorkerClient } from './motion-worker.client';
import { MotionQueueModule } from './motion.queue';

@Global()
@Module({
  imports: [MotionQueueModule],
  controllers: [MotionController, AnimationsController],
  providers: [MotionService, MotionProcessor, MotionWorkerClient],
  exports: [MotionProcessor],
})
export class MotionModule {}
