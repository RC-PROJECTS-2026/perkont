import { Entity, Column, Index, Repository, DataSource } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import {
  Injectable, NotFoundException, BadRequestException, Controller, Get, Post, Patch,
  Body, Param, Query, UseGuards, Module,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';
import { AuditModule } from '@/modules/audit/audit.module';
import { AuditService } from '@/modules/audit/audit.service';

// ─── Entity: InvoiceBatch ───────────────────────────────────────────────────────
@Entity('invoice_batches')
@Index(['customerId', 'status'])
export class InvoiceBatch extends AbstractEntity {
  @Column({ type: 'varchar', length: 50, unique: true }) batchNumber: string;
  @Column({ type: 'varchar', length: 20, default: 'draft' }) status: string;
  @Column({ type: 'json' }) workOrderIds: string[];
  @Column({ type: 'varchar', length: 36 }) customerId: string;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) totalAmount: number;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 20 }) vatRate: number;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) vatAmount: number;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) totalWithVat: number;
  @Column({ type: 'date' }) invoiceDate: Date;
  @Column({ type: 'text', nullable: true }) notes: string;
  @Column({ type: 'varchar', length: 36 }) preparedById: string;
  @Column({ type: 'datetime', nullable: true }) preparedAt: Date;
  @Column({ type: 'datetime', nullable: true }) sentToLogoAt: Date;
  @Column({ type: 'varchar', length: 36, nullable: true }) logoSyncQueueId: string;

  // Cancel/Refund fields
  @Column({ type: 'datetime', nullable: true }) cancelledAt: Date;
  @Column({ type: 'varchar', length: 36, nullable: true }) cancelledById: string;
  @Column({ type: 'text', nullable: true }) cancelReason: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) refundAmount: number;
  @Column({ type: 'varchar', length: 36, nullable: true }) originalBatchId: string;

  // Payment tracking fields
  @Column({ type: 'varchar', length: 10, default: 'unpaid' }) paymentStatus: string; // unpaid | partial | paid
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) paidAmount: number;
  @Column({ type: 'datetime', nullable: true }) paidAt: Date;
}

// ─── Service: InvoicePreparationService ─────────────────────────────────────────
@Injectable()
export class InvoicePreparationService {
  constructor(
    @InjectRepository(InvoiceBatch) private repo: Repository<InvoiceBatch>,
    private dataSource: DataSource,
    private auditService: AuditService,
  ) {}

