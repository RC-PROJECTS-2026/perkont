# PerKont Bagimsiz Denetim / Gap Analizi / Operasyonel Olgunluk Incelemesi

**Tarih:** 2026-03-30
**Yontem:** Kod tabanli statik analiz + veri modeli incelemesi + is akisi dogrulamasi
**Kapsam:** Tum backend moduller, entity'ler, servisler, controller'lar

---

## 1. GENEL DURUST DEGERLENDIRME

PerKont teknik olarak saglam bir NestJS uygulamasi. Veritabani tasarimi, state machine'ler, tenant izolasyonu, audit log, PDF uretimi ve e-imza akisi **mimari seviyede dogru kurulmus**.

Ancak: **is sureclerinin yazilima tam yansimasi eksik.** Sistem "yazilimci gozuyle" degil "operasyon/saha/akreditasyon gozuyle" degerlendirildiginde ciddi bosluklari var. Ozellikle:

- Sahada calisan muayene elemaninin ihtiyaclari tam karsilanmiyor
- Musteriden alinmasi gereken evrak/bilgi zorunluluklari yetersiz
- Satistan operasyona devir sureci tanimlanmamis
- Planlama modulu cok siger — sadece WO status degisikligi
- Akreditasyon denetimi icin gereken bircok kayit/belge/izlenebilirlik eksik
- Faturalama oncesi kontrol ve dogrulama zayif
- Musteri portali minimal — sadece listeleme

**Olgunluk Seviyesi:** Yazilim olarak %75, operasyonel olarak %45, akreditasyon uyumu olarak %55.

---

## 2. UCTAN UCA AKISTA BULUNAN EKSIKLER

### 2.1 CRM → Teklif Gecisi

| Eksik | Risk | Detay |
|-------|------|-------|
| Kesif/on inceleme kaydi YOK | YUKSEK | Teklif verilmeden once saha kesfi yapilip yapilmadigi izlenmiyor. Ekipman listesi nereden gelecek? |
| Musteri ihtiyac tespiti formu YOK | ORTA | Hangi ekipman tiplerinde hizmet isteniyor, kac lokasyon, yillik hacim — bu bilgiler yapisal degil |
| Ekipman listesi import/upload YOK | YUKSEK | 500 ekipmanli musteriden Excel listesi alinmali → sisteme toplu yuklenebilmeli. Teklif buna dayanmali |
| Teklife ekipman esleme YOK | KRITIK | Teklif kalemleri (ProposalItem) equipmentId ile eslesmez. "500 adet asansor kontrolu" yazar ama hangi ekipmanlar belli degil |

### 2.2 Teklif → Sozlesme Gecisi

| Eksik | Risk | Detay |
|-------|------|-------|
| Sozlesme ek sartname/protokol alani YOK | YUKSEK | Musteriye ozel sartlar (erisim saatleri, ozel risk, gizlilik) icin yapi yok |
| Sozlesme kapsam tanimi (scope) YOK | KRITIK | Hangi ekipman tipleri, hangi lokasyonlar, hangi periyot — sozlesme kapsaminda yapisal olarak tanimli degil |
| Sozlesme birim fiyat listesi YOK | YUKSEK | Sozlesme icerisinde ekipman tipi bazli birim fiyat tanimi yok — faturalama neye gore yapilacak? |
| Sozlesmeye ekipman listesi baglama YOK | KRITIK | Sozlesme hangi ekipmanlari kapsar belirsiz |

### 2.3 Sozlesme → Planlama/WO Gecisi

| Eksik | Risk | Detay |
|-------|------|-------|
| Planlama modulu YOK | KRITIK | Takvim bazli planlama, denetci musaitligi, rota optimizasyonu, gunluk/haftalik plan — hicbiri yok. WO olusturmak = planlama degil |
| Sozlesme → WO otomatik uretimi YOK | YUKSEK | Aktif sozlesme + yaklasen kontrol tarihi = otomatik WO olusturma mekanizmasi yok. Manuel |
| Muayene elemani atama mantigi yetersiz | ORTA | Denetcinin yetkinligi (hangi ekipman tiplerinde yetkili) kontrol edilmiyor |

### 2.4 WO → Denetim Gecisi

