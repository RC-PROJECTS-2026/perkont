// Bölüm 3 — user_permissions tablosu
// Rol tabanlı yetkilendirmeye ek olarak kullanıcı bazında granüler izinler.
// Bir kullanıcıya belirli bir modülde belirli bir eylem için özel izin verilebilir.

import {
  Entity, Column, ManyToOne, JoinColumn, Index,
  CreateDateColumn, PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';

export enum PermissionAction {
  READ    = 'read',
  CREATE  = 'create',
  UPDATE  = 'update',
  DELETE  = 'delete',
  APPROVE = 'approve',
  SIGN    = 'sign',
  EXPORT  = 'export',
}

@Entity('user_permissions')
@Index(['userId', 'module', 'action'], { unique: true })
export class UserPermission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  module: string; // 'reports', 'inspections', 'customers' vb.

  @Column({ type: 'enum', enum: PermissionAction })
  action: PermissionAction;

  @Column({ default: true })
  granted: boolean; // false = explicit deny

  @Column({ nullable: true })
  grantedBy: string; // userId

  @Column({ nullable: true })
  expiresAt: Date; // Geçici izin desteği

  @Column({ nullable: true })
  reason: string; // Neden verildiğine dair not

  @CreateDateColumn({ type: 'datetime' })
  grantedAt: Date;
}
