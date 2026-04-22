import { describe, it, expect, beforeEach, vi } from 'vitest';

import logger, { factory as createLogger } from './logger.ts';

describe('Logger Utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('should create a logger instance with default config', () => {
    expect(logger).toBeDefined();
    expect(logger.info).toBeTypeOf('function');
  });

  it('should create a logger instance with cusftom config', () => {
    const customConfig = {
      NODE_ENV: 'production',
      LOG_LEVEL: 'error',
    };

    const customLogger = createLogger(customConfig as any);

    expect(customLogger).toBeDefined();
    expect(customLogger.error).toBeTypeOf('function');
  });

  it('should create a production logger', () => {
    const customConfig = {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
    };

    const customLogger = createLogger(customConfig as any);

    expect(customLogger).toBeDefined();
    expect(customLogger.info).toBeTypeOf('function');
  });

  it('should create a development logger', () => {
    const customConfig = {
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
    };

    const customLogger = createLogger(customConfig as any);

    expect(customLogger).toBeDefined();
    expect(customLogger.info).toBeTypeOf('function');
  });
});
