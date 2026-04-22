import appConfig from './config.ts';
import { createConsola, LogLevels } from 'consola';

const logLevels: Record<string, number> = {
  debug: LogLevels.debug,
  error: LogLevels.error,
  fatal: LogLevels.fatal,
  info: LogLevels.info,
  trace: LogLevels.trace,
  warn: LogLevels.warn,
};

const factory = (config = appConfig) =>
  createConsola({
    level: logLevels[config.LOG_LEVEL] ?? LogLevels.info,
  });

const appLogger = factory();

export { factory };
export default appLogger;
