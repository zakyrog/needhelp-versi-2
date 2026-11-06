import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const standaloneNext = path.join(standaloneRoot, ".next");

await mkdir(standaloneNext, { recursive: true });

const copies = [
  [path.join(projectRoot, "public"), path.join(standaloneRoot, "public")],
  [path.join(projectRoot, ".next", "static"), path.join(standaloneNext, "static")],
];

for (const [source, destination] of copies) {
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true, force: true });
}

console.log("Standalone deployment assets are ready in .next/standalone.");
