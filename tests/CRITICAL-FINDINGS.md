# PerKont - Kritik Bulgular ve Duzeltme Onerileri

Kod analizi sirasinda tespit edilen kritik sorunlar, oncelikleri ve duzeltme onerileri.

---

## KRITIK SEVIYE (P0) - Hemen Duzeltilmeli

### 1. TENANT IZOLASYONU EKSIK (8/12 Servis)

**Etkilenen Servisler:**
- `work-orders.service.ts` - companyId filtresi yorum satirinda (line ~243)
- `inspections.service.ts` - tenant kontrolu yok
- `reports.service.ts` - tenant kontrolu yok
- `contracts.service.ts` - tenant kontrolu yok
- `quotations.service.ts` - tenant kontrolu yok
- `proposals.module.ts` - tenant kontrolu yok
- `sales-pipeline.module.ts` - tenant kontrolu yok
- `dashboard.service.ts` - hicbir sorguda company filtresi yok

**Risk:** Bir sirketin kullanicisi baska sirketin verilerini gorebilir/degistirebilir.

**Duzeltme Onerisi:**
```typescript
// Option A: Base repository ile global filter
@Injectable()
export class TenantAwareRepository<T> extends Repository<T> {
  createQueryBuilder(alias?: string) {
    const qb = super.createQueryBuilder(alias);
    const companyId = this.request?.user?.companyId;
    if (companyId) {
      qb.andWhere(`${alias}.companyId = :companyId`, { companyId });
    }
    return qb;
  }
}

// Option B: Global middleware (daha guvenli)
// app.module.ts'de TenantMiddleware ekle
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const user = req['user'];
    if (user && user.companyId) {
      req['tenantId'] = user.companyId;
    }
    next();
  }
}
```

---

### 2. SQL INJECTION RISKLERI

**Dosya: `proposals.module.ts` (line ~818-820)**
```typescript
// MEVCUT (GUVENLI DEGIL):
await queryRunner.query(
  `UPDATE sales_opportunities SET status='won', probability=100 WHERE customerId='${proposal.customerId}' AND status IN ('new','contacted','proposal_sent','negotiation')`
);

// DUZELTME:
await queryRunner.query(
  `UPDATE sales_opportunities SET status='won', probability=100 WHERE customerId=? AND status IN ('new','contacted','proposal_sent','negotiation')`,
  [proposal.customerId]
);
```

**Dosya: `sales-pipeline.module.ts` (line ~392-397)**
```typescript
// MEVCUT (GUVENLI DEGIL):
const equipments = await this.equipmentRepo.query(
  `SELECT * FROM equipment WHERE customerId IN (${customerIds.join(',')}) AND ...`
);

// DUZELTME:
const equipments = await this.equipmentRepo.query(
  `SELECT * FROM equipment WHERE customerId IN (${customerIds.map(() => '?').join(',')}) AND ...`,
  customerIds
);
```

---

### 3. DEAKTIF KULLANICI TOKEN KULLANIMI

**Dosya: `auth.service.ts` (line ~273)**
```typescript
// MEVCUT: Refresh token'da isActive kontrolu YOK
async refreshToken(refreshToken: string) {
  const user = await this.usersService.findByRefreshToken(hashedToken);
  // Eksik: if (!user.isActive) throw new UnauthorizedException();
  return this.generateTokens(user);
}

// DUZELTME:
async refreshToken(refreshToken: string) {
  const user = await this.usersService.findByRefreshToken(hashedToken);
  if (!user || !user.isActive) {
    throw new UnauthorizedException('Hesap deaktif edilmis');
  }
  return this.generateTokens(user);
}
```

**Dosya: `roles.guard.ts` (line ~25)**
```typescript
// MEVCUT: isActive kontrolu YOK
canActivate(context: ExecutionContext): boolean {
  const user = request.user;
  const userRoles = user.roles?.split(',') || [user.role];
  // ...
}

// DUZELTME:
canActivate(context: ExecutionContext): boolean {
  const user = request.user;
  if (!user.isActive) return false; // Ekle
  const userRoles = user.roles?.split(',') || [user.role];
  // ...
}
```

---

## YUKSEK SEVIYE (P1) - 1 Hafta Icinde Duzeltilmeli

### 4. N+1 SORGU PROBLEMI

**Dosya: `work-orders.service.ts` (line ~270-281)**
```typescript
// MEVCUT: Her WO icin ayri ayri equipment ve formTemplate sorgusu
for (const woItem of workOrder.items) {
  const equipment = await this.equipmentService.findOne(woItem.equipmentId);
  const formTemplate = await this.formTemplatesService.findOne(woItem.formTemplateId);
}

// DUZELTME: Eager loading ile tek sorguda getir
const workOrders = await this.woRepo.find({
  where: { inspectorId },
  relations: ['items', 'items.equipment', 'items.formTemplate'],
  order: { plannedDate: 'ASC' },
});
```

