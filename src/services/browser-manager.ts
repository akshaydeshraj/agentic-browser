import { chromium, type BrowserContext } from "patchright";
import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { existsSync } from "fs";
import type { Session, CreateSessionRequest, Config } from "../types.js";

// Use real Chrome if available, fall back to Patchright's bundled Chromium
function detectChromeChannel(): "chrome" | "chromium" {
  const chromePaths = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
  ];
  for (const p of chromePaths) {
    if (existsSync(p)) return "chrome";
  }
  return "chromium";
}

interface ActiveSession extends Session {
  context: BrowserContext;
}

export class BrowserManager {
  private sessions = new Map<string, ActiveSession>();
  private profileToSession = new Map<string, string>();
  private usedPorts = new Set<number>();
  private basePort = 9223;

  constructor(private config: Config) {}

  private allocatePort(): number {
    let port = this.basePort;
    while (this.usedPorts.has(port)) port++;
    this.usedPorts.add(port);
    return port;
  }

  private validateProfileName(name: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error(
        `Invalid profile name: "${name}". Only alphanumeric, hyphens, and underscores allowed.`,
      );
    }
  }

  async createSession(req: CreateSessionRequest): Promise<Session> {
    this.validateProfileName(req.profileName);

    // Profile locking: return existing session if profile is already active
    const existingId = this.profileToSession.get(req.profileName);
    if (existingId) {
      const existing = this.sessions.get(existingId);
      if (existing) return this.toPublicSession(existing);
    }

    const id = randomUUID();
    const port = this.allocatePort();
    const profileDataDir = path.join(this.config.profilesDir, req.profileName);
    const nopechaPath = path.resolve(this.config.extensionsDir, "nopecha");

    await fs.mkdir(profileDataDir, { recursive: true });

    const channel = detectChromeChannel();
    console.log(`Launching browser with channel: ${channel}`);

    const context = await chromium.launchPersistentContext(profileDataDir, {
      channel,
      headless: false,
      viewport: null,
      ignoreDefaultArgs: ["--enable-automation"],
      args: [
        `--remote-debugging-port=${port}`,
        `--remote-debugging-address=127.0.0.1`,
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-setuid-sandbox",
        "--no-first-run",
        "--no-default-browser-check",
        `--disable-extensions-except=${nopechaPath}`,
        `--load-extension=${nopechaPath}`,
      ],
    });

    // Discover the actual CDP WebSocket URL from Chrome's debug endpoint
    const internalCdpWsUrl = await this.discoverCdpUrl(port);

    const session: ActiveSession = {
      id,
      profileName: req.profileName,
      cdpWsUrl: `/cdp/${id}`, // Relative path; routes prepend host
      internalCdpWsUrl,
      cdpPort: port,
      createdAt: new Date().toISOString(),
      status: "ready",
      context,
    };

    this.sessions.set(id, session);
    this.profileToSession.set(req.profileName, id);
    return this.toPublicSession(session);
  }

  private async discoverCdpUrl(port: number): Promise<string> {
    // Chrome exposes /json/version on the debugging port
    const maxRetries = 10;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        const data = (await res.json()) as { webSocketDebuggerUrl: string };
        if (data.webSocketDebuggerUrl) {
          return data.webSocketDebuggerUrl;
        }
      } catch {
        // Chrome may not be ready yet
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(
      `Failed to discover CDP WebSocket URL on port ${port} after ${maxRetries} retries`,
    );
  }

  async closeSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session not found: ${id}`);
    await session.context.close();
    this.usedPorts.delete(session.cdpPort);
    this.profileToSession.delete(session.profileName);
    this.sessions.delete(id);
  }

  listSessions(): Session[] {
    return [...this.sessions.values()].map((s) => this.toPublicSession(s));
  }

  getSession(id: string): Session | undefined {
    const s = this.sessions.get(id);
    return s ? this.toPublicSession(s) : undefined;
  }

  getInternalCdpUrl(id: string): string | undefined {
    return this.sessions.get(id)?.internalCdpWsUrl;
  }

  getBrowserContext(id: string): BrowserContext | undefined {
    return this.sessions.get(id)?.context;
  }

  private toPublicSession(s: ActiveSession): Session {
    const { context: _, ...pub } = s;
    return pub;
  }
}
