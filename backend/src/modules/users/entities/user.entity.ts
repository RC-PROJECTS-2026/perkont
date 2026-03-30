import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  BeforeInsert,
  BeforeUpdate,
  Index,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import * as bcrypt from 'bcrypt';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import { UserRole } from '@/common/enums/user-role.enum';

@Entity('users')
export class User extends AbstractEntity {
  @Column({ nullable: true })
  companyId: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column()
  fullName: string;

  @Column({ type: 'text' })
  roles: string; // Virgülle ayrılmış roller: "inspector,technical_manager"

  // Geriye uyumluluk — birincil rol (ilk rol)
  get role(): string {
    if (!this.roles) return 'inspector';
    const str = typeof this.roles === 'string' ? this.roles : String(this.roles);
    const list = str.split(',').filter(r => r.trim());
    return list[0] || 'inspector';
  }

  // Belirli bir role sahip mi?
  hasRole(checkRole: string): boolean {
    return this.roleList.includes(checkRole);
  }

  // Tüm rolleri dizi olarak döndür
  get roleList(): string[] {
    if (!this.roles) return ['inspector'];
    const str = typeof this.roles === 'string' ? this.roles : String(this.roles);
    return str.split(',').map(r => r.trim()).filter(r => r);
  }

  // Personel detay bilgileri
  @Column({ nullable: true })
  tcNo: string;

  @Column({ nullable: true })
  personalPhone: string;

  @Column({ nullable: true })
  birthDate: string;

  @Column({ nullable: true })
  hireDate: string;

  @Column({ nullable: true })
  graduationField: string; // Mezun alanı

  @Column({ nullable: true })
  graduationDate: string;

  @Column({ nullable: true })
  diplomaNo: string;

  @Column({ nullable: true })
  specialization: string; // Alan: MEKANİK, ELEKTRİK, OFİS

  @Column({ nullable: true })
  ekipnetDate: string; // EKİPNET alınma tarihi

  @Column({ nullable: true })
  title1: string; // Ünvan-1

  @Column({ nullable: true })
  title2: string; // Ünvan-2

  @Column({ nullable: true })
  title3: string; // Ünvan-3

  @Column({ nullable: true })
  title4: string; // Ünvan-4

  @Column()
  @Exclude()
  passwordHash: string;

  @Column({ nullable: true })
  ekipnetNumber: string; // Muayene elemanı için

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  mfaEnabled: boolean;

  @Column({ nullable: true })
  @Exclude()
  mfaSecret: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ nullable: true })
  lastLoginAt: Date;

  @Column({ nullable: true })
  lastLoginIp: string;

  @Column({ nullable: true })
  @Exclude()
  refreshTokenHash: string;

  @Column({ nullable: true })
  refreshTokenExpiresAt: Date;

  @Column({ nullable: true })
  @Exclude()
  passwordResetToken: string;

  @Column({ nullable: true })
  passwordResetExpires: Date;

  @Column({ type: 'int', default: 0 })
  failedLoginAttempts: number;

  @Column({ nullable: true })
  lockedUntil: Date;

  // Computed
  get isLocked(): boolean {
    return this.lockedUntil && this.lockedUntil > new Date();
  }

  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword() {
    if (this.passwordHash && !this.passwordHash.startsWith('$2b$')) {
      this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
    }
  }

  async validatePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.passwordHash);
  }

  async setPassword(password: string): Promise<void> {
    this.passwordHash = await bcrypt.hash(password, 12);
  }

  async setRefreshToken(token: string): Promise<void> {
    this.refreshTokenHash = await bcrypt.hash(token, 10);
  }

  async validateRefreshToken(token: string): Promise<boolean> {
    if (!this.refreshTokenHash) return false;
    return bcrypt.compare(token, this.refreshTokenHash);
  }
}
