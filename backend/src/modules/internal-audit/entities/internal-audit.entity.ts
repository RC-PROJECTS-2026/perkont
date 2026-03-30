import { Entity, Column, OneToMany, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';

export enum AuditPlanStatus  { PLANNED = 'planned', IN_PROGRESS = 'in_progress', COMPLETED = 'completed' }
export enum FindingSeverity  { MAJOR = 'major', MINOR = 'minor', OBSERVATION = 'observation' }
export enum FindingStatus    { OPEN = 'open', IN_PROGRESS = 'in_progress', CLOSED = 'closed' }

@Entity('internal_audit_plans')
export class InternalAuditPlan extends AbstractEntity {
  @Column({ unique: true }) auditNumber: string;
  @Column() title: string;
  @Column({ type: 'date' }) plannedDate: Date;
  @Column({ nullable: true }) actualDate: Date;
  @Column({ nullable: true }) leadAuditorId: string;
  @Column({ type: 'json', nullable: true }) auditScope: string[];
  @Column({ type: 'enum', enum: AuditPlanStatus, default: AuditPlanStatus.PLANNED }) status: AuditPlanStatus;
  @Column({ type: 'text', nullable: true }) objective: string;
  @Column({ type: 'text', nullable: true }) summary: string;
  @Column({ nullable: true }) createdById: string;
  @OneToMany(() => InternalAuditFinding, (f) => f.auditPlan, { cascade: true }) findings: InternalAuditFinding[];
}

@Entity('internal_audit_findings')
@Index(['auditPlanId'])
export class InternalAuditFinding extends AbstractEntity {
  @Column() auditPlanId: string;
  @ManyToOne(() => InternalAuditPlan, (p) => p.findings) @JoinColumn({ name: 'auditPlanId' }) auditPlan: InternalAuditPlan;
  @Column() findingNumber: string;
  @Column({ type: 'enum', enum: FindingSeverity }) severity: FindingSeverity;
  @Column({ type: 'enum', enum: FindingStatus, default: FindingStatus.OPEN }) status: FindingStatus;
  @Column() clause: string;
  @Column({ type: 'text' }) description: string;
  @Column({ nullable: true }) evidenceRef: string;
  @Column({ type: 'text', nullable: true }) correctiveAction: string;
  @Column({ type: 'date', nullable: true }) targetDate: Date;
  @Column({ nullable: true }) responsibleId: string;
  @Column({ nullable: true }) closedAt: Date;
  @Column({ nullable: true }) closedById: string;
}
