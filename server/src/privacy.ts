// Static, no-JavaScript privacy policy served at /privacy. This is the URL given to
// the Play Console, so it must render readable text without executing the SPA (a
// crawler hitting the bare URL otherwise gets the app shell). The in-app screen
// (app/app/privacy.tsx) mirrors this text for in-app viewing - keep the two in sync.
const UPDATED = "June 1, 2026";
const CONTACT = "me@filipkin.com";

const SECTIONS: [string, string][] = [
    ["The short version",
        "RightNow is end-to-end encrypted. Everything you log - your hours, activities, moods, and notes - is encrypted on your device before it leaves it. Our server stores only unreadable ciphertext and opaque identifiers. We cannot read your data, and neither can anyone who gains access to the server."],
    ["Account credentials",
        "When you create an account you receive a recovery code generated on your device. You may optionally add an email and password as a backup way to sign in. We never receive your password or recovery code - the app sends only a non-reversible token derived from them, and your encryption key is stored wrapped by a key that only you hold. If you add an email, we store it so you can sign in with it."],
    ["Your entries, notes, and activities",
        "These are encrypted on your device (XChaCha20-Poly1305) before syncing. The server receives only ciphertext and an HMAC-based cell identifier it cannot interpret - it never learns the date, hour, activity, mood, or text of anything you log. This data is used solely to sync your information across your own devices."],
    ["Health Connect (sleep)",
        "If you enable Sleep auto-fill on Android, the app reads your sleep sessions from Health Connect on your device to mark your sleeping hours. That sleep information is used only on your device to create sleep entries, which are end-to-end encrypted like everything else before any sync. We do not transmit your Health Connect data in readable form, do not share it with anyone, and never use it for advertising. You can revoke this access at any time in Health Connect or Android settings. Our use of Health Connect complies with the Health Connect Permissions policy and Google Play's User Data and Limited Use requirements."],
    ["Technical data",
        "We keep a session token so you stay signed in, and your IP address is used transiently to rate-limit abuse of the sign-in endpoints. RightNow contains no advertising SDKs, no analytics trackers, and no third-party profiling."],
    ["How your data is used",
        "Only to provide the app: store and sync your encrypted entries, authenticate you, and optionally auto-fill sleep. We do not sell or share your personal data with third parties, and we do not use it for advertising."],
    ["Storage, retention, and your choices",
        "Encrypted data is stored on our hosted server until you delete it or your account. Your decrypted data and your encryption key live only on your devices. At any time you can export a full backup, remove the optional email/password backup, revoke Health Connect access, and delete your account along with all server-side data."],
    ["Children",
        "RightNow is not directed at children under 13, and we do not knowingly collect personal information from them."],
    ["Changes",
        "If we make material changes to this policy we will update this page and the date above."],
    ["Contact",
        `Questions about privacy? Email ${CONTACT}.`],
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const PRIVACY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RightNow Privacy Policy</title>
<style>
  body { margin: 0; background: #2d3436; color: #dfe6e9; font: 16px/1.6 -apple-system, system-ui, Segoe UI, Roboto, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 28px; margin: 0 0 4px; color: #fff; }
  .updated { color: #b2bec3; font-size: 13px; margin-bottom: 28px; }
  h2 { font-size: 18px; margin: 28px 0 6px; color: #fff; }
  p { margin: 0 0 8px; }
  a { color: #74b9ff; }
</style>
</head>
<body>
<main>
<h1>RightNow Privacy Policy</h1>
<p class="updated">Last updated: ${UPDATED}</p>
${SECTIONS.map(([h, b]) => `<h2>${esc(h)}</h2><p>${esc(b)}</p>`).join("\n")}
</main>
</body>
</html>`;
