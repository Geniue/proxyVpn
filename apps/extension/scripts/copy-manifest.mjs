import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(currentDirectory, "..");
const distDirectory = resolve(extensionRoot, "dist");

await mkdir(distDirectory, { recursive: true });
await copyFile(resolve(extensionRoot, "public", "manifest.json"), resolve(distDirectory, "manifest.json"));
