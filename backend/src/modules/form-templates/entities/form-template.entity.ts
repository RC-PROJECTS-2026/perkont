import {
  Entity, Column, ManyToOne, OneToMany,
  JoinColumn, Index,
} from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import { EquipmentType } from '@/modules/equipment/entities/equipment-type.entity';

export enum FormStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  SUPERSEDED = 'superseded',
  CANCELLED = 'cancelled',
}

export enum FieldType {
  TEXT = 'text',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  SELECT = 'select',
  MULTI_SELECT = 'multi_select',
  DATE = 'date',
  PHOTO = 'photo',
  FILE = 'file',
  SIGNATURE = 'signature',
  CALCULATED = 'calculated',
  CHECK_ITEM = 'check_item',       // Uygun/Uygunsuz/Uygulanamaz
  CHECK_MATRIX = 'check_matrix',   // Kontrol maddeleri tablosu
  SECTION_HEADER = 'section_header',
  TEXTAREA = 'textarea',
}

@Entity('form_templates')
export class FormTemplate extends AbstractEntity {
  @Column()
  equipmentTypeId: string;

  @ManyToOne(() => EquipmentType)
  @JoinColumn({ name: 'equipmentTypeId' })
  equipmentType: EquipmentType;

  @Column({ unique: true })
  code: string; // 'FORM-KIE-001'

  @Column()
  name: string;

  @Column()
  revision: string; // 'Rev.03'

  @Column({ type: 'date', nullable: true })
  revisionDate: Date;

  @Column({ type: 'enum', enum: FormStatus, default: FormStatus.DRAFT })
  status: FormStatus;

  @Column({ nullable: true })
  supersededById: string; // Yerini alan form ID

  @Column({ type: 'json' })
  layoutConfig: Record<string, any>; // Sayfa yapısı, bölümler, meta

  @Column({ nullable: true })
  outputTemplateUrl: string; // PDF şablon dosyası (MinIO path)

  @Column({ nullable: true })
  outputTemplateObjectName: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  createdById: string;

  @Column({ nullable: true })
  approvedById: string;

  @Column({ nullable: true })
  approvedAt: Date;

  @OneToMany(() => FormField, (f) => f.template, {
    cascade: true,
  })
  fields: FormField[];
}

@Entity('form_fields')
@Index(['templateId', 'orderIndex'])
export class FormField extends AbstractEntity {
  @Column()
  templateId: string;

  @ManyToOne(() => FormTemplate, (t) => t.fields)
  @JoinColumn({ name: 'templateId' })
  template: FormTemplate;

  @Column()
  fieldKey: string; // 'yukHooksEgitimiYapildiMi', 'kapasite_bar'

  @Column({ type: 'text' })
  label: string;

  @Column({ type: 'enum', enum: FieldType })
  fieldType: FieldType;

  @Column({ nullable: true })
  section: string; // Hangi bölüme ait

  @Column({ default: 0 })
  orderIndex: number;

  @Column({ default: false })
  isRequired: boolean;

  @Column({ type: 'json', nullable: true })
  validationRules: Record<string, any>; // {min, max, regex, message}

  @Column({ type: 'json', nullable: true })
  options: Array<{ value: string; label: string }>; // Select seçenekleri

  @Column({ nullable: true })
  unit: string; // mm, kg, bar, °C

  @Column({ nullable: true })
  dbMapping: string; // 'equipment.capacity' — otomatik doldurma için

  @Column({ type: 'json', nullable: true })
  pdfCoordinate: {
    page: number;
    x: number;
    y: number;
    width?: number;
    height?: number;
    fontSize?: number;
    fontName?: string;
    align?: string;
  };

  @Column({ type: 'tinyint', default: false })
  isRepeatable: boolean;

  @Column({ type: 'int', nullable: true })
  maxRepetitions: number; // null = unlimited

  @Column({ default: false })
  isConditional: boolean;

  @Column({ type: 'json', nullable: true })
  conditionRule: Record<string, any>; // {field: 'xxx', operator: 'eq', value: 'yyy'}

  @Column({ nullable: true })
  defaultValue: string;

  @Column({ nullable: true })
  placeholder: string;

  @Column({ type: 'json', nullable: true })
  checkItems: Array<{
    id: string;
    label: string;
    isRequired?: boolean;
    conditionRule?: Record<string, any>;
  }>; // check_matrix tipi için kontrol maddeleri
}
