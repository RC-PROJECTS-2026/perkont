# PerKont — Technical Review Brief

ISO/IEC 17020 uyumlu periyodik kontrol yonetim sistemi.
Akredite is ekipmani denetim sureci: CRM → Teklif → Sozlesme → Is Emri → Denetim → Rapor → E-Imza → Teslim → Fatura.

---

## 1. Arsitektur

```
┌─────────────┐   ┌──────────────┐   ┌──────────────┐
│  Next.js 14  │   │ React Native │   │   Customer   │
│   Frontend   │   │    Mobile    │   │    Portal    │
│  (SPA + SSR) │   │   (Expo)     │   │  (Next.js)   │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │                  │                   │
       └──────────────────┼───────────────────┘
                          │ REST + WebSocket
                    ┌─────▼─────┐
                    │  NestJS   │ ← API Gateway (2 instance, Nginx LB)
                    │  10.3.0   │
                    └─────┬─────┘
          ┌───────────────┼───────────────┐
          │               │               │
    ┌─────▼─────┐  ┌──────▼──────┐  ┌────▼────┐
    │  MySQL 8   │  │   Redis     │  │  MinIO  │
    │  + Replica │  │  (Cache +   │  │  (S3)   │
    │            │  │   Queue)    │  │         │
    └───────────┘  └─────────────┘  └─────────┘
```

**Stack:**
- Backend: NestJS 10 + TypeORM 0.3 + TypeScript 5.3
- DB: MySQL 8.0 (utf8mb4, connection pool: 50)
- Cache: Redis (ioredis 5.3, dashboard 30s TTL)
- Queue: Bull 4.12 (Redis-backed, Logo ERP sync)
- Storage: MinIO (S3-compatible, presigned URLs)
- Auth: JWT + Refresh Token + TOTP MFA (Speakeasy)
- PDF: pdf-lib (coordinate-based template overlay, SHA-256 hash)
- E-Sign: TurkTrust entegrasyonu
- Frontend: Next.js 14, TanStack Query, Radix UI, Tailwind
- Mobile: React Native (Expo), offline-first SQLite sync

**Sayilar:**
- 155 TypeScript dosyasi
- 21,087 satir kaynak kodu (test haric)
- 26 entity, 40 controller, 49 service
- 45 feature module
- 7 migration

---

## 2. Veritabani Tasarimi

### Core Entities
```
companies (multi-tenant root)
  └── users (9 rol: admin, sales, planner, inspector, technical_manager, finance, executive, customer_rep, customer)
  └── customers (10K+ hedef)
        └── customer_locations (1-20 per customer)
              └── equipment (500K+ hedef, 50 tip)
                    └── work_orders → inspections → reports
```

### State Machines

**Proposal:** `draft → sent → accepted/rejected/revision_requested/expired`
- Transition validation: `VALID_TRANSITIONS` map ile kontrol
- Expired teklif kabul edilemez (validUntil check)
- Kabul → otomatik sozlesme olusturma

**Work Order:** `draft → planned → assigned → in_progress → completed → report_pending → report_approved → invoiced`
- contractRequired company setting kontrolu
- noContractRisk flag + audit log

**Inspection:** `draft → in_progress → completed → submitted → under_review → approved/rejected/revision_requested`
- Optimistic locking (version column)
- Zorunlu alan validation (form template fields)
- revision_requested → field edit → otomatik in_progress gecisi

**Report:** `under_review → approved → under_signing → signed → delivered`
- PDF hash verification (SHA-256) before e-sign
- Stale signing recovery cron (10dk, UNDER_SIGNING → APPROVED)
- Immutable archive (MinIO signed PDF)

### Indexes
22 composite index (performance migration hazir):
- `equipment(status, nextControlDate)` — kontrol takvimi
- `work_orders(customerId, status)` — is emri listeleme
- `inspections(inspectorId, status)` — denetci paneli
- `reports(status, createdAt)` — onay bekleyen raporlar
- `audit_logs(entityType, entityId)` — entity gecmisi
- `customers(companyId)` — tenant izolasyon

---

## 3. Guvenlik

### Multi-Tenant Izolasyon (3 katman)

**Katman 1 — Global TenantGuard:**
```typescript
// app.module.ts → APP_GUARD
// Her request'te JWT'den companyId okunur, request.companyId set edilir
// Client header injection engellenir (X-Company-Id, X-Tenant-Id ignore)
```

**Katman 2 — Service findAll filtresi:**
```typescript
// Tum 10 kritik moduldeki findAll methodlarinda:
if (filters.companyId) {
  qb.innerJoin('customers', 'cust', 'cust.id = x.customerId')
    .andWhere('cust.companyId = :companyId', { companyId: filters.companyId });
}
```

