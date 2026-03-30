# PerKont - Kapsamli Test Stratejisi ve Kalite Guvence Plani

## 1. GENEL TEST STRATEJISI

### 1.1 Hedef
PerKont sistemini 100 esanlamli kullanici, 10.000 musteri, 500.000 ekipman olceginde
gercek kullanim kosullarinda guvenilir, hizli, tutarli ve olceklenebilir oldugunu dogrulamak.

### 1.2 Test Piramidi

```
        /  UAT  \                    → 5 senaryo, manuel
       / E2E (PW) \                  → 14 senaryo, Playwright
      / Integration \                → ~120 test, Supertest + Jest
     / State Machine  \              → ~60 test, Jest
    / Validation + Auth \            → ~80 test, Jest
   /   Unit Tests        \           → Mevcut 7 suite + yeni ~200 test
  /________________________\
  |  Load / Stress (k6)    |         → 8 senaryo, 100 VU
  |  Security (custom)     |         → 15 kontrol
  |  Performance SQL       |         → 25 sorgu analizi
```

### 1.3 Arac Secimi

| Katman               | Arac                  | Neden                                    |
|----------------------|-----------------------|------------------------------------------|
| Unit Test            | Jest + ts-jest        | Mevcut altyapi, NestJS uyumlu            |
| Integration Test     | Jest + Supertest      | NestJS test module ile tam API testi     |
| E2E Test             | Playwright            | Mevcut config, multi-browser, mobile     |
| Load Test            | k6 (Grafana)          | JS script, 100 VU destegi, metrik export |
| Security Test        | Custom + OWASP ZAP    | API-bazli guvenlik testi                 |
| DB Performance       | MySQL EXPLAIN + custom | Sorgu analizi                            |
| State Machine        | Jest                  | Birim bazli state gecis testi            |
| Seed Data            | TypeORM + Faker.js    | Gercekci veri uretimi                    |

### 1.4 Test Ortami

```
Test Environment:
├── MySQL 8.0          → ayri test DB (perkont_test)
├── Redis              → ayri DB index (db: 1)
├── MinIO              → ayri bucket (perkont-test-*)
├── Node.js 18+        → backend runtime
├── k6                 → load test runner
├── Playwright         → browser automation
└── Docker Compose     → izole test ortami
```

### 1.5 Test Onceliklendirme (P0 > P1 > P2)

**P0 - Kritik (Ilk hafta)**
- Tenant izolasyonu (DATA LEAK RISKI)
- Authentication/Authorization bypass
- State machine gecis dogrulamasi
- Uctan uca is akisi (CRM → Fatura)
- Buyuk veri performans testi

**P1 - Yuksek (Ikinci hafta)**
- 100 VU yuk testi
- Validation zinciri
- PDF uretim dogrulugu
- Esanlamli islem (concurrency)
- Offline sync

**P2 - Orta (Ucuncu hafta)**
- Dashboard performans
- UX/boş durum ekranlari
- Regression suite
- UAT senaryolari
- Recovery/failure testleri

---

## 2. TEST ORTAMI VE TEST VERISI PLANI

### 2.1 Docker Compose - Test Ortami

```yaml
# tests/docker-compose.test.yml
version: '3.8'
services:
  mysql-test:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: test_root_pass
      MYSQL_DATABASE: perkont_test
    ports: ["3307:3306"]
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci

  redis-test:
    image: redis:7-alpine
    ports: ["6380:6379"]

  minio-test:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports: ["9002:9000", "9003:9001"]
```

### 2.2 Veri Dagilim Tablosu

