import { spawn, spawnSync } from "node:child_process";

export interface RunResult {
  code: number;
  output: string;
}

const isWindows = process.platform === "win32";

/** On Windows pnpm, mvn and corepack are .cmd shims that need a shell; git.exe does not, and a
 * shell would split arguments containing spaces (the commit message). */
const needsShell = (command: string): boolean => isWindows && command !== "git";

/** Run a command in `cwd`, capturing stdout + stderr. Never throws for a non-zero exit code. */
export function run(command: string, args: readonly string[], cwd: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], { cwd, shell: needsShell(command), windowsHide: true });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", (error) => resolve({ code: 127, output: output + error.message }));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

/** True when `command --version` can be started. */
export function commandExists(command: string): boolean {
  const result = spawnSync(command, ["--version"], { shell: needsShell(command), stdio: "ignore", windowsHide: true });
  return result.error === undefined && result.status === 0;
}