| Eksik | Risk | Detay |
|-------|------|-------|
| Saha oncesi hazirlik checklist'i YOK | YUKSEK | Denetci sahaya gitmeden: ekipman listesi, form sablonu, onceki raporlar, ozel talimatlar — bundle edilmiyor |
| Musteri temsilcisi bilgisi tasinmiyor | ORTA | Sahada kim karsilayacak, telefonu ne — WO'da yok |
| Onceki denetim sonuclari gorulmuyor | YUKSEK | Ayni ekipman icin onceki denetim sonucu, uygunsuzluklar, notlar — denetim ekraninda gorulmuyor |

### 2.5 Denetim → Rapor Gecisi

| Eksik | Risk | Detay |
|-------|------|-------|
| Denetim "ertelendi/iptal/erisim saglanamadi" durumu YOK | YUKSEK | Ekipman calismiyorsa, erisim yoksa, musteri hazir degilse ne olur? Sadece complete/reject var |
| Kismi denetim YOK | ORTA | 50 ekipmanin 45'i denetlendi, 5'i erisilemedi — bu kayit altina alinmiyor |
| Musteri saha teyidi/imzasi YOK | YUKSEK | Denetim tamamlandiginda musterinin sahada teyit imzasi/onayi yok |
| Denetim suresi kaydi YOK | ORTA | Baslangic-bitis saati, toplam sure — performans ve maliyet analizi icin gerekli |

### 2.6 Rapor → Teslim Gecisi

| Eksik | Risk | Detay |
|-------|------|-------|
| Teslim teyidi YOK | YUKSEK | Rapor teslim edildi ama musteri teslim aldigini teyit etmiyor. sadece e-posta gonderimi |
| Fiziksel teslim senaryosu YOK | ORTA | Bazi musteriler basili rapor ister — bu izlenmiyor |
| Rapor indirme loglama KISMİ | DUSUK | Audit log'da REPORT_DOWNLOADED var ama portal tarafinda izlenmiyor |

### 2.7 Teslim → Fatura Gecisi

| Eksik | Risk | Detay |
|-------|------|-------|
| Birim fiyat → toplam hesaplama YOK | KRITIK | WO → Invoice icin fiyat nereden gelecek? Sozlesmede birim fiyat yok, teklifteki fiyat WO'ya tasınmiyor |
| Fatura kalem detayi yetersiz | YUKSEK | InvoiceBatch sadece workOrderIds tutmu — ekipman bazli kalem dokumu yok |
| Fatura oncesi musteri onay sureci YOK | ORTA | Proforma / on fatura → musteri teyit → kesin fatura akisi yok |

---

## 3. EVRAK / FORM / BELGE EKSIKLERI

### 3.1 Sistemde Olmasi Gereken Ama Olmayan Belgeler

| Belge | Nerede Gerekli | Durum | Risk |
|-------|---------------|-------|------|
| Kesif raporu / on inceleme formu | Teklif oncesi | **YOK** | YUKSEK |
| Ekipman envanteri (musteri Excel) | Teklif / sozlesme | **YOK** | KRITIK |
| Sozlesme ek sartnamesi | Sozlesme | **YOK** | YUKSEK |
| Sozlesme kapsam belgesi | Sozlesme | **YOK** | KRITIK |
| Saha giris izni / yetkilendirme | WO / denetim | **YOK** | ORTA |
| Risk degerlendirme formu (saha) | Denetim oncesi | **YOK** | YUKSEK |
| Musteri saha teyit formu | Denetim sonrasi | **YOK** | YUKSEK |
| Uygunsuzluk fotograf delili | Denetim | **KISMI** (photos var ama uygunsuzluk ile esleme zayif) | ORTA |
| Olcum aleti kullanim kaydi | Denetim | **KISMI** (usedInstrumentIds var) | DUSUK |
| Tarafsizlik beyani | Her yil / her musteri | **YOK** | YUKSEK |
| Personel yetkinlik matrisi | Atama | **KISMI** (inspector_qualifications var ama atamada kontrol yok) | KRITIK |
| Kalibrasyon sertifikasi | Denetim | **KISMI** (calibration modulu var ama denetimle eslesme zayif) | YUKSEK |
| Musteri sikayet takip formu | Kalite | **VAR** (complaints modulu) | - |
| Duzeltici faaliyet formu | Kalite | **VAR** (CAPA modulu) | - |
| Ic tetkik raporu | Kalite | **VAR** (internal-audit modulu) | - |
| Yonetimin Gozden Gecirmesi (YGG) | Kalite | **YOK** | YUKSEK |

