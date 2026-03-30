import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { addDays } from 'date-fns';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Quotation, QuotationItem, QuotationStatus } from './entities/quotation.entity';
import { AuditService } from '@/modules/audit/audit.service';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';

@Injectable()
export class QuotationsService {
  constructor(
    @InjectRepository(Quotation)     private quotRepo: Repository<Quotation>,
    @InjectRepository(QuotationItem) private itemRepo: Repository<QuotationItem>,
    private auditService: AuditService,
  ) {}

  private async generateQuoteNumber(): Promise<string> {
    const year  = new Date().getFullYear();
    const count = await this.quotRepo.count();
    return `TKL-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async create(data: any, userId: string): Promise<Quotation> {
    const quoteNumber = await this.generateQuoteNumber();
    const { items = [], ...quotData } = data;

    const quotation = this.quotRepo.create({
      ...quotData,
      quoteNumber,
      validUntil: addDays(new Date(), 30),
      createdById: userId,
    });
    const saved = await this.quotRepo.save(quotation) as unknown as Quotation;

    let total = 0;
    for (const item of items) {
      const discount   = item.discountRate || 0;
      const totalPrice = item.unitPrice * item.quantity * (1 - discount / 100);
      total += totalPrice;
      await this.itemRepo.save(this.itemRepo.create({ ...item, quotationId: (saved as any).id, totalPrice }));
    }

    const discountedTotal = total * (1 - (quotData.discountRate || 0) / 100);
    await this.quotRepo.update((saved as any).id, { totalAmount: discountedTotal });

    await this.auditService.log({
      userId,
      action: 'QUOTATION_CREATED',
      entityType: 'Quotation',
      entityId: (saved as any).id,
      newValues: { quoteNumber, customerId: data.customerId },
    });
    return this.findOne((saved as any).id);
  }

  async findAll(
    filters: { status?: string; customerId?: string; companyId?: string },
    pagination: PaginationDto,
  ): Promise<PaginatedResult<Quotation>> {
    const qb = this.quotRepo.createQueryBuilder('q').leftJoinAndSelect('q.items', 'items');

    // Tenant isolation
    if (filters.companyId) {
      qb.innerJoin('customers', 'cust', 'cust.id = q.customerId')
        .andWhere('cust.companyId = :companyId', { companyId: filters.companyId });
    }

    if (filters.status)     qb.andWhere('q.status = :status', { status: filters.status });
    if (filters.customerId) qb.andWhere('q.customerId = :cid', { cid: filters.customerId });
    qb.orderBy('q.createdAt', 'DESC').skip(pagination.skip).take(pagination.limit);
    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<Quotation> {
    const q = await this.quotRepo.findOne({ where: { id }, relations: ['items'] });
    if (!q) throw new NotFoundException('Teklif bulunamadı');
    return q;
  }

  async update(id: string, data: any, userId: string): Promise<Quotation> {
    await this.quotRepo.update(id, data);
    await this.auditService.log({ userId, action: 'QUOTATION_UPDATED', entityType: 'Quotation', entityId: id, newValues: data });
    return this.findOne(id);
  }

  async send(id: string, userId: string): Promise<Quotation> {
    await this.quotRepo.update(id, { status: QuotationStatus.SENT, sentAt: new Date() });
    await this.auditService.log({ userId, action: 'QUOTATION_SENT', entityType: 'Quotation', entityId: id });
    return this.findOne(id);
  }

  async accept(id: string, userId: string): Promise<Quotation> {
    await this.quotRepo.update(id, { status: QuotationStatus.ACCEPTED, acceptedAt: new Date() });
    await this.auditService.log({ userId, action: 'QUOTATION_ACCEPTED', entityType: 'Quotation', entityId: id });
    return this.findOne(id);
  }

  async reject(id: string, reason: string, userId: string): Promise<Quotation> {
    await this.quotRepo.update(id, { status: QuotationStatus.REJECTED, rejectedAt: new Date(), rejectionReason: reason });
    await this.auditService.log({ userId, action: 'QUOTATION_REJECTED', entityType: 'Quotation', entityId: id, newValues: { reason } });
    return this.findOne(id);
  }

  async generatePdf(id: string): Promise<Buffer> {
    const quotation = await this.findOne(id);
    const items = quotation.items || [];

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const page = pdfDoc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();
    let y = height - 50;
    const leftMargin = 50;

    // ─── Company Header ───
    page.drawText('PerKont Periyodik Kontrol', {
      x: leftMargin, y, size: 18, font: fontBold, color: rgb(0.1, 0.1, 0.5),
    });
    y -= 30;

    // ─── Quotation Info ───
    page.drawText(`Teklif No: ${quotation.quoteNumber}`, { x: leftMargin, y, size: 11, font: fontBold });
    y -= 18;
    page.drawText(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`, { x: leftMargin, y, size: 10, font });
    y -= 15;
    page.drawText(`Geçerlilik: ${quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString('tr-TR') : '-'}`, {
      x: leftMargin, y, size: 10, font,
    });
    y -= 15;
    page.drawText(`Müşteri ID: ${quotation.customerId}`, { x: leftMargin, y, size: 10, font });
    y -= 15;
    page.drawText(`Para Birimi: ${quotation.currency}`, { x: leftMargin, y, size: 10, font });
    y -= 25;

