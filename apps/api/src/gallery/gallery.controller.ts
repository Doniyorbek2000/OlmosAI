import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { GalleryService } from './gallery.service';

class PublishDto {
  @IsBoolean() isPublic!: boolean;
  @IsOptional() @IsBoolean() promptPublic?: boolean;
}

@Controller({ version: '1' })
export class GalleryController {
  constructor(private readonly gallery: GalleryService) {}

  // ---- Public (no auth) ---------------------------------------------------
  @Get('gallery')
  list(@Query('sort') sort?: string, @Query('take') take?: string) {
    return this.gallery.list(sort === 'popular' ? 'popular' : 'recent', Number(take) || 30);
  }

  @Get('gallery/:id')
  get(@Param('id') id: string) {
    return this.gallery.get(id);
  }

  // ---- Authenticated ------------------------------------------------------
  @Post('assets/:id/publish')
  @UseGuards(JwtAuthGuard)
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PublishDto) {
    return this.gallery.setPublic(user.id, id, dto.isPublic, dto.promptPublic);
  }

  @Post('assets/:id/like')
  @UseGuards(JwtAuthGuard)
  like(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.gallery.like(user.id, id);
  }

  @Delete('assets/:id/like')
  @UseGuards(JwtAuthGuard)
  unlike(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.gallery.unlike(user.id, id);
  }
}
