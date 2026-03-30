import { Injectable, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { addDays } from 'date-fns';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { Equipment } from '@/modules/equipment/entities/equipment.entity';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { UsersService } from '@/modules/users/users.service';

@Injectable()
export class ScheduledTasksService {
  constructor(
    @InjectRepository(Equipment)
    private equipmentRepo: Repository<Equipment>,
    private notificationsService: NotificationsService,
    private usersService: UsersService,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
  ) {}

  // ─── Her sabah 07:00 — Yaklaşan kontrol uyarıları ────────────────────────
  @Cron('0 7 * * *')
  async sendEquipmentControlReminders(): Promise<void> {
    this.logger.log('Ekipman kontrol uyarıları gönderiliyor...', 'ScheduledTasks');

    const upcoming = await this.equipmentRepo.find({
      where: {
        nextControlDate: Between(new Date(), addDays(new Date(), 30)) as any,
        status: 'active' as any,
      },
      relations: ['customer', 'equipmentType'],
    });

    for (const equipment of upcoming) {
      const daysLeft = Math.ceil(
        (new Date(equipment.nextControlDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );

      if ([30, 14, 7, 3, 1].includes(daysLeft)) {
        if (equipment.customer?.contactEmail) {
          await this.notificationsService.sendEmail({
            to: equipment.customer.contactEmail,
            subject: `Periyodik Kontrol Hatırlatması — ${daysLeft} Gün Kaldı`,
            template: 'equipment-control-reminder',
            context: {
              customerName:  equipment.customer.name,
              equipmentCode: equipment.inventoryCode,
              equipmentType: equipment.equipmentType?.name,
              nextControlDate: new Date(equipment.nextControlDate).toLocaleDateString('tr-TR'),
              daysLeft,
            },
          });
        }
      }
    }

    this.logger.log(
      `Kontrol uyarısı: ${upcoming.length} ekipman değerlendirildi`,
      'ScheduledTasks',
    );
  }

  // ─── Her pazartesi 08:00 — Sertifika uyarıları ──────────────────────────
  @Cron('0 8 * * 1')
  async sendCertificateExpiryWarnings(): Promise<void> {
    this.logger.log('Sertifika uyarıları kontrol ediliyor...', 'ScheduledTasks');

    const expiring = await this.usersService.getExpiringQualifications(60);

    for (const { user, cert } of expiring) {
      const daysLeft = Math.ceil(
        (new Date(cert.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );

      if (user.email) {
        await this.notificationsService.notifyCertificateExpiring(user.email, {
          fullName:        user.fullName,
          certificateName: cert.certificateName,
          expiryDate:      new Date(cert.expiryDate),
          daysLeft,
        });
      }
    }
  }

  // ─── Her gece yarısı — Sertifika statülerini güncelle ───────────────────
  @Cron('0 0 * * *')
  async updateCertificateStatuses(): Promise<void> {
    await this.usersService.updateCertStatuses();
  }
}
