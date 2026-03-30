import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { APP_GUARD } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

// Modüller
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CustomersModule } from './modules/customers/customers.module';
import { EquipmentModule } from './modules/equipment/equipment.module';
import { WorkOrdersModule } from './modules/work-orders/work-orders.module';
import { InspectionsModule } from './modules/inspections/inspections.module';
import { ReportsModule } from './modules/reports/reports.module';
import { FormTemplatesModule } from './modules/form-templates/form-templates.module';
import { SyncModule } from './modules/sync/sync.module';
import { LogoModule } from './modules/logo/logo.controller';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { PersonnelModule } from './modules/personnel/personnel.module';
import { AccreditationModule } from './modules/accreditation/accreditation.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { StorageModule } from './modules/storage/storage.module';
import { AuditModule } from './modules/audit/audit.module';
import { CalibrationModule } from './modules/calibration/calibration.module';
import { ComplaintsModule } from './modules/complaints/complaints.module';
import { CapaModule } from './modules/capa/capa.module';
import { InternalAuditModule } from './modules/internal-audit/internal-audit.module';
import { HealthModule } from './modules/health/health.module';
import { PortalModule } from './modules/portal/portal.module';
import { SubcontractorsModule } from './modules/subcontractors/subcontractors.module';
import { RiskModule } from './modules/risk/risk.module';
import { ReferenceDocsModule } from './modules/reference-docs/reference-docs.module';
import { SlaModule } from './modules/sla/sla.module';
import { StorageQuotaModule } from './modules/storage-quota/storage-quota.module';
import { DeviceManagementModule } from './modules/device-management/device-management.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { AdminModule }   from './modules/admin/admin.module';
import { CompanyModule } from './modules/company/company.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { InvoicePreparationModule } from './modules/invoice-preparation/invoice-preparation.module';
import { ProposalsModule } from './modules/proposals/proposals.module';
import { ContractEngineModule } from './modules/contract-engine/contract-engine.module';
import { SalesPipelineModule } from './modules/sales-pipeline/sales-pipeline.module';
import { SharedModule } from './modules/shared/shared.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';

import { TenantGuard } from './common/guards/tenant.guard';
import { databaseConfig } from './config/database.config';
import { redisConfig } from './config/redis.config';
import { appConfig } from './config/app.config';
import { jwtConfig } from './config/jwt.config';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, jwtConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    // Logging
    WinstonModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        const transports: winston.transport[] = [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.colorize(),
              winston.format.printf(({ timestamp, level, message, context }) => {
                return `${timestamp} [${context}] ${level}: ${message}`;
              }),
            ),
          }),
          new winston.transports.File({
            filename: `${configService.get('LOG_FILE_PATH', './logs')}/error.log`,
            level: 'error',
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.json(),
            ),
          }),
          new winston.transports.File({
            filename: `${configService.get('LOG_FILE_PATH', './logs')}/combined.log`,
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.json(),
            ),
          }),
        ];

        // Bölüm 12 — ELK Stack: Logstash TCP transport (production'da aktif)
        const logstashHost = configService.get('LOGSTASH_HOST');
        const logstashPort = configService.get<number>('LOGSTASH_PORT', 5000);
        if (logstashHost) {
          // Winston TCP transport — JSON lines formatında Logstash'e gönderir
          const net = require('net');
          class LogstashTransport extends (winston.transport as any) {
            private socket: any;
            constructor(private host: string, private port: number) {
              super({ level: 'info' });
              this.connect();
            }
            private connect() {
              this.socket = net.connect({ host: this.host, port: this.port });
              this.socket.on('error', () => setTimeout(() => this.connect(), 5000));
            }
            log(info: any, callback: () => void) {
              const line = JSON.stringify({ ...info, service: 'perkont-api' }) + '\n';
              this.socket?.write(line);
              callback();
            }
          }
          transports.push(new LogstashTransport(logstashHost, logstashPort) as any);
        }

        return { transports };
      },
      inject: [ConfigService],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.get('DB_USERNAME', 'root'),
        password: configService.get('DB_PASSWORD') || '',
        database: configService.get('DB_DATABASE', 'perkont_db'),
        entities: [__dirname + '/**/*.entity{.ts,.js}', __dirname + '/**/*.module{.ts,.js}'],
        synchronize: false,
        dropSchema: false,
        migrationsRun: false,
        logging: configService.get('DB_LOGGING') === 'true',
        charset: 'utf8mb4',
        collation: 'utf8mb4_unicode_ci',
        timezone: '+03:00',
        extra: {
          charset: 'utf8mb4_unicode_ci',
          connectionLimit: 10,
        },
      }),
    }),

    // Redis / Bull Queue
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
          db: configService.get<number>('REDIS_DB', 0),
        },
      }),
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get<number>('THROTTLE_TTL', 60) * 1000,
          limit: configService.get<number>('THROTTLE_LIMIT', 10000),
        },
      ],
    }),

    // Scheduled tasks
    ScheduleModule.forRoot(),

    // Shared
    SharedModule,

    // Feature modules
    HealthModule,
    StorageModule,
    AuditModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    EquipmentModule,
    WorkOrdersModule,
    InspectionsModule,
    ReportsModule,
    FormTemplatesModule,
    SyncModule,
    LogoModule,
    NotificationsModule,
    ContractsModule,
    QuotationsModule,
    PersonnelModule,
    AccreditationModule,
    DashboardModule,
    CalibrationModule,
    ComplaintsModule,
    CapaModule,
    InternalAuditModule,
    PortalModule,
    SubcontractorsModule,
    RiskModule,
    ReferenceDocsModule,
    SlaModule,
    StorageQuotaModule,
    DeviceManagementModule,
    ReportingModule,
    MetricsModule,
    AdminModule,
    CompanyModule,
    PricingModule,
    InvoicePreparationModule,
    ProposalsModule,
    ContractEngineModule,
    SalesPipelineModule,
    PaymentsModule,
    MonitoringModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
  ],
})
export class AppModule {}
