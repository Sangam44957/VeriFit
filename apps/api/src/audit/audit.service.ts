import { Injectable, Logger } from '@nestjs/common';

export type AuditAction = 'oauth_login' | 'logout';

export interface AuditEvent {
  action: AuditAction;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  log(event: AuditEvent): void {
    this.logger.log({
      audit: true,
      action: event.action,
      userId: event.userId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      ...event.meta,
    });
  }
}
