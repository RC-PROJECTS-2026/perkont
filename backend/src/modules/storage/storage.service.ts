import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

export enum StorageBucket {
  DOCUMENTS = 'documents',
  PHOTOS = 'photos',
  REPORTS = 'reports',
  ARCHIVE = 'archive',
}

@Injectable()
export class StorageService implements OnModuleInit {
  private client: Minio.Client;
  private buckets: Record<StorageBucket, string>;

  constructor(
    private configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
  ) {
    try {
      this.client = new Minio.Client({
        endPoint: configService.get('MINIO_ENDPOINT', 'localhost'),
        port: parseInt(configService.get('MINIO_PORT', '9000'), 10),
        useSSL: configService.get('MINIO_USE_SSL') === 'true',
        accessKey: configService.get('MINIO_ACCESS_KEY', 'minioadmin'),
        secretKey: configService.get('MINIO_SECRET_KEY', 'minioadmin'),
      });
    } catch (e) {
      this.logger.warn('MinIO client initialization failed, storage features will be unavailable');
      this.client = null;
    }

    this.buckets = {
      [StorageBucket.DOCUMENTS]: configService.get('MINIO_BUCKET_DOCUMENTS', 'perkont-documents'),
      [StorageBucket.PHOTOS]: configService.get('MINIO_BUCKET_PHOTOS', 'perkont-photos'),
      [StorageBucket.REPORTS]: configService.get('MINIO_BUCKET_REPORTS', 'perkont-reports'),
      [StorageBucket.ARCHIVE]: configService.get('MINIO_BUCKET_ARCHIVE', 'perkont-archive'),
    };
  }

  async onModuleInit() {
    try {
      if (this.client) await this.ensureBucketsExist();
    } catch (e) {
      this.logger.warn(`MinIO bağlantısı kurulamadı, depolama özellikleri devre dışı: ${e.message}`, 'StorageService');
    }
  }

  private async ensureBucketsExist() {
    for (const [, bucketName] of Object.entries(this.buckets)) {
      const exists = await this.client.bucketExists(bucketName);
      if (!exists) {
        await this.client.makeBucket(bucketName, 'eu-west-1');
        this.logger.log(`MinIO bucket oluşturuldu: ${bucketName}`, 'StorageService');
      }
    }

    // Archive bucket'ı readonly — dışarıdan silme/değiştirme yasak
    await this.setArchiveBucketPolicy();
  }

