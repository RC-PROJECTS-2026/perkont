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
      // 1. Şablon PDF'i yükle (varsa overlay, yoksa boş sayfa)
      let pdfDoc: PDFDocument;
      if (formTemplate.outputTemplateUrl) {
        try {
          const templateBytes = await this.storageService.getFileByUrl(formTemplate.outputTemplateUrl);
          pdfDoc = await PDFDocument.load(templateBytes);
        } catch {
          pdfDoc = await PDFDocument.create();
          pdfDoc.addPage([595, 842]); // A4 fallback
        }
      } else {
        pdfDoc = await PDFDocument.create();
        pdfDoc.addPage([595, 842]); // A4 — şablon PDF henüz yüklenmemiş
      }

      // 2. Türkçe font hazırla
      const { normal: helvetica, bold: helveticaBold } = await this.embedFonts(pdfDoc);

      // 3. Alan değerlerini index'e al
      const fieldValueMap = this.buildFieldValueMap(inspection.fieldValues);

      // 4. Her alanı PDF üzerine çiz
      for (const field of formTemplate.fields) {
        if (!field.pdfCoordinate) continue;

        // Koşullu alan — koşul sağlanmıyorsa atla
        if (field.isConditional && !this.evaluateCondition(field.conditionRule, fieldValueMap)) {
          continue;
        }

        const value = fieldValueMap[field.fieldKey] ?? additionalData[field.dbMapping || ''];
        if (value === undefined || value === null) continue;

        const page = pdfDoc.getPages()[field.pdfCoordinate.page - 1];
        if (!page) continue;

        await this.drawField(page, pdfDoc, field, value, helvetica, helveticaBold);
      }

      // 5. Rapor numarası, tarih, QR kodu ekle
      await this.addReportMeta(pdfDoc, reportNumber);

      // 6. Doğrulama QR kodu
      const verifyUrl = `${this.configService.get('REPORT_VERIFY_BASE_URL')}/report/${reportNumber}`;
      await this.addQrCode(pdfDoc, verifyUrl);

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

  // ─── Alan tiplerine göre çizim ────────────────────────────────────────────
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
