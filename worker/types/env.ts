export interface Env {
  DB: import('@cloudflare/workers-types').D1Database;
  APP_VERSION?: string;
  ENVIRONMENT?: string;
  APP_BASE_URL?: string;
  TOKEN_HASH_PEPPER?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_LOCAL_BYPASS?: string;
  MAIL_RELAY_URL?: string;
  MAIL_RELAY_SECRET?: string;
  BOOTSTRAP_ADMIN_EMAIL?: string;
  BOOTSTRAP_SECRET?: string;
  ENABLE_BOOTSTRAP_ADMIN?: string;
}

export interface Variables {
  requestId: string;
  auth: import('../auth/service').AuthContext;
}
