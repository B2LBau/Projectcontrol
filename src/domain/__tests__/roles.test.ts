import { canRelease, signature } from '../roles';

describe('rollen', () => {
  it('laat alleen de werkverantwoordelijke vrijgeven', () => {
    expect(canRelease('werkverantwoordelijke')).toBe(true);
    expect(canRelease('toezichthouder')).toBe(false);
    expect(canRelease('')).toBe(false);
  });

  it('legt naam en rol vast', () => {
    expect(signature({ userName: 'K. de Groot', role: 'werkverantwoordelijke' })).toBe('K. de Groot (Werkverantwoordelijke)');
  });
});
