import type { StandardSchemaV1 } from '@standard-schema/spec';

const VENDOR = '@xcvzlabs/env';

function asString(value: unknown): string | undefined {
  if (value === undefined || typeof value === 'string') return value;
  throw new Error(`Expected a string but received ${typeof value}`);
}

/** Wraps a throwing parser into a zero-dependency Standard Schema V1 leaf. */
function createEnvSchema<Output>(
  parse: (value: string | undefined) => Output,
): StandardSchemaV1<string | undefined, Output> {
  return {
    '~standard': {
      version: 1,
      vendor: VENDOR,
      validate(value): StandardSchemaV1.Result<Output> {
        try {
          return { value: parse(asString(value)) };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { issues: [{ message }] };
        }
      },
    },
  };
}

/**
 * Parses an environment variable string as a boolean. Every raw env value is a string, and a
 * naive `Boolean(value)` coercion does a plain JS truthiness check. Any non-empty string,
 * including the literal text `"false"`, is truthy in JS, so that coercion can never actually
 * produce `false` for a set env var. This only accepts the literal strings `"true"`/`"false"`.
 */
export const booleanEnv = createEnvSchema<boolean>((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Expected "true" or "false" but received ${JSON.stringify(value)}`);
});

function parseNumber(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    throw new Error(`Expected a number but received ${JSON.stringify(value)}`);
  }

  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    throw new Error(`Expected a number but received ${JSON.stringify(value)}`);
  }

  return parsed;
}

/** Parses an environment variable string as a finite number. */
export const numberEnv = createEnvSchema<number>(parseNumber);

/** Parses an environment variable string as an integer. */
export const integerEnv = createEnvSchema<number>((value) => {
  const parsed = parseNumber(value);

  if (!Number.isInteger(parsed)) {
    throw new Error(`Expected an integer but received ${JSON.stringify(value)}`);
  }

  return parsed;
});

/** Parses an environment variable string as a URL. */
export const urlEnv = createEnvSchema<URL>((value) => {
  if (value === undefined) {
    throw new Error('Expected a URL but received undefined');
  }

  try {
    return new URL(value);
  } catch {
    throw new Error(`Expected a valid URL but received ${JSON.stringify(value)}`);
  }
});

/** Parses an environment variable string as JSON. */
export const jsonEnv = createEnvSchema<unknown>((value) => {
  if (value === undefined) {
    throw new Error('Expected JSON but received undefined');
  }

  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Expected valid JSON but received ${JSON.stringify(value)}`);
  }
});

/** Parses a comma-separated environment variable string into a trimmed, non-empty string array. */
export const csvEnv = createEnvSchema<readonly string[]>((value) => {
  if (value === undefined || value.trim() === '') return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
});
