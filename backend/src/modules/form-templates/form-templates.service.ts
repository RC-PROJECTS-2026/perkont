import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FormTemplate, FormField, FormStatus,
} from './entities/form-template.entity';
import { AuditService } from '@/modules/audit/audit.service';
import { StorageService, StorageBucket } from '@/modules/storage/storage.service';

export interface CreateFormTemplateDto {
  equipmentTypeId: string;
  code: string;
  name: string;
  revision: string;
  revisionDate?: string;
  description?: string;
  layoutConfig: Record<string, any>;
  fields: Array<{
    fieldKey: string;
    label: string;
    fieldType: string;
    section?: string;
    orderIndex?: number;
    isRequired?: boolean;
    validationRules?: Record<string, any>;
    options?: Array<{ value: string; label: string }>;
    unit?: string;
    dbMapping?: string;
    pdfCoordinate?: Record<string, any>;
    isConditional?: boolean;
    conditionRule?: Record<string, any>;
    defaultValue?: string;
    checkItems?: Array<{ id: string; label: string; isRequired?: boolean }>;
  }>;
}

@Injectable()
export class FormTemplatesService {
  constructor(
    @InjectRepository(FormTemplate)
    private templateRepo: Repository<FormTemplate>,
    @InjectRepository(FormField)
    private fieldRepo: Repository<FormField>,
    private auditService: AuditService,
    private storageService: StorageService,
  ) {}

  async create(dto: CreateFormTemplateDto, userId: string): Promise<FormTemplate> {
    const exists = await this.templateRepo.findOne({ where: { code: dto.code } });
    if (exists) throw new ConflictException(`'${dto.code}' kodlu form zaten mevcut`);

    const { fields: dtoFields, ...templateData } = dto;
    const template = this.templateRepo.create({
      ...templateData,
      revisionDate: dto.revisionDate ? new Date(dto.revisionDate) : null,
      status: FormStatus.DRAFT,
      createdById: userId,
    } as any);

    const savedTemplate = await this.templateRepo.save(template) as unknown as FormTemplate;

    // Alanları kaydet
    if (dtoFields?.length) {
      const fields = dtoFields.map((f, idx) =>
        this.fieldRepo.create({
          ...f,
          templateId: savedTemplate.id,
          orderIndex: f.orderIndex ?? idx,
          fieldType: f.fieldType as any,
        } as any),
      );
      await this.fieldRepo.save(fields as any);
    }

    await this.auditService.log({
      userId,
      action: 'FORM_TEMPLATE_CREATED',
      entityType: 'FormTemplate',
      entityId: savedTemplate.id,
      newValues: { code: dto.code, revision: dto.revision },
    });

    return this.findOne(savedTemplate.id);
  }

  // ─── PDF şablon dosyası yükleme ───────────────────────────────────────────
  async uploadPdfTemplate(
    templateId: string,
    file: Buffer,
    originalName: string,
    userId: string,
  ): Promise<FormTemplate> {
    const template = await this.findOne(templateId);

    const { url, objectName } = await this.storageService.uploadFile(
      StorageBucket.DOCUMENTS,
      file,
      originalName,
      'application/pdf',
      `form-templates/${templateId}`,
    );

    await this.templateRepo.update(templateId, {
      outputTemplateUrl: url,
      outputTemplateObjectName: objectName,
    });

    await this.auditService.log({
      userId,
      action: 'FORM_TEMPLATE_PDF_UPLOADED',
      entityType: 'FormTemplate',
      entityId: templateId,
      newValues: { objectName },
    });

    return this.findOne(templateId);
  }

  // ─── Form aktivasyonu ─────────────────────────────────────────────────────
  async activate(templateId: string, userId: string): Promise<FormTemplate> {
    const template = await this.findOne(templateId);

    if (template.status === FormStatus.ACTIVE) {
      throw new BadRequestException('Form zaten aktif');
    }
    if (!template.outputTemplateUrl) {
      throw new BadRequestException('Form aktif edilmeden önce PDF şablon yüklenmelidir');
    }

    // Validate all fields have valid PDF coordinates
    const fieldsWithoutCoords = template.fields.filter(f => {
      if (!f.pdfCoordinate) return true;
      const { page, x, y } = f.pdfCoordinate;
      if (page === undefined || page < 1) return true;
      if (x === undefined || x < 0 || x > 595) return true; // A4 width in points
      if (y === undefined || y < 0 || y > 842) return true; // A4 height in points
      return false;
    });

    if (fieldsWithoutCoords.length > 0) {
      throw new BadRequestException(
        `Aşağıdaki alanların PDF koordinatları eksik veya geçersiz: ${fieldsWithoutCoords.map(f => f.label).join(', ')}`
      );
    }

    // Check for coordinate overlaps (warning only)
    const fieldsByPage = new Map<number, typeof template.fields>();
    for (const field of template.fields) {
      if (!field.pdfCoordinate) continue;
      const page = field.pdfCoordinate.page;
      if (!fieldsByPage.has(page)) fieldsByPage.set(page, []);
      fieldsByPage.get(page).push(field);
    }

    // Aynı ekipman tipindeki aktif formu superseded yap
    const currentActive = await this.templateRepo.findOne({
      where: {
        equipmentTypeId: template.equipmentTypeId,
        status: FormStatus.ACTIVE,
      },
    });

    if (currentActive && currentActive.id !== templateId) {
      await this.templateRepo.update(currentActive.id, {
        status: FormStatus.SUPERSEDED,
        supersededById: templateId,
      });
    }

    await this.templateRepo.update(templateId, {
      status: FormStatus.ACTIVE,
      approvedById: userId,
      approvedAt: new Date(),
    });

    await this.auditService.log({
      userId,
      action: 'FORM_TEMPLATE_ACTIVATED',
      entityType: 'FormTemplate',
      entityId: templateId,
      newValues: { revision: template.revision },
    });

    return this.findOne(templateId);
  }

