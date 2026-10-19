// Kopieert de gedeelde domeinlogica naar supabase/functions/_shared (Deno),
// zodat app en server exact dezelfde termijn- en werkdagregels gebruiken.
// Gebruik: node scripts/sync-shared.js   (de test domain/__tests__/shared.test.ts bewaakt dit)
const fs = require('fs');
const path = require('path');

const FILES = ['types.ts', 'workdays.ts', 'deadlines.ts'];
const SRC = path.join(__dirname, '..', 'src', 'domain');
const DST = path.join(__dirname, '..', 'supabase', 'functions', '_shared');

function denoSource(file) {
  const src = fs.readFileSync(path.join(SRC, file), 'utf8');
  const body = src.replace(/from '(\.\/[^']+)'/g, "from '$1.ts'");
  return `// GEGENEREERD uit src/domain/${file} door scripts/sync-shared.js – niet handmatig wijzigen.\n${body}`;
}

module.exports = { FILES, SRC, DST, denoSource };

if (require.main === module) {
  fs.mkdirSync(DST, { recursive: true });
  for (const f of FILES) fs.writeFileSync(path.join(DST, f), denoSource(f));
  console.log('Gedeelde domeinlogica gesynchroniseerd:', FILES.join(', '));
}
