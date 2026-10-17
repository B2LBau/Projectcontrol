import { Buffer } from 'buffer';

/** De zip-bibliotheek in `docx` verwacht een globale Buffer; React Native heeft die niet. */
export function ensureBuffer() {
  const g = globalThis as { Buffer?: unknown };
  if (typeof g.Buffer === 'undefined') g.Buffer = Buffer;
}

ensureBuffer();
