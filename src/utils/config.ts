import { config as dotenvConfig } from 'dotenv-flow';
import { cleanEnv, str, num } from 'envalid';

/* eslint-disable @typescript-eslint/naming-convention */
const defaults = {
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',
};

const factory = (env = process.env) => {
  const nodeEnv = env['NODE_ENV'] ?? defaults.NODE_ENV;
  const { parsed: loadedConfig, error: dotenvError } = dotenvConfig({
    node_env: nodeEnv,
  });

  if (dotenvError ?? !loadedConfig) {
    throw dotenvError ?? new Error('Failed to load environment variables');
  }

  const config = cleanEnv(
    { ...loadedConfig, ...env },
    {
      NODE_ENV: str({
        default: defaults.NODE_ENV,
        choices: ['development', 'test', 'production'],
      }),
      LOG_LEVEL: str({
        default: defaults.LOG_LEVEL,
        choices: ['fatal', 'error', 'warn', 'info', 'debug', 'trace'],
      }),
      PROCESS_EXIT_WAIT: num({ default: 10 * 1000 }), // 10 seconds
    },
  );
  /* eslint-enable @typescript-eslint/naming-convention */

  return config;
};

export { factory };
export default factory(process.env);
