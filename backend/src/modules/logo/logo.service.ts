import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { addMinutes } from 'date-fns';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import {
  LogoSyncQueue, LogoSyncStatus, LogoEntityType, LogoDirection,
} from './entities/logo-sync-queue.entity';
import { LogoApiClient } from './logo-api.client';
import { CustomersService } from '@/modules/customers/customers.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { AuditService } from '@/modules/audit/audit.service';
import { DataSource } from 'typeorm';
import { NotificationType, NotificationChannel } from '@/modules/notifications/entities/notification.entity';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';

const MAX_ATTEMPTS = 5;

@Injectable()
export class LogoService {
  constructor(
    @InjectRepository(LogoSyncQueue)
    private queueRepo: Repository<LogoSyncQueue>,
    private logoClient: LogoApiClient,
    private customersService: CustomersService,
    private notificationsService: NotificationsService,
    private auditService: AuditService,
    private dataSource: DataSource,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
  ) {}

  // ─── Queue'ya ekle ────────────────────────────────────────────────────────
  async enqueue(
    entityType: LogoEntityType,
    entityId: string,
    direction: LogoDirection,
    payload: Record<string, any>,
    userId?: string,
  ): Promise<LogoSyncQueue> {
    const item = this.queueRepo.create({
      entityType,
      entityId,
      direction,
      payload,
      status: LogoSyncStatus.PENDING,
      createdById: userId,
    });
    return this.queueRepo.save(item);
  }

  // ─── Cari kart eşle / oluştur ────────────────────────────────────────────
  async syncCustomer(customerId: string, userId?: string): Promise<LogoSyncQueue> {
    const customer = await this.customersService.findOne(customerId);

    const payload = {
      CODE: customer.code,
      DEFINITION_: customer.name,
      TAXNR: customer.taxNumber || '',
      TELNRS1: customer.contactPhone || '',
      EMAILADDR: customer.contactEmail || '',
      ADDR1: customer.address || '',
      CITY: customer.city || '',
    };

    return this.enqueue(LogoEntityType.CUSTOMER, customerId, LogoDirection.PUSH, payload, userId);
  }

  // ─── Fatura oluştur ───────────────────────────────────────────────────────
  async createInvoice(
    workOrderId: string,
    invoiceData: {
      customerId: string;
      items: Array<{
        serviceCode: string;
        description: string;
        quantity: number;
        unitPrice: number;
        vatRate: number;
      }>;
      invoiceDate: string;
    },
    userId: string,
  ): Promise<LogoSyncQueue> {
    const customer = await this.customersService.findOne(invoiceData.customerId);

    if (!customer.logoCariId) {
      throw new Error(
        `Müşteri (${customer.name}) LOGO cari kartıyla eşlenmemiş. Önce cari eşlemesi yapılmalıdır.`,
      );
    }

    const payload = {
      FICHETYPE: 8, // Satış faturası
      CLIENTREF: customer.logoCariId,
      DATE: invoiceData.invoiceDate,
      TRANSACTIONS: {
        items: invoiceData.items.map((item) => ({
          TYPE: 0,
          MASTER_CODE: item.serviceCode,
          UNIT_CODE: 'ADET',
          QUANTITY: item.quantity,
          PRICE: item.unitPrice,
          VAT_RATE: item.vatRate,
          DESCRIPTION: item.description,
        })),
      },
    };

    return this.enqueue(LogoEntityType.INVOICE, workOrderId, LogoDirection.PUSH, payload, userId);
  }

  // ─── Cron: Her 2 dakikada bir bekleyen işleri işle ───────────────────────
  @Cron('*/2 * * * *')
  async processQueue(): Promise<void> {
    const pendingItems = await this.queueRepo.find({
      where: {
        status: LogoSyncStatus.PENDING,
        nextRetryAt: LessThanOrEqual(new Date()),
      },
      take: 50,
      order: { createdAt: 'ASC' },
    });

    for (const item of pendingItems) {
      await this.processItem(item);
    }
  }

