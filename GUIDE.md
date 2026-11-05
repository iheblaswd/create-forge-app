# Guide : tester et faire évoluer create-forge-app

Ce guide explique, pas à pas, comment installer le projet, vérifier qu'il fonctionne, générer un
projet avec le CLI et continuer le développement. Il correspond à l'état du dépôt à la fin de
l'**étape 2** du plan de travail (`CLAUDE.md`, section 6).

---

## 1. Ce que fait le projet aujourd'hui

`create-forge-app` (commande `forge`) génère un projet Spring Boot + Next.js en ne gardant que les
modules choisis. Le CLI ne connaît aucun module : il lit le manifeste `forge.template.json` d'un
*starter* (l'application de référence) et en déduit quoi copier, quoi retirer et quoi configurer.

| Fonction | État |
| --- | --- |
| Lecture et validation du manifeste, choix des modules, plan de génération | ✅ terminé (étape 1) |
| Génération réelle d'un dossier, `--dry-run`, questions interactives, rollback | ✅ terminé (étape 2) |
| Vrai starter Spring Boot + Next.js (`forge-starter`) | ⏳ étape 3, pas encore écrit |
| Publication sur npm (`npx create-forge-app`) | ⏳ étape 3 |
| `forge status`, `doctor`, `upgrade`, `add`, `remove` | ⏳ étapes 4 et 5 (le CLI les annonce) |

Comme le vrai starter n'existe pas encore, on teste avec **`mini-starter`** : un faux starter de
17 fichiers dans `test/fixtures/mini-starter/` qui contient chaque mécanisme (blocs XML, YAML, TS,
JSX, dépendances Maven, variables d'environnement, fichiers exclus).

---

## 2. Prérequis

- **Node.js 22 ou plus** : `node -v`
- **pnpm** via corepack (livré avec Node) : `corepack enable`, puis `pnpm -v`
- **git**
- Optionnel, seulement pour les étapes après génération : Maven 3.9+ et Java 21. Sans eux, le
  CLI affiche un avertissement et continue.

---

## 3. Installer et vérifier

Dans PowerShell (ou un terminal), depuis le dossier du dépôt :

```sh
cd D:\projects\forge\create-forge-app
git checkout main
git pull
pnpm install
pnpm build      # compile src/ vers dist/ (le CLI exécute dist/)
```

Puis les trois vérifications, toutes doivent être vertes :

```sh
pnpm test       # 152 tests : unitaires + intégration (génère de vrais dossiers dans un dossier temporaire)
pnpm check      # vérification des types TypeScript
pnpm lint       # règles de code, dont « pas d'accès disque dans src/core sauf sources »
```

`pnpm test` recompile automatiquement le CLI avant de lancer les tests.

---

## 4. Essayer le CLI

Toutes les commandes se lancent depuis le dossier `create-forge-app`.

### 4.1 Voir le plan sans rien écrire

```sh
node bin/create.mjs mon-app --template-dir test/fixtures/mini-starter --dry-run
```

Vous voyez les fichiers qui seraient copiés (déjà renommés vers le package Java `com.monapp`),
les fichiers dont les blocs conditionnels seront résolus, les dépendances Maven retirées, les
variables d'environnement et les étapes qui suivront. Aucun fichier n'est créé.

Essayez avec d'autres choix :

```sh
node bin/create.mjs mon-app --template-dir test/fixtures/mini-starter --auth none --dry-run
node bin/create.mjs mon-app --template-dir test/fixtures/mini-starter --auth none --email none --frontend none --dry-run
```

### 4.2 Générer un vrai dossier

```sh
node bin/create.mjs ..\essai-forge --template-dir test/fixtures/mini-starter -y --no-install
```

- `-y` : pas de questions, les valeurs par défaut du manifeste pour chaque module non précisé.
- `--no-install` : saute `pnpm install` et `mvn dependency:resolve` (le mini-starter ne compile pas).
- `--no-git` : saute `git init` et le premier commit.

Puis ouvrez `..\essai-forge` et vérifiez :

| À regarder | Ce qu'on doit voir |
| --- | --- |
| `apps/api/src/main/java/com/essaiforge/...` | le package Java renommé, plus de `com/forge/starter` |
| `apps/api/pom.xml` | groupId `com.essaiforge`, commentaires et ordre conservés |
| `README.md`, `package.json`, `application.yml` | le nom `essai-forge` à la place de `mini-starter` |
| tous les fichiers | aucune ligne `forge:if` / `forge:end` restante |
| `.env.local` | les variables des modules choisis, `JWT_SECRET` rempli avec une valeur aléatoire |
| `.forge/project.json` | la provenance : version du CLI, starter utilisé, modules choisis |

Relancez avec `--auth none` dans un autre dossier : le dossier `auth/`, `middleware.ts`, les
dépendances `spring-boot-starter-security` et `jjwt-api` et les variables `JWT_*` disparaissent.

### 4.3 Mode interactif

```sh
node bin/create.mjs --template-dir test/fixtures/mini-starter --no-install
```

Le CLI demande le nom du dossier, puis « Personnaliser les modules ? ». Avec « Oui », une liste par
module. `Ctrl+C` annule sans rien écrire.

### 4.4 Vérifier les protections

```sh
mkdir ..\occupe ; echo test > ..\occupe\a-moi.txt
node bin/create.mjs ..\occupe --template-dir test/fixtures/mini-starter -y --no-install
```

Le CLI refuse un dossier qui contient déjà des fichiers et n'y touche pas. Si une erreur survient
pendant la génération (par exemple un bloc `forge:if` jamais fermé dans le starter), tout est
annulé : ni le dossier cible ni le dossier temporaire ne restent. Ce cas est couvert par les tests.

D'autres messages à essayer :

```sh
node bin/create.mjs x --template-dir test/fixtures/mini-starter --storage r2 -y   # module inconnu
node bin/create.mjs upgrade                                                       # commande prévue plus tard
node bin/create.mjs --help
```

---

## 5. Comment le code est organisé

```
bin/create.mjs              point d'entrée (exécute dist/cli/main.js)
src/cli/                    arguments (commander), questions (@clack/prompts), affichage
src/core/manifest/          lecture + validation du forge.template.json
src/core/selection/         flags + questions + valeurs par défaut + "requires" → choix des modules
src/core/planner/           manifeste + choix + liste des fichiers → Plan (pur, sans disque)
src/core/sources/           d'où vient le starter : --template-dir, template/ embarqué, GitHub --ref
src/core/apply/             exécution du Plan : blocs, pom.xml, .env.local, renommage, rollback
src/steps/                  après génération : pnpm install, mvn dependency:resolve, git init
src/utils/                  accès disque réel et lancement de commandes
scripts/bundle-template.mjs embarque une release du starter dans template/ + template.lock.json
test/unit/                  tests sans disque (dont les 4 snapshots de Plan)
test/integration/           génération réelle des 4 combinaisons sur disque
test/fixtures/mini-starter/ faux starter
```

Le chemin d'une génération :

1. `sources` trouve le starter et liste ses fichiers.
2. `selection` fixe une option par module.
3. `planner` calcule le **Plan** : fichiers à copier, blocs à résoudre, dépendances à retirer,
   variables, provenance. `--dry-run` affiche ce Plan et s'arrête là.
4. `apply` écrit tout dans un dossier temporaire à côté de la cible, puis le déplace d'un coup.
   À la moindre erreur, le dossier temporaire est supprimé.
5. `steps` lance l'installation et `git init`. Un outil absent donne un avertissement, pas une erreur.

Deux règles structurent le code :

- **Pas d'accès disque dans `src/core/*`, sauf `src/core/sources`.** `apply` passe par une
  interface `FsPort` : la vraie implémentation est dans `src/utils/fs.ts`, les tests utilisent une
  version en mémoire (`test/helpers/memory-fs.ts`). Le lint bloque tout import de `node:fs` ailleurs.
- **Aucun module codé en dur.** `--auth`, `--email`… ne sont pas déclarés dans le CLI : toute option
  `--<nom> <valeur>` inconnue du CLI est traitée comme un module et vérifiée contre le manifeste.

---

## 6. Travailler sur le projet

### Le cycle

1. Créer une branche : `git checkout -b feat/ma-fonction`.
2. **Écrire le test d'abord** dans `test/unit/` (ou `test/integration/` si ça touche le disque),
   le voir échouer avec `pnpm test`.
3. Écrire le code minimal pour le faire passer, puis nettoyer.
4. `pnpm test`, `pnpm check` et `pnpm lint` doivent être verts.
5. Commit au format Conventional Commits (`feat(apply): …`, `fix(cli): …`, `docs: …`), push, PR.
   La CI GitHub relance lint, types et tests.

Pendant le développement, `pnpm test:watch` relance les tests à chaque sauvegarde.

### Les snapshots de Plan

`test/unit/planner.snapshot.test.ts` enregistre le Plan des 4 combinaisons dans
`test/unit/__snapshots__/`. Si vous modifiez le planner ou le mini-starter, le test échoue et
montre la différence. Relisez-la : si elle est voulue, mettez à jour avec
`pnpm vitest run -u test/unit/planner.snapshot.test.ts` et commitez le fichier `.snap`.

### Ajouter un cas au mini-starter

1. Ajouter le fichier dans `test/fixtures/mini-starter/`.
2. Le déclarer dans `forge.template.json` (`files` d'une option, `conditional`, `maven`, `env`…).
3. Mettre à jour le tableau du `README.md` du mini-starter (un test vérifie qu'il est complet).
4. Mettre à jour les listes attendues dans `test/integration/generate.test.ts` et les snapshots.

### Tester avec un vrai starter (étape 3)

Quand `forge-starter` existera :

```sh
node bin/create.mjs mon-app --template-dir ..\forge-starter          # starter en cours de développement
node scripts/bundle-template.mjs ..\forge-starter --repo iheblaswd/forge-starter --ref v0.1.0
node bin/create.mjs mon-app                                          # utilise le starter embarqué
node bin/create.mjs mon-app --ref v0.1.0                             # télécharge depuis GitHub
```

Sans starter embarqué ni `--template-dir`, le CLI l'explique clairement au lieu d'échouer.

---

## 7. Prochaines étapes

D'après `CLAUDE.md`, section 6 :

1. **Étape 3 — `forge-starter v0.1.0`** (nouveau dépôt) : `shared`, module `auth` en Clean
   Architecture, `apps/web` Next.js, blocs conditionnels posés dès la première ligne. Le CLI est
   relancé contre ce starter à chaque PR (`--template-dir`), ce qui valide le manifeste. Puis
   `bundle-template`, version `0.1.0` dans `package.json` et publication npm.
2. **Étape 4** — `forge status`, `forge doctor`, `forge upgrade` niveau 1.
3. **Étape 5** — `forge add` / `forge remove` et la fusion à trois voies (`src/core/merge`).

---

## 8. Dépannage

| Symptôme | Solution |
| --- | --- |
| `create-forge-app is not built yet` | `pnpm build` |
| `pnpm` introuvable | `corepack enable` (une fois), puis rouvrir le terminal |
| `this build of create-forge-app has no bundled starter` | normal tant que l'étape 3 n'est pas faite : ajoutez `--template-dir test/fixtures/mini-starter` |
| `already exists and is not empty` | choisissez un autre dossier : le CLI n'écrase jamais vos fichiers |
| un snapshot échoue après une modification | lisez la différence, puis `pnpm vitest run -u …` si elle est voulue |
