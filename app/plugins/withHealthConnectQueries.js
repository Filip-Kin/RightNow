// Adds the Health Connect package-visibility <queries> entry to AndroidManifest.
// Android 11+ package visibility means the app can't see the Health Connect
// provider (or, on Android <14, the standalone Health Connect app) unless it's
// declared here. react-native-health-connect's own plugin only adds the
// permission-rationale intent-filter, so we add the queries ourselves.
const { withAndroidManifest } = require("@expo/config-plugins");

const HC_PACKAGE = "com.google.android.apps.healthdata";

module.exports = function withHealthConnectQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest.queries = manifest.queries || [];
    const already = manifest.queries.some((q) =>
      (q.package || []).some((p) => p?.$?.["android:name"] === HC_PACKAGE),
    );
    if (!already) {
      manifest.queries.push({ package: [{ $: { "android:name": HC_PACKAGE } }] });
    }
    return config;
  });
};
