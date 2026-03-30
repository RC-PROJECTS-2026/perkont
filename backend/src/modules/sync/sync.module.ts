import {
  Controller, Get, Post, Body, UseGuards, Module,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { Inspection, SyncStatus } from '@/modules/inspections/entities/inspection.entity';
import { InspectionPhoto } from '@/modules/inspections/entities/inspection.entity';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { UserRole } from '@/common/enums/user-role.enum';
import { WorkOrdersModule } from '@/modules/work-orders/work-orders.module';
import { FormTemplatesModule } from '@/modules/form-templates/form-templates.module';
import { EquipmentModule } from '@/modules/equipment/equipment.module';
import { CalibrationModule } from '@/modules/calibration/calibration.module';

@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(Inspection) private inspectionRepo: Repository<Inspection>,
    @InjectRepository(InspectionPhoto) private photoRepo: Repository<InspectionPhoto>,
  ) {}

  // Mobil cihazın pull etmesi gereken tüm veriyi tek pakette döndür
  async getSyncBundle(inspectorId: string) {
    const [
      pendingInspections,
      pendingPhotos,
    ] = await Promise.all([
      this.inspectionRepo.find({
        where: { inspectorId, syncStatus: SyncStatus.PENDING },
        relations: ['fieldValues', 'photos', 'nonconformities'],
      }),
      this.photoRepo.find({
        where: { syncStatus: SyncStatus.PENDING },
      }),
    ]);

    return {
      pendingInspections: pendingInspections.length,
      pendingPhotos: pendingPhotos.length,
      serverTime: new Date().toISOString(),
    };
  }

  async getSyncStatus(inspectorId: string) {
    const total = await this.inspectionRepo.count({ where: { inspectorId } });
    const synced = await this.inspectionRepo.count({
      where: { inspectorId, syncStatus: SyncStatus.SYNCED },
    });
    const pending = await this.inspectionRepo.count({
      where: { inspectorId, syncStatus: SyncStatus.PENDING },
    });
    const conflicts = await this.inspectionRepo.count({
      where: { inspectorId, syncStatus: SyncStatus.CONFLICT },
    });
    const pendingPhotos = await this.photoRepo.count({
      where: { syncStatus: SyncStatus.PENDING },
    });

    return { total, synced, pending, conflicts, pendingPhotos };
  }
}

@ApiTags('sync')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('sync')
export class SyncController {
  constructor(private service: SyncService) {}

  @Post('push')
  @Roles(UserRole.INSPECTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Push — offline verileri sunucuya gönder' })
  push(@Body() payload: any, @CurrentUser('id') userId: string) {
    return this.service.getSyncBundle(userId); // inspections sync'i InspectionsService üzerinden yapılır
  }

  @Get('pull')
  @Roles(UserRole.INSPECTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Pull — cihaza çekilecek veri paketi' })
  pull(@CurrentUser('id') userId: string) {
    return this.service.getSyncBundle(userId);
  }

  @Get('status')
  @Roles(UserRole.INSPECTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Senkronizasyon durumu — mobil uygulamanın kendi istatistikleri' })
  getSyncStatus(@CurrentUser('id') userId: string) {
    return this.service.getSyncStatus(userId);
  }

  @Get('bundle')
  @Roles(UserRole.INSPECTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Pull bundle — bekleyen veri özeti' })
  getSyncBundle(@CurrentUser('id') userId: string) {
    return this.service.getSyncBundle(userId);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Inspection, InspectionPhoto]),
    WorkOrdersModule,
    FormTemplatesModule,
    EquipmentModule,
    CalibrationModule,
  ],
  providers: [SyncService],
  controllers: [SyncController],
  exports: [SyncService],
})
export class SyncModule {}
