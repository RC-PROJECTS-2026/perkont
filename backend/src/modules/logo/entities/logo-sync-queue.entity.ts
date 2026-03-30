import { Entity, Column, Index, CreateDateColumn } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';

export enum LogoSyncStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum LogoEntityType {
  CUSTOMER = 'customer',
  INVOICE = 'invoice',
  SERVICE_ITEM = 'service_item',
}

export enum LogoDirection {
  PUSH = 'push',   // Bizden → LOGO
  PULL = 'pull',   // LOGO → Bize
}

@Entity('logo_sync_queue')
@Index(['status', 'attemptCount'])
@Index(['entityType', 'entityId'])
export class LogoSyncQueue extends AbstractEntity {
  @Column({ type: 'enum', enum: LogoEntityType })
  entityType: LogoEntityType;

  @Column({ nullable: true })
  entityId: string;

  @Column({ type: 'enum', enum: LogoDirection })
  direction: LogoDirection;

  @Column({ type: 'json' })
  payload: Record<string, any>;

  @Column({ type: 'enum', enum: LogoSyncStatus, default: LogoSyncStatus.PENDING })
  status: LogoSyncStatus;

  @Column({ default: 0 })
  attemptCount: number;

  @Column({ type: 'text', nullable: true })
  lastError: string;

  @Column({ nullable: true })
  lastAttemptedAt: Date;

  @Column({ nullable: true })
  nextRetryAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ nullable: true })
  logoEntityId: string; // LOGO'dan dönen ID

  @Column({ nullable: true })
  logoEntityRef: string; // LOGO fatura no vb.

  @Column({ nullable: true })
  createdById: string;
}
