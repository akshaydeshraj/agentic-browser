export interface Session {
  id: string;
  profileName: string;
  cdpWsUrl: string;
  internalCdpWsUrl: string;
  cdpPort: number;
  createdAt: string;
  status: "starting" | "ready" | "error";
}

export interface CreateSessionRequest {
  profileName: string;
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
}
