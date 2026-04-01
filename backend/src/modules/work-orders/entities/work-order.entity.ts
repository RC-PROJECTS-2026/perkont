import {
  Entity, Column, ManyToOne, OneToMany, JoinColumn, Index,
} from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import { Customer } from '@/modules/customers/entities/customer.entity';
import { CustomerLocation } from '@/modules/customers/entities/customer-location.entity';

export enum WorkOrderStatus {
  DRAFT = 'draft',
  PLANNED = 'planned',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  POSTPONED = 'postponed',
  COMPLETED = 'completed',
  REPORT_PENDING = 'report_pending',
  REPORT_APPROVED = 'report_approved',
  INVOICED = 'invoiced',
  CANCELLED = 'cancelled',
}

@Entity('work_orders')
@Index(['customerId'])
@Index(['assignedInspectorId'])
@Index(['plannedDate'])
export class WorkOrder extends AbstractEntity {
  @Column({ unique: true })
  workOrderNumber: string; // 'IS-2024-0312'

  @Column()
  customerId: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column({ nullable: true })
  locationId: string;

  @ManyToOne(() => CustomerLocation)
  @JoinColumn({ name: 'locationId' })
  location: CustomerLocation;

  @Column({ nullable: true })
  contractId: string;

  @Column({ type: 'enum', enum: WorkOrderStatus, default: WorkOrderStatus.DRAFT })
  status: WorkOrderStatus;

  @Column({ type: 'date', nullable: true })
  plannedDate: Date;

  @Column({ type: 'time', nullable: true })
  plannedTime: string;

  @Column({ nullable: true })
  assignedInspectorId: string; // Birincil muayene elemanı

  @Column({ type: 'text', nullable: true })
  additionalInspectorIds: string; // Virgülle ayrılmış ek muayene elemanı ID'leri

  @Column({ nullable: true })
  assignedById: string;

  @Column({ nullable: true })
  assignedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ nullable: true })
  priority: string; // normal, urgent, critical

  @Column({ type: 'tinyint', default: false })
  noContractRisk: boolean; // Sözleşmesiz başlatılan iş emri

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ nullable: true })
  createdById: string;

  @OneToMany(() => WorkOrderEquipment, (woe) => woe.workOrder, { cascade: true })
  equipmentItems: WorkOrderEquipment[];
}

@Entity('work_order_equipment')
export class WorkOrderEquipment extends AbstractEntity {
  @Column()
  workOrderId: string;

  @ManyToOne(() => WorkOrder, (wo) => wo.equipmentItems)
  @JoinColumn({ name: 'workOrderId' })
  workOrder: WorkOrder;

  @Column()
  equipmentId: string;

  @Column({ nullable: true })
  formTemplateId: string;

  @Column({ default: 'pending' })
  status: string; // pending, in_progress, completed, skipped

  @Column({ type: 'text', nullable: true })
  notes: string;

  // Fiyatlandırma (faturalama için)
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  unitPrice: number;

  @Column({ nullable: true })
  serviceCode: string; // LOGO hizmet kodu
}
