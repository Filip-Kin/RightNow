// The hourly-reminder notification's "Open in app" action relaunches MainActivity
// with the extra `rightnow.open=log` (see withQuickLogOverlay.js). On a WARM start the
// activity is reused via onNewIntent, but Expo's ReactActivity does not call
// setIntent() there, so QuickLogModule.consumeLaunchRoute() reads the STALE original
// intent and never routes to /log. This plugin injects an onNewIntent override that
// forwards to super (keeps RN deep-link handling) and calls setIntent(intent) so the
// fresh extra is visible. Mirrors withHealthConnectPermissionDelegate's approach.
const { withMainActivity } = require("@expo/config-plugins");

const IMPORT = "import android.content.Intent";
const METHOD = `
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent) // so consumeLaunchRoute() sees the notification's fresh extra
    }`;

module.exports = function withLaunchIntent(config) {
  return withMainActivity(config, (config) => {
    if (config.modResults.language !== "kt") {
      throw new Error("withLaunchIntent expects a Kotlin MainActivity");
    }
    let src = config.modResults.contents;

    if (!src.includes(IMPORT)) {
      src = src.replace(/^(package .*)$/m, `$1\n\n${IMPORT}`);
    }

    if (!src.includes("fun onNewIntent")) {
      // Insert the override right after the class declaration's opening brace.
      const classOpen = /(class\s+MainActivity\s*:[^{]*\{)/;
      if (!classOpen.test(src)) {
        throw new Error("withLaunchIntent: could not find MainActivity class declaration");
      }
      src = src.replace(classOpen, (m) => `${m}\n${METHOD}`);
    }

    config.modResults.contents = src;
    return config;
  });
};
