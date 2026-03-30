import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import { Customer } from './customer.entity';

@Entity('customer_locations')
export class CustomerLocation extends AbstractEntity {
  @Index()
  @Column()
  customerId: string;

  @ManyToOne(() => Customer, (c) => c.locations)
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column()
  name: string; // "Gebze Fabrikası", "İstanbul Merkez"

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  district: string;

  @Column({ nullable: true })
  postalCode: string;

  @Column({ type: 'float', nullable: true })
  latitude: number;

  @Column({ type: 'float', nullable: true })
  longitude: number;

  @Column({ nullable: true })
  contactName: string;

  @Column({ nullable: true })
  contactPhone: string;

  @Column({ nullable: true })
  contactEmail: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ default: true })
  isActive: boolean;
}
