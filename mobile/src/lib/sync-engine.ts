import * as Network from 'expo-network';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import axios from 'axios';
import {
  getPendingSyncItems, markSyncSuccess, markSyncFailed,
  getDb,
} from './offline-db';
import { getAuthToken } from './secure-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
const SYNC_TASK = 'PERKONT_BACKGROUND_SYNC';

// ─── Sync Engine ──────────────────────────────────────────────────────────────
export class SyncEngine {
  private static instance: SyncEngine;
  private isSyncing = false;
  private listeners: Array<(status: SyncStatus) => void> = [];

  static getInstance() {
    if (!SyncEngine.instance) SyncEngine.instance = new SyncEngine();
    return SyncEngine.instance;
  }

  onSyncStatusChange(fn: (status: SyncStatus) => void) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((l) => l !== fn); };
  }

  private emit(status: SyncStatus) {
    this.listeners.forEach((l) => l(status));
  }

  // ─── Ağ durumunu kontrol et ───────────────────────────────────────────────
  async isOnline(): Promise<boolean> {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected === true && state.isInternetReachable === true;
  }

  // ─── Ana sync methodu ─────────────────────────────────────────────────────
  async sync(): Promise<SyncResult> {
    if (this.isSyncing) return { success: 0, failed: 0, conflicts: [] };
    if (!(await this.isOnline())) {
      console.log('[Sync] Çevrimdışı — sync atlandı');
      return { success: 0, failed: 0, conflicts: [] };
    }

    this.isSyncing = true;
    this.emit({ status: 'syncing', message: 'Senkronizasyon başlatıldı...' });

    const result: SyncResult = { success: 0, failed: 0, conflicts: [] };

    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Auth token bulunamadı');

      const client = axios.create({
        baseURL: API_URL,
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30000,
      });

      // 1. Tamamlanmış denetimleri gönder
      await this.syncCompletedInspections(client, result);

      // 2. Fotoğrafları yükle (presigned URL ile)
      await this.syncPendingPhotos(client, result);

      // 3. Genel sync kuyruğunu işle
      await this.processSyncQueue(client, result);

      this.emit({ status: 'success', message: `${result.success} kayıt senkronize edildi` });
    } catch (error: any) {
      console.error('[Sync] Hata:', error.message);
      this.emit({ status: 'error', message: error.message });
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  // ─── Tamamlanan denetimleri sun. gönder ──────────────────────────────────
  private async syncCompletedInspections(client: any, result: SyncResult): Promise<void> {
    const db = getDb();
    const pending = await db.getAllAsync(
      `SELECT i.*,
        (SELECT json_group_array(json_object(
          'fieldKey', fv.field_key, 'fieldId', fv.field_id,
          'valueText', fv.value_text, 'valueNumber', fv.value_number,
          'valueBoolean', fv.value_boolean, 'valueJson', fv.value_json
        )) FROM inspection_field_values fv WHERE fv.inspection_id = i.id) as field_values,
        (SELECT json_group_array(json_object(
          'fieldId', nc.field_id, 'checkItemId', nc.check_item_id,
          'description', nc.description, 'severity', nc.severity, 'recommendation', nc.recommendation
        )) FROM inspection_nonconformities nc WHERE nc.inspection_id = i.id) as nonconformities,
        (SELECT json_group_array(json_object(
          'fieldKey', p.field_key, 'localPath', p.local_path,
          'takenAt', p.taken_at, 'latitude', p.latitude, 'longitude', p.longitude
        )) FROM inspection_photos p WHERE p.inspection_id = i.id) as photos
       FROM inspections i
       WHERE i.sync_status = 'pending' AND i.offline_created = 1`,
    );

    for (const inspection: any of pending) {
      try {
        const fieldValues = JSON.parse(inspection.field_values || '[]');
        const nonconformities = JSON.parse(inspection.nonconformities || '[]');
        const photos = JSON.parse(inspection.photos || '[]');

        const response = await client.post('/inspections/sync/offline', {
          localUuid: inspection.local_uuid,
          inspection: {
            workOrderId: inspection.work_order_id,
            equipmentId: inspection.equipment_id,
            formTemplateId: inspection.form_template_id,
            formTemplateRevision: inspection.form_template_revision,
            status: inspection.status,
            latitude: inspection.latitude,
            longitude: inspection.longitude,
            offlineCreated: true,
            offlineDeviceId: inspection.offline_device_id,
          },
          fieldValues: fieldValues.map((fv: any) => ({
            fieldKey: fv.fieldKey,
            fieldId: fv.fieldId,
            valueText: fv.valueText,
            valueNumber: fv.valueNumber,
            valueBoolean: fv.valueBoolean !== null ? Boolean(fv.valueBoolean) : undefined,
            valueJson: fv.valueJson ? JSON.parse(fv.valueJson) : undefined,
          })),
          nonconformities: nonconformities.filter((nc: any) => nc.description),
          photos: photos.filter((p: any) => p.localPath),
          deviceTimestamp: inspection.device_timestamp,
          overallResult: inspection.overall_result,
        });

        const serverId = response.data?.data?.inspectionId;

        // Yerel kaydı güncelle
        await db.runAsync(
          `UPDATE inspections SET sync_status='synced', server_id=? WHERE id=?`,
          [serverId, inspection.id],
        );

        result.success++;
      } catch (err: any) {
        if (err.response?.status === 409) {
          result.conflicts.push({
            localId: inspection.id,
            message: err.response.data?.message || 'Çakışma',
          });
        } else {
          result.failed++;
          await db.runAsync(
            `UPDATE inspections SET sync_status='failed' WHERE id=?`,
            [inspection.id],
          );
        }
      }
    }
  }

  // ─── Bekleyen fotoğrafları yükle ─────────────────────────────────────────
  private async syncPendingPhotos(client: any, result: SyncResult): Promise<void> {
    const db = getDb();
    const photos = await db.getAllAsync(
      `SELECT p.*, i.server_id as inspection_server_id
       FROM inspection_photos p
       JOIN inspections i ON p.inspection_id = i.id
       WHERE p.sync_status = 'pending' AND p.local_path IS NOT NULL AND i.server_id IS NOT NULL`,
    );

    for (const photo: any of photos) {
      try {
        // 1. Presigned URL al
        const urlRes = await client.get(
          `/inspections/${photo.inspection_server_id}/photos/${photo.id}/upload-url`,
        );
        const { uploadUrl, objectName } = urlRes.data?.data || {};

        // 2. Dosyayı yükle
        const fileInfo = await (await import('expo-file-system')).getInfoAsync(photo.local_path);
        if (!fileInfo.exists) {
          await db.runAsync(`UPDATE inspection_photos SET sync_status='failed' WHERE id=?`, [photo.id]);
          continue;
        }

        await (await import('expo-file-system')).uploadAsync(uploadUrl, photo.local_path, {
          httpMethod: 'PUT',
          uploadType: (await import('expo-file-system')).FileSystemUploadType.BINARY_CONTENT,
          headers: { 'Content-Type': 'image/jpeg' },
        });

        await db.runAsync(
          `UPDATE inspection_photos SET sync_status='synced', server_url=? WHERE id=?`,
          [objectName, photo.id],
        );

        result.success++;
      } catch (err) {
        result.failed++;
      }
    }
  }

  // ─── Genel sync kuyruğu ───────────────────────────────────────────────────
  private async processSyncQueue(client: any, result: SyncResult): Promise<void> {
    const items = await getPendingSyncItems();

    for (const item: any of items) {
      try {
        const payload = JSON.parse(item.payload);
        let serverId: string;

        if (item.action === 'CREATE') {
          const res = await client.post(`/${item.entity_type}`, payload);
          serverId = res.data?.data?.id;
        } else {
          await client.put(`/${item.entity_type}/${item.server_id}`, payload);
          serverId = item.server_id;
        }

        await markSyncSuccess(item.id, serverId);
        result.success++;
      } catch (err: any) {
        await markSyncFailed(item.id, err.message);
        result.failed++;
      }
    }
  }

  // ─── Sunucudan veri çek (pull) ────────────────────────────────────────────
  async pullWorkOrders(): Promise<void> {
    if (!(await this.isOnline())) return;

    const token = await getAuthToken();
    if (!token) return;

    const client = axios.create({
      baseURL: API_URL,
      headers: { Authorization: `Bearer ${token}` },
    });

    const res = await client.get('/work-orders/my');
    const workOrders = res.data?.data || [];

    const { saveWorkOrders, cacheFormTemplate, cacheEquipment } = await import('./offline-db');
    await saveWorkOrders(workOrders);

    // Form şablonlarını ve ekipmanları da önbelleğe al
    for (const wo of workOrders) {
      for (const item of wo.equipmentItems || []) {
        if (item.equipment) await cacheEquipment(item.equipment);
        if (item.formTemplate) await cacheFormTemplate(item.formTemplate);
      }
    }

    console.log(`[Sync] ${workOrders.length} iş emri çekildi`);
  }
}

// ─── Background sync task ─────────────────────────────────────────────────────
TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    await SyncEngine.getInstance().sync();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  await BackgroundFetch.registerTaskAsync(SYNC_TASK, {
    minimumInterval: 15 * 60, // 15 dakika
    stopOnTerminate: false,
    startOnBoot: true,
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface SyncStatus {
  status: 'idle' | 'syncing' | 'success' | 'error';
  message?: string;
}

export interface SyncResult {
  success: number;
  failed: number;
  conflicts: Array<{ localId: string; message: string }>;
}

// ─── Secure Storage helpers ───────────────────────────────────────────────────
// src/lib/secure-storage.ts (inline basit versiyon)
export async function getAuthToken(): Promise<string | null> {
  const SecureStore = await import('expo-secure-store');
  return SecureStore.getItemAsync('access_token');
}

export async function setAuthToken(token: string): Promise<void> {
  const SecureStore = await import('expo-secure-store');
  await SecureStore.setItemAsync('access_token', token);
}
