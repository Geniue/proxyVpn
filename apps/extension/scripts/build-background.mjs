import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(currentDirectory, "..");
const signalingUrl = process.env.RELAY_MESH_SIGNALING_URL ?? "http://localhost:4000";

await esbuild.build({
  entryPoints: [resolve(extensionRoot, "src", "background", "index.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["chrome120"],
  outfile: resolve(extensionRoot, "dist", "background.js"),
  define: {
    __RELAY_MESH_SIGNALING_URL__: JSON.stringify(signalingUrl),
  },
});