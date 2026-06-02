// Static, no-JS account-deletion instructions served at /delete-account. This is the
// "Delete account URL" required by the Play Console Data safety form: it must name the
// app/developer, show the deletion steps, and state what is deleted/kept.
const CONTACT = "me@filipkin.com";

export const DELETE_ACCOUNT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Delete your RightNow account</title>
<style>
  body { margin: 0; background: #2d3436; color: #dfe6e9; font: 16px/1.6 -apple-system, system-ui, Segoe UI, Roboto, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 28px; margin: 0 0 12px; color: #fff; }
  h2 { font-size: 18px; margin: 28px 0 6px; color: #fff; }
  p, li { margin: 0 0 8px; }
  ol, ul { padding-left: 22px; }
  a { color: #74b9ff; }
</style>
</head>
<body>
<main>
<h1>Delete your RightNow data</h1>
<p>RightNow (developer: Filip Kin) lets you permanently delete some of your data, or your entire
account and all associated data, directly in the app.</p>

<h2>Delete some of your data (a date range)</h2>
<ol>
  <li>Open RightNow and sign in.</li>
  <li>Go to <strong>Settings</strong> &rarr; <strong>Delete data or account</strong>.</li>
  <li>Under <strong>Delete a date range</strong>, choose a start and end date (for example, a whole
  year).</li>
  <li>Tap <strong>Delete this range</strong> and confirm. The logged hours and notes in that range
  are permanently deleted; the rest of your data and your account are untouched.</li>
</ol>

<h2>Delete your entire account</h2>
<ol>
  <li>Open RightNow and sign in.</li>
  <li>Go to <strong>Settings</strong> &rarr; <strong>Delete data or account</strong>.</li>
  <li>Tap <strong>Delete my account</strong>.</li>
  <li>Confirm. Your account and all of its data are deleted immediately.</li>
</ol>

<h2>If you can't access the app</h2>
<p>Email <a href="mailto:${CONTACT}">${CONTACT}</a> from the email address on your account and ask
to have your account deleted.</p>

<h2>What is deleted</h2>
<p>Deleting your account permanently and immediately removes <strong>all</strong> of your
server-side data: your account record, your email, your end-to-end-encrypted entries, notes, and
activities, your wrapped encryption keys, and all session tokens. None of this data is retained
after deletion, and there is no additional retention period.</p>
<p>Any decrypted copy that exists only on your own device is removed when you sign out or uninstall
the app.</p>
</main>
</body>
</html>`;
