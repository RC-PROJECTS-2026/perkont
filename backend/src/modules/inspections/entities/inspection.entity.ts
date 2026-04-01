import {
  Entity, Column, ManyToOne, OneToMany,
  JoinColumn, Index, VersionColumn,
} from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import { Equipment } from '@/modules/equipment/entities/equipment.entity';

export enum InspectionStatus {
  DRAFT = 'draft',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  REVISION_REQUESTED = 'revision_requested',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum InspectionResult {
  COMPLIANT = 'uygun',
  NON_COMPLIANT = 'uygunsuz',
  PARTIALLY_COMPLIANT = 'kismi_uygun',
  NOT_APPLICABLE = 'uygulanamaz',
  NOT_INSPECTED = 'denetlenemedi',
  POSTPONED = 'ertelendi',
}

export enum SyncStatus {
  SYNCED = 'synced',
  PENDING = 'pending',
  CONFLICT = 'conflict',
  FAILED = 'failed',
}

export enum MediaType {
  PHOTO = 'photo',
  VIDEO = 'video',
  DOCUMENT = 'document',
}

@Entity('inspections')
@Index(['inspectorId', 'status'])
@Index(['workOrderId'])
@Index(['syncStatus'])
export class Inspection extends AbstractEntity {
  @Column({ nullable: true })
  workOrderId: string;

  @Column({ nullable: true })
  workOrderEquipmentId: string;

  @Column()
  equipmentId: string;

  @ManyToOne(() => Equipment, (e) => e.inspections)
  @JoinColumn({ name: 'equipmentId' })
  equipment: Equipment;

  @Column()
  inspectorId: string;

  @Column()
  formTemplateId: string;

  @Column()
  formTemplateRevision: string; // Denetim anındaki revizyon

  @Column({ type: 'enum', enum: InspectionStatus, default: InspectionStatus.DRAFT })
  status: InspectionStatus;

  @Column({ nullable: true })
  startedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ nullable: true })
  submittedAt: Date;

  @Column({ type: 'enum', enum: InspectionResult, nullable: true })
  overallResult: InspectionResult;

  @Column({ type: 'text', nullable: true })
  inspectorNotes: string;

  @Column({ type: 'text', nullable: true })
  reviewerNotes: string; // Teknik yönetici notu

  @Column({ nullable: true })
  reviewedById: string;

  @Column({ nullable: true })
  reviewedAt: Date;

  // Offline desteği
  @Column({ default: false })
  offlineCreated: boolean;

  @Column({ nullable: true })
  offlineDeviceId: string;

  @Column({ nullable: true })
  deviceTimestamp: Date; // Cihazın zamanı

  @Column({ nullable: true })
  serverTimestamp: Date; // Sunucuya geldiği zaman

  @Column({ type: 'enum', enum: SyncStatus, default: SyncStatus.SYNCED })
  syncStatus: SyncStatus;

  @Column({ nullable: true })
  localUuid: string; // Offline'da üretilen UUID

  // GPS konum
  @Column({ type: 'float', nullable: true })
  latitude: number;

  @Column({ type: 'float', nullable: true })
  longitude: number;

  @VersionColumn()
  version: number;

  @OneToMany(() => InspectionFieldValue, (v) => v.inspection, { cascade: true })
  fieldValues: InspectionFieldValue[];

  @OneToMany(() => InspectionPhoto, (p) => p.inspection, { cascade: true })
  photos: InspectionPhoto[];

  @OneToMany(() => InspectionNonconformity, (n) => n.inspection, { cascade: true })
  nonconformities: InspectionNonconformity[];

  @OneToMany(() => InspectionInstrument, (i) => i.inspection, { cascade: true })
  usedInstruments: InspectionInstrument[];
}

@Entity('inspection_field_values')
@Index(['inspectionId'])
export class InspectionFieldValue extends AbstractEntity {
  @Column()
  inspectionId: string;

  @ManyToOne(() => Inspection, (i) => i.fieldValues)
  @JoinColumn({ name: 'inspectionId' })
  inspection: Inspection;

  @Column({ nullable: true })
  fieldId: string;

  @Column()
  fieldKey: string;

  @Column({ type: 'text', nullable: true })
  valueText: string;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  valueNumber: number;

  @Column({ nullable: true })
  valueBoolean: boolean;

  @Column({ type: 'date', nullable: true })
  valueDate: Date;

  @Column({ type: 'json', nullable: true })
  valueJson: any; // check_matrix sonuçları, multi-select vb.

  @Column({ type: 'int', default: 0 })
  repetitionIndex: number; // 0 = first instance, 1 = second, etc.

  @Column({ nullable: true })
  enteredById: string;

  @Column({ nullable: true })
  enteredAt: Date;
}

@Entity('inspection_photos')
@Index(['inspectionId'])
export class InspectionPhoto extends AbstractEntity {
  @Column()
  inspectionId: string;

  @ManyToOne(() => Inspection, (i) => i.photos)
  @JoinColumn({ name: 'inspectionId' })
  inspection: Inspection;

  @Column({ type: 'enum', enum: MediaType, default: MediaType.PHOTO })
  mediaType: MediaType;

  @Column({ nullable: true })
  fieldId: string;

  @Column({ nullable: true })
  fieldKey: string;

  @Column({ nullable: true })
  fileUrl: string;

  @Column({ nullable: true })
  objectName: string;

  @Column({ nullable: true })
  fileSize: number;

  @Column({ nullable: true })
  mimeType: string;

  @Column({ nullable: true })
  takenAt: Date;

  @Column({ type: 'float', nullable: true })
  latitude: number;

  @Column({ type: 'float', nullable: true })
  longitude: number;

  @Column({ type: 'text', nullable: true })
  caption: string;

  @Column({ type: 'enum', enum: SyncStatus, default: SyncStatus.SYNCED })
  syncStatus: SyncStatus;

  @Column({ nullable: true })
  localPath: string; // Offline cihaz dosya yolu
}

@Entity('inspection_nonconformities')
export class InspectionNonconformity extends AbstractEntity {
  @Column()
  inspectionId: string;

  @ManyToOne(() => Inspection, (i) => i.nonconformities)
  @JoinColumn({ name: 'inspectionId' })
  inspection: Inspection;

  @Column({ nullable: true })
  fieldId: string;

  @Column({ nullable: true })
  checkItemId: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ nullable: true })
  severity: string; // critical, major, minor, observation

  @Column({ type: 'json', nullable: true })
  photoUrls: string[];

  @Column({ type: 'text', nullable: true })
  recommendation: string;

  @Column({ default: false })
  resolved: boolean;
}

@Entity('inspection_instruments')
export class InspectionInstrument extends AbstractEntity {
  @Column()
  inspectionId: string;

  @ManyToOne(() => Inspection, (i) => i.usedInstruments)
  @JoinColumn({ name: 'inspectionId' })
  inspection: Inspection;

  @Column()
  instrumentId: string;

  @Column({ nullable: true })
  usedAt: Date;
}
