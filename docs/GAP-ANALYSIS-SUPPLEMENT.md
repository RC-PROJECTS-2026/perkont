# GAP ANALİZİ — TAMAMLAYICI RAPOR

Ilk raporda (GAP-ANALYSIS-REPORT.md) eksik kalan veya yuzeysel gecilen bolumlerin detayli tamamlamasi.

---

## BOLUM 3A: AKIS DENETIMI — 5 ZORUNLU SORUNUN CEVAPLANMASI

### Soru 1: Uctan uca surecte mantik hatasi var mi?

**EVET — 3 adet:**

1. **Sozlesme kapsamı tanımsız olduğu için WO hangi ekipmanları kapsadığı belirsiz.** WO'ya eklenen ekipmanlar sözleşme kapsamında mı değil mi kontrol edilmiyor. Sözleşmede "asansör" yazıyor ama WO'ya forklift ekipmanı eklenebilir.

2. **Denetim tamamlandığında ekipman nextControlDate güncelleniyor — ama denetim RED aldığında da güncelleniyor.** Reddedilen denetim sonrası kontrol tarihi ileri atılmamalı. `equipmentService.updateAfterInspection()` inspection result'a bakıyor mu doğrulanmalı — eğer sadece tarih bazlı güncelliyorsa, reddedilen denetimde de tarih ileri kayar.

3. **Teklif revision zinciri kopuk.** revision oluşturulduğunda eski teklif ile yeni teklif arasında parentProposalId bağlantısı var ama müşteri tarafında "bu teklifin 3 revisyonu var, hepsini karşılaştır" görünümü yok. Teklif kabul edildiğinde hangi revisionun kabul edildiği sözleşmeye taşınmıyor.

### Soru 2: Surecte bosluk / kopukluk / cift anlamli gecis var mi?

**EVET:**

1. **Sözleşme signed → active boşlugu** (önceki bulguda kapatıldı — iki taraf imzaladığında otomatik aktif oluyor artık)
2. **WO completed → report_pending boşluğu.** WO completed olduğunda otomatik report_pending'e geçmiyor. Manuel mi otomatik mi belli değil. Denetim tamamlanınca inspection COMPLETED oluyor, WO durumu ise hâlâ IN_PROGRESS kalıyor. WO'nun completion'ı ile inspection completion'ı arasında senkronizasyon açık.
3. **Birden fazla denetim → tek rapor ilişkisi belirsiz.** Bir WO'da 50 ekipman var, her biri ayrı inspection. 50 inspection'dan 50 ayrı rapor mu çıkar? Yoksa hepsi tek rapor mu? Kod incelendiğinde: her inspection → ayrı rapor. Ama müşteriye genellikle tek birleştirilmiş rapor gönderilir. Birleştirme mekanizması yok.

### Soru 3: Kullanici yanlis sirayla ilerleyebiliyor mu?

**EVET — State machine eklenmeden önceki hali çok açıktı. Şimdi:**

- Teklif: VALID_TRANSITIONS ile korumalı → **KAPALI**
- Sözleşme: VALID_CONTRACT_TRANSITIONS ile korumalı → **KAPALI**
- İş Emri: VALID_WO_TRANSITIONS ile korumalı → **KAPALI**
- Denetim: Status kontrolü methodlarda hardcoded → **KISMI** (tam state machine map yok, ama methodlarda kontrol var)
- Rapor: Status kontrolü methodlarda hardcoded → **KISMI**

**Hâlâ açık risk:** Doğrudan DB erişimi veya admin API ile status bypasslanabilir. `update()` method'ları hâlâ status'u kabul ediyor — proposals.module.ts'deki update() methodu status validasyonu yapmıyor.

### Soru 4: Ayni islemin iki farkli yerden yapilmasi veri tutarsizligi dogurur mu?

**EVET:**

