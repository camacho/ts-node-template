import { pino } from 'pino';
import { build } from 'pino-pretty';

import config from './config.ts';

const stream = build({
  colorize: true,
  sync: config.NODE_ENV === 'development',
});

const logger = pino({ level: config.LOG_LEVEL }, stream);

export default logger;
