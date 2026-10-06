#!/usr/bin/env bash
# ============================================================================
# Screenshots of the iPhone app on a simulator, light and dark: the newest
# iPhone Pro Max this Mac has (the App Store's 6.9-inch size), the status bar
# at 9:41 with a full battery. The screens are in tests/ios/screenshots.yaml
# (Maestro taps through them); without Maestro, only the first screen.
#
#   scripts/ios-screenshots.sh <App.app> <folder>
#
# On GitHub's Macs: .github/workflows/ios.yml. On a Mac: build for a
# simulator first (README, "iPhone"), and install Maestro for the taps.
# ============================================================================
set -euo pipefail
APP=$1
OUT=$(mkdir -p "$2" && cd "$2" && pwd)
BUNDLE=com.matchgpt.app
FLOW="$(cd "$(dirname "$0")/.." && pwd)/tests/ios/screenshots.yaml"

# The newest iOS, and on it the newest iPhone Pro Max (else the newest iPhone)
read -r UDID NAME < <(xcrun simctl list devices available --json | python3 -c '
import json, re, sys
devices = json.load(sys.stdin)["devices"]
def version(runtime):
    m = re.search(r"iOS-(\d+)-(\d+)", runtime)
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)
for runtime in sorted(devices, key=version, reverse=True):
    phones = [d for d in devices[runtime] if d["name"].startswith("iPhone")]
    if phones:
        pick = ([d for d in phones if "Pro Max" in d["name"]] or phones)[-1]
        name, ios = pick["name"], ".".join(map(str, version(runtime)))
        print(pick["udid"], f"{name} (iOS {ios})")
        break
')
echo "Simulator: $NAME"
echo "$NAME" > "$OUT/device.txt"

xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b
xcrun simctl status_bar "$UDID" override --time 9:41 --dataNetwork wifi --wifiMode active --wifiBars 3 \
  --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
xcrun simctl install "$UDID" "$APP"

WORK=$(mktemp -d)
for look in light dark; do
  xcrun simctl ui "$UDID" appearance "$look"
  if command -v maestro >/dev/null; then
    (cd "$WORK" && maestro --device "$UDID" test -e LOOK="$look" "$FLOW") \
      || echo "::warning::Maestro stopped partway through the screens ($look)"
    # Maestro saves them where it ran, next to the flow, or in its own folder, by version
    find "$WORK" "$(dirname "$FLOW")" "$HOME/.maestro/tests" -name "$look-*.png" -exec cp {} "$OUT/" \; 2>/dev/null || true
  fi
  if ! ls "$OUT/$look-"*.png >/dev/null 2>&1; then
    echo "::warning::No screenshots from Maestro ($look): saving the first screen only"
    xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
    xcrun simctl launch "$UDID" "$BUNDLE"
    sleep 20
    xcrun simctl io "$UDID" screenshot "$OUT/$look-1-welcome.png"
  fi
done
xcrun simctl shutdown "$UDID" || true
ls -la "$OUT"
