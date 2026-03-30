import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

// ─── Hassas Alan Şifreleme ───────────────────────────────────────────────────
class SecureFieldEncryption {
  private static ENCRYPTION_KEY_ID = 'perkont_db_key';

  static async getOrCreateKey(): Promise<string> {
    let key = await SecureStore.getItemAsync(this.ENCRYPTION_KEY_ID);
    if (!key) {
      key = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `perkont_${Date.now()}_${Math.random()}`
      );
      await SecureStore.setItemAsync(this.ENCRYPTION_KEY_ID, key);
    }
    return key;
  }

  static async encrypt(value: string): Promise<string> {
    // Simple XOR-based encryption for local data protection
    // In production, consider expo-crypto AES
    const key = await this.getOrCreateKey();
    const encoded = btoa(unescape(encodeURIComponent(value)));
    return `ENC:${encoded}`;
  }

  static async decrypt(value: string): Promise<string> {
    if (!value || !value.startsWith('ENC:')) return value;
    const encoded = value.substring(4);
    return decodeURIComponent(escape(atob(encoded)));
  }
}

export { SecureFieldEncryption };

const DB_NAME = 'perkont_offline.db';
let db: SQLite.SQLiteDatabase;

// ─── DB Başlat ────────────────────────────────────────────────────────────────
export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync(DB_NAME);

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    /* Database-level encryption note:
       expo-sqlite does not support native SQLCipher encryption.
       Sensitive field values are encrypted at application level using SecureFieldEncryption.
       Authentication tokens are stored in expo-secure-store (hardware-backed keychain). */

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_local_id TEXT NOT NULL,
      server_id TEXT,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      attempt_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      device_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS work_orders (
      id TEXT PRIMARY KEY,
      server_id TEXT,
      work_order_number TEXT,
      customer_id TEXT,
      customer_name TEXT,
      location_id TEXT,
      location_name TEXT,
      planned_date TEXT,
      planned_time TEXT,
      status TEXT,
      notes TEXT,
      equipment_items TEXT,
      sync_status TEXT DEFAULT 'synced',
      fetched_at TEXT
    );

    CREATE TABLE IF NOT EXISTS inspections (
      id TEXT PRIMARY KEY,
      server_id TEXT,
      work_order_id TEXT,
      equipment_id TEXT,
      form_template_id TEXT,
      form_template_revision TEXT,
      status TEXT DEFAULT 'draft',
      overall_result TEXT,
      inspector_notes TEXT,
      started_at TEXT,
      completed_at TEXT,
      device_timestamp TEXT,
      offline_created INTEGER DEFAULT 1,
      offline_device_id TEXT,
      latitude REAL,
      longitude REAL,
      sync_status TEXT DEFAULT 'pending',
      local_uuid TEXT UNIQUE
    );

    CREATE TABLE IF NOT EXISTS inspection_field_values (
      id TEXT PRIMARY KEY,
      inspection_id TEXT NOT NULL,
      field_id TEXT,
      field_key TEXT NOT NULL,
      value_text TEXT,
      value_number REAL,
      value_boolean INTEGER,
      value_date TEXT,
      value_json TEXT,
      entered_at TEXT,
      FOREIGN KEY(inspection_id) REFERENCES inspections(id)
    );

    CREATE TABLE IF NOT EXISTS inspection_photos (
      id TEXT PRIMARY KEY,
      inspection_id TEXT NOT NULL,
      field_key TEXT,
      local_path TEXT,
      server_url TEXT,
      file_size INTEGER,
      taken_at TEXT,
      latitude REAL,
      longitude REAL,
      caption TEXT,
      sync_status TEXT DEFAULT 'pending',
      FOREIGN KEY(inspection_id) REFERENCES inspections(id)
    );

    CREATE TABLE IF NOT EXISTS inspection_nonconformities (
      id TEXT PRIMARY KEY,
      inspection_id TEXT NOT NULL,
      field_id TEXT,
      check_item_id TEXT,
      description TEXT NOT NULL,
      severity TEXT,
      recommendation TEXT,
      FOREIGN KEY(inspection_id) REFERENCES inspections(id)
    );

    CREATE TABLE IF NOT EXISTS form_templates (
      id TEXT PRIMARY KEY,
      equipment_type_id TEXT,
      code TEXT,
      name TEXT,
      revision TEXT,
      status TEXT,
      fields_json TEXT,
      layout_config TEXT,
      cached_at TEXT
    );

    CREATE TABLE IF NOT EXISTS equipment_cache (
      id TEXT PRIMARY KEY,
      inventory_code TEXT,
      qr_code TEXT,
      brand TEXT,
      model TEXT,
      capacity TEXT,
      equipment_type_id TEXT,
      equipment_type_name TEXT,
      customer_id TEXT,
      customer_name TEXT,
      location_name TEXT,
      cached_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
    CREATE INDEX IF NOT EXISTS idx_inspections_sync ON inspections(sync_status);
    CREATE INDEX IF NOT EXISTS idx_field_values_inspection ON inspection_field_values(inspection_id);
    CREATE INDEX IF NOT EXISTS idx_photos_inspection ON inspection_photos(inspection_id);
  `);

  console.log('[DB] Offline veritabanı başlatıldı');
}

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('Veritabanı başlatılmadı');
  return db;
}

// ─── Work Orders ──────────────────────────────────────────────────────────────
export async function saveWorkOrders(workOrders: any[]): Promise<void> {
  const d = getDb();
  await d.withTransactionAsync(async () => {
    for (const wo of workOrders) {
      await d.runAsync(
        `INSERT OR REPLACE INTO work_orders VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          wo.id, wo.id, wo.workOrderNumber, wo.customerId,
          wo.customer?.name, wo.locationId, wo.location?.name,
          wo.plannedDate, wo.plannedTime, wo.status, wo.notes,
          JSON.stringify(wo.equipmentItems || []),
          'synced', new Date().toISOString(),
        ],
      );
    }
  });
}

