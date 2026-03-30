import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import axios from 'axios';
import * as crypto from 'crypto';

export interface SignatureResult {
  signedPdfBuffer: Buffer;
  signatureData: {
    signerName: string;
    signerCert: string;
    signTime: string;
    algorithm: string;
    tsaTimestamp?: string;
    provider: string;
  };
  signedHash: string;
}

export interface InitiateSigningResult {
  sessionId: string;
  challengeCode?: string;
  otpSent?: boolean;
  message: string;
}

@Injectable()
export class ESignatureService {
  constructor(
    private configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
  ) {}

  // ─── İmzalama oturumu başlat ─────────────────────────────────────────────
  async initiateSigning(
    pdfBuffer: Buffer,
    signerUserId: string,
    signerPhone: string,
  ): Promise<InitiateSigningResult> {
    const provider = this.configService.get('ESIGN_PROVIDER', 'turktrust');

    try {
      if (provider === 'turktrust') {
        return await this.initiateTurkTrustSigning(pdfBuffer, signerPhone);
      } else if (provider === 'mock') {
        // Geliştirme ortamı için mock
        return {
          sessionId: crypto.randomBytes(16).toString('hex'),
          otpSent: false,
          message: 'Mock imzalama oturumu başlatıldı (geliştirme modu)',
        };
      }
      throw new BadRequestException(`Bilinmeyen e-imza sağlayıcısı: ${provider}`);
    } catch (error) {
      this.logger.error(`E-imza oturumu başlatılamadı: ${error.message}`, {
        signerUserId,
        provider,
      });
      throw error;
    }
  }

  // ─── OTP ile imzalama tamamla ─────────────────────────────────────────────
  async completeSigning(
    sessionId: string,
    otpCode: string,
    pdfBuffer: Buffer,
    signerName: string,
  ): Promise<SignatureResult> {
    const provider = this.configService.get('ESIGN_PROVIDER', 'turktrust');

    try {
      if (provider === 'turktrust') {
        return await this.completeTurkTrustSigning(sessionId, otpCode, pdfBuffer, signerName);
      } else if (provider === 'mock') {
        return this.mockSignPdf(pdfBuffer, signerName);
      }
      throw new BadRequestException(`Bilinmeyen e-imza sağlayıcısı: ${provider}`);
    } catch (error) {
      this.logger.error(`E-imza tamamlanamadı: ${error.message}`, { sessionId });
      throw error;
    }
  }

  // ─── TürkTrust Entegrasyonu ───────────────────────────────────────────────
  private async initiateTurkTrustSigning(
    pdfBuffer: Buffer,
    signerPhone: string,
  ): Promise<InitiateSigningResult> {
    const apiUrl = this.configService.get('ESIGN_API_URL');
    const apiKey = this.configService.get('ESIGN_API_KEY');

    // PDF hash'ini gönder
    const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    const response = await axios.post(
      `${apiUrl}/sign/initiate`,
      {
        documentHash: pdfHash,
        signerPhone,
        signatureType: 'PAdES-B-LT',
        hashAlgorithm: 'SHA256',
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      },
    );

    return {
      sessionId: response.data.sessionId,
      otpSent: true,
      message: `Doğrulama kodu ${signerPhone} numaralı telefona gönderildi`,
    };
  }

  private async completeTurkTrustSigning(
    sessionId: string,
    otpCode: string,
    pdfBuffer: Buffer,
    signerName: string,
  ): Promise<SignatureResult> {
    const apiUrl = this.configService.get('ESIGN_API_URL');
    const apiKey = this.configService.get('ESIGN_API_KEY');

    // PDF'i base64 olarak gönder, imzalı halini al
    const response = await axios.post(
      `${apiUrl}/sign/complete`,
      {
        sessionId,
        otpCode,
        document: pdfBuffer.toString('base64'),
        documentMimeType: 'application/pdf',
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      },
    );

    const signedPdfBuffer = Buffer.from(response.data.signedDocument, 'base64');
    const signedHash = crypto.createHash('sha256').update(signedPdfBuffer).digest('hex');

    return {
      signedPdfBuffer,
      signedHash,
      signatureData: {
        signerName,
        signerCert: response.data.signerCertificate || '',
        signTime: response.data.signTime || new Date().toISOString(),
        algorithm: 'SHA256withRSA',
        tsaTimestamp: response.data.tsaTimestamp,
        provider: 'turktrust',
      },
    };
  }

  // ─── Mock imzalama (development) ─────────────────────────────────────────
  private async mockSignPdf(
    pdfBuffer: Buffer,
    signerName: string,
  ): Promise<SignatureResult> {
    // Gerçek imzalama simüle et — PDF'e metadata ekle
    const pdfDoc = await (await import('pdf-lib')).PDFDocument.load(pdfBuffer);
    pdfDoc.setAuthor(signerName);
    pdfDoc.setCreator('PerKont E-İmza (Mock)');
    pdfDoc.setModificationDate(new Date());

    const signedBytes = await pdfDoc.save();
    const signedPdfBuffer = Buffer.from(signedBytes);
    const signedHash = crypto.createHash('sha256').update(signedPdfBuffer).digest('hex');

    return {
      signedPdfBuffer,
      signedHash,
      signatureData: {
        signerName,
        signerCert: 'MOCK_CERTIFICATE',
        signTime: new Date().toISOString(),
        algorithm: 'SHA256withRSA',
        provider: 'mock',
      },
    };
  }

  // ─── İmza doğrulama ───────────────────────────────────────────────────────
  async verifySignature(
    pdfBuffer: Buffer,
    expectedHash: string,
  ): Promise<{ valid: boolean; details: string }> {
    const currentHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    const valid = currentHash === expectedHash;

    return {
      valid,
      details: valid
        ? 'Belge bütünlüğü doğrulandı'
        : 'UYARI: Belge hash değerleri eşleşmiyor — belge değiştirilmiş olabilir',
    };
  }
}
