import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { FILES, DST, denoSource } = require('../../../scripts/sync-shared.js');

describe('gedeelde domeinlogica server', () => {
  it.each(FILES as string[])('%s is gelijk aan src/domain (draai node scripts/sync-shared.js)', (file) => {
    expect(fs.readFileSync(path.join(DST, file), 'utf8')).toBe(denoSource(file));
  });
});
