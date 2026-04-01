/**
 * 89 DOCX rapor sablonunu parse edip form_templates + form_fields JSON uretir.
 * Sonra DB'ye yukler.
 *
 * Run: cd backend && NODE_PATH=./node_modules node ../tests/seed/parse-all-docx.js
 */
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE_DIR = path.resolve(__dirname, '../../PERKONT_FORMLAR/RAPOR_SABLONLARI');
const OUTPUT_FILE = path.resolve(__dirname, 'parsed-templates.json');

// Kategori → ekipman tipi esleme
const CATEGORY_TO_EQUIPMENT = {
  'ELEKTRİK': 'elektrik',
  'BASINÇLI KAPLAR VE KAZANLAR': 'basinc',
  'KALDIRMA VE İLETME MAKİNELERİ': 'kaldirma',
  'KALDIRMA VE İLETME MAKİNELERİ - İŞ MAKİNELERİ': 'is_makinesi',
  'YANGIN TESİSATI - TESİSATLAR': 'yangin',
  'OYUN ALANLARI VE SPOR EKİPMANLARI': 'oyun_alani',
};

function walkDir(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(walkDir(full));
    else if (entry.name.endsWith('.docx')) results.push(full);
  }
  return results;
}

function extractCodeAndRevision(filename) {
  // RC-M-ET-FR02_10 ALCAK GERILIM... → code=RC-M-ET-FR02, rev=10
  const base = filename.replace(/_kurumsal\.docx$/, '').replace(/\.docx$/, '');
  const codeMatch = base.match(/(RC-M-[A-ZÇĞİÖŞÜa-zçğıöşü]+-FR\d+)/);
  const revMatch = base.match(/_(\d+)\s/);
  const code = codeMatch ? codeMatch[1] : 'TMPL-' + crypto.randomUUID().slice(0, 8);
  const rev = revMatch ? parseInt(revMatch[1]) : 1;
  // Name = everything after code_rev
  let name = base.replace(/RC-M-[A-ZÇĞİÖŞÜa-zçğıöşü]+-FR\d+_\d+\s*/, '').trim();
  if (!name) name = base;
  return { code, revision: 'Rev.' + String(rev).padStart(2, '0'), name };
}

function classifyFieldType(line) {
  const lower = line.toLowerCase();
  // Checkbox patterns
  if (/^[\s]*[☐☑✓✗□■◻◼⬜⬛\[\]]\s/.test(line)) return 'CHECK_ITEM';
  if (/uygun\s*[\/|]\s*uygun\s*değil/i.test(line)) return 'CHECK_ITEM';
  if (/evet\s*[\/|]\s*hayır/i.test(line)) return 'CHECK_ITEM';
  // Measurement patterns
  if (/ölçüm|ölçülen|değer|sonuç|MΩ|kΩ|volt|amper|bar|kg|ton|mm|cm|°C/i.test(line)) return 'NUMBER';
  // Date patterns
  if (/tarih|date/i.test(line) && line.length < 60) return 'DATE';
  // Photo/signature
  if (/fotoğraf|resim|görsel/i.test(line)) return 'PHOTO';
  if (/imza|signature/i.test(line)) return 'SIGNATURE';
  // Section headers (short, all caps or bold indicators)
  if (line.length < 80 && /^[A-ZÇĞİÖŞÜ0-9\s\.\-\:\/]+$/.test(line.trim()) && !line.includes(':')) return 'SECTION_HEADER';
  // Default
  if (line.includes(':') && line.length < 150) return 'TEXT';
  return null; // Skip non-field lines
}

function generateFieldKey(name, index) {
  // Convert Turkish name to safe key
  return name
    .toLowerCase()
    .replace(/[çÇ]/g, 'c').replace(/[ğĞ]/g, 'g').replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o').replace(/[şŞ]/g, 's').replace(/[üÜ]/g, 'u')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50) || ('field_' + index);
}

