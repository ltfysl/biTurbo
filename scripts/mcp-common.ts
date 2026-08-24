import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const argv = process.argv.slice(2);

export function arg(k: string, def?: string): string | undefined {
  const a = argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split("=", 2)[1] : def;
}

export function flag(k: string): boolean {
  return argv.includes(`--${k}`) || argv.includes(`--${k}=true`);
}

export function findBinary(): string {
  const explicit = arg("bin");
  if (explicit) return explicit;
  const ext = process.platform === "win32" ? ".exe" : "";
// (#538) Cross-platform debug/release binary discovery (replaces the Windows-only .exe default).
  const candidates = [
    resolve(process.cwd(), `src-tauri/target/debug/biturbo-mcp${ext}`),
    resolve(process.cwd(), `src-tauri/target/release/biturbo-mcp${ext}`),
    resolve(process.cwd(), `../src-tauri/target/debug/biturbo-mcp${ext}`),
    resolve(process.cwd(), `../src-tauri/target/release/biturbo-mcp${ext}`),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return `biturbo-mcp${ext}`;
}

export function makeDataDir(): string {
  return mkdtempSync(resolve(tmpdir(), "biturbo-mcp-data-"));
}

export function cleanupDataDir(dir: string) {
  rmSync(dir, { recursive: true, force: true });
}
