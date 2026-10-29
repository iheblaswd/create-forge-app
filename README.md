# create-forge-app

[![ci](https://github.com/iheblaswd/create-forge-app/actions/workflows/ci.yml/badge.svg)](https://github.com/iheblaswd/create-forge-app/actions/workflows/ci.yml)

Generate a production-ready **Spring Boot 3 (Spring Modulith, Clean Architecture per module) +
Next.js 15** application with only the modules you choose, then **add, remove and upgrade** those
modules later without losing your code.

> **Status: early development.** Nothing is published on npm yet and the CLI does not generate a
> project yet. See [Status](#status) for what exists today and what comes next.

## Why

Starting a serious Spring Boot project (modules, auth, database, modern frontend, tests, CI) costs
two to five days of plumbing. Spring Initializr gives an empty skeleton; JHipster is heavy and
cannot be updated once you modify the output; a GitHub template never updates at all.

`create-forge-app` takes a different route, inspired by
[create-clubedge-app](https://github.com/Clubedge/create-clubedge-app):

- The CLI knows **no module by name**. Everything comes from a declarative manifest
  (`forge.template.json`) shipped by a reference application, the *starter*.
- Each CLI release **pins one starter release** (tag + verified commit), so a generated project
  always records exactly where it came from.
- The CLI **never deletes or overwrites a user file**, and rolls back completely on failure.
- Zero cost end to end: open source (Apache-2.0), public repos, free tiers only.

## Quick start (target)

The commands below are the target interface. They are **not functional yet**.

```sh
pnpm dlx create-forge-app my-app        # or: npx create-forge-app my-app
cd my-app
pnpm dev                                # compose (Postgres, Mailpit) + Spring Boot + Next.js
```

Defaults: `--auth jwt --email smtp --frontend next --deploy docker`.

## Modules (target)

Modules and their options are defined by the starter manifest, not by the CLI. The first starter
(`forge-starter v0.1.0`, not yet written) is planned to ship:

| Module     | Options            | What it brings                                                                 |
| ---------- | ------------------ | ------------------------------------------------------------------------------ |
| `auth`     | `jwt` \| `none`    | Email + password, JWT access/refresh with rotation, reset, email verification, Argon2, rate limiting |
| `email`    | `smtp` \| `none`   | Email sending (Mailpit locally)                                                |
| `frontend` | `next` \| `none`   | Next.js 15 App Router, generated OpenAPI client, BFF auth routes, Playwright   |
| `deploy`   | `docker`           | Dockerfiles and `compose.prod.yaml`                                            |

Each option declares the files it owns, the Maven dependencies it needs, its environment
variables and its `requires` on other options. Files shared by several options use *conditional
blocks* (`<!-- forge:if auth=jwt -->`, `# forge:if email=smtp`, `// forge:if frontend=next`) that
the CLI keeps or strips, always removing the markers.

## Options (target)

```
forge my-app [--auth jwt|none] [--email smtp|none] [--frontend next|none] [--deploy docker]
             [--ref <tag|branch|sha>] [--template-dir <path>] [--dry-run] [-y] [--no-install] [--no-git]
forge add <module> <option> [...]      # inside a generated project
forge remove <module> [...]
forge upgrade [--ref <tag>]
forge status
forge doctor [--no-services]
```

`--dry-run` prints the exact Plan that `apply` would execute; the two are kept identical by
design.

## Version relationship

| CLI release        | Starter release | Pinned by                                                   |
| ------------------ | --------------- | ----------------------------------------------------------- |
| `0.1.0` (planned)  | `v0.1.0`        | `template.lock.json` (tag + commit), bundled at build time  |

A generated project stores its provenance in `.forge/project.json`:

```json
{
  "cliVersion": "0.1.0",
  "starter": { "repo": "forge/forge-starter", "ref": "v0.1.0", "commit": "<sha>" },
  "modules": { "auth": "jwt", "email": "smtp", "frontend": "next", "deploy": "docker" }
}
```

`forge upgrade` uses it to regenerate the old and new starter states in memory and apply the
difference. The CLI refuses a manifest whose `schema` version it does not know.

## How it works

```
forge.template.json  ──► manifest  (load + validate, zod, readable errors)
flags / prompts      ──► selection (defaults, requires, one option per module)
starter file list    ──► planner   (pure: manifest + selection + files → Plan)
                          │
                          ▼
                         Plan { copy, conditional, pomRemove, env, projectJson, postSteps }
                          │
                 ┌────────┴────────┐
              --dry-run          apply (copy to temp dir, strip blocks, edit pom.xml as XML,
              prints it           write .env.local and .forge/project.json, atomic rename, rollback)
```

- The **Plan** is a serialisable data structure: it survives a JSON round-trip and is
  byte-identical for the same input, so planner tests can assert on it directly.
- `pom.xml` is edited as XML (`fast-xml-parser`), never with regular expressions.
- `add` / `remove` / `upgrade` reuse the same engine: Plan(A) vs Plan(B), hash comparison per
  file, three-way merge (`node-diff3`) for files the user modified.

## Status

Work is organised in steps (see `CLAUDE.md` at the project root). Roadmap items use the French
word *Étape*.

- **Étape 1 — Manifest + planner: done.** Pure core with no disk access: manifest loading and
  validation, selection resolution, planner producing a Plan, `mini-starter` test fixture
  covering every block type and module, unit tests on `all`, `auth=none`, `frontend=none` and
  `email=none` selections, CI on GitHub Actions. Plan snapshots for every module combination are
  the next planner task. `bin/create.mjs` only prints the package name and version.
- **Étape 2 — Execution and CLI: next.** `core/sources` (local dir, bundled tarball, GitHub ref),
  `core/apply` with rollback, Java package renaming, `commander` + `@clack/prompts`, `--dry-run`,
  post-install steps (`git init`, `pnpm install`, `mvn dependency:resolve`), integration tests on
  `mini-starter`.
- **Étape 3** — the real `forge-starter v0.1.0` and first npm publication.
- **Étape 4 and 5** — `status`, `doctor`, `upgrade`, then `add` / `remove` with three-way merge.

## Development

Requirements: Node >= 22, pnpm (version pinned by `packageManager` in `package.json`; run
`corepack enable`).

```sh
pnpm install
pnpm test     # vitest
pnpm check    # tsc --noEmit
pnpm lint     # eslint
pnpm build    # tsc -p tsconfig.build.json → dist/
node bin/create.mjs
```

Layout:

```
bin/create.mjs            entry point
src/cli/                  commander, prompts, output (banner, plan summary, errors)
src/core/manifest/        forge.template.json loading + zod validation
src/core/sources/         bundled | local dir (--template-dir) | github (--ref)
src/core/selection/       flags + defaults + requires → Selection
src/core/planner/         manifest + selection + file list → Plan (pure)
src/core/apply/           executes a Plan (Étape 2)
src/core/merge/           three-way merge for upgrade / add / remove (Étape 5)
src/steps/                git init, pnpm install, mvn dependency:resolve
src/utils/                fs, process, naming, hashing
scripts/bundle-template.mjs   bundles the pinned starter release (Étape 3)
test/unit/                planner, selection, manifest — no disk access
test/fixtures/mini-starter/   ~15-file fake starter used by the tests
test/integration/         real generation runs (Étape 2)
```

Rules:

- **No I/O in `src/core/*` except `src/core/sources`.** Enforced by ESLint
  (`eslint.config.js`) and a dedicated test.
- TDD: the test comes first, nothing merges without one. CI (`lint`, `check`, `test`) must be
  green on every PR.
- Conventional Commits (`feat(planner): …`, `fix(apply): …`, `docs: …`), one branch per task,
  `main` is protected.

## License

Apache-2.0 — see [LICENSE](LICENSE).
