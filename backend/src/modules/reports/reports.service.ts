import {
  Injectable, NotFoundException, BadRequestException,
  ForbiddenException, Inject,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report, ReportStatus } from './entities/report.entity';
import { PdfEngineService } from './pdf-engine.service';
import { ESignatureService } from './esignature.service';
import { StorageService, StorageBucket } from '@/modules/storage/storage.service';
import { AuditService } from '@/modules/audit/audit.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { InspectionsService } from '@/modules/inspections/inspections.service';
import { FormTemplatesService } from '@/modules/form-templates/form-templates.service';
import { EquipmentService } from '@/modules/equipment/equipment.service';
import { CustomersService } from '@/modules/customers/customers.service';
import { WorkOrdersService } from '@/modules/work-orders/work-orders.service';
import { WorkOrderStatus } from '@/modules/work-orders/entities/work-order.entity';
import { InspectionStatus } from '@/modules/inspections/entities/inspection.entity';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report)
    private reportRepo: Repository<Report>,
    private pdfEngineService: PdfEngineService,
    private eSignatureService: ESignatureService,
    private storageService: StorageService,
    private auditService: AuditService,
    private notificationsService: NotificationsService,
    private inspectionsService: InspectionsService,
    private formTemplatesService: FormTemplatesService,
    private equipmentService: EquipmentService,
    private customersService: CustomersService,
    private workOrdersService: WorkOrdersService,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
  ) {}

  // ─── Rapor Numarası ───────────────────────────────────────────────────────
  private async generateReportNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.reportRepo.count();
    return `R-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  // ─── Denetimden Rapor Oluştur ─────────────────────────────────────────────
  async createFromInspection(inspectionId: string, userId: string): Promise<Report> {
    const inspection = await this.inspectionsService.findOne(inspectionId);

    if (inspection.status !== InspectionStatus.APPROVED) {
      throw new BadRequestException('Rapor sadece onaylanmış denetimlerden oluşturulabilir');
    }

    // Daha önce rapor oluşturulmuş mu?
    const existingReport = await this.reportRepo.findOne({ where: { inspectionId } });
    if (existingReport) {
      throw new BadRequestException('Bu denetim için zaten rapor oluşturulmuş');
    }

    const equipment = await this.equipmentService.findOne(inspection.equipmentId);
    const formTemplate = await this.formTemplatesService.findOne(inspection.formTemplateId);
    const customer = await this.customersService.findOne(equipment.customerId);

    const reportNumber = await this.generateReportNumber();

    // Ek veri: ekipman ve müşteri bilgileri otomatik doldurma için
    const additionalData = this.buildAdditionalData(equipment, customer);

    // PDF üret
    this.logger.log(`PDF üretiliyor: ${reportNumber}`, 'ReportsService');
    const { buffer, hash } = await this.pdfEngineService.generateInspectionReport(
      inspection,
      formTemplate,
      reportNumber,
      additionalData,
    );

    // PDF'i MinIO'ya yükle (MinIO yoksa local path kullan)
    let url = `local://reports/${reportNumber}.pdf`;
    let objectName = `reports/${new Date().getFullYear()}/${reportNumber}.pdf`;
    try {
      const uploaded = await this.storageService.uploadFile(
        StorageBucket.REPORTS, buffer, `${reportNumber}.pdf`, 'application/pdf',
        `reports/${new Date().getFullYear()}`,
      );
      url = uploaded.url;
      objectName = uploaded.objectName;
    } catch (e) {
      console.warn(`[Reports] MinIO yükleme başarısız, local path kullanılıyor: ${e?.message}`);
    }

    const report = this.reportRepo.create({
      reportNumber,
      inspectionId,
      workOrderId: inspection.workOrderId,
      customerId: customer.id,
      equipmentId: inspection.equipmentId,
      formTemplateId: formTemplate.id,
      formTemplateRevision: formTemplate.revision,
      status: ReportStatus.UNDER_REVIEW,
      pdfUrl: url,
      pdfObjectName: objectName,
      documentHash: hash,
      reviewHistory: [],
      createdById: userId,
    });

    const saved = await this.reportRepo.save(report);

    await this.auditService.log({
      userId,
      action: 'REPORT_CREATED',
      entityType: 'Report',
      entityId: saved.id,
      newValues: { reportNumber, inspectionId, formRevision: formTemplate.revision },
    });

    this.logger.log(`Rapor oluşturuldu: ${reportNumber}`, 'ReportsService');
    return saved;
  }

  // ─── Teknik Yönetici Onayı ────────────────────────────────────────────────
  async approve(reportId: string, comment: string, reviewerId: string): Promise<Report> {
    const report = await this.findOne(reportId);
    this.assertReviewableStatus(report);

    const updatedHistory = [
      ...(report.reviewHistory || []),
      {
        action: 'approved',
        userId: reviewerId,
        userName: '',
        comment,
        timestamp: new Date().toISOString(),
      },
    ];

    await this.reportRepo.update(reportId, {
      status: ReportStatus.APPROVED,
      reviewHistory: updatedHistory,
    });

    await this.auditService.log({
      userId: reviewerId,
      action: 'REPORT_APPROVED',
      entityType: 'Report',
      entityId: reportId,
      newValues: { comment },
    });

    return this.findOne(reportId);
  }

  async requestRevision(reportId: string, comment: string, reviewerId: string): Promise<Report> {
    const report = await this.findOne(reportId);
    this.assertReviewableStatus(report);

    const updatedHistory = [
      ...(report.reviewHistory || []),
      {
        action: 'revision_requested',
        userId: reviewerId,
        userName: '',
        comment,
        timestamp: new Date().toISOString(),
      },
    ];

    await this.reportRepo.update(reportId, {
      status: ReportStatus.REVISION_REQUESTED,
      reviewHistory: updatedHistory,
    });

    await this.auditService.log({
      userId: reviewerId,
      action: 'REPORT_REVISION_REQUESTED',
      entityType: 'Report',
      entityId: reportId,
      newValues: { comment },
    });

    return this.findOne(reportId);
  }

  // ─── E-İmza Başlat ───────────────────────────────────────────────────────
  async initiateSign(
    reportId: string,
    signerPhone: string,
    signerUserId: string,
  ): Promise<{ sessionId: string; message: string }> {
    const report = await this.findOne(reportId);

    if (report.status !== ReportStatus.APPROVED) {
      throw new BadRequestException('Rapor imzalanmadan önce onaylanmalıdır');
    }

    const pdfBuffer = await this.storageService.getFileByUrl(report.pdfUrl);
    const result = await this.eSignatureService.initiateSigning(
      pdfBuffer,
      signerUserId,
      signerPhone,
    );

    await this.reportRepo.update(reportId, { status: ReportStatus.UNDER_SIGNING });

    return { sessionId: result.sessionId, message: result.message };
  }

  // ─── E-İmza Tamamla ──────────────────────────────────────────────────────
  async completeSigning(
    reportId: string,
    sessionId: string,
    otpCode: string,
    signerName: string,
    signerUserId: string,
  ): Promise<Report> {
    const report = await this.findOne(reportId);

    if (report.status !== ReportStatus.UNDER_SIGNING) {
      throw new BadRequestException('Rapor imzalama sürecinde değil');
    }

    const pdfBuffer = await this.storageService.getFileByUrl(report.pdfUrl);

    // Before sending to e-sign provider, verify PDF hasn't changed
    const currentHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    if (report.documentHash && currentHash !== report.documentHash) {
      throw new BadRequestException('PDF belgesi değiştirilmiş. İmza iptal edildi.');
    }

    const { signedPdfBuffer, signedHash, signatureData } =
      await this.eSignatureService.completeSigning(sessionId, otpCode, pdfBuffer, signerName);

    // İmzalı PDF'i arşiv bucket'ına koy (değiştirilemez)
    const archiveObjectName = `reports/${new Date().getFullYear()}/${report.reportNumber}_SIGNED.pdf`;
    const signedUrl = await this.storageService.moveToArchive(
      StorageBucket.REPORTS,
      report.pdfObjectName,
      archiveObjectName,
    );

    await this.reportRepo.update(reportId, {
      status: ReportStatus.SIGNED,
      signedPdfUrl: signedUrl,
      signedPdfObjectName: archiveObjectName,
      signedDocumentHash: signedHash,
      signatureData,
      signedById: signerUserId,
      signedAt: new Date(),
    });

    // İş emri durumunu güncelle
    if (report.workOrderId) {
      await this.workOrdersService.updateStatus(
        report.workOrderId,
        WorkOrderStatus.REPORT_APPROVED,
        signerUserId,
      );
    }

    await this.auditService.log({
      userId: signerUserId,
      action: 'REPORT_SIGNED',
      entityType: 'Report',
      entityId: reportId,
      newValues: {
        signedHash,
        signerName: signatureData.signerName,
        signTime: signatureData.signTime,
      },
    });

    return this.findOne(reportId);
  }

  // ─── Müşteriye Teslim ────────────────────────────────────────────────────
  async deliver(reportId: string, userId: string): Promise<Report> {
    const report = await this.findOne(reportId);

    if (report.status !== ReportStatus.SIGNED) {
      throw new BadRequestException('Yalnızca imzalanmış raporlar teslim edilebilir');
    }

    // Müşteri e-posta bildirimi
    const customer = await this.customersService.findOne(report.customerId);
    if (customer.contactEmail) {
      const downloadUrl = await this.storageService.getPresignedDownloadUrl(
        StorageBucket.ARCHIVE,
        report.signedPdfObjectName,
        72 * 3600, // 72 saat geçerli link
      );

      await this.notificationsService.notifyReportReady(customer.contactEmail, {
        reportNumber: report.reportNumber,
        customerName: customer.name,
        downloadUrl,
      });
    }

    await this.reportRepo.update(reportId, {
      status: ReportStatus.DELIVERED,
      deliveredAt: new Date(),
      deliveryMethod: 'email',
    });

    await this.auditService.log({
      userId,
      action: 'REPORT_DELIVERED',
      entityType: 'Report',
      entityId: reportId,
      newValues: { deliveredAt: new Date().toISOString() },
    });

    return this.findOne(reportId);
  }

  // ─── Belge Doğrulama (Public) ─────────────────────────────────────────────
  async verifyReport(reportNumber: string): Promise<{
    valid: boolean;
    report: Partial<Report>;
    verificationDetails: string;
  }> {
    const report = await this.reportRepo.findOne({ where: { reportNumber } });
    if (!report) {
      return {
        valid: false,
        report: null,
        verificationDetails: 'Rapor bulunamadı',
      };
    }

    let verificationDetails = 'Rapor kayıtlarda mevcut';

    if (report.status === ReportStatus.SIGNED || report.status === ReportStatus.DELIVERED) {
      const signedPdfBuffer = await this.storageService.getFileByUrl(report.signedPdfUrl);
      const result = await this.eSignatureService.verifySignature(
        signedPdfBuffer,
        report.signedDocumentHash,
      );
      verificationDetails = result.details;

      return {
        valid: result.valid,
        report: {
          reportNumber: report.reportNumber,
          status: report.status,
          signedAt: report.signedAt,
          signatureData: report.signatureData,
        },
        verificationDetails,
      };
    }

    return {
      valid: false,
      report: { reportNumber: report.reportNumber, status: report.status },
      verificationDetails: 'Rapor henüz imzalanmamış',
    };
  }

  // ─── PDF İndirme ──────────────────────────────────────────────────────────
  async getPdfBuffer(reportId: string, signed = false): Promise<Buffer> {
    const report = await this.findOne(reportId);
    const url = signed ? report.signedPdfUrl : report.pdfUrl;
    if (!url) throw new BadRequestException('PDF dosyası henüz oluşturulmamış');
    return this.storageService.getFileByUrl(url);
  }

  // ─── Listele ─────────────────────────────────────────────────────────────
  async findAll(
    filters: {
      status?: string;
      customerId?: string;
      equipmentId?: string;
      startDate?: string;
      endDate?: string;
      companyId?: string;
    },
    pagination: PaginationDto,
  ): Promise<PaginatedResult<Report>> {
    const qb = this.reportRepo.createQueryBuilder('r');

    if (filters.status) qb.andWhere('r.status = :status', { status: filters.status });
    if (filters.customerId) qb.andWhere('r.customerId = :cid', { cid: filters.customerId });
    if (filters.equipmentId) qb.andWhere('r.equipmentId = :eid', { eid: filters.equipmentId });
    if (filters.startDate) qb.andWhere('r.createdAt >= :start', { start: filters.startDate });
    if (filters.endDate) qb.andWhere('r.createdAt <= :end', { end: filters.endDate });

    // Tenant isolation: filter reports through customer → companyId
    if (filters.companyId) {
      qb.innerJoin('customers', 'cust', 'cust.id = r.customerId')
        .andWhere('cust.companyId = :companyId', { companyId: filters.companyId });
    }

    qb.orderBy('r.createdAt', 'DESC').skip(pagination.skip).take(pagination.limit);

    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<Report> {
    const report = await this.reportRepo.findOne({ where: { id } });
    if (!report) throw new NotFoundException('Rapor bulunamadı');
    return report;
  }

  // ─── Stale Signing Session Recovery ──────────────────────────────────────
  async recoverStaleSigningSessions(): Promise<number> {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const result = await this.reportRepo
      .createQueryBuilder()
      .update()
      .set({ status: ReportStatus.APPROVED })
      .where('status = :status', { status: ReportStatus.UNDER_SIGNING })
      .andWhere('updatedAt < :cutoff', { cutoff: thirtyMinutesAgo })
      .execute();

    if (result.affected > 0) {
      await this.auditService.log({
        userId: 'system',
        action: 'SIGNING_SESSION_RECOVERED',
        entityType: 'Report',
        description: `${result.affected} adet imza oturumu zaman aşımına uğradı ve APPROVED durumuna geri alındı`,
      });
    }
    return result.affected;
  }

  @Cron('*/10 * * * *') // Every 10 minutes
  async handleStaleSigningSessions() {
    await this.recoverStaleSigningSessions();
  }

  // ─── Yardımcılar ─────────────────────────────────────────────────────────
  private buildAdditionalData(equipment: any, customer: any): Record<string, any> {
    return {
      'equipment.brand': equipment?.brand || '',
      'equipment.model': equipment?.model || '',
      'equipment.serialNumber': equipment?.serialNumber || '',
      'equipment.capacity': equipment?.capacity || '',
      'equipment.inventoryCode': equipment?.inventoryCode || '',
      'equipment.manufactureYear': equipment?.manufactureYear || '',
      'customer.name': customer?.name || '',
      'customer.taxNumber': customer?.taxNumber || '',
      'customer.address': customer?.address || '',
      'location.name': equipment?.location?.name || '',
      'location.address': equipment?.location?.address || '',
    };
  }

  private assertReviewableStatus(report: Report): void {
    const reviewable = [ReportStatus.UNDER_REVIEW, ReportStatus.REVISION_REQUESTED];
    if (!reviewable.includes(report.status)) {
      throw new BadRequestException(`'${report.status}' durumundaki rapor incelenemez`);
    }
  }
}
