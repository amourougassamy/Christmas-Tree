// Starts the production server: `next start` on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}.
// Read from the real environment here rather than in the npm script, because
// the shell npm uses (bash) fills in HOSTNAME with the machine name itself,
// which can make the server listen on loopback only.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = process.env.PORT || "3000";

const child = spawn(
  process.execPath,
  [nextBin, "start", "--hostname", hostname, "--port", port, ...process.argv.slice(2)],
  { stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal) {
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  }
  else process.exit(code ?? 0);
});