### 3.2 Eksik Checklist'ler

| Checklist | Amac | Durum |
|-----------|------|-------|
| Satistan operasyona devir checklist'i | Teklif kabul → sozlesme imza → ekipman listesi tamam → WO olusturulabilir | **YOK** |
| Sozlesme evrak checklist'i | Imzali sozlesme + ek protokol + kapsam + fiyat listesi + vekaletname | **YOK** |
| Saha oncesi hazirlik checklist'i | Ekipman listesi + form + onceki raporlar + olcum aletleri + erisim bilgisi | **YOK** |
| Denetim sonrasi eksik evrak checklist'i | Tum fotoğraflar yuklendi mi + tum alanlar dolu mu + uygunsuzluklar dokumante mi | **YOK** |
| Rapor oncesi son kontrol checklist'i | Tum denetim verileri tamam mi + fotolar eslesti mi + ekipman bilgileri dogru mu | **YOK** |
| Faturalama oncesi kontrol checklist'i | WO tamamlandi mi + rapor teslim edildi mi + sozlesme aktif mi + fiyat belli mi | **YOK** |
| Akreditasyon denetim dosya checklist'i | Tum ISO 17020 gereksinimleri icin kayit/belge/delil hazirligi | **YOK** |

---

## 4. KULLANICIDAN ALINMASI GEREKEN TUM VERI VE BELGELER

