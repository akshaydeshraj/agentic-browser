import { Hono } from "hono";
import type { BrowserManager } from "../services/browser-manager.js";

export function createSessionRoutes(browserManager: BrowserManager) {
  const app = new Hono();

  app.post("/", async (c) => {
    const body = await c.req.json<{ profileName?: string }>();
    if (!body.profileName) {
      return c.json({ error: "profileName is required" }, 400);
    }

    const session = await browserManager.createSession({
      profileName: body.profileName,
    });

    // Build the external CDP WebSocket URL
    const host = c.req.header("host") ?? "localhost:3000";
    const protocol = c.req.header("x-forwarded-proto") === "https" ? "wss" : "ws";
    session.cdpWsUrl = `${protocol}://${host}/cdp/${session.id}`;

    return c.json(session, 201);
  });

  app.get("/", (c) => {
    return c.json(browserManager.listSessions());
  });

  app.get("/:id", (c) => {
    const session = browserManager.getSession(c.req.param("id"));
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json(session);
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
