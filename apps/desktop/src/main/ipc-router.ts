/**
 * IPC router and Traffic Manager for Traffic Guru
 */

import { ipcMain, type BrowserWindow } from "electron";
import { chromium } from "playwright";
import { ipcContract, type IpcChannel, type TrafficEvent, type IpcRequest } from "@flowpilot/ipc-contracts";
import { toProblem } from "@flowpilot/errors";
import { createLogger } from "@flowpilot/logger";
import * as redirectStore from "./redirect-store.js";
import { getBaseUrl } from "./redirect-server.js";

const log = createLogger({ name: "ipc" });

class TrafficManager {
  private mainWindow: BrowserWindow | null = null;
  private status: "idle" | "starting" | "running" | "stopping" | "stopped" | "error" = "idle";
  private totalVisits = 0;
  private successfulVisits = 0;
  private failedVisits = 0;
  private activeWorkers = 0;
  private workers: Array<{ workerId: number; abort: AbortController }> = [];

  setMainWindow(win: BrowserWindow) {
    this.mainWindow = win;
  }

  private sendEvent(event: TrafficEvent) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("traffic:events", event);
    }
  }

  private emitStatus() {
    this.sendEvent({
      kind: "status",
      status: this.status,
    });
  }

  private emitLog(level: "debug" | "info" | "warn" | "error", message: string) {
    this.sendEvent({
      kind: "log",
      level,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  async start(config: IpcRequest<"traffic:start">) {
    if (this.status !== "idle" && this.status !== "stopped" && this.status !== "error") {
      throw new Error("Traffic already running");
    }

    // Clean up all URLs
    const cleanedUrls = config.urls.map(u => u.trim().replace(/^[`"'']+|[`"'']+$/g, ""));
    
    this.status = "starting";
    this.totalVisits = 0;
    this.successfulVisits = 0;
    this.failedVisits = 0;
    this.emitStatus();
    this.emitLog("info", "Starting traffic generation...");

    // Create worker abort controllers
    this.workers = [];
    this.activeWorkers = 0;

    const cleanedConfig = {
      ...config,
      urls: cleanedUrls
    };

    for (let i = 0; i < config.workers; i++) {
      const abortController = new AbortController();
      this.workers.push({ workerId: i, abort: abortController });
      this.activeWorkers++;
      this.runWorker(i, abortController.signal, cleanedConfig).catch((err) => {
        log.error({ err }, "Worker failed");
        this.emitLog("error", `Worker ${i} failed: ${err.message}`);
      });
    }

    this.status = "running";
    this.emitStatus();
  }

  async stop() {
    if (this.status !== "running" && this.status !== "starting") {
      return;
    }
    this.status = "stopping";
    this.emitStatus();
    this.emitLog("info", "Stopping traffic generation...");

    // Abort all workers
    for (const worker of this.workers) {
      worker.abort.abort();
    }
  }

  getStatus() {
    return {
      status: this.status,
      totalVisits: this.totalVisits,
      successfulVisits: this.successfulVisits,
      failedVisits: this.failedVisits,
      activeWorkers: this.activeWorkers,
    };
  }

  // User agent pool for realism
  private userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
  ];

  // Random helper functions
  private randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private async randomDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = this.randomBetween(minMs, maxMs);
    await new Promise(r => setTimeout(r, delay));
  }

  private async simulateHumanBehavior(page: any, signal: AbortSignal, baseDomain: string): Promise<void> {
    // 1. Random mouse movements
    for (let i = 0; i < this.randomBetween(3, 8); i++) {
      if (signal.aborted) return;
      const x = this.randomBetween(100, 1800);
      const y = this.randomBetween(100, 900);
      await page.mouse.move(x, y, { steps: this.randomBetween(10, 30) });
      await this.randomDelay(100, 500);
    }

    // 2. Try to hover over random elements
    try {
      const elements = await page.$$('a, button, div, p, img');
      if (elements.length > 0) {
        const randomElement = elements[this.randomBetween(0, Math.min(elements.length - 1, 10))];
        await randomElement.hover();
        await this.randomDelay(300, 1000);
      }
    } catch (e) {
      // Ignore hover errors
    }

    // 3. Randomly click a navigation link to another page on same site
    if (Math.random() > 0.3) {
      try {
        // Find internal links
        const internalLinks = await page.$$eval('a', (links: any[], domain: string) => {
          return links.map((a: any) => a.href).filter((href: string) => href.includes(domain) && !href.startsWith('javascript:'));
        }, baseDomain);
        
        if (internalLinks.length > 0) {
          const randomLink = internalLinks[this.randomBetween(0, Math.min(internalLinks.length - 1, 10))];
          this.emitLog("info", `Navigating to ${randomLink}`);
          
          // Wait before clicking to simulate reading
          await this.randomDelay(1000, 3000);
          
          await page.goto(randomLink, { waitUntil: "networkidle", timeout: 30000 });
          
          // Behave on new page too
          await this.randomDelay(800, 1500);
          await this.randomScroll(page, signal);
        }
      } catch (e) {
        // Ignore navigation errors
      }
    }

    // 4. Try to fill and submit a search form if available
    if (Math.random() > 0.6) {
      try {
        const searchInput = await page.$('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"], #search, .search');
        if (searchInput) {
          const searchTerms = ['test', 'article', 'blog', 'info', 'page', 'content'];
          const randomTerm = searchTerms[this.randomBetween(0, searchTerms.length - 1)];
          
          await searchInput.type(randomTerm, { delay: this.randomBetween(50, 150) });
          await this.randomDelay(500, 1000);
          
          // Press enter to search
          await searchInput.press('Enter');
          await this.randomDelay(1000, 2000);
          await this.randomScroll(page, signal);
        }
      } catch (e) {
        // Ignore search form errors
      }
    }

    // 5. Random scroll pattern
    await this.randomScroll(page, signal);
  }

  private async randomScroll(page: any, signal: AbortSignal): Promise<void> {
    const scrollSteps = this.randomBetween(2, 5);
    for (let step = 0; step < scrollSteps; step++) {
      if (signal.aborted) return;
      
      // Random scroll amount
      const scrollAmount = this.randomBetween(300, 600);
      await page.evaluate((amt: number) => {
        window.scrollBy({ top: amt, left: 0, behavior: 'smooth' });
      }, scrollAmount);
      
      // Wait between scrolls
      await this.randomDelay(500, 1500);
    }
    
    // Sometimes scroll back up a bit
    if (Math.random() > 0.5 && !signal.aborted) {
      const scrollBack = this.randomBetween(100, 300);
      await page.evaluate((amt: number) => {
        window.scrollBy({ top: -amt, left: 0, behavior: 'smooth' });
      }, scrollBack);
      await this.randomDelay(300, 800);
    }
  }

  private async runWorker(
    workerId: number,
    signal: AbortSignal,
    config: IpcRequest<"traffic:start">
  ) {
    const browser = await chromium.launch({
      headless: config.headless,
      proxy: config.proxies && config.proxies.length > 0
        ? { server: config.proxies[workerId % config.proxies.length] }
        : undefined,
      ignoreHTTPSErrors: true, // Also ignore SSL errors at launch
    });

    try {
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: this.userAgents[this.randomBetween(0, this.userAgents.length - 1)],
        ignoreHTTPSErrors: true, // Ignore SSL errors
      });
      const page = await context.newPage();

      for (let i = 0; i < config.visitsPerWorker; i++) {
        if (signal.aborted) break;

        // First, do pre-visit if configured
        if (config.preVisitUrls && config.preVisitUrls.length > 0) {
          const preUrl = config.preVisitUrls[Math.floor(Math.random() * config.preVisitUrls.length)];
          try {
            this.emitLog("info", `Worker ${workerId}: Pre-visiting ${preUrl}`);
            await page.goto(preUrl, { waitUntil: "networkidle", timeout: 30000 });
            
            // Add realistic behavior
            await this.randomDelay(500, 1500);
            // Extract domain from preUrl
            let preDomain = '';
            try {
              const urlObj = new URL(preUrl);
              preDomain = urlObj.hostname;
            } catch {}
            
            await this.simulateHumanBehavior(page, signal, preDomain);
            
            if (config.preVisitScroll) {
              await this.randomScroll(page, signal);
            }

            const preStayDuration = config.preVisitStayDuration + this.randomBetween(-1000, 1000);
            if (!signal.aborted && preStayDuration > 0) {
              await new Promise((resolve) => setTimeout(resolve, preStayDuration));
            }
          } catch (err) {
            this.emitLog("warn", `Worker ${workerId}: Pre-visit failed for ${preUrl}: ${(err as Error).message}`);
          }
        }

        // Now visit the target URL
        const url = config.urls[Math.floor(Math.random() * config.urls.length)];
        // Extract domain from target url
        let targetDomain = '';
        try {
          const urlObj = new URL(url);
          targetDomain = urlObj.hostname;
        } catch {}
        
        const startTime = Date.now();
        let success = false;

        try {
          this.emitLog("info", `Worker ${workerId}: Visiting ${url}`);
          await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
          
          // Realistic human behavior
          await this.randomDelay(800, 2000);
          await this.simulateHumanBehavior(page, signal, targetDomain);
          
          if (config.scroll) {
            await this.randomScroll(page, signal);
          }

          // Randomize stay duration
          const randomStayDuration = config.stayDuration + this.randomBetween(-2000, 3000);
          const finalStayDuration = Math.max(2000, randomStayDuration);
          
          if (!signal.aborted) {
            await new Promise((resolve) => setTimeout(resolve, finalStayDuration));
          }
          
          success = true;
          this.successfulVisits++;
        } catch (err) {
          this.emitLog("error", `Worker ${workerId}: Failed to visit ${url}: ${(err as Error).message}`);
          this.failedVisits++;
        }

        this.totalVisits++;
        const durationMs = Date.now() - startTime;

        this.sendEvent({
          kind: "visit",
          url,
          success,
          timestamp: new Date().toISOString(),
          durationMs,
          workerId,
        });
      }

      await context.close();
    } finally {
      await browser.close();
      this.activeWorkers--;
      
      if (this.activeWorkers === 0) {
        this.status = "stopped";
        this.emitStatus();
        this.emitLog("info", "Traffic generation completed");
      }
    }
  }


}

export const trafficManager = new TrafficManager();

const handlers: {
  [C in IpcChannel]: (req: unknown) => Promise<unknown>;
} = {
  "redirect:create": async (req) => {
    const input = ipcContract["redirect:create"].request.parse(req);
    const link = redirectStore.createLink(input);
    return { slug: link.slug, shortUrl: `${getBaseUrl()}/${link.slug}`, link };
  },
  "redirect:list": async () => {
    return { baseUrl: getBaseUrl(), links: redirectStore.listLinks() };
  },
  "redirect:delete": async (req) => {
    const { slug } = ipcContract["redirect:delete"].request.parse(req);
    return { deleted: redirectStore.deleteLink(slug) };
  },
  "traffic:start": async (req) => {
    const config = ipcContract["traffic:start"].request.parse(req);
    await trafficManager.start(config);
    return { success: true };
  },
  "traffic:stop": async () => {
    await trafficManager.stop();
    return { success: true };
  },
  "traffic:status": async () => {
    return trafficManager.getStatus();
  },
};

export function registerIpcRouter(): void {
  for (const channel of Object.keys(ipcContract) as IpcChannel[]) {
    ipcMain.handle(channel, async (_event, rawRequest) => {
      const spec = ipcContract[channel];
      try {
        const request = spec.request.parse(rawRequest);
        const result = await handlers[channel](request);
        return { ok: true, data: spec.response.parse(result) };
      } catch (err) {
        log.error({ channel, err }, "ipc handler failed");
        return { ok: false, error: toProblem(err) };
      }
    });
  }
  log.info({ channels: Object.keys(ipcContract).length }, "IPC router registered");
}