| # | Asama | Kim Saglar | Bilgi/Belge | Zorunlu | Ne Zaman | Eksikse Dur? | Sistemde | Risk |
|---|-------|-----------|-------------|---------|----------|-------------|---------|------|
| 1 | Musteri kayit | Satis | Sirket unvani, vergi no, vergi dairesi | Evet | Ilk kayit | Evet | VAR | - |
| 2 | Musteri kayit | Satis | Ticaret sicil no, NACE kodu | Evet | Ilk kayit | Hayir | **YOK** | ORTA |
| 3 | Musteri kayit | Satis | Yetkili kisi (ad, tel, email, TC) | Evet | Ilk kayit | Evet | KISMI (TC yok) | ORTA |
| 4 | Musteri kayit | Musteri | Imza sirkuleri / vekaletname | Evet | Sozlesme oncesi | Evet | **YOK** | YUKSEK |
| 5 | Lokasyon | Satis/Musteri | Tam adres, koordinat, ulasim tarifi | Evet | Kayit | Hayir | KISMI (tarif yok) | ORTA |
| 6 | Lokasyon | Musteri | Giris izni gereksinimleri, guvenlik proseduru | Hayir | WO oncesi | Hayir | **YOK** | ORTA |
| 7 | Lokasyon | Musteri | Saha sorumlusu adi, telefonu | Evet | WO oncesi | Hayir | **YOK** | YUKSEK |
| 8 | Ekipman | Musteri/Satis | Ekipman envanteri (Excel/CSV) | Evet | Sozlesme oncesi | Evet | **YOK** (tek tek giris var) | KRITIK |
| 9 | Ekipman | Musteri | Uretim yili, seri no, kapasite, son kontrol tarihi | Evet | Kayit | Hayir | VAR | - |
| 10 | Ekipman | Musteri | Mevcut muayene raporlari (onceki kurulustan) | Hayir | Ilk denetim oncesi | Hayir | **YOK** | ORTA |
| 11 | Ekipman | Musteri | Ekipman teknik dosyasi (imalat belgesi, CE) | Hayir | Denetim oncesi | Hayir | **YOK** | YUKSEK |
| 12 | Ekipman | Musteri | Bakim kayitlari | Hayir | Denetim oncesi | Hayir | **YOK** | ORTA |
| 13 | Teklif | Satis | Ekipman tipi bazli fiyatlandirma | Evet | Teklif olusturma | Evet | VAR (ProposalItem) | - |
| 14 | Teklif | Musteri | Teklif onay/red bildirimi | Evet | Teklif sonrasi | Evet | VAR (accept/reject) | - |
| 15 | Sozlesme | Musteri | Imzali sozlesme (islak/e-imza) | Evet | Sozlesme | Evet | VAR (upload) | - |
| 16 | Sozlesme | Musteri | Ek protokol / ozel sartlar | Hayir | Sozlesme | Hayir | **YOK** | YUKSEK |
| 17 | Sozlesme | Satis | Sozlesme kapsami (lokasyon/ekipman tip listesi) | Evet | Sozlesme | Evet | **YOK** | KRITIK |
| 18 | WO | Planlamaci | Planlanan tarih, denetci, oncelik | Evet | Planlama | Evet | VAR | - |
| 19 | WO | Musteri | Saha erisim onay, randevu teyidi | Hayir | WO oncesi | Hayir | **YOK** | ORTA |
| 20 | Denetim | Muayene elemani | Form doldurma (tum zorunlu alanlar) | Evet | Sahada | Evet | VAR | - |
| 21 | Denetim | Muayene elemani | Ekipman fotograflari | Evet | Sahada | Hayir | VAR | - |
| 22 | Denetim | Muayene elemani | Uygunsuzluk kanit fotograflari | Evet (uygunsuzluk varsa) | Sahada | Evet | KISMI | ORTA |
| 23 | Denetim | Muayene elemani | Olcum sonuclari (kalibrasyon aleti ile) | Evet | Sahada | Evet | KISMI (usedInstruments var, olcum degeri yok) | YUKSEK |
| 24 | Denetim | Muayene elemani | Saha gozlem notlari | Hayir | Sahada | Hayir | VAR (inspectorNotes) | - |
| 25 | Denetim | Musteri | Saha teyit imzasi | Evet | Denetim sonrasi | Hayir | **YOK** | YUKSEK |
| 26 | Rapor | Teknik yonetici | Onay / red / revizyon karari | Evet | Rapor inceleme | Evet | VAR | - |
| 27 | Rapor | Teknik yonetici | Imza (e-imza) | Evet | Rapor onay sonrasi | Evet | VAR | - |
| 28 | Teslim | Musteri | Teslim teyidi (rapor alindigina dair) | Evet | Teslim sonrasi | Hayir | **YOK** | YUKSEK |
| 29 | Fatura | Finans | Fatura kalemleri, birim fiyat, KDV | Evet | Faturalama | Evet | KISMI | YUKSEK |
| 30 | Fatura | Musteri | Odeme teyidi | Hayir | Odeme sonrasi | Hayir | KISMI (paymentStatus var) | DUSUK |
| 31 | Personel | Admin | Muayene elemani sertifika/diploma | Evet | Kayit | Evet | VAR (inspector_qualifications) | - |
| 32 | Personel | Admin | Tarafsizlik beyani | Evet | Yillik | Evet | **YOK** | YUKSEK |
| 33 | Personel | Admin | Egitim kayitlari | Evet | Surekli | Hayir | **YOK** | ORTA |
| 34 | Kalibrasyon | Admin | Kalibrasyon sertifikalari | Evet | Periyodik | Evet | VAR (measuring_instruments) | - |

---

## 5. MODUL BAZLI EKSIKLER

### KRITIK EKSIK

| Modul/Ozellik | Neden Gerekli | Risk |
|---------------|---------------|------|
| **Planlama / Takvim Modulu** | Denetci musaitligi, gunluk rota, haftalik plan, kapasite yonetimi | WO olusturmak ≠ planlama. 100+ denetci ve 500K ekipmanla takvim bazli planlama olmazsa olmaz |
| **Sozlesme ↔ Ekipman Kapsam Eslesmesi** | Hangi sozlesme hangi ekipmanlari kapsar | Faturalama, planlama, yenileme hepsi buna bagimli |
| **Fiyat/Ucret Tarifesi** | Ekipman tipi bazli birim fiyat → teklif + fatura hesaplama | Fatura tutari su an manuelce giriliyor |
| **Saha Oncesi Paket (Bundle)** | Denetciye: ekipman listesi + form + onceki raporlar + ozel talimat | Saha verimi icin kritik |