**Dosya: `inspections.service.ts` (line ~274-279)** - Ayni N+1 pattern

**Etki:** 20 WO, her biri 5 ekipmanli = 100 ekstra sorgu. 500K ekipman altinda ciddi yavaslik.

---

### 5. DASHBOARD CACHE EKSIKLIGI

**Dosya: `dashboard.service.ts`**
```typescript
// MEVCUT: 7 COUNT sorgusu her istekte calisiyor
// 100 kullanici → saniyede 700 COUNT sorgusu

// DUZELTME: Redis cache ekle
@Injectable()
export class DashboardService {
  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  async getDashboard(companyId: string) {
    const cacheKey = `dashboard:${companyId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const data = await this.computeDashboard(companyId);
    await this.cache.set(cacheKey, data, 30); // 30 saniye TTL
    return data;
  }
}
```

---

### 6. YETKILENDIRME EKSIKLIKLERI

**Etkilenen Operasyonlar:**
- `contracts.service.ts` → `signContract()` - Kim imzalayabilir? Kontrol yok.
- `work-orders.service.ts` → `assign()` - Herkes atayabilir.
- `inspections.service.ts` → Review islemi - Rol kontrolu yok.
- `reports.service.ts` → approve/reject - Rol kontrolu yok.

**Duzeltme:** Her service method'una `@Roles()` decorator ekle:
```typescript
// Controller'da:
@Roles(UserRole.TECHNICAL_MANAGER, UserRole.ADMIN)
@Patch(':id/approve')
async approveReport(@Param('id') id: string) { ... }

// Service'de ek guard:
async approveReport(id: string, userId: string, userRole: string) {
  if (!['technical_manager', 'admin'].includes(userRole)) {
    throw new ForbiddenException('Bu islem icin yetkiniz yok');
  }
  // ...
}
```

---

### 7. TRANSACTION GUVENLIK EKSIKLIGI

**Dosya: `proposals.module.ts` (line ~526)**
```typescript
// MEVCUT: recalculateTotals transaction DISINDA
await queryRunner.commitTransaction();
await this.recalculateTotals(proposalId); // BU SATIR TRANSACTION DISINDA!

// DUZELTME: Transaction icine al
await this.recalculateTotals(proposalId, queryRunner);
await queryRunner.commitTransaction();
```

---

## ORTA SEVIYE (P2) - Sprint Icinde Duzeltilmeli

### 8. QUOTATION DESCRIPTION TRUNCATION

**Dosya: `quotations.service.ts` (line ~149)**
```typescript
// MEVCUT: Aciklama sessizce 40 karaktere kesilir
const desc = item.description.substring(0, 40);

// DUZELTME: Ya uyar ya da PDF layout'u duzelt
// Cozum: PDF'de text wrapping ekle, truncation kaldir
```

---

### 9. HARDCODED DOSYA YOLU

**Dosya: `proposals.module.ts` (line ~1001-1007)**
```typescript
// MEVCUT: DOCX template icin hardcoded path
const templatePath = path.join(__dirname, '../../assets/templates/proposal-template.docx');

// DUZELTME: MinIO'dan veya config'den oku
const templatePath = this.configService.get('PROPOSAL_TEMPLATE_PATH')
  || await this.storageService.getTemplatePath('proposal-template.docx');
```

---

### 10. STALE SIGNING SESSION RECOVERY

**Dosya: `reports.service.ts` (line ~427)**
```typescript
// MEVCUT: 30dk sonra UNDER_SIGNING → APPROVED donduruyor
// Sorun: Eger imza islemi devam ediyorsa veri kaybi olabilir
@Cron('*/5 * * * *')
async recoverStaleSessions() {
  // 30 dakikadan eski UNDER_SIGNING durumundaki raporlari bul
  // APPROVED'a dondur
}

// ONERI: Imza servisinden durum kontrolu yap, korunmasiz donusu engelle
```

---

## OZET TABLOSU

| # | Bulgu | Seviye | Etkilenen Dosyalar | Tahmin |
|---|-------|--------|--------------------|--------|
| 1 | Tenant izolasyonu eksik | P0 | 8 servis | 2 gun |
| 2 | SQL injection | P0 | proposals, sales-pipeline | 1 gun |
| 3 | Deaktif kullanici token | P0 | auth, roles guard | 0.5 gun |
| 4 | N+1 sorgu | P1 | work-orders, inspections | 1 gun |
| 5 | Dashboard cache yok | P1 | dashboard | 0.5 gun |
| 6 | Yetkilendirme eksik | P1 | 4 servis | 1 gun |
| 7 | Transaction guvenlik | P1 | proposals | 0.5 gun |
| 8 | Description truncation | P2 | quotations | 0.5 gun |
| 9 | Hardcoded path | P2 | proposals | 0.5 gun |
| 10 | Stale session recovery | P2 | reports | 1 gun |

**Toplam tahmini duzeltme suresi: ~8.5 gun**
