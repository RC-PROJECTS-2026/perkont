import {
  Controller, Get, Post, Put, Body, Param,
  Query, UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { CalibrationService } from './calibration.service';

@ApiTags('calibration')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('calibration')
export class CalibrationController {
  constructor(private service: CalibrationService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  create(@Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.create(body, userId);
  }

  @Get()
  findAll(
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll({ status, search }, pagination);
  }

  @Get('expiring')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER, UserRole.EXECUTIVE)
  getExpiring(@Query('days') days?: number) {
    return this.service.getExpiring(days || 60);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  update(@Param('id') id: string, @Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.update(id, body, userId);
  }

  @Post(':id/certificate')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  uploadCertificate(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.uploadCertificate(id, file.buffer, file.originalname, userId);
  }
}
