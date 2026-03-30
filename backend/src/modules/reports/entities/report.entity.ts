import { Entity, Column, Index, ManyToOne, JoinColumn, VersionColumn } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import { Equipment } from '@/modules/equipment/entities/equipment.entity';

export enum ReportStatus {
  DRAFT = 'draft',
  UNDER_REVIEW = 'under_review',
  REVISION_REQUESTED = 'revision_requested',
  APPROVED = 'approved',
  UNDER_SIGNING = 'under_signing',
  SIGNED = 'signed',
  DELIVERED = 'delivered',
}

@Entity('reports')
@Index(['inspectionId'])
@Index(['status'])
export class Report extends AbstractEntity {
  @Column({ unique: true })
  reportNumber: string; // 'R-2024-00312'

  @Column()
  inspectionId: string;

  @Column({ nullable: true })
  workOrderId: string;

  @Column()
  customerId: string;

  @Column()
  equipmentId: string;

  @ManyToOne(() => Equipment, (e) => e.reports)
  @JoinColumn({ name: 'equipmentId' })
  equipment: Equipment;

  @VersionColumn()
  version: number;

  @Column({ type: 'enum', enum: ReportStatus, default: ReportStatus.DRAFT })
  status: ReportStatus;

  @Column()
  formTemplateId: string;

  @Column()
  formTemplateRevision: string; // Raporun üretildiği form revizyonu

  // PDF dosyaları
  @Column({ nullable: true })
  pdfUrl: string;

  @Column({ nullable: true })
  pdfObjectName: string;

  @Column({ nullable: true })
  signedPdfUrl: string;

  @Column({ nullable: true })
  signedPdfObjectName: string;

  // Bütünlük
  @Column({ nullable: true })
  documentHash: string; // SHA-256 (imza öncesi PDF hash)

  @Column({ nullable: true })
  signedDocumentHash: string; // SHA-256 (imzalı PDF hash)

  // E-imza meta verileri
  @Column({ type: 'json', nullable: true })
  signatureData: {
    signerName: string;
    signerCert: string;
    signTime: string;
    algorithm: string;
    tsaTimestamp?: string;
    provider: string;
  };

  @Column({ nullable: true })
  signedById: string;

  @Column({ nullable: true })
  signedAt: Date;

  // Teslim
  @Column({ nullable: true })
  deliveredAt: Date;

  @Column({ nullable: true })
  deliveryMethod: string; // email, portal, manual

  // Onay geçmişi JSONB
  @Column({ type: 'json', nullable: true })
  reviewHistory: Array<{
    action: string;
    userId: string;
    userName: string;
    comment: string;
    timestamp: string;
  }>;

  @Column({ nullable: true })
  createdById: string;

  @Column({ type: 'text', nullable: true })
  notes: string;
}