**Katman 3 — Controller findOne korumasi:**
```typescript
// verifyTenantAccess helper — entity tipi + id + companyId ile DB check
// Yanlis tenant'in kaydi istendirse ForbiddenException
async findOne(@Param('id') id: string, @Req() req: any) {
  await verifyTenantAccess(this.dataSource, 'work_order', id, req.companyId);
  return this.service.findOne(id);
}
```

**Kapsam:** customers, equipment, work-orders, inspections, reports, contracts, proposals, sales-pipeline, quotations, dashboard — **tum findAll + findOne korunuyor.**

### Authentication
- JWT access token (15dk) + refresh token (7 gun, hashed, rotated)
- Account lockout: 5 basarisiz giris → 30dk kilit
- MFA: TOTP (Google Authenticator uyumlu)
- `isActive` check: JWT strategy (her istek) + refresh token
- Password: bcrypt 12 rounds

### Authorization
- 9 rol RBAC: `@Roles(UserRole.TECHNICAL_MANAGER, UserRole.ADMIN)`
- Admin bypass
- Controller seviyesinde UseGuards(AuthGuard, RolesGuard)

### SQL Injection
- Tum raw SQL parameterize edildi (work-orders, admin, proposals)
- TypeORM QueryBuilder + parameterized queries

### Audit Trail
- Immutable audit_logs tablosu (CreateDateColumn only, no UPDATE/DELETE)
- Kritik islemlerde otomatik log: login, customer CRUD, WO status change, inspection approve, report sign

---

## 4. Performans

### N+1 Query Fix
```
Onceki (getMyWorkOrders):
  20 WO × 5 ekipman = 100 ayri DB sorgusu

Sonraki:
  1 WO query + 1 batch equipment query + 1 batch formTemplate query = 3 sorgu
```

### Dashboard Cache
```typescript
// Redis 30s TTL, tenant-aware cache key
const cacheKey = `dashboard:main:${companyId}`;
// Graceful degradation: Redis yoksa DB'den cekilir
```

### Staging Benchmark (10K customer, 313K equipment)
```
Equipment tablosu: 117MB data + 215MB index
Customers tablosu: 3.1MB data + 4.3MB index
Work Orders: 11.5MB data + 44.7MB index

Customer list (companyId filter): INDEX SCAN, 5223 rows
WO list (status+planned): INDEX SCAN, 166 rows
Equipment due controls: INDEX SCAN (idx_eq_status_cust)
```

---

## 5. Test ve QA

### Unit Test Sonuclari
```
Test Suites: 7 passed, 7 total
Tests:       78 passed, 78 total
Time:        24.3s

auth.service.spec.ts         — 12 test (login, lockout, MFA, token refresh, password)
customers.service.spec.ts    — 9 test (CRUD, uniqueness, tenant)
equipment.service.spec.ts    — 17 test (CRUD, validation, QR, bulk import)
form-templates.service.spec  — 14 test (create, activate, revision, PDF upload)
inspections.service.spec.ts  — 10 test (start, field values, complete, offline sync)
logo.service.spec.ts         — 4 test (queue processing, retry)
reports.service.spec.ts      — 12 test (create, approve, sign, hash verify, deliver)
```

### Build
```
TypeScript: 0 error, 0 warning
NestJS build: basarili
```

### Hazir Test Altyapisi (staging icin)
- Seed generator: 10K customer + 500K equipment (71 saniyede yuklendi)
- k6 load test: 100 VU, 7 rol, SLA thresholds
- Playwright E2E: 14 senaryo
- SQL EXPLAIN checklist: 25+ kritik sorgu
- Security test suite: tenant leak, SQL injection, auth bypass, IDOR
- Docker Compose test ortami

---

## 6. Monitoring ve Incident Management

### Monitoring Arsitekturesi
```
MonitoringInterceptor (Global, her request)
  ├── X-Request-Id correlation header
  ├── Route normalization (UUID → :id)
  └── Endpoint-bazli latency + error tracking

MonitoringService (Cron, her dakika)
  ├── API: totalRequests, errorRate, p95, p99, topEndpoints, errorsByStatus
  ├── Redis: connected, cacheHits/Misses, hitRate, memoryUsedMb
  ├── Queue: logo(pending/failed/stuck), notifications(pending/failed)
  ├── MinIO: connected, upload/downloadErrors, latency, fileNotFound
  ├── DB: connected, pool, slowQueryCount, recentSlowQueries (with endpoint)
  ├── Business: lastHour(WO/insp/report/proposal), stuckStates
  ├── System: memory%, cpu%, loadAvg
  └── 25 alert threshold → escalation (3 level) → email notification

HealthController (GET /health)
  ├── database ping
  ├── Redis ping + memory
  ├── MinIO bucket list
  └── Queue stuck job check
```

