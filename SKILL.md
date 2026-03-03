---
name: agentic-browser
description: Control a self-hosted stealth browser service for anti-detection browsing, captcha solving, persistent profiles, and automated recipes. Use when agents need to browse sites that block bots (Instagram, LinkedIn, Twitter), solve captchas, or maintain logged-in sessions across restarts.
---

# Agentic Browser

Self-hosted stealth browser (Patchright + real Chrome on Xvfb) with captcha solving and persistent profiles.

## Setup

The service runs as a Docker container. Set these environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `API_TOKEN` | Yes | Bearer token for API auth |
| `TWOCAPTCHA_API_KEY` | Yes | 2captcha API key for captcha fallback |
| `NOPECHA_API_KEY` | No | NopeCHA key for auto-solving extension |
| `PROFILES_DIR` | No | Profile storage (default: `/data/profiles`) |
| `RECIPES_DIR` | No | Recipe storage (default: `./data/recipes`) |
| `PORT` | No | Server port (default: `3000`) |

All endpoints (except `/health`) require `Authorization: Bearer <API_TOKEN>`.

## Connection

```bash
# Set these for your deployment
AB_TOKEN="your-api-token"
AB_URL="http://agentic-browser:3000"  # Container hostname, or localhost:<port>
```

## Sessions

A session launches a Chrome instance with a specific profile. One session per profile at a time (returns existing if already active).

### Create Session
```bash
curl -s -X POST -H "Authorization: Bearer $AB_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "profileName": "my-profile",
    "proxy": {"server": "socks5://proxy:1080", "username": "u", "password": "p"},
    "geolocation": {"latitude": 37.77, "longitude": -122.42},
    "timezone": "America/Los_Angeles",
    "locale": "en-US",
    "userAgent": "Mozilla/5.0 ..."
  }' $AB_URL/sessions
# Returns: { "id": "...", "cdpWsUrl": "ws://host:3000/cdp/<id>", ... }
```

Only `profileName` is required. Proxy, geo, timezone, locale, userAgent are optional.

### List Sessions
```bash
curl -s -H "Authorization: Bearer $AB_TOKEN" $AB_URL/sessions | jq
```

### Close Session
```bash
curl -s -X DELETE -H "Authorization: Bearer $AB_TOKEN" $AB_URL/sessions/<session-id>
```

## CDP WebSocket Access

After creating a session, connect any CDP-compatible tool:

```
ws://host:3000/cdp/<sessionId>?token=<API_TOKEN>
```

```typescript
// Playwright / Patchright
const browser = await chromium.connectOverCDP(cdpWsUrl);
const context = browser.contexts()[0];
const page = context.pages()[0];
await page.goto("https://instagram.com");
```

```javascript
// Puppeteer
const browser = await puppeteer.connect({ browserWSEndpoint: cdpWsUrl });
```

## Captcha Solving

NopeCHA auto-solves most captchas in background. For hard cases, use the 2captcha fallback:

```bash
curl -s -X POST -H "Authorization: Bearer $AB_TOKEN" -H "Content-Type: application/json" \
  -d '{"type": "auto", "pageUrl": "https://example.com"}' \
  $AB_URL/sessions/<session-id>/solve-captcha
# Returns: { "token": "...", "captchaId": "...", "type": "recaptcha_v2" }
```

Supported types: `recaptcha_v2`, `recaptcha_v3`, `hcaptcha`, `turnstile`, `auto` (detect from DOM).

## Profiles

```bash
# List
curl -s -H "Authorization: Bearer $AB_TOKEN" $AB_URL/profiles | jq

# Create
curl -s -X POST -H "Authorization: Bearer $AB_TOKEN" -H "Content-Type: application/json" \
  -d '{"name": "instagram"}' $AB_URL/profiles

# Delete
curl -s -X DELETE -H "Authorization: Bearer $AB_TOKEN" $AB_URL/profiles/instagram
```

## Recipes

Reusable browser automation workflows with templated parameters.

### CRUD
```bash
# List recipes
curl -s -H "Authorization: Bearer $AB_TOKEN" $AB_URL/recipes | jq

# Get recipe
curl -s -H "Authorization: Bearer $AB_TOKEN" $AB_URL/recipes/generic-login | jq

# Create recipe
curl -s -X POST -H "Authorization: Bearer $AB_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "name": "instagram-login",
    "description": "Log into Instagram",
    "steps": [
      {"action": "goto", "url": "https://www.instagram.com/accounts/login/"},
      {"action": "wait", "ms": 2000},
      {"action": "fill", "selector": "input[name=\"username\"]", "value": "{{username}}"},
      {"action": "fill", "selector": "input[name=\"password\"]", "value": "{{password}}"},
      {"action": "click", "selector": "button[type=\"submit\"]"},
      {"action": "waitForSelector", "selector": "svg[aria-label=\"Home\"]", "timeout": 15000}
    ],
    "params": {
      "username": {"required": true, "description": "Instagram username"},
      "password": {"required": true, "description": "Instagram password"}
    }
  }' $AB_URL/recipes

# Delete recipe
curl -s -X DELETE -H "Authorization: Bearer $AB_TOKEN" $AB_URL/recipes/instagram-login
```

### Execute Recipe
```bash
curl -s -X POST -H "Authorization: Bearer $AB_TOKEN" -H "Content-Type: application/json" \
  -d '{"username": "myuser", "password": "mypass"}' \
  $AB_URL/sessions/<session-id>/recipes/instagram-login
# Returns: { "success": true, "stepsCompleted": 6, "data": {"finalUrl": "..."} }
```

### Step Actions

| Action | Fields | Description |
|--------|--------|-------------|
| `goto` | `url` | Navigate to URL |
| `fill` | `selector`, `value` | Clear field and fill |
| `type` | `selector`, `value`, `delay?` | Type with keystrokes (default 80ms) |
| `click` | `selector`, `waitForUrl?` | Click, optionally wait for navigation |
| `wait` | `ms` | Wait fixed time |
| `waitForSelector` | `selector`, `timeout?` | Wait for element (default 30s) |
| `select` | `selector`, `value` | Select dropdown option |
| `screenshot` | — | Capture screenshot (base64 in `data.screenshot`) |
| `evaluate` | `value` | Execute JS, result in `data.evaluateResult` |

All steps (except `wait`) have configurable `timeout` (default 30s). Template vars use `{{paramName}}` syntax.

### Built-in Recipes
- `generic-login` — Fill username/password and submit (configurable selectors)
- `google-search` — Search Google and wait for results

## Health Check
```bash
curl -s $AB_URL/health
# { "status": "ok" }
```
