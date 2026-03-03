import { Hono } from "hono";
import type { RecipeStore } from "../services/recipe-store.js";
import type { BrowserManager } from "../services/browser-manager.js";
import type { RecipeDefinition } from "../types.js";
import { runRecipe } from "../services/recipe-runner.js";

export function createRecipeRoutes(recipeStore: RecipeStore) {
  const app = new Hono();

  app.get("/", async (c) => {
    const recipes = await recipeStore.list();
    return c.json(recipes);
  });

  app.get("/:name", async (c) => {
    const recipe = await recipeStore.get(c.req.param("name"));
    if (!recipe) return c.json({ error: "Recipe not found" }, 404);
    return c.json(recipe);
  });

  app.post("/", async (c) => {
    const body = await c.req.json<RecipeDefinition>();
    if (!body.name || typeof body.name !== "string") {
      return c.json({ error: "name is required" }, 400);
    }
    try {
      await recipeStore.save(body);
      return c.json({ ok: true, name: body.name.toLowerCase() }, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: message }, 400);
    }
  });

  app.delete("/:name", async (c) => {
    const removed = await recipeStore.remove(c.req.param("name"));
    if (!removed) return c.json({ error: "Recipe not found" }, 404);
    return c.json({ ok: true });
  });

  return app;
}

export function createRecipeExecRoutes(
  recipeStore: RecipeStore,
  browserManager: BrowserManager,
) {
  const app = new Hono();

  app.post("/:id/recipes/:name", async (c) => {
    const sessionId = c.req.param("id");
    const recipeName = c.req.param("name");

    const context = browserManager.getBrowserContext(sessionId);
    if (!context) return c.json({ error: "Session not found" }, 404);

    const recipe = await recipeStore.get(recipeName);
    if (!recipe) return c.json({ error: `Recipe not found: ${recipeName}` }, 404);

    const params = await c.req.json().catch(() => ({}));

    const result = await runRecipe(recipe, params as Record<string, unknown>, context);
    const status = result.success ? 200 : 422;
    return c.json(result, status);
  });

  return app;
}