1. **Müşteri verisi:** Hem customers tablosunda hem proposals'da customerId üzerinden çekiliyor. Ama proposal'da müşteri adı/adresi snapshot'lanmıyor. Müşteri adı değişirse eski tekliflerdeki müşteri adı da değişir → ticari kayıt bozulur.
2. **Sözleşme:** Hem contracts tablosu hem contract_documents tablosu var. proposals.module.ts contract_documents'a yazıyor, contracts.service.ts contracts tablosunu yönetiyor. İkisi arasındaki ilişki net değil — muhtemelen ikisi aynı tablo (migration'da contract_documents olarak oluşturulmuş, entity contracts olarak tanımlanmış).

### Soru 5: "Bu adim tamamlanmadan digerine gecilemez" kurallari yeterli mi?

**HAYIR — Eksik kurallar:**

| Gecis | Kural Olmali | Var mi |
|-------|-------------|--------|
| Teklif → gönder | En az 1 kalem | VAR |
| Teklif → kabul | Süresi dolmamış | VAR |
| WO → oluştur | En az 1 ekipman | VAR |
| WO → oluştur | Sözleşme kontrolü | VAR |
| Denetim → tamamla | Zorunlu alanlar dolu | VAR |
| Rapor → e-imza | Hash doğrulama | VAR |
| **Denetim → başlat** | **Denetçi bu tip ekipmanda yetkili mi** | **YOK** |
| **WO → ata** | **Denetçi sertifikası geçerli mi** | **YOK** |
| **Rapor → onayla** | **Tüm fotoğraflar yüklendi mi** | **YOK** |
| **Fatura → oluştur** | **Rapor teslim edildi mi** | **YOK** |
| **Sözleşme → aktif** | **İmzalı belge yüklendi mi** | **YOK** |

---

## BOLUM 3C: MUSTERI / LOKASYON / EKIPMAN DETAYLI DENETIM

### Müşteri Kartında Eksik Alanlar

| Alan | Neden Gerekli | Durum |
|------|---------------|-------|
| Ticaret sicil numarası | Resmi yazışma, sözleşme | **YOK** |
| NACE kodu / faaliyet alanı | Akreditasyon kapsamı eşleme | **YOK** |
| KEP adresi | Resmi bildirim zorunluluğu | **YOK** |
| MERSIS numarası | Ticari doğrulama | **YOK** |
| Yetkili kişi TC kimlik no | Sözleşme imza yetkisi doğrulama | **YOK** |
| İmza sirküleri dosyası | Sözleşme geçerliliği | **YOK** |
| Müşteri risk seviyesi (ticari) | Ödeme riski, sözleşme şartları | **YOK** |
| Müşteri segmenti (büyük/orta/küçük) | Satış stratejisi, fiyatlandırma | **YOK** |

### Lokasyon Kartında Eksik Alanlar

| Alan | Neden Gerekli | Durum |
|------|---------------|-------|
| Ulaşım tarifi / yol tarifi | Denetçi sahaya gittiğinde | **YOK** |
| Giriş izni / güvenlik prosedürü | Organize sanayi, askeri tesis vb. | **YOK** |
| Saha sorumlusu adı + telefonu | Sahada buluşma/koordinasyon | **YOK** |
| Çalışma saatleri / erişim saatleri | Planlama | **YOK** |
| Özel risk notları (kimyasal, yükseklik vb.) | İş güvenliği | **YOK** |
| Lokasyon tipi (fabrika/ofis/şantiye/AVM) | Planlama ve risk | **YOK** |
| Fotoğraf (genel görünüm) | Denetçi tanıma | **YOK** |

### Ekipman Kartında Eksik Alanlar

