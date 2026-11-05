/**
 * Project naming (CLAUDE.md Étape 2 task 3): the starter's Java package root
 * (`app.packageRoot`, e.g. `com.forge.starter`) becomes `com.<project>` in folders and in
 * `package` / `import` lines, and the starter name (`manifest.name`) becomes the project name
 * in the project-level files. Pure: no I/O.
 */

export class NameError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "NameError";
  }
}

const PROJECT_NAME = /^[a-z0-9][a-z0-9._-]*$/;

/** Validate a project (folder / npm package) name; returns it unchanged or throws NameError. */
export function validateProjectName(name: string): string {
  if (name.length === 0) throw new NameError("the project name is empty");
  if (name.length > 214) throw new NameError("the project name is longer than 214 characters");
  if (!PROJECT_NAME.test(name)) {
    throw new NameError(
      `"${name}" is not a valid project name: use lowercase letters, digits, "-", "." or "_", starting with a letter or digit`,
    );
  }
  return name;
}

const JAVA_KEYWORDS = new Set(
  "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record yield".split(
    " ",
  ),
);

/** `my-app` → `com.myapp`; a name starting with a digit or equal to a keyword gets an `app` prefix. */
export function javaPackageFor(projectName: string): string {
  let segment = projectName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (segment === "" || /^[0-9]/.test(segment) || JAVA_KEYWORDS.has(segment)) segment = `app${segment}`;
  return `com.${segment}`;
}

const toPath = (pkg: string): string => pkg.replaceAll(".", "/");

/** Move a file path from the starter package folder to the project package folder. */
export function renamePath(path: string, fromPackage: string, toPackage: string): string {
  const from = `/${toPath(fromPackage)}/`;
  const index = path.indexOf(from);
  if (index === -1) return path;
  return `${path.slice(0, index)}/${toPath(toPackage)}/${path.slice(index + from.length)}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace the package root in Java/Kotlin sources: `package`, `import`, `import static` and any
 * fully-qualified reference (annotations, strings such as `@ComponentScan("com.forge.starter")`).
 * Only whole package segments match: `com.forge.starterkit` is left alone.
 */
export function renameJavaSource(text: string, fromPackage: string, toPackage: string): string {
  const pattern = new RegExp(`(?<![A-Za-z0-9_.])${escapeRegExp(fromPackage)}(?![A-Za-z0-9_])`, "g");
  return text.replace(pattern, toPackage);
}

/** Replace the starter name with the project name, whole words only (`mini-starter-parent` included). */
export function renameProjectName(text: string, starterName: string, projectName: string): string {
  const pattern = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(starterName)}(?![A-Za-z0-9_])`, "g");
  return text.replace(pattern, projectName);
}
