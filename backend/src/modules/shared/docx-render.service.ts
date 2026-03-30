import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DocxRenderService {

  /**
   * DOCX şablonuna veri basarak yeni DOCX oluştur
   * docx-templates kütüphanesi kullanılır
   */
  async renderDocx(
    templatePath: string,
    data: Record<string, any>,
  ): Promise<{ buffer: Buffer; hash: string }> {
    const { createReport } = await import('docx-templates');

    const templateBuffer = fs.readFileSync(templatePath);

    const buffer = await createReport({
      template: templateBuffer,
      data,
      cmdDelimiter: ['{', '}'],
      processLineBreaks: true,
      failFast: false,
    });

    const resultBuffer = Buffer.from(buffer);
    const hash = crypto.createHash('sha256').update(resultBuffer).digest('hex');
    return { buffer: resultBuffer, hash };
  }

  /**
   * Teklif/Sözleşme verilerini şablon değişkenlerine dönüştür
   */
  buildProposalData(proposal: any, customer: any, items: any[]): Record<string, any> {
    // Ekipman tablosu
    const equipmentRows = items.map((item: any, idx: number) => ({
      no: idx + 1,
      ekipman_tipi: item.description || '',
      adet: item.quantity || 0,
      birim_fiyat: this.formatCurrency(item.unitPrice),
      iskonto_orani: item.discountRate ? `%${item.discountRate}` : '-',
      iskonto: item.discountRate ? this.formatCurrency(item.unitPrice * item.quantity * item.discountRate / 100) : '-',
      net_tutar: this.formatCurrency(item.unitPrice * item.quantity * (1 - (item.discountRate || 0) / 100)),
      toplam_tutar: this.formatCurrency(item.totalPrice),
    }));

    const subtotal = items.reduce((s: number, i: any) => s + Number(i.totalPrice || 0), 0);
    const discountAmount = Number(proposal.discountAmount) || 0;
    const araTotal = subtotal - discountAmount;
    const kdvRate = Number(proposal.kdvRate) || 20;
    const kdvAmount = proposal.kdvIncluded ? 0 : araTotal * kdvRate / 100;
    const grandTotal = araTotal + kdvAmount;

    return {
      // Müşteri bilgileri
      firma_ismi: customer?.name || '',
      firma_adresi: customer?.address || '',
      yetkili: customer?.contactName || '',
      muayene_adresi: customer?.address || '',
      tel_fax_mail: [customer?.contactPhone, customer?.contactEmail].filter(Boolean).join(' / '),
      vergi_dairesi_no: [customer?.taxOffice, customer?.taxNumber].filter(Boolean).join(' / '),

      // Teklif bilgileri
      teklif_no: proposal.proposalNumber || '',
      teklif_tarihi: new Date().toLocaleDateString('tr-TR'),
      gecerlilik_suresi: proposal.validUntil ? new Date(proposal.validUntil).toLocaleDateString('tr-TR') : '30 gün',
      revizyon: `v${proposal.revision || 1}`,

      // Ekipman tablosu
      ekipmanlar: equipmentRows,

      // Fiyat özeti
      hizmet_bedeli: this.formatCurrency(subtotal),
      indirim_orani: proposal.discountRate ? `%${proposal.discountRate}` : '-',
      indirim: this.formatCurrency(discountAmount),
      ara_toplam: this.formatCurrency(araTotal),
      kdv_orani: `%${kdvRate}`,
      kdv: this.formatCurrency(kdvAmount),
      toplam: this.formatCurrency(grandTotal),

      // Notlar
      notlar: proposal.notes || '',
      il: customer?.city || '',

      // İmza alanları
      royalcert_adi: '',
      royalcert_gorevi: '',
      musteri_adi: customer?.contactName || '',
      musteri_gorevi: '',
    };
  }

  private formatCurrency(value: any): string {
    const num = Number(value) || 0;
    return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
  }
}