| Alan | Neden Gerekli | Durum |
|------|---------------|-------|
| Risk sınıfı / tehlike kategorisi | Denetim önceliklendirme | **YOK** |
| Kat / bölüm / tam yerleşim bilgisi | Sahada bulma | KISMI (installationLocation var ama serbest metin) |
| CE belgesi var mı / belge no | Teknik dosya | **YOK** |
| Bakım sözleşmesi var mı / bakımcı firma | Mevzuat gerekliligi | **YOK** |
| Son bakım tarihi | Denetim değerlendirme | **YOK** |
| İmalat belgesi / tip onay belgesi | Teknik dosya | **YOK** |
| Ekipman aktif/pasif nedeni | Neden pasife alındı (hurda, satıldı, devreden çıktı) | **YOK** |
| Mevcut muayene rapor numarası (önceki kuruluş) | İlk denetim referansı | **YOK** |

### Aynı Ekipman Tipinden Çoklu Kayıt

Mevcut sistem bunu destekliyor (inventoryCode unique). Ancak:
- **Seri kayıt oluşturma (batch create) var** ama saha girdisi olarak kullanılamıyor
- Aynı lokasyonda 200 adet aynı tip asansör → bunları ayırt etmek için inventoryCode + installationLocation yeterli mi? **Kat/blok/daire bilgisi yapısal olarak yok.**

---

## BOLUM 3D: SATIS / CRM DETAYLI DENETIM

### Satışcı İçin Eksik Alanlar/Özellikler

| Eksik | Neden Gerekli |
|-------|---------------|
| Keşif formu / ön inceleme kaydı | Sahaya gidip ekipman listesi + durum tespiti |
| Teklif maliyet hesaplama aracı | Ekipman sayısı × birim fiyat → otomatik toplam |
| Rakip teklif bilgisi | "Müşteri başka firmadan X TL teklif aldı" |
| Kaybedilen teklif nedeni | "Fiyat yüksek / başka firma / ertelendi" — analiz için |
| Müşteri görüşme notu şablonu | Yapısal kayıt — şu an serbest metin |
| Teklife ekipman listesi ekleme | Teklif PDF'inde hangi ekipmanlar listeli olsun |

### Müşteri Temas Geçmişi

SalesActivity entity'si var:
- type (call/email/meeting/note/follow_up)
- description (serbest metin)
- outcomeNotes, followUpDate

**Yeterlilik:** KISMI. Yapısal olarak var ama:
- Temas süresi yok (toplantı kaç dakika sürdü)
- Katılımcı listesi yok
- Sonraki adım (action item) yapısal olarak yok
- Temas sonucu kategorisi yok (olumlu/olumsuz/nötr)

### Renewal Fırsat Tarafı

Mevcut: Cron ile 60 gün içinde kontrol tarihi olan ekipmanlar için otomatik fırsat oluşturma.

**Eksikler:**
- Yalnızca yeni fırsat oluşturur, mevcut sözleşme yenileme teklifi otomatik oluşturmaz
- Sözleşme bitiş tarihi yaklaşan müşteriler için ayrı renewal mekanizması yok
- Fırsat tutarı 0 olarak ayarlanıyor — ekipman sayısı × birim fiyat hesaplanamiyor (birim fiyat yok)

---

## BOLUM 3G: DENETIM / SAHA — ATLANMIS SENARYOLAR

### Müşteri İmzası / Saha Teslim Teyidi

**YOK.** Sahada denetim tamamlandığında müşteri yetkilisinin "denetim yapıldı, denetçi buradaydı" teyidi alınmıyor. Bu:
- Akreditasyon denetiminde soru yaratır
- "Denetçi hiç gelmedi" itirazlarına karşı savunmasız bırakır
- Saha tabletinde dijital imza alınabilir ama mekanizma yok

### Erteleme / Kısmı Tamamlanma / Erişilemedi Senaryoları

