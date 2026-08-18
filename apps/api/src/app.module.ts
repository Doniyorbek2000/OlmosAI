import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';
import { BillingModule } from './billing/billing.module';
import { OrchestratorModule } from './orchestrator/orchestrator.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { ProcessingModule } from './orchestrator/processing.module';
import { AssetsModule } from './assets/assets.module';
import { JobsModule } from './jobs/jobs.module';
import { GenerationQueueModule } from './generations/generation-queue';
import { AssetProcessingQueueModule } from './assets/asset-processing.queue';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { UploadsModule } from './uploads/uploads.module';
import { GenerationsModule } from './generations/generations.module';
import { HealthModule } from './health/health.module';
import { RequestIdMiddleware } from './common/request-id.middleware';

@Module({
  imports: [
    // Infrastructure (global)
    AppConfigModule,
    PrismaModule,
    RedisModule,
    StorageModule,
    BillingModule,
    OrchestratorModule,
    WorkflowsModule,
    ProcessingModule,
    AssetsModule,
    JobsModule,
    GenerationQueueModule,
    AssetProcessingQueueModule,
    // Features
    AuthModule,
    ProjectsModule,
    UploadsModule,
    GenerationsModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
