/**
 * Traffic Guru Main Process
 * Privileged tier: owns the window, Playwright automation, and IPC router.
 * Renderer is created hardened: sandbox on, nodeIntegration off, contextIsolation on.
 */

import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { createLogger } from "@flowpilot/logger";
import { registerIpcRouter, trafficManager } from "./ipc-router.js";
import { startRedirectServer, stopRedirectServer } from "./redirect-server.js";

// apps/desktop builds to CommonJS, so `__dirname` is available natively.
const log = createLogger({ name: "main" });

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  // Store window reference so we can send events to it
  trafficManager.setMainWindow(win);
  return win;
}

app
  .whenReady()
  .then(async () => {
    registerIpcRouter();
    try {
      const port = await startRedirectServer();
      log.info({ port }, "redirect host started");
    } catch (err) {
      log.error({ err }, "redirect host failed to start (port in use?)");
    }
    createWindow();
    log.info("Traffic Guru main process ready");

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  })
  .catch((err) => {
    log.fatal({ err }, "startup failed");
    app.quit();
  });

app.on("window-all-closed", () => {
  stopRedirectServer();
  if (process.platform !== "darwin") app.quit();
});
