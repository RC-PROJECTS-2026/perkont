import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as nodemailer from 'nodemailer';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import axios from 'axios';

import {
  Notification,
  NotificationChannel,
  NotificationType,
} from './entities/notification.entity';

export interface SendEmailDto {
  to: string | string[];
  subject: string;
  template?: string;
  context?: Record<string, any>;
  html?: string;
  text?: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
}

export interface SendSmsDto {
  to: string | string[];
  message: string;
}

export interface CreateNotificationDto {
  recipientId?: string;
  customerId?: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  private transporter: nodemailer.Transporter;

  constructor(
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,
    private configService: ConfigService,
    @InjectQueue('notifications') private notifQueue: Queue,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
  ) {
    this.transporter = nodemailer.createTransport({
      host: configService.get('SMTP_HOST'),
      port: configService.get<number>('SMTP_PORT', 587),
      secure: configService.get('SMTP_SECURE') === 'true',
      auth: {
        user: configService.get('SMTP_USER'),
        pass: configService.get('SMTP_PASS'),
      },
    });
  }

  // ─── E-posta ─────────────────────────────────────────────────────────────
  async sendEmail(dto: SendEmailDto): Promise<void> {
    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: this.configService.get('SMTP_FROM'),
        to: Array.isArray(dto.to) ? dto.to.join(', ') : dto.to,
        subject: dto.subject,
        html: dto.html || this.renderTemplate(dto.template, dto.context),
        text: dto.text,
        attachments: dto.attachments,
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.info(`E-posta gönderildi: ${dto.to}`, { subject: dto.subject });
    } catch (error) {
      this.logger.error(`E-posta gönderilemedi: ${error.message}`, { dto });
      throw error;
    }
  }

  // ─── SMS (Netgsm entegrasyonu) ────────────────────────────────────────────
  async sendSms(dto: SendSmsDto): Promise<void> {
    const provider = this.configService.get('SMS_PROVIDER');
    const phones = Array.isArray(dto.to) ? dto.to : [dto.to];

    try {
      if (provider === 'netgsm') {
        await this.sendNetgsmSms(phones, dto.message);
      } else {
        this.logger.warn(`Bilinmeyen SMS sağlayıcısı: ${provider}`);
      }
    } catch (error) {
      this.logger.error(`SMS gönderilemedi: ${error.message}`, { dto });
      throw error;
    }
  }

  private async sendNetgsmSms(phones: string[], message: string): Promise<void> {
    const apiKey = this.configService.get('SMS_API_KEY');
    const apiSecret = this.configService.get('SMS_API_SECRET');
    const sender = this.configService.get('SMS_SENDER');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mainbody>
  <header>
    <usercode>${apiKey}</usercode>
    <password>${apiSecret}</password>
    <type>1:n</type>
    <msgheader>${sender}</msgheader>
  </header>
  <body>
    <msg><![CDATA[${message}]]></msg>
    ${phones.map((p) => `<no>${p}</no>`).join('\n    ')}
  </body>
</mainbody>`;

    const response = await axios.post(
      'https://api.netgsm.com.tr/sms/send/xml',
      xml,
      { headers: { 'Content-Type': 'text/xml' } },
    );

    if (response.data && !response.data.startsWith('00')) {
      throw new Error(`Netgsm hata kodu: ${response.data}`);
    }
  }

  // ─── In-App Bildirim ─────────────────────────────────────────────────────
  async createInAppNotification(dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepo.create({
      ...dto,
      status: 'pending',
    });
    return this.notificationRepo.save(notification);
  }

  // ─── Queue'ya ekle (async gönderim) ──────────────────────────────────────
  async queueNotification(dto: CreateNotificationDto & { email?: string; phone?: string }) {
    await this.notifQueue.add('send', dto, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  // ─── Kullanıcı bildirimlerini getir ──────────────────────────────────────
  async getUserNotifications(userId: string) {
    return this.notificationRepo.find({
      where: { recipientId: userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await this.notificationRepo.update(
      { id: notificationId, recipientId: userId },
      { isRead: true, readAt: new Date() },
    );
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepo.update(
      { recipientId: userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepo.count({
      where: { recipientId: userId, isRead: false },
    });
  }

  // ─── Hazır bildirim şablonları ────────────────────────────────────────────
  async notifyWorkOrderAssigned(
    inspectorEmail: string,
    inspectorPhone: string,
    data: { workOrderNumber: string; customerName: string; plannedDate: Date },
  ) {
    await Promise.all([
      this.sendEmail({
        to: inspectorEmail,
        subject: `Yeni İş Emri Atandı: ${data.workOrderNumber}`,
        template: 'work-order-assigned',
        context: data,
      }),
      this.sendSms({
        to: inspectorPhone,
        message: `PerKont: ${data.workOrderNumber} nolu iş emri size atandı. Müşteri: ${data.customerName}. Tarih: ${data.plannedDate.toLocaleDateString('tr-TR')}`,
      }),
    ]);
  }

  async notifyReportReady(
    customerEmail: string,
    data: { reportNumber: string; customerName: string; downloadUrl: string },
  ) {
    await this.sendEmail({
      to: customerEmail,
      subject: `Muayene Raporunuz Hazır: ${data.reportNumber}`,
      template: 'report-ready',
      context: data,
    });
  }

  async notifyCertificateExpiring(
    userEmail: string,
    data: { fullName: string; certificateName: string; expiryDate: Date; daysLeft: number },
  ) {
    await this.sendEmail({
      to: userEmail,
      subject: `Sertifika Süresi Doluyor: ${data.certificateName}`,
      template: 'certificate-expiring',
      context: data,
    });
  }

  // ─── Basit HTML template renderer (prod'da Handlebars veya Mjml kullanılabilir) ──
  private renderTemplate(template: string, context: Record<string, any> = {}): string {
    const templates: Record<string, string> = {
      'work-order-assigned': `
        <h2>Yeni İş Emri Atandı</h2>
        <p>Sayın {{fullName}},</p>
        <p><strong>{{workOrderNumber}}</strong> nolu iş emri size atandı.</p>
        <p>Müşteri: {{customerName}}</p>
        <p>Planlanan Tarih: {{plannedDate}}</p>
      `,
      'report-ready': `
        <h2>Muayene Raporunuz Hazır</h2>
        <p>Sayın {{customerName}},</p>
        <p><strong>{{reportNumber}}</strong> nolu muayene raporunuz hazırlanmıştır.</p>
        <p><a href="{{downloadUrl}}">Raporu İndirmek İçin Tıklayın</a></p>
      `,
      'certificate-expiring': `
        <h2>Sertifika Süresi Doluyor</h2>
        <p>Sayın {{fullName}},</p>
        <p><strong>{{certificateName}}</strong> sertifikanızın süresi <strong>{{daysLeft}} gün</strong> içinde dolacaktır.</p>
        <p>Son Geçerlilik: {{expiryDate}}</p>
        <p>Lütfen yenileme işlemlerini başlatınız.</p>
      `,
      'account-locked': `
        <h2>Hesabınız Geçici Olarak Kilitlendi</h2>
        <p>Sayın {{fullName}},</p>
        <p>Çok sayıda hatalı giriş denemesi nedeniyle hesabınız <strong>{{lockDuration}} dakika</strong> süreyle kilitlenmiştir.</p>
        <p>Bu işlemi siz yapmadıysanız lütfen yöneticinizle iletişime geçin.</p>
      `,
      'password-reset': `
        <h2>Şifre Sıfırlama</h2>
        <p>Sayın {{fullName}},</p>
        <p>Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın. Bağlantı {{expiresIn}} sonra geçersiz olacaktır.</p>
        <p><a href="{{resetUrl}}">Şifremi Sıfırla</a></p>
      `,
      'password-changed': `
        <h2>Şifreniz Değiştirildi</h2>
        <p>Sayın {{fullName}},</p>
        <p>PerKont hesabınızın şifresi başarıyla değiştirildi.</p>
        <p>Bu değişikliği siz yapmadıysanız lütfen hemen destek ekibiyle iletişime geçin.</p>
      `,
    };

    let html = templates[template] || '<p>{{body}}</p>';
    Object.entries(context).forEach(([key, value]) => {
      html = html.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    });
    return html;
  }
}
