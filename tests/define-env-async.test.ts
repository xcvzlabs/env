import type { StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  defineEnv,
  defineEnvAsync,
  EnvAsyncSchemaError,
  EnvValidationError,
} from '../src/index.ts';

function asyncEnvSchema<Output>(
  parse: (value: string | undefined) => Output,
): StandardSchemaV1<string | undefined, Output> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      async validate(value) {
        await Promise.resolve();
        if (value !== undefined && typeof value !== 'string') {
          return { issues: [{ message: 'expected a string or undefined' }] };
        }
        try {
          return { value: parse(value) };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { issues: [{ message }] };
        }
      },
    },
  };
}

describe('defineEnvAsync', () => {
  it('awaits async leaf validators and returns the parsed output', async () => {
    const env = await defineEnvAsync({
      schema: {
        apiKey: asyncEnvSchema((value) => {
          if (!value) throw new Error('required');
          return value.toUpperCase();
        }),
        port: z.coerce.number(),
      },
      source: { API_KEY: 'secret', PORT: '3000' },
    });

    expect(env).toEqual({ apiKey: 'SECRET', port: 3000 });
  });

  it('aggregates issues from both sync and async leaves', async () => {
    expect.assertions(2);
    try {
      await defineEnvAsync({
        schema: {
          apiKey: asyncEnvSchema<string>(() => {
            throw new Error('bad api key');
          }),
          port: z.coerce.number(),
        },
        source: {},
      });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      if (!(error instanceof EnvValidationError)) return;
      expect(error.issues.map((issue) => issue.envVar).toSorted()).toEqual(['API_KEY', 'PORT']);
    }
  });
});

describe('defineEnv (sync) with an async leaf', () => {
  it('throws EnvAsyncSchemaError instead of silently swallowing the promise', () => {
    expect(() =>
      defineEnv({
        schema: {
          apiKey: asyncEnvSchema((value) => value ?? ''),
        },
        source: { API_KEY: 'secret' },
      }),
    ).toThrowError(EnvAsyncSchemaError);
  });
});
