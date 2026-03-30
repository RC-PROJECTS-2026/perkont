import { Injectable, OnModuleInit } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DocumentRenderService implements OnModuleInit {
  private turkishFontBytes: Buffer | null = null;
  private turkishFontBoldBytes: Buffer | null = null;

  async onModuleInit() {
    // Türkçe font dosyalarını yükle (NotoSans — ı, ğ, ü, ş, ö, ç destekli)
    try {
      const assetsDir = path.join(__dirname, '..', '..', 'assets');
      const regularPath = path.join(assetsDir, 'NotoSans-Regular.ttf');
      const boldPath = path.join(assetsDir, 'NotoSans-Bold.ttf');

      if (fs.existsSync(regularPath)) {
        this.turkishFontBytes = fs.readFileSync(regularPath);
        console.log('[DocumentRender] Türkçe font yüklendi: NotoSans-Regular.ttf');
      }
      if (fs.existsSync(boldPath)) {
        this.turkishFontBoldBytes = fs.readFileSync(boldPath);
        console.log('[DocumentRender] Türkçe bold font yüklendi: NotoSans-Bold.ttf');
      }

      if (!this.turkishFontBytes) {
        console.warn('[DocumentRender] Türkçe font dosyası bulunamadı, StandardFonts kullanılacak (Türkçe karakter desteği sınırlı)');
      }
    } catch (e) {
      console.warn('[DocumentRender] Font yükleme hatası:', e.message);
    }
  }

  /**
   * PDF'e Türkçe destekli font embed et
   */
  private async embedFonts(pdfDoc: PDFDocument): Promise<{ normal: PDFFont; bold: PDFFont }> {
    if (this.turkishFontBytes) {
      pdfDoc.registerFontkit(fontkit);
      const normal = await pdfDoc.embedFont(this.turkishFontBytes, { subset: true });
      const bold = this.turkishFontBoldBytes
        ? await pdfDoc.embedFont(this.turkishFontBoldBytes, { subset: true })
        : normal;
      return { normal, bold };
    }
    // Fallback — Türkçe karakter desteği yok
    return {
      normal: await pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    };
  }

  /**
   * Render data onto an uploaded PDF template using coordinate-based field mapping
   */
  async renderWithTemplate(
    templatePdfBuffer: Buffer | null,
    fields: Array<{
      fieldKey: string;
      label: string;
      fieldType: string;
      pdfCoordinate?: { page: number; x: number; y: number; width?: number; height?: number; fontSize?: number };
      isConditional?: boolean;
      conditionRule?: { field: string; operator: string; value: any };
      isRepeatable?: boolean;
      tableColumns?: Array<{ label: string; x: number; width: number }>;
    }>,
    values: Record<string, any>,
    options?: { title?: string; companyName?: string },
  ): Promise<{ buffer: Buffer; hash: string }> {
    let pdfDoc: PDFDocument;

    if (templatePdfBuffer) {
      pdfDoc = await PDFDocument.load(templatePdfBuffer);
    } else {
      pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([595, 842]);
    }

    const { normal: normalFont, bold: boldFont } = await this.embedFonts(pdfDoc);
    const pages = pdfDoc.getPages();

    for (const field of fields) {
      if (!field.pdfCoordinate) continue;

      const { page: pageNum, x, y, width, height, fontSize = 10 } = field.pdfCoordinate;
      const pageIndex = (pageNum || 1) - 1;
      if (pageIndex >= pages.length) continue;

      const page = pages[pageIndex];
      const value = values[field.fieldKey];

      // Conditional field check
      if (field.isConditional && field.conditionRule) {
        if (!this.evaluateCondition(field.conditionRule, values)) continue;
      }

      if (value === null || value === undefined) continue;

      switch (field.fieldType) {
        case 'text':
        case 'currency':
        case 'number':
        case 'date':
          const textValue = field.fieldType === 'currency'
            ? this.formatCurrency(value)
            : String(value);
          this.drawTextOnPage(page, textValue, x, y, {
            font: normalFont, fontSize, maxWidth: width || 200,
          });
          break;

        case 'table':
          if (Array.isArray(value) && field.tableColumns) {
            this.drawTable(page, pdfDoc, value, field.tableColumns, x, y, {
              normalFont, boldFont, fontSize: fontSize - 1,
              rowHeight: 16, headerBg: true,
            });
          }
          break;

        case 'image':
        case 'signature':
          if (value && typeof value === 'string') {
            try {
              const imgBytes = Buffer.from(value.replace(/^data:image\/\w+;base64,/, ''), 'base64');
              const img = await pdfDoc.embedJpg(imgBytes).catch(() => pdfDoc.embedPng(imgBytes));
              page.drawImage(img, { x, y, width: width || 150, height: height || 60 });
            } catch { /* skip invalid images */ }
          }
          break;

        case 'select':
        case 'conditional':
          this.drawTextOnPage(page, String(value), x, y, { font: normalFont, fontSize });
          break;
      }
    }

    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    return { buffer, hash };
  }

  /**
   * Generate a programmatic PDF with Turkish font support
   */
  async renderProgrammatic(data: {
    title: string;
    documentNumber: string;
    date: string;
    customer: { name: string; address?: string; taxNumber?: string; contactName?: string; phone?: string; email?: string };
    items?: Array<{ description: string; quantity: number; unitPrice: number; discountRate?: number; totalPrice: number }>;
    totals?: { subtotal: number; discount?: number; kdv?: number; grandTotal: number; currency?: string };
    notes?: string;
    footer?: string;
    signatureZones?: Array<{ label: string; x: number; y: number }>;
  }): Promise<{ buffer: Buffer; hash: string }> {
    const pdfDoc = await PDFDocument.create();
    const { normal: font, bold: fontBold } = await this.embedFonts(pdfDoc);
    let page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();
    let currentY = height - 50;
    const left = 50;
    const currency = data.totals?.currency || 'TL';

    const drawText = (text: string, x: number, y: number, opts: any = {}) => {
      const safeText = text || '';
      page.drawText(safeText, {
        x, y, size: opts.size || 10, font: opts.bold ? fontBold : font,
        color: opts.color || rgb(0.1, 0.1, 0.1), maxWidth: opts.maxWidth,
      });
    };

    const checkPageBreak = (needed: number) => {
      if (currentY < needed + 60) {
        page = pdfDoc.addPage([595, 842]);
        currentY = height - 50;
      }
    };

    // Title
    drawText(data.title, left, currentY, { size: 16, bold: true, color: rgb(0.05, 0.45, 0.4) });
    currentY -= 25;
    drawText(`No: ${data.documentNumber}`, left, currentY, { size: 11, bold: true });
    drawText(`Tarih: ${data.date}`, 350, currentY, { size: 10 });
    currentY -= 30;

    // Customer info
    page.drawRectangle({ x: left - 5, y: currentY - 5, width: width - 100, height: 80, color: rgb(0.95, 0.97, 0.97), borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5 });
    drawText('Müşteri Bilgileri', left, currentY + 55, { size: 9, bold: true, color: rgb(0.4, 0.4, 0.4) });
    drawText(data.customer.name, left, currentY + 40, { size: 11, bold: true });
    if (data.customer.address) drawText(data.customer.address.substring(0, 80), left, currentY + 25, { size: 9, maxWidth: 400 });
    if (data.customer.contactName) drawText(`Yetkili: ${data.customer.contactName}`, left, currentY + 10, { size: 9 });
    if (data.customer.phone) drawText(`Tel: ${data.customer.phone}`, 300, currentY + 10, { size: 9 });
    if (data.customer.taxNumber) drawText(`VN: ${data.customer.taxNumber}`, left, currentY - 5, { size: 9 });
    currentY -= 100;

    // Items table
    if (data.items && data.items.length > 0) {
      drawText('Hizmet / Ekipman Kalemleri', left, currentY, { size: 11, bold: true });
      currentY -= 20;

      const cols = { no: left, desc: left + 30, qty: 320, price: 370, disc: 430, total: 480 };
      page.drawRectangle({ x: left - 5, y: currentY - 5, width: width - 100, height: 18, color: rgb(0.05, 0.45, 0.4) });
      const hdr = (t: string, x: number) => page.drawText(t, { x, y: currentY, size: 8, font: fontBold, color: rgb(1, 1, 1) });
      hdr('#', cols.no); hdr('Açıklama', cols.desc); hdr('Adet', cols.qty); hdr('Birim Fiyat', cols.price); hdr('İsk.%', cols.disc); hdr('Toplam', cols.total);
      currentY -= 20;

      for (let i = 0; i < data.items.length; i++) {
        checkPageBreak(20);
        const item = data.items[i];
        if (i % 2 === 0) {
          page.drawRectangle({ x: left - 5, y: currentY - 4, width: width - 100, height: 16, color: rgb(0.97, 0.97, 0.97) });
        }
        drawText(String(i + 1), cols.no, currentY, { size: 9 });
        drawText((item.description || '').substring(0, 40), cols.desc, currentY, { size: 9 });
        drawText(String(item.quantity), cols.qty, currentY, { size: 9 });
        drawText(this.formatCurrency(item.unitPrice), cols.price, currentY, { size: 9 });
        drawText(item.discountRate ? `${item.discountRate}%` : '-', cols.disc, currentY, { size: 9 });
        drawText(this.formatCurrency(item.totalPrice), cols.total, currentY, { size: 9, bold: true });
        currentY -= 16;
      }
      currentY -= 10;
    }

    // Totals
    if (data.totals) {
      checkPageBreak(60);
      page.drawLine({ start: { x: 350, y: currentY + 5 }, end: { x: width - 50, y: currentY + 5 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
      currentY -= 5;
      drawText('Ara Toplam:', 370, currentY, { size: 10 }); drawText(`${this.formatCurrency(data.totals.subtotal)} ${currency}`, 480, currentY, { size: 10, bold: true }); currentY -= 16;
      if (data.totals.discount) { drawText('İskonto:', 370, currentY, { size: 10 }); drawText(`-${this.formatCurrency(data.totals.discount)} ${currency}`, 480, currentY, { size: 10 }); currentY -= 16; }
      if (data.totals.kdv) { drawText('KDV:', 370, currentY, { size: 10 }); drawText(`${this.formatCurrency(data.totals.kdv)} ${currency}`, 480, currentY, { size: 10 }); currentY -= 16; }
      page.drawLine({ start: { x: 350, y: currentY + 5 }, end: { x: width - 50, y: currentY + 5 }, thickness: 1, color: rgb(0.05, 0.45, 0.4) });
      currentY -= 5;
      drawText('GENEL TOPLAM:', 370, currentY, { size: 12, bold: true }); drawText(`${this.formatCurrency(data.totals.grandTotal)} ${currency}`, 470, currentY, { size: 12, bold: true, color: rgb(0.05, 0.45, 0.4) }); currentY -= 25;
    }

    // Notes
    if (data.notes) {
      checkPageBreak(60);
      drawText('Notlar:', left, currentY, { size: 10, bold: true }); currentY -= 15;
      const lines = data.notes.match(/.{1,90}/g) || [data.notes];
      for (const line of lines.slice(0, 5)) { drawText(line, left, currentY, { size: 9 }); currentY -= 14; }
    }

    // Signature zones
    if (data.signatureZones) {
      checkPageBreak(80);
      currentY -= 20;
      for (const zone of data.signatureZones) {
        drawText(zone.label, zone.x, currentY, { size: 9, bold: true });
        page.drawLine({ start: { x: zone.x, y: currentY - 40 }, end: { x: zone.x + 150, y: currentY - 40 }, thickness: 0.5 });
        drawText('İmza / Kaşe', zone.x + 40, currentY - 50, { size: 7, color: rgb(0.5, 0.5, 0.5) });
      }
    }

    // Footer
    if (data.footer) {
      drawText(data.footer, left, 30, { size: 8, color: rgb(0.5, 0.5, 0.5) });
    }

    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    return { buffer, hash };
  }

  // ── HELPERS ──

  private drawTextOnPage(page: PDFPage, text: string, x: number, y: number, opts: { font: PDFFont; fontSize: number; maxWidth?: number; color?: any }) {
    page.drawText(text || '', {
      x, y, size: opts.fontSize, font: opts.font,
      color: opts.color || rgb(0, 0, 0),
      maxWidth: opts.maxWidth,
    });
  }

  private drawTable(
    page: PDFPage, pdfDoc: PDFDocument,
    rows: any[], columns: Array<{ label: string; x: number; width: number }>,
    startX: number, startY: number,
    opts: { normalFont: PDFFont; boldFont: PDFFont; fontSize: number; rowHeight: number; headerBg?: boolean },
  ) {
    let y = startY;
    if (opts.headerBg) {
      page.drawRectangle({ x: startX - 2, y: y - 4, width: 500, height: opts.rowHeight, color: rgb(0.9, 0.92, 0.94) });
    }
    for (const col of columns) {
      page.drawText(col.label, { x: col.x, y, size: opts.fontSize, font: opts.boldFont });
    }
    y -= opts.rowHeight;

    for (const row of rows) {
      for (const col of columns) {
        const val = row[col.label] || row[col.label.toLowerCase()] || '';
        page.drawText(String(val).substring(0, 40), {
          x: col.x, y, size: opts.fontSize, font: opts.normalFont,
        });
      }
      y -= opts.rowHeight;
    }
  }

  private evaluateCondition(rule: { field: string; operator: string; value: any }, values: Record<string, any>): boolean {
    const fieldValue = values[rule.field];
    switch (rule.operator) {
      case 'eq': return fieldValue === rule.value;
      case 'neq': return fieldValue !== rule.value;
      case 'gt': return Number(fieldValue) > Number(rule.value);
      case 'lt': return Number(fieldValue) < Number(rule.value);
      case 'contains': return String(fieldValue || '').includes(String(rule.value));
      case 'exists': return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
      case 'not_exists': return !fieldValue;
      default: return true;
    }
  }

  private formatCurrency(value: any): string {
    const num = Number(value) || 0;
    return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