| Veri Tipi          | Adet      | Dagilim                                           |
|--------------------|-----------|---------------------------------------------------|
| Musteri            | 10.000    | %60 kucuk(1-2 lok), %30 orta(3-10), %10 buyuk(11-20) |
| Lokasyon           | ~45.000   | Musteri basina 1-20                               |
| Ekipman            | 500.000   | Lokasyon basina 1-500 (buyuk musterilerde yogun)  |
| Ekipman Tipi       | 50        | Gercekci tip dagilimi                             |
| Is Emri            | 100.000   | %40 completed, %20 planned, %15 in_progress, ...  |
| Denetim            | 200.000   | %50 approved, %20 completed, %10 in_progress, ... |
| Rapor              | 200.000   | %60 delivered, %20 signed, %10 approved, ...      |
| Teklif             | 50.000    | %30 sent, %20 accepted, %15 draft, ...            |
| Sozlesme           | 20.000    | %50 active, %20 signed, %15 draft, ...            |
| Kullanici          | 500       | Rol dagilimi asagida                               |
| Sales Opportunity  | 30.000    | %40 won, %20 new, %15 negotiation, ...            |
| Audit Log          | 2.000.000 | Her islem icin log                                |

**Kullanici Rol Dagilimi (500 kullanici):**
- 80 sales
- 60 planner
- 150 inspector
- 40 technical_manager
- 30 finance
- 20 admin
- 20 executive
- 100 customer (portal)

### 2.3 Seed Script → `tests/seed/seed-generator.ts`

Detayli seed scripti ayri dosyada.

---

## 3. MODUL BAZLI TEST PLANI

### 3.1 Authentication / Authorization

| # | Test | Tip | Oncelik |
|---|------|-----|---------|
| A01 | Basarili login + JWT token alinmasi | Integration | P0 |
| A02 | Hatali sifre ile login reddi | Integration | P0 |
| A03 | 5 basarisiz denemede hesap kilitlenmesi | Integration | P0 |
| A04 | Kilitli hesapta 30dk sonra acilma | Integration | P0 |
| A05 | Refresh token ile yeni access token | Integration | P0 |
| A06 | Expired access token reddi | Integration | P0 |
| A07 | Expired refresh token reddi | Integration | P0 |
| A08 | Logout sonrasi refresh token gecersizligi | Integration | P0 |
| A09 | MFA setup + verify akisi | Integration | P1 |
| A10 | Sifre sifirlama token + expiry | Integration | P1 |
| A11 | Rol bazli endpoint erisim (her rol icin) | Integration | P0 |
| A12 | Admin bypass tum endpointlere erisim | Integration | P0 |
| A13 | Deaktif kullanici token ile erisim ENGELLENMELI | Security | P0 |
| A14 | Baska tenant verisine erisim ENGELLENMELI | Security | P0 |
| A15 | Brute force rate limiting | Security | P1 |

### 3.2 CRM / Musteriler

| # | Test | Tip | Oncelik |
|---|------|-----|---------|
| C01 | Musteri olusturma (tum zorunlu alanlar) | Integration | P0 |
| C02 | Musteri kodu tekrari engellenmesi | Integration | P0 |
| C03 | Vergi no tekrari engellenmesi | Integration | P0 |
| C04 | Musteri listeleme + pagination | Integration | P1 |
| C05 | Musteri arama (isim, kod, vergi no) | Integration | P1 |
| C06 | Musteri guncelleme | Integration | P1 |
| C07 | Lokasyon ekleme (musteriye bagli) | Integration | P0 |
| C08 | Lokasyon-musteri iliskisi dogrulama | Validation | P0 |
| C09 | 10.000 musteri ile listeleme performansi | Performance | P0 |
| C10 | Customer 360 ekrani veri butunlugu | E2E | P1 |
| C11 | Tenant izolasyonu - baska sirketin musterisi gorunmemeli | Security | P0 |

### 3.3 Ekipman

| # | Test | Tip | Oncelik |
|---|------|-----|---------|
| E01 | Ekipman olusturma (musteri + lokasyon + tip) | Integration | P0 |
| E02 | Lokasyonsuz ekipman ENGELLENMELI | Validation | P0 |
| E03 | Yanlis musteri-lokasyon eslesmesi ENGELLENMELI | Validation | P0 |
| E04 | Envanter kodu tekrari engellenmesi | Integration | P0 |
| E05 | Sonraki kontrol tarihi otomatik hesaplama | Unit | P0 |
| E06 | Ekipman arama (500.000 kayit) | Performance | P0 |
| E07 | Ekipman secici (WO olusturmada) performansi | Performance | P0 |
| E08 | Kontrol tarihi yaklasan ekipman listesi | Performance | P1 |
| E09 | Ekipman tipi bazli filtreleme | Integration | P1 |
| E10 | Toplu ekipman yukleme (Excel import) | Integration | P2 |