### YUKSEK ONCELIKLI EKSIK

| Modul/Ozellik | Neden Gerekli | Risk |
|---------------|---------------|------|
| **Yonetimin Gozden Gecirmesi (YGG)** | ISO 17020 zorunlu surec | Akreditasyon denetiminde soru isareti |
| **Personel Egitim Takibi** | Denetci yetkinlik surekliligi | Akreditasyon gereksinimleri |
| **Tarafsizlik Beyani Yonetimi** | ISO 17020 5.2.3 zorunlu | Her musteri icin yillik beyan |
| **Ekipman Toplu Import (Excel)** | 500 ekipmanli musteri icin | Operasyonel verim |
| **Musteri Saha Teyit Formu** | Denetim tamamlandi kaniti | Anlaşmazlik durumunda savunma |
| **Teslim Teyit Mekanizmasi** | Rapor teslim edildigi kaniti | Muhasebe ve hukuki koruma |
| **Denetim Erteleme/Iptal Durumu** | Saha erisim yok, ekipman calismıyor | Gercek hayatta sik yasanir |
| **Sozlesme Otomatik WO Uretimi** | Kontrol tarihi yaklasan ekipmanlar icin otomatik WO | Planlama verimliligi |

### VERIM ARTIRICI

| Modul/Ozellik | Neden Gerekli |
|---------------|---------------|
| Harita bazli lokasyon gorunumu | Rota optimizasyonu |
| SMS bildirim entegrasyonu | Musteri randevu hatirlatmasi |
| Mobil fotograf otomatik GPS taglemesi | Saha kaniti guclendirir |
| Ekipman QR tarama → denetim baslat | Sahada hiz |
| Dashboard: denetci bazli performans | Yonetim karari |
| Dashboard: musteri bazli gelir analizi | Satis karari |
| Toplu rapor indirme (ZIP) | Musteri talebi |

---

## 6. ROL BAZLI DEGERLENDIRME

### Satisci
> "Musteriye teklif vermeden once sahaya gittim, ekipman listesini Excel'e yazdim. Ama sisteme toplu yukleyemiyorum, tek tek giriyorum. Teklif kalemleri ile ekipmanlar eslesmediginden 'siz 450 dediydiniz ama biz 430 kontrol ettik' tartismasi oluyor."

### Satis Muduru
> "Pipeline guzel ama tekliften sozlesmeye geciste kayip oranini olcemiyorum. Kesif yapildi mi, teklif gonderildi mi, kac gun gecti — bu metrikleri goremiyorum. Satiscilarimin performansini karsilastiramiyorum."

### Planlamaci
> "Takvim yok. Hangi denetci hangi gun musait, kac is emri acik, hangi lokasyonlar yakin — bunlari Excel'de yapiyorum. 150 denetci ve gunluk 200+ is emriyle bu sureceklenemiyor."

### Muayene Elemani
> "Sahaya gittigimde onceki denetim sonucunu goremiyorum. Musterinin ozel talimatlari (mesela 'asansor makine dairesi 3. katta, anahtar guvenlikteki Ahmet Bey'de') hicbir yerde yazmiyor. Ekipman calismiyor veya erisim yok durumunu 'basarisiz denetim' olarak kaydedemiyorum."

### Teknik Yonetici
> "Rapor onaylarken denetcinin cektigi fotograflari tek tek aciyorum ama hangi fotograf hangi uygunsuzluga ait belirsiz. Son kontrol listesi yok — raporu onaylamadan once '5 zorunlu madde tamam mi?' gibi bir checklist ise yarar."

### Kalite Sorumlusu
> "YGG modulu yok. Ic tetkik ve CAPA modulleri var ama bunlarin birbirine baglanmasi (tetkik bulgusu → CAPA → izleme) otomatik degil. Tarafsizlik beyani yonetimi tamamen manual. Akreditasyon denetcisi gelse 'personel egitim kayitlariniz nerede?' dediginde gosterecek ekranim yok."