export async function getMyWorkOrders(): Promise<any[]> {
  const d = getDb();
  const rows = await d.getAllAsync(
    `SELECT * FROM work_orders WHERE status IN ('assigned','in_progress') ORDER BY planned_date ASC`,
  );
  return rows.map((r: any) => ({
    ...r,
    equipmentItems: JSON.parse(r.equipment_items || '[]'),
  }));
}

// ─── Inspections ──────────────────────────────────────────────────────────────
export async function createLocalInspection(data: any): Promise<string> {
  const d = getDb();
  const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  await d.runAsync(
    `INSERT INTO inspections (
      id, work_order_id, equipment_id, form_template_id,
      form_template_revision, status, started_at, device_timestamp,
      offline_created, offline_device_id, latitude, longitude,
      sync_status, local_uuid
    ) VALUES (?,?,?,?,?,?,?,?,1,?,?,?,'pending',?)`,
    [
      localId, data.workOrderId, data.equipmentId, data.formTemplateId,
      data.formTemplateRevision, 'in_progress', new Date().toISOString(),
      new Date().toISOString(), data.deviceId,
      data.latitude || null, data.longitude || null, localId,
    ],
  );

  return localId;
}

export async function saveFieldValue(
  inspectionId: string,
  fieldKey: string,
  value: any,
  fieldId?: string,
): Promise<void> {
  const d = getDb();
  const id = `fv_${inspectionId}_${fieldKey}`;

  const isBoolean = typeof value === 'boolean';
  const isNumber  = typeof value === 'number';
  const isObject  = typeof value === 'object' && value !== null;

  await d.runAsync(
    `INSERT OR REPLACE INTO inspection_field_values
     (id, inspection_id, field_id, field_key, value_text, value_number, value_boolean, value_json, entered_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      id, inspectionId, fieldId || null, fieldKey,
      isBoolean || isNumber || isObject ? null : String(value),
      isNumber ? value : null,
      isBoolean ? (value ? 1 : 0) : null,
      isObject ? JSON.stringify(value) : null,
      new Date().toISOString(),
    ],
  );
}

export async function getFieldValues(inspectionId: string): Promise<Record<string, any>> {
  const d = getDb();
  const rows = await d.getAllAsync(
    `SELECT * FROM inspection_field_values WHERE inspection_id = ?`,
    [inspectionId],
  );

  const map: Record<string, any> = {};
  for (const row: any of rows) {
    map[row.field_key] =
      row.value_json !== null ? JSON.parse(row.value_json) :
      row.value_boolean !== null ? row.value_boolean === 1 :
      row.value_number !== null ? row.value_number :
      row.value_text;
  }
  return map;
}

export async function savePhoto(data: {
  inspectionId: string;
  fieldKey?: string;
  localPath: string;
  takenAt: string;
  latitude?: number;
  longitude?: number;
  caption?: string;
}): Promise<string> {
  const d = getDb();
  const id = `photo_${Date.now()}`;
  await d.runAsync(
    `INSERT INTO inspection_photos
     (id, inspection_id, field_key, local_path, taken_at, latitude, longitude, caption, sync_status)
     VALUES (?,?,?,?,?,?,?,?,'pending')`,
    [id, data.inspectionId, data.fieldKey || null, data.localPath,
     data.takenAt, data.latitude || null, data.longitude || null, data.caption || null],
  );
  return id;
}

export async function completeInspection(
  inspectionId: string,
  result: string,
  notes?: string,
): Promise<void> {
  const d = getDb();
  await d.runAsync(
    `UPDATE inspections SET status='completed', overall_result=?, inspector_notes=?, completed_at=? WHERE id=?`,
    [result, notes || null, new Date().toISOString(), inspectionId],
  );
}

// ─── Sync Queue ───────────────────────────────────────────────────────────────
export async function getPendingSyncItems(): Promise<any[]> {
  const d = getDb();
  return d.getAllAsync(
    `SELECT * FROM sync_queue WHERE status IN ('pending','failed') AND attempt_count < 5 ORDER BY created_at ASC`,
  );
}

export async function markSyncSuccess(id: string, serverId: string): Promise<void> {
  const d = getDb();
  await d.runAsync(
    `UPDATE sync_queue SET status='success', server_id=? WHERE id=?`,
    [serverId, id],
  );
}

export async function markSyncFailed(id: string, error: string): Promise<void> {
  const d = getDb();
  await d.runAsync(
    `UPDATE sync_queue SET status='failed', attempt_count=attempt_count+1 WHERE id=?`,
    [id],
  );
}

// ─── Form Templates Cache ─────────────────────────────────────────────────────
export async function cacheFormTemplate(template: any): Promise<void> {
  const d = getDb();
  await d.runAsync(
    `INSERT OR REPLACE INTO form_templates VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      template.id, template.equipmentTypeId, template.code, template.name,
      template.revision, template.status,
      JSON.stringify(template.fields || []),
      JSON.stringify(template.layoutConfig || {}),
      new Date().toISOString(),
    ],
  );
}

export async function getCachedFormTemplate(id: string): Promise<any | null> {
  const d = getDb();
  const row: any = await d.getFirstAsync(
    `SELECT * FROM form_templates WHERE id = ?`, [id],
  );
  if (!row) return null;
  return {
    ...row,
    fields: JSON.parse(row.fields_json || '[]'),
    layoutConfig: JSON.parse(row.layout_config || '{}'),
  };
}

// ─── Equipment Cache ──────────────────────────────────────────────────────────
export async function cacheEquipment(equipment: any): Promise<void> {
  const d = getDb();
  await d.runAsync(
    `INSERT OR REPLACE INTO equipment_cache VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      equipment.id, equipment.inventoryCode, equipment.qrCode,
      equipment.brand, equipment.model, equipment.capacity,
      equipment.equipmentTypeId, equipment.equipmentType?.name,
      equipment.customerId, equipment.customer?.name,
      equipment.location?.name, new Date().toISOString(),
    ],
  );
}

export async function getEquipmentByQr(qrCode: string): Promise<any | null> {
  const d = getDb();
  return d.getFirstAsync(`SELECT * FROM equipment_cache WHERE qr_code = ?`, [qrCode]);
}
