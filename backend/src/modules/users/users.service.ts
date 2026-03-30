import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { addDays } from 'date-fns';
import { User } from './entities/user.entity';
import { CreateUserDto, UpdateUserDto } from '@/modules/auth/dto/auth.dto';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';
import { AuditService } from '@/modules/audit/audit.service';

// ─── Inspector Qualification Entity (inline için) ────────────────────────────
import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';

@Entity('inspector_qualifications')
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
  status: string; // active, expiring_soon, expired
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(InspectorQualification)
    private qualRepo: Repository<InspectorQualification>,
    private auditService: AuditService,
  ) {}

  async create(dto: CreateUserDto, createdById: string): Promise<User> {
    const exists = await this.userRepo.findOne({ where: { email: dto.email.toLowerCase() } });
    if (exists) throw new ConflictException('Bu e-posta adresi zaten kayıtlı');

    const user = this.userRepo.create({
      ...dto,
      email: dto.email.toLowerCase(),
      passwordHash: dto.password, // Entity'de @BeforeInsert hash'ler
    });
    const saved = await this.userRepo.save(user);

    await this.auditService.log({
      userId: createdById,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: saved.id,
      newValues: { email: saved.email, role: saved.role },
    });

    return saved;
  }

  async findAll(pagination: PaginationDto): Promise<PaginatedResult<User>> {
    const [data, total] = await this.userRepo.findAndCount({
      skip: pagination.skip,
      take: pagination.limit,
      order: { fullName: 'ASC' },
    });
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı');
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email: email.toLowerCase() } });
  }

  async update(id: string, dto: UpdateUserDto, updatedById: string): Promise<User> {
    const user = await this.findOne(id);
    Object.assign(user, dto);
    const saved = await this.userRepo.save(user);
    await this.auditService.log({
      userId: updatedById,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: id,
    });
    return saved;
  }

  // ─── Yetkinlik / Sertifika ────────────────────────────────────────────────
  async addQualification(
    userId: string,
    data: Partial<InspectorQualification>,
  ): Promise<InspectorQualification> {
    const qual = this.qualRepo.create({ ...data, userId });
    return this.qualRepo.save(qual);
  }

  async getUserQualifications(userId: string): Promise<InspectorQualification[]> {
    return this.qualRepo.find({ where: { userId }, order: { expiryDate: 'ASC' } });
  }

  async findInspectorsWithExpiringCerts(
    daysAhead = 60,
  ): Promise<Array<{ user: User; cert: InspectorQualification }>> {
    const futureDate = addDays(new Date(), daysAhead);
    const expiringCerts = await this.qualRepo.find({
      where: { expiryDate: LessThanOrEqual(futureDate) as any, status: 'active' },
      relations: ['user'],
    });

    return expiringCerts.map((cert) => ({ user: cert.user, cert }));
  }

  async updateCertStatuses(): Promise<void> {
    const now = new Date();
    const soon = addDays(now, 30);

    await this.qualRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'expired' })
      .where('expiryDate < :now', { now })
      .execute();

    await this.qualRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'expiring_soon' })
      .where('expiryDate BETWEEN :now AND :soon', { now, soon })
      .execute();
  }

  // ─── Controller uyumluluğu için alias metodlar ──────────────────────────
  async findInspectors(): Promise<User[]> {
    return this.userRepo.find({
      where: { isActive: true },
    }).then(users => users.filter(u => {
      const roles = u.roles ? String(u.roles).split(',') : [];
      return roles.includes('inspector');
    }));
  }

  async getExpiringQualifications(days = 60): Promise<any[]> {
    return this.findInspectorsWithExpiringCerts(days).then(results =>
      results.map(r => ({ ...r.cert, user: r.user })),
    );
  }

  async deactivate(id: string, userId: string): Promise<void> {
    await this.userRepo.update(id, { isActive: false });
    await this.auditService.log({
      userId,
      action: 'USER_DEACTIVATED',
      entityType: 'User',
      entityId: id,
    });
  }
}

