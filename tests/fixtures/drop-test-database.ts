import type pg from "pg";
import { setTimeout as delay } from "node:timers/promises";

export async function dropTestDatabase(admin: pg.Client, name: string) {
  if (!/^[a-z0-9_]+_e2e$/.test(name))
    throw new Error("Expected an isolated test database");
  try {
    // PostgreSQL may still be closing a socket after the client disconnects.
    for (let attempt = 0; ; attempt++) {
      try {
        await admin.query(`DROP DATABASE "${name}"`);
        return;
      } catch (error) {
        if ((error as { code?: string }).code !== "55006" || attempt >= 4)
          throw error;
        await delay(100);
      }
    }
  } finally {
    await admin.end();
  }
}
