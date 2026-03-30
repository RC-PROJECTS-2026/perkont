import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, Index, ManyToOne, JoinColumn,
} from 'typeorm';

@Entity('audit_logs')
@Index(['entityType', 'entityId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ nullable: true })
  userId: string;

  @Column()
  action: string; // USER_LOGIN, INSPECTION_CREATED, REPORT_APPROVED vs.

  @Column()
  entityType: string; // 'User', 'Inspection', 'Report' vs.

  @Column({ nullable: true })
  entityId: string;

  @Column({ type: 'json', nullable: true })
  oldValues: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  newValues: Record<string, any>;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  deviceInfo: string;

  @Column({ nullable: true })
  sessionId: string;

  @Column({ nullable: true })
  description: string;

  // Bu tablo asla UPDATE veya DELETE almayacak
  @CreateDateColumn({ type: 'datetime' })
  timestamp: Date;
}
