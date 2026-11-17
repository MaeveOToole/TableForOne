module.exports = ({ config, environment, releaseScope }) => {
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
