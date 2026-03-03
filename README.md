# Agentic Browser

Self-hosted stealth browser service for AI agents. Provides CDP (Chrome DevTools Protocol) access with anti-detection and captcha solving built in.

## Features

- **Stealth browsing** — Patchright (Playwright fork) removes CDP automation leaks. Headed Chrome on Xvfb for authentic canvas/WebGL fingerprints.
- **Captcha solving** — NopeCHA extension (primary, auto-solves in background) + 2captcha API (fallback for hard cases). Supports reCAPTCHA v2/v3, hCaptcha, and Cloudflare Turnstile.
- **Persistent profiles** — Each profile gets its own Chrome user data dir. Cookies, localStorage, and sessions persist across restarts.
- **CDP WebSocket proxy** — Single port (3000) for both REST API and WebSocket. Agents connect via `ws://host:3000/cdp/:sessionId`.
- **Proxy support** — Pass a proxy URL (residential, SOCKS5, etc.) per session. The browser routes all traffic through it.
- **Recipe system** — CRUD API for reusable browser automation flows. Agents create step-based JSON recipes, store them, and execute them against sessions with template params.
- **Docker-ready** — Ships with Dockerfile and docker-compose.yml for deployment via Coolify or any Docker host.

## OpenClaw Skill

This project ships with a [`SKILL.md`](./SKILL.md) — an [OpenClaw](https://openclaw.org) skill definition that lets any compatible AI agent drive this browser service directly. Agents get structured access to sessions, profiles, captcha solving, and recipes without manual API wiring.

## Quick Start

### Local Development

```bash
# Install dependencies
npm install
npx patchright install chromium

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Run
npm run dev
```

### Docker

```bash
cp .env.example .env
# Edit .env with your API keys

docker compose up --build
```

### Coolify

1. Push repo to GitHub
2. Add service → Docker Compose → point to repo
3. Set env vars: `API_TOKEN`, `TWOCAPTCHA_API_KEY`, `NOPECHA_API_KEY`
4. Deploy

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `API_TOKEN` | Yes | Bearer token for API authentication |
| `TWOCAPTCHA_API_KEY` | Yes | [2captcha](https://2captcha.com) API key for captcha fallback |
| `NOPECHA_API_KEY` | No | [NopeCHA](https://nopecha.com) API key. Free tier (100 solves/day from residential IPs) works without a key |
| `PROFILES_DIR` | No | Profile storage directory (default: `/data/profiles`) |
| `EXTENSIONS_DIR` | No | Extensions directory (default: `./extensions`) |
| `RECIPES_DIR` | No | Recipe storage directory (default: `./data/recipes`) |
| `PORT` | No | Server port (default: `3000`) |

## API

All endpoints (except `/health`) require `Authorization: Bearer <API_TOKEN>` header.

### Sessions

```bash
# Create a session (basic)
curl -X POST http://localhost:3000/sessions \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"profileName": "twitter"}'
# Returns: { "id": "...", "cdpWsUrl": "ws://localhost:3000/cdp/<id>", ... }

# Create a session with proxy, geolocation, timezone
curl -X POST http://localhost:3000/sessions \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "profileName": "instagram",
    "proxy": {"server": "http://resi-proxy:8080", "username": "u", "password": "p"},
    "geolocation": {"latitude": 37.77, "longitude": -122.42},
    "timezone": "America/Los_Angeles",
    "locale": "en-US",
    "userAgent": "Mozilla/5.0 ..."
  }'

# List sessions
curl http://localhost:3000/sessions \
  -H "Authorization: Bearer $API_TOKEN"

# Get session
curl http://localhost:3000/sessions/:id \
  -H "Authorization: Bearer $API_TOKEN"

# Close session
curl -X DELETE http://localhost:3000/sessions/:id \
  -H "Authorization: Bearer $API_TOKEN"
```

### Captcha Solving (2captcha fallback)

NopeCHA auto-solves most captchas in the background. Use this endpoint when NopeCHA doesn't solve in time.

```bash
curl -X POST http://localhost:3000/sessions/:id/solve-captcha \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "recaptcha_v2", "pageUrl": "https://example.com"}'
# Returns: { "token": "...", "captchaId": "...", "type": "recaptcha_v2" }
```

Supported types: `recaptcha_v2`, `recaptcha_v3`, `hcaptcha`, `turnstile`, `auto` (auto-detect from page DOM).

### Profiles

```bash
# List profiles
curl http://localhost:3000/profiles \
  -H "Authorization: Bearer $API_TOKEN"

# Create profile
curl -X POST http://localhost:3000/profiles \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "instagram"}'

# Delete profile
curl -X DELETE http://localhost:3000/profiles/instagram \
  -H "Authorization: Bearer $API_TOKEN"
```

### Recipes (CRUD + Execute)

Agents can create, store, and reuse browser automation flows as step-based JSON.

```bash
# List recipes
curl http://localhost:3000/recipes \
  -H "Authorization: Bearer $API_TOKEN"

# Get recipe details
curl http://localhost:3000/recipes/generic-login \
  -H "Authorization: Bearer $API_TOKEN"

# Create a recipe
curl -X POST http://localhost:3000/recipes \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "login-twitter",
    "description": "Log in to Twitter/X",
    "steps": [
      {"action": "goto", "url": "{{loginUrl}}"},
      {"action": "fill", "selector": "input[name=username]", "value": "{{username}}"},
      {"action": "click", "selector": "button:has-text(Next)"},
      {"action": "wait", "ms": 1500},
      {"action": "fill", "selector": "input[name=password]", "value": "{{password}}"},
      {"action": "click", "selector": "button:has-text(Log in)", "waitForUrl": "**/home"}
    ],
    "params": {
      "loginUrl": {"required": true, "default": "https://x.com/login"},
      "username": {"required": true},
      "password": {"required": true}
    }
  }'

# Execute a recipe against a session
curl -X POST http://localhost:3000/sessions/:id/recipes/login-twitter \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "myuser", "password": "mypass"}'
# Returns: { "success": true, "stepsCompleted": 6, "data": {"finalUrl": "..."} }

# Delete a recipe
curl -X DELETE http://localhost:3000/recipes/login-twitter \
  -H "Authorization: Bearer $API_TOKEN"
```

**Supported step actions:** `goto`, `fill` (clears first), `type` (human-like, appends), `click` (optional `waitForUrl`), `wait`, `waitForSelector`, `screenshot`, `select`

All `selector`, `value`, and `url` fields support `{{paramName}}` template substitution.

### Health

```bash
curl http://localhost:3000/health
# Returns: { "status": "ok" }
```

## Connecting from AI Agents

### Playwright / Patchright

```typescript
import { chromium } from "playwright"; // or "patchright"

const browser = await chromium.connectOverCDP("ws://host:3000/cdp/<sessionId>");
const context = browser.contexts()[0];
const page = context.pages()[0];
await page.goto("https://example.com");
```

### Puppeteer

```javascript
const browser = await puppeteer.connect({
  browserWSEndpoint: "ws://host:3000/cdp/<sessionId>",
});
```

### browser-use / cdp-use

Pass the CDP WebSocket URL from the session response to your agent framework.

## Architecture

```
AI Agent (Playwright / Puppeteer / browser-use)
    │
    ▼
ws://host:3000/cdp/:sessionId  (WebSocket proxy)
  + REST API on port 3000       (Bearer auth)
    │
    ▼
WebSocket Proxy → internal Chrome CDP (127.0.0.1 only)
    │
    ▼
Browser Manager (Patchright)
  ├── Headed Chrome on Xvfb (Docker) or native display
  ├── Persistent profile per session
  ├── NopeCHA extension (auto captcha solving)
  └── CDP bound to 127.0.0.1 (never exposed)
```

## Stack

- **Runtime**: Node.js + Hono (HTTP framework)
- **Browser**: Patchright (stealth Playwright fork)
- **Captcha**: NopeCHA extension + 2captcha API
- **Display**: Xvfb (virtual display in Docker)
- **Proxy**: Raw WebSocket proxy on single port

## Project Structure

```
src/
├── index.ts                 # Server entry point
├── config.ts                # Environment config
├── types.ts                 # TypeScript interfaces
├── middleware/auth.ts        # Bearer token auth
├── routes/
│   ├── sessions.ts          # Session CRUD
│   ├── captcha.ts           # Captcha solving endpoint
│   └── recipes.ts           # Recipe CRUD + execution
└── services/
    ├── browser-manager.ts   # Patchright lifecycle + CDP
    ├── profile-manager.ts   # Profile directory CRUD
    ├── captcha-solver.ts    # 2captcha integration
    ├── recipe-store.ts      # File-based recipe CRUD
    ├── recipe-runner.ts     # Step executor with template substitution
    └── ws-proxy.ts          # WebSocket CDP proxy
data/recipes/                # Stored recipes (JSON files)
extensions/nopecha/          # NopeCHA browser extension
docker/entrypoint.sh         # Xvfb + dbus startup
```
