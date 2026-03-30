import {
  Controller, Post, Get, Body, UseGuards,
  Req, HttpCode, HttpStatus, Patch, Ip,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { User } from '@/modules/users/entities/user.entity';
import {
  LoginDto, RefreshTokenDto, MfaVerifyDto,
  ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 istek/dakika
  @UseGuards(AuthGuard('local'))
  @ApiOperation({ summary: 'Giriş yap' })
  async login(
    @CurrentUser() user: User,
    @Body() dto: LoginDto,
    @Ip() ip: string,
  ) {
    return this.authService.login(user, dto, ip);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Access token yenile' })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: any) {
    // Refresh token payload'ından userId al
    const userId = req.user?.id;
    return this.authService.refreshTokens(userId, dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Çıkış yap' })
  async logout(@CurrentUser('id') userId: string) {
    return this.authService.logout(userId);
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'MFA kodu doğrula' })
  async verifyMfa(@Body() dto: MfaVerifyDto, @Ip() ip: string) {
    return this.authService.verifyMfa(dto.tempToken, dto.token, ip);
  }

  @Get('mfa/setup')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'MFA kurulum başlat (QR kodu al)' })
  async setupMfa(@CurrentUser('id') userId: string) {
    return this.authService.setupMfa(userId);
  }

  @Post('mfa/confirm')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'MFA kurulumunu onayla' })
  async confirmMfa(
    @CurrentUser('id') userId: string,
    @Body() body: { secret: string; token: string },
  ) {
    await this.authService.confirmMfa(userId, body.secret, body.token);
    return { message: 'İki faktörlü doğrulama aktif edildi' };
  }

  @Post('mfa/disable')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'MFA devre dışı bırak' })
  async disableMfa(
    @CurrentUser('id') userId: string,
    @Body() body: { password: string },
  ) {
    await this.authService.disableMfa(userId, body.password);
    return { message: 'İki faktörlü doğrulama devre dışı bırakıldı' };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Şifre sıfırlama e-postası gönder' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto);
    return { message: 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Şifreyi sıfırla' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { message: 'Şifreniz başarıyla güncellendi' };
  }

  @Patch('change-password')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Şifre değiştir' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(userId, dto);
    return { message: 'Şifreniz başarıyla değiştirildi' };
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Mevcut kullanıcı bilgilerini getir' })
  async me(@CurrentUser() user: User) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      phone: user.phone,
      ekipnetNumber: user.ekipnetNumber,
      mfaEnabled: user.mfaEnabled,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
