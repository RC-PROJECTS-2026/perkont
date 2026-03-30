import { Entity, Column, Index } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';

export enum ComplaintType   { COMPLAINT = 'complaint', APPEAL = 'appeal' }
export enum ComplaintStatus { RECEIVED = 'received', UNDER_INVESTIGATION = 'under_investigation', RESOLVED = 'resolved', CLOSED = 'closed' }

@Entity('complaints')
@Index(['status', 'type'])
export class Complaint extends AbstractEntity {
  @Column({ unique: true }) complaintNumber: string;
  @Column({ type: 'enum', enum: ComplaintType }) type: ComplaintType;
  @Column({ type: 'enum', enum: ComplaintStatus, default: ComplaintStatus.RECEIVED }) status: ComplaintStatus;
  @Column({ nullable: true }) customerId: string;
  @Column({ nullable: true }) reportId: string;
  @Column({ nullable: true }) inspectionId: string;
  @Column() subject: string;
  @Column({ type: 'text' }) description: string;
  @Column({ nullable: true }) complainantName: string;
  @Column({ nullable: true }) complainantEmail: string;
  @Column({ nullable: true }) complainantPhone: string;
  @Column({ nullable: true }) assignedToId: string;
  @Column({ type: 'text', nullable: true }) investigationNotes: string;
  @Column({ type: 'text', nullable: true }) resolution: string;
  @Column({ nullable: true }) resolvedAt: Date;
  @Column({ nullable: true }) closedAt: Date;
  @Column({ nullable: true }) closedById: string;
  @Column({ type: 'date', nullable: true }) targetResolutionDate: Date;
  @Column({ type: 'json', nullable: true }) attachments: string[];
  @Column({ nullable: true }) createdById: string;
}
