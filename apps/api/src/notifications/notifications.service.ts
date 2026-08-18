import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode, VeyraError } from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(private readonly prisma: PrismaService) {}

  /** Best-effort in-app notification; never throws into the caller. */
  async notify(userId: string, type: string, title: string, body?: string, data?: Record<string, unknown>): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: { userId, type, title, body, data: (data ?? {}) as object },
      });
    } catch (err) {
      this.logger.warn(`Failed to create notification: ${(err as Error).message}`);
    }
  }

  list(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async unreadCount(userId: string) {
    return { count: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }

  async markRead(userId: string, id: string) {
    const n = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!n) throw new VeyraError(ErrorCode.NOT_FOUND, 'Notification not found');
    await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }
}
