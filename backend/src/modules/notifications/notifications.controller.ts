import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@Controller('notifications')
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Get()
  getMyNotifications(@CurrentUser('id') userId: string) {
    return this.service.getUserNotifications(userId);
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser('id') userId: string) {
    return this.service.getUnreadCount(userId);
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.markAsRead(id, userId);
  }

  @Patch('read-all')
  markAllAsRead(@CurrentUser('id') userId: string) {
    return this.service.markAllAsRead(userId);
  }
}
