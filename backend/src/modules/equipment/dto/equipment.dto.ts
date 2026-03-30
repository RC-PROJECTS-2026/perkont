import {
  IsString, IsOptional, IsUUID, IsEnum, IsNumber,
  IsDateString, MinLength, Min, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { EquipmentStatus } from '../entities/equipment.entity';

export class CreateEquipmentTypeDto {
  @ApiProperty({ example: 'KIE' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'Kaldırma İletme Ekipmanları' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  applicableStandards?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  defaultPeriodMonths?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateEquipmentDto {
  @ApiProperty()
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiProperty()
  @IsUUID()
  equipmentTypeId: string;

  @ApiProperty({ example: 'EKP-2024-0001' })
  @IsString()
  inventoryCode: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1900)
  @Max(2100)
  manufactureYear?: number;

  @ApiPropertyOptional({ example: '5 ton' })
  @IsOptional()
  @IsString()
  capacity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  capacityUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  productionDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  firstUseDate?: string;

  @ApiPropertyOptional({ description: 'Ay cinsinden kontrol periyodu' })
  @IsOptional()
  @IsNumber()
  controlPeriodMonths?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  nextControlDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  installationLocation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateEquipmentDto extends PartialType(CreateEquipmentDto) {
  @ApiPropertyOptional({ enum: EquipmentStatus })
  @IsOptional()
  @IsEnum(EquipmentStatus)
  status?: EquipmentStatus;
}

export class EquipmentFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  equipmentTypeId?: string;

  @ApiPropertyOptional({ enum: EquipmentStatus })
  @IsOptional()
  @IsEnum(EquipmentStatus)
  status?: EquipmentStatus;

  @ApiPropertyOptional({ description: 'Kontrol tarihi bu tarihten önce olanlar' })
  @IsOptional()
  @IsDateString()
  nextControlBefore?: string;

  @ApiPropertyOptional({ description: 'Kontrol tarihi bu tarihten sonra olanlar' })
  @IsOptional()
  @IsDateString()
  nextControlAfter?: string;

  // Tenant isolation — set by controller from JWT, not user-supplied
  companyId?: string;
}
