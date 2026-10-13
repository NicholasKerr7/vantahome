import { resolveSessionProfile } from '../sessionProfile';

describe('session profile restoration', () => {
  test('preserves a saved local name and takes email only from the login session', () => {
    expect(resolveSessionProfile('Alex at home', {
      email: 'alex@example.test',
      user_metadata: { full_name: 'Alexander', email: 'old@example.test' },
    })).toEqual({ name: 'Alex at home', email: 'alex@example.test' });
  });

  test.each([
    [{ full_name: '  Alexander  ', name: 'Alex' }, 'Alexander'],
    [{ full_name: '   ', name: '  Alex  ' }, 'Alex'],
    [{ full_name: { name: 'Invalid' }, name: true }, 'alex'],
    [[{ full_name: 'Invalid' }], 'alex'],
    [null, 'alex'],
  ])('initializes a new account from validated metadata or its login email (%p)', (metadata, expected) => {
    expect(resolveSessionProfile('', { email: 'alex@example.test', user_metadata: metadata }))
      .toEqual({ name: expected, email: 'alex@example.test' });
  });

  test('rejects a malformed saved name and supplies a safe fallback without inventing an email', () => {
    expect(resolveSessionProfile({ invalid: true }, { user_metadata: { full_name: 42 }, email: false }))
      .toEqual({ name: 'Home', email: undefined });
  });

  test('clears a missing login email instead of retaining an earlier account value', () => {
    expect(resolveSessionProfile('Alex', {})).toEqual({ name: 'Alex', email: undefined });
  });
});
