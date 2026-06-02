#!/bin/sh
# Publish out/RightNow.apk to the repo's moving "android-latest" release, giving a
# stable direct-download URL for sideloading. Used by .forgejo/workflows/android.yml
# (Forgejo doesn't support actions/upload-artifact@v4). Expects PUBLISH_TOKEN in env
# and git.filipkin.com resolvable (the workflow pins it to the LAN nginx first).
set -u

API="https://git.filipkin.com/api/v1/repos/filip/RightNow"
AUTH="Authorization: token ${PUBLISH_TOKEN}"

# Drop any existing release + tag so the asset name stays clean across rebuilds.
RID=$(curl -fsS -H "$AUTH" "$API/releases/tags/android-latest" 2>/dev/null | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
[ -n "$RID" ] && curl -fsS -X DELETE -H "$AUTH" "$API/releases/$RID" >/dev/null 2>&1
curl -fsS -X DELETE -H "$AUTH" "$API/tags/android-latest" >/dev/null 2>&1

# Fresh release pointing at the built commit.
RID=$(curl -fsS -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"tag_name":"android-latest","target_commitish":"main","name":"Android test build","prerelease":true,"body":"Sideloadable release-signed APKs (EAS-managed upload key), rebuilt from main on each android-apk run. RightNow.apk = phone (arm64-v8a, Pixel 9 Pro). RightNow-wear.apk = Wear OS companion (Pixel Watch 3)."}' \
  "$API/releases" 2>/dev/null | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
if [ -z "$RID" ]; then echo "ERROR: could not create release"; exit 1; fi

curl -fsS -X POST -H "$AUTH" \
  -F "attachment=@out/RightNow.apk;filename=RightNow.apk;type=application/vnd.android.package-archive" \
  "$API/releases/$RID/assets?name=RightNow.apk" >/dev/null \
  || { echo "ERROR: asset upload failed"; exit 1; }

# Play AAB (upload this to the Play Console internal-testing track).
if [ -f out/RightNow.aab ]; then
  curl -fsS -X POST -H "$AUTH" \
    -F "attachment=@out/RightNow.aab;filename=RightNow.aab;type=application/octet-stream" \
    "$API/releases/$RID/assets?name=RightNow.aab" >/dev/null \
    || { echo "ERROR: aab upload failed"; exit 1; }
fi

# Wear OS companion APK (sideload to the Pixel Watch 3 over wireless ADB).
if [ -f out/RightNow-wear.apk ]; then
  curl -fsS -X POST -H "$AUTH" \
    -F "attachment=@out/RightNow-wear.apk;filename=RightNow-wear.apk;type=application/vnd.android.package-archive" \
    "$API/releases/$RID/assets?name=RightNow-wear.apk" >/dev/null \
    || { echo "ERROR: wear asset upload failed"; exit 1; }
fi

echo "Published RightNow.apk + RightNow-wear.apk -> https://git.filipkin.com/filip/RightNow/releases/tag/android-latest"
