import {
  Injectable, NotFoundException, BadRequestException,
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req, Module,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';
import { AuditModule } from '@/modules/audit/audit.module';
import { AuditService } from '@/modules/audit/audit.service';
import { Payment, PaymentStatus, PaymentMethod } from './entities/payment.entity';
import { IyzicoClient } from './iyzico.client';
import { v4 as uuidv4 } from 'uuid';

// ─── Service ─────────────────────────────────────────────────────────────────
@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private repo: Repository<Payment>,
    private iyzicoClient: IyzicoClient,
    private auditService: AuditService,
  ) {}

  // ─── Checkout Form ile odeme baslat (3D Secure) ────────────────────────────
  async initiateCheckoutPayment(
    data: {
      invoiceBatchId: string;
      customerId: string;
      amount: number;
      installment?: number;
      buyerName: string;
      buyerSurname: string;
      buyerEmail: string;
      buyerPhone: string;
      buyerTcNo: string;
      buyerAddress: string;
      buyerCity: string;
      description: string;
    },
    userId: string,
    ip: string,
  ): Promise<{ paymentId: string; checkoutFormUrl: string; token: string }> {
    const conversationId = uuidv4();
    const priceStr = data.amount.toFixed(2);

    // Payment kaydı oluştur
    const payment = this.repo.create({
      invoiceBatchId: data.invoiceBatchId,
      customerId: data.customerId,
      amount: data.amount,
      currency: 'TRY',
      method: PaymentMethod.CREDIT_CARD,
      status: PaymentStatus.PENDING,
      installment: data.installment || 1,
      buyerName: `${data.buyerName} ${data.buyerSurname}`,
      buyerEmail: data.buyerEmail,
      buyerPhone: data.buyerPhone,
      buyerTcNo: data.buyerTcNo,
      iyzicoConversationId: conversationId,
      createdById: userId,
    });
    const saved = await this.repo.save(payment);

    try {
      const result = await this.iyzicoClient.createCheckoutForm({
        conversationId,
        price: priceStr,
        paidPrice: priceStr,
        currency: 'TRY',
        installment: data.installment || 1,
        basketId: data.invoiceBatchId,
        callbackUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/callback`,
        buyer: {
          id: data.customerId,
          name: data.buyerName,
          surname: data.buyerSurname,
          email: data.buyerEmail,
          gsmNumber: data.buyerPhone,
          identityNumber: data.buyerTcNo || '11111111111',
          registrationAddress: data.buyerAddress || 'Türkiye',
          ip,
          city: data.buyerCity || 'Istanbul',
          country: 'Turkey',
        },
        shippingAddress: {
          contactName: `${data.buyerName} ${data.buyerSurname}`,
          city: data.buyerCity || 'Istanbul',
          country: 'Turkey',
          address: data.buyerAddress || 'Türkiye',
        },
        billingAddress: {
          contactName: `${data.buyerName} ${data.buyerSurname}`,
          city: data.buyerCity || 'Istanbul',
          country: 'Turkey',
          address: data.buyerAddress || 'Türkiye',
        },
        basketItems: [{
          id: data.invoiceBatchId,
          name: data.description || 'Periyodik Kontrol Hizmeti',
          category1: 'Hizmet',
          itemType: 'VIRTUAL',
          price: priceStr,
        }],
      });

      if (result.status !== 'success') {
        await this.repo.update(saved.id, {
          status: PaymentStatus.FAILED,
          errorMessage: result.errorMessage || 'iyzico form oluşturulamadı',
          iyzicoResponse: result,
        });
        throw new BadRequestException(result.errorMessage || 'Ödeme formu oluşturulamadı');
      }

      await this.repo.update(saved.id, {
        iyzicoToken: result.token,
        iyzicoCheckoutFormUrl: result.checkoutFormContent,
        iyzicoResponse: result,
      });

      await this.auditService.log({
        userId, action: 'PAYMENT_INITIATED', entityType: 'Payment', entityId: saved.id,
        newValues: { amount: data.amount, method: 'credit_card', installment: data.installment },
      });

      return {
        paymentId: saved.id,
        checkoutFormUrl: result.checkoutFormContent,
        token: result.token,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      await this.repo.update(saved.id, {
        status: PaymentStatus.FAILED,
        errorMessage: error.message,
      });
      throw new BadRequestException(`Ödeme başlatılamadı: ${error.message}`);
    }
  }

  // ─── Callback: iyzico sonucu dogrula ───────────────────────────────────────
  async handleCallback(token: string): Promise<Payment> {
    const payment = await this.repo.findOne({ where: { iyzicoToken: token } });
    if (!payment) throw new NotFoundException('Ödeme kaydı bulunamadı');

    try {
      const result = await this.iyzicoClient.retrieveCheckoutForm(token);

      if (result.status === 'success' && result.paymentStatus === 'SUCCESS') {
        await this.repo.update(payment.id, {
          status: PaymentStatus.SUCCESS,
          iyzicoPaymentId: result.paymentId,
          cardLastFour: result.lastFourDigits || result.cardFourDigits,
          cardBrand: result.cardAssociation,
          iyzicoResponse: result,
          paidAt: new Date(),
        });

        // Invoice batch'in payment status'unu guncelle
        await this.repo.manager.query(
          `UPDATE invoice_batches SET paymentStatus = 'paid', paidAmount = totalWithVat, paidAt = NOW() WHERE id = ?`,
          [payment.invoiceBatchId],
        );

        await this.auditService.log({
          action: 'PAYMENT_SUCCESS', entityType: 'Payment', entityId: payment.id,
          newValues: { paymentId: result.paymentId, amount: payment.amount },
        });
      } else {
        await this.repo.update(payment.id, {
          status: PaymentStatus.FAILED,
          errorMessage: result.errorMessage || 'Ödeme başarısız',
          iyzicoResponse: result,
        });

        await this.auditService.log({
          action: 'PAYMENT_FAILED', entityType: 'Payment', entityId: payment.id,
          newValues: { error: result.errorMessage },
        });
      }

      return this.repo.findOne({ where: { id: payment.id } });
    } catch (error) {
      await this.repo.update(payment.id, {
        status: PaymentStatus.FAILED,
        errorMessage: error.message,
      });
      throw error;
    }
  }

  // ─── Iade ──────────────────────────────────────────────────────────────────
  async refund(
    paymentId: string,
    refundAmount: number,
    userId: string,
    ip: string,
  ): Promise<Payment> {
    const payment = await this.repo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Ödeme bulunamadı');
    if (payment.status !== PaymentStatus.SUCCESS) {
      throw new BadRequestException('Sadece başarılı ödemeler iade edilebilir');
    }
    if (refundAmount > Number(payment.amount)) {
      throw new BadRequestException('İade tutarı ödeme tutarını aşamaz');
    }

    // iyzico iade bilgisi için paymentTransactionId gerekir
    const iyzicoResponse = payment.iyzicoResponse as any;
    const transactionId = iyzicoResponse?.itemTransactions?.[0]?.paymentTransactionId;
    if (!transactionId) {
      throw new BadRequestException('iyzico işlem ID bulunamadı');
    }

    const result = await this.iyzicoClient.refund({
      paymentTransactionId: transactionId,
      conversationId: payment.iyzicoConversationId,
      price: refundAmount.toFixed(2),
      currency: 'TRY',
      ip,
    });

    if (result.status === 'success') {
      await this.repo.update(paymentId, {
        status: PaymentStatus.REFUNDED,
        refundAmount,
        iyzicoResponse: { ...payment.iyzicoResponse, refund: result },
      });

      await this.auditService.log({
        userId, action: 'PAYMENT_REFUNDED', entityType: 'Payment', entityId: paymentId,
        newValues: { refundAmount },
      });
    } else {
      throw new BadRequestException(result.errorMessage || 'İade başarısız');
    }

    return this.repo.findOne({ where: { id: paymentId } });
  }

  // ─── Taksit sorgulama ──────────────────────────────────────────────────────
  async getInstallments(binNumber: string, price: number): Promise<any> {
    return this.iyzicoClient.getInstallments({
      binNumber,
      price: price.toFixed(2),
    });
  }

  // ─── Nakit / Havale ile odeme kaydi ────────────────────────────────────────
  async recordManualPayment(
    data: {
      invoiceBatchId: string;
      customerId: string;
      amount: number;
      method: 'bank_transfer' | 'cash';
      notes?: string;
    },
    userId: string,
  ): Promise<Payment> {
    const payment = this.repo.create({
      invoiceBatchId: data.invoiceBatchId,
      customerId: data.customerId,
      amount: data.amount,
      currency: 'TRY',
      method: data.method === 'cash' ? PaymentMethod.CASH : PaymentMethod.BANK_TRANSFER,
      status: PaymentStatus.SUCCESS,
      createdById: userId,
      paidAt: new Date(),
    });
    const saved = await this.repo.save(payment);

    // Invoice batch guncelle
    await this.repo.manager.query(
      `UPDATE invoice_batches SET paidAmount = COALESCE(paidAmount, 0) + ?,
       paymentStatus = CASE WHEN COALESCE(paidAmount, 0) + ? >= totalWithVat THEN 'paid' ELSE 'partial' END,
       paidAt = CASE WHEN COALESCE(paidAmount, 0) + ? >= totalWithVat THEN NOW() ELSE paidAt END
       WHERE id = ?`,
      [data.amount, data.amount, data.amount, data.invoiceBatchId],
    );

    await this.auditService.log({
      userId, action: 'MANUAL_PAYMENT', entityType: 'Payment', entityId: saved.id,
      newValues: { amount: data.amount, method: data.method },
    });

    return saved;
  }

  // ─── Listeleme / Istatistik ────────────────────────────────────────────────
  async list(
    filters: { invoiceBatchId?: string; customerId?: string; status?: string },
    pagination: PaginationDto,
  ): Promise<PaginatedResult<Payment>> {
    const qb = this.repo.createQueryBuilder('p');
    if (filters.invoiceBatchId) qb.andWhere('p.invoiceBatchId = :bid', { bid: filters.invoiceBatchId });
    if (filters.customerId) qb.andWhere('p.customerId = :cid', { cid: filters.customerId });
    if (filters.status) qb.andWhere('p.status = :s', { s: filters.status });
    qb.orderBy('p.createdAt', 'DESC').skip(pagination.skip).take(pagination.limit);
    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async getStats(): Promise<{
    totalReceived: number; pendingCount: number; successCount: number; failedCount: number;
    todayReceived: number; monthReceived: number;
  }> {
    const totalResult = await this.repo.createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'total')
      .where('p.status = :s', { s: 'success' })
      .getRawOne();

    const todayResult = await this.repo.createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'total')
      .where('p.status = :s', { s: 'success' })
      .andWhere('DATE(p.paidAt) = CURDATE()')
      .getRawOne();

    const monthResult = await this.repo.createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'total')
      .where('p.status = :s', { s: 'success' })
      .andWhere('p.paidAt >= DATE_FORMAT(NOW(), "%Y-%m-01")')
      .getRawOne();

    const counts = await this.repo.createQueryBuilder('p')
      .select('p.status, COUNT(*) as cnt')
      .groupBy('p.status')
      .getRawMany();

    const countMap = counts.reduce((acc, r) => ({ ...acc, [r.p_status]: Number(r.cnt) }), {});

    return {
      totalReceived: Number(totalResult?.total || 0),
      pendingCount: countMap.pending || 0,
      successCount: countMap.success || 0,
      failedCount: countMap.failed || 0,
      todayReceived: Number(todayResult?.total || 0),
      monthReceived: Number(monthResult?.total || 0),
    };
  }

  async findOne(id: string): Promise<Payment> {
    const payment = await this.repo.findOne({ where: { id } });
    if (!payment) throw new NotFoundException('Ödeme bulunamadı');
    return payment;
  }
}

// ─── Controller ──────────────────────────────────────────────────────────────
@ApiTags('payments') @ApiBearerAuth('JWT') @UseGuards(AuthGuard('jwt'), RolesGuard) @Controller('payments')
export class PaymentsController {
  constructor(private service: PaymentsService) {}

  @Post('checkout')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Kredi kartı ile ödeme başlat (iyzico Checkout Form)' })
  initiateCheckout(@Body() body: any, @CurrentUser('id') userId: string, @Req() req: any) {
    return this.service.initiateCheckoutPayment(body, userId, req.ip || '127.0.0.1');
  }

  @Post('callback')
  @ApiOperation({ summary: 'iyzico callback - ödeme sonucu' })
  handleCallback(@Body('token') token: string) {
    return this.service.handleCallback(token);
  }

  @Post('manual')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Nakit/Havale ödeme kaydı' })
  recordManual(@Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.recordManualPayment(body, userId);
  }

  @Post(':id/refund')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Ödeme iadesi' })
  refund(
    @Param('id') id: string,
    @Body('refundAmount') refundAmount: number,
    @CurrentUser('id') userId: string,
    @Req() req: any,
  ) {
    return this.service.refund(id, refundAmount, userId, req.ip || '127.0.0.1');
  }

  @Get('installments')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Taksit seçenekleri sorgula' })
  getInstallments(@Query('binNumber') binNumber: string, @Query('price') price: number) {
    return this.service.getInstallments(binNumber, price);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.EXECUTIVE)
  @ApiOperation({ summary: 'Ödeme listesi' })
  list(
    @Query('invoiceBatchId') invoiceBatchId?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
    @Query() pagination?: PaginationDto,
  ) {
    return this.service.list({ invoiceBatchId, customerId, status }, pagination);
  }

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.EXECUTIVE)
  @ApiOperation({ summary: 'Ödeme istatistikleri' })
  getStats() {
    return this.service.getStats();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Ödeme detayı' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}

// ─── Module ──────────────────────────────────────────────────────────────────
@Module({
  imports: [TypeOrmModule.forFeature([Payment]), AuditModule],
  providers: [PaymentsService, IyzicoClient],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