### 3.4 Teklifler (Proposals)

| # | Test | Tip | Oncelik |
|---|------|-----|---------|
| P01 | Teklif olusturma (draft) | Integration | P0 |
| P02 | Kalem ekleme + toplam hesaplama | Integration | P0 |
| P03 | Kalemsiz teklif gonderilemez | Validation | P0 |
| P04 | State gecisi: draft→sent→accepted | State Machine | P0 |
| P05 | Gecersiz state gecisi engellenmesi | State Machine | P0 |
| P06 | Revizyon olusturma | Integration | P1 |
| P07 | Suresi dolmus teklif kabul ENGELLENMELI | Validation | P0 |
| P08 | Teklif PDF uretimi | Integration | P1 |
| P09 | Teklif kabul → sozlesme otomatik olusma | Integration | P0 |
| P10 | Ayni teklif 2 kez kabul ENGELLENMELI | Concurrency | P0 |

### 3.5 Sozlesmeler (Contracts)

| # | Test | Tip | Oncelik |
|---|------|-----|---------|
| S01 | Sozlesme olusturma (draft) | Integration | P0 |
| S02 | Imzali sozlesme yukleme (PDF) | Integration | P0 |
| S03 | PDF disi dosya REDDEDILMELI | Validation | P0 |
| S04 | Buyuk dosya REDDEDILMELI | Validation | P1 |
| S05 | State gecisi: draft→signed→active | State Machine | P0 |
| S06 | Cift taraf imza mantigi | Integration | P0 |
| S07 | Signed/active olmayan sozlesme ile WO ENGELLENMELI | Validation | P0 |
| S08 | Sozlesme listeleme (20.000 kayit) | Performance | P1 |

### 3.6 Is Emirleri (Work Orders)

| # | Test | Tip | Oncelik |
|---|------|-----|---------|
| W01 | Is emri olusturma + ekipman secimi | Integration | P0 |
| W02 | Ekipmansiz WO ENGELLENMELI | Validation | P0 |
| W03 | Ekipman-musteri uyumsuzlugu ENGELLENMELI | Validation | P0 |
| W04 | contractRequired=true, sozlesmesiz WO ENGELLENMELI | Validation | P0 |
| W05 | contractRequired=false, sozlesmesiz WO → noContractRisk | Validation | P0 |
| W06 | State gecisi: draft→planned→in_progress→completed | State Machine | P0 |
| W07 | Tamamlanmis WO yeniden atanamaz | State Machine | P0 |
| W08 | WO listeleme (100.000 kayit) | Performance | P0 |
| W09 | WO olusturma ekrani performansi | Performance | P1 |
| W10 | Coklu muhenids atama | Integration | P1 |

### 3.7 Denetimler (Inspections)

| # | Test | Tip | Oncelik |
|---|------|-----|---------|
| I01 | Denetim baslat (WO uzerinden) | Integration | P0 |
| I02 | Form doldurma (fieldValues) | Integration | P0 |
| I03 | Zorunlu alan eksikse submit ENGELLENMELI | Validation | P0 |
| I04 | Ayni ekipman+muhenids icin acik denetim tekrari ENGELLENMELI | Validation | P0 |
| I05 | State: draft→in_progress→completed→submitted→approved | State Machine | P0 |
| I06 | Gecersiz state gecisi engellenmesi | State Machine | P0 |
| I07 | Revision requested → in_progress otomatik gecis | State Machine | P0 |
| I08 | Version conflict tespiti (optimistic locking) | Concurrency | P0 |
| I09 | Medya yukleme (foto, belge) | Integration | P1 |
| I10 | Offline denetim + sync | Integration | P1 |
| I11 | Tamamlandiginda ekipman kontrol tarihi guncellenmesi | Integration | P0 |
| I12 | 200.000 denetim ile listeleme | Performance | P1 |

