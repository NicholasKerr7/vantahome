#!/usr/bin/env python3
"""Package an authenticated staging preview while restoring production metadata."""

import argparse
import base64
import fcntl
import json
import os
from pathlib import Path
import plistlib
import re
import signal
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
STAGING_URL = "https://dcevusczjtmdpzrxpdou.supabase.co"
PUBLIC_KEYS = {
    "EXPO_PUBLIC_APP_VARIANT", "EXPO_PUBLIC_VANTA_MODE",
    "EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    "EXPO_PUBLIC_ENABLE_3D_HOME", "EXPO_PUBLIC_ENABLE_RENDERER_LAB",
}


def read_preview_environment(filename):
    """Accept only client-public staging configuration; reject privileged JWTs."""
    values = {}
    for raw in Path(filename).read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or key not in PUBLIC_KEYS or key in values:
            raise ValueError("Preview environment has an unsupported or duplicate setting.")
        values[key] = value
    if (values.get("EXPO_PUBLIC_APP_VARIANT") != "preview"
            or values.get("EXPO_PUBLIC_VANTA_MODE") != "development"
            or values.get("EXPO_PUBLIC_SUPABASE_URL") != STAGING_URL):
        raise ValueError("This build requires the isolated development preview and staging backend.")
    key = values.get("EXPO_PUBLIC_SUPABASE_ANON_KEY", "")
    if not key.startswith("sb_publishable_"):
        try:
            payload = key.split(".")[1]
            claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        except (IndexError, ValueError):
            raise ValueError("A public staging API key is required.") from None
        if claims.get("role") != "anon" or claims.get("ref") != STAGING_URL.split("//")[1].split(".")[0]:
            raise ValueError("Only the staging anonymous API key may enter this build.")
    return values


def preview_metadata(originals, identity, build_number):
    """Derive mutually consistent Expo, plist and Xcode preview identities."""
    config = json.loads(originals["app.json"])
    info = plistlib.loads(originals["ios/vantahome/Info.plist"])
    project = originals["ios/vantahome.xcodeproj/project.pbxproj"].decode()
    if config["expo"]["ios"]["bundleIdentifier"] != "com.anonymous.vantahome":
        raise ValueError("Refusing to replace nonproduction source metadata.")
    if project.count("PRODUCT_BUNDLE_IDENTIFIER = com.anonymous.vantahome;") != 2:
        raise ValueError("Unexpected native targets; review preview signing configuration.")
    config["expo"].update(name=identity["displayName"], scheme=identity["scheme"])
    config["expo"]["ios"].update(bundleIdentifier=identity["bundleIdentifier"], buildNumber=str(build_number))
    info["CFBundleDisplayName"] = identity["displayName"]
    info["CFBundleVersion"] = str(build_number)
    info["CFBundleURLTypes"] = [{"CFBundleURLSchemes": [identity["scheme"], identity["bundleIdentifier"]]}]
    project = project.replace("PRODUCT_BUNDLE_IDENTIFIER = com.anonymous.vantahome;",
                              f'PRODUCT_BUNDLE_IDENTIFIER = {identity["bundleIdentifier"]};')
    project = re.sub(r"CURRENT_PROJECT_VERSION = [^;]+;", f"CURRENT_PROJECT_VERSION = {build_number};", project)
    return {
        "app.json": (json.dumps(config, indent=2) + "\n").encode(),
        "ios/vantahome/Info.plist": plistlib.dumps(info, sort_keys=False),
        "ios/vantahome.xcodeproj/project.pbxproj": project.encode(),
    }


def main():
    """Run checked preview packaging under a lock and restore source bytes on exit."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", required=True)
    parser.add_argument("--build-number", type=int, required=True)
    parser.add_argument("--team-id", required=True)
    parser.add_argument("--derived-data", required=True)
    parser.add_argument("--log", required=True)
    args = parser.parse_args()
    if args.build_number < 1 or not re.fullmatch(r"[A-Z0-9]{10}", args.team_id):
        parser.error("Use a positive build number and a valid Apple team ID.")
    public = read_preview_environment(args.env_file)
    environment = {key: value for key, value in os.environ.items()
                   if not key.startswith(("EXPO_PUBLIC_", "SUPABASE_"))}
    environment.update(public, EXPO_NO_DOTENV="1", SENTRY_DISABLE_AUTO_UPLOAD="true")
    identity = json.loads(subprocess.check_output([
        "node", "-e", "console.log(JSON.stringify(require('./src/config/appVariant').resolveAppVariant('preview')))"
    ], cwd=ROOT, text=True))
    paths = ["app.json", "ios/vantahome/Info.plist", "ios/vantahome.xcodeproj/project.pbxproj"]
    (ROOT / ".expo").mkdir(exist_ok=True)
    with (ROOT / ".expo/preview-build.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        originals = {name: (ROOT / name).read_bytes() for name in paths}
        replacements = preview_metadata(originals, identity, args.build_number)
        # Normal termination must restore metadata just like a keyboard interrupt.
        previous_handler = signal.signal(signal.SIGTERM, handle_termination)
        try:
            for name, content in replacements.items():
                (ROOT / name).write_bytes(content)
            for script in ["check-auth-redirects.js", "check-release-version.js", "patch-security-dependencies.js"]:
                command = ["node", f"scripts/{script}"]
                if script == "patch-security-dependencies.js":
                    command.append("--check")
                subprocess.run(command, cwd=ROOT, env=environment, check=True)
            with tempfile.TemporaryDirectory(prefix="vanta-preview-signing-") as temp:
                entitlements = Path(temp) / "preview.entitlements"
                entitlements.write_bytes(plistlib.dumps({}))
                with Path(args.log).open("w") as log:
                    subprocess.run([
                        "xcodebuild", "-jobs", "4", "-workspace", "ios/vantahome.xcworkspace",
                        "-scheme", "vantahome", "-configuration", "Release",
                        "-destination", "generic/platform=iOS", "-derivedDataPath", args.derived_data,
                        f"DEVELOPMENT_TEAM={args.team_id}", "CODE_SIGN_STYLE=Automatic",
                        f"CODE_SIGN_ENTITLEMENTS={entitlements}", "IPHONEOS_DEPLOYMENT_TARGET=15.1",
                        "-allowProvisioningUpdates", "build",
                    ], cwd=ROOT, env=environment, stdout=log, stderr=subprocess.STDOUT, check=True)
        finally:
            for name, content in originals.items():
                (ROOT / name).write_bytes(content)
            signal.signal(signal.SIGTERM, previous_handler)
    print(f"Preview {args.build_number} packaged; production metadata restored.")


def handle_termination(_signal_number, _frame):
    """Turn SIGTERM into a controlled exit so metadata restoration still runs."""
    raise KeyboardInterrupt("Preview packaging was terminated.")


if __name__ == "__main__":
    main()
