import { Global, Module } from '@nestjs/common';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeyService } from './api-key.service';
import { HybridAuthGuard } from './hybrid-auth.guard';
import { ApiUsageInterceptor } from './api-usage.interceptor';

@Global()
@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeyService, HybridAuthGuard, ApiUsageInterceptor],
  exports: [ApiKeyService, HybridAuthGuard, ApiUsageInterceptor],
})
export class ApiKeysModule {}
