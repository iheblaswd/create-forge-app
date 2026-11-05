import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";

/**
 * pom.xml edition through an XML parser, never through regular expressions (CLAUDE.md 3).
 * The document is parsed in "preserve order" mode with comments and whitespace kept, the
 * matching `<dependency>` nodes are dropped, and the tree is written back. Everything else
 * (order, comments, indentation, attributes) comes back unchanged. Pure: no I/O.
 */

export class PomError extends Error {
  constructor(
    readonly file: string,
    readonly reason: string,
  ) {
    super(`${file}: ${reason}`);
    this.name = "PomError";
  }
}

const OPTIONS = {
  preserveOrder: true,
  commentPropName: "#comment",
  ignoreAttributes: false,
  trimValues: false,
  processEntities: false,
  ignoreDeclaration: false,
  ignorePiTags: false,
  suppressEmptyNode: false,
} as const;

type Node = Record<string, unknown>;

const TEXT = "#text";

function tagOf(node: Node): string | undefined {
  return Object.keys(node).find((key) => key !== ":@");
}

function children(node: Node, tag: string): Node[] {
  const value = node[tag];
  return Array.isArray(value) ? (value as Node[]) : [];
}

function textOf(nodes: Node[], tag: string): string | undefined {
  const element = nodes.find((n) => tagOf(n) === tag);
  if (!element) return undefined;
  return children(element, tag)
    .map((n) => (typeof n[TEXT] === "string" || typeof n[TEXT] === "number" ? String(n[TEXT]) : ""))
    .join("")
    .trim();
}

function coordsOf(dependency: Node): string {
  const nodes = children(dependency, "dependency");
  return `${textOf(nodes, "groupId") ?? ""}:${textOf(nodes, "artifactId") ?? ""}`;
}

const isBlank = (node: Node | undefined): boolean =>
  node !== undefined && tagOf(node) === TEXT && String(node[TEXT]).trim() === "";

/** Remove matching dependencies from one `<dependencies>` list; returns the removed coords. */
function pruneList(list: Node[], wanted: ReadonlySet<string>): string[] {
  const removed: string[] = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const node = list[i];
    if (!node || tagOf(node) !== "dependency") continue;
    const coords = coordsOf(node);
    if (!wanted.has(coords)) continue;
    removed.push(coords);
    // Drop the indentation that precedes the element so no blank line is left behind.
    const start = isBlank(list[i - 1]) ? i - 1 : i;
    list.splice(start, i - start + 1);
  }
  return removed;
}

/** Walk the whole tree: `<dependencies>` under `<project>` and under `<dependencyManagement>`. */
function prune(nodes: Node[], wanted: ReadonlySet<string>): string[] {
  const removed: string[] = [];
  for (const node of nodes) {
    const tag = tagOf(node);
    if (!tag || tag === TEXT || tag === "#comment") continue;
    const kids = children(node, tag);
    if (tag === "dependencies") removed.push(...pruneList(kids, wanted));
    else if (tag !== "build" && tag !== "plugins") removed.push(...prune(kids, wanted));
  }
  return removed;
}

/** Return the `groupId:artifactId` of every dependency declared in the pom (any depth outside build). */
export function listDependencies(xml: string, file = "pom.xml"): string[] {
  const tree = parse(xml, file);
  const found: string[] = [];
  const walk = (nodes: Node[]): void => {
    for (const node of nodes) {
      const tag = tagOf(node);
      if (!tag || tag === TEXT || tag === "#comment") continue;
      if (tag === "dependency") found.push(coordsOf(node));
      else if (tag !== "build" && tag !== "plugins") walk(children(node, tag));
    }
  };
  walk(tree);
  return found;
}

function parse(xml: string, file: string): Node[] {
  const valid = XMLValidator.validate(xml);
  if (valid !== true) {
    throw new PomError(file, `invalid XML at line ${valid.err.line}: ${valid.err.msg}`);
  }
  return new XMLParser(OPTIONS).parse(xml) as Node[];
}

/**
 * Remove the dependencies whose `groupId:artifactId` is in `coords`. Dependencies inside
 * `<build>` (plugin dependencies) are never touched. A coordinate that is not present is
 * ignored: the starter may already have dropped it through a conditional block.
 */
export function removeDependencies(xml: string, coords: readonly string[], file = "pom.xml"): string {
  if (coords.length === 0) return xml;
  const tree = parse(xml, file);
  const removed = prune(tree, new Set(coords));
  if (removed.length === 0) return xml;
  let out = new XMLBuilder(OPTIONS).build(tree) as string;
  // The builder glues the XML declaration to the root element; restore the original separator.
  const declaration = /^<\?xml[^>]*\?>(\r?\n)/.exec(xml);
  if (declaration?.[1] && out.startsWith("<?xml")) {
    const end = out.indexOf("?>") + 2;
    if (out[end] !== "\n" && out[end] !== "\r") out = out.slice(0, end) + declaration[1] + out.slice(end);
  }
  const trailing = /(\r?\n)$/.exec(xml)?.[1];
  if (trailing !== undefined && !out.endsWith("\n")) out += trailing;
  return out;
}

/** True when the text is well-formed XML. */
export function isWellFormedXml(xml: string): boolean {
  return XMLValidator.validate(xml) === true;
}
