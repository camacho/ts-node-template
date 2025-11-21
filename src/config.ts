import { config as dotenvConfig } from 'dotenv-flow';
import { cleanEnv, str } from 'envalid';

/* eslint-disable @typescript-eslint/naming-convention */
const defaults = {
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',
};

const { parsed: parsedEnv, error: dotenvError } = dotenvConfig({
  node_env: process.env['NODE_ENV'] ?? defaults.NODE_ENV,
});

if (dotenvError ?? !parsedEnv) {
  throw dotenvError ?? new Error('Failed to load environment variables');
}

const config = cleanEnv(
  { ...defaults, ...parsedEnv },
  {
    NODE_ENV: str({
      choices: ['development', 'test', 'production'],
    }),
    LOG_LEVEL: str({
      choices: ['fatal', 'error', 'warn', 'info', 'debug', 'trace'],
    }),
  },
);
/* eslint-enable @typescript-eslint/naming-convention */

export default config;
