import {
  Entity, Column, OneToMany, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';

export enum QuotationStatus {
  DRAFT    = 'draft',
  SENT     = 'sent',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED  = 'expired',
}

@Entity('quotations')
@Index(['customerId', 'status'])
export class Quotation extends AbstractEntity {
  @Column({ unique: true })
  quoteNumber: string;

  @Column()
  customerId: string;

  @Column({ type: 'enum', enum: QuotationStatus, default: QuotationStatus.DRAFT })
  status: QuotationStatus;

  @Column({ type: 'date', nullable: true })
  validUntil: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ default: 'TRY' })
  currency: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  discountRate: number;

  @Column({ nullable: true })
  sentAt: Date;

  @Column({ nullable: true })
  acceptedAt: Date;

  @Column({ nullable: true })
  rejectedAt: Date;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ nullable: true })
  createdById: string;

  @OneToMany(() => QuotationItem, (i) => i.quotation, { cascade: true })
  items: QuotationItem[];
}

@Entity('quotation_items')
export class QuotationItem extends AbstractEntity {
  @Column()
  quotationId: string;

  @ManyToOne(() => Quotation, (q) => q.items)
  @JoinColumn({ name: 'quotationId' })
  quotation: Quotation;

  @Column({ nullable: true })
  equipmentTypeId: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ default: 1 })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  discountRate: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  totalPrice: number;

  @Column({ nullable: true })
  serviceCode: string;
}
