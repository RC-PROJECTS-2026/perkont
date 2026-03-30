import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { NotificationsService } from './notifications.service';
import { NotificationChannel } from './entities/notification.entity';

@Processor('notifications')
export class NotificationsProcessor {
  constructor(private notificationsService: NotificationsService) {}

  @Process('send')
  async handleSend(job: Job) {
    const { channel, email, phone, ...rest } = job.data;

    if (channel === NotificationChannel.EMAIL && email) {
      await this.notificationsService.sendEmail({
        to: email,
        subject: rest.title,
        html: rest.body,
      });
    } else if (channel === NotificationChannel.SMS && phone) {
      await this.notificationsService.sendSms({
        to: phone,
        message: rest.body,
      });
    }

    if (rest.recipientId) {
      await this.notificationsService.createInAppNotification(rest);
    }
  }
}
