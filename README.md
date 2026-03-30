# PerKont — Akredite İş Ekipmanları Periyodik Kontrol Yönetim Sistemi

ISO/IEC 17020 uyumlu, tam kapsamlı periyodik kontrol yönetim sistemi.

## Proje Yapısı

```
perkont/
├── backend/     # NestJS API — tüm iş mantığı
├── frontend/    # Next.js 14 Web Uygulaması
└── mobile/      # React Native (Expo) Saha Uygulaması
```

## Hızlı Başlangıç

### 1. Backend

```bash
cd backend
cp .env.example .env
# .env dosyasını düzenleyin

# Docker ile tüm altyapıyı başlat
docker-compose up -d postgres redis minio

# Bağımlılıkları yükle
npm install

# Migrations çalıştır
npm run migration:run

# Geliştirme modunda başlat
npm run start:dev
```

API: http://localhost:3000/api/v1  
Swagger: http://localhost:3000/docs

### 2. Frontend

```bash
cd frontend
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1

npm install
npm run dev
```

Web: http://localhost:3001

### 3. Mobil (React Native)

```bash
cd mobile
cp .env.example .env
# EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1

npm install
npx expo start
```

## Temel Modüller

| Modül | Açıklama |
|-------|----------|
| Auth | JWT, Refresh Token, MFA (TOTP) |
| Customers | Müşteri ve lokasyon yönetimi |
| Equipment | Ekipman envanteri, QR etiket, kontrol takvimi |
| Form Templates | Revizyon yönetimi, PDF şablon, koordinat mapping |
| Work Orders | Planlama, atama, durum takibi |
| Inspections | Offline-first saha denetimi, sync engine |
| Reports | Koordinat bazlı PDF üretimi, e-imza, arşiv |
| LOGO | ERP entegrasyonu, kuyruk yönetimi, retry |
| Notifications | E-posta (SMTP), SMS (Netgsm), in-app |
| Audit Trail | Append-only, akreditasyon uyumlu kayıt |
| Dashboard | Rol bazlı KPI panelleri |

## Akreditasyon Uyumluluğu

- ISO/IEC 17020:2012 tam uyum
- Form revizyon yönetimi
- Değiştirilemez imzalı rapor arşivi
- Audit trail — her değişiklik kayıt altında
- Personel yetkinlik ve sertifika takibi
- Kalibrasyon ve ölçüm ekipmanı yönetimi

## Teknoloji Stack

**Backend:** NestJS · TypeORM · PostgreSQL · Redis · BullMQ · MinIO  
**Frontend:** Next.js 14 · TanStack Query · Tailwind CSS · Recharts  
**Mobile:** React Native (Expo) · SQLite (offline) · expo-camera  
**Altyapı:** Docker · Nginx · GitHub Actions

## Production Deployment

```bash
cd backend
docker-compose -f docker-compose.prod.yml up -d
```

Detaylı deployment kılavuzu için `/docs/deployment.md` dosyasına bakın.

---

© PerKont — Tüm hakları saklıdır.
