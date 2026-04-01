/**
 * Parsed template JSON'u form_templates + form_fields tablolarina yukler.
 * Run: cd backend && NODE_PATH=./node_modules node ../tests/seed/load-templates-to-db.js
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB = { host:'localhost', user:'root', password:'', database: process.env.DB_DATABASE || 'perkont_staging', charset:'utf8mb4' };
const INPUT = path.resolve(__dirname, 'parsed-templates.json');

async function main() {
  console.log('=== Loading Templates to DB ===');
  const conn = await mysql.createConnection(DB);
  const templates = JSON.parse(fs.readFileSync(INPUT, 'utf-8'));
  console.log(`Templates to load: ${templates.length}`);
  await conn.query('SET FOREIGN_KEY_CHECKS=0');

  let loaded = 0, skipped = 0, totalFields = 0;

  for (const tpl of templates) {
    // Skip if already exists
    const [existing] = await conn.query('SELECT id FROM form_templates WHERE code = ? LIMIT 1', [tpl.code]);
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    const tplId = tpl.id || crypto.randomUUID();

    await conn.query(`
      INSERT INTO form_templates (id, code, name, revision, revisionDate, status, equipmentTypeId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, CURDATE(), 'draft', '', NOW(), NOW())
    `, [tplId, tpl.code, tpl.name, tpl.revision]);

    // Insert fields
    for (const field of tpl.fields) {
      const fieldId = crypto.randomUUID();
      await conn.query(`
        INSERT INTO form_fields (id, templateId, fieldKey, label, fieldType, isRequired, orderIndex, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, [fieldId, tplId, field.fieldKey, field.label, field.fieldType, field.isRequired ? 1 : 0, field.orderIndex]);
      totalFields++;
    }

    loaded++;
    if (loaded % 10 === 0) console.log(`  Loaded: ${loaded}/${templates.length}`);
  }

  // Verify
  const [tplCount] = await conn.query('SELECT COUNT(*) as c FROM form_templates');
  const [fieldCount] = await conn.query('SELECT COUNT(*) as c FROM form_fields');

  await conn.query('SET FOREIGN_KEY_CHECKS=1');
  console.log(`\n=== DONE ===`);
  console.log(`Loaded: ${loaded}, Skipped: ${skipped}`);
  console.log(`Total fields inserted: ${totalFields}`);
  console.log(`DB form_templates: ${tplCount[0].c}`);
  console.log(`DB form_fields: ${fieldCount[0].c}`);

  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
