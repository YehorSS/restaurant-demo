declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    OWNER_PASSWORD: string;
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
  }
}
