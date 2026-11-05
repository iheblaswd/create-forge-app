import type { FsPort } from "../../src/core/apply/index.js";

/** In-memory FsPort: files keyed by path, folders implied. `failOn` makes one write throw. */
export class MemoryFs implements FsPort {
  readonly files = new Map<string, Uint8Array>();
  readonly dirs = new Set<string>();
  failOn?: string;

  constructor(initial: Record<string, string> = {}) {
    for (const [path, text] of Object.entries(initial)) this.files.set(path, new TextEncoder().encode(text));
  }

  text(path: string): string {
    const data = this.files.get(path);
    if (!data) throw new Error(`no file ${path}`);
    return new TextDecoder().decode(data);
  }

  async readFile(path: string): Promise<Uint8Array> {
    const data = this.files.get(path);
    if (!data) throw new Error(`ENOENT ${path}`);
    return data;
  }

  async writeFile(path: string, data: Uint8Array | string): Promise<void> {
    if (this.failOn !== undefined && path.endsWith(this.failOn)) throw new Error(`disk full while writing ${path}`);
    this.files.set(path, typeof data === "string" ? new TextEncoder().encode(data) : data);
  }

  async mkdir(path: string): Promise<void> {
    this.dirs.add(path);
  }

  async list(path: string): Promise<string[] | undefined> {
    const prefix = `${path}/`;
    const names = new Set<string>();
    for (const key of [...this.files.keys(), ...this.dirs]) {
      if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split("/")[0] ?? "");
    }
    if (names.size === 0 && !this.dirs.has(path)) return undefined;
    return [...names];
  }

  async rename(from: string, to: string): Promise<void> {
    for (const map of [this.files]) {
      for (const [key, value] of [...map]) {
        if (key === from || key.startsWith(`${from}/`)) {
          map.delete(key);
          map.set(to + key.slice(from.length), value);
        }
      }
    }
    for (const dir of [...this.dirs]) {
      if (dir === from || dir.startsWith(`${from}/`)) {
        this.dirs.delete(dir);
        this.dirs.add(to + dir.slice(from.length));
      }
    }
  }

  async removeTree(path: string): Promise<void> {
    for (const key of [...this.files.keys()]) if (key === path || key.startsWith(`${path}/`)) this.files.delete(key);
    for (const dir of [...this.dirs]) if (dir === path || dir.startsWith(`${path}/`)) this.dirs.delete(dir);
  }

  paths(prefix: string): string[] {
    return [...this.files.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
}
