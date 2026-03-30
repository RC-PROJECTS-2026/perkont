# PerKont — Geliştirici Dokümantasyonu

## İçindekiler

1. [Mimari Genel Bakış](#mimari)
2. [Kurulum](#kurulum)
3. [Geliştirme Ortamı](#geliştirme)
4. [Modül Dokümantasyonu](#modüller)
5. [API Referansı](#api)
6. [Offline Sync Mimarisi](#offline-sync)
7. [Form Motoru](#form-motoru)
8. [LOGO Entegrasyonu](#logo)
9. [E-İmza](#e-imza)
10. [Deployment](#deployment)
11. [Test Stratejisi](#testler)
12. [Akreditasyon Uyumu](#akreditasyon)

---

## Mimari

```
perkont/
├── backend/          # NestJS API (Port 3000)
│   ├── src/
│   │   ├── common/   # Shared decorators, guards, DTOs
│   │   ├── config/   # App, DB, JWT, Redis configs
│   │   ├── database/ # Migrations, seeds
│   │   └── modules/  # Feature modules
│   ├── test/         # E2E tests
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── frontend/         # Next.js 14 Web App (Port 3001)
│   └── src/
│       ├── app/      # App Router pages
│       ├── components/
│       ├── lib/      # API client, utilities
│       └── store/    # Zustand stores
│
└── mobile/           # React Native (Expo)
    ├── app/          # Expo Router screens
    └── src/
        ├── screens/
        └── lib/      # Offline DB, Sync Engine
```

## Kurulum

### Gereksinimler
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16 (veya Docker)
- Redis 7 (veya Docker)
- MinIO (veya Docker)

### Hızlı Başlangıç

```bash
# 1. Repoyu klonla
git clone https://github.com/org/perkont.git
cd perkont

# 2. Altyapıyı başlat
cd backend
docker-compose up -d postgres redis minio

# 3. Backend kur ve başlat
cp .env.example .env
# .env dosyasını düzenle
npm install
npm run migration:run
npm run start:dev

# 4. Frontend (yeni terminal)
cd ../frontend
cp .env.example .env.local
npm install
npm run dev

# 5. Mobil (yeni terminal)
cd ../mobile
cp .env.example .env
npm install
npx expo start
```

## Modüller

### Backend Modülleri

| Modül | Açıklama | Temel Endpoint'ler |
|-------|----------|-------------------|
| `auth` | JWT, MFA, şifre yönetimi | `/auth/login`, `/auth/mfa/*` |
| `users` | Kullanıcı ve yetkinlik | `/users`, `/users/:id/qualifications` |
| `customers` | CRM | `/customers`, `/customers/:id/locations` |
| `equipment` | Ekipman envanteri | `/equipment`, `/equipment/by-qr/:code` |
| `form-templates` | Form motoru | `/form-templates`, `/form-templates/:id/activate` |
| `work-orders` | İş emri yönetimi | `/work-orders`, `/work-orders/my` |
| `inspections` | Saha denetimi | `/inspections`, `/inspections/sync/offline` |
| `reports` | Rapor ve PDF | `/reports`, `/reports/:id/sign/*` |
| `logo` | ERP entegrasyonu | `/logo/queue`, `/logo/customers/:id/map` |
| `calibration` | Ölçüm aleti takibi | `/calibration`, `/calibration/expiring` |
| `capa` | Düzeltici faaliyet | `/capa`, `/capa/:id/close` |
| `complaints` | Şikayet/itiraz | `/complaints`, `/complaints/:id/resolve` |
| `internal-audit` | İç tetkik | `/internal-audit/plans`, `/internal-audit/findings` |
| `contracts` | Sözleşme | `/contracts`, `/contracts/:id/sign/:party` |
| `quotations` | Teklif | `/quotations`, `/quotations/:id/accept` |
| `accreditation` | Kapsam, tarafsızlık | `/accreditation/scopes`, `/accreditation/declarations` |
| `dashboard` | KPI panelleri | `/dashboard`, `/dashboard/technical-manager` |
| `audit` | Denetim izi | `/audit`, `/audit/entity/:type/:id` |
| `notifications` | Bildirim | `/notifications`, `/notifications/unread-count` |

## API

Swagger UI: `http://localhost:3000/docs`

### Auth Headers
```
Authorization: Bearer <access_token>
```

### Standart Yanıt Formatı
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/v1/customers"
}
```

### Hata Yanıtı
```json
{
  "success": false,
  "statusCode": 400,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/v1/customers",
  "message": "Bu kod zaten kayıtlı"
}
```

## Offline Sync Mimarisi

Mobil uygulama offline-first tasarlanmıştır:

```
Cihaz başlatma:
1. initDatabase() → SQLite schema oluşturulur
2. Bağlantı varsa: pullWorkOrders() → iş emirleri + ekipman + form şablonları indirilir
3. Tüm veri local SQLite'da şifreli saklanır

Denetim süreci (offline):
1. createLocalInspection() → local UUID ile kayıt
2. saveFieldValue() → her alan girişinde SQLite güncellenir
3. savePhoto() → fotoğraf local file system'e kaydedilir
4. completeInspection() → status='completed' yapılır

Senkronizasyon (çevrimiçi gelince):
1. SyncEngine.sync() tetiklenir
2. POST /inspections/sync/offline → tüm denetim verisi tek pakette gönderilir
3. Fotoğraflar: presigned URL ile S3'e direkt yüklenir
4. Conflict var ise: kullanıcıya gösterilir
```

### Conflict Resolution Kuralları
- `completed` denetim > sunucudaki `draft` → local kazanır
- `approved` veya `rejected` rapor → conflict döner, kullanıcı karar verir
- Fotoğraflar → her zaman local yeni fotoğraf eklenir

## Form Motoru

Formlar iki katmanlıdır:

**1. Form Definition (JSON)**
```json
{
  "fields": [
    {
      "fieldKey": "capacity",
      "label": "Kapasite",
      "fieldType": "number",
      "unit": "ton",
      "isRequired": true,
      "pdfCoordinate": { "page": 1, "x": 120, "y": 215, "width": 80, "fontSize": 10 }
    }
  ]
}
```

**2. PDF Overlay**
- Firma orijinal PDF şablonu yüklenir
- `pdf-lib` ile her alanın koordinatına değer yazılır
- Sonuç: firmadan alınan formun birebir aynısı

**Revizyon Yönetimi:**
- Her ekipman tipinde tek `active` form olabilir
- Yeni revizyon aktif edilince eskisi `superseded` olur
- Her rapor, üretildiği andaki form revizyonuyla ilişkilendirilir

## LOGO Entegrasyonu

### Akış
```
1. logoService.syncCustomer(customerId)
   → logo_sync_queue tablosuna eklenir

2. @Cron('*/2 * * * *') processQueue()
   → LogoApiClient.getCariKart(code)
   → Varsa updateCariKart(), yoksa createCariKart()
   → Customer.logoCariId güncellenir

3. logoService.createInvoice(workOrderId, ...)
   → Fatura kuyruğa eklenir
   → LogoApiClient.createInvoice() çağrılır
   → Logo fatura no geri döner
```

### Hata Yönetimi
- Max 5 deneme, exponential backoff (2, 4, 8, 16 dakika)
- 5. denemeden sonra `failed` → finans kullanıcısına alarm
- Manuel retry: `POST /logo/queue/:id/retry`
- Toplu retry: `POST /logo/queue/retry-all-failed`

## E-İmza

```
1. techManager → POST /reports/:id/sign/initiate { phone }
   → PDF hash hesaplanır
   → TürkTrust API'ye gönderilir
   → SMS OTP gönderilir
   → Report status: under_signing

2. techManager → POST /reports/:id/sign/complete { sessionId, otpCode }
   → TürkTrust imzalı PDF döndürür (PAdES-B-LT)
   → İmzalı PDF MinIO archive bucket'a taşınır (değiştirilemez)
   → SHA-256 hash kaydedilir
   → Report status: signed

3. QR Doğrulama:
   → GET /reports/verify/:reportNumber
   → Hash karşılaştırması yapılır
   → Geçerlilik bilgisi döner
```

### Geliştirme Ortamında Mock
`.env` dosyasında `ESIGN_PROVIDER=mock` ayarlayın.
Mock sağlayıcı OTP gerektirmez, PDF metadata'ya imza ekler.

## Deployment

### Production Deployment Adımları

```bash
# 1. Sunucuya SSH bağlan
ssh user@prod-server

# 2. Klasör oluştur
mkdir -p /opt/perkont && cd /opt/perkont

# 3. .env dosyasını oluştur (tüm değerleri doldur)
cp .env.example .env
nano .env

# 4. SSL sertifikaları yerleştir
mkdir -p nginx/ssl
# fullchain.pem ve privkey.pem dosyalarını kopyala

# 5. İlk kurulum
docker-compose -f docker-compose.prod.yml up -d postgres redis minio
sleep 10

# 6. Migration çalıştır
docker run --rm --env-file .env \
  ghcr.io/org/perkont/backend:latest \
  node dist/main migration:run

# 7. Tüm servisleri başlat
docker-compose -f docker-compose.prod.yml up -d
```

### Yedekleme

```bash
# PostgreSQL dump (günlük cron)
0 2 * * * docker exec perkont-postgres pg_dump -U $DB_USERNAME $DB_DATABASE | \
  gzip > /backups/perkont_$(date +%Y%m%d).sql.gz

# 90 günden eski yedekleri sil
find /backups -name "*.sql.gz" -mtime +90 -delete
```

## Testler

### Unit Testler

```bash
cd backend
npm test                    # Tüm testler
npm test -- --watch        # Watch mode
npm test -- --coverage     # Coverage raporu
npm test auth.service.spec  # Belirli test
```

### E2E Testler

```bash
# Test DB gerektirir
NODE_ENV=test npm run test:e2e
```

### Test Kapsama Hedefleri

| Modül | Unit Test | E2E |
|-------|-----------|-----|
| Auth | ✅ Tam | ✅ |
| Inspections | ✅ Tam | ✅ |
| Reports + PDF | ✅ Tam | ✅ |
| LOGO | ✅ Tam | - |
| Form Templates | Kısmi | - |

## Akreditasyon Uyumu (ISO/IEC 17020:2012)

| Madde | Gereksinim | Sistem Karşılığı |
|-------|-----------|-----------------|
| 4 | Tarafsızlık | `impartiality_declarations` tablosu |
| 6.2 | Personel yetkinlik | `inspector_qualifications`, expiry uyarıları |
| 7.4 | Muayene yöntemleri | Form motoru, standart referansları |
| 7.5 | Şikayet/itiraz | `complaints` modülü |
| 8.3 | Kayıt kontrolü | Audit trail, değiştirilemez arşiv |
| 8.4 | Kayıtların kontrolü | `audit_logs` append-only tablo |
| 8.6 | İç tetkik | `internal_audit` modülü |
| 8.7 | YGG | `management_reviews` tablosu |

### Kritik Akreditasyon Notları

1. **Audit trail silinmez**: `audit_logs` tablosuna sadece INSERT yapılabilir.
   DB seviyesinde `REVOKE DELETE, UPDATE ON audit_logs FROM app_user;`

2. **İmzalı raporlar değiştirilemez**: `StorageBucket.ARCHIVE` bucket'ına
   sadece yazma izni vardır, silme/güncelleme yoktur.

3. **Form revizyonu izleme**: Her rapor, oluşturulduğu andaki form revizyonunu
   `formTemplateRevision` alanında saklar.

4. **Offline timestamp güvenliği**: Her kayıt hem `deviceTimestamp`
   hem `serverTimestamp` içerir. İkisi de arşivde mevcuttur.

---

© 2024 PerKont. ISO/IEC 17020:2012 Uyumlu Periyodik Kontrol Yönetim Sistemi.
