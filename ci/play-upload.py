#!/usr/bin/env python3
"""Upload an AAB to a Google Play track via the Play Developer API.

Deliberately stdlib + openssl only: the alternative is a third-party Action, and
this key can publish releases, so it does not get handed to code we do not read.
Reads the service account JSON from PLAY_SERVICE_ACCOUNT_JSON.

    python3 ci/play-upload.py out/RightNow.aab internal

The edit is committed only if every step succeeds; a failed run leaves no
half-applied release (an uncommitted edit just expires on Google's side).
"""
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

PACKAGE = "com.filipkin.rightnow"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
UPLOAD = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications"


def b64url(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=")


def access_token(sa):
    """Mint an OAuth token from the service account (RS256 JWT, signed by openssl)."""
    now = int(time.time())
    header = b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    claims = b64url(json.dumps({
        "iss": sa["client_email"],
        "scope": "https://www.googleapis.com/auth/androidpublisher",
        "aud": TOKEN_URL,
        "iat": now,
        "exp": now + 3600,
    }).encode())
    signing_input = header + b"." + claims

    with tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False) as key:
        key.write(sa["private_key"])
        key_path = key.name
    try:
        sig = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", key_path],
            input=signing_input, stdout=subprocess.PIPE, check=True,
        ).stdout
    finally:
        os.unlink(key_path)

    assertion = signing_input + b"." + b64url(sig)
    body = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": assertion.decode(),
    }).encode()
    with urllib.request.urlopen(urllib.request.Request(TOKEN_URL, data=body)) as r:
        return json.load(r)["access_token"]


def call(method, url, token, data=None, ctype="application/json"):
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token)
    if data is not None:
        req.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        # Google's error body says exactly what is wrong (wrong package, key not
        # granted release permission, duplicate versionCode). Print it, don't hide it.
        sys.exit("Play API {} {} -> {}\n{}".format(method, url, e.code, e.read().decode("utf-8", "replace")))


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: play-upload.py <path-to-aab> <track>")
    aab_path, track = sys.argv[1], sys.argv[2]
    raw = os.environ.get("PLAY_SERVICE_ACCOUNT_JSON", "")
    if not raw:
        sys.exit("PLAY_SERVICE_ACCOUNT_JSON is empty")
    token = access_token(json.loads(raw))

    edit_id = call("POST", "{}/{}/edits".format(API, PACKAGE), token, b"")["id"]

    with open(aab_path, "rb") as f:
        bundle = call(
            "POST",
            "{}/{}/edits/{}/bundles?uploadType=media".format(UPLOAD, PACKAGE, edit_id),
            token, f.read(), "application/octet-stream",
        )
    version_code = bundle["versionCode"]
    print("uploaded versionCode", version_code)

    call(
        "PUT", "{}/{}/edits/{}/tracks/{}".format(API, PACKAGE, edit_id, track), token,
        json.dumps({
            "track": track,
            "releases": [{"versionCodes": [str(version_code)], "status": "completed"}],
        }).encode(),
    )
    call("POST", "{}/{}/edits/{}:commit".format(API, PACKAGE, edit_id), token, b"")
    print("committed versionCode {} to the {} track".format(version_code, track))


if __name__ == "__main__":
    main()
