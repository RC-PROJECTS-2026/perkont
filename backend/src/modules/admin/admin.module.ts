// Bölüm 11 — ADMIN endpoint grubu
// GET  /admin/audit-logs
// GET  /admin/dashboard/stats
// GET  /admin/users
// POST /admin/users
// GET  /admin/devices

import {
  Controller, Get, Post, Body, Query, UseGuards, Module,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';

import { Roles }       from '@/common/decorators/roles.decorator';
import { RolesGuard }  from '@/common/guards/roles.guard';
import { UserRole }    from '@/common/enums/user-role.enum';
import { AuditLog }    from '@/modules/audit/entities/audit-log.entity';
import { User }        from '@/modules/users/entities/user.entity';
import { UsersModule } from '@/modules/users/users.module';
import { AuditModule } from '@/modules/audit/audit.module';

// ─── Admin Service ────────────────────────────────────────────────────────────
@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
    @InjectRepository(User)     private userRepo:  Repository<User>,
  ) {}

  // GET /admin/audit-logs
  async getAuditLogs(filters: {
    userId?: string;
    entityType?: string;
    action?: string;
    from?: string;
    to?: string;
    limit?: number;
    page?: number;
  }) {
    const limit = filters.limit || 50;
    const page  = filters.page  || 1;

    const qb = this.auditRepo
      .createQueryBuilder('al')
      .orderBy('al.timestamp', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.userId)     qb.andWhere('al.userId = :uid',       { uid: filters.userId });
    if (filters.entityType) qb.andWhere('al.entityType = :et',    { et: filters.entityType });
    if (filters.action)     qb.andWhere('al.action LIKE :act',   { act: `%${filters.action}%` });
    if (filters.from)       qb.andWhere('al.timestamp >= :from',  { from: filters.from });
    if (filters.to)         qb.andWhere('al.timestamp <= :to',    { to: filters.to });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // GET /admin/dashboard/stats
  async getDashboardStats() {
    const [totalUsers, activeUsers] = await Promise.all([
      this.userRepo.count(),
      this.userRepo.count({ where: { isActive: true } }),
    ]);

    const recentActions = await this.auditRepo
      .createQueryBuilder('al')
      .select('al.action, COUNT(*) as count')
      .groupBy('al.action')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    const todayLogs = await this.auditRepo
      .createQueryBuilder('al')
      .where('al.timestamp >= :today', { today: new Date(new Date().setHours(0, 0, 0, 0)) })
      .getCount();

    return {
      totalUsers,
      activeUsers,
      todayAuditLogs: todayLogs,
      topActions: recentActions,
    };
  }

  // GET /admin/users
  async listUsers(filters: { role?: string; isActive?: boolean; limit?: number; page?: number }) {
    const limit = filters.limit || 50;
    const page  = filters.page  || 1;

    const qb = this.userRepo
      .createQueryBuilder('u')
      .select([
        'u.id', 'u.email', 'u.fullName', 'u.role',
        'u.isActive', 'u.mfaEnabled', 'u.lastLoginAt', 'u.createdAt',
      ])
      .orderBy('u.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.role !== undefined)     qb.andWhere('u.role = :role',       { role: filters.role });
    if (filters.isActive !== undefined) qb.andWhere('u.isActive = :active', { active: filters.isActive });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  // POST /admin/users  (admin tarafından kullanıcı oluşturma)
  async createUser(dto: {
    email: string;
    fullName: string;
    role: UserRole;
    phone?: string;
    ekipnetNumber?: string;
  }): Promise<User> {
    // Geçici şifre üret
    const tempPassword = Math.random().toString(36).slice(-10);
    const user = this.userRepo.create({
      ...dto,
      isActive: true,
    });
    await (user as any).setPassword(tempPassword);
    const saved = await this.userRepo.save(user);

    // TODO: Hoşgeldiniz + geçici şifre e-postası gönder (NotificationsService)

    return saved;
  }

  // GET /admin/devices
  async listDevices(filters: { status?: string; limit?: number; page?: number }) {
    // device-management modülünden veri çekme —
    // Burada doğrudan SQL kullanıyoruz (circular dep. önlemek için)
    const limit = filters.limit || 50;
    const page  = filters.page  || 1;

    // Raw query ile mobile_devices tablosunu sorgula
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let whereClause = '';
    if (filters.status) {
      whereClause = 'WHERE d.status = ?';
      params.push(filters.status);
    }

    const query = `
      SELECT d.*, u.full_name as user_name, u.email as user_email
      FROM mobile_devices d
      LEFT JOIN users u ON u.id = d.user_id
      ${whereClause}
      ORDER BY d.last_seen_at DESC
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    try {
      const data = await this.auditRepo.query(query, params);
      const countParams: any[] = [];
      let countWhere = '';
      if (filters.status) {
        countWhere = ' WHERE status = ?';
        countParams.push(filters.status);
      }
      const total = await this.auditRepo.query(
        `SELECT COUNT(*) as count FROM mobile_devices${countWhere}`,
        countParams,
      );
      return { data, total: parseInt(total[0]?.count || '0'), page, limit };
    } catch {
      return { data: [], total: 0, page, limit };
    }
  }
}

// ─── Admin Controller ─────────────────────────────────────────────────────────
@ApiTags('admin')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
@Controller('admin')
export class AdminController {
  constructor(private service: AdminService) {}

  // GET /admin/audit-logs
  @Get('audit-logs')
  @ApiOperation({ summary: 'Tüm audit log kayıtları (filtreli, sayfalı)' })
  getAuditLogs(
    @Query('userId')     userId?: string,
    @Query('entityType') entityType?: string,
    @Query('action')     action?: string,
    @Query('from')       from?: string,
    @Query('to')         to?: string,
    @Query('limit')      limit?: number,
    @Query('page')       page?: number,
  ) {
    return this.service.getAuditLogs({ userId, entityType, action, from, to, limit, page });
  }

  // GET /admin/dashboard/stats
  @Get('dashboard/stats')
  @ApiOperation({ summary: 'Admin dashboard istatistikleri' })
  getDashboardStats() {
    return this.service.getDashboardStats();
  }

  // GET /admin/users
  @Get('users')
  @ApiOperation({ summary: 'Kullanıcı listesi (admin görünümü)' })
  listUsers(
    @Query('role')     role?: string,
    @Query('isActive') isActive?: string,
    @Query('limit')    limit?: number,
    @Query('page')     page?: number,
  ) {
    return this.service.listUsers({
      role,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      limit,
      page,
    });
  }

  // POST /admin/users
  @Post('users')
  @ApiOperation({ summary: 'Admin tarafından kullanıcı oluştur' })
  createUser(
    @Body() dto: {
      email: string;
      fullName: string;
      role: UserRole;
      phone?: string;
      ekipnetNumber?: string;
    },
  ) {
    return this.service.createUser(dto);
  }

  // GET /admin/devices
  @Get('devices')
  @ApiOperation({ summary: 'Kayıtlı mobil cihazlar' })
  listDevices(
    @Query('status') status?: string,
    @Query('limit')  limit?: number,
    @Query('page')   page?: number,
  ) {
    return this.service.listDevices({ status, limit, page });
  }
}

// ─── Admin Module ─────────────────────────────────────────────────────────────
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog, User]),
    AuditModule,
    UsersModule,
  ],
  providers:   [AdminService],
  controllers: [AdminController],
  exports:     [AdminService],
})
export class AdminModule {}