  private async processItem(item: LogoSyncQueue): Promise<void> {
    await this.queueRepo.update(item.id, {
      status: LogoSyncStatus.PROCESSING,
      attemptCount: () => 'attempt_count + 1',
      lastAttemptedAt: new Date(),
    });

    try {
      let logoEntityId: string;
      let logoEntityRef: string;

      switch (item.entityType) {
        case LogoEntityType.CUSTOMER:
          const existingCari = await this.logoClient.getCariKart(item.payload.CODE);
          if (existingCari) {
            await this.logoClient.updateCariKart(item.payload.CODE, item.payload);
            logoEntityId = item.payload.CODE;
          } else {
            const result = await this.logoClient.createCariKart(item.payload as any);
            logoEntityId = result.ref;
          }

          // Müşteri kaydına LOGO ID'sini yaz
          await this.customersService.update(
            item.entityId,
            { logoCariId: logoEntityId },
            'system',
          );
          break;

        case LogoEntityType.INVOICE:
          const invoiceResult = await this.logoClient.createInvoice(item.payload as any);
          logoEntityId = invoiceResult.ref;
          logoEntityRef = invoiceResult.ficheNo;
          break;
      }

      await this.queueRepo.update(item.id, {
        status: LogoSyncStatus.SUCCESS,
        completedAt: new Date(),
        logoEntityId,
        logoEntityRef,
        lastError: null,
      });

      // Invoice sync basarili → WO status'unu INVOICED yap
      if (item.entityType === LogoEntityType.INVOICE && item.entityId) {
        try {
          await this.dataSource.query(
            `UPDATE work_orders SET status = 'invoiced' WHERE id = ? AND status = 'report_approved'`,
            [item.entityId],
          );
          await this.auditService.log({
            action: 'WORK_ORDER_INVOICED',
            entityType: 'WorkOrder',
            entityId: item.entityId,
            newValues: { status: 'invoiced', logoEntityRef },
            description: `İş emri faturalandı — Logo fatura no: ${logoEntityRef}`,
          });
        } catch (e) {
          this.logger.warn(`WO INVOICED güncelleme başarısız: ${(e as any).message}`, 'LogoService');
        }
      }

      await this.auditService.log({
        action: 'LOGO_SYNC_SUCCESS',
        entityType: 'LogoSyncQueue',
        entityId: item.id,
        newValues: { entityType: item.entityType, logoEntityId },
      });

      this.logger.log(`LOGO sync başarılı: ${item.entityType} ${item.entityId}`, 'LogoService');
    } catch (error) {
      const newAttemptCount = (item.attemptCount || 0) + 1;
      const isFinal = newAttemptCount >= MAX_ATTEMPTS;

      // Exponential backoff: 2, 4, 8, 16 dakika
      const nextRetry = isFinal
        ? null
        : addMinutes(new Date(), Math.pow(2, newAttemptCount));

      await this.queueRepo.update(item.id, {
        status: isFinal ? LogoSyncStatus.FAILED : LogoSyncStatus.PENDING,
        lastError: error.message,
        nextRetryAt: nextRetry,
      });

      if (isFinal) {
        this.logger.error(
          `LOGO sync nihai hata (${MAX_ATTEMPTS} deneme): ${item.entityType} ${item.entityId}`,
          { error: error.message },
        );

        // Finans personeline alarm
        await this.notificationsService.queueNotification({
          type: NotificationType.LOGO_SYNC_FAILED,
          channel: NotificationChannel.IN_APP,
          title: 'LOGO Senkronizasyon Hatası',
          body: `${item.entityType} kaydı (ID: ${item.entityId}) ${MAX_ATTEMPTS} denemeden sonra LOGO'ya gönderilemedi. Manuel müdahale gerekiyor.`,
          metadata: { queueId: item.id, entityType: item.entityType, error: error.message },
        });
      }
    }
  }

  // ─── Manuel tetikleme / yönetim ───────────────────────────────────────────
  async retryItem(queueId: string): Promise<void> {
    const item = await this.queueRepo.findOneOrFail({ where: { id: queueId } });
    await this.queueRepo.update(queueId, {
      status: LogoSyncStatus.PENDING,
      attemptCount: 0,
      lastError: null,
      nextRetryAt: null,
    });
    await this.processItem({ ...item, attemptCount: 0 } as LogoSyncQueue);
  }

  async retryAllFailed(): Promise<number> {
    const failedItems = await this.queueRepo.find({
      where: { status: LogoSyncStatus.FAILED },
    });
    for (const item of failedItems) {
      await this.queueRepo.update(item.id, {
        status: LogoSyncStatus.PENDING,
        attemptCount: 0,
        nextRetryAt: null,
      });
    }
    return failedItems.length;
  }

  async getQueue(
    filters: { status?: string; entityType?: string },
    pagination: PaginationDto,
  ): Promise<PaginatedResult<LogoSyncQueue>> {
    const qb = this.queueRepo.createQueryBuilder('q');
    if (filters.status) qb.andWhere('q.status = :status', { status: filters.status });
    if (filters.entityType) qb.andWhere('q.entityType = :et', { et: filters.entityType });
    qb.orderBy('q.createdAt', 'DESC').skip(pagination.skip).take(pagination.limit);
    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async getQueueStats(): Promise<Record<string, number>> {
    const results = await this.queueRepo
      .createQueryBuilder('q')
      .select('q.status, COUNT(*) as count')
      .groupBy('q.status')
      .getRawMany();

    return results.reduce((acc, r) => ({ ...acc, [r.q_status]: parseInt(r.count) }), {});
  }

  // ─── Cari eşleme (manuel) ─────────────────────────────────────────────────
  async mapCustomerToLogoCari(
    customerId: string,
    logoCariId: string,
    userId: string,
  ): Promise<void> {
    await this.customersService.update(
      customerId,
      { logoCariId, logoCariCode: logoCariId },
      userId,
    );
    await this.auditService.log({
      userId,
      action: 'LOGO_CARI_MAPPED',
      entityType: 'Customer',
      entityId: customerId,
      newValues: { logoCariId },
    });
  }
}
