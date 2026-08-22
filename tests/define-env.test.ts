import { type } from 'arktype';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { booleanEnv, defineEnv, type EnvSchemaShape, EnvValidationError } from '../src/index.ts';

describe('defineEnv', () => {
  it('reads a flat, t3-env-style schema keyed directly by env var names', () => {
    const env = defineEnv({
      schema: {
        PORT: z.coerce.number(),
        DB_HOST: v.string(),
      },
      source: { PORT: '3000', DB_HOST: 'localhost' },
    });

    expect(env).toEqual({ PORT: 3000, DB_HOST: 'localhost' });
  });

  it('derives underscored env var names from a nested camelCase schema tree', () => {
    const env = defineEnv({
      schema: {
        port: z.coerce.number(),
        db: {
          host: z.string(),
          apiBaseUrl: z.string(),
        },
      },
      source: { PORT: '3000', DB_HOST: 'localhost', DB_API_BASE_URL: 'https://x' },
    });

    expect(env).toEqual({ port: 3000, db: { host: 'localhost', apiBaseUrl: 'https://x' } });
  });

  it('mixes Zod, Valibot, and ArkType leaves in the same schema tree', () => {
    const env = defineEnv({
      schema: {
        apiKey: type('string'),
        db: {
          host: v.string(),
          port: z.coerce.number(),
          ssl: booleanEnv,
        },
      },
      source: { API_KEY: 'secret', DB_HOST: 'localhost', DB_PORT: '5432', DB_SSL: 'true' },
    });

    expect(env).toEqual({
      apiKey: 'secret',
      db: { host: 'localhost', port: 5432, ssl: true },
    });
  });

  it('honors a custom source instead of process.env', () => {
    const env = defineEnv({
      schema: { name: z.string() },
      source: { NAME: 'from-custom-source' },
    });

    expect(env).toEqual({ name: 'from-custom-source' });
  });

  it('honors a custom toEnvVarName override', () => {
    const env = defineEnv({
      schema: { app: { port: z.coerce.number() } },
      source: { 'app.port': '3000' },
      toEnvVarName: (path: readonly string[]) => path.join('.'),
    });

    expect(env).toEqual({ app: { port: 3000 } });
  });

  it('aggregates every failing var into a single EnvValidationError, not just the first', () => {
    expect.assertions(3);
    try {
      defineEnv({
        schema: { port: z.coerce.number(), db: { host: z.string() } },
        source: {},
      });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      if (!(error instanceof EnvValidationError)) return;
      expect(error.issues).toHaveLength(2);
      expect(error.issues.map((issue) => issue.envVar).toSorted()).toEqual(['DB_HOST', 'PORT']);
    }
  });

  it('includes envVar, dot path, and message on each issue', () => {
    expect.assertions(1);
    try {
      defineEnv({ schema: { db: { host: z.string() } }, source: {} });
    } catch (error) {
      if (!(error instanceof EnvValidationError)) throw error;
      expect(error.issues[0]).toMatchObject({ envVar: 'DB_HOST', path: 'db.host' });
    }
  });

  it('throws a descriptive TypeError for a malformed schema tree node', () => {
    // Deliberately violates EnvSchemaShape to exercise the runtime guard a plain-JS caller could still hit.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const malformedSchema = { db: ['not', 'a', 'schema'] } as unknown as EnvSchemaShape;
    expect(() => defineEnv({ schema: malformedSchema, source: {} })).toThrowError(
      /Invalid env schema at "db"/,
    );
  });

  it('throws when process.env is unavailable and no source is provided', () => {
    const originalProcess = globalThis.process;
    // @ts-expect-error simulating a runtime without `process`
    delete globalThis.process;
    try {
      expect(() => defineEnv({ schema: { name: z.string() } })).toThrowError(
        /No default environment source/,
      );
    } finally {
      globalThis.process = originalProcess;
    }
  });
});
