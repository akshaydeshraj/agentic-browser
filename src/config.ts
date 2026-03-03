import type { Config } from "./types.js";

export function loadConfig(): Config {
  const required = ["API_TOKEN", "TWOCAPTCHA_API_KEY", "NOPECHA_API_KEY"];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }

  return {
    port: parseInt(process.env.PORT ?? "3000", 10),
    apiToken: process.env.API_TOKEN!,
    twoCaptchaApiKey: process.env.TWOCAPTCHA_API_KEY!,
    nopechaApiKey: process.env.NOPECHA_API_KEY!,
    profilesDir: process.env.PROFILES_DIR ?? "/data/profiles",
    extensionsDir: process.env.EXTENSIONS_DIR ?? "./extensions",
  };
}