  async getReady(
    filters: { customerId?: string; search?: string },
    pagination: PaginationDto,
  ): Promise<PaginatedResult<any>> {
    // Tamamlanmış ve henüz fatura batch'ine eklenmemiş iş emirleri
    let query = `
      SELECT wo.* FROM work_orders wo
      WHERE wo.status IN ('completed', 'report_approved')
        AND wo.id NOT IN (
          SELECT jt.value FROM invoice_batches ib,
          JSON_TABLE(ib.workOrderIds, '$[*]' COLUMNS(value VARCHAR(36) PATH '$')) jt
        )
    `;
    const params: any[] = [];

    if (filters.customerId) {
      query += ` AND wo.customerId = ?`;
      params.push(filters.customerId);
    }
    if (filters.search) {
      query += ` AND (wo.workOrderNumber LIKE ? OR wo.id LIKE ?)`;
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM (${query}) sub`;
    const countResult = await this.dataSource.query(countQuery, params);
    const total = Number(countResult[0]?.total || 0);

    // Paginated query
    query += ` ORDER BY wo.createdAt DESC LIMIT ? OFFSET ?`;
    params.push(pagination.limit, pagination.skip);

    const data = await this.dataSource.query(query, params);
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async getStats(): Promise<{
    readyCount: number; preparedCount: number; sentCount: number; totalAmount: number;
  }> {
    // Faturaya hazır iş emri sayısı
    const readyResult = await this.dataSource.query(`
      SELECT COUNT(*) as cnt FROM work_orders wo
      WHERE wo.status IN ('completed', 'report_approved')
        AND wo.id NOT IN (
          SELECT jt.value FROM invoice_batches ib,
          JSON_TABLE(ib.workOrderIds, '$[*]' COLUMNS(value VARCHAR(36) PATH '$')) jt
        )
    `);
    const readyCount = Number(readyResult[0]?.cnt || 0);

    const preparedCount = await this.repo.count({ where: { status: 'prepared' } });
    const sentCount = await this.repo.count({ where: { status: 'sent_to_logo' } });

    const totalResult = await this.repo
      .createQueryBuilder('ib')
      .select('COALESCE(SUM(ib.totalWithVat), 0)', 'total')
      .where('ib.status IN (:...statuses)', { statuses: ['prepared', 'sent_to_logo', 'completed'] })
      .getRawOne();
    const totalAmount = Number(totalResult?.total || 0);

    return { readyCount, preparedCount, sentCount, totalAmount };
  }

  async prepare(
    workOrderId: string,
    data: { invoiceDate?: string; notes?: string; totalAmount: number },
    userId: string,
  ): Promise<InvoiceBatch> {
    // iş emrinin durumunu kontrol et
    const woRows = await this.dataSource.query(
      `SELECT id, customer_id, status FROM work_orders WHERE id = ? AND status IN ('completed', 'report_approved')`,
      [workOrderId],
    );
    if (!woRows.length) throw new NotFoundException('İş emri bulunamadı veya uygun durumda değil');

    const wo = woRows[0];
    const totalAmount = Number(data.totalAmount);
    const vatRate = 20;
    const vatAmount = Math.round(totalAmount * (vatRate / 100) * 100) / 100;
    const totalWithVat = Math.round((totalAmount + vatAmount) * 100) / 100;
    const batchNumber = await this.generateBatchNumber();

    const batch = this.repo.create({
      batchNumber,
      status: 'prepared',
      workOrderIds: [workOrderId],
      customerId: wo.customer_id,
      totalAmount,
      vatRate,
      vatAmount,
      totalWithVat,
      invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
      notes: data.notes || null,
      preparedById: userId,
      preparedAt: new Date(),
    });
    const saved = await this.repo.save(batch);

    await this.auditService.log({
      userId, action: 'CREATE', entityType: 'invoice_batch', entityId: saved.id,
      newValues: { batchNumber, workOrderId, totalAmount, totalWithVat },
      description: `Fatura batch oluşturuldu: ${batchNumber}`,
    });
    return saved;
  }

  async createBatch(
    data: { workOrderIds: string[]; customerId: string; invoiceDate?: string; notes?: string; totalAmount: number },
    userId: string,
  ): Promise<InvoiceBatch> {
    if (!data.workOrderIds || data.workOrderIds.length === 0) {
      throw new BadRequestException('En az bir iş emri seçilmelidir');
    }

    const totalAmount = Number(data.totalAmount);
    const vatRate = 20;
    const vatAmount = Math.round(totalAmount * (vatRate / 100) * 100) / 100;
    const totalWithVat = Math.round((totalAmount + vatAmount) * 100) / 100;
    const batchNumber = await this.generateBatchNumber();

    const batch = this.repo.create({
      batchNumber,
      status: 'prepared',
      workOrderIds: data.workOrderIds,
      customerId: data.customerId,
      totalAmount,
      vatRate,
      vatAmount,
      totalWithVat,
      invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
      notes: data.notes || null,
      preparedById: userId,
      preparedAt: new Date(),
    });
    const saved = await this.repo.save(batch);

    await this.auditService.log({
      userId, action: 'CREATE_BATCH', entityType: 'invoice_batch', entityId: saved.id,
      newValues: { batchNumber, workOrderIds: data.workOrderIds, totalAmount, totalWithVat },
      description: `Toplu fatura batch oluşturuldu: ${batchNumber} (${data.workOrderIds.length} iş emri)`,
    });
    return saved;
  }

  async sendToLogo(batchId: string, userId: string): Promise<InvoiceBatch> {
    const batch = await this.repo.findOne({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Fatura batch bulunamadı');
    if (batch.status !== 'prepared') {
      throw new BadRequestException('Sadece "prepared" durumundaki batch LOGO\'ya gönderilebilir');
    }

    // logo_sync_queue tablosuna kayıt ekle
    const queueId = this.generateUUID();
    await this.dataSource.query(
      `INSERT INTO logo_sync_queue (id, entityType, entityId, direction, status, payload, createdAt, updatedAt)
       VALUES (?, 'invoice', ?, 'push', 'pending', ?, NOW(), NOW())`,
      [queueId, batchId, JSON.stringify({
        batchNumber: batch.batchNumber,
        customerId: batch.customerId,
        totalAmount: batch.totalAmount,
        vatAmount: batch.vatAmount,
        totalWithVat: batch.totalWithVat,
        invoiceDate: batch.invoiceDate,
        workOrderIds: batch.workOrderIds,
      })],
    );

    batch.status = 'sent_to_logo';
    batch.sentToLogoAt = new Date();
    batch.logoSyncQueueId = queueId;
    const saved = await this.repo.save(batch);

    await this.auditService.log({
      userId, action: 'SEND_TO_LOGO', entityType: 'invoice_batch', entityId: batchId,
      newValues: { status: 'sent_to_logo', logoSyncQueueId: queueId },
      description: `Fatura batch LOGO'ya gönderildi: ${batch.batchNumber}`,
    });
    return saved;
  }

  async getBatches(
    filters: { status?: string; customerId?: string; search?: string },
    pagination: PaginationDto,
  ): Promise<PaginatedResult<InvoiceBatch>> {
    const qb = this.repo.createQueryBuilder('ib');

    if (filters.status) {
      qb.andWhere('ib.status = :status', { status: filters.status });
    }
    if (filters.customerId) {
      qb.andWhere('ib.customerId = :cid', { cid: filters.customerId });
    }
    if (filters.search) {
      qb.andWhere('ib.batchNumber LIKE :s', { s: `%${filters.search}%` });
    }

    qb.orderBy('ib.createdAt', 'DESC')
      .skip(pagination.skip)
      .take(pagination.limit);

    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async generateBatchNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `FTR-${year}-`;
    const lastBatch = await this.repo
      .createQueryBuilder('ib')
      .where('ib.batchNumber LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('ib.batchNumber', 'DESC')
      .getOne();

    let seq = 1;
    if (lastBatch) {
      const lastSeq = parseInt(lastBatch.batchNumber.replace(prefix, ''), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  // ─── Cancel ──────────────────────────────────────────────────────────────
  async cancel(batchId: string, reason: string, userId: string): Promise<InvoiceBatch> {
    const batch = await this.repo.findOne({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Fatura batch bulunamadı');
    if (batch.status === 'cancelled') {
      throw new BadRequestException('Bu batch zaten iptal edilmiş');
    }

    batch.status = 'cancelled';
    batch.cancelledAt = new Date();
    batch.cancelledById = userId;
    batch.cancelReason = reason;
    const saved = await this.repo.save(batch);

    await this.auditService.log({
      userId, action: 'CANCEL', entityType: 'invoice_batch', entityId: batchId,
      newValues: { status: 'cancelled', reason },
      description: `Fatura batch iptal edildi: ${batch.batchNumber}`,
    });
    return saved;
  }

  // ─── Refund ─────────────────────────────────────────────────────────────
  async refund(batchId: string, refundAmount: number, userId: string): Promise<InvoiceBatch> {
    const batch = await this.repo.findOne({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Fatura batch bulunamadı');
    if (refundAmount > Number(batch.totalWithVat)) {
      throw new BadRequestException('İade tutarı fatura toplamını aşamaz');
    }

    batch.refundAmount = refundAmount;
    batch.status = 'refunded';
    const saved = await this.repo.save(batch);

    await this.auditService.log({
      userId, action: 'REFUND', entityType: 'invoice_batch', entityId: batchId,
      newValues: { refundAmount, status: 'refunded' },
      description: `Fatura batch iade edildi: ${batch.batchNumber}, tutar: ${refundAmount}`,
    });
    return saved;
  }

  // ─── Re-invoice ─────────────────────────────────────────────────────────
  async reInvoice(
    batchId: string,
    data: { invoiceDate?: string; notes?: string; totalAmount: number },
    userId: string,
  ): Promise<InvoiceBatch> {
    const originalBatch = await this.repo.findOne({ where: { id: batchId } });
    if (!originalBatch) throw new NotFoundException('Orijinal fatura batch bulunamadı');

    const totalAmount = Number(data.totalAmount);
    const vatRate = Number(originalBatch.vatRate);
    const vatAmount = Math.round(totalAmount * (vatRate / 100) * 100) / 100;
    const totalWithVat = Math.round((totalAmount + vatAmount) * 100) / 100;
    const batchNumber = await this.generateBatchNumber();

    const newBatch = this.repo.create({
      batchNumber,
      status: 'prepared',
      workOrderIds: originalBatch.workOrderIds,
      customerId: originalBatch.customerId,
      totalAmount,
      vatRate,
      vatAmount,
      totalWithVat,
      invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
      notes: data.notes || `Yeniden faturalandırma. Orijinal: ${originalBatch.batchNumber}`,
      preparedById: userId,
      preparedAt: new Date(),
      originalBatchId: batchId,
    });
    const saved = await this.repo.save(newBatch);

    await this.auditService.log({
      userId, action: 'RE_INVOICE', entityType: 'invoice_batch', entityId: saved.id,
      newValues: { batchNumber, originalBatchId: batchId, totalAmount, totalWithVat },
      description: `Yeniden faturalandırma: ${batchNumber} (orijinal: ${originalBatch.batchNumber})`,
    });
    return saved;
  }

  // ─── Record Payment ────────────────────────────────────────────────────
  async recordPayment(batchId: string, amount: number, userId: string): Promise<InvoiceBatch> {
    const batch = await this.repo.findOne({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Fatura batch bulunamadı');

    const newPaidAmount = Number(batch.paidAmount || 0) + amount;
    const totalWithVat = Number(batch.totalWithVat);

    let paymentStatus = 'partial';
    if (newPaidAmount >= totalWithVat) {
      paymentStatus = 'paid';
    } else if (newPaidAmount <= 0) {
      paymentStatus = 'unpaid';
    }

    batch.paidAmount = newPaidAmount;
    batch.paymentStatus = paymentStatus;
    if (paymentStatus === 'paid') {
      batch.paidAt = new Date();
    }
    const saved = await this.repo.save(batch);

    await this.auditService.log({
      userId, action: 'RECORD_PAYMENT', entityType: 'invoice_batch', entityId: batchId,
      newValues: { amount, paidAmount: newPaidAmount, paymentStatus },
      description: `Ödeme kaydedildi: ${batch.batchNumber}, tutar: ${amount}`,
    });
    return saved;
  }

  // ─── Payment Summary ───────────────────────────────────────────────────
  async getPaymentSummary(): Promise<{
    unpaidCount: number; unpaidAmount: number;
    partialCount: number; partialAmount: number;
    paidCount: number; paidAmount: number;
  }> {
    const unpaidResult = await this.repo.createQueryBuilder('ib')
      .select('COUNT(*)', 'cnt').addSelect('COALESCE(SUM(ib.totalWithVat), 0)', 'total')
      .where('ib.paymentStatus = :s', { s: 'unpaid' })
      .andWhere('ib.status != :cancelled', { cancelled: 'cancelled' })
      .getRawOne();

    const partialResult = await this.repo.createQueryBuilder('ib')
      .select('COUNT(*)', 'cnt').addSelect('COALESCE(SUM(ib.totalWithVat), 0)', 'total')
      .where('ib.paymentStatus = :s', { s: 'partial' })
      .andWhere('ib.status != :cancelled', { cancelled: 'cancelled' })
      .getRawOne();

    const paidResult = await this.repo.createQueryBuilder('ib')
      .select('COUNT(*)', 'cnt').addSelect('COALESCE(SUM(ib.totalWithVat), 0)', 'total')
      .where('ib.paymentStatus = :s', { s: 'paid' })
      .andWhere('ib.status != :cancelled', { cancelled: 'cancelled' })
      .getRawOne();

    return {
      unpaidCount: Number(unpaidResult?.cnt || 0),
      unpaidAmount: Number(unpaidResult?.total || 0),
      partialCount: Number(partialResult?.cnt || 0),
      partialAmount: Number(partialResult?.total || 0),
      paidCount: Number(paidResult?.cnt || 0),
      paidAmount: Number(paidResult?.total || 0),
    };
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

// ─── Controller: InvoicePreparationController ───────────────────────────────────
@ApiTags('invoice-preparation') @ApiBearerAuth('JWT') @UseGuards(AuthGuard('jwt'), RolesGuard) @Controller('invoice-preparation')
export class InvoicePreparationController {
  constructor(private service: InvoicePreparationService) {}

  @Get('ready') @Roles(UserRole.ADMIN, UserRole.FINANCE)
  getReady(
    @Query('customerId') customerId?: string,
    @Query('search') search?: string,
    @Query() pagination?: PaginationDto,
  ) {
    return this.service.getReady({ customerId, search }, pagination);
  }

  @Get('stats') @Roles(UserRole.ADMIN, UserRole.FINANCE)
  getStats() {
    return this.service.getStats();
  }

  @Post(':workOrderId/prepare') @Roles(UserRole.ADMIN, UserRole.FINANCE)
  prepare(
    @Param('workOrderId') workOrderId: string,
    @Body() body: any,
    @CurrentUser('id') uid: string,
  ) {
    return this.service.prepare(workOrderId, body, uid);
  }

  @Get('batch') @Roles(UserRole.ADMIN, UserRole.FINANCE)
  getBatches(
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('search') search?: string,
    @Query() pagination?: PaginationDto,
  ) {
    return this.service.getBatches({ status, customerId, search }, pagination);
  }

  @Post('batch') @Roles(UserRole.ADMIN, UserRole.FINANCE)
  createBatch(@Body() body: any, @CurrentUser('id') uid: string) {
    return this.service.createBatch(body, uid);
  }

  @Patch('batch/:id/send-to-logo') @Roles(UserRole.ADMIN, UserRole.FINANCE)
  sendToLogo(@Param('id') id: string, @CurrentUser('id') uid: string) {
    return this.service.sendToLogo(id, uid);
  }

  @Patch('batch/:id/cancel') @Roles(UserRole.ADMIN, UserRole.FINANCE)
  cancel(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser('id') uid: string,
  ) {
    return this.service.cancel(id, reason, uid);
  }

  @Post('batch/:id/refund') @Roles(UserRole.ADMIN, UserRole.FINANCE)
  refund(
    @Param('id') id: string,
    @Body('refundAmount') refundAmount: number,
    @CurrentUser('id') uid: string,
  ) {
    return this.service.refund(id, refundAmount, uid);
  }

  @Post('batch/:id/re-invoice') @Roles(UserRole.ADMIN, UserRole.FINANCE)
  reInvoice(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('id') uid: string,
  ) {
    return this.service.reInvoice(id, body, uid);
  }

  @Patch('batch/:id/payment') @Roles(UserRole.ADMIN, UserRole.FINANCE)
  recordPayment(
    @Param('id') id: string,
    @Body('amount') amount: number,
    @CurrentUser('id') uid: string,
  ) {
    return this.service.recordPayment(id, amount, uid);
  }

  @Get('payment-summary') @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.EXECUTIVE)
  getPaymentSummary() {
    return this.service.getPaymentSummary();
  }
}

// ─── Module ─────────────────────────────────────────────────────────────────────
@Module({
  imports: [TypeOrmModule.forFeature([InvoiceBatch]), AuditModule],
  providers: [InvoicePreparationService],
  controllers: [InvoicePreparationController],
  exports: [InvoicePreparationService],
})
export class InvoicePreparationModule {}
