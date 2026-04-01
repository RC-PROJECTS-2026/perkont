/**
 * Y2: Ekipman Toplu Import Controller + Excel/JSON parse
 */
import {
  Controller, Post, Body, Param, UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { EquipmentImportService } from './equipment-import.service';

@ApiTags('equipment')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('equipment')
export class EquipmentImportController {
  constructor(private importService: EquipmentImportService) {}

  @Post('import/:customerId')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.PLANNER)
  @ApiOperation({ summary: 'JSON formatinda toplu ekipman import' })
  importJson(
    @Param('customerId') customerId: string,
    @Body() body: { rows: any[] },
    @CurrentUser('id') userId: string,
  ) {
    return this.importService.importFromJson(customerId, body.rows, userId);
  }

  @Post('import/:customerId/excel')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.PLANNER)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Excel dosyasindan toplu ekipman import' })
  async importExcel(
    @Param('customerId') customerId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    // xlsx paketi ile parse
    const XLSX = require('xlsx');
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(sheet);

    // Kolon eslemesi — Turkce/Ingilizce header destegi
    const rows = jsonData.map((row: any) => ({
      inventoryCode: row['Envanter Kodu'] || row['inventoryCode'] || row['Kod'] || '',
      equipmentTypeCode: row['Ekipman Tipi Kodu'] || row['equipmentTypeCode'] || row['Tip Kodu'] || '',
      locationName: row['Lokasyon'] || row['locationName'] || row['Lokasyon Adı'] || '',
      serialNumber: row['Seri No'] || row['serialNumber'] || '',
      brand: row['Marka'] || row['brand'] || '',
      model: row['Model'] || row['model'] || '',
      capacity: row['Kapasite'] || row['capacity'] || '',
      capacityUnit: row['Birim'] || row['capacityUnit'] || '',
      manufactureYear: parseInt(row['Üretim Yılı'] || row['manufactureYear'] || '0') || null,
      controlPeriodMonths: parseInt(row['Kontrol Periyodu (Ay)'] || row['controlPeriodMonths'] || '0') || null,
      floor: row['Kat/Blok'] || row['floor'] || '',
      riskClass: row['Risk Sınıfı'] || row['riskClass'] || 'standard',
    }));

    return this.importService.importFromJson(customerId, rows, userId);
  }
}
