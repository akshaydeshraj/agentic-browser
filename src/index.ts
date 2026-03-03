import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { BrowserManager } from "./services/browser-manager.js";
import { ProfileManager } from "./services/profile-manager.js";
import { CaptchaSolver } from "./services/captcha-solver.js";
import { WsProxy } from "./services/ws-proxy.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createSessionRoutes } from "./routes/sessions.js";
import { createCaptchaRoutes } from "./routes/captcha.js";
import { RecipeStore } from "./services/recipe-store.js";
import {
  createRecipeRoutes,
  createRecipeExecRoutes,
} from "./routes/recipes.js";

const config = loadConfig();
const browserManager = new BrowserManager(config);
const profileManager = new ProfileManager(config.profilesDir);
const captchaSolver = new CaptchaSolver(config.twoCaptchaApiKey);
const wsProxy = new WsProxy(browserManager, config.apiToken);
const recipeStore = new RecipeStore(config.recipesDir);

const app = new Hono();
const auth = createAuthMiddleware(config.apiToken);

// Health check (no auth)
app.get("/health", (c) => c.json({ status: "ok" }));

// Session routes (auth required)
app.use("/sessions/*", auth);
app.route("/sessions", createSessionRoutes(browserManager));
app.route("/sessions", createCaptchaRoutes(browserManager, captchaSolver));
app.route("/sessions", createRecipeExecRoutes(recipeStore, browserManager));

// Recipe CRUD routes (auth required)
app.use("/recipes/*", auth);
app.route("/recipes", createRecipeRoutes(recipeStore));

// Profile routes (auth required)
app.use("/profiles/*", auth);
app.get("/profiles", async (c) => {
  const profiles = await profileManager.listProfiles();
  return c.json(profiles);
});
app.post("/profiles", async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  if (!name) return c.json({ error: "name is required" }, 400);
  const profile = await profileManager.createProfile(name);
  return c.json(profile, 201);
});
app.delete("/profiles/:name", async (c) => {
  await profileManager.deleteProfile(c.req.param("name"));
  return c.json({ ok: true });
});

// Global error handler
app.onError((err, c) => {
  console.error(
    JSON.stringify({
      event: "unhandled_error",
      error: err.message,
      stack: err.stack,
    }),
  );
  return c.json({ error: "Internal server error" }, 500);
});

// Start server with WebSocket upgrade support
const server = serve(
  { fetch: app.fetch, port: config.port },
  () => {
    console.log(
      JSON.stringify({ event: "server_started", port: config.port }),
    );
  },
);

// Handle WebSocket upgrades for CDP proxy
server.on("upgrade", (req, socket, head) => {
  wsProxy.handleUpgrade(req, socket, head);
});
