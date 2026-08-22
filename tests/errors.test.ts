import { describe, expect, it } from 'vitest';
import { EnvValidationError } from '../src/index.ts';

describe('EnvValidationError', () => {
  it('formats every issue as a bulleted list in the message', () => {
    const error = new EnvValidationError([
      { envVar: 'PORT', path: 'port', message: 'Invalid type: expected string' },
      { envVar: 'DB_HOST', path: 'db.host', message: 'Invalid type: expected string' },
    ]);

    expect(error.message).toBe(
      'Invalid environment variables:\n' +
        '  - PORT: Invalid type: expected string\n' +
        '  - DB_HOST: Invalid type: expected string',
    );
  });

  it('exposes a stable error code and name', () => {
    const error = new EnvValidationError([]);
    expect(error.code).toBe('ENV_VALIDATION_ERROR');
    expect(error.name).toBe('EnvValidationError');
    expect(error).toBeInstanceOf(Error);
  });

  it('preserves the issues array as-is', () => {
    const issues = [{ envVar: 'PORT', path: 'port', message: 'bad' }];
    const error = new EnvValidationError(issues);
    expect(error.issues).toEqual(issues);
  });
});
