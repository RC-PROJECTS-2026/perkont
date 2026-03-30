# PerKont Checklists

## 1. PRODUCTION READINESS CHECKLIST

### Altyapi
- [ ] MySQL 8.0 replica kurulu ve calisiyor
- [ ] Redis Sentinel aktif (failover testi yapildi)
- [ ] MinIO cluster (en az 2 node)
- [ ] Nginx load balancer (2x API instance)
- [ ] SSL/TLS sertifikasi (tum endpointler HTTPS)
- [ ] DNS ve domain ayarlari
- [ ] Firewall kurallari (sadece 80/443 acik)
- [ ] Docker container health check'ler tanimli

### Veritabani
- [ ] Tum migration'lar calistirildi
- [ ] Index'ler olusturuldu (tests/performance/explain-queries.sql)
- [ ] Connection pool boyutu yeterli (min 10, max 50)
- [ ] Slow query log aktif
- [ ] Otomatik backup (gunluk, 02:00)
- [ ] Backup restore testi yapildi
- [ ] utf8mb4 charset dogrulandi
- [ ] Timezone +03:00 ayarlandi

### Guvenlik
- [ ] JWT_SECRET en az 64 karakter, rastgele
- [ ] JWT_REFRESH_SECRET ayri ve en az 64 karakter
- [ ] ENCRYPTION_KEY 32+ karakter
- [ ] .env dosyasi Git'te DEGIL
- [ ] Helmet middleware aktif
- [ ] CORS sadece bilinen domainler
- [ ] Rate limiting aktif (ThrottlerGuard)
- [ ] Audit log immutability (DELETE/UPDATE trigger)
- [ ] Tenant izolasyonu tum servislerde aktif (*** EKSIK ***)
- [ ] Deaktif kullanici token kontrolu (*** EKSIK ***)
- [ ] SQL injection fix (sales-pipeline, proposals) (*** KRITIK ***)
- [ ] Dosya yukleme tipi/boyut kontrolu
- [ ] Presigned URL expiry suresi uygun (<1 saat)

### Performans
- [ ] Dashboard sorgu cache (Redis, 30s TTL)
- [ ] N+1 sorgular duzeltildi (WO, Inspection)
- [ ] Pagination tum listelerde aktif
- [ ] Debounce/server-side search aktif
- [ ] Gzip/Brotli compression aktif
- [ ] Static asset CDN
- [ ] Frontend build optimize (Next.js production build)
- [ ] API response time < 2s (p95)

### Monitoring
- [ ] Winston loglama calisyor (dosya + ELK)
- [ ] Health check endpoint (/health) aktif
- [ ] CPU/Memory alarm (>80%)
- [ ] Error rate alarm (>1%)
- [ ] Disk usage alarm (>85%)
- [ ] Queue backlog alarm (>100 pending)
- [ ] Uptime monitoring (external)

### Is Surekliligi
- [ ] Redis yoksa graceful degradation
- [ ] MinIO yoksa hata mesaji (crash yok)
- [ ] Logo timeout → retry + admin bildirim
- [ ] Cron idempotency (duplicate calisma onleme)
- [ ] Auto-restart (Docker restart policy)

---

## 2. UAT (User Acceptance Test) CHECKLIST

### Rol: Sales (Satis Temsilcisi)
- [ ] Login yapabiliyor
- [ ] Dashboard'da satis metrikleri goruyor
- [ ] Musteri olusturabiliyor
- [ ] Musteri arayabiliyor (<1 saniye)
- [ ] Lokasyon ekleyebiliyor
- [ ] Ekipman ekleyebiliyor
- [ ] Satis firsati olusturabiliyor
- [ ] Gorusme notu ekleyebiliyor
- [ ] Teklif olusturabiliyor
- [ ] Teklif kalemi ekleyebiliyor
- [ ] Toplam dogru hesaplaniyor (KDV dahil)
- [ ] Teklif gonderebiliyor
- [ ] Teklif PDF/DOCX indirilebiliyor
- [ ] Teklif revizyon yapabiliyor
- [ ] Teklif kabul edebiliyor
- [ ] Sozlesme otomatik olustugunus gorebiliyor
- [ ] Customer 360 ekraninda tum veri dogru
- [ ] Sidebar dogru menuleri gosteriyor
- [ ] Baska musterinin verisini GORMUYOR

### Rol: Planner (Planlama)
- [ ] Login yapabiliyor
- [ ] Is emri olusturabiliyor
- [ ] Ekipman secebiliyor (arama calisyor)
- [ ] Planlama takvimini gorebiliyor
- [ ] Mühendis atayabiliyor
- [ ] Is emri durumunu guncelleyebiliyor
- [ ] Sozlesmesiz WO'da uyari goruyor

