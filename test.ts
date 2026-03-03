import { chromium } from "patchright";
import * as path from "path";

const nopechaPath = path.resolve("./extensions/nopecha");
console.log("NopeCHA path:", nopechaPath);

async function main() {
  const context = await chromium.launchPersistentContext(
    "./test-profiles/test",
    {
      headless: false,
      viewport: null,
      ignoreDefaultArgs: ["--enable-automation"],
      args: [
        "--remote-debugging-port=9223",
        "--remote-debugging-address=127.0.0.1",
        "--no-first-run",
        "--no-default-browser-check",
        `--disable-extensions-except=${nopechaPath}`,
        `--load-extension=${nopechaPath}`,
      ],
    },
  );

  console.log("Browser launched!");
  const pages = context.pages();
  console.log("Pages:", pages.length);

  // Discover CDP URL
  const res = await fetch("http://127.0.0.1:9223/json/version");
  const data = (await res.json()) as { webSocketDebuggerUrl: string };
  console.log("CDP URL:", data.webSocketDebuggerUrl);

  // Test 1: bot.sannysoft.com
  console.log("\n--- Test 1: bot.sannysoft.com ---");
  const page = pages[0] || (await context.newPage());
  await page.goto("https://bot.sannysoft.com/", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Check navigator.webdriver
  const webdriver = await page.evaluate(() => navigator.webdriver);
  console.log("navigator.webdriver:", webdriver);

  // Check key test results
  const results = await page.evaluate(() => {
    const rows = document.querySelectorAll("table tr");
    const data: Record<string, string> = {};
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 2) {
        const key = cells[0]?.textContent?.trim() ?? "";
        const val = cells[1]?.textContent?.trim() ?? "";
        if (key) data[key] = val;
      }
    });
    return data;
  });
  console.log("Sannysoft results:", JSON.stringify(results, null, 2));
  await page.screenshot({ path: "/tmp/test-sannysoft.png", fullPage: true });
  console.log("Screenshot saved: /tmp/test-sannysoft.png");

  // Test 2: browserscan.net
  console.log("\n--- Test 2: browserscan.net/bot-detection ---");
  await page.goto("https://www.browserscan.net/bot-detection", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: "/tmp/test-browserscan.png", fullPage: true });
  console.log("Screenshot saved: /tmp/test-browserscan.png");

  // Test 3: Google reCAPTCHA demo
  console.log("\n--- Test 3: reCAPTCHA demo ---");
  await page.goto("https://www.google.com/recaptcha/api2/demo", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "/tmp/test-recaptcha-before.png" });
  console.log("Screenshot before solve: /tmp/test-recaptcha-before.png");

  // Wait for NopeCHA to auto-solve (up to 30s)
  console.log("Waiting for NopeCHA to auto-solve (30s timeout)...");
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    const solved = await page.evaluate(() => {
      const response = document.getElementById("g-recaptcha-response");
      return response && (response as HTMLTextAreaElement).value.length > 0;
    });
    if (solved) {
      console.log(`Captcha solved after ${i + 1}s!`);
      break;
    }
    if (i === 29) {
      console.log("NopeCHA did not solve within 30s (expected without valid API key)");
    }
  }

  await page.screenshot({ path: "/tmp/test-recaptcha-after.png" });
  console.log("Screenshot after wait: /tmp/test-recaptcha-after.png");

  await context.close();
  console.log("\nAll tests complete!");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
