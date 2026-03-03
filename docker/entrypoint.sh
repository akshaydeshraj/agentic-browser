#!/bin/bash
set -e

# Start Xvfb virtual display
# Chrome in "headed" mode on a virtual display = stealth without a physical monitor
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset &
XVFB_PID=$!

export DISPLAY=:99

# Wait for Xvfb to be ready
sleep 1

# Start dbus session (some Chrome features need it)
eval $(dbus-launch --sh-syntax) || true

# Patch NopeCHA extension with API key at runtime
if [ -n "$NOPECHA_API_KEY" ] && [ -f "/app/extensions/nopecha/manifest.json" ]; then
  # Use node to safely patch JSON (no jq dependency needed)
  node -e "
    const fs = require('fs');
    const p = '/app/extensions/nopecha/manifest.json';
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    m.nopecha.key = process.env.NOPECHA_API_KEY;
    fs.writeFileSync(p, JSON.stringify(m, null, 2));
  "
  echo "NopeCHA API key configured"
fi

echo "Xvfb started on :99, launching service..."

# Execute the main command (node dist/index.js)
exec "$@"
