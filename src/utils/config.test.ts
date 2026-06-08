import { describe, expect, it } from 'vitest';

import { factory } from './config.ts';

describe('Config', () => {
  it('loads default config when no env vars are set', () => {
    const config = factory({});

    expect(config.NODE_ENV).toBe('development');
    expect(config.LOG_LEVEL).toBe('debug');
  });

  it('loads config from environment variables', () => {
    const env = {
      NODE_ENV: 'production',
      LOG_LEVEL: 'error',
    };
    const config = factory(env);

    expect(config.NODE_ENV).toBe('production');
    expect(config.LOG_LEVEL).toBe('error');
  });

  it('throws error for invalid NODE_ENV', () => {
    const env = {
      NODE_ENV: 'invalid_env',
    };

    expect(() => factory(env)).toThrow();
  });

  it('throws error for invalid LOG_LEVEL', () => {
    const env = {
      LOG_LEVEL: 'invalid_level',
    };

    expect(() => factory(env)).toThrow();
  });

  it('filters out unknown environment variables', () => {
    const env = {
      UNKNOWN_VAR: 'some_value',
    };

    const config = factory(env);

    expect('UNKNOWN_VAR' in config).toBe(false);
  });
});
