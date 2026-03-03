import { Hono } from "hono";
import type { Context } from "hono";
import type { BrowserManager } from "../services/browser-manager.js";
import type { Session, CreateSessionRequest } from "../types.js";

function withFullCdpUrl(c: Context, session: Session): Session {
  const host = c.req.header("host") ?? "localhost:3000";
  const protocol =
    c.req.header("x-forwarded-proto") === "https" ? "wss" : "ws";
  return { ...session, cdpWsUrl: `${protocol}://${host}/cdp/${session.id}` };
}

function parseSessionRequest(body: Record<string, unknown>): CreateSessionRequest | string {
  if (!body.profileName || typeof body.profileName !== "string") {
    return "profileName is required";
  }
  const req: CreateSessionRequest = { profileName: body.profileName };
  if (body.proxy !== undefined) {
    if (typeof body.proxy !== "object" || body.proxy === null || typeof (body.proxy as any).server !== "string") {
      return "proxy must be an object with a 'server' string";
    }
    req.proxy = body.proxy as CreateSessionRequest["proxy"];
  }
  if (body.geolocation !== undefined) {
    const geo = body.geolocation as any;
    if (typeof geo !== "object" || geo === null || typeof geo.latitude !== "number" || typeof geo.longitude !== "number") {
      return "geolocation must have numeric latitude and longitude";
    }
    req.geolocation = geo;
  }
  if (body.timezone !== undefined) {
    if (typeof body.timezone !== "string") return "timezone must be a string";
    req.timezone = body.timezone;
  }
  if (body.locale !== undefined) {
    if (typeof body.locale !== "string") return "locale must be a string";
    req.locale = body.locale;
  }
  if (body.userAgent !== undefined) {
    if (typeof body.userAgent !== "string") return "userAgent must be a string";
    req.userAgent = body.userAgent;
  }
  return req;
}

export function createSessionRoutes(browserManager: BrowserManager) {
  const app = new Hono();

  app.post("/", async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const reqOrError = parseSessionRequest(body);
    if (typeof reqOrError === "string") {
      return c.json({ error: reqOrError }, 400);
    }

    const session = await browserManager.createSession(reqOrError);

    return c.json(withFullCdpUrl(c, session), 201);
  });

  app.get("/", (c) => {
    const sessions = browserManager
      .listSessions()
      .map((s) => withFullCdpUrl(c, s));
    return c.json(sessions);
  });

  app.get("/:id", (c) => {
    const session = browserManager.getSession(c.req.param("id"));
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json(withFullCdpUrl(c, session));
  });

  app.delete("/:id", async (c) => {
    try {
      await browserManager.closeSession(c.req.param("id"));
      return c.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: message }, 404);
    }
  });

  return app;
}
