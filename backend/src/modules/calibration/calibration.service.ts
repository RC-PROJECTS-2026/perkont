import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { addDays } from 'date-fns';
import { MeasuringInstrument, InstrumentStatus } from './entities/measuring-instrument.entity';
import { AuditService } from '@/modules/audit/audit.service';
import { StorageService, StorageBucket } from '@/modules/storage/storage.service';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';

@Injectable()
export class CalibrationService {
  constructor(
    @InjectRepository(MeasuringInstrument)
    private instrumentRepo: Repository<MeasuringInstrument>,
    private auditService: AuditService,
    private storageService: StorageService,
  ) {}

  async create(data: Partial<MeasuringInstrument>, userId: string): Promise<MeasuringInstrument> {
    const inst = this.instrumentRepo.create({ ...data, createdById: userId });
    const saved = await this.instrumentRepo.save(inst);
    await this.auditService.log({
      userId, action: 'INSTRUMENT_CREATED',
      entityType: 'MeasuringInstrument', entityId: saved.id,
    });
    return saved;
  }

  async findAll(
    filters: { status?: string; search?: string },
    pagination: PaginationDto,
  ): Promise<PaginatedResult<MeasuringInstrument>> {
    const qb = this.instrumentRepo.createQueryBuilder('i');
    if (filters.search) {
      qb.andWhere('(i.name LIKE :s OR i.inventoryCode LIKE :s OR i.serialNumber LIKE :s)', { s: `%${filters.search}%` });
    }
    if (filters.status) qb.andWhere('i.status = :status', { status: filters.status });
    qb.orderBy('i.nextCalibrationDate', 'ASC').skip(pagination.skip).take(pagination.limit);
    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<MeasuringInstrument> {
    const inst = await this.instrumentRepo.findOne({ where: { id } });
    if (!inst) throw new NotFoundException('Ölçüm aleti bulunamadı');
    return inst;
  }

  async update(id: string, data: Partial<MeasuringInstrument>, userId: string): Promise<MeasuringInstrument> {
    await this.instrumentRepo.update(id, data);
    await this.auditService.log({ userId, action: 'INSTRUMENT_UPDATED', entityType: 'MeasuringInstrument', entityId: id, newValues: data as any });
    return this.findOne(id);
  }

  async uploadCertificate(id: string, file: Buffer, originalName: string, userId: string): Promise<MeasuringInstrument> {
    const { url } = await this.storageService.uploadFile(
      StorageBucket.DOCUMENTS, file, originalName, 'application/pdf', `calibration/${id}`,
    );
    await this.instrumentRepo.update(id, { certificateUrl: url });
    await this.auditService.log({ userId, action: 'CALIBRATION_CERT_UPLOADED', entityType: 'MeasuringInstrument', entityId: id });
    return this.findOne(id);
  }

  async getExpiring(days = 60): Promise<MeasuringInstrument[]> {
    return this.instrumentRepo.find({
      where: {
        nextCalibrationDate: LessThanOrEqual(addDays(new Date(), days)) as any,
        status: InstrumentStatus.ACTIVE,
      },
      order: { nextCalibrationDate: 'ASC' },
    });
  }

  async updateStatuses(): Promise<void> {
    const now  = new Date();
    const soon = addDays(now, 30);
    await this.instrumentRepo.createQueryBuilder().update()
      .set({ status: InstrumentStatus.EXPIRED })
      .where('next_calibration_date < :now AND status != :r', { now, r: InstrumentStatus.RETIRED })
      .execute();
    await this.instrumentRepo.createQueryBuilder().update()
      .set({ status: InstrumentStatus.EXPIRING })
      .where('next_calibration_date BETWEEN :now AND :soon AND status = :a', { now, soon, a: InstrumentStatus.ACTIVE })
      .execute();
  }
}
