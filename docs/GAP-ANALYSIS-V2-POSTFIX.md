# PerKont Gap Analizi V2 — Fix Sonrasi Yeniden Denetim

**Tarih:** 2026-03-30
**Onceki Rapor:** GAP-ANALYSIS-REPORT.md + GAP-ANALYSIS-SUPPLEMENT.md (tum bulgular kapatildi)
**Bu Rapor:** Kapatilan fixlerden SONRA yapilan taze denetim — yeni/farkli bulgular

---

## 1. GENEL DURUST DEGERLENDIRME

Onceki gap analizinde tespit edilen **21 kritik/yuksek bulgunun tamami kapatildi**. Yeni moduller (sozlesme kapsam, fiyat tarifesi, planlama, YGG, tarafsizlik, checklist, saha teyit, dokuman kontrol vb.) gercek implementasyon — stub degil.

**Ancak:** Yeni denetimde **onceki turda yakalanmamis 25 farkli bulgu** tespit edildi. Bunlar ozellikle:
- Moduller arasi entegrasyon bosluklari (modul var ama birbirine baglanmamis)
- Is kurali boslukları (business validation eksikleri)
- Offline sync edge case'leri
- Faturalama zinciri otomasyonu eksikligi

**Onceki tur mimari eksikleri kapatti. Bu tur operasyonel butunlugu kapatiyor.**

---

## 2. UCTAN UCA AKISTA YENI BULUNAN EKSIKLER

### 2.1 Sozlesme Kapsam ↔ Is Emri Kopuklugu

| Bulgu | Detay | Risk |
|-------|-------|------|
| **WO ekipman tipi sozlesme kapsaminda mi kontrol edilmiyor** | contract_scope_items tablosu ve servisi var ama WO olusturmada isEquipmentInScope() cagirilmiyor | KRITIK |
| **Sozlesme kapsamiz aktif edilebiliyor** | activate() method'u scope item kontrolu yapmiyor | YUKSEK |

### 2.2 Faturalama Zinciri Kirik

| Bulgu | Detay | Risk |
|-------|-------|------|
| **Fatura tutari manuel giriliyor, otomatik hesaplanmiyor** | contract_scope_items.unitPrice ve pricing_tariffs.basePrice var ama invoice-preparation bunlari kullanmiyor | KRITIK |
| **WO tamamlandi → fatura tutari yolu yok** | Otomatik hesaplama servisi eksik | KRITIK |
| **work_order_equipment.unitPrice NULL olabiliyor** | Fatura hesaplamasi icin zorunlu olmali | YUKSEK |

### 2.3 Personel Yetkilendirme Delikleri

| Bulgu | Detay | Risk |
|-------|-------|------|
| **Denetim baslatmada yetkilendirme kontrolu yok** | WO assign'da var ama inspection start()'ta yok | KRITIK |
| **Yetkilendirme sona erme tarihi kontrol edilmiyor** | expiresAt kolonu var ama sorgu sadece isActive=1 kontrol ediyor | YUKSEK |

### 2.4 Offline Sync Edge Case'leri

| Bulgu | Detay | Risk |
|-------|-------|------|
| **Server-side degisiklikler offline sync'te eziliyor** | Merge stratejisi yok, last-write-wins | YUKSEK |
| **Ayni ekipmana 2 farkli denetci denetim baslatabiliyor** | inspectorId bazli kontrol var ama equipment bazli degil | ORTA |

### 2.5 Cascading Validation Eksiklikleri

| Bulgu | Detay | Risk |
|-------|-------|------|
| **Musteri pasife alinirken acik sozlesme/WO/denetim kontrolu yok** | Dogrudan isActive=false yapiliyor | YUKSEK |
| **Ekipman hurdaya ayrilirken acik denetim kontrolu yok** | Status degistirilirken hicbir kontrol yok | YUKSEK |
| **Sozlesme sona erdiginde acik WO'lar icin islem yok** | Otomatik iptal veya uyari mekanizmasi yok | ORTA |

### 2.6 Bildirim Eksiklikleri

| Bulgu | Detay | Risk |
|-------|-------|------|
| **Sozlesme bitis yaklasiyor bildirimi yok** | getExpiringContracts() var ama cron'dan cagirilmiyor | YUKSEK |
| **Ekipman kontrol suresi gecti bildirimi yok** | Sadece "yaklasiyor" var, "gecti" yok | ORTA |
| **CAPA teslim tarihi gecti bildirimi yok** | Cron job yok | ORTA |
| **Kalibrasyon suresi gecti bildirimi yok** | getExpiring() var ama scheduled task yok | ORTA |

### 2.7 Rapor Butunluk Kontrolu

| Bulgu | Detay | Risk |
|-------|-------|------|
| **Rapor PDF'inde tum denetim verileri var mi dogrulanmiyor** | PDF uretildikten sonra icerik dogrulamasi yok | ORTA |
| **Fotograf ↔ uygunsuzluk eslesmesi zayif** | Ayri tablolarda, foreign key yok | ORTA |

---

## 3. EVRAK/FORM/BELGE — YENI BULGULAR

