import { Entity, Column, Index } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';

export enum InstrumentStatus {
  ACTIVE   = 'active',
  EXPIRING = 'expiring_soon',
  EXPIRED  = 'expired',
  RETIRED  = 'retired',
}

@Entity('measuring_instruments')
export class MeasuringInstrument extends AbstractEntity {
  @Column()
  name: string;

  @Column({ unique: true })
  inventoryCode: string;

  @Column({ nullable: true })
  serialNumber: string;

  @Column({ nullable: true })
  brand: string;

  @Column({ nullable: true })
  model: string;

  @Column({ nullable: true })
  calibrationLab: string;

  @Column({ type: 'date', nullable: true })
  lastCalibrationDate: Date;

  @Column({ type: 'date', nullable: true })
  @Index()
  nextCalibrationDate: Date;

  @Column({ nullable: true })
  certificateUrl: string;

  @Column({ nullable: true })
  certificateNumber: string;

  @Column({ type: 'enum', enum: InstrumentStatus, default: InstrumentStatus.ACTIVE })
  status: InstrumentStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ nullable: true })
  createdById: string;
}
