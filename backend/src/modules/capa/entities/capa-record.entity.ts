import { Entity, Column, Index } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';

export enum CapaType     { CORRECTIVE = 'corrective', PREVENTIVE = 'preventive' }
export enum CapaStatus   { OPEN = 'open', IN_PROGRESS = 'in_progress', EFFECTIVENESS_CHECK = 'effectiveness_check', CLOSED = 'closed' }
export enum CapaSeverity { CRITICAL = 'critical', MAJOR = 'major', MINOR = 'minor' }

@Entity('capa_records')
@Index(['status'])
export class CapaRecord extends AbstractEntity {
  @Column({ unique: true })
  capaNumber: string;
  @Column({ type: 'enum', enum: CapaType })
  type: CapaType;
  @Column({ type: 'enum', enum: CapaStatus, default: CapaStatus.OPEN })
  status: CapaStatus;
  @Column({ type: 'enum', enum: CapaSeverity })
  severity: CapaSeverity;
  @Column({ type: 'text' })
  nonconformityDescription: string;
  @Column({ nullable: true }) sourceType: string;
  @Column({ nullable: true }) sourceId: string;
  @Column({ type: 'text', nullable: true }) rootCauseAnalysis: string;
  @Column({ type: 'text', nullable: true }) proposedAction: string;
  @Column({ type: 'date', nullable: true }) targetDate: Date;
  @Column({ nullable: true }) assignedToId: string;
  @Column({ type: 'text', nullable: true }) implementedAction: string;
  @Column({ nullable: true }) implementedAt: Date;
  @Column({ type: 'text', nullable: true }) effectivenessResult: string;
  @Column({ nullable: true }) closedAt: Date;
  @Column({ nullable: true }) closedById: string;
  @Column({ type: 'json', nullable: true }) attachments: string[];
  @Column({ nullable: true }) createdById: string;
}
