import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

/**
 * Externalization policy for the main & preload bundles.
 *
 * `externalizeDepsPlugin` externalizes every package listed in this app's
 * package.json `dependencies` (so they are `require`d from node_modules at
 * runtime), and we `exclude` the @flowpilot/* workspace packages so their raw
 * .ts source gets BUNDLED instead. Because electron-vite drives SSR
 * externalization through this plugin, the transitive runtime deps that flow
 * through the workspace packages (playwright, zod, pino, node-html-parser) are
 * declared as direct deps of this app so the plugin can see and externalize them
 * — otherwise Playwright gets inlined and its browser-path resolution breaks.
 */
const workspacePkgs = [
  "@flowpilot/ipc-contracts",
  "@flowpilot/errors",
  "@flowpilot/logger",
  "@flowpilot/core-domain",
  "@flowpilot/core-services",
  "@flowpilot/data-access",
  "@flowpilot/audits",
];

/**
 * Three build targets = the three Electron tiers (blueprint §3.6):
 *  - main:    privileged app core (Node, CommonJS output)
 *  - preload: the minimal contextBridge surface (CommonJS — required for sandbox)
 *  - renderer: sandboxed React UI (no Node)
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePkgs })],
    build: { outDir: "out/main" },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePkgs })],
    build: {
      outDir: "out/preload",
      // Sandboxed preloads (ADR 0004 keeps sandbox:true) MUST be CommonJS.
      rollupOptions: { output: { format: "cjs", entryFileNames: "index.cjs" } },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react()],
    build: {
      outDir: "out/renderer",
      rollupOptions: { input: resolve(__dirname, "src/renderer/index.html") },
    },
  },
});
