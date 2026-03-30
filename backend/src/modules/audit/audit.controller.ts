import { Controller, Get, Query, UseGuards, Param } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { UserRole } from '@/common/enums/user-role.enum';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { AuditService } from './audit.service';

@ApiTags('audit')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE, UserRole.TECHNICAL_MANAGER)
  @ApiOperation({ summary: 'Denetim izi kayıtlarını listele' })
  findAll(
    @Query() pagination: PaginationDto,
    @Query('userId') userId?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.auditService.findAll(
      {
        userId,
        entityType,
        entityId,
        action,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
      pagination,
    );
  }

  @Get('entity/:type/:id')
  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE, UserRole.TECHNICAL_MANAGER)
  @ApiOperation({ summary: 'Belirli bir kaydın değişim geçmişini getir' })
  getEntityHistory(@Param('type') type: string, @Param('id') id: string) {
    return this.auditService.getEntityHistory(type, id);
  }
}
