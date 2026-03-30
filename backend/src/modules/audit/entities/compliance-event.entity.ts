import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('compliance_events')
@Index(['entityType', 'entityId'])
@Index(['eventType'])
export class ComplianceEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  eventType: string; // INSPECTION_APPROVED, REPORT_SIGNED, CALIBRATION_EXPIRED, etc.

  @Column()
  entityType: string; // Inspection, Report, Equipment, etc.

  @Column({ nullable: true })
  entityId: string;

  @Column({ nullable: true })
  userId: string;

  @Column({ nullable: true })
  userName: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>; // Additional data (hash, result, reason, etc.)

  @Column({ nullable: true })
  ipAddress: string;

  @CreateDateColumn({ type: 'datetime' })
  timestamp: Date;
}
