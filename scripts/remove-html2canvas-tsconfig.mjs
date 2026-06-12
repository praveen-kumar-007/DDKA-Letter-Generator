import { rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve(process.cwd(), "node_modules", "html2canvas", "tsconfig.json");

if (existsSync(target)) {
  rmSync(target, { force: true });
}
