import type { StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expect, it } from 'vitest';
import { booleanEnv, csvEnv, integerEnv, jsonEnv, numberEnv, urlEnv } from '../src/index.ts';

function parse<S extends StandardSchemaV1<string | undefined, unknown>>(
  schema: S,
  value: string | undefined,
): StandardSchemaV1.Result<StandardSchemaV1.InferOutput<S>> {
  const result = schema['~standard'].validate(value);
  if (result instanceof Promise) throw new Error('expected a synchronous schema');
  return result;
}

describe('booleanEnv', () => {
  it.each([
    ['true', true],
    ['false', false],
  ])('accepts %s', (input, expected) => {
    expect(parse(booleanEnv, input)).toEqual({ value: expected });
  });

  it.each(['TRUE', '1', '', undefined, 'yes'])('rejects %s', (input) => {
    const result = parse(booleanEnv, input);
    expect(result.issues).toBeDefined();
  });
});

describe('numberEnv', () => {
  it('parses a numeric string', () => {
    expect(parse(numberEnv, '42.5')).toEqual({ value: 42.5 });
  });

  it.each([undefined, '', 'nope'])('rejects %s', (input) => {
    expect(parse(numberEnv, input).issues).toBeDefined();
  });
});

describe('integerEnv', () => {
  it('parses an integer string', () => {
    expect(parse(integerEnv, '42')).toEqual({ value: 42 });
  });

  it('rejects a non-integer number', () => {
    expect(parse(integerEnv, '42.5').issues).toBeDefined();
  });
});

describe('urlEnv', () => {
  it('parses a valid URL string', () => {
    const result = parse(urlEnv, 'https://example.com/path');
    if (result.issues) throw new Error('expected success');
    expect(result.value).toBeInstanceOf(URL);
    expect(result.value.href).toBe('https://example.com/path');
  });

  it.each([undefined, 'not-a-url'])('rejects %s', (input) => {
    expect(parse(urlEnv, input).issues).toBeDefined();
  });
});

describe('jsonEnv', () => {
  it('parses valid JSON', () => {
    expect(parse(jsonEnv, '{"a":1}')).toEqual({ value: { a: 1 } });
  });

  it.each([undefined, '{not json}'])('rejects %s', (input) => {
    expect(parse(jsonEnv, input).issues).toBeDefined();
  });
});

describe('csvEnv', () => {
  it('splits and trims a comma-separated list', () => {
    expect(parse(csvEnv, 'a, b ,c')).toEqual({ value: ['a', 'b', 'c'] });
  });

  it.each([[undefined, []] as const, ['', []] as const])(
    'treats %s as empty',
    (input, expected) => {
      expect(parse(csvEnv, input)).toEqual({ value: expected });
    },
  );
});
