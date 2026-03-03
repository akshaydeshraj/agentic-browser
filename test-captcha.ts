import { chromium } from "patchright";

const API_URL = "http://localhost:3000";
const API_TOKEN = "test-token-123";

async function main() {
  // Create a session
  console.log("--- Creating session ---");
  const sessionRes = await fetch(`${API_URL}/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ profileName: "captcha-test" }),
  });
  const session = (await sessionRes.json()) as {
    id: string;
    cdpWsUrl: string;
    cdpPort: number;
    internalCdpWsUrl: string;
  };
  console.log("Session created:", session.id);
  console.log("Internal CDP:", session.internalCdpWsUrl);

  // Connect via CDP
  console.log("\n--- Connecting via CDP ---");
  const browser = await chromium.connectOverCDP(session.internalCdpWsUrl);
  const contexts = browser.contexts();
  const context = contexts[0];
  const page = context.pages()[0] || (await context.newPage());

  console.log("Navigating to reCAPTCHA demo...");
  await page.goto("https://www.google.com/recaptcha/api2/demo", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "/tmp/captcha-before-solve.png" });
  console.log("Screenshot before: /tmp/captcha-before-solve.png");

  // Call the solve-captcha endpoint
  console.log("\n--- Calling 2captcha solve endpoint ---");
  console.log("(This takes 15-60s as 2captcha uses human solvers...)");
  const startTime = Date.now();

  const solveRes = await fetch(
    `${API_URL}/sessions/${session.id}/solve-captcha`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "recaptcha_v2",
        pageUrl: "https://www.google.com/recaptcha/api2/demo",
      }),
    },
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const solveResult = await solveRes.json();
  console.log(`Solve response (${elapsed}s):`, solveRes.status);
  console.log("Result:", JSON.stringify(solveResult, null, 2));

  if (solveRes.ok) {
    // The solve-captcha endpoint already injected the token AND triggered the callback.
    // Wait for the reCAPTCHA widget to update (checkbox should now show green checkmark).
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "/tmp/captcha-after-solve.png" });
    console.log("Screenshot after solve: /tmp/captcha-after-solve.png");

    // Verify the token is in the textarea
    const tokenLen = await page.evaluate(() => {
      const textarea = document.getElementById("g-recaptcha-response") as HTMLTextAreaElement;
      return textarea?.value?.length ?? 0;
    });
    console.log("Token length in textarea:", tokenLen);

    // Submit the form directly via JS (bypasses reCAPTCHA widget's client-side check)
    console.log("\n--- Submitting form via JS ---");
    await page.evaluate(() => {
      const form = document.getElementById("recaptcha-demo-form") as HTMLFormElement;
      if (form) {
        form.submit();
      } else {
        // Fallback: find first form on page
        document.querySelector("form")?.submit();
      }
    });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: "/tmp/captcha-submitted.png" });
    console.log("Screenshot after submit: /tmp/captcha-submitted.png");

    const bodyText = await page.textContent("body");
    if (bodyText?.includes("Verification Success")) {
      console.log("\nCAPTCHA VERIFICATION SUCCESSFUL!");
    } else {
      console.log("\nPage text:", bodyText?.substring(0, 300));
    }
  }

  // Cleanup
  browser.close();
  await fetch(`${API_URL}/sessions/${session.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });

  console.log("\nDone!");
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
