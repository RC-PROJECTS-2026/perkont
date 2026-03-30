import { Entity, Column, OneToMany, Index } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import { CustomerLocation } from './customer-location.entity';
import { EncryptedColumnTransformer } from '@/common/transformers/encrypted-column.transformer';

@Entity('customers')
export class Customer extends AbstractEntity {
  @Column({ unique: true })
  code: string; // Sistem kodu

  @Column({ nullable: true })
  logoCariId: string; // LOGO'daki cari ID

  @Column({ nullable: true })
  logoCariCode: string;

  @Column()
  name: string;

  @Column({ nullable: true, unique: true, transformer: new EncryptedColumnTransformer() })
  taxNumber: string;

  @Column({ nullable: true })
  taxOffice: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  district: string;

  @Column({ nullable: true })
  sector: string;

  // Birincil iletişim
  @Column({ nullable: true })
  contactName: string;

  @Column({ nullable: true })
  contactEmail: string;

  @Column({ nullable: true })
  contactPhone: string;

  // Fatura iletişim
  @Column({ nullable: true })
  invoiceEmail: string;

  @Column({ nullable: true })
  invoiceContactName: string;

  @Column({ nullable: true })
  invoiceContactPhone: string;

  @Column({ nullable: true })
  companyId: string;

  @Column({ type: 'json', nullable: true })
  additionalContacts: Array<{ name?: string; phone?: string; email?: string; role?: string }>; // Ek iletişim kişileri

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ nullable: true })
  createdById: string;

  @Column({ nullable: true })
  assignedSalesRepId: string; // Sorumlu satış temsilcisi

  @OneToMany(() => CustomerLocation, (loc) => loc.customer)
  locations: CustomerLocation[];
}
