#!/usr/bin/env node
// Entry point. For now it only prints the package name and version
// (commander + prompts arrive in Etape 2).
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
/** @type {{ name: string, version: string }} */
const pkg = require("../package.json");

process.stdout.write(`${pkg.name} v${pkg.version}\n`);
