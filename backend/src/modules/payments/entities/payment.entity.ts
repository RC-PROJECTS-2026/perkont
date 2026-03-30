import { Entity, Column, Index, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn } from 'typeorm';

export enum PaymentStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
}

export enum PaymentMethod {
  CREDIT_CARD = 'credit_card',
  BANK_TRANSFER = 'bank_transfer',
  CASH = 'cash',
}

@Entity('payments')
@Index(['invoiceBatchId'])
@Index(['customerId'])
@Index(['status'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  invoiceBatchId: string;

  @Column({ type: 'varchar', length: 36 })
  customerId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency: string;

  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.CREDIT_CARD })
  method: PaymentMethod;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  // iyzico fields
  @Column({ type: 'varchar', length: 255, nullable: true })
  iyzicoPaymentId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  iyzicoConversationId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  iyzicoToken: string;

  @Column({ type: 'text', nullable: true })
  iyzicoCheckoutFormUrl: string;

  @Column({ type: 'int', default: 1 })
  installment: number;

  // Card info (masked)
  @Column({ type: 'varchar', length: 20, nullable: true })
  cardLastFour: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  cardBrand: string; // Visa, Mastercard, Troy

  @Column({ type: 'varchar', length: 100, nullable: true })
  cardHolderName: string;

  // Buyer info
  @Column({ type: 'varchar', length: 255, nullable: true })
  buyerName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  buyerEmail: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  buyerPhone: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  buyerTcNo: string;

  // Response
  @Column({ type: 'json', nullable: true })
  iyzicoResponse: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  refundAmount: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  paidAt: Date;
}
