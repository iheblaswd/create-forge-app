#!/usr/bin/env node
// Entry point of create-forge-app / forge. The TypeScript sources are compiled to dist/ by
// `pnpm build` (done automatically before publishing and before the tests).
import { existsSync } from "node:fs";

const main = new URL("../dist/cli/main.js", import.meta.url);
if (!existsSync(main)) {
  process.stderr.write("create-forge-app is not built yet: run `pnpm build` in the create-forge-app folder.\n");
  process.exit(1);
}
const { runCli } = await import(main.href);
const code = await runCli(process.argv.slice(2), {
  stdout: (/** @type {string} */ text) => process.stdout.write(text),
  stderr: (/** @type {string} */ text) => process.stderr.write(text),
  cwd: process.cwd(),
  interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
});
process.exitCode = code;
