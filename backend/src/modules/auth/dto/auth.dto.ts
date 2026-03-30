import {
  IsEmail, IsString, MinLength, MaxLength,
  IsOptional, IsBoolean, IsEnum, Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@/common/enums/user-role.enum';

export class LoginDto {
  @ApiProperty({ example: 'admin@firma.com' })
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi giriniz' })
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ description: 'Cihaz tanımlayıcı (offline sync için)' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class LoginResponseDto {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    mfaEnabled: boolean;
  };
  requiresMfa: boolean;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class MfaVerifyDto {
  @ApiProperty({ description: '6 haneli TOTP kodu' })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  token: string;

  @ApiProperty({ description: 'Login sonrası alınan geçici token' })
  @IsString()
  tempToken: string;
}

export class MfaSetupResponseDto {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'Şifre en az 1 büyük harf, 1 küçük harf ve 1 rakam içermelidir',
  })
  newPassword: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'Şifre en az 1 büyük harf, 1 küçük harf ve 1 rakam içermelidir',
  })
  newPassword: string;
}

export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ description: 'Muayene elemanı için EKİPNET numarası' })
  @IsOptional()
  @IsString()
  ekipnetNumber?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ekipnetNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
