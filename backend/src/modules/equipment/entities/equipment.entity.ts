import {
  Entity, Column, ManyToOne, OneToMany, JoinColumn, Index, BeforeInsert,
} from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import { Customer } from '@/modules/customers/entities/customer.entity';
import { CustomerLocation } from '@/modules/customers/entities/customer-location.entity';
import { EquipmentType } from './equipment-type.entity';
import { Inspection } from '@/modules/inspections/entities/inspection.entity';
import { Report } from '@/modules/reports/entities/report.entity';
import { v4 as uuidv4 } from 'uuid';

export enum EquipmentStatus {
  ACTIVE = 'active',
  PASSIVE = 'passive',
  SCRAPPED = 'scrapped',
  UNDER_REPAIR = 'under_repair',
}

@Entity('equipment')
@Index(['customerId'])
@Index(['locationId'])
@Index(['nextControlDate'])
export class Equipment extends AbstractEntity {
  @Column()
  customerId: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column() // Zorunlu — her ekipman bir lokasyona bağlı olmalı
  locationId: string;

  @ManyToOne(() => CustomerLocation)
  @JoinColumn({ name: 'locationId' })
  location: CustomerLocation;

  @Column()
  equipmentTypeId: string;

  @ManyToOne(() => EquipmentType)
  @JoinColumn({ name: 'equipmentTypeId' })
  equipmentType: EquipmentType;

  @Column({ unique: true })
  inventoryCode: string; // Sistemin kendi kodu: EKP-2024-0001

  @Column({ nullable: true, unique: true })
  qrCode: string; // QR etiket değeri

  @Column({ nullable: true })
  serialNumber: string;

  @Column({ nullable: true })
  brand: string;

  @Column({ nullable: true })
  model: string;

  @Column({ nullable: true })
  manufactureYear: number;

  @Column({ nullable: true })
  capacity: string; // '5 ton', '10 bar' gibi serbest metin

  @Column({ nullable: true })
  capacityUnit: string;

  @Column({ type: 'date', nullable: true })
  productionDate: Date;

  @Column({ type: 'date', nullable: true })
  firstUseDate: Date;

  @Column({ nullable: true })
  controlPeriodMonths: number;

  @Column({ type: 'date', nullable: true })
  nextControlDate: Date;

  @Column({ type: 'date', nullable: true })
  lastControlDate: Date;

  @Column({ type: 'enum', enum: EquipmentStatus, default: EquipmentStatus.ACTIVE })
  status: EquipmentStatus;

  @Column({ nullable: true })
  installationLocation: string; // "3. Kat Makine Dairesi" gibi

  @Column({ nullable: true })
  photoUrl: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ nullable: true })
  createdById: string;

  @OneToMany(() => Inspection, (i) => i.equipment)
  inspections: Inspection[];

  @OneToMany(() => Report, (r) => r.equipment)
  reports: Report[];

  // Sahada QR okuma ile arama için
  @BeforeInsert()
  generateQrCode() {
    if (!this.qrCode) {
      this.qrCode = `PKT-${uuidv4().split('-')[0].toUpperCase()}`;
    }
  }
}
