export interface Session {
  id: string;
  profileName: string;
  cdpWsUrl: string;
  internalCdpWsUrl: string;
  cdpPort: number;
  createdAt: string;
  status: "starting" | "ready" | "error";
}

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

export interface GeolocationConfig {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface CreateSessionRequest {
  profileName: string;
  proxy?: ProxyConfig;
  geolocation?: GeolocationConfig;
  timezone?: string;
  locale?: string;
  userAgent?: string;
}

export interface SolveCaptchaRequest {
  type: "recaptcha_v2" | "recaptcha_v3" | "hcaptcha" | "turnstile" | "auto";
  pageUrl: string;
  siteKey?: string;
  action?: string;
}

export interface SolveCaptchaResponse {
  token: string;
  captchaId: string;
  type: string;
}

export interface Profile {
  name: string;
  dataDir: string;
  createdAt: string;
}

export interface Config {
  port: number;
  apiToken: string;
  twoCaptchaApiKey: string;
  nopechaApiKey: string;
  profilesDir: string;
  extensionsDir: string;
  recipesDir: string;
}

// Recipe types

export interface RecipeStep {
  action: string;
  url?: string;
  selector?: string;
  value?: string;
  ms?: number;
  delay?: number;
  waitForUrl?: string;
  timeout?: number;
  expression?: string;
}

export interface RecipeParam {
  required?: boolean;
  default?: string;
  description?: string;
}

export interface RecipeDefinition {
  name: string;
  description: string;
  steps: RecipeStep[];
  params: Record<string, RecipeParam>;
}

export interface RecipeResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  stepsCompleted: number;
}
