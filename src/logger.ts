import pino from 'pino';
import pretty from 'pino-pretty';

import config from './config.ts';

const stream = pretty({
  colorize: true,
  sync: config.NODE_ENV === 'development',
});

const logger = pino({ level: config.LOG_LEVEL }, stream);

export default logger;
