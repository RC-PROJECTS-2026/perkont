import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import { User } from './user.entity';

@Entity('inspector_qualifications')
@Index(['userId'])
@Index(['expiryDate'])
export class InspectorQualification extends AbstractEntity {
  @Column()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  equipmentTypeId: string;

  @Column()
  certificateName: string;

  @Column({ nullable: true })
  certificateNo: string;

  @Column({ nullable: true })
  issuer: string;

  @Column({ type: 'date', nullable: true })
  issueDate: Date;

  @Column({ type: 'date' })
  expiryDate: Date;

  @Column({ nullable: true })
  documentUrl: string;

  @Column({ default: 'active' })
  status: string; // active | expiring_soon | expired
}
