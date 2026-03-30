// Bölüm 3 — report_reviews tablosu
// Her rapor için inceleme/onay/iade geçmişini tutar.
// Teknik yöneticinin yaptığı her eylem (onayla, iade et, imzala) buraya kaydedilir.
// Bu kayıtlar ISO 17020 Madde 8.3 (kontrol ve tasdik) için denetim kanıtı oluşturur.

import {
  Entity, Column, ManyToOne, JoinColumn, Index,
  CreateDateColumn, PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';

export enum ReviewAction {
  SUBMITTED          = 'submitted',          // Muayene elemanı gönderdi
  UNDER_REVIEW       = 'under_review',       // İncelemeye alındı
  APPROVED           = 'approved',           // Onaylandı
  REVISION_REQUESTED = 'revision_requested', // Revizyon istendi
  REJECTED           = 'rejected',           // Reddedildi
  SIGNED             = 'signed',             // E-imzalandı
  DELIVERED          = 'delivered',          // Müşteriye teslim edildi
}

@Entity('report_reviews')
@Index(['reportId'])
export class ReportReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  reportId: string;

  @Index()
  @Column()
  reviewerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'reviewerId' })
  reviewer: User;

  @Column({ type: 'enum', enum: ReviewAction })
  action: ReviewAction;

  @Column({ type: 'text', nullable: true })
  comment: string; // İade gerekçesi, onay notu vb.

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>; // Ek veriler (imza hash, teslim yöntemi vb.)

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
