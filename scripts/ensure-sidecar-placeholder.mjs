// Creates a placeholder sidecar binary so Tauri's build.rs externalBin check
// passes during cargo build/run commands that aren't full release builds.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const binariesDir = join(process.cwd(), "src-tauri", "binaries");
const targetTriple = execSync("rustc -vV", { encoding: "utf8" })
  .match(/host:\s*(.+)/)?.[1]
  .trim();

if (!targetTriple) process.exit(1);

const ext = process.platform === "win32" ? ".exe" : "";
const dst = join(binariesDir, `biturbo-mcp-${targetTriple}${ext}`);

// Only create if it doesn't exist (don't overwrite a real binary).
const PLACEHOLDER = "placeholder";
if (!existsSync(dst)) {
  mkdirSync(binariesDir, { recursive: true });
  writeFileSync(dst, PLACEHOLDER);
} else {
  let stale = false;
  try {
    const content = readFileSync(dst);
    if (content.length < 32 || content.toString().startsWith(PLACEHOLDER)) {
      stale = true;
    }
  } catch {
    stale = true;
  }
  if (stale) {
    console.warn(`Sidecar placeholder at ${dst} appears stale; rewriting`);
    writeFileSync(dst, PLACEHOLDER);
  }
}
