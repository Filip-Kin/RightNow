# RightNow — Google Play (Internal testing) setup

Goal: get RightNow onto the **Internal testing** track (personal account). No 12-tester/14-day
gate and no production review on this track. Below: exactly what to fill in for each Play Console
"App content" item, the store listing, and the release.

- **Package name:** `com.filipkin.rightnow`
- **Privacy policy URL:** `https://rightnow.filipkin.com/privacy`
- **Artifact to upload:** `RightNow.aab` from the `android-latest` Forgejo release
  (`https://git.filipkin.com/filip/RightNow/releases/tag/android-latest`). Signed with the
  EAS-managed upload key; accept **Play App Signing** on first upload.

---

## App content

### Privacy policy
Paste `https://rightnow.filipkin.com/privacy`.

### App access
All functionality requires signing in → choose **"All or some functionality is restricted."**
Add an instruction + credentials so a reviewer can get in. Create a throwaway account in the app
first, then add (example):
- Name: "Sign in"
- Instructions: "Open the app, tap 'Sign in with email & password', enter the credentials below."
- Username: `<test email you created>`  Password: `<that password>`
(Internal-testing review is light, but fill this in so it's ready if you promote later.)

### Ads
**No**, the app does not contain ads. (True — no ad SDKs.)

### Content rating
Run the questionnaire. Answers for RightNow:
- Category: **Utility, Productivity, Communication, or Other** → choose **Utility/Other**.
- Violence / sexual / profanity / controlled substances / gambling / horror: **No** to all.
- User-generated content shared with others / social features: **No** (entries are private and
  end-to-end encrypted; nothing is shared between users).
- Does the app share the user's location: **No**.
Result will be **Everyone**. Provide your email for the certificate.

### Target audience
- Target age group: **18+** (simplest — avoids the Families policy program; it's a personal
  self-tracking tool).
- "Is your app designed for children?" → **No**.
- Appealing to children: **No**.

### Data safety
The app is end-to-end encrypted, but Play still wants data types that leave the device declared.
Recommended, defensible answers:

- **Does your app collect or share required user data types?** → **Yes** (some data is transmitted).
- **Is all collected data encrypted in transit?** → **Yes**.
- **Do you provide a way for users to request data deletion?** → **Yes** (delete account / data
  in-app).

Data types to declare:
| Type | Collected? | Shared? | Purpose | Notes |
|------|-----------|---------|---------|-------|
| Personal info → **Email address** | Yes (optional) | No | Account management | Only if the user adds the email+password backup; optional |
| Health & fitness → **Health info** (sleep) | Yes | No | App functionality | Read from Health Connect on-device; stored only as end-to-end-encrypted entries |

Notes you can add in the free-text: "All logged data (hours, activities, moods, notes, and any
Health Connect sleep) is end-to-end encrypted on the device before syncing; the server stores only
opaque ciphertext and cannot read it. No advertising or analytics."

(If Play complains that diary/mood content needs a type, add **Personal info → Other info** with the
same Collected/No-share/App-functionality answers. Don't declare Location, Contacts, Financial,
Messages, Photos, or Identifiers — the app uses none of them.)

### Government apps
**No.**

### Financial features
**No** financial features.

### Health (Health apps declaration)
Because the app uses Health Connect (`READ_SLEEP`, `READ_HEALTH_DATA_HISTORY`), complete the Health
declaration:
- Does your app access health data via Health Connect? **Yes.**
- Which data types: **Sleep** (and historical sleep).
- Purpose: "Auto-fill the user's sleeping hours in their personal time tracker, on-device. Sleep
  data is converted to entries that are end-to-end encrypted before any sync; it is never shared
  and never used for advertising."
- Confirm compliance with the **Health Connect Permissions policy** and link the privacy policy
  (`https://rightnow.filipkin.com/privacy`, which has a dedicated Health Connect section).

---

## Store listing & store settings

### Store settings
- **App category:** Health & Fitness (best fit given sleep + mood; "Lifestyle" is an alternative).
- **Contact email:** your email (required). **Website:** `https://rightnow.filipkin.com`.

### Main store listing
- **App name:** RightNow
- **Short description (≤80 chars):**
  `Private, end-to-end encrypted hourly time & mood tracker.`
- **Full description (≤4000 chars):**

```
RightNow is a private, end-to-end encrypted tracker for how you actually spend your time and how
you feel. Log each hour with an activity and a mood, then watch the patterns emerge.

• Hour-by-hour logging — pick what you were doing and how you felt, in seconds.
• Optional hourly reminders that pop up so you can log without switching apps, or a single daily
  nudge — your choice.
• A full-year grid and insights so you can see your time and mood at a glance.
• Sleep auto-fill (Android) — let Health Connect fill in your sleeping hours automatically.
• End-to-end encrypted and zero-knowledge: everything is encrypted on your device before it syncs.
  The server only ever stores unreadable data — not even we can see your entries.
• Sync across your devices, and export a full backup any time.

Your time is yours. RightNow keeps it that way.
```

- **App icon:** 512×512 PNG — use `app/assets/images/icon-512.png`.
- **Feature graphic:** 1024×500 PNG — **needs to be created** (a simple branded banner; the
  `#2d3436` background + logo works).
- **Phone screenshots:** at least 2 (recommend 4) — capture from the app: the home "Right Now"
  screen, the History grid, Insights, and the hourly log popup. PNG/JPEG, 16:9 or 9:16,
  min 320px, max 3840px.

---

## Release (Internal testing)

1. **Testing → Internal testing → Create new release.**
2. **App signing:** accept **Play App Signing** (Google holds the app-signing key; your EAS key is
   the upload key).
3. **Upload** `RightNow.aab`.
4. **Release name:** e.g. `1.0.0 (build N)` — versionCode is auto-set by CI (the Forgejo run
   number), so each new AAB has a higher code.
5. **Release notes:** "Initial internal test build."
6. **Testers:** create an email list, add your Google account (and any trusted testers), save.
7. **Review and roll out.** It's live for testers within minutes (no production review).
8. Share the **opt-in URL** Play gives you; install via the Play Store on the device.

### Optional: "Quickly share your app" (Internal app sharing)
A separate, instant channel for ad-hoc device checks — upload an AAB/APK and get a shareable link.
Good for one-off checks; the Internal testing track above is the proper path.

---

## Automating uploads later (EAS Submit)
After the **first manual upload** (Google requires it before API uploads), you can automate:
1. In Google Cloud, create a **service account**, grant it access in Play Console
   (Users & permissions → API access), download the JSON key.
2. `eas submit -p android --path RightNow.aab` (or wire it into the NAS CI after the AAB builds).

## What's still on you (can't be done from code)
- Create the Play Console account ($25) + identity verification.
- Provide the **feature graphic** + **screenshots**.
- Create the **test account** for App access, and the **tester email list**.
- Click through Content rating / Target audience / Data safety / Health declaration using the
  answers above.
