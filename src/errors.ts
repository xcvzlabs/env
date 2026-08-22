export type EnvIssue = {
  readonly envVar: string;
  readonly path: string;
  readonly message: string;
};

function formatMessage(issues: readonly EnvIssue[]): string {
  const lines = issues.map((issue) => `  - ${issue.envVar}: ${issue.message}`);
  return `Invalid environment variables:\n${lines.join('\n')}`;
}

/** Thrown by `defineEnv`/`defineEnvAsync` when one or more environment variables fail schema validation. */
export class EnvValidationError extends Error {
  readonly code = 'ENV_VALIDATION_ERROR';
  readonly issues: readonly EnvIssue[];

  constructor(issues: readonly EnvIssue[]) {
    super(formatMessage(issues));
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

/**
 * Thrown by the synchronous `defineEnv` when a schema leaf's `~standard.validate()` returns a
 * `Promise`. Standard Schema allows validation to be asynchronous, but `defineEnv` cannot await
 * it. Use `defineEnvAsync` instead for schemas that validate asynchronously.
 */
export class EnvAsyncSchemaError extends Error {
  readonly code = 'ENV_ASYNC_SCHEMA_ERROR';

  constructor(envVar: string) {
    super(
      `The schema for ${envVar} validated asynchronously, but defineEnv() is synchronous. Use defineEnvAsync() instead.`,
    );
    this.name = 'EnvAsyncSchemaError';
  }
}