### Finans
> "Fatura hazirlarken birim fiyat nereden gelecek bilmiyorum. Sozlesmede fiyat listesi yok. WO'da fiyat bilgisi yok. Her seferinde sozlesme PDF'ini acip manuel bakiyorum. Proforma → onay → kesin fatura akisi yok."

### Musteri
> "Portalda sadece ekipman listesi, rapor listesi, sozlesme listesi gorebiliyorum. Yeni kontrol talebi acamiyorum. Uygunsuzluk icin duzeltici faaliyet durumunu izleyemiyorum. Fatura durumumu goremiyorum."

### Akreditasyon Denetcisi
> "ISO 17020 gereksinimlerinin buyuk kismi daginik. Personel yetkinlik matrisi nerede? Tarafsizlik beyanlari nerede? Kalibrasyon sertifikalari muayene kayitlarina baglanmis mi? YGG kayitlari nerede? Dokuman kontrol proseduru nerede?"

### Sirket Sahibi
> "Toplu gorunumde kac musteri aktif, kac sozlesme bitiyor, kac teklif reddedildi, aylık ciro tahmini ne — bunlari tek ekranda goremiyorum. Executive dashboard var ama is zekasi seviyesinde degil."

---

## 7. AKREDITASYON EKSIKLERI (ISO/IEC 17020)

| ISO 17020 Maddesi | Gereksinim | PerKont Durumu |
|-------------------|------------|----------------|
| 5.1.1 | Yasal kimlik ve sorumluluk | KISMI (companies tablosu var ama accreditation_scope detayi yetersiz) |
| 5.2.1 | Tarafsizlik | **YOK** — Tarafsizlik beyani yonetimi yok |
| 5.2.3 | Tarafsizlik analizi | **YOK** — Musteri bazli tarafsizlik risk analizi yok |
| 6.1.1-6.1.6 | Personel yetkinlik | KISMI — inspector_qualifications var ama egitim, deneyim, performans degerlendirmesi eksik |
| 6.1.8 | Personel yetkilendirme | **YOK** — Hangi personel hangi muayene tipinde yetkili, yetkilendirme kaydi yok |
| 6.2 | Tesisler ve ekipman | KISMI — Kalibrasyon takibi var ama muayene ile baglantisi zayif |
| 7.1.1 | Muayene metodlari | KISMI — Form sablonlari var ama prosedur referansi, standart baglantisi eksik |
| 7.1.5 | Muayene kayitlari | VAR — Inspection + fieldValues + photos |
| 7.1.8 | Uygunsuzluk yonetimi | KISMI — nonconformities var ama takip/kapatma dongusu zayif |
| 7.4 | Muayene raporlari | VAR — PDF uretimi + e-imza + hash dogrulama |
| 7.5 | Sikayet ve itiraz | VAR — complaints modulu |
| 8.1 | Yonetim sistemi | KISMI — Audit log + CAPA var ama dokuman kontrol proseduru yok |
| 8.2 | Dokuman kontrolu | **YOK** — Prosedur, talimat, form versiyonlama sistemi yok |
| 8.5 | Ic tetkik | VAR — internal-audit modulu |
| 8.6 | Yonetimin gozden gecirmesi | **YOK** — YGG modulu yok |
| 8.7 | Duzeltici faaliyet | VAR — CAPA modulu |

---

## 8. ONCELIKLENDIRILMIS AKSIYON PLANI

### KRITIK (Production oncesi veya hemen sonra)

| # | Aksiyon | Neden |
|---|---------|-------|
| K1 | Sozlesme kapsam modeli: sozlesme ↔ ekipman tipi ↔ lokasyon eslesmesi | Faturalama, planlama, yenileme hepsi buna bagimli |
| K2 | Birim fiyat tarifesi: ekipman tipi bazli fiyatlandirma | Otomatik fatura hesaplama icin sart |
| K3 | Teklif kalemi ↔ ekipman eslesmesi | "Kac ekipman icin teklif verdik" sorusuna cevap |
| K4 | Denetim erteleme/iptal/erisim yok durumu | Gercek saha senaryosu — simdiki haliyle kayip |

### YUKSEK (Ilk 1-2 ay)

