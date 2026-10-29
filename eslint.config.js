// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Node built-ins that perform I/O. CLAUDE.md 4.5: "Aucune I/O dans core/* sauf sources".
 * Importing any of them (with or without the `node:` prefix) from src/core, except
 * src/core/sources, is a lint error.
 */
const IO_MODULES = [
  "fs",
  "fs/promises",
  "child_process",
  "http",
  "https",
  "net",
  "dgram",
  "tls",
  "dns",
  "readline",
  "worker_threads",
  "cluster",
  "process",
];
const ioPatterns = IO_MODULES.flatMap((m) => [m, `node:${m}`, `${m}/*`, `node:${m}/*`]);

export default tseslint.config(
  // test/fixtures/** holds fake starters: their TS/TSX files are data, never built nor linted.
  { ignores: ["node_modules/**", "dist/**", "template/**", "coverage/**", "test/fixtures/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
  {
    files: ["src/core/**/*.{ts,js,mjs}"],
    ignores: ["src/core/sources/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ioPatterns,
              message:
                "No I/O in src/core/* (only src/core/sources may touch disk, processes or network). See CLAUDE.md 4.5.",
            },
          ],
        },
      ],
    },
  },
);
