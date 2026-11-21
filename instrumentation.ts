/**
 * Runs once when the Next.js server starts: opens the database so pending
 * migrations apply at boot rather than on the first API request.
 *
 * Only the database is touched here. The ornament service is cached on
 * globalThis, and creating it from this separate bundle would hand route
 * handlers objects built from a different copy of the ornament modules.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getDatabase } = await import("./db/index");
  getDatabase();
}
