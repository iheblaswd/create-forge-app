import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// bin/create.mjs runs the compiled CLI (dist/): build it once before the tests.
export default function setup(): void {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
  execFileSync(process.execPath, [tsc, "-p", "tsconfig.build.json"], { cwd: root, stdio: "inherit" });
}
