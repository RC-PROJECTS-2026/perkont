import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument, StandardFonts, rgb, degrees, PDFFont } from 'pdf-lib';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fontkit = require('@pdf-lib/fontkit');
import * as crypto from 'crypto';
import * as qrcode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { StorageService, StorageBucket } from '@/modules/storage/storage.service';
import { FormTemplate, FormField, FieldType } from '@/modules/form-templates/entities/form-template.entity';
import { Inspection, InspectionFieldValue } from '@/modules/inspections/entities/inspection.entity';

export interface GeneratedPdf {
  buffer: Buffer;
  hash: string;
}

@Injectable()
export class PdfEngineService implements OnModuleInit {
  private turkishFontBytes: Buffer | null = null;
  private turkishBoldBytes: Buffer | null = null;

  async onModuleInit() {
    try {
      const assetsDir = path.join(__dirname, '..', '..', 'assets');
      const regularPath = path.join(assetsDir, 'NotoSans-Regular.ttf');
      const boldPath = path.join(assetsDir, 'NotoSans-Bold.ttf');
      if (fs.existsSync(regularPath)) {
        this.turkishFontBytes = fs.readFileSync(regularPath);
        console.log(`[PdfEngine] Türkçe font yüklendi: ${regularPath}`);
      } else {
        console.warn(`[PdfEngine] Font bulunamadı: ${regularPath}`);
      }
      if (fs.existsSync(boldPath)) {
        this.turkishBoldBytes = fs.readFileSync(boldPath);
      }
    } catch (e) {
      console.warn(`[PdfEngine] Font yükleme hatası: ${e.message}`);
    }
  }

