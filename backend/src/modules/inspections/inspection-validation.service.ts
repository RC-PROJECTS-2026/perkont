import { Injectable, BadRequestException } from '@nestjs/common';

export interface ValidationError {
  gate: string;
  fieldKey: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

@Injectable()
export class InspectionValidationService {

  validateFieldValue(field: any, value: any): ValidationError[] {
    const errors: ValidationError[] = [];
    if (!field || value === undefined || value === null) return errors;

    const rules = field.validationRules || {};

    // Type validation
    if (field.fieldType === 'number' && value !== '' && isNaN(Number(value))) {
      errors.push({ gate: 'field', fieldKey: field.fieldKey, rule: 'type', message: `${field.label} sayısal bir değer olmalı`, severity: 'error' });
    }

    // Min/Max for numbers
    if (field.fieldType === 'number' && rules.min !== undefined && Number(value) < rules.min) {
      errors.push({ gate: 'field', fieldKey: field.fieldKey, rule: 'min', message: `${field.label} en az ${rules.min} olmalı`, severity: 'error' });
    }
    if (field.fieldType === 'number' && rules.max !== undefined && Number(value) > rules.max) {
      errors.push({ gate: 'field', fieldKey: field.fieldKey, rule: 'max', message: `${field.label} en fazla ${rules.max} olmalı`, severity: 'error' });
    }

    // Min/Max length for text
    if (field.fieldType === 'text' || field.fieldType === 'textarea') {
      if (rules.minLength && String(value).length < rules.minLength) {
        errors.push({ gate: 'field', fieldKey: field.fieldKey, rule: 'minLength', message: `${field.label} en az ${rules.minLength} karakter olmalı`, severity: 'error' });
      }
      if (rules.maxLength && String(value).length > rules.maxLength) {
        errors.push({ gate: 'field', fieldKey: field.fieldKey, rule: 'maxLength', message: `${field.label} en fazla ${rules.maxLength} karakter olmalı`, severity: 'error' });
      }
    }

    // Regex pattern
    if (rules.pattern) {
      try {
        const regex = new RegExp(rules.pattern);
        if (!regex.test(String(value))) {
          errors.push({ gate: 'field', fieldKey: field.fieldKey, rule: 'pattern', message: `${field.label} geçerli formatta değil`, severity: 'error' });
        }
      } catch (e) { /* invalid regex, skip */ }
    }

    return errors;
  }

  validateCompletion(fields: any[], savedValues: Map<string, any>): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const field of fields) {
      if (!field.isRequired) continue;

      // Check conditional visibility
      if (field.isConditional && field.conditionRule) {
        const { field: depField, operator, value: depValue } = field.conditionRule;
        const actualValue = savedValues.get(depField);
        let conditionMet = false;
        switch (operator) {
          case 'eq': conditionMet = actualValue === depValue; break;
          case 'neq': conditionMet = actualValue !== depValue; break;
          default: conditionMet = true;
        }
        if (!conditionMet) continue; // Field not visible, skip
      }

      const value = savedValues.get(field.fieldKey);
      if (value === undefined || value === null || value === '') {
        errors.push({
          gate: 'completion',
          fieldKey: field.fieldKey,
          rule: 'required',
          message: `${field.label} zorunludur`,
          severity: 'error',
        });
      }

      // Validate content if value exists
      if (value !== undefined && value !== null) {
        errors.push(...this.validateFieldValue(field, value));
      }
    }

    return errors;
  }

  validateSubmission(overallResult: string, fieldCount: number): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!overallResult) {
      errors.push({ gate: 'submission', fieldKey: 'overallResult', rule: 'required', message: 'Genel sonuç seçilmelidir', severity: 'error' });
    }

    if (fieldCount === 0) {
      errors.push({ gate: 'submission', fieldKey: '', rule: 'minFields', message: 'En az bir kontrol maddesi doldurulmalıdır', severity: 'error' });
    }

    return errors;
  }

  validateForSigning(report: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!report.documentHash) {
      errors.push({ gate: 'signing', fieldKey: 'documentHash', rule: 'required', message: 'Rapor PDF hash değeri eksik', severity: 'error' });
    }

    if (!report.pdfUrl) {
      errors.push({ gate: 'signing', fieldKey: 'pdfUrl', rule: 'required', message: 'Rapor PDF dosyası bulunamadı', severity: 'error' });
    }

    return errors;
  }
}
