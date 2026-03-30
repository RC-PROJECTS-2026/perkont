import { ValueTransformer } from 'typeorm';
import { FieldEncryption } from '../utils/field-encryption';

export class EncryptedColumnTransformer implements ValueTransformer {
  to(value: string): string {
    return value ? FieldEncryption.encrypt(value) : value;
  }
  from(value: string): string {
    return value ? FieldEncryption.decrypt(value) : value;
  }
}