### 3.8 Raporlar (Reports)

| # | Test | Tip | Oncelik |
|---|------|-----|---------|
| R01 | Rapor uretimi (approved inspection'dan) | Integration | P0 |
| R02 | Onaysiz inspection'dan rapor ENGELLENMELI | Validation | P0 |
| R03 | Ayni inspection'dan ikinci rapor ENGELLENMELI | Validation | P0 |
| R04 | PDF uretimi + hash dogrulama | Integration | P0 |
| R05 | State: under_review→approved→under_signing→signed→delivered | State Machine | P0 |
| R06 | Hash bozuksa e-imza ENGELLENMELI | Validation | P0 |
| R07 | E-imza akisi (TurkTrust) | Integration | P1 |
| R08 | Teslim (email/portal/manual) | Integration | P1 |
| R09 | Rapor PDF Turkce karakter dogrulugu | PDF | P1 |
| R10 | Cok sayfali rapor dogru sayfalanma | PDF | P1 |
| R11 | Stale signing session recovery (30dk cron) | Integration | P1 |
| R12 | 200.000 rapor ile listeleme | Performance | P1 |

### 3.9 Dashboard

| # | Test | Tip | Oncelik |
|---|------|-----|---------|
| D01 | Rol bazli dashboard verisi | Integration | P0 |
| D02 | Dashboard yuklenme suresi (<2s) | Performance | P0 |
| D03 | 7 paralel count sorgusu performansi | Performance | P1 |
| D04 | noContractRisk sayaci dogrulugu | Integration | P1 |

### 3.10 Logo ERP Entegrasyonu

| # | Test | Tip | Oncelik |
|---|------|-----|---------|
| L01 | Musteri push (PerKont→Logo) | Integration | P1 |
| L02 | Fatura push | Integration | P1 |
| L03 | Kuyruk isleme (2dk cron) | Integration | P1 |
| L04 | Hata durumunda retry (max 5) | Integration | P1 |
| L05 | Logo timeout durumunda davranis | Failure | P1 |

### 3.11 Kalite / Akreditasyon

| # | Test | Tip | Oncelik |
|---|------|-----|---------|
| Q01 | Audit log yazilmasi (kritik islemler) | Integration | P0 |
| Q02 | Audit log silinememesi (immutable) | Security | P0 |
| Q03 | Compliance event uretimi | Integration | P1 |
| Q04 | CAPA kaydi olusturma/takip | Integration | P2 |
| Q05 | Sikayet kaydi olusturma/takip | Integration | P2 |
| Q06 | Ic tetkik kaydi | Integration | P2 |
| Q07 | Kalibrasyon takibi | Integration | P2 |

---

## 4. UCTAN UCA TEST SENARYOLARI

### Senaryo 1: Tam Is Akisi (CRM → Fatura)
```
1. Sales kullanicisi login
2. Musteri olustur (Acme Ltd)
3. Lokasyon ekle (Istanbul Fabrika)
4. 3 ekipman ekle (Vinc, Forklift, Asansor)
5. Satis firsati olustur
6. Gorusme notu ekle
7. Teklif olustur + 3 kalem ekle
8. Teklif gonder
9. Teklif kabul et
10. Sozlesme otomatik olusur → dogrula
11. Imzali PDF yukle → sozlesme aktif et
12. Planner login → is emri olustur + ekipman sec
13. Inspector login → denetim baslat
14. Form doldur (tum zorunlu alanlar)
15. Denetim tamamla + submit
16. Technical Manager login → onayla
17. Rapor uret → PDF dogrula
18. E-imza baslat → signed yap
19. Rapor teslim et
20. Finance login → fatura hazir kontrol
21. Logo kuyruguna dusme dogrulama
```

### Senaryo 2: Sozlesmesiz Risk Akisi
```
1. Company ayarinda contractRequired=false
2. Sozlesmesiz WO olustur
3. noContractRisk=true set edildigini dogrula
4. Audit log yazildigini dogrula
5. Is akisi normal devam etsin
```

### Senaryo 3: Revizyon Akisi
```
1. Teklif olustur + gonder
2. Musteri revizyon iste
3. Revizyon olustur (yeni versiyon)
4. Tekrar gonder
5. Kabul et
6. Denetim yap + submit
7. TM revision_requested
8. Inspector duzelt + tekrar submit
9. TM approve
```

### Senaryo 4: Customer Portal Akisi
```
1. Customer portal login
2. Sadece kendi musterisinin verisini gor
3. Rapor listele
4. Rapor indir
5. Baska musterinin raporuna ERISEMEME
```

### Senaryo 5: Renewal Opportunity Cron
```
1. Ekipman olustur (nextControlDate = 45 gun sonra)
2. Renewal cron calistir
3. Satis firsati olusturuldugunu dogrula
4. Tekrar calistir → duplicate olusmadigini dogrula
```

---

## 5. PERFORMANS VE YUK TESTI PLANI

### 5.1 Performans Hedefleri (SLA)

| Endpoint / Sayfa         | Hedef p95   | Hedef p99   | Max Response |
|--------------------------|-------------|-------------|--------------|
| Login                    | < 300ms     | < 500ms     | < 1s         |
| Dashboard                | < 1s        | < 2s        | < 3s         |
| Musteri listele (page)   | < 500ms     | < 1s        | < 2s         |
| Musteri arama            | < 300ms     | < 500ms     | < 1s         |
| Ekipman arama            | < 500ms     | < 1s        | < 2s         |
| Customer 360             | < 1s        | < 2s        | < 3s         |
| WO olusturma             | < 500ms     | < 1s        | < 2s         |
| Denetim submit           | < 1s        | < 2s        | < 3s         |
| Rapor PDF uretimi        | < 5s        | < 8s        | < 15s        |
| Teklif listeleme         | < 500ms     | < 1s        | < 2s         |
| Sozlesme listeleme       | < 500ms     | < 1s        | < 2s         |
| Rapor listeleme          | < 500ms     | < 1s        | < 2s         |

### 5.2 Kabul Kriterleri

- Hata orani: < %0.1
- CPU kullanimi: < %80 (sustained)
- Memory kullanimi: < %85
- DB baglanti havuzu: < %90 dolu
- Redis latency: < 5ms (p99)
- Kuyruk gecikmesi: < 30s (Logo sync)

### 5.3 Yuk Testi Senaryolari (100 VU)

```
Faz 1 (0-1dk):    Ramp up 0→50 VU
Faz 2 (1-3dk):    Sabit 50 VU
Faz 3 (3-5dk):    Ramp up 50→100 VU
Faz 4 (5-15dk):   Sabit 100 VU (ana test)
Faz 5 (15-17dk):  Ramp down 100→0 VU
```

**VU Dagilimi (100):**
| Rol               | VU  | Ana Islem                              |
|--------------------|-----|----------------------------------------|
| Sales              | 20  | Musteri arama, teklif olusturma        |
| Planner            | 15  | WO olusturma, ekipman secimi           |
| Inspector          | 30  | Denetim form doldurma, foto yukleme    |
| Technical Manager  | 10  | Rapor onaylama, revision               |
| Finance            | 10  | Fatura listeleme, Logo sync kontrol    |
| Admin/Executive    | 10  | Dashboard, raporlama                   |
| Customer Portal    | 5   | Rapor goruntuleme, indirme             |

### 5.4 Stress Test Senaryolari

| # | Senaryo                              | Beklenen Davranis                       |
|---|--------------------------------------|-----------------------------------------|
| ST01 | Redis kapatildiginda               | Graceful degradation, hata mesaji       |
| ST02 | MinIO yavaslama (5s latency)       | Timeout + retry, kullanici bilgilendirme|
| ST03 | Logo endpoint 500 donerse          | Kuyrukta kalir, retry, admin uyari      |
| ST04 | TurkTrust timeout (30s)            | UNDER_SIGNING kalir, 30dk cron duzeltir |
| ST05 | Cron duplicate calisma             | Idempotent islem, duplicate engelleme   |
| ST06 | Ayni teklif 2 kez kabul            | Ikincisi reddedilir (state check)       |
| ST07 | Ayni denetim 2 kullanicida acik    | Optimistic lock conflict                |
| ST08 | 200 VU spike (2x kapasite)        | Graceful degradation, 503 donme         |

---

## 6. GUVENLIK VE AUDIT TEST PLANI

### 6.1 Guvenlik Testleri

| # | Test                                  | Yontem                                  | Oncelik |
|---|---------------------------------------|-----------------------------------------|---------|
| SEC01 | Auth bypass (token olmadan erisim) | Curl ile header'siz istek              | P0      |
| SEC02 | Rol bypass (inspector→admin ep)    | Yanlis rolle endpoint cagirma          | P0      |
| SEC03 | Tenant data leak                   | CompanyA tokeniyla CompanyB verisi iste | P0      |
| SEC04 | Presigned URL paylasimi            | Baska kullanicinin URL'i ile erisim    | P1      |
| SEC05 | Refresh token reuse                | Ayni refresh token 2 kez kullanma      | P1      |
| SEC06 | Brute force login                  | 100 hatali deneme hizli arka arkaya    | P1      |
| SEC07 | Dosya yukleme guvenlik             | .exe, .sh, script yukleme denemesi     | P1      |
| SEC08 | XSS injection                      | <script> iceren musteri adi            | P1      |
| SEC09 | SQL injection                      | ' OR 1=1 -- iceren arama              | P0      |
| SEC10 | Yetkisiz rapor indirme             | Baska musterinin rapor ID'si ile       | P0      |
| SEC11 | Portal veri sizintisi              | Portal kullanicisi tum musterileri gorme | P0    |
| SEC12 | Audit log silme/degistirme         | DELETE/UPDATE audit_logs denemesi      | P0      |
| SEC13 | IDOR (Object-level access)         | Baska kullanicinin kaynak ID'leri      | P0      |
| SEC14 | Rate limiting bypass               | Header manipulation                     | P1      |
| SEC15 | JWT secret brute force             | Zayif secret tespiti                   | P2      |

### 6.2 Audit / Compliance Testleri

| # | Test                                  | Dogrulama                               |
|---|---------------------------------------|-----------------------------------------|
| AUD01 | Login audit log                    | Her basarili/basarisiz giriste log var  |
| AUD02 | Denetim olusturma log              | inspection_created event               |
| AUD03 | Rapor onaylama log                 | report_approved event                  |
| AUD04 | Rapor indirme log                  | report_downloaded event                |
| AUD05 | noContractRisk log                 | Sozlesmesiz WO'da ozel log            |
| AUD06 | State degisiklik log               | Her status gecisinde audit             |
| AUD07 | Compliance event                   | Kritik islemlerde uretiliyor           |
| AUD08 | Retention mekanizmasi              | Eski loglar arsivleniyor               |
| AUD09 | Zaman cizelgesi                    | Entity bazli kronolojik goruntuleme    |

---

## 7. KABUL KRITERLERI

### 7.1 Fonksiyonel Kabul

- [ ] 14 E2E senaryo hatasiz tamamlaniyor
- [ ] 120+ integration test %100 pass
- [ ] State machine testlerinde %100 gecerli/gecersiz gecis dogrulandi
- [ ] Validation testlerinde tum engelleme kurallari calisiyor
- [ ] PDF uretiminde Turkce karakter ve sayfalama dogru

### 7.2 Performans Kabul

- [ ] 100 VU altinda p95 SLA degerleri karsilaniyor
- [ ] Hata orani < %0.1
- [ ] CPU < %80 sustained
- [ ] Memory < %85
- [ ] DB connection pool < %90

### 7.3 Guvenlik Kabul

- [ ] Tenant izolasyonu %100 calisyor
- [ ] Auth bypass mumkun degil
- [ ] Rol bypass mumkun degil
- [ ] SQL injection yok
- [ ] XSS yok
- [ ] Audit log immutable

---

## 8. OTOMASYON YAKLASIMI

### 8.1 CI/CD Entegrasyonu

```yaml
# .github/workflows/test.yml
name: PerKont Test Suite
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd backend && npm ci && npm run test:cov

  integration-tests:
    runs-on: ubuntu-latest
    services:
      mysql: { image: mysql:8.0, env: { MYSQL_DATABASE: perkont_test, ... } }
      redis: { image: redis:7-alpine }
    steps:
      - run: cd backend && npm run test:e2e

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npx playwright install --with-deps
      - run: cd frontend && npm run test:e2e

  load-tests:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - run: k6 run tests/load/full-load-test.js
```

### 8.2 Test Calistirma Komutlari

```bash
# Unit testler
cd backend && npm run test

# Integration testler
cd backend && npm run test:e2e

# E2E testler
cd frontend && npx playwright test

# Yuk testi
k6 run tests/load/full-load-test.js

# Seed data yukle
cd backend && npx ts-node tests/seed/seed-generator.ts

# Guvenlik testleri
cd tests/security && npx ts-node security-test-runner.ts

# Performans SQL analizi
mysql -u root -p perkont_test < tests/performance/explain-queries.sql

# Tum testler (sirali)
npm run test:all
```

---

## 9. BEKLENEN RISKLER

| # | Risk                                    | Etki   | Olasilik | Azaltma                              |
|---|----------------------------------------|--------|----------|--------------------------------------|
| 1 | Tenant izolasyonu eksik (8/12 servis)  | Kritik | Yuksek   | TenantGuard middleware zorunlu kilma  |
| 2 | SQL injection (sales-pipeline, proposals)| Kritik | Orta   | Parameterize tum raw SQL            |
| 3 | N+1 sorgu (WO, inspection)            | Yuksek | Kesin    | Eager loading / join optimize        |
| 4 | Auth bypass (deaktif kullanici)        | Yuksek | Orta     | Token refresh'te isActive kontrolu   |
| 5 | Dashboard cache yok                    | Orta   | Kesin    | Redis cache ekle                     |
| 6 | Buyuk veri pagination eksik            | Orta   | Kesin    | Cursor-based pagination              |
| 7 | PDF uretim timeout (buyuk form)       | Orta   | Orta     | Worker queue'ya tasi                 |
| 8 | Offline sync conflict kaybı           | Orta   | Dusuk    | Conflict resolution UI               |
| 9 | Logo sync retry sonsuz dongu          | Dusuk  | Dusuk    | Dead letter queue ekle               |

---

## 10. TEST SONRASI RAPOR FORMATI

```
# PerKont Test Sonuc Raporu
Tarih: YYYY-MM-DD
Ortam: Test / Staging
Versiyon: X.Y.Z

## Ozet
- Toplam test: XXX
- Basarili: XXX (%XX)
- Basarisiz: XXX (%XX)
- Atlanan: XXX

## Modul Bazli Sonuclar
| Modul | Toplam | Pass | Fail | Skip |
|-------|--------|------|------|------|
| Auth  | 15     | 14   | 1    | 0    |
| ...   | ...    | ...  | ...  | ...  |

## Performans Sonuclari
| Endpoint | p50 | p95 | p99 | SLA | Durum |
|----------|-----|-----|-----|-----|-------|
| Login    | 120 | 280 | 450 | 500 | PASS  |
| ...      | ... | ... | ... | ... | ...   |

## Yuk Testi Sonuclari
- Max VU: 100
- Toplam istek: XXX
- Hata orani: %X.XX
- CPU peak: %XX
- Memory peak: %XX

## Kritik Bulgular
1. [P0] Tenant izolasyonu eksik → SEC03 FAIL
2. ...

## Aksiyonlar
| # | Bulgu | Oncelik | Sorumlu | Hedef Tarih |
|---|-------|---------|---------|-------------|
| 1 | ...   | P0      | ...     | ...         |
```
