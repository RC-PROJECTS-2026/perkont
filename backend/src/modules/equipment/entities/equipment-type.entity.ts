import { Entity, Column, OneToMany } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import { Equipment } from './equipment.entity';

@Entity('equipment_types')
export class EquipmentType extends AbstractEntity {
  @Column({ unique: true })
  code: string; // 'KIE', 'BK', 'YE', 'TK'

  @Column()
  name: string; // 'Kaldırma İletme Ekipmanları'

  @Column({ type: 'json', nullable: true })
  applicableStandards: string[]; // ['TS EN 13157', 'TS 10116']

  @Column({ nullable: true })
  defaultPeriodMonths: number; // Varsayılan kontrol periyodu

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Equipment, (e) => e.equipmentType)
  equipment: Equipment[];
}
