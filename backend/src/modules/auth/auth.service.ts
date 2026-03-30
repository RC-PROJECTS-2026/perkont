import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import * as crypto from 'crypto';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import * as bcrypt from 'bcrypt';

import { User } from '@/modules/users/entities/user.entity';
import { AuditService } from '@/modules/audit/audit.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import {
  LoginDto,
  LoginResponseDto,
  MfaSetupResponseDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  CreateUserDto,
} from './dto/auth.dto';
import { JwtPayload } from './strategies/jwt.strategy';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 30;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
    private notificationsService: NotificationsService,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
  ) {}

  // ─── Kullanıcı doğrulama (LocalStrategy tarafından çağrılır) ─────────────
  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepo.findOne({ where: { email: email.toLowerCase() } });

    if (!user || !user.isActive) return null;

    if (user.isLocked) {
      throw new UnauthorizedException(
        `Hesabınız ${LOCK_DURATION_MINUTES} dakika kilitlendi. Lütfen daha sonra tekrar deneyin.`,
      );
    }

    const isValid = await user.validatePassword(password);

    if (!isValid) {
      await this.handleFailedLogin(user);
      return null;
    }

    // Başarılı giriş — sayacı sıfırla
    if (user.failedLoginAttempts > 0) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      await this.userRepo.save(user);
    }

    return user;
  }

  private async handleFailedLogin(user: User): Promise<void> {
    user.failedLoginAttempts += 1;

    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + LOCK_DURATION_MINUTES);
      user.lockedUntil = lockUntil;

      this.logger.warn(`Hesap kilitlendi: ${user.email}`, { userId: user.id });

      // Kullanıcıya bildirim gönder
      await this.notificationsService.sendEmail({
        to: user.email,
        subject: 'Hesabınız Geçici Olarak Kilitlendi',
        template: 'account-locked',
        context: { fullName: user.fullName, lockDuration: LOCK_DURATION_MINUTES },
      });
    }

    await this.userRepo.save(user);
  }

  // ─── Login ───────────────────────────────────────────────────────────────
  async login(user: User, dto: LoginDto, ip: string): Promise<LoginResponseDto> {
    // MFA aktifse önce geçici token ver
    if (user.mfaEnabled) {
      const tempToken = this.jwtService.sign(
        { sub: user.id, mfaPending: true },
        { expiresIn: '5m', secret: this.configService.get('jwt.secret') },
      );
      return {
        accessToken: null,
        refreshToken: null,
        user: null,
        requiresMfa: true,
        tempToken,
      } as any;
    }

    return this.generateTokens(user, dto.deviceId, ip);
  }

  async generateTokens(user: User, deviceId?: string, ip?: string): Promise<LoginResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      roles: user.roles || user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('jwt.expiresIn'),
      secret: this.configService.get('jwt.secret'),
    });

    const refreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 30); // 30 days
    await user.setRefreshToken(refreshToken);
    user.refreshTokenExpiresAt = refreshTokenExpiry;

    user.lastLoginAt = new Date();
    user.lastLoginIp = ip;
    await this.userRepo.save(user);

    await this.auditService.log({
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      newValues: { ip, deviceId },
      ipAddress: ip,
    });

    return {
      accessToken,
      refreshToken,
      requiresMfa: false,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        mfaEnabled: user.mfaEnabled,
      },
    };
  }

  // ─── MFA ─────────────────────────────────────────────────────────────────
  async verifyMfa(tempToken: string, mfaToken: string, ip: string): Promise<LoginResponseDto> {
    let payload: any;
    try {
      payload = this.jwtService.verify(tempToken, {
        secret: this.configService.get('jwt.secret'),
      });
    } catch {
      throw new UnauthorizedException('Geçersiz veya süresi dolmuş token');
    }

    if (!payload.mfaPending) {
      throw new UnauthorizedException('Geçersiz token tipi');
    }

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('Kullanıcı bulunamadı');

    const isValid = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: mfaToken,
      window: 2,
    });

    if (!isValid) {
      throw new UnauthorizedException('Geçersiz doğrulama kodu');
    }

    return this.generateTokens(user, undefined, ip);
  }

  async setupMfa(userId: string): Promise<MfaSetupResponseDto> {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });

    const secret = speakeasy.generateSecret({
      name: `${this.configService.get('MFA_APP_NAME')} (${user.email})`,
      issuer: this.configService.get('MFA_ISSUER'),
      length: 32,
    });

    // Henüz kaydetme — kullanıcı confirm etmeli
    const tempSecret = secret.base32;
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

    // Geçici olarak session'da veya kısa süreli cache'de saklanabilir
    // Burada simplify: doğrudan döndür, confirm endpoint'i aktive eder
    return {
      secret: tempSecret,
      qrCodeUrl,
      backupCodes: this.generateBackupCodes(),
    };
  }

  async confirmMfa(userId: string, secret: string, token: string): Promise<void> {
    const isValid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (!isValid) {
      throw new BadRequestException('Doğrulama kodu hatalı. Lütfen tekrar deneyin.');
    }

    await this.userRepo.update(userId, {
      mfaSecret: secret,
      mfaEnabled: true,
    });

    await this.auditService.log({
      userId,
      action: 'MFA_ENABLED',
      entityType: 'User',
      entityId: userId,
    });
  }

  async disableMfa(userId: string, password: string): Promise<void> {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    const isValid = await user.validatePassword(password);
    if (!isValid) throw new UnauthorizedException('Şifre hatalı');

    await this.userRepo.update(userId, {
      mfaEnabled: false,
      mfaSecret: null,
    });

    await this.auditService.log({
      userId,
      action: 'MFA_DISABLED',
      entityType: 'User',
      entityId: userId,
    });
  }

  private generateBackupCodes(): string[] {
    return Array.from({ length: 10 }, () =>
      crypto.randomBytes(5).toString('hex').toUpperCase(),
    );
  }

  // ─── Token Yenileme ───────────────────────────────────────────────────────
  async refreshTokens(userId: string, refreshToken: string): Promise<LoginResponseDto> {
    const user = await this.userRepo.findOne({ where: { id: userId, isActive: true } });

    if (!user || !(await user.validateRefreshToken(refreshToken))) {
      throw new UnauthorizedException('Geçersiz refresh token');
    }

    if (user.refreshTokenExpiresAt && user.refreshTokenExpiresAt < new Date()) {
      // Invalidate expired refresh token
      user.refreshTokenHash = null;
      user.refreshTokenExpiresAt = null;
      await this.userRepo.save(user);
      throw new UnauthorizedException('Refresh token süresi dolmuş. Lütfen tekrar giriş yapın.');
    }

    return this.generateTokens(user);
  }

  async logout(userId: string): Promise<void> {
    await this.userRepo.update(userId, { refreshTokenHash: null, refreshTokenExpiresAt: null });
    await this.auditService.log({
      userId,
      action: 'USER_LOGOUT',
      entityType: 'User',
      entityId: userId,
    });
  }

  // ─── Şifre Sıfırlama ─────────────────────────────────────────────────────
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    // Güvenlik: kullanıcı yoksa bile hata verme
    if (!user) return;

    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 saat

    await this.userRepo.update(user.id, {
      passwordResetToken: hashedToken,
      passwordResetExpires: expires,
    });

    const resetUrl = `${this.configService.get('FRONTEND_URL')}/auth/reset-password?token=${token}`;

    await this.notificationsService.sendEmail({
      to: user.email,
      subject: 'Şifre Sıfırlama Talebi',
      template: 'password-reset',
      context: {
        fullName: user.fullName,
        resetUrl,
        expiresIn: '1 saat',
      },
    });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const hashedToken = crypto
      .createHash('sha256')
      .update(dto.token)
      .digest('hex');

    const user = await this.userRepo.findOne({
      where: { passwordResetToken: hashedToken },
    });

    if (!user || user.passwordResetExpires < new Date()) {
      throw new BadRequestException('Token geçersiz veya süresi dolmuş');
    }

    await user.setPassword(dto.newPassword);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.refreshTokenHash = null; // Tüm oturumları kapat
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;

    await this.userRepo.save(user);

    await this.auditService.log({
      userId: user.id,
      action: 'PASSWORD_RESET',
      entityType: 'User',
      entityId: user.id,
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });

    const isValid = await user.validatePassword(dto.currentPassword);
    if (!isValid) throw new UnauthorizedException('Mevcut şifre hatalı');

    await user.setPassword(dto.newPassword);
    user.refreshTokenHash = null; // Diğer oturumları kapat
    await this.userRepo.save(user);

    await this.auditService.log({
      userId,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: userId,
    });

    await this.notificationsService.sendEmail({
      to: user.email,
      subject: 'Şifreniz Değiştirildi',
      template: 'password-changed',
      context: { fullName: user.fullName },
    });
  }
}
