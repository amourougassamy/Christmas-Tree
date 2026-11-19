import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "node_modules", "rhino3dm");
const destination = resolve(root, "public", "rhino3dm");

await mkdir(destination, { recursive: true });
await Promise.all(
  ["rhino3dm.js", "rhino3dm.wasm"].map((file) =>
    copyFile(resolve(source, file), resolve(destination, file)),
  ),
);
