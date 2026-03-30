import { Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { InternalAuditService } from './internal-audit.service';

@ApiTags('internal-audit') @ApiBearerAuth('JWT') @UseGuards(AuthGuard('jwt'), RolesGuard) @Controller('internal-audit')
export class InternalAuditController {
  constructor(private service: InternalAuditService) {}
  @Post('plans') @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER) createPlan(@Body() body: any, @CurrentUser('id') userId: string) { return this.service.createPlan(body, userId); }
  @Get('plans') @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER, UserRole.EXECUTIVE) findAllPlans(@Query() p: PaginationDto) { return this.service.findAllPlans(p); }
  @Get('plans/:id') findOnePlan(@Param('id') id: string) { return this.service.findOnePlan(id); }
  @Put('plans/:id') @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER) updatePlan(@Param('id') id: string, @Body() body: any, @CurrentUser('id') userId: string) { return this.service.updatePlan(id, body, userId); }
  @Post('plans/:id/findings') @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER) addFinding(@Param('id') id: string, @Body() body: any, @CurrentUser('id') userId: string) { return this.service.addFinding(id, body, userId); }
  @Get('findings/open') @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER, UserRole.EXECUTIVE) getOpenFindings() { return this.service.getOpenFindings(); }
  @Patch('findings/:id/close') @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER) closeFinding(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.service.closeFinding(id, userId); }
}