async function parseDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  const lines = result.value.split('\n').filter(l => l.trim().length > 2);

  const fields = [];
  let sectionIndex = 0;
  let fieldIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length < 3) continue;

    const fieldType = classifyFieldType(line);
    if (!fieldType) continue;

    fieldIndex++;

    if (fieldType === 'SECTION_HEADER') {
      sectionIndex++;
      fields.push({
        fieldKey: 'section_' + sectionIndex,
        label: line.slice(0, 200),
        fieldType: 'SECTION_HEADER',
        isRequired: false,
        orderIndex: fieldIndex,
      });
    } else if (fieldType === 'CHECK_ITEM') {
      // Parse checkbox item
      const cleanLabel = line.replace(/^[\s☐☑✓✗□■◻◼⬜⬛\[\]\-\.\d\)]+\s*/, '').trim();
      if (cleanLabel.length < 3) continue;
      fields.push({
        fieldKey: generateFieldKey(cleanLabel, fieldIndex),
        label: cleanLabel.slice(0, 200),
        fieldType: 'CHECK_ITEM',
        isRequired: true,
        orderIndex: fieldIndex,
      });
    } else if (fieldType === 'NUMBER') {
      const parts = line.split(':');
      const label = (parts[0] || line).trim();
      fields.push({
        fieldKey: generateFieldKey(label, fieldIndex),
        label: label.slice(0, 200),
        fieldType: 'NUMBER',
        isRequired: true,
        orderIndex: fieldIndex,
      });
    } else if (fieldType === 'TEXT') {
      const parts = line.split(':');
      const label = (parts[0] || line).trim();
      fields.push({
        fieldKey: generateFieldKey(label, fieldIndex),
        label: label.slice(0, 200),
        fieldType: 'TEXT',
        isRequired: false,
        orderIndex: fieldIndex,
      });
    } else if (fieldType === 'DATE') {
      fields.push({
        fieldKey: generateFieldKey(line, fieldIndex),
        label: line.slice(0, 200),
        fieldType: 'DATE',
        isRequired: false,
        orderIndex: fieldIndex,
      });
    } else if (fieldType === 'PHOTO') {
      fields.push({
        fieldKey: 'photo_' + fieldIndex,
        label: line.slice(0, 200),
        fieldType: 'PHOTO',
        isRequired: false,
        orderIndex: fieldIndex,
      });
    } else if (fieldType === 'SIGNATURE') {
      fields.push({
        fieldKey: 'signature_' + fieldIndex,
        label: line.slice(0, 200),
        fieldType: 'SIGNATURE',
        isRequired: false,
        orderIndex: fieldIndex,
      });
    }
  }

  return fields;
}

async function main() {
  console.log('=== DOCX Template Parser ===');
  console.log('Base dir:', BASE_DIR);

  const files = walkDir(BASE_DIR);
  console.log('Found', files.length, 'DOCX files\n');

  const templates = [];
  let totalFields = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const rel = path.relative(BASE_DIR, file);
    const parts = rel.split(path.sep);

    const accredited = parts[0].includes('OLANLAR') && !parts[0].includes('OLMAYAN');
    const category = parts.length >= 3 ? parts[2] : (parts[1] || 'GENEL');
    const subCategory = parts.length >= 4 ? parts[2] + '/' + parts[3] : category;
    const equipmentCategory = CATEGORY_TO_EQUIPMENT[category] || 'diger';

    const filename = path.basename(file);
    const { code, revision, name } = extractCodeAndRevision(filename);

    try {
      const fields = await parseDocx(file);
      totalFields += fields.length;

      const template = {
        id: crypto.randomUUID(),
        code,
        name: name.slice(0, 255),
        revision,
        category,
        subCategory,
        equipmentCategory,
        isAccredited: accredited,
        sourceFile: rel,
        fieldCount: fields.length,
        fields,
      };

      templates.push(template);
      console.log(`[${i+1}/${files.length}] ${code} — ${name.slice(0,60)} (${fields.length} fields)`);
    } catch (err) {
      console.error(`[${i+1}] ERROR: ${filename} — ${err.message}`);
      templates.push({
        id: crypto.randomUUID(),
        code,
        name: name.slice(0, 255),
        revision,
        category,
        subCategory,
        equipmentCategory,
        isAccredited: accredited,
        sourceFile: rel,
        fieldCount: 0,
        fields: [],
        parseError: err.message,
      });
    }
  }

  // Write JSON output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(templates, null, 2), 'utf-8');

  console.log('\n=== SUMMARY ===');
  console.log('Templates:', templates.length);
  console.log('Total fields:', totalFields);
  console.log('Avg fields/template:', Math.round(totalFields / templates.length));
  console.log('Output:', OUTPUT_FILE);

  // Category breakdown
  const cats = {};
  templates.forEach(t => { cats[t.category] = (cats[t.category] || 0) + 1; });
  console.log('\nBy category:');
  Object.entries(cats).sort((a,b) => b[1] - a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));
}

main().catch(e => { console.error(e); process.exit(1); });
