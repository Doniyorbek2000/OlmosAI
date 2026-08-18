import { Global, Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobEventsService } from './job-events.service';

@Global()
@Module({
  controllers: [JobsController],
  providers: [JobEventsService],
  exports: [JobEventsService],
})
export class JobsModule {}