  // ─── Revizyon oluşturma ───────────────────────────────────────────────────
  async createRevision(
    templateId: string,
    newRevision: string,
    userId: string,
  ): Promise<FormTemplate> {
    const original = await this.findOne(templateId);

    // Aynı form code + yeni revizyon
    const newCode = `${original.code}-${newRevision}`;

    const newTemplate = await this.create(
      {
        equipmentTypeId: original.equipmentTypeId,
        code: newCode,
        name: original.name,
        revision: newRevision,
        layoutConfig: original.layoutConfig,
        fields: original.fields.map((f) => ({
          fieldKey: f.fieldKey,
          label: f.label,
          fieldType: f.fieldType,
          section: f.section,
          orderIndex: f.orderIndex,
          isRequired: f.isRequired,
          validationRules: f.validationRules,
          options: f.options,
          unit: f.unit,
          dbMapping: f.dbMapping,
          pdfCoordinate: f.pdfCoordinate,
          isConditional: f.isConditional,
          conditionRule: f.conditionRule,
          checkItems: f.checkItems,
        })),
      },
      userId,
    );

    await this.auditService.log({
      userId,
      action: 'FORM_TEMPLATE_REVISED',
      entityType: 'FormTemplate',
      entityId: newTemplate.id,
      newValues: { basedOn: templateId, newRevision },
    });

    return newTemplate;
  }

  async findAll(equipmentTypeId?: string): Promise<any[]> {
    const qb = this.templateRepo.createQueryBuilder('t')
      .leftJoinAndSelect('t.equipmentType', 'et')
      .loadRelationCountAndMap('t.fieldCount', 't.fields')
      .orderBy('t.createdAt', 'DESC');
    if (equipmentTypeId) qb.where('t.equipmentTypeId = :equipmentTypeId', { equipmentTypeId });
    return qb.getMany();
  }

  async findOne(id: string): Promise<FormTemplate> {
    const template = await this.templateRepo.findOne({
      where: { id },
      relations: ['equipmentType', 'fields'],
    });
    if (!template) throw new NotFoundException('Form şablonu bulunamadı');
    // Alanları sıraya göre döndür
    if (template.fields) {
      template.fields.sort((a, b) => a.orderIndex - b.orderIndex);
    }
    return template;
  }

  async findByIds(ids: string[]): Promise<FormTemplate[]> {
    if (ids.length === 0) return [];
    return this.templateRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.fields', 'fields')
      .where('t.id IN (:...ids)', { ids })
      .getMany();
  }

  // ─── Ekipman tipine göre aktif form bul ──────────────────────────────────
  async findActiveForEquipmentType(equipmentTypeId: string): Promise<FormTemplate> {
    const template = await this.templateRepo.findOne({
      where: { equipmentTypeId, status: FormStatus.ACTIVE },
      relations: ['fields'],
    });
    if (!template) {
      throw new NotFoundException(
        `Bu ekipman tipi için aktif form şablonu bulunamadı. Lütfen form tanımlayın.`,
      );
    }
    if (template.fields) {
      template.fields.sort((a, b) => a.orderIndex - b.orderIndex);
    }
    return template;
  }

  // ─── Alan güncelleme ──────────────────────────────────────────────────────
  async updateField(
    templateId: string,
    fieldId: string,
    updates: Partial<FormField>,
    userId: string,
  ): Promise<FormField> {
    const field = await this.fieldRepo.findOne({
      where: { id: fieldId, templateId },
    });
    if (!field) throw new NotFoundException('Form alanı bulunamadı');

    // Aktif formlarda critical field değişikliği uyarı gerektirir
    const template = await this.findOne(templateId);
    if (template.status === FormStatus.ACTIVE) {
      await this.auditService.log({
        userId,
        action: 'ACTIVE_FORM_FIELD_MODIFIED',
        entityType: 'FormField',
        entityId: fieldId,
        oldValues: { label: field.label, pdfCoordinate: field.pdfCoordinate },
        newValues: updates as any,
      });
    }

    Object.assign(field, updates);
    return this.fieldRepo.save(field);
  }
}
