import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import type { FsPort } from "../core/apply/index.js";

/** FsPort backed by the real disk (node:fs/promises). */
export const nodeFs: FsPort = {
  readFile: async (path) => new Uint8Array(await readFile(path)),
  writeFile: (path, data) => writeFile(path, data),
  mkdir: async (path) => {
    await mkdir(path, { recursive: true });
  },
  list: async (path) => {
    try {
      return await readdir(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  },
  rename: (from, to) => rename(from, to),
  removeTree: (path) => rm(path, { recursive: true, force: true }),
};

/** Normalise a path for FsPort: forward slashes (accepted by Node on Windows too). */
export const toPosix = (path: string): string => path.split("\\").join("/");
