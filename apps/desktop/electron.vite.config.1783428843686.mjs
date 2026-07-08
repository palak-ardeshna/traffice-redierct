// electron.vite.config.ts
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
var __electron_vite_injected_dirname = "E:\\Adsencs\\traffic\\apps\\desktop";
var workspacePkgs = [
  "@flowpilot/ipc-contracts",
  "@flowpilot/errors",
  "@flowpilot/logger",
  "@flowpilot/core-domain",
  "@flowpilot/core-services",
  "@flowpilot/data-access",
  "@flowpilot/audits"
];
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePkgs })],
    build: { outDir: "out/main" }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePkgs })],
    build: {
      outDir: "out/preload",
      // Sandboxed preloads (ADR 0004 keeps sandbox:true) MUST be CommonJS.
      rollupOptions: { output: { format: "cjs", entryFileNames: "index.cjs" } }
    }
  },
  renderer: {
    root: resolve(__electron_vite_injected_dirname, "src/renderer"),
    plugins: [react()],
    build: {
      outDir: "out/renderer",
      rollupOptions: { input: resolve(__electron_vite_injected_dirname, "src/renderer/index.html") }
    }
  }
});
export {
  electron_vite_config_default as default
};
