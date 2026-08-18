import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsString, IsUrl } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { WebhooksService } from './webhooks.service';

class CreateWebhookDto {
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  url!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  events!: string[];
}

@Controller({ path: 'webhooks', version: '1' })
@UseGuards(JwtAuthGuard)
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWebhookDto) {
    return this.webhooks.create(user.id, dto.url, dto.events);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.webhooks.list(user.id);
  }

  @Get(':id/deliveries')
  deliveries(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.webhooks.recentDeliveries(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.webhooks.delete(user.id, id);
  }
}
