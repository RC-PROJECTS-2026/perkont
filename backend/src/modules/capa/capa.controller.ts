import { Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { CapaService } from './capa.service';

@ApiTags('capa') @ApiBearerAuth('JWT') @UseGuards(AuthGuard('jwt'), RolesGuard) @Controller('capa')
export class CapaController {
  constructor(private service: CapaService) {}
  @Post() @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER) create(@Body() body: any, @CurrentUser('id') userId: string) { return this.service.create(body, userId); }
  @Get() @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER, UserRole.EXECUTIVE) findAll(@Query() p: PaginationDto, @Query('status') status?: string, @Query('type') type?: string) { return this.service.findAll({ status, type }, p); }
  @Get('stats') getStats() { return this.service.getStats(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Put(':id') @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER) update(@Param('id') id: string, @Body() body: any, @CurrentUser('id') userId: string) { return this.service.update(id, body, userId); }
  @Patch(':id/close') @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER) close(@Param('id') id: string, @Body('effectivenessResult') result: string, @CurrentUser('id') userId: string) { return this.service.close(id, result, userId); }
}
