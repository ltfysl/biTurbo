// Creates a git tag matching the version in package.json and pushes it
// to trigger the release workflow. Usage: npm run release
//
// Checks:
//   - Working tree must be clean (no uncommitted changes)
//   - Tag must not already exist remotely
//   - Current commit must be pushed to origin
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = pkg.version;

if (!version) {
  console.error("No version found in package.json");
  process.exit(1);
}

const tag = `v${version}`;

function git(args) {
  return execSync(`git ${args}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

// 1. Ensure clean working tree
const status = git("status --porcelain");
if (status) {
  console.error("Working tree is not clean. Commit or stash changes first.");
  console.error(status);
  process.exit(1);
}

// 2. Ensure current commit is pushed
const localBranch = git("rev-parse --abbrev-ref HEAD");
const localCommit = git("rev-parse HEAD");
let remoteCommit;
try {
  remoteCommit = git(`rev-parse origin/${localBranch}`);
} catch {
  console.error(`No remote branch found for "${localBranch}". Push your branch first.`);
  process.exit(1);
}

if (localCommit !== remoteCommit) {
  console.error(`Local commit ${localCommit.slice(0, 8)} does not match origin/${localBranch} (${remoteCommit.slice(0, 8)}).`);
  console.error("Push your changes first: git push");
  process.exit(1);
}

// 3. Enforce version sync across all four manifests — a mismatch ships a
// release whose updater metadata disagrees with the app's self-reported version.
function findVersionInSection(source, headerRegex) {
  const lines = source.split(/\r?\n/);
  let inSection = false;
  for (let line of lines) {
    const trimmed = line.trim();
    if (headerRegex.test(trimmed)) {
      inSection = true;
      continue;
    }
    if (inSection) {
      if (/^\[/.test(trimmed)) break;
      const m = trimmed.match(/^version\s*=\s*"([^"]+)"/);
      if (m) return m[1];
    }
  }
  return undefined;
}

const cargoToml = readFileSync("src-tauri/Cargo.toml", "utf8");
const cargoVersion = findVersionInSection(cargoToml, /^\[package\]$/);
const tauriVersion = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
const cargoLock = readFileSync("src-tauri/Cargo.lock", "utf8");
const lockVersion = findVersionInSection(cargoLock, /^name = "biturbo"$/);

if (!cargoVersion || !lockVersion || !tauriVersion) {
  console.error("Could not parse one of the version fields. Refusing to tag.");
  process.exit(1);
}

const mismatches = [
  ["package.json", version],
  ["src-tauri/Cargo.toml", cargoVersion],
  ["src-tauri/Cargo.lock (biturbo)", lockVersion],
  ["src-tauri/tauri.conf.json", tauriVersion],
].filter(([, v]) => v !== version);
if (mismatches.length > 0) {
  console.error(`Version mismatch across manifests. Sync these to ${version} first:`);
  for (const [file, v] of mismatches) console.error(`  ${file}: ${v}`);
  process.exit(1);
}

// 4. Check if tag already exists locally…
let tagExists = false;
 try {
   git(`rev-parse ${tag}`);
   tagExists = true;
 } catch {
   // Tag doesn't exist — good
 }
 
 if (tagExists) {
   console.error(`Tag ${tag} already exists. Bump the version in package.json first.`);
   process.exit(1);
 }

// …and on the remote.
if (git(`ls-remote --tags origin refs/tags/${tag}`)) {
  console.error(`Tag ${tag} already exists on the remote. Bump the version in package.json first.`);
  process.exit(1);
}

// 5. Create and push the tag
console.log(`Creating tag ${tag} for version ${version}...`);
execSync(`git tag ${tag}`, { stdio: "inherit" });

console.log(`Pushing ${tag} to origin...`);
execSync(`git push origin ${tag}`, { stdio: "inherit" });

console.log(`\nDone! The release workflow is now running.`);
console.log(`Check progress: https://github.com/${git("remote get-url origin").replace(/\.git$/, "").replace(/^https:\/\/github\.com\//, "")}/actions`);
