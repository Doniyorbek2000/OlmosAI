import { Body, Controller, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { HybridAuthGuard } from '../api-keys/hybrid-auth.guard';
import { ApiScopes } from '../api-keys/api-scopes.decorator';
import { ApiUsageInterceptor } from '../api-keys/api-usage.interceptor';
import { AgentService } from './agent.service';

class PlanDto {
  @IsString()
  @MinLength(2)
  @MaxLength(1500)
  prompt!: string;
}

@Controller({ path: 'agent', version: '1' })
@UseGuards(HybridAuthGuard)
@UseInterceptors(ApiUsageInterceptor)
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post('plan')
  @ApiScopes('generations:read')
  plan(@Body() dto: PlanDto) {
    return this.agent.plan(dto.prompt);
  }
}
