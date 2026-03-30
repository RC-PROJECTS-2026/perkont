// Bölüm 3 — companies tablosu
// Sistem çoklu firma (multi-tenant ready) yapısında çalışır.
// Her şirketin kendi müşterileri, kullanıcıları ve akreditasyon kapsamı vardır.

import {
  Entity, Column, OneToMany, Index,
  CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Index({ unique: true })
  @Column({ nullable: true })
  taxNumber: string; // Vergi numarası

  @Column({ nullable: true })
  accreditationNumber: string; // Akreditasyon sertifika numarası

  @Column({ type: 'json', nullable: true })
  accreditationScope: {
    equipmentTypes: string[];   // Akredite ekipman tipleri
    standards: string[];        // Uygulanan standartlar
    scopeDescription?: string;
  };

  @Column({ nullable: true })
  logoUrl: string; // Firma logosu (MinIO)

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  website: string;

  @Column({ type: 'json', nullable: true })
  settings: {
    reportPrefix?: string;       // Rapor numarası öneki (örn: "R-2024-")
    defaultCurrency?: string;    // Varsayılan para birimi
    smsEnabled?: boolean;
    emailEnabled?: boolean;
    logoErpEnabled?: boolean;
    mfaRequired?: boolean;
    contractRequired?: boolean;  // true: sözleşmesiz iş emri açılamaz | false: uyarıyla açılabilir
  };

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
