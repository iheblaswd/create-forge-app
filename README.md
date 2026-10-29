# create-forge-app

Generate a production-ready **Spring Boot 3 (modulith, clean architecture) + Next.js 15** app
with only the modules you choose, then add, remove and upgrade those modules without losing
your code.

> Work in progress.

## Development

```sh
pnpm install
pnpm test    # vitest
pnpm check   # tsc --noEmit
pnpm lint    # eslint
node bin/create.mjs
```

Layout: `src/cli`, `src/core/{manifest,sources,selection,planner,apply,merge}`, `src/steps`,
`src/utils`, `test/{unit,fixtures,integration}`. No I/O in `src/core/*` except
`src/core/sources` (enforced by ESLint, see `eslint.config.js`).
