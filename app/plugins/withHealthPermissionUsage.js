// Android 14+ (API 34+) Health Connect requires the app to declare an exported
// activity that handles the VIEW_PERMISSION_USAGE intent with the
// HEALTH_PERMISSIONS category (this is where the app's privacy policy / rationale
// is shown). Without it, Health Connect refuses to honor permissions: the request
// dialog returns empty and readRecords throws
//   "Incorrect health permission state, likely because the calling application's
//    manifest does not specify handling android.intent.action.VIEW_PERMISSION_USAGE
//    with android.intent.category.HEALTH_PERMISSIONS".
// react-native-health-connect's own plugin only adds the older Android-13
// ACTION_SHOW_PERMISSIONS_RATIONALE filter, so we add this one ourselves. We point
// it at MainActivity (it just opens the app); that satisfies HC's manifest check.
const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

const ACTION = "android.intent.action.VIEW_PERMISSION_USAGE";
const CATEGORY = "android.intent.category.HEALTH_PERMISSIONS";

module.exports = function withHealthPermissionUsage(config) {
  return withAndroidManifest(config, (config) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    const activities = app.activity || [];
    // Prefer the launcher (MAIN) activity; fall back to the first activity.
    const main =
      activities.find((a) =>
        (a["intent-filter"] || []).some((f) =>
          (f.action || []).some((ac) => ac.$["android:name"] === "android.intent.action.MAIN"),
        ),
      ) || activities[0];
    if (!main) throw new Error("withHealthPermissionUsage: no activity found in manifest");

    main["intent-filter"] = main["intent-filter"] || [];
    const already = main["intent-filter"].some((f) =>
      (f.action || []).some((a) => a.$["android:name"] === ACTION),
    );
    if (!already) {
      main["intent-filter"].push({
        action: [{ $: { "android:name": ACTION } }],
        category: [{ $: { "android:name": CATEGORY } }],
      });
    }
    // The activity must be exported to receive this system intent.
    main.$["android:exported"] = "true";
    return config;
  });
};
