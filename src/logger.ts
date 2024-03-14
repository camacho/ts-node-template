import pino from 'pino';
import pretty from 'pino-pretty';

const stream = pretty({
  colorize: true,
  sync: process.env.NODE_ENV?.toLocaleLowerCase() === 'test',
});

const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
  },
  stream
);

export default logger;
