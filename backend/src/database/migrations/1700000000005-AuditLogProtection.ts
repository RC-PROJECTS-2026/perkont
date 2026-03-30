import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditLogProtection1700000000005 implements MigrationInterface {
  name = 'AuditLogProtection1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create trigger to prevent UPDATE on audit_logs
    await queryRunner.query(`
      CREATE TRIGGER prevent_audit_log_update
      BEFORE UPDATE ON audit_logs
      FOR EACH ROW
      BEGIN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'audit_logs tablosu güncellenemez (immutable)';
      END
    `);

    // Create trigger to prevent DELETE on audit_logs
    await queryRunner.query(`
      CREATE TRIGGER prevent_audit_log_delete
      BEFORE DELETE ON audit_logs
      FOR EACH ROW
      BEGIN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'audit_logs tablosu silinemez (immutable)';
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS prevent_audit_log_update`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS prevent_audit_log_delete`);
  }
}
