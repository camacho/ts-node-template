import type pino from 'pino';
import { config as dotenvConfig } from 'dotenv-flow';

dotenvConfig();

type Config = {
  NODE_ENV: 'development' | 'test' | 'production';
  LOG_LEVEL: pino.LevelWithSilentOrString;
};

type Transformations = Partial<{
  [K in keyof Config]: Transform<Config[K] | undefined>;
}>;

type Transform<T extends Config[keyof Config] | undefined> = (
  value: string | undefined,
) => T;

/* eslint-disable @typescript-eslint/naming-convention */
const defaults = {
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',
};
/* eslint-enable @typescript-eslint/naming-convention */

/* eslint-disable @typescript-eslint/naming-convention */
const transformations: Transformations = {
  NODE_ENV: (value) => {
    if (!value) return undefined;

    const str = value?.toLowerCase();

    const env =
      {
        dev: 'development',
        prod: 'production',
      }[str] ?? str;

    if (env !== 'development' && env !== 'test' && env !== 'production') {
      return undefined;
    }

    return env;
  },
};
/* eslint-enable @typescript-eslint/naming-convention */

const config = {
  ...defaults,
  ...Object.fromEntries(
    Object.entries(process.env).map(([key, value]) => {
      if (!value || !(key in transformations)) {
        return [key, value];
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const transformer = transformations[key as keyof Config];
      return [key, transformer ? transformer(value) : value];
    }),
  ),
};

const validate = <T extends Config>(env: unknown): env is T => true;

if (!validate<Config>(config)) {
  throw new Error('Invalid environment configuration');
}

export default config satisfies Config;