| # | Aksiyon | Neden |
|---|---------|-------|
| Y1 | Planlama / takvim modulu (en azindan temel) | 150 denetci yonetilemez |
| Y2 | Ekipman toplu import (Excel/CSV) | Buyuk musterilerde operasyonel darbogazı |
| Y3 | Musteri saha teyit formu (dijital imza) | Hukuki koruma + akreditasyon kaniti |
| Y4 | Tarafsizlik beyani yonetimi | ISO 17020 zorunlu |
| Y5 | YGG modulu | ISO 17020 zorunlu |
| Y6 | Personel yetkilendirme matrisi (hangi tip muayenede yetkili) | Akreditasyon + atama kontrolu |
| Y7 | Sozlesme → WO otomatik uretim (kontrol tarihi yaklasinca) | Operasyon verimliligi |
| Y8 | Rapor teslim teyit mekanizmasi | Muhasebe ve hukuki |
| Y9 | Teklif/sozlesme ek sartname/protokol alani | Musteriye ozel sartlar |

### ORTA (3-6 ay)

| # | Aksiyon | Neden |
|---|---------|-------|
| O1 | Onceki denetim sonuclarini yeni denetimde goster | Saha verimi |
| O2 | Saha oncesi paket (bundle): form + ekipman listesi + onceki rapor | Denetci hazirlik |
| O3 | Portal: kontrol talep acma, fatura durumu, uygunsuzluk takibi | Musteri memnuniyeti |
| O4 | Proforma fatura → musteri onay → kesin fatura akisi | Finans surec iyilestirme |
| O5 | Dokuman kontrol modulu (prosedur/talimat versiyonlama) | Akreditasyon |
| O6 | Personel egitim takip modulu | Akreditasyon |
| O7 | Satistan operasyona devir checklist'i | Surec guvenceleme |
| O8 | Rapor oncesi son kontrol checklist'i | Kalite guvenceleme |

### DUSUK (6+ ay / nice-to-have)

| # | Aksiyon |
|---|---------|
| D1 | Harita bazli lokasyon + rota optimizasyonu |
| D2 | SMS bildirim entegrasyonu (randevu hatirlatma) |
| D3 | Mobil GPS tagleme (fotograf lokasyonu) |
| D4 | Executive BI dashboard (ciro tahmini, musteri analizi) |
| D5 | Toplu rapor indirme (ZIP) |
| D6 | Musteri satisfaction survey entegrasyonu |

---

## 9. SON HUKUM

### Nerede Guclu

- **Teknik mimari** saglam: NestJS + TypeORM + MySQL + Redis + MinIO dogru secimler
- **Guvenlik** iyi: JWT + MFA + tenant izolasyon 3 katman + audit trail
- **State machine'ler** artik tum ana modullerde (proposal, contract, WO)
- **PDF uretimi + e-imza + hash dogrulama** cok iyi implementasyon
- **Offline sync** mantigi dogru dusunulmus (mobile)
- **Monitoring** production-ready seviyede

### Nerede Zayif

- **Planlama modulu YOK** — en buyuk operasyonel bosluk
- **Sozlesme-ekipman kapsam eslesmesi YOK** — tum faturalama ve planlama zincirini kirar
- **Saha operasyonu ihtiyaclari eksik** — denetci perspektifi yetersiz yansimis
- **Akreditasyon uyumu %55** — tarafsizlik, YGG, personel yetkilendirme, dokuman kontrol eksik
- **Faturalama zinciri kirik** — birim fiyat taninmadan otomatik fatura uretilemiyor
- **Musteri portali minimal** — sadece listeleme, etkilesim yok

### Olgun Urun Icin Kapanmasi Gereken Eksikler

Yukaridaki **K1-K4** (kritik) ve **Y1-Y9** (yuksek) kapatildiginda PerKont gercek anlamda **operasyonel olgunluga** ulasir. Bu 13 madde toplam tahmini 3-4 aylik gelistirme suresi demek.

Mevcut haliyle yazilim:
- **Demo / pilot musteri icin KULLANILABILIR**
- **Tam operasyonel kullanim icin YETERSIZ** (planlama, fiyatlandirma, akreditasyon bosluklari)
- **Akreditasyon denetimi icin HAZIR DEGIL** (tarafsizlik, YGG, personel yetkilendirme, dokuman kontrol)
