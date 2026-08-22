import type { StandardSchemaV1 } from '@standard-schema/spec';
import { EnvAsyncSchemaError, EnvValidationError, type EnvIssue } from './errors.ts';

export type EnvSource = Readonly<Record<string, string | undefined>>;

/**
 * A schema tree: plain objects group related env vars, and any Standard Schema V1-compliant
 * validator (Zod, Valibot, ArkType, or your own) is a leaf that reads one env var. Vendors can be
 * freely mixed, even within the same tree.
 */
export type EnvSchemaShape = { readonly [key: string]: StandardSchemaV1 | EnvSchemaShape };

export type InferEnvOutput<TShape extends EnvSchemaShape> = {
  readonly [K in keyof TShape]: TShape[K] extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<TShape[K]>
    : TShape[K] extends EnvSchemaShape
      ? InferEnvOutput<TShape[K]>
      : never;
};

export type DefineEnvOptions<TShape extends EnvSchemaShape> = {
  /** A plain nested object tree; leaves are Standard Schema V1-compliant validators. */
  readonly schema: TShape;
  /** Where raw values are read from. Defaults to `process.env`. */
  readonly source?: EnvSource;
  /** Overrides how a schema-tree path becomes an env var name. Defaults to `toEnvVarName`. */
  readonly toEnvVarName?: (path: readonly string[]) => string;
};

type LeafEntry = {
  readonly path: readonly string[];
  readonly envVar: string;
  readonly schema: StandardSchemaV1;
  readonly raw: string | undefined;
};

/**
 * Derives an env var name from a schema-tree path: nested groups join with `_`, and camelCase
 * keys split at case boundaries. `['db', 'apiBaseUrl']` becomes `DB_API_BASE_URL`. Idempotent on
 * keys that are already `SCREAMING_SNAKE_CASE`, so a flat schema keyed directly by real env var
 * names works unchanged.
 */
export function toEnvVarName(path: readonly string[]): string {
  return path
    .map((segment) => segment.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase())
    .join('_');
}

function isSchemaLeaf(node: unknown): node is StandardSchemaV1 {
  // Some vendors (e.g. ArkType) return a callable function as their schema, not a plain object,
  // so this can't require `typeof node === 'object'`.
  return (
    (typeof node === 'object' || typeof node === 'function') && node !== null && '~standard' in node
  );
}

function isPlainObject(node: unknown): node is Record<string, unknown> {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return false;
  const proto = Object.getPrototypeOf(node) as unknown;
  return proto === Object.prototype || proto === null;
}

function collectLeaves(
  shape: EnvSchemaShape,
  source: EnvSource,
  nameForPath: (path: readonly string[]) => string,
  path: readonly string[],
  out: LeafEntry[],
): void {
  for (const [key, node] of Object.entries(shape)) {
    const nextPath = [...path, key];

    if (isSchemaLeaf(node)) {
      const envVar = nameForPath(nextPath);
      out.push({ path: nextPath, envVar, schema: node, raw: source[envVar] });
      continue;
    }

    if (isPlainObject(node)) {
      collectLeaves(node, source, nameForPath, nextPath, out);
      continue;
    }

    throw new TypeError(
      `Invalid env schema at "${nextPath.join('.')}": expected a Standard Schema validator or a plain nested object, got ${Object.prototype.toString.call(node)}.`,
    );
  }
}

function issuePath(entry: LeafEntry, issue: StandardSchemaV1.Issue): string {
  const subPath = (issue.path ?? []).map((segment) => {
    return typeof segment === 'object' ? String(segment.key) : String(segment);
  });

  return [...entry.path, ...subPath].join('.');
}

function toEnvIssues(entry: LeafEntry, issues: readonly StandardSchemaV1.Issue[]): EnvIssue[] {
  return issues.map((issue) => ({
    envVar: entry.envVar,
    path: issuePath(entry, issue),
    message: issue.message,
  }));
}

/**
 * Rebuilds the nested output object from a flat list of validated `{ path, value }` leaves. The
 * shape is only known to match `TShape` because every leaf's path came from walking `TShape`
 * itself in `collectLeaves`. There's no way to express that connection to the type checker, so
 * this is the single place that bridges runtime construction to the statically inferred type.
 */
function buildOutput<TShape extends EnvSchemaShape>(
  entries: readonly { path: readonly string[]; value: unknown }[],
): InferEnvOutput<TShape> {
  const root: Record<string, unknown> = {};

  for (const { path, value } of entries) {
    const leafKey = path.at(-1);

    if (leafKey === undefined) {
      throw new Error('Invalid empty path in schema tree.');
    }

    let node = root;

    for (const key of path.slice(0, -1)) {
      const child = node[key];
      node = isPlainObject(child) ? child : (node[key] = {});
    }

    node[leafKey] = value;
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the doc comment above.
  return root as InferEnvOutput<TShape>;
}

function defaultSource(): EnvSource {
  if (typeof process === 'undefined' || typeof process.env !== 'object' || process.env === null) {
    throw new Error(
      'No default environment source is available in this runtime (`process.env` is undefined). Pass `source` explicitly to defineEnv()/defineEnvAsync().',
    );
  }

  return process.env;
}

/** Reads and validates environment variables against a Standard Schema-based schema tree. */
export function defineEnv<TShape extends EnvSchemaShape>(
  options: DefineEnvOptions<TShape>,
): InferEnvOutput<TShape> {
  const source = options.source ?? defaultSource();
  const nameForPath = options.toEnvVarName ?? toEnvVarName;
  const entries: LeafEntry[] = [];

  collectLeaves(options.schema, source, nameForPath, [], entries);

  const issues: EnvIssue[] = [];
  const outputs: { path: readonly string[]; value: unknown }[] = [];

  for (const entry of entries) {
    const result = entry.schema['~standard'].validate(entry.raw);

    if (result instanceof Promise) {
      throw new EnvAsyncSchemaError(entry.envVar);
    }

    if (result.issues) issues.push(...toEnvIssues(entry, result.issues));
    else outputs.push({ path: entry.path, value: result.value });
  }

  if (issues.length > 0) throw new EnvValidationError(issues);
  return buildOutput<TShape>(outputs);
}

/** Like `defineEnv`, but awaits every leaf's validation. Use this when a schema validates asynchronously. */
export async function defineEnvAsync<TShape extends EnvSchemaShape>(
  options: DefineEnvOptions<TShape>,
): Promise<InferEnvOutput<TShape>> {
  const source = options.source ?? defaultSource();
  const nameForPath = options.toEnvVarName ?? toEnvVarName;
  const entries: LeafEntry[] = [];

  collectLeaves(options.schema, source, nameForPath, [], entries);

  const validated = await Promise.all(
    entries.map(async (entry) => {
      return {
        entry,
        result: await entry.schema['~standard'].validate(entry.raw),
      };
    }),
  );

  const issues: EnvIssue[] = [];
  const outputs: { path: readonly string[]; value: unknown }[] = [];

  for (const { entry, result } of validated) {
    if (result.issues) issues.push(...toEnvIssues(entry, result.issues));
    else outputs.push({ path: entry.path, value: result.value });
  }

  if (issues.length > 0) throw new EnvValidationError(issues);
  return buildOutput<TShape>(outputs);
}
