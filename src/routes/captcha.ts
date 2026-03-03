import { Hono } from "hono";
import type { BrowserManager } from "../services/browser-manager.js";
import type { CaptchaSolver } from "../services/captcha-solver.js";
import type { SolveCaptchaRequest } from "../types.js";

export function createCaptchaRoutes(
  browserManager: BrowserManager,
  captchaSolver: CaptchaSolver,
) {
  const app = new Hono();

  app.post("/:id/solve-captcha", async (c) => {
    const id = c.req.param("id");
    const req = await c.req.json<SolveCaptchaRequest>();

    const context = browserManager.getBrowserContext(id);
    if (!context) return c.json({ error: "Session not found" }, 404);

    try {
      const result = await captchaSolver.solve(context, req);
      return c.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: message }, 422);
    }
  });

  return app;
}