### Alert Sistemi
- 25 threshold kurali (API, Redis, Queue, MinIO, DB, Business, System)
- 3 seviye escalation: initial → followup → critical escalation
- Alert ownership: backend / devops / finance / all
- Cooldown: 1-30dk (severity bazli)
- Acknowledge endpointi
- 14 incident playbook (senaryo bazli mudahale plani)

---

## 7. Bilinen Limitasyonlar ve Teknik Borc

### Mimari
1. **Monolithic modüller**: proposals, sales-pipeline, contract-engine tek dosyada (~1000+ satir). Entity + Service + Controller ayrilmali.
2. **TypeORM save() type casting**: `.save()` donus tipi `T | T[]` belirsiz — `as unknown as T` cast'leri var.
3. **Inline entity definition**: Bazi moduller (proposals, sales-pipeline) entity'leri ayri dosyada degil, module icinde tanimli.

### Performans
4. **WO create() N+1**: Equipment loop icinde findOne cagrilari (max 20-30 item, tolere edilir ama batch load ideal).
5. **syncOffline() N+1**: Photo/instrument kayitlari loop icinde insert (batch insert ideal).
6. **Extended dashboard cache yok**: getExtendedDashboard() 7 agir sorgu her seferinde calisir.

### Operasyonel
7. **Renewal cron idempotency**: sales-pipeline cron'u unique constraint degil, sadece NOT IN subquery ile duplicate engelliyor.
8. **Redis zorunlu degil**: Queue (Bull) Redis bagimli ama dashboard cache graceful degrade.

---

## 8. Bu Calisma Kapsaminda Yapilan Degisiklikler

### Ozet
- **40 kaynak dosya** degistirildi
- **3 yeni dosya** olusturuldu (tenant-verify.helper, monitoring.module, PerformanceIndexes migration)
- **7 test spec** guncellendi
- **15 test/doc dosyasi** olusturuldu

### Guvenlik Fixleri (P0)
| Fix | Dosya | Detay |
|-----|-------|-------|
| Tenant izolasyon (findAll) | 10 service + 10 controller | companyId filtresi eklendi |
| Tenant izolasyon (findOne) | 10 controller | verifyTenantAccess helper |
| Global TenantGuard | tenant.guard.ts, app.module.ts | Header injection engeli |
| SQL injection | work-orders.service, admin.module | Parameterized queries |

### Performans Fixleri (P1)
| Fix | Dosya | Detay |
|-----|-------|-------|
| N+1 query | work-orders.service | getMyWorkOrders/getSyncData batch loading |
| Dashboard cache | dashboard.service | Redis 30s TTL, graceful degradation |
| Transaction safety | proposals.module | queryRunner ile atomik save+recalculate |
| Query limit | dashboard.service | getEquipmentControlTimeline .take(1000) |

### Build Hatalari (30 fix)
| Fix | Dosya | Detay |
|-----|-------|-------|
| winston Transport | app.module.ts | `as any` cast |
| UserRole type | auth.dto.ts | `string` tipi |
| Missing methods | storage.service, notifications.service | getBucketStats, createInAppNotification |
| TypeORM type mismatches | form-templates, quotations | `as unknown as T` cast |
| Method renames | scheduled-tasks, form-templates spec | updateCertStatuses, uploadPdfTemplate |
| Missing DI providers | 4 test spec | DataSource, FormFieldRepo, InspectionValidationService |
| Mock chain fixes | 5 test spec | findOne mockResolvedValueOnce sirasi |

---

## 9. Projeyi Degerlendirmek Icin Sorular

Asagidaki sorular bir reviewer'in projeyi hizli degerlendirmesine yardimci olur:

**Arsitektur:**
- NestJS modular architecture dogru mu kullanilmis?
- Multi-tenant izolasyon yaklasimi (guard + service filter + controller verify) yeterli mi?
- Monolithic module'ler (proposals 1500+ satir) ne zaman ayrilmali?

**Veritabani:**
- TypeORM entity tasarimi ve relation'lar uygun mu?
- Index stratejisi yeterli mi (22 composite)?
- Audit log immutability yaklasimi dogru mu?

**Guvenlik:**
- JWT + refresh token rotation yeterli mi?
- Tenant izolasyon 3 katmani overkill mi yoksa gerekli mi?
- verifyTenantAccess per-request DB query maliyeti kabul edilebilir mi?

**Test:**
- 78 unit test yeterli mi (coverage %?) yoksa integration test kritik mi?
- Mock-heavy unit test'ler gercek bug'lari yakaliyor mu?

**Operasyonel:**
- In-process monitoring (vs external Prometheus/Grafana) dogru mu?
- Alert escalation mantigi yeterli mi?
- Incident playbook pratik mi?