  private async embedFonts(pdfDoc: PDFDocument): Promise<{ normal: PDFFont; bold: PDFFont }> {
    if (this.turkishFontBytes) {
      pdfDoc.registerFontkit(fontkit);
      const normal = await pdfDoc.embedFont(this.turkishFontBytes, { subset: true });
      const bold = this.turkishBoldBytes ? await pdfDoc.embedFont(this.turkishBoldBytes, { subset: true }) : normal;
      return { normal, bold };
    }
    return { normal: await pdfDoc.embedFont(StandardFonts.Helvetica), bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold) };
  }

  constructor(
    private configService: ConfigService,
    private storageService: StorageService,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
  ) {}

  // ─── Ana PDF üretim metodu ────────────────────────────────────────────────
  async generateInspectionReport(
    inspection: Inspection,
    formTemplate: FormTemplate,
    reportNumber: string,
    additionalData: Record<string, any> = {},
  ): Promise<GeneratedPdf> {
    try {
      // 1. Sablon PDF yukle (varsa overlay)
      let pdfDoc: PDFDocument;
      let useOverlay = false;

      if (formTemplate.outputTemplateUrl) {
        try {
          const templateBytes = await this.storageService.getFileByUrl(formTemplate.outputTemplateUrl);
          pdfDoc = await PDFDocument.load(templateBytes);
          useOverlay = true;
        } catch {
          pdfDoc = await PDFDocument.create();
        }
      } else {
        pdfDoc = await PDFDocument.create();
      }

      // 2. Turkce font hazirla
      const { normal: helvetica, bold: helveticaBold } = await this.embedFonts(pdfDoc);

      // 3. Alan degerlerini indexe al
      const fieldValueMap = this.buildFieldValueMap(inspection.fieldValues);

      if (useOverlay) {
        // ── OVERLAY MODU: Template PDF uzerine yaz ──
        for (const field of formTemplate.fields) {
          if (!field.pdfCoordinate) continue;
          if (field.isConditional && !this.evaluateCondition(field.conditionRule, fieldValueMap)) continue;
          const value = fieldValueMap[field.fieldKey] ?? additionalData[field.dbMapping || ''];
          if (value === undefined || value === null) continue;
          const page = pdfDoc.getPages()[field.pdfCoordinate.page - 1];
          if (!page) continue;
          await this.drawField(page, pdfDoc, field, value, helvetica, helveticaBold);
        }
      } else {
        // ── PROGRAMATIK MODU: DOCX benzeri tablo PDF uret ──
        await this.generateStructuredReport(pdfDoc, formTemplate, fieldValueMap, additionalData, reportNumber, helvetica, helveticaBold);
      }

      // 5. Meta ve QR: sadece programatik modda ekle (overlay modda template kendi basligini iceriyor)
      if (!useOverlay) {
        await this.addReportMeta(pdfDoc, reportNumber);
        const verifyUrl = `${this.configService.get('REPORT_VERIFY_BASE_URL')}/report/${reportNumber}`;
        await this.addQrCode(pdfDoc, verifyUrl);
      }

      // 7. Üret ve hash hesapla
      const pdfBytes = await pdfDoc.save();
      const buffer = Buffer.from(pdfBytes);
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');

      return { buffer, hash };
    } catch (error) {
      this.logger.error(`PDF üretim hatası: ${error.message}`, {
        inspectionId: inspection.id,
        templateId: formTemplate.id,
        error: error.stack,
      });
      throw error;
    }
  }

  // ─── Programatik PDF uretimi (DOCX benzeri) ───────────────────────────────
  private async generateStructuredReport(
    pdfDoc: PDFDocument,
    formTemplate: FormTemplate,
    fieldValueMap: Record<string, any>,
    additionalData: Record<string, any>,
    reportNumber: string,
    normalFont: PDFFont,
    boldFont: PDFFont,
  ): Promise<void> {
    const W = 595; // A4 width
    const H = 842; // A4 height
    const M = 40;  // margin
    const CW = W - M * 2; // content width
    const blue = rgb(0.15, 0.25, 0.45);
    const white = rgb(1, 1, 1);
    const black = rgb(0, 0, 0);
    const gray = rgb(0.4, 0.4, 0.4);
    const lightGray = rgb(0.92, 0.92, 0.92);
    const greenC = rgb(0, 0.5, 0);
    const redC = rgb(0.75, 0, 0);

    let page = pdfDoc.addPage([W, H]);
    let y = H - M;

    const newPage = () => { page = pdfDoc.addPage([W, H]); y = H - M; };
    const checkSpace = (need: number) => { if (y - need < 50) newPage(); };

    // ── BASLIK ──
    // Ust cizgi
    page.drawRectangle({ x: M, y: y - 5, width: CW, height: 3, color: blue });
    y -= 25;
    // Firma adi
    page.drawText(this.safeText('ROYALCERT BELGELENDIRME VE GOZETIM HIZMETLERI A.S.'), {
      x: M, y, size: 7, font: normalFont, color: gray,
    });
    y -= 20;
    // Rapor basligi
    const title = formTemplate.name.replace(/^RC-M-[A-Za-z\u0130\u00e7\u011f\u0131\u00f6\u015f\u00fc]+-FR\d+[_\d]*\s*/, '').trim() || formTemplate.name;
    page.drawText(this.safeText(title), { x: M, y, size: 14, font: boldFont, color: blue, maxWidth: CW });
    y -= 18;
    // Alt bilgi
    page.drawText(this.safeText(`Rapor No: ${reportNumber}  |  Revizyon: ${formTemplate.revision}  |  Tarih: ${new Date().toLocaleDateString('tr-TR')}`), {
      x: M, y, size: 8, font: normalFont, color: gray,
    });
    y -= 5;
    page.drawRectangle({ x: M, y, width: CW, height: 1, color: blue });
    y -= 20;

    // ── BOLUM VE ALANLAR ──
    const sortedFields = [...(formTemplate.fields || [])].sort((a, b) => a.orderIndex - b.orderIndex);

    for (const field of sortedFields) {
      const ft = (field.fieldType || '').toLowerCase();

      // SECTION_HEADER
      if (ft === 'section_header') {
        checkSpace(30);
        y -= 8;
        page.drawRectangle({ x: M, y: y - 2, width: CW, height: 18, color: blue });
        page.drawText(this.safeText(field.label), { x: M + 6, y: y + 2, size: 9, font: boldFont, color: white, maxWidth: CW - 12 });
        y -= 22;
        continue;
      }

      // Normal alan
      const value = fieldValueMap[field.fieldKey] ?? additionalData[field.dbMapping || ''] ?? '';
      const displayValue = this.formatDisplayValue(value, ft);
      const ROW_H = 16;
      const LABEL_W = CW * 0.4;
      const VALUE_W = CW * 0.6;

      checkSpace(ROW_H + 2);

      // Label arka plan
      page.drawRectangle({ x: M, y: y - ROW_H + 4, width: LABEL_W, height: ROW_H, color: lightGray });
      // Cizgiler
      page.drawRectangle({ x: M, y: y - ROW_H + 4, width: CW, height: ROW_H, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
      page.drawLine({ start: { x: M + LABEL_W, y: y + 4 }, end: { x: M + LABEL_W, y: y - ROW_H + 4 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });

      // Label
      page.drawText(this.safeText(field.label.substring(0, 50)), { x: M + 4, y: y - 5, size: 7.5, font: boldFont, color: black, maxWidth: LABEL_W - 8 });

      // Value (renk: check_item icin ozel)
      let valColor = black;
      if (ft === 'check_item' || ft === 'boolean') {
        if (String(value).toLowerCase().includes('uygun') && !String(value).toLowerCase().includes('uygunsuz')) valColor = greenC;
        else if (String(value).toLowerCase().includes('uygunsuz')) valColor = redC;
      }
      page.drawText(this.safeText(displayValue.substring(0, 60)), { x: M + LABEL_W + 4, y: y - 5, size: 7.5, font: normalFont, color: valColor, maxWidth: VALUE_W - 8 });

      y -= ROW_H;
    }

    // ── SONUC KUTUSU ──
    checkSpace(50);
    y -= 15;
    page.drawRectangle({ x: M, y: y - 30, width: CW, height: 35, color: rgb(0.95, 0.98, 0.95), borderColor: greenC, borderWidth: 1 });
    page.drawText(this.safeText('DENETIM SONUCU'), { x: M + 6, y: y - 5, size: 8, font: boldFont, color: blue });
    const result = fieldValueMap['overall_result'] || additionalData['overallResult'] || 'Uygun';
    page.drawText(this.safeText(String(result).toUpperCase()), { x: M + 6, y: y - 20, size: 12, font: boldFont, color: greenC });
  }

  private formatDisplayValue(value: any, fieldType: string): string {
    if (value === null || value === undefined || value === '') return '-';
    if (value === true || value === 'true') return 'Evet';
    if (value === false || value === 'false') return 'Hayir';
    if (fieldType === 'date') {
      try { return new Date(value).toLocaleDateString('tr-TR'); } catch { return String(value); }
    }
    return this.safeText(String(value));
  }

  /** Turkce karakterleri ASCII'ye donusturur (StandardFonts kullanilirken) */
  private safeText(s: string): string {
    if (this.turkishFontBytes) return s; // Turkce font varsa dokunma
    return s
      .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
      .replace(/ü/g, 'u').replace(/Ü/g, 'U')
      .replace(/ş/g, 's').replace(/Ş/g, 'S')
      .replace(/ı/g, 'i').replace(/İ/g, 'I')
      .replace(/ö/g, 'o').replace(/Ö/g, 'O')
      .replace(/ç/g, 'c').replace(/Ç/g, 'C')
      .replace(/[^\x00-\x7F]/g, '?'); // Diger non-ASCII -> ?
  }

  // ─── Alan tiplerine gore cizim ────────────────────────────────────────────
  private async drawField(
    page: any,
    pdfDoc: PDFDocument,
    field: FormField,
    value: any,
    normalFont: any,
    boldFont: any,
  ): Promise<void> {
    const { x, y, width, height, fontSize = 10, align = 'left' } = field.pdfCoordinate;

    switch (field.fieldType) {
      case FieldType.TEXT:
      case FieldType.TEXTAREA:
      case FieldType.NUMBER:
        page.drawText(this.formatValue(value, field), {
          x,
          y,
          size: fontSize,
          font: normalFont,
          color: rgb(0, 0, 0),
          maxWidth: width || 200,
        });
        break;

      case FieldType.DATE:
        const dateStr = value
          ? new Date(value).toLocaleDateString('tr-TR')
          : '';
        page.drawText(dateStr, { x, y, size: fontSize, font: normalFont, color: rgb(0, 0, 0) });
        break;

      case FieldType.BOOLEAN:
        // Checkbox işareti
        const checkMark = value === true || value === 'true' || value === 'Uygun' ? '✓' : '✗';
        page.drawText(checkMark, {
          x,
          y,
          size: fontSize + 2,
          font: boldFont,
          color: value ? rgb(0, 0.5, 0) : rgb(0.8, 0, 0),
        });
        break;

      case FieldType.SELECT:
        page.drawText(String(value), { x, y, size: fontSize, font: normalFont, color: rgb(0, 0, 0) });
        break;

      case FieldType.CHECK_ITEM:
        // Uygun / Uygunsuz / Uygulanamaz
        const resultColors: Record<string, any> = {
          Uygun: rgb(0, 0.5, 0),
          uygun: rgb(0, 0.5, 0),
          Uygunsuz: rgb(0.8, 0, 0),
          uygunsuz: rgb(0.8, 0, 0),
          Uygulanamaz: rgb(0.5, 0.5, 0.5),
        };
        page.drawText(String(value), {
          x,
          y,
          size: fontSize,
          font: boldFont,
          color: resultColors[value] || rgb(0, 0, 0),
        });
        break;

      case FieldType.CHECK_MATRIX:
        // Tablo formatında kontrol maddelerini çiz
        await this.drawCheckMatrix(page, pdfDoc, field, value, normalFont, boldFont);
        break;

      case FieldType.PHOTO:
        // Fotoğraf embed
        if (typeof value === 'string' && value.startsWith('http')) {
          try {
            const imgBuffer = await this.storageService.getFileByUrl(value);
            const img = await pdfDoc.embedJpg(imgBuffer);
            page.drawImage(img, {
              x,
              y,
              width: width || 120,
              height: height || 90,
            });
          } catch (e) {
            this.logger.warn(`Fotoğraf embed edilemedi: ${e.message}`);
          }
        }
        break;

      case FieldType.SIGNATURE:
        if (typeof value === 'string' && value.startsWith('data:image')) {
          try {
            const base64Data = value.replace(/^data:image\/\w+;base64,/, '');
            const sigBuffer = Buffer.from(base64Data, 'base64');
            const sigImg = await pdfDoc.embedPng(sigBuffer);
            page.drawImage(sigImg, {
              x,
              y,
              width: width || 180,
              height: height || 60,
            });
          } catch (e) {
            this.logger.warn(`İmza embed edilemedi: ${e.message}`);
          }
        }
        break;
    }
  }

  // ─── Check Matrix (kontrol maddeleri tablosu) ─────────────────────────────
  private async drawCheckMatrix(
    page: any,
    pdfDoc: PDFDocument,
    field: FormField,
    values: Record<string, string>,
    normalFont: any,
    boldFont: any,
  ): Promise<void> {
    if (!field.checkItems || !field.pdfCoordinate) return;

    const grid = field.pdfCoordinate as any;
    const startY = grid.startY || field.pdfCoordinate.y;
    const rowHeight = grid.rowHeight || 18;
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();

    const columns = grid.columns || [
      { label: 'Madde', x: 30, width: 280 },
      { label: 'Uygun', x: 310, width: 50 },
      { label: 'Uygunsuz', x: 360, width: 60 },
      { label: 'Uygulanamaz', x: 420, width: 80 },
    ];

    let currentPage = page;
    let rowY = startY;

    for (let i = 0; i < field.checkItems.length; i++) {
      const item = field.checkItems[i];

      // Page overflow handling: if current Y position is below bottom margin, add new page
      if (rowY < 60) {
        const newPage = pdfDoc.addPage([pageWidth, pageHeight]);
        currentPage = newPage;
        rowY = pageHeight - 50; // Reset Y to top of new page
      }

      const itemValue = values[item.id] || '';

      // Madde açıklaması
      currentPage.drawText(item.label, {
        x: columns[0].x,
        y: rowY,
        size: 8,
        font: normalFont,
        maxWidth: columns[0].width,
        color: rgb(0, 0, 0),
      });

      // Her sonuç sütununa işaret koy
      const resultMap: Record<string, number> = {
        Uygun: 1, uygun: 1, compliant: 1,
        Uygunsuz: 2, uygunsuz: 2, non_compliant: 2,
        Uygulanamaz: 3, uygulanamaz: 3, not_applicable: 3,
      };

      const colIdx = resultMap[itemValue];
      if (colIdx && columns[colIdx]) {
        currentPage.drawText('X', {
          x: columns[colIdx].x + 10,
          y: rowY,
          size: 10,
          font: boldFont,
          color: colIdx === 1 ? rgb(0, 0.5, 0) : colIdx === 2 ? rgb(0.8, 0, 0) : rgb(0.5, 0.5, 0.5),
        });
      }

      rowY -= rowHeight;
    }
  }

  // ─── Rapor meta bilgisi ───────────────────────────────────────────────────
  private async addReportMeta(pdfDoc: PDFDocument, reportNumber: string): Promise<void> {
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { normal: font } = await this.embedFonts(pdfDoc);

    const { width, height } = firstPage.getSize();
    firstPage.drawText(`Rapor No: ${reportNumber}`, {
      x: width - 200, y: height - 30, size: 9, font, color: rgb(0.3, 0.3, 0.3),
    });
    firstPage.drawText(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`, {
      x: width - 200, y: height - 45, size: 9, font, color: rgb(0.3, 0.3, 0.3),
    });
  }

  // ─── QR Doğrulama Kodu ───────────────────────────────────────────────────
  private async addQrCode(pdfDoc: PDFDocument, url: string): Promise<void> {
    const lastPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
    const { width } = lastPage.getSize();

    const qrBuffer = await qrcode.toBuffer(url, { type: 'png', width: 80 });
    const qrImg = await pdfDoc.embedPng(qrBuffer);

    lastPage.drawImage(qrImg, {
      x: width - 100,
      y: 20,
      width: 80,
      height: 80,
    });

    const { normal: font } = await this.embedFonts(pdfDoc);
    lastPage.drawText('Belge Dogrulama', {
      x: width - 103,
      y: 15,
      size: 6,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  // ─── Yardımcı ─────────────────────────────────────────────────────────────
  private buildFieldValueMap(
    fieldValues: InspectionFieldValue[],
  ): Record<string, any> {
    const map: Record<string, any> = {};
    for (const fv of fieldValues || []) {
      map[fv.fieldKey] =
        fv.valueJson ?? fv.valueText ?? fv.valueNumber ?? fv.valueBoolean ?? fv.valueDate;
    }
    return map;
  }

  private evaluateCondition(
    rule: Record<string, any>,
    values: Record<string, any>,
  ): boolean {
    if (!rule) return true;
    const { field, operator, value } = rule;
    const fieldValue = values[field];
    switch (operator) {
      case 'eq': return fieldValue === value;
      case 'neq': return fieldValue !== value;
      case 'contains': return String(fieldValue).includes(value);
      case 'gt': return Number(fieldValue) > Number(value);
      case 'lt': return Number(fieldValue) < Number(value);
      default: return true;
    }
  }

  private formatValue(value: any, field: FormField): string {
    if (value === null || value === undefined) return '';
    if (field.unit) return `${value} ${field.unit}`;
    return String(value);
  }

  // ─── Hash doğrulama ───────────────────────────────────────────────────────
  computeHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  verifyHash(buffer: Buffer, expectedHash: string): boolean {
    return this.computeHash(buffer) === expectedHash;
  }
}
