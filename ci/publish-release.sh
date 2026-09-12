#!/bin/sh
# Publish the built phone + wear artifacts to the repo's moving "android-latest"
# release, giving a stable direct-download URL for sideloading. GitHub replacement
# for the old Forgejo publish-apk.sh (the forge is a container registry only now).
# Expects GITHUB_TOKEN + GITHUB_REPOSITORY in env; the workflow grants contents:write.
set -u

API="https://api.github.com/repos/${GITHUB_REPOSITORY}"
UPLOAD="https://uploads.github.com/repos/${GITHUB_REPOSITORY}"
AUTH="Authorization: Bearer ${GITHUB_TOKEN}"
JSON="Accept: application/vnd.github+json"

# Drop any existing release + tag so the asset names stay clean across rebuilds
# (GitHub refuses a second asset with the same name on one release).
RID=$(curl -fsS -H "$AUTH" -H "$JSON" "$API/releases/tags/android-latest" 2>/dev/null | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
[ -n "$RID" ] && curl -fsS -X DELETE -H "$AUTH" -H "$JSON" "$API/releases/$RID" >/dev/null 2>&1
curl -fsS -X DELETE -H "$AUTH" -H "$JSON" "$API/git/refs/tags/android-latest" >/dev/null 2>&1

# Fresh release pointing at the built commit.
RID=$(curl -fsS -X POST -H "$AUTH" -H "$JSON" -H "Content-Type: application/json" \
  -d "{\"tag_name\":\"android-latest\",\"target_commitish\":\"${GITHUB_SHA}\",\"name\":\"Android test build\",\"prerelease\":true,\"body\":\"Built from main on each android-apk run, release-signed with the EAS-managed upload key. RightNow.aab = Play upload (phone; currently arm64-v8a only). RightNow.apk = sideload (phone, arm64-v8a, Pixel 9 Pro). RightNow-wear.apk = Wear OS companion sideload (Pixel Watch 3).\"}" \
  "$API/releases" 2>/dev/null | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
if [ -z "$RID" ]; then echo "ERROR: could not create release"; exit 1; fi

# name -> mime. The phone APK is required; the rest are uploaded when present.
upload() {
  f="out/$1"
  [ -f "$f" ] || return 0
  curl -fsS -X POST -H "$AUTH" -H "$JSON" -H "Content-Type: $2" \
    --data-binary "@$f" "$UPLOAD/releases/$RID/assets?name=$1" >/dev/null \
    || { echo "ERROR: upload failed for $1"; exit 1; }
}

APK=application/vnd.android.package-archive
upload RightNow.apk "$APK"
[ -f out/RightNow.apk ] || { echo "ERROR: out/RightNow.apk missing"; exit 1; }
upload RightNow.aab application/octet-stream          # Play upload (phone)
upload RightNow-wear.apk "$APK"                       # Wear OS sideload
upload RightNow-wear.aab application/octet-stream      # Play "Wear OS" form-factor track

echo "Published phone + wear (APK + AAB) -> https://github.com/${GITHUB_REPOSITORY}/releases/tag/android-latest"
