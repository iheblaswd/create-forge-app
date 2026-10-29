# mini-starter

Test fixture for `create-forge-app` (CLAUDE.md 4.5): a fake starter of 17 files that exercises
every manifest mechanism. Nothing here compiles or runs.

<!-- forge:if starter-repository -->
## Maintainers

This section exists only in the starter repository and is always removed by the CLI.
<!-- forge:end -->

## Files and owning option

| File | Owner | Why it is here |
| --- | --- | --- |
| `forge.template.json` | manifest | schema 1 manifest: 4 modules, exclude, conditional, maven, env |
| `README.md` | always (conditional) | `starter-repository` block in an XML comment |
| `package.json` | always (conditional) | plain conditional file, no block |
| `pom.xml` | always (conditional) | parent pom with a `starter-repository` XML block |
| `apps/api/pom.xml` | always (conditional) | real `<dependency>` entries for auth=jwt and email=smtp (maven lists), XML block `auth=jwt` |
| `apps/api/src/main/resources/application.yml` | always (conditional) | YAML blocks `email=smtp` and `auth!=none` |
| `env.example` | always (conditional) | env blocks `auth=jwt` and `email=smtp`, variables of the manifest env lists. Named without the leading dot on purpose: the manifest `env.example` field carries the name, and the dev sandbox denies access to `.env.*` paths |
| `infra/compose.yaml` | always (conditional) | YAML block `email=smtp|resend` (resend is a stub option with no files so the condition evaluator has an "or" case) |
| `apps/api/src/main/java/com/forge/starter/shared/domain/entities/BaseEntity.java` | always | shared kernel, no block |
| `apps/api/src/main/java/com/forge/starter/auth/domain/entities/User.java` | auth=jwt | matched by `auth/**` |
| `apps/web/middleware.ts` | auth=jwt | explicitly listed file inside the web tree |
| `apps/web/src/lib/env.ts` | frontend=next | TS line-comment block (`auth=jwt`) |
| `apps/web/src/app/page.tsx` | frontend=next | JSX comment block (`auth=jwt`) |
| `pnpm-workspace.yaml` | frontend=next | explicitly listed file |
| `apps/api/Dockerfile` | deploy=docker | explicitly listed file |
| `infra/compose.prod.yaml` | deploy=docker | explicitly listed file |
| `docs/maintainers/notes.md` | excluded | matched by `exclude: docs/maintainers/**`, never copied |

Expected results per combination (used by the planner snapshots):

- `auth=none`: drops `auth/**`, `apps/web/middleware.ts`, the `auth=jwt` and `auth!=none` blocks,
  the `spring-boot-starter-security` and `jjwt-api` dependencies, `JWT_*` variables.
- `email=none`: drops the `email=smtp` and `email=smtp|resend` blocks, `spring-boot-starter-mail`, `SMTP_*`.
- `frontend=none`: drops `apps/web/**` and `pnpm-workspace.yaml`.
- `starter-repository` blocks and `docs/maintainers/**` are always removed.
