import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const distDirectory = resolve(currentDirectory, "..", "dist");

await rm(distDirectory, { recursive: true, force: true });
