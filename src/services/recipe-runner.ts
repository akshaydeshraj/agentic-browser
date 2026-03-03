import type { BrowserContext, Page } from "patchright";
import type { RecipeDefinition, RecipeResult, RecipeStep } from "../types.js";

function resolveTemplates(
  text: string | undefined,
  params: Record<string, string>,
): string | undefined {
  if (!text) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => params[key] ?? `{{${key}}}`);
}

function resolveStep(
  step: RecipeStep,
  params: Record<string, string>,
): RecipeStep {
  return {
    ...step,
    url: resolveTemplates(step.url, params),
    selector: resolveTemplates(step.selector, params),
    value: resolveTemplates(step.value, params),
    waitForUrl: resolveTemplates(step.waitForUrl, params),
    expression: resolveTemplates(step.expression, params),
  };
}

const DEFAULT_STEP_TIMEOUT = 30_000;

export async function runRecipe(
  recipe: RecipeDefinition,
  rawParams: Record<string, unknown>,
  context: BrowserContext,
): Promise<RecipeResult> {
  // Resolve params with defaults
  const params: Record<string, string> = {};
  for (const [key, def] of Object.entries(recipe.params)) {
    const val = rawParams[key] as string | undefined;
    if (val !== undefined) {
      params[key] = String(val);
    } else if (def.default !== undefined) {
      params[key] = def.default;
    } else if (def.required) {
      return {
        success: false,
        error: `Missing required param: ${key}`,
        stepsCompleted: 0,
      };
    }
  }

  // Get or create page
  const rawPageIndex = rawParams._pageIndex;
  const pageIndex = typeof rawPageIndex === "number" ? rawPageIndex : undefined;
  let page: Page;
  if (rawPageIndex !== undefined && pageIndex === undefined) {
    return {
      success: false,
      error: "_pageIndex must be a number",
      stepsCompleted: 0,
    };
  }
  if (pageIndex !== undefined) {
    const pages = context.pages();
    if (pageIndex < 0 || pageIndex >= pages.length) {
      return {
        success: false,
        error: `pageIndex ${pageIndex} out of range (${pages.length} pages)`,
        stepsCompleted: 0,
      };
    }
    page = pages[pageIndex];
  } else {
    page = await context.newPage();
  }

  const data: Record<string, unknown> = {};
  let stepsCompleted = 0;

  for (const rawStep of recipe.steps) {
    const step = resolveStep(rawStep, params);
    const stepTimeout = step.timeout ?? DEFAULT_STEP_TIMEOUT;

    try {
      switch (step.action) {
        case "goto":
          if (!step.url) throw new Error("goto requires url");
          await page.goto(step.url, {
            waitUntil: "domcontentloaded",
            timeout: stepTimeout,
          });
          break;

        case "fill":
          if (!step.selector) throw new Error("fill requires selector");
          await page
            .locator(step.selector)
            .first()
            .fill(step.value ?? "", { timeout: stepTimeout });
          break;

        case "type": {
          if (!step.selector) throw new Error("type requires selector");
          const typeDelay = step.delay ?? 80;
          const typeValue = step.value ?? "";
          // Auto-scale timeout: at least 30s, or enough for all chars + buffer
          const typeTimeout =
            step.timeout ?? Math.max(DEFAULT_STEP_TIMEOUT, typeValue.length * typeDelay + 5000);
          await page
            .locator(step.selector)
            .first()
            .pressSequentially(typeValue, { delay: typeDelay, timeout: typeTimeout });
          break;
        }

        case "click": {
          if (!step.selector) throw new Error("click requires selector");
          if (step.waitForUrl) {
            await Promise.all([
              page.waitForURL(step.waitForUrl, { timeout: stepTimeout }),
              page.locator(step.selector).first().click({ timeout: stepTimeout }),
            ]);
          } else {
            await page
              .locator(step.selector)
              .first()
              .click({ timeout: stepTimeout });
          }
          break;
        }

        case "wait":
          await page.waitForTimeout(step.ms ?? 1000);
          break;

        case "waitForSelector":
          if (!step.selector)
            throw new Error("waitForSelector requires selector");
          await page
            .locator(step.selector)
            .first()
            .waitFor({ timeout: stepTimeout });
          break;

        case "screenshot": {
          const buf = await page.screenshot({ timeout: stepTimeout });
          data.screenshot = buf.toString("base64");
          break;
        }

        case "select":
          if (!step.selector) throw new Error("select requires selector");
          await page
            .locator(step.selector)
            .first()
            .selectOption(step.value ?? "", { timeout: stepTimeout });
          break;

        case "evaluate": {
          if (!step.expression)
            throw new Error("evaluate requires expression");
          const result = await page.evaluate(step.expression);
          data.evaluateResult = result;
          break;
        }

        default:
          throw new Error(`Unknown action: ${step.action}`);
      }

      stepsCompleted++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Step ${stepsCompleted + 1} (${step.action}) failed: ${message}`,
        stepsCompleted,
        data,
      };
    }
  }

  data.finalUrl = page.url();
  return { success: true, stepsCompleted, data };
}
