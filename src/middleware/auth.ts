import { createMiddleware } from "hono/factory";

export function createAuthMiddleware(apiToken: string) {
  return createMiddleware(async (c, next) => {
    const authHeader = c.req.header("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token || token !== apiToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  });
}
