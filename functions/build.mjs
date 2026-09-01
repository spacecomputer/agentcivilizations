// Bundle the functions for Cloud Build. The @agent-civilizations/* workspace
// packages exist only in this monorepo — Cloud Build receives the functions/
// folder alone, so their code must be compiled into the bundle. Registry
// dependencies stay external and are installed from package.json as usual.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "lib/index.js",
  external: [
    "firebase-admin",
    "firebase-admin/*",
    "firebase-functions",
    "firebase-functions/*",
    "fast-xml-parser",
    "ulid",
    "zod",
  ],
  logLevel: "info",
});
