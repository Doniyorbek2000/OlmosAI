import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ErrorCode, VeyraError } from '@veyra/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

const PROJECT_TYPES = ['OBJECT', 'CHARACTER', 'GAME_ASSET', 'PRODUCT', 'WORLD'] as const;

class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(PROJECT_TYPES)
  type?: (typeof PROJECT_TYPES)[number];
}

class UpdateProjectDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

@Controller({ path: 'projects', version: '1' })
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        userId: user.id,
        name: dto.name,
        description: dto.description,
        type: dto.type ?? 'OBJECT',
      },
    });
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('take') take?: string) {
    return this.prisma.project.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(Number(take) || 50, 100),
      include: { _count: { select: { assets: true } } },
    });
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, userId: user.id, deletedAt: null },
      include: { assets: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } } },
    });
    if (!project) throw new VeyraError(ErrorCode.NOT_FOUND, 'Project not found');
    return project;
  }

  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    await this.assertOwned(user.id, id);
    return this.prisma.project.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.assertOwned(user.id, id);
    await this.prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  private async assertOwned(userId: string, id: string): Promise<void> {
    const found = await this.prisma.project.findFirst({ where: { id, userId, deletedAt: null } });
    if (!found) throw new VeyraError(ErrorCode.NOT_FOUND, 'Project not found');
  }
}
