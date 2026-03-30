# PerKont Incident Playbook

## Ilk 24 Saat Izleme Plani

### Saat 0-1 (Launch)
```
GET /health              → tum servisler OK
GET /monitoring/status   → status: healthy
GET /monitoring/snapshot → baseline kaydet
```

### Saat 1-6 (Ramp Up)
```
Her 15 dk: GET /monitoring/dashboard
Izle: error rate < 0.5%, p95 < 1000ms, queue pending < 20
```

### Saat 6-24 (Steady State)
```
Her 30 dk: GET /monitoring/dashboard
Izle: cache hit > 70%, memory < 75%, DB pool < 40/50
```

---

## Incident 1: Redis DOWN

| | |
|---|---|
| **Severity** | CRITICAL |
| **Owner** | devops |
| **Etki** | Dashboard cache devre disi, her istek DB'ye gider. Performans duser ama sistem calisir. |
| **Olasi Sebep** | Redis process crash, memory OOM, disk dolu, config hatasi |
| **Ilk Kontrol** | `GET /health` → redis: false, `redis-cli ping` |
| **Ilk Aksiyon** | `systemctl restart redis` veya `docker restart redis` |
| **Detayli Analiz** | `/var/log/redis/redis.log`, `redis-cli info memory`, `redis-cli info clients` |
| **Kalici Cozum** | Redis Sentinel aktif et, maxmemory-policy ayarla, monitoring ekle |

---

## Incident 2: Queue Backlog Artisi (>50 pending)

| | |
|---|---|
| **Severity** | WARNING → CRITICAL (>100) |
| **Owner** | devops |
| **Etki** | Logo fatura sync gecikmesi. Muhasebe bekler. |
| **Olasi Sebep** | Logo API yavas/down, cron calismadi, Redis down (Bull queue) |
| **Ilk Kontrol** | `GET /monitoring/snapshot` → queues.logo.pending, `GET /health` → queue durumu |
| **Ilk Aksiyon** | Logo API durumunu kontrol et. Cron calisiyorsa bekle. Calismiyorsa: `POST /logo/retry-all-failed` |
| **Detayli Analiz** | `SELECT * FROM logo_sync_queue WHERE status='pending' ORDER BY createdAt LIMIT 20` |
| **Kalici Cozum** | Logo API timeout artir, retry stratejisi gozden gecir, dead letter queue ekle |

---

## Incident 3: Queue Stuck Job

