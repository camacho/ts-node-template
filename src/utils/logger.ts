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

const logger = (config = appConfig) => {
  const appLogger = createConsola({
    level: logLevels[config.LOG_LEVEL] ?? LogLevels.info,
  });

  return appLogger;
};

const appLogger = logger();

export { logger as factory };
export default appLogger;
