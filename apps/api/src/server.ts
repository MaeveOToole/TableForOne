import './env.js';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';
const env = loadConfig(process.env);
const app = buildApp({
  openai: { apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL },
  url: env.SUPABASE_URL,
  key: env.SUPABASE_PUBLISHABLE_KEY,
  adminKey: env.SUPABASE_SECRET_KEY,
  environment: env.APP_ENV,
  webOrigin: env.WEB_ORIGIN,
  logLevel: env.LOG_LEVEL,
  features: {
    catalog: env.FEATURE_CATALOG,
    savedRecipes: env.FEATURE_SAVED_RECIPES,
  },
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    void app.close();
  });
await app.listen({ port: env.PORT, host: env.HOST });