| Senaryo | Sistemdeki Karşılık |
|---------|-------------------|
| Ekipman çalışmıyor, denetlenemedi | **YOK** — inspection result'ta sadece uygun/uygunsuz/kısmi/uygulanamaz var. "Denetlenemedi" yok |
| Lokasyona erişim sağlanamadı | **YOK** — WO iptal veya erteleme durumu yok (cancelled var ama erteleme yok) |
| Denetim kısmen tamamlandı (50 ekipmandan 45'i) | **YOK** — inspection per equipment bazlı ama WO düzeyinde "kısmen tamamlandı" durumu yok |
| Müşteri denetimi durdurdu | **YOK** |
| Hava koşulları nedeniyle ertelendi | **YOK** |
| Denetçi hastalandı, başkası devam etti | **YOK** — assignedInspectorId tekil, devir mekanizması yok |

### Ölçüm Sonuçları

inspection.fieldValues içinde ölçüm değerleri saklanabiliyor (formda NUMBER tipinde alan). Ancak:
- Hangi ölçüm aletiyle yapıldığı ayrı kayıtta (usedInstrumentIds)
- **Ölçüm aleti → ölçüm değeri eşlemesi YOK.** "Kalibre edilmiş 1234 numaralı alçak gerilim ölçer ile 2.5V ölçüldü" kaydı yapısal olarak oluşturulamıyor
- Kalibrasyon sertifika numarası ölçüm kaydına bağlanmıyor

---

## BOLUM 3H: TEKNIK YONETICI / RAPOR — DETAY

### TY'nin Karar Vermesi İçin Görmesi Gerekenler

| Bilgi | Var mı |
|-------|--------|
| Denetim form verileri | VAR (inspection fieldValues) |
| Fotoğraflar | VAR (inspection photos) |
| Uygunsuzluklar | VAR (nonconformities) |
| Denetçi notları | VAR (inspectorNotes) |
| Kullanılan ölçüm aletleri | VAR (usedInstrumentIds) |
| **Önceki denetim sonucu (karşılaştırma)** | **YOK** |
| **Fotoğraf ↔ uygunsuzluk eşlemesi** | **ZAYIF** (ayrı listeler, bağlantı belirsiz) |
| **Ekipmanın son bakım tarihi** | **YOK** |
| **Ekipmanın teknik dosya bilgisi** | **YOK** |
| **Rapor öncesi kontrol checklist'i** | **YOK** |

### Rapor ile Denetim Verisi Arasında Kayıp

Rapor PDF'i form template coordinate'lerine göre oluşturuluyor. Ancak:
- PDF'e hangi verilerin basıldığını doğrulayan bir "rapor veri özeti" yok
- Template mapping hatası varsa (yanlış fieldKey → yanlış koordinat) bunu otomatik tespit eden kontrol yok
- Raporun hangi form template revision'ı ile üretildiği raporda var (`formTemplateRevision`) ama template değiştiğinde eski raporlarla karşılaştırma mekanizması yok

---

## BOLUM 7: EKSIK 2 ROL DEGERLENDIRMESI

### Planlamacı (genişletilmiş)

> "Benim ihtiyaçlarım:
> 1. Takvim görünümü — hangi gün hangi denetçi nerede
> 2. Denetçi müsaitlik takibi — izin, hastalık, eğitim
> 3. Lokasyon bazlı gruplama — aynı bölgedeki işleri aynı güne toplamak
> 4. Kapasite planlaması — haftada kaç iş tamamlanabilir
> 5. Geciken işler listesi — planlandığı tarihte yapılamamış işler
> 6. Otomatik planlama önerisi — kontrol tarihi yaklaşan ekipmanlar için WO önerisi
>
> Şu an bunların hiçbiri yok. Sadece WO oluşturup denetçi atayabiliyorum. Bu planlama değil, sadece iş dağıtma."

### Şirket Sahibi / Genel Müdür (yeni)

> "Benim görmek istediğim:
> 1. Bu ayki ciro / hedef karşılaştırması
> 2. Açık teklif tutarı (pipeline value)
> 3. Sözleşme yenileme oranı
> 4. Müşteri başına ortalama gelir
> 5. Denetçi verimliliği (günlük denetim sayısı)
> 6. Müşteri memnuniyet trendi
> 7. Şikayet sayısı ve çözüm oranı
> 8. Akreditasyon denetimi hazırlık durumu
>
> Executive dashboard var ama bunların çoğu yok. Temel KPI'lar (açık WO, onay bekleyen rapor, pending sync) var. Ticari KPI'lar yok."

---

## BOLUM 4 TAMAMLAMA: PROMPT'TA ISTENEN AMA TABLODA EKSIK KALAN KALEMLER

### Ek Veri/Belge Kalemleri

| # | Asama | Kim | Bilgi/Belge | Zorunlu | Sistemde | Risk |
|---|-------|-----|-------------|---------|----------|------|
| 35 | Musteri kayit | Musteri | KEP adresi | Evet | **YOK** | ORTA |
| 36 | Musteri kayit | Musteri | Ticaret sicil no / MERSIS no | Evet | **YOK** | ORTA |
| 37 | Musteri kayit | Musteri | Imza sirkuleri PDF | Evet | **YOK** | YUKSEK |
| 38 | Lokasyon | Musteri | Ulasim tarifi / yol tarifi | Hayir | **YOK** | ORTA |
| 39 | Lokasyon | Musteri | Guvenlik proseduru / giris izni | Hayir | **YOK** | ORTA |
| 40 | Lokasyon | Musteri | Saha sorumlusu ad + tel | Evet | **YOK** | YUKSEK |
| 41 | Lokasyon | Musteri | Calisma saatleri | Hayir | **YOK** | DUSUK |
| 42 | Ekipman | Musteri | CE belgesi / tip onay belgesi | Hayir | **YOK** | YUKSEK |
| 43 | Ekipman | Musteri | Imalat belgesi | Hayir | **YOK** | ORTA |
| 44 | Ekipman | Musteri | Bakim sozlesmesi bilgisi | Hayir | **YOK** | ORTA |
| 45 | Ekipman | Musteri | Son bakim tarihi + bakimci firma | Hayir | **YOK** | ORTA |
| 46 | Ekipman | Musteri | Onceki kurulustan muayene raporu | Hayir | **YOK** | ORTA |
| 47 | Ekipman | Musteri | Risk bilgisi (kimyasal, yukseklik) | Hayir | **YOK** | ORTA |
| 48 | Teklif | Satis | Kesif raporu / on inceleme notu | Hayir | **YOK** | YUKSEK |
| 49 | Sozlesme | Her iki taraf | Ek protokol / ozel sartname | Hayir | **YOK** | YUKSEK |
| 50 | Sozlesme | Satis | Kapsam listesi (lokasyon + ekipman tip) | Evet | **YOK** | KRITIK |
| 51 | Sozlesme | Satis | Birim fiyat listesi | Evet | **YOK** | KRITIK |
| 52 | Denetim oncesi | Musteri | Denetim oncesi istenen teknik belgeler | Hayir | **YOK** | ORTA |
| 53 | Denetim | Muayene elemani | Ölcum aleti ↔ olcum degeri eslesmesi | Evet | **YOK** | YUKSEK |
| 54 | Denetim | Muayene elemani | Fotograf ↔ uygunsuzluk eslesmesi | Evet | **ZAYIF** | ORTA |
| 55 | Denetim | Musteri | Denetim sirasinda saha teyit imzasi | Evet | **YOK** | YUKSEK |
| 56 | Rapor | TY | Rapor oncesi kontrol checklist'i | Evet | **YOK** | ORTA |
| 57 | Teslim | Musteri | Teslim alindi teyidi | Evet | **YOK** | YUKSEK |
| 58 | Personel | Admin | Personel tarafsizlik beyani (yillik) | Evet | **YOK** | YUKSEK |
| 59 | Personel | Admin | Personel egitim kayitlari | Evet | **YOK** | ORTA |
| 60 | Personel | Admin | Personel yetkilendirme kararı (hangi muayene tipinde yetkili) | Evet | **YOK** | KRITIK |
| 61 | Kalite | Kalite sorumlusu | YGG toplanti tutanagi | Evet | **YOK** | YUKSEK |
| 62 | Kalite | Kalite sorumlusu | Dokuman kontrol listesi (prosedur revizyonlari) | Evet | **YOK** | YUKSEK |

---

## BOLUM 5 TAMAMLAMA: CHECKLIST'LER ICERIKLERI

### Satıştan Operasyona Devir Checklist'i

- [ ] Müşteri kartı eksiksiz mi? (vergi no, iletişim, yetkili kişi)
- [ ] Tüm lokasyonlar sisteme girildi mi?
- [ ] Ekipman envanteri yüklendi mi?
- [ ] Teklif kabul edildi mi?
- [ ] Sözleşme imzalandı mı?
- [ ] İmzalı sözleşme sisteme yüklendi mi?
- [ ] Sözleşme kapsamı (ekipman tipleri + lokasyonlar) tanımlandı mı?
- [ ] Birim fiyat listesi sisteme girildi mi?
- [ ] Müşteriye özel talimatlar / ek protokol girildi mi?
- [ ] Logo cari kart senkronize edildi mi?

### Saha Öncesi Hazırlık Checklist'i

- [ ] İş emri atanmış denetçi doğru mu?
- [ ] Denetçi bu ekipman tipinde yetkili mi?
- [ ] Form şablonu atanmış mı?
- [ ] Önceki denetim sonuçları incelendi mi?
- [ ] Ölçüm aletleri kalibrasyonu geçerli mi?
- [ ] Lokasyon erişim bilgisi mevcut mu?
- [ ] Saha sorumlusu bilgisi var mı?
- [ ] Müşteriye randevu bildirildi mi?
- [ ] Özel risk / güvenlik notu var mı?
- [ ] Gerekli teknik belgeler (CE, bakım kaydı) istendi mi?

### Rapor Öncesi Son Kontrol Checklist'i

- [ ] Tüm denetimler APPROVED durumda mı?
- [ ] Tüm zorunlu fotoğraflar yüklendi mi?
- [ ] Uygunsuzluklar doğru kategorize edildi mi?
- [ ] Ölçüm sonuçları eksiksiz mi?
- [ ] Kullanılan ölçüm aletleri kayıtlı ve kalibre mi?
- [ ] Form şablonu doğru revision mı?
- [ ] Müşteri ve ekipman bilgileri raporda doğru mu?
- [ ] Rapor numarası doğru mı?

### Faturalama Öncesi Kontrol Checklist'i

- [ ] Sözleşme aktif durumda mı?
- [ ] İş emri REPORT_APPROVED durumda mı?
- [ ] Rapor müşteriye teslim edildi mi?
- [ ] Teslim teyidi alındı mı?
- [ ] Birim fiyat tanımlı mı?
- [ ] Ekipman sayısı doğrulanmış mı? (planlanan vs gerçekleşen)
- [ ] KDV oranı doğru mu?
- [ ] Logo cari kart eşleşmiş mi?
- [ ] Özel indirim/ek ücret var mı?

### Akreditasyon Denetim Dosya Checklist'i

- [ ] Kalite el kitabı güncel mi?
- [ ] Tüm prosedürler güncel ve onaylı mı?
- [ ] Personel yetkinlik matrisi hazır mı?
- [ ] Personel yetkilendirme kararları dosyada mı?
- [ ] Tarafsızlık beyanları tüm personel için güncel mi?
- [ ] Kalibrasyon sertifikaları güncel mi?
- [ ] Son 12 ay iç tetkik raporu var mı?
- [ ] Son YGG toplantı tutanağı var mı?
- [ ] CAPA kayıtları güncel mi? Açık CAPA var mı?
- [ ] Şikayet kayıtları ve çözüm süreleri hazır mı?
- [ ] Örnek muayene dosyaları (10 adet) hazır mı?
- [ ] Audit trail raporları çıkarılabilir mi?
- [ ] Form şablonları revizyonlu ve onaylı mı?