| | |
|---|---|
| **Severity** | CRITICAL |
| **Owner** | devops |
| **Etki** | Belirli islemler tamamlanmiyor. Ornegin fatura Logo'ya gidemiyor. |
| **Olasi Sebep** | Worker crash, network timeout, deadlock |
| **Ilk Kontrol** | `SELECT * FROM logo_sync_queue WHERE status='pending' AND lastAttemptedAt < DATE_SUB(NOW(), INTERVAL 30 MINUTE)` |
| **Ilk Aksiyon** | Stuck job'lari retry: `UPDATE logo_sync_queue SET status='pending', attemptCount=0 WHERE status='pending' AND lastAttemptedAt < DATE_SUB(NOW(), INTERVAL 30 MINUTE)` |
| **Detayli Analiz** | lastError kolonuna bak, hedef API'yi test et |
| **Kalici Cozum** | Stuck job detection cron ekle (zaten var: stale signing recovery pattern'i), max attempt sonrasi dead letter |

---

## Incident 4: MinIO Baglanti Kopmasi

| | |
|---|---|
| **Severity** | CRITICAL |
| **Owner** | devops |
| **Etki** | Dosya upload/download calismaz. Denetim fotosu, PDF, sozlesme yuklenemez. Mevcut veriler DB'de korunur. |
| **Olasi Sebep** | MinIO process down, disk dolu, network sorunu |
| **Ilk Kontrol** | `GET /health` → minio: false, `mc admin info local` |
| **Ilk Aksiyon** | `docker restart minio` veya `systemctl restart minio` |
| **Detayli Analiz** | MinIO loglari, disk kullanimi (`df -h`), bucket erisimi (`mc ls local/perkont-reports`) |
| **Kalici Cozum** | MinIO cluster (2+ node), disk alarm, otomatik yedekleme |

---

## Incident 5: Upload/Download Error Spike

| | |
|---|---|
| **Severity** | CRITICAL (upload >5) / WARNING (download >5) |
| **Owner** | devops (upload) / backend (download) |
| **Etki** | Upload: yeni dosya yuklenemez. Download: PDF/rapor indirilemez. |
| **Olasi Sebep** | MinIO disk dolu, permission sorunu, bucket policy, presigned URL expired |
| **Ilk Kontrol** | `GET /monitoring/snapshot` → minio.uploadErrors, minio.downloadErrors |
| **Ilk Aksiyon** | MinIO disk kontrol, bucket policy kontrol, presigned URL TTL kontrol |
| **Detayli Analiz** | API error loglari (`grep "MinIO\|upload\|download" logs/error.log`), minio.fileNotFoundCount |
| **Kalici Cozum** | Disk monitoring, bucket lifecycle policy, CDN cache for downloads |

---

## Incident 6: API Error Rate > 1%

| | |
|---|---|
| **Severity** | CRITICAL |
| **Owner** | backend |
| **Etki** | Kullanicilar hata aliyor. Is akislari kesiliyor. |
| **Olasi Sebep** | Bug deploy, DB down, dependency failure, memory leak |
| **Ilk Kontrol** | `GET /monitoring/snapshot` → api.errorsByStatus (hangi HTTP kodlar), api.topEndpoints (hangi endpointler) |
| **Ilk Aksiyon** | Error log incele (`tail -100 logs/error.log`). Belirli endpoint'se, o modulu kontrol et. Tum sistem ise rollback dusun. |
| **Detayli Analiz** | Error loglarinda requestId ile iz sur, endpoint bazli p95 kontrol et |
| **Kalici Cozum** | Canary deployment, feature flag, circuit breaker |

---

## Incident 7: API Latency > 2s (p95)

| | |
|---|---|
| **Severity** | CRITICAL |
| **Owner** | backend |
| **Etki** | Kullanici deneyimi bozulur. Timeout'lar artar. |
| **Olasi Sebep** | N+1 query, eksik index, buyuk veri seti, Redis cache miss, MinIO yavas |
| **Ilk Kontrol** | `GET /monitoring/snapshot` → api.topEndpoints (hangi endpoint yavas), db.recentSlowQueries |
| **Ilk Aksiyon** | En yavas endpoint'i belirle. Slow query varsa EXPLAIN calistir. Cache calisiyor mu kontrol et. |
| **Detayli Analiz** | MySQL slow query log, endpoint bazli p99, Redis info stats |
| **Kalici Cozum** | Index ekle, query optimize et, cache TTL ayarla, pagination kontrol et |

---

## Incident 8: DB Connection Pool Dolmasi (>45/50)

| | |
|---|---|
| **Severity** | CRITICAL |
| **Owner** | devops |
| **Etki** | Yeni istekler DB'ye baglanamiyor. 503 hatalari artar. |
| **Olasi Sebep** | Connection leak, cok fazla concurrent istek, yavas sorgular connection tutuyor |
| **Ilk Kontrol** | `SHOW PROCESSLIST` (MySQL), `GET /monitoring/snapshot` → db.activeConnections |
| **Ilk Aksiyon** | Uzun suren queryleri kill: `KILL <process_id>`. Pool size artir (gecici). |
| **Detayli Analiz** | `SHOW FULL PROCESSLIST`, hangi querylerin lock tuttigina bak |
| **Kalici Cozum** | Connection pool boyutunu artir (50→100), connection timeout ayarla, query timeout ekle |

---

## Incident 9: Slow Query Spike

| | |
|---|---|
| **Severity** | WARNING |
| **Owner** | backend |
| **Etki** | Belirli sayfalar yavas acilir. Dashboard timeout alabilir. |
| **Olasi Sebep** | Eksik index, buyuyen tablo, LIKE '%...%' sorgusu, karmasik JOIN |
| **Ilk Kontrol** | `GET /monitoring/snapshot` → db.recentSlowQueries (hangi query, hangi endpoint) |
| **Ilk Aksiyon** | EXPLAIN ile query analiz et. Index onerisi varsa ekle. |
| **Detayli Analiz** | `mysqldumpslow`, monitoring slow query listesi |
| **Kalici Cozum** | Composite index ekle, query optimize et, caching ekle |

---

## Incident 10: E-Imza Timeout/Failure

| | |
|---|---|
| **Severity** | WARNING |
| **Owner** | backend |
| **Etki** | Raporlar imzalanamaz, UNDER_SIGNING state'te kalir. Musteri teslimati gecikir. |
| **Olasi Sebep** | TurkTrust API down/yavas, network timeout, sertifika sorunu |
| **Ilk Kontrol** | `GET /monitoring/snapshot` → business.stuckStates.underSigning, stale signing recovery cron calisiyor mu |
| **Ilk Aksiyon** | 30 dk sonra cron otomatik APPROVED'a dondurecek. Manuel: `UPDATE reports SET status='approved' WHERE status='under_signing' AND updatedAt < DATE_SUB(NOW(), INTERVAL 30 MINUTE)` |
| **Detayli Analiz** | TurkTrust API status, network trace, sertifika gecerliligi |
| **Kalici Cozum** | E-imza provider failover, timeout artir, retry mekanizmasi |

---

## Incident 11: LOGO Sync Basarisiz

| | |
|---|---|
| **Severity** | WARNING |
| **Owner** | finance |
| **Etki** | Faturalar Logo ERP'ye aktarilamaz. Muhasebe islemleri gecikir. |
| **Olasi Sebep** | Logo API down, authentication expired, data format degisikligi |
| **Ilk Kontrol** | `GET /monitoring/snapshot` → queues.logo.failed, business.stuckStates.logoFailed |
| **Ilk Aksiyon** | `SELECT lastError FROM logo_sync_queue WHERE status='failed' ORDER BY lastAttemptedAt DESC LIMIT 5` |
| **Detayli Analiz** | Logo API credentials kontrol, payload format kontrol, network trace |
| **Kalici Cozum** | Logo API health check, credential rotation alert, dead letter queue |

---

## Incident 12: Tenant Data Leak Suphesi

| | |
|---|---|
| **Severity** | CRITICAL |
| **Owner** | backend |
| **Etki** | Bir sirketin verileri baska sirkete gorunur. KVKK ihlali. |
| **Olasi Sebep** | Tenant filter bypass, yeni endpoint'te companyId filtresi unutulmus, cache poisoning |
| **Ilk Kontrol** | Supheli istegi loglardan bul (requestId). Hangi endpoint? Hangi user? Hangi companyId? |
| **Ilk Aksiyon** | Etkilenen endpoint'i gecici olarak devre disi birak. Kullanici erirsimini askiya al. |
| **Detayli Analiz** | findAll/findOne metodlarinda companyId filtresi var mi kontrol et. Audit loglarini incele. |
| **Kalici Cozum** | Integration test ile tum endpoint'lerde cross-tenant test ekle. TenantGuard'i zorunlu kilarak bypass engellemesi |

---

## Incident 13: Memory Spike (>85%)

| | |
|---|---|
| **Severity** | CRITICAL |
| **Owner** | devops |
| **Etki** | OOM killer process'i oldurebilir. Ani restart, veri kaybi riski. |
| **Olasi Sebep** | Memory leak, buyuk PDF uretimi, buyuk query result set, cache sismesi |
| **Ilk Kontrol** | `GET /monitoring/snapshot` → system.memoryUsedMb, process heapUsed |
| **Ilk Aksiyon** | Node.js heap snapshot: `kill -USR2 <pid>`. Gecici: restart. |
| **Detayli Analiz** | Heap dump analizi, buyuk obje tespiti, son deploy degisiklikleri |
| **Kalici Cozum** | --max-old-space-size limiti, streaming response buyuk data icin, pagination zorunlulugu |

---

## Incident 14: CPU Spike (>90%)

| | |
|---|---|
| **Severity** | CRITICAL |
| **Owner** | devops |
| **Etki** | Tum istekler yavaslar. Timeout artar. Event loop bloklanir. |
| **Olasi Sebep** | Sonsuz dongu, agir hesaplama (PDF uretimi), DDoS, kotu regex |
| **Ilk Kontrol** | `top -p <node_pid>`, `GET /monitoring/snapshot` → system.cpuPercent, api.topEndpoints |
| **Ilk Aksiyon** | En cok istek alan endpoint'i belirle. Gerekirse rate limit artir. Scale out (2. instance). |
| **Detayli Analiz** | CPU profile (`--prof`), endpoint bazli latency, concurrent user sayisi |
| **Kalici Cozum** | PDF uretimini worker queue'ya tasi, rate limiting, horizontal scale |

---

## Escalation Matrisi

| Zaman | Aksiyon | Kim |
|-------|---------|-----|
| 0-5 dk | Ilk alarm e-postasi | Otomatik → owner |
| 5-15 dk | Cozulmediyse ikinci uyari (escalation level 1) | Otomatik → owner |
| 15-30 dk | ESCALATED alarm (level 2) → tum team | Otomatik → all |
| 30+ dk | Manuel mudahale gerekli | On-call muhendis |

## Alarm Owner Tablosu

| Owner | Sorumluluk | Ornek Alarmlar |
|-------|-----------|----------------|
| **backend** | Kod, query, API hatalari | Error rate, latency, slow query, tenant leak |
| **devops** | Altyapi, servis durumu | Redis/MinIO/DB down, memory, CPU, queue stuck |
| **finance** | ERP entegrasyon | LOGO sync failure, fatura gecikme |
| **all** | Escalated alarmlar | 30dk+ cozulmemis herhangi bir kritik alarm |
