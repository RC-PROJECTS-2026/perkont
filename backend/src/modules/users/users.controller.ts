import {
  Controller, Get, Post, Put, Patch, Param,
  Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from '@/modules/auth/dto/auth.dto';

@ApiTags('users')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private service: UsersService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Yeni personel oluştur' })
  create(@Body() dto: CreateUserDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  @ApiOperation({ summary: 'Personel listesi' })
  findAll(@Query() pagination: PaginationDto) {
    return this.service.findAll(pagination);
  }

  @Get('inspectors')
  @Roles(UserRole.ADMIN, UserRole.PLANNER, UserRole.TECHNICAL_MANAGER)
  @ApiOperation({ summary: 'Muayene elemanları listesi' })
  findInspectors() {
    return this.service.findInspectors();
  }

  @Get('expiring-certs')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER, UserRole.EXECUTIVE)
  @ApiOperation({ summary: 'Sertifikası yakında dolacak personeller' })
  getExpiringCerts(@Query('days') days?: number) {
    return this.service.getExpiringQualifications(days || 60);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Personel detayı' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Personel güncelle' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Personeli pasife al' })
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.deactivate(id, userId);
  }

  @Get(':id/qualifications')
  @ApiOperation({ summary: 'Personel sertifikaları' })
  getQualifications(@Param('id') id: string) {
    return this.service.getUserQualifications(id);
  }

  @Post(':id/qualifications')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  @ApiOperation({ summary: 'Sertifika ekle' })
  addQualification(
    @Param('id') id: string,
    @Body() data: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.addQualification(id, data);
  }
}
