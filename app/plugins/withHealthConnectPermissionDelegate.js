// react-native-health-connect's permission launcher is a `lateinit` that must be
// registered in MainActivity.onCreate via HealthConnectPermissionDelegate
// .setPermissionDelegate(this) - registerForActivityResult has to run before the
// activity is STARTED. The library's own Expo plugin only adds the rationale
// intent-filter, so without this the launcher is never initialized and
// requestPermission() crashes with UninitializedPropertyAccessException.
// This plugin injects the import + the call into the generated MainActivity.kt.
const { withMainActivity } = require("@expo/config-plugins");

const IMPORT = "import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate";
const CALL = "HealthConnectPermissionDelegate.setPermissionDelegate(this)";

module.exports = function withHealthConnectPermissionDelegate(config) {
  return withMainActivity(config, (config) => {
    if (config.modResults.language !== "kt") {
      throw new Error("withHealthConnectPermissionDelegate expects a Kotlin MainActivity");
    }
    let src = config.modResults.contents;

    if (!src.includes(IMPORT)) {
      // Place the import right after the package declaration.
      src = src.replace(/^(package .*)$/m, `$1\n\n${IMPORT}`);
    }

    if (!src.includes(CALL)) {
      // Register the delegate immediately after super.onCreate(...).
      const onCreate = /super\.onCreate\([^)]*\)/;
      if (!onCreate.test(src)) {
        throw new Error("withHealthConnectPermissionDelegate: no super.onCreate(...) found in MainActivity");
      }
      src = src.replace(onCreate, (m) => `${m}\n    ${CALL}`);
    }

    config.modResults.contents = src;
    return config;
  });
};
