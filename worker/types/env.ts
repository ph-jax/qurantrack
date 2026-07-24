export interface Env {
  DB: import('@cloudflare/workers-types').D1Database;
  APP_VERSION?: string;
  ENVIRONMENT?: string;
}

export interface Variables {
  requestId: string;
}
