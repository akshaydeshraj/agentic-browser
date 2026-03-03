import { Solver } from "2captcha-ts";
import type { BrowserContext, Page } from "patchright";
import type { SolveCaptchaRequest, SolveCaptchaResponse } from "../types.js";

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 2000;

export class CaptchaSolver {
  private solver: Solver;
  private solvedUrls = new Set<string>();

  constructor(apiKey: string) {
    this.solver = new Solver(apiKey);
  }

  async solve(
    context: BrowserContext,
    req: SolveCaptchaRequest,
  ): Promise<SolveCaptchaResponse> {
    // Idempotency: skip if already solved for this URL
    const cacheKey = `${req.pageUrl}:${req.type}`;
    if (this.solvedUrls.has(cacheKey)) {
      throw new Error(
        `Captcha already solved for ${req.pageUrl}. Create a new request if needed.`,
      );
    }

    const pages = context.pages();
    const page = pages[pages.length - 1];
    if (!page) throw new Error("No pages open in session");

    const type =
      req.type === "auto" ? await this.detectType(page) : req.type;

    // Circuit breaker: retry with exponential backoff
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const result = await this.solveByType(page, type, req);
        this.solvedUrls.add(cacheKey);
        return { ...result, type };
      } catch (err) {
        lastError = err as Error;
        if (attempt < MAX_ATTEMPTS - 1) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw new Error(
      `Captcha solving failed after ${MAX_ATTEMPTS} attempts: ${lastError?.message}`,
    );
  }

  private async detectType(page: Page): Promise<string> {
    const html = await page.content();
    if (html.includes("h-captcha") || html.includes("hcaptcha.com"))
      return "hcaptcha";
    if (
      html.includes("cf-turnstile") ||
      html.includes("challenges.cloudflare.com")
    )
      return "turnstile";
    if (html.includes("grecaptcha.execute")) return "recaptcha_v3";
    if (html.includes("g-recaptcha")) return "recaptcha_v2";
    throw new Error("Could not auto-detect captcha type from page content");
  }

  private async solveByType(
    page: Page,
    type: string,
    req: SolveCaptchaRequest,
  ): Promise<Omit<SolveCaptchaResponse, "type">> {
    switch (type) {
      case "recaptcha_v2":
        return this.solveRecaptchaV2(page, req);
      case "recaptcha_v3":
        return this.solveRecaptchaV3(page, req);
      case "hcaptcha":
        return this.solveHCaptcha(page, req);
      case "turnstile":
        return this.solveTurnstile(page, req);
      default:
        throw new Error(`Unsupported captcha type: ${type}`);
    }
  }

  private async solveRecaptchaV2(
    page: Page,
    req: SolveCaptchaRequest,
  ): Promise<Omit<SolveCaptchaResponse, "type">> {
    const siteKey =
      req.siteKey ?? (await this.extractSiteKey(page, "[data-sitekey]"));
    const result = await this.solver.recaptcha({
      pageurl: req.pageUrl,
      googlekey: siteKey,
    });
    await this.injectRecaptchaToken(page, result.data);
    return { token: result.data, captchaId: result.id };
  }

  private async solveRecaptchaV3(
    page: Page,
    req: SolveCaptchaRequest,
  ): Promise<Omit<SolveCaptchaResponse, "type">> {
    const siteKey =
      req.siteKey ?? (await this.extractSiteKey(page, "[data-sitekey]"));
    const result = await this.solver.recaptcha({
      pageurl: req.pageUrl,
      googlekey: siteKey,
      version: "v3",
      action: req.action ?? "verify",
      min_score: 0.7,
    });
    await this.injectRecaptchaToken(page, result.data);
    return { token: result.data, captchaId: result.id };
  }

  private async solveHCaptcha(
    page: Page,
    req: SolveCaptchaRequest,
  ): Promise<Omit<SolveCaptchaResponse, "type">> {
    const siteKey =
      req.siteKey ?? (await this.extractSiteKey(page, "[data-sitekey]"));
    const result = await this.solver.hcaptcha({
      pageurl: req.pageUrl,
      sitekey: siteKey,
    });
    await page.evaluate((token: string) => {
      const textarea = document.querySelector(
        'textarea[name="h-captcha-response"]',
      ) as HTMLTextAreaElement | null;
      if (textarea) textarea.value = token;
    }, result.data);
    return { token: result.data, captchaId: result.id };
  }

  private async solveTurnstile(
    page: Page,
    req: SolveCaptchaRequest,
  ): Promise<Omit<SolveCaptchaResponse, "type">> {
    const siteKey =
      req.siteKey ??
      (await this.extractSiteKey(page, ".cf-turnstile[data-sitekey]"));
    const result = await this.solver.cloudflareTurnstile({
      pageurl: req.pageUrl,
      sitekey: siteKey,
    });
    await page.evaluate((token: string) => {
      const input = document.querySelector(
        'input[name="cf-turnstile-response"]',
      ) as HTMLInputElement | null;
      if (input) input.value = token;
    }, result.data);
    return { token: result.data, captchaId: result.id };
  }

  private async extractSiteKey(
    page: Page,
    selector: string,
  ): Promise<string> {
    const key = await page.$eval(selector, (el: Element) =>
      el.getAttribute("data-sitekey"),
    );
    if (!key)
      throw new Error(
        `Could not extract site key using selector: ${selector}`,
      );
    return key;
  }

  private async injectRecaptchaToken(
    page: Page,
    token: string,
  ): Promise<void> {
    await page.evaluate((t: string) => {
      const textarea = document.getElementById(
        "g-recaptcha-response",
      ) as HTMLTextAreaElement | null;
      if (textarea) {
        textarea.style.display = "block";
        textarea.value = t;
      }
    }, token);
  }
}
