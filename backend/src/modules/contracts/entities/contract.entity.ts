import { Entity, Column, Index } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';

export enum ContractStatus {
  DRAFT      = 'draft',
  SENT       = 'sent',
  SIGNED     = 'signed',
  ACTIVE     = 'active',
  EXPIRED    = 'expired',
  TERMINATED = 'terminated',
}

@Entity('contracts')
@Index(['customerId', 'status'])
export class Contract extends AbstractEntity {
  @Column({ unique: true })
  contractNumber: string;

  @Column()
  customerId: string;

  @Column({ nullable: true })
  quotationId: string;

  @Column({ default: 1 })
  version: number;

  @Column({ type: 'enum', enum: ContractStatus, default: ContractStatus.DRAFT })
  status: ContractStatus;

  @Column({ type: 'date', nullable: true })
  startDate: Date;

  @Column({ type: 'date', nullable: true })
  endDate: Date;

  @Column({ default: false })
  autoRenew: boolean;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  totalValue: number;

  @Column({ default: 'TRY' })
  currency: string;

  @Column({ nullable: true })
  documentUrl: string;

  @Column({ nullable: true })
  signedDocumentUrl: string;

  @Column({ nullable: true })
  documentHash: string;

  @Column({ nullable: true })
  customerSignedAt: Date;

  @Column({ nullable: true })
  companySignedAt: Date;

  @Column({ nullable: true })
  companySignedById: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ nullable: true })
  createdById: string;
}
