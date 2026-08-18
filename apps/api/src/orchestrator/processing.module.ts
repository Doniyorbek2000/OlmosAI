import { Global, Module } from '@nestjs/common';
import { GenerationProcessor } from './generation-processor.service';

/** Provides the job executor, used by the worker entrypoint. */
@Global()
@Module({
  providers: [GenerationProcessor],
  exports: [GenerationProcessor],
})
export class ProcessingModule {}
