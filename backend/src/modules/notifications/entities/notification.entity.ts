import { Entity, Column, Index } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';

export enum NotificationChannel {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  IN_APP = 'in_app',
}

export enum NotificationType {
  WORK_ORDER_ASSIGNED = 'work_order_assigned',
  INSPECTION_DUE = 'inspection_due',
  INSPECTION_OVERDUE = 'inspection_overdue',
  REPORT_READY = 'report_ready',
  REPORT_APPROVED = 'report_approved',
  REPORT_REJECTED = 'report_rejected',
  CONTRACT_SIGNED = 'contract_signed',
  CERTIFICATE_EXPIRING = 'certificate_expiring',
  CERTIFICATE_EXPIRED = 'certificate_expired',
  CALIBRATION_DUE = 'calibration_due',
  LOGO_SYNC_FAILED = 'logo_sync_failed',
  ACCOUNT_LOCKED = 'account_locked',
}

@Entity('notifications')
@Index(['recipientId', 'isRead'])
export class Notification extends AbstractEntity {
  @Column({ nullable: true })
  recipientId: string; // User ID (null ise sadece email/sms)

  @Column({ nullable: true })
  customerId: string;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column({ type: 'enum', enum: NotificationChannel })
  channel: NotificationChannel;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>; // deeplink, entity ID, vb.

  @Column({ default: false })
  isRead: boolean;

  @Column({ nullable: true })
  readAt: Date;

  @Column({ default: 'pending' })
  status: string; // pending, sent, failed

  @Column({ nullable: true })
  sentAt: Date;

  @Column({ nullable: true })
  errorMessage: string;

  @Column({ default: 0 })
  retryCount: number;
}
