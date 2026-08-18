import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { GenerationsService } from './generations.service';
import { ImageTo3DDto } from './dto';

@Controller({ path: 'generations', version: '1' })
@UseGuards(JwtAuthGuard)
export class GenerationsController {
  constructor(private readonly generations: GenerationsService) {}

  @Post('image-to-3d')
  create(@CurrentUser() user: AuthUser, @Body() dto: ImageTo3DDto) {
    return this.generations.createImageTo3D(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('take') take?: string) {
    return this.generations.list(user.id, Number(take) || 30);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.generations.get(user.id, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.generations.cancel(user.id, id);
  }
}
