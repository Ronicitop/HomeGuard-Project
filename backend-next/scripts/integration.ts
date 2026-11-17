// Camera regression now shares B's isolated test DB and canonical sessions.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const result = spawnSync(
  process.execPath,
  [
    resolve("node_modules/vitest/vitest.mjs"),
    "run",
    "tests/http/cameras-merge.test.ts",
  ],
  { stdio: "inherit", windowsHide: true },
);
process.exitCode = result.status || 0;
