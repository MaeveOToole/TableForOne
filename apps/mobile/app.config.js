module.exports = ({ config }) => {
  const environment = process.env.APP_ENV || 'development';
  if (!['development', 'staging', 'production'].includes(environment)) {
    throw new Error('APP_ENV must be development, staging or production.');
  }
  const releaseScope = process.env.EXPO_PUBLIC_RELEASE_SCOPE || 'core';
  if (!['core', 'extended'].includes(releaseScope)) {
    throw new Error('EXPO_PUBLIC_RELEASE_SCOPE must be core or extended.');
  }
  if (environment !== 'development' && releaseScope !== 'core') {
    throw new Error(
      'Staging and production builds must use the core release scope.',
    );
  }
  if (environment !== 'development') {
    for (const key of ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_SUPABASE_URL']) {
      if (!process.env[key]?.startsWith('https://'))
        throw new Error(`${key} must use HTTPS.`);
    }
    const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!key || key.includes('replace-with-'))
      throw new Error('Set the environment publishable key.');
  }
  const suffix = environment === 'production' ? '' : `.${environment}`;
  return {
    ...config,
    name:
      environment === 'production'
        ? config.name
        : `${config.name} (${environment})`,
    scheme:
      environment === 'production'
        ? 'mealplanner'
        : `mealplanner-${environment}`,
    ios: { ...config.ios, bundleIdentifier: `com.mealplanner.app${suffix}` },
    extra: { ...config.extra, environment, releaseScope },
  };
};