    // ─── Items Table Header ───
    const colX = { desc: leftMargin, qty: 280, unit: 330, disc: 400, total: 470 };
    page.drawRectangle({ x: leftMargin - 5, y: y - 5, width: width - 2 * leftMargin + 10, height: 20, color: rgb(0.9, 0.9, 0.95) });
    page.drawText('Açıklama', { x: colX.desc, y, size: 9, font: fontBold });
    page.drawText('Adet', { x: colX.qty, y, size: 9, font: fontBold });
    page.drawText('Birim Fiyat', { x: colX.unit, y, size: 9, font: fontBold });
    page.drawText('İndirim%', { x: colX.disc, y, size: 9, font: fontBold });
    page.drawText('Toplam', { x: colX.total, y, size: 9, font: fontBold });
    y -= 20;

    // ─── Items Rows ───
    for (const item of items) {
      if (y < 100) {
        // New page if needed
        const newPage = pdfDoc.addPage([595, 842]);
        y = newPage.getSize().height - 50;
      }
      const desc = (item.description || '').substring(0, 40);
      page.drawText(desc, { x: colX.desc, y, size: 9, font });
      page.drawText(String(item.quantity), { x: colX.qty, y, size: 9, font });
      page.drawText(Number(item.unitPrice).toFixed(2), { x: colX.unit, y, size: 9, font });
      page.drawText(`${Number(item.discountRate).toFixed(1)}%`, { x: colX.disc, y, size: 9, font });
      page.drawText(Number(item.totalPrice).toFixed(2), { x: colX.total, y, size: 9, font });
      y -= 16;
    }

    y -= 10;
    // ─── Totals ───
    page.drawLine({ start: { x: leftMargin, y: y + 5 }, end: { x: width - leftMargin, y: y + 5 }, thickness: 0.5 });
    y -= 10;

    const discountRate = Number(quotation.discountRate) || 0;
    const itemsTotal = items.reduce((sum, item) => sum + Number(item.totalPrice), 0);
    const discountAmount = itemsTotal * (discountRate / 100);
    const finalAmount = Number(quotation.totalAmount);

    page.drawText(`Ara Toplam: ${itemsTotal.toFixed(2)} ${quotation.currency}`, { x: colX.total - 80, y, size: 10, font });
    y -= 16;
    if (discountRate > 0) {
      page.drawText(`Genel İndirim (${discountRate}%): -${discountAmount.toFixed(2)} ${quotation.currency}`, { x: colX.total - 80, y, size: 10, font });
      y -= 16;
    }
    page.drawText(`Genel Toplam: ${finalAmount.toFixed(2)} ${quotation.currency}`, { x: colX.total - 80, y, size: 12, font: fontBold });
    y -= 25;

    // ─── Notes ───
    if (quotation.notes) {
      page.drawText('Notlar:', { x: leftMargin, y, size: 10, font: fontBold });
      y -= 15;
      const noteLines = quotation.notes.match(/.{1,80}/g) || [quotation.notes];
      for (const line of noteLines) {
        page.drawText(line, { x: leftMargin, y, size: 9, font });
        y -= 14;
      }
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }
}
