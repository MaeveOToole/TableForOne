import { z } from 'zod';

const flag = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

export function loadConfig(input: Record<string, string | undefined>) {
  const env = z
    .object({
      OPENAI_API_KEY: z.string().trim().min(1).optional(),
      OPENAI_MODEL: z.string().trim().min(1).default('gpt-4.1-mini'),
      SUPABASE_URL: z.url(),
      SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
      SUPABASE_SECRET_KEY: z.string().min(20).optional(),
      WEB_ORIGIN: z.url().optional(),
      PORT: z.coerce.number().int().min(1).max(65535).default(3000),
      HOST: z.string().default('127.0.0.1'),
      APP_ENV: z
        .enum(['development', 'staging', 'production'])
        .default('development'),
      LOG_LEVEL: z
        .enum(['debug', 'info', 'warn', 'error', 'silent'])
        .default('info'),
      FEATURE_CATALOG: flag,
      FEATURE_SAVED_RECIPES: flag,
    })
    .parse(input);
  if (env.APP_ENV !== 'development') {
    if (
      !env.SUPABASE_URL.startsWith('https://') ||
      (env.WEB_ORIGIN && !env.WEB_ORIGIN.startsWith('https://'))
    ) {
      throw new Error('Hosted environments require HTTPS URLs.');
    }
    if (env.SUPABASE_PUBLISHABLE_KEY.includes('replace-with-')) {
      throw new Error(
        'Configure a real publishable key for the selected environment.',
      );
    }
  }
  return env;
}