### Rol: Inspector (Denetci)
- [ ] Login yapabiliyor
- [ ] Atanan is emirlerini gorebiliyor
- [ ] Denetim baslatabilyor
- [ ] Form doldurabilyor
- [ ] Foto/medya yukleyebiliyor
- [ ] Zorunlu alan uyarisi goruyor
- [ ] Denetim tamamlayabiliyor
- [ ] Denetim submit edebiliyor
- [ ] Baska inspectorun denetimine MUDAHALE EDEMIYOR

### Rol: Technical Manager (Teknik Mudur)
- [ ] Login yapabiliyor
- [ ] Onay bekleyen denetimleri gorebiliyor
- [ ] Denetim onaylayabiliyor
- [ ] Denetim reddedebiliyor
- [ ] Revizyon isteyebiliyor
- [ ] Rapor onaylayabiliyor
- [ ] E-imza baslatabilyor (varsa)
- [ ] Rapor teslim edebiliyor

### Rol: Finance (Muhasebe)
- [ ] Login yapabiliyor
- [ ] Faturaya hazir isler listesini gorebiliyor
- [ ] Logo entegrasyon durumunu kontrol edebiliyor
- [ ] Sozlesme listesini gorebiliyor
- [ ] Odeme takibi yapabiliyor

### Rol: Admin
- [ ] Login yapabiliyor
- [ ] Kullanici yonetimi yapabiliyor
- [ ] Tum modullere erisebiliyor
- [ ] Audit log gorebiliyor
- [ ] Sistem ayarlarini degistirebiliyor
- [ ] Form template olusturabiliyor
- [ ] Form template versiyonlayabiliyor

### Rol: Customer Portal
- [ ] Login yapabiliyor
- [ ] Sadece kendi raporlarini gorebiliyor
- [ ] Rapor indirebiliyor
- [ ] Ekipmanlarini gorebiliyor
- [ ] Yaklasan kontrolleri gorebiliyor
- [ ] Sozlesmelerini gorebiliyor
- [ ] Dahili sayfalara ERISEEMIYOR
- [ ] Baska musterinin verisini GORMUYOR

### Genel UX
- [ ] Bos durum ekranlari anlamli mesaj gosteriyor
- [ ] Hata mesajlari Turkce ve anlasilir
- [ ] Loading state tum sayfalarda goruluyor
- [ ] Mobil gorunumde kullanilabilir (responsive)
- [ ] Turkce karakterler her yerde dogru
- [ ] Tarih formati Turkiye standartlarinda (DD.MM.YYYY)
- [ ] Para formati Turkiye standartlarinda (1.234,56 TL)

---

## 3. DEPLOYMENT CHECKLIST

### Deployment Oncesi
- [ ] Tum testler pass (unit + integration + e2e)
- [ ] Yuk testi SLA degerleri karsilandi
- [ ] Guvenlik testleri pass
- [ ] Migration'lar test ortaminda calistirildi
- [ ] .env.production tum degerleri dolduruldu
- [ ] Docker image'lar build edildi
- [ ] Backup alindt (mevcut prod DB)

### Deployment Sirasi
- [ ] Maintenance mode aktif (frontend uyari)
- [ ] DB migration calistir
- [ ] Backend container'lari guncelle
- [ ] Frontend build deploy
- [ ] Health check pass
- [ ] Smoke test (login + dashboard + customer list)
- [ ] Maintenance mode kapat

### Deployment Sonrasi
- [ ] Error log kontrolu (ilk 30 dk)
- [ ] CPU/Memory normal seviyelerde
- [ ] API response time normal
- [ ] Kullanici geri bildirimi toplama
- [ ] Rollback plani hazir (onceki image tag)

---

## 4. TEST EXECUTION CHECKLIST

### Hafta 1 (P0 - Kritik)
- [ ] Test ortami kuruldu (docker-compose)
- [ ] Seed data yuklendi (10K musteri, 500K ekipman)
- [ ] Auth testleri calistirildi (15 test)
- [ ] Tenant izolasyon testleri calistirildi
- [ ] State machine testleri calistirildi (60 test)
- [ ] Validation testleri calistirildi (40 test)
- [ ] Uctan uca Senaryo 1 tamamlandi

### Hafta 2 (P1 - Yuksek)
- [ ] k6 yuk testi calistirildi (100 VU)
- [ ] Performans SLA'lari degerlendirildi
- [ ] PDF uretim testleri calistirildi
- [ ] Concurrency testleri calistirildi
- [ ] Guvenlik testleri calistirildi (15 test)
- [ ] N+1 sorgu analizi yapildi
- [ ] E2E Playwright testleri tamamlandi

### Hafta 3 (P2 - Orta)
- [ ] Stress testleri calistirildi
- [ ] Recovery testleri (Redis/MinIO/Logo)
- [ ] UAT senaryolari tamamlandi
- [ ] Dashboard performans optimize edildi
- [ ] Regression suite olusturuldu
- [ ] Test raporu yazildi
- [ ] Aksiyonlar belirlendi ve atandi