| Eksik | Nerede | Durum |
|-------|--------|-------|
| Fatura hesaplama raporu (birim fiyat × adet dokumu) | Faturalama | **YOK** |
| Sozlesme kapsam ozet belgesi (hangi ekipman tipleri, kac adet, birim fiyat) | Sozlesme | **KISMI** (tablo var, PDF/export yok) |
| Personel yetkilendirme karar belgesi otomatik uretimi | Personel | **YOK** (documentUrl alani var ama otomatik uretim yok) |
| Denetim tamamlanma ozet raporu (WO bazli, tum ekipmanlar) | Denetim | **YOK** |
| Musteri bazli denetim ozeti raporu | Raporlama | **YOK** |
| Lokasyon bazli ekipman kontrol durumu raporu | Raporlama | **YOK** |
| Uygunsuzluk takip raporu (CAPA ile baglantili) | Kalite | **YOK** |

---

## 4. KULLANICIDAN ALINMASI GEREKEN VERI — YENI KALEMLER

| # | Asama | Kim | Bilgi | Sistemde | Risk |
|---|-------|-----|-------|----------|------|
| 63 | WO olusturma | Finans/Satis | Her ekipman icin birim fiyat (sozlesme kapsamından) | **KISMI** (tablo var, otomatik cekim yok) | KRITIK |
| 64 | Denetim sonrasi | Muayene elemani | Fotograf ↔ uygunsuzluk eslestirmesi | **ZAYIF** | ORTA |
| 65 | Faturalama | Finans | Fatura kalem detayi (ekipman tipi × adet × birim fiyat) | **YOK** (toplam manuel) | KRITIK |

---

## 5. EKSIK CHECKLIST'LER — YENI

| Checklist | Amac | Durum |
|-----------|------|-------|
| Sozlesme aktivasyon oncesi kontrol | Kapsam tanimli mi? Birim fiyat girildi mi? Belge yuklendi mi? | **YOK** |
| WO kapsam dogrulama | WO'daki ekipman tipleri sozlesme kapsaminda mi? | **YOK** |
| Fatura uzlasma kontrolu | Hesaplanan tutar vs manuel tutar uyusuyor mu? | **YOK** |

---

## 6. ROL BAZLI YENI DEGERLENDIRME

### Finans Mudurunun Elestirisi
> "contract_scope_items ve pricing_tariffs tablolari eklenmis ama fatura hazirlarken bunlari kullanamiyorum. Tutar hala elle giriliyor. Birim fiyat × ekipman sayisi = toplam hesaplamasini sistem otomatik yapmali."

### Akreditasyon Denetcisinin Elestirisi
> "Personel yetkilendirme matrisi guzel ama denetim baslatirken yetkilendirme kontrolu yok. Yetkisiz personel denetim yapabiliyor — bu ISO 17020 6.1.8 ihlali."

### Teknik Yoneticinin Elestirisi
> "Rapor onaylarken rapor PDF'inde gercekten tum denetim verileri var mi bilmiyorum. Bir butunluk kontrolu / ozet karsilastirmasi olsa iyi olur."

---

## 7. ONCELIKLENDIRILMIS AKSIYON PLANI

### KRITIK (Hemen)

| # | Aksiyon | Neden |
|---|---------|-------|
| C1 | **Fatura otomatik hesaplama:** WO ekipman sayisi × sozlesme birim fiyat → toplam | Manuel fatura hatasi riski |
| C2 | **WO olusturmada sozlesme kapsam kontrolu:** isEquipmentInScope() cagir | Kapsam disi hizmet riski |
| C3 | **Denetim start()'ta personel yetkilendirme kontrolu** | ISO 17020 ihlali |
| C4 | **Yetkilendirme expiresAt kontrolu** ekle | Suresi dolmus yetki ile denetim riski |

### YUKSEK (1-2 Sprint)

| # | Aksiyon |
|---|---------|
| H1 | Sozlesme aktivasyonda kapsam kontrolu |
| H2 | Musteri pasife alma oncesi cascading kontrol |
| H3 | Ekipman hurda oncesi acik denetim kontrolu |
| H4 | Sozlesme bitis bildirimi (cron) |
| H5 | Offline sync merge stratejisi (timestamp comparison) |

### ORTA (Sonraki Release)

| # | Aksiyon |
|---|---------|
| M1 | Musteri/lokasyon/ekipman raporlari |
| M2 | Uygunsuzluk takip raporu |
| M3 | CAPA/kalibrasyon gecikme bildirimleri |
| M4 | Rapor PDF butunluk dogrulamasi |
| M5 | Fotograf ↔ uygunsuzluk foreign key |

---

## 8. SON HUKUM

### Guclu Taraflar
- Onceki 21 gap bulgusu tamamen kapatildi
- Yeni moduller (planlama, checklist, YGG, tarafsizlik, dokuman kontrol) gercek implementasyon
- State machine'ler tum kritik modullerde
- Tenant izolasyonu 3 katman
- 78/78 unit test pass, build temiz

### Zayif Taraflar
- **Moduller arasi entegrasyon eksik** — contract_scope var ama WO onu kontrol etmiyor, pricing_tariffs var ama fatura onu kullanmiyor
- **Faturalama zinciri hala kirik** — birim fiyat tanimi var ama otomatik hesaplama yok
- **Personel yetkilendirme enforcement yetersiz** — WO atamada var, denetim baslatmada yok
- **Cascading validations eksik** — musteri/ekipman pasif ederken bagli kayitlar kontrol edilmiyor

### Olgun Urun Icin Kapatilmasi Gereken 4 Kritik Bulgu

1. Fatura otomatik hesaplama (C1)
2. WO sozlesme kapsam kontrolu (C2)
3. Denetim baslatma yetkilendirme (C3)
4. Yetkilendirme sona erme kontrolu (C4)

Bu 4 bulgu kapatildiginda sistem **tam operasyonel olgunluga** ulasir.
