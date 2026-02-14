const { spawn } = require("node:child_process");
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

console.log(`[dev] cwd=${projectRoot}`);
console.log(`[dev] NODE_ENV=${childEnv.NODE_ENV}, DEV_ADMIN_BYPASS=${childEnv.DEV_ADMIN_BYPASS}`);

const child = spawn(tsxBin, ["watch", "server/_core/index.ts"], {
  cwd: projectRoot,
  env: childEnv,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));
