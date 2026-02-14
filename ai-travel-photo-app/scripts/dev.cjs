const { execSync, spawn } = require("node:child_process");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const tsxBin = process.platform === "win32"
  ? path.join(projectRoot, "node_modules", ".bin", "tsx.cmd")
  : path.join(projectRoot, "node_modules", ".bin", "tsx");

const childEnv = {
  ...process.env,
  NODE_ENV: "development",
  DEV_ADMIN_BYPASS: process.env.DEV_ADMIN_BYPASS ?? "true",
};

const devPort = Number(process.env.PORT || 3000);

function ensurePortOwnedByCurrentProject() {
  if (process.platform === "win32") return;

  try {
    const output = execSync(`lsof -nP -iTCP:${devPort} -sTCP:LISTEN`, {
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();

    const lines = output.trim().split("\n");
    if (lines.length <= 1) return;

    const cols = lines[1].trim().split(/\s+/);
    const pid = cols[1];
    if (!pid) return;

    const cwdInfo = execSync(`lsof -a -p ${pid} -d cwd -Fn`, {
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
    const cwdLine = cwdInfo.split("\n").find(line => line.startsWith("n"));
    const processCwd = cwdLine ? cwdLine.slice(1) : "";

    if (processCwd && processCwd !== projectRoot) {
      console.error(`[dev] Port ${devPort} is already occupied by another process.`);
      console.error(`[dev] Occupied process cwd: ${processCwd}`);
      console.error(`[dev] Current project cwd: ${projectRoot}`);
      console.error(`[dev] Please stop that process first, e.g.: kill ${pid}`);
      process.exit(1);
    }
  } catch (_) {
    // No process is listening or lsof is unavailable.
  }
}

ensurePortOwnedByCurrentProject();

console.log(`[dev] cwd=${projectRoot}`);
console.log(`[dev] NODE_ENV=${childEnv.NODE_ENV}, DEV_ADMIN_BYPASS=${childEnv.DEV_ADMIN_BYPASS}`);

const child = spawn(tsxBin, ["watch", "server/_core/index.ts"], {
  cwd: projectRoot,
  env: childEnv,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));
