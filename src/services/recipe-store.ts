import * as fs from "fs/promises";
import * as path from "path";
import type { RecipeDefinition } from "../types.js";

export class RecipeStore {
  constructor(private recipesDir: string) {}

  private normalizeName(name: string): string {
    return name.toLowerCase();
  }

  private isValidName(name: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(name);
  }

  private filePath(name: string): string {
    return path.join(this.recipesDir, `${this.normalizeName(name)}.json`);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.recipesDir, { recursive: true });
  }

  async list(): Promise<
    Array<{ name: string; description: string; params: RecipeDefinition["params"] }>
  > {
    await this.init();
    const files = await fs.readdir(this.recipesDir);
    const recipes = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const data = await fs.readFile(
          path.join(this.recipesDir, file),
          "utf-8",
        );
        const recipe = JSON.parse(data) as RecipeDefinition;
        recipes.push({
          name: recipe.name,
          description: recipe.description,
          params: recipe.params,
        });
      } catch {
        // skip malformed files
      }
    }
    return recipes;
  }

  async get(name: string): Promise<RecipeDefinition | null> {
    if (!this.isValidName(name)) return null;
    try {
      const data = await fs.readFile(this.filePath(name), "utf-8");
      return JSON.parse(data) as RecipeDefinition;
    } catch {
      return null;
    }
  }

  async save(recipe: RecipeDefinition): Promise<void> {
    if (!this.isValidName(recipe.name)) {
      throw new Error(
        `Invalid recipe name: "${recipe.name}". Only alphanumeric, hyphens, and underscores allowed.`,
      );
    }
    if (!recipe.steps || !Array.isArray(recipe.steps) || recipe.steps.length === 0) {
      throw new Error("Recipe must have at least one step");
    }
    if (!recipe.description) {
      throw new Error("Recipe must have a description");
    }
    if (!recipe.params || typeof recipe.params !== "object") {
      throw new Error("Recipe must have a params object");
    }
    // Normalize name for storage
    const normalized = { ...recipe, name: this.normalizeName(recipe.name) };
    await this.init();
    await fs.writeFile(
      this.filePath(recipe.name),
      JSON.stringify(normalized, null, 2),
    );
  }

  async remove(name: string): Promise<boolean> {
    if (!this.isValidName(name)) return false;
    try {
      await fs.unlink(this.filePath(name));
      return true;
    } catch {
      return false;
    }
  }
}
