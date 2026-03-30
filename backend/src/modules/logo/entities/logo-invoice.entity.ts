// Bölüm 3 — logo_invoices tablosu
// LOGO ERP'de oluşturulan faturaların sistemdeki iş emirleriyle eşlemesini tutar.
// LOGO'dan dönen fatura ID, fatura numarası ve durum bilgisi burada saklanır.

import {
  Entity, Column, ManyToOne, JoinColumn, Index,
  CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn,
} from 'typeorm';
import { WorkOrder } from '@/modules/work-orders/entities/work-order.entity';

export enum LogoInvoiceStatus {
  PENDING   = 'pending',   // LOGO'ya gönderilmedi
  SENT      = 'sent',      // Gönderildi, yanıt bekleniyor
  SUCCESS   = 'success',   // LOGO fatura oluşturdu
  FAILED    = 'failed',    // LOGO hata döndürdü
  CANCELLED = 'cancelled', // İptal edildi
}

@Entity('logo_invoices')
@Index(['workOrderId'])
export class LogoInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  workOrderId: string;

  @ManyToOne(() => WorkOrder)
  @JoinColumn({ name: 'workOrderId' })
  workOrder: WorkOrder;

  @Column({ nullable: true })
  logoInvoiceId: string; // LOGO'nun iç ID'si

  @Column({ nullable: true })
  logoInvoiceNo: string; // Görünür fatura numarası (örn: "FTR-2024-001234")

  @Column({ type: 'enum', enum: LogoInvoiceStatus, default: LogoInvoiceStatus.PENDING })
  status: LogoInvoiceStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  vatRate: number; // KDV oranı

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  vatAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  totalWithVat: number;

  @Column({ type: 'date', nullable: true })
  invoiceDate: Date;

  @Column({ type: 'json', nullable: true })
  logoPayload: Record<string, any>; // LOGO'ya gönderilen ham payload

  @Column({ type: 'json', nullable: true })
  logoResponse: Record<string, any>; // LOGO'dan dönen ham yanıt

  @Column({ type: 'text', nullable: true })
  errorMessage: string; // Hata varsa

  @Column({ nullable: true })
  createdBy: string; // userId

  @Column({ nullable: true })
  sentAt: Date;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