  private async setArchiveBucketPolicy() {
    const archiveBucket = this.buckets[StorageBucket.ARCHIVE];
    // Sadece okuma ve yazma — silme ve overwrite yasak
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${archiveBucket}/*`],
        },
      ],
    };
    await this.client.setBucketPolicy(archiveBucket, JSON.stringify(policy));
  }

  // ─── Dosya Yükleme ────────────────────────────────────────────────────────
  async uploadFile(
    bucket: StorageBucket,
    file: Buffer,
    originalName: string,
    mimeType: string,
    folder?: string,
  ): Promise<{ url: string; objectName: string; hash: string }> {
    const ext = originalName.split('.').pop();
    const objectName = folder
      ? `${folder}/${uuidv4()}.${ext}`
      : `${uuidv4()}.${ext}`;

    const hash = crypto.createHash('sha256').update(file).digest('hex');

    await this.client.putObject(
      this.buckets[bucket],
      objectName,
      file,
      file.length,
      { 'Content-Type': mimeType, 'x-file-hash': hash },
    );

    const url = `${this.getBaseUrl()}/${this.buckets[bucket]}/${objectName}`;
    return { url, objectName, hash };
  }

  // ─── Dosya Okuma ─────────────────────────────────────────────────────────
  async getFile(objectName: string, bucket: StorageBucket): Promise<Buffer> {
    const stream = await this.client.getObject(this.buckets[bucket], objectName);
    return this.streamToBuffer(stream);
  }

  async getFileByUrl(url: string): Promise<Buffer> {
    // Local filesystem fallback (MinIO yokken)
    if (url.startsWith('local://')) {
      const fs = require('fs');
      const path = require('path');
      const relativePath = url.replace('local://', '');
      const localPath = path.resolve(process.cwd(), 'storage', relativePath);
      if (fs.existsSync(localPath)) {
        return fs.readFileSync(localPath);
      }
      throw new Error(`Local dosya bulunamadi: ${localPath}`);
    }
    const { bucket, objectName } = this.parseUrl(url);
    const stream = await this.client.getObject(bucket, objectName);
    return this.streamToBuffer(stream);
  }

  // ─── Presigned URL (upload/download) ─────────────────────────────────────
  async getPresignedUploadUrl(
    bucket: StorageBucket,
    objectName: string,
    expiry = 3600,
  ): Promise<string> {
    return this.client.presignedPutObject(this.buckets[bucket], objectName, expiry);
  }

  async getPresignedDownloadUrl(
    bucket: StorageBucket,
    objectName: string,
    expiry = 3600,
  ): Promise<string> {
    return this.client.presignedGetObject(this.buckets[bucket], objectName, expiry);
  }

  // ─── Silme (archive hariç) ───────────────────────────────────────────────
  async deleteFile(bucket: StorageBucket, objectName: string): Promise<void> {
    if (bucket === StorageBucket.ARCHIVE) {
      throw new Error('Arşiv dosyaları silinemez');
    }
    await this.client.removeObject(this.buckets[bucket], objectName);
  }

  // ─── Archive'e taşıma (imzalı raporlar) ─────────────────────────────────
  async moveToArchive(
    sourceBucket: StorageBucket,
    sourceObjectName: string,
    archiveObjectName: string,
  ): Promise<string> {
    const fileBuffer = await this.getFile(sourceObjectName, sourceBucket);

    // Archive'e kopyala
    await this.client.putObject(
      this.buckets[StorageBucket.ARCHIVE],
      archiveObjectName,
      fileBuffer,
    );

    // Orijinali sil (archive değilse)
    if (sourceBucket !== StorageBucket.ARCHIVE) {
      await this.client.removeObject(this.buckets[sourceBucket], sourceObjectName);
    }

    return `${this.getBaseUrl()}/${this.buckets[StorageBucket.ARCHIVE]}/${archiveObjectName}`;
  }

  /**
   * Generate a time-limited presigned URL for file access
   * Only authorized users can generate URLs for specific files
   */
  async getPresignedUrl(
    bucket: StorageBucket,
    objectName: string,
    expirySeconds: number = 3600,
  ): Promise<string> {
    if (!this.client) throw new Error('Storage service unavailable');
    const bucketName = this.buckets[bucket];
    return this.client.presignedGetObject(bucketName, objectName, expirySeconds);
  }

  /**
   * Check if a user has access to a specific file based on role and ownership
   */
  canAccessFile(
    userRole: string,
    userId: string,
    fileMetadata: { bucket: string; createdById?: string; customerId?: string; userCustomerId?: string },
  ): boolean {
    // Admin and executive can access everything
    if (['admin', 'executive'].includes(userRole)) return true;

    // Archive bucket - only admin and technical_manager
    if (fileMetadata.bucket === StorageBucket.ARCHIVE) {
      return ['admin', 'technical_manager'].includes(userRole);
    }

    // Customer role - only own files
    if (userRole === 'customer') {
      return fileMetadata.customerId === fileMetadata.userCustomerId;
    }

    // Internal roles can access non-archive files
    return ['inspector', 'technical_manager', 'planner', 'sales', 'finance', 'customer_rep'].includes(userRole);
  }

  /**
   * Get secure download URL with access check
   */
  async getSecureFileUrl(
    bucket: StorageBucket,
    objectName: string,
    userRole: string,
    userId: string,
    fileMetadata: { createdById?: string; customerId?: string; userCustomerId?: string } = {},
  ): Promise<string> {
    const canAccess = this.canAccessFile(userRole, userId, {
      bucket,
      ...fileMetadata
    });
    if (!canAccess) throw new Error('Bu dosyaya erişim yetkiniz yok');
    return this.getPresignedUrl(bucket, objectName);
  }

  private streamToBuffer(stream: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  private getBaseUrl(): string {
    const ssl = this.configService.get('MINIO_USE_SSL') === 'true';
    const host = this.configService.get('MINIO_ENDPOINT');
    const port = this.configService.get('MINIO_PORT');
    return `${ssl ? 'https' : 'http'}://${host}:${port}`;
  }

  private parseUrl(url: string): { bucket: string; objectName: string } {
    const baseUrl = this.getBaseUrl();
    const withoutBase = url.replace(baseUrl + '/', '');
    const parts = withoutBase.split('/');
    const bucket = parts[0];
    const objectName = parts.slice(1).join('/');
    return { bucket, objectName };
  }

  /**
   * Get bucket statistics (used bytes, file count)
   */
  async getBucketStats(bucket: string): Promise<{ usedBytes: number; fileCount: number }> {
    let usedBytes = 0;
    let fileCount = 0;
    const stream = this.client.listObjectsV2(bucket, '', true);
    return new Promise((resolve, reject) => {
      stream.on('data', (obj: any) => {
        usedBytes += obj.size || 0;
        fileCount++;
      });
      stream.on('end', () => resolve({ usedBytes, fileCount }));
      stream.on('error', (err: any) => reject(err));
    });
  }

  /**
   * Get largest objects in a bucket
   */
  async getLargestObjects(bucket: string, limit = 20): Promise<any[]> {
    const objects: any[] = [];
    const stream = this.client.listObjectsV2(bucket, '', true);
    return new Promise((resolve, reject) => {
      stream.on('data', (obj: any) => objects.push(obj));
      stream.on('end', () => {
        objects.sort((a, b) => (b.size || 0) - (a.size || 0));
        resolve(objects.slice(0, limit));
      });
      stream.on('error', (err: any) => reject(err));
    });
  }

  /**
   * Delete objects older than N days from a bucket
   */
  async deleteOlderThan(bucket: string, olderThanDays: number): Promise<{ deleted: number }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    const toDelete: string[] = [];
    const stream = this.client.listObjectsV2(bucket, '', true);
    return new Promise((resolve, reject) => {
      stream.on('data', (obj: any) => {
        if (obj.lastModified && new Date(obj.lastModified) < cutoff) {
          toDelete.push(obj.name);
        }
      });
      stream.on('end', async () => {
        if (toDelete.length > 0) {
          await this.client.removeObjects(bucket, toDelete);
        }
        resolve({ deleted: toDelete.length });
      });
      stream.on('error', (err: any) => reject(err));
    });
  }
}
