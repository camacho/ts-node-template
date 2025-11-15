import 'jest-extended';

declare global {
  namespace NodeJS {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface ProcessEnv {
      NODE_ENV?: 'dev' | 'development' | 'test' | 'production' | string;
      LOG_LEVEL?: 'info' | 'warning' | 'error' | string;
    }
  }
}
