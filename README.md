# @xcvzlabs/env

[![CI](https://img.shields.io/github/actions/workflow/status/xcvzlabs/env/ci.yml?branch=main&color=black)](https://github.com/xcvzlabs/env/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/actions/workflow/status/xcvzlabs/env/release.yml?color=black)](https://github.com/xcvzlabs/env/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/%40xcvzlabs%2Fenv?color=black)](https://www.npmjs.com/package/@xcvzlabs/env)
[![npm downloads](https://img.shields.io/npm/dm/%40xcvzlabs%2Fenv?color=black)](https://www.npmjs.com/package/@xcvzlabs/env)

Runtime-agnostic environment variable loading and validation, built on [Standard Schema](https://standardschema.dev). Use Zod, Valibot, ArkType, or any Standard Schema-compliant validator (even mixed together in the same schema) to read and coerce env vars with full type inference.

```ts
import { z } from 'zod';
import { defineEnv } from '@xcvzlabs/env';

export const env = defineEnv({
  schema: {
    port: z.coerce.number(),
    db: {
      host: z.string(),
      port: z.coerce.number(),
      ssl: z.enum(['true', 'false']).transform((v) => v === 'true'),
    },
  },
});

// env.port: number
// env.db.host: string
// env.db.ssl: boolean
```

## Install

```bash
npm install @xcvzlabs/env
```

You'll also need a Standard Schema-compliant validator, e.g. `zod`, `valibot`, or `arktype`.

## The schema is a plain object tree, not a single validator schema

Standard Schema deliberately exposes no way to introspect a schema's internal shape, so there's no portable way to ask a Zod, Valibot, or ArkType object schema "what are your keys?" across vendors. That means `defineEnv`'s `schema` option isn't one big validator object. It's **a plain nested JS object whose leaves are Standard Schema instances**:

```ts
defineEnv({
  schema: {
    port: z.coerce.number(), // leaf: any Standard Schema, any vendor
    db: {
      // group: a plain object, not a validator
      host: v.string(), // mix vendors freely, even per field
      port: z.coerce.number(),
    },
  },
});
```

We own the grouping ourselves (it's just plain JS objects), so this works with any Standard Schema-compliant library, including mixing vendors in one tree.

## Env var naming

Each schema key contributes a segment of the env var name. Nested groups join their parent's path with `_`, and camelCase keys split at case boundaries. Given the schema above, `defineEnv` reads `PORT`, `DB_HOST`, and `DB_PORT`.

| Schema path     | Env var           |
| --------------- | ----------------- |
| `port`          | `PORT`            |
| `db.host`       | `DB_HOST`         |
| `db.apiBaseUrl` | `DB_API_BASE_URL` |

The naming function is idempotent on keys that are already `SCREAMING_SNAKE_CASE`, so a flat schema keyed directly by real env var names works unchanged. A `t3-env`-style flat schema is just a one-level tree:

```ts
defineEnv({
  schema: {
    PORT: z.coerce.number(),
    DATABASE_URL: z.string().url(),
  },
});
```

Override the derivation with `toEnvVarName`:

```ts
defineEnv({
  schema: { port: z.coerce.number() },
  toEnvVarName: (path) => `MYAPP_${path.join('_').toUpperCase()}`,
});
```

## Where values come from

`defineEnv` reads from `process.env` by default, with no Bun-, Deno-, or edge-specific APIs involved. Pass `source` to read from somewhere else, such as a test, or a runtime without `process.env` (e.g. an edge worker's `env` bindings):

```ts
defineEnv({ schema, source: { PORT: '3000' } });
```

If `process.env` isn't available and no `source` is given, `defineEnv` throws a clear error telling you to pass one explicitly. It never guesses at a runtime-specific global.

## Built-in leaf schemas

Zero-dependency Standard Schema leaves for the coercions every validator either lacks or gets subtly wrong:

```ts
import { booleanEnv, numberEnv, integerEnv, urlEnv, jsonEnv, csvEnv } from '@xcvzlabs/env';
```

- `booleanEnv`: strictly `"true"` / `"false"` → `boolean`. A naive `Boolean(value)` coercion is a JS truthiness check, so it can never actually produce `false` for a set env var (`"false"` is a non-empty, truthy string). This only accepts the two literal strings.
- `numberEnv`: a numeric string → `number`, rejecting empty strings and `NaN`.
- `integerEnv`: `numberEnv`, plus an integer check.
- `urlEnv`: a URL string → `URL`, via `new URL(...)`.
- `jsonEnv`: a JSON string → `unknown`, via `JSON.parse(...)`.
- `csvEnv`: a comma-separated string → trimmed, non-empty `string[]`.

## Async validation

Standard Schema allows `validate()` to be asynchronous. The default `defineEnv` is synchronous and throws `EnvAsyncSchemaError` if any leaf validates asynchronously. Use `defineEnvAsync` for schemas that need to `await`:

```ts
import { defineEnvAsync } from '@xcvzlabs/env';

export const env = await defineEnvAsync({ schema });
```

## Errors

A failing schema throws `EnvValidationError` (`error.code === 'ENV_VALIDATION_ERROR'`) with every failing var listed on `error.issues`, not just the first:

```
Invalid environment variables:
  - DB_HOST: Invalid type: expected string, received undefined
  - DB_PORT: Invalid type: expected string, received undefined
```

Each entry in `error.issues` has `envVar` (the derived name), `path` (the dot path into the schema tree), and `message` (the underlying validator's own message for that issue).
