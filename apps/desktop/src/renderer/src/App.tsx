import { useState, useEffect, useRef } from "react";
import type { IpcRequest, TrafficEvent } from "@flowpilot/ipc-contracts";
import { RedirectTab } from "./RedirectTab";

type Tab = "traffic" | "redirect";

export function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>("traffic");

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="logo">🚀</span> Traffic Guru
        </div>
        <p className="subtitle">Generate traffic & create monetized redirect links</p>
      </header>

      <nav className="tabs">
        <button className={`tab ${tab === "traffic" ? "active" : ""}`} onClick={() => setTab("traffic")}>
          Traffic
        </button>
        <button className={`tab ${tab === "redirect" ? "active" : ""}`} onClick={() => setTab("redirect")}>
          Redirect Links
        </button>
      </nav>

      {tab === "traffic" ? <TrafficTab /> : <RedirectTab />}
    </div>
  );
}

function TrafficTab(): JSX.Element {
  const [urls, setUrls] = useState("https://example.com");
  const [preVisitUrls, setPreVisitUrls] = useState("");
  const [preVisitScroll, setPreVisitScroll] = useState(true);
  const [preVisitStayDuration, setPreVisitStayDuration] = useState(5000);
  const [workers, setWorkers] = useState(3);
  const [visitsPerWorker, setVisitsPerWorker] = useState(10);
  const [scroll, setScroll] = useState(true);
  const [scrollDuration, setScrollDuration] = useState(2000);
  const [stayDuration, setStayDuration] = useState(5000);
  const [proxies, setProxies] = useState("");
  const [headless, setHeadless] = useState(true);
  const [status, setStatus] = useState<"idle" | "starting" | "running" | "stopping" | "stopped" | "error">("idle");
  const [totalVisits, setTotalVisits] = useState(0);
  const [successfulVisits, setSuccessfulVisits] = useState(0);
  const [failedVisits, setFailedVisits] = useState(0);
  const [activeWorkers, setActiveWorkers] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  useEffect(() => {
    // Subscribe to traffic events
    const unsubscribe = window.trafficguru.onTrafficEvent((event: TrafficEvent) => {
      if (event.kind === "status") {
        setStatus(event.status);
        // Also fetch the latest status to get all stats
        window.trafficguru.invoke("traffic:status", {}).then((res) => {
          if (res.ok) {
            setTotalVisits(res.data.totalVisits);
            setSuccessfulVisits(res.data.successfulVisits);
            setFailedVisits(res.data.failedVisits);
            setActiveWorkers(res.data.activeWorkers);
          }
        });
      } else if (event.kind === "log") {
        const timestamp = new Date(event.timestamp).toLocaleTimeString();
        setLogs((prev) => [...prev, `[${timestamp}] [${event.level.toUpperCase()}] ${event.message}`]);
      } else if (event.kind === "visit") {
        // We'll get the full stats from the status update, but let's still log it
        const timestamp = new Date(event.timestamp).toLocaleTimeString();
        const statusEmoji = event.success ? "✅" : "❌";
        setLogs((prev) => [...prev, `[${timestamp}] Worker ${event.workerId} ${statusEmoji} ${event.url} (${event.durationMs}ms)`]);
      }
    });

    // Fetch initial status
    window.trafficguru.invoke("traffic:status", {}).then((res) => {
      if (res.ok) {
        setStatus(res.data.status);
        setTotalVisits(res.data.totalVisits);
        setSuccessfulVisits(res.data.successfulVisits);
        setFailedVisits(res.data.failedVisits);
        setActiveWorkers(res.data.activeWorkers);
      }
    });

    return unsubscribe;
  }, []);

  const startTraffic = async () => {
    const urlList = urls.split("\n")
      .map((u) => u.trim().replace(/^[`"'']+|[`"'']+$/g, "")) // Remove quotes/backticks
      .filter((u) => u.length > 0);
    const preVisitUrlList = preVisitUrls.split("\n")
      .map((u) => u.trim().replace(/^[`"'']+|[`"'']+$/g, "")) // Remove quotes/backticks
      .filter((u) => u.length > 0);
    const proxyList = proxies.split("\n")
      .map((p) => p.trim().replace(/^[`"'']+|[`"'']+$/g, "")) // Remove quotes/backticks
      .filter((p) => p.length > 0);

    const config: IpcRequest<"traffic:start"> = {
      urls: urlList,
      preVisitUrls: preVisitUrlList.length > 0 ? preVisitUrlList : undefined,
      preVisitScroll: preVisitScroll,
      preVisitStayDuration: preVisitStayDuration,
      workers: workers,
      visitsPerWorker: visitsPerWorker,
      scroll: scroll,
      scrollDuration: scrollDuration,
      stayDuration: stayDuration,
      proxies: proxyList.length > 0 ? proxyList : undefined,
      headless: headless,
    };

    // Reset stats
    setTotalVisits(0);
    setSuccessfulVisits(0);
    setFailedVisits(0);
    setLogs([]);

    const result = await window.trafficguru.invoke("traffic:start", config);
    if (!result.ok) {
      alert(`Error: ${result.error.title} - ${result.error.detail}`);
    }
  };

  const stopTraffic = async () => {
    const result = await window.trafficguru.invoke("traffic:stop", {});
    if (!result.ok) {
      alert(`Error: ${result.error.title} - ${result.error.detail}`);
    }
  };

  return (
    <>
      <div className="content">
        <div className="config-section">
          <h2>Configuration</h2>

          <div className="form-group">
            <label>Pre-Visit URLs (Ad/Referral links, one per line)</label>
            <textarea
              value={preVisitUrls}
              onChange={(e) => setPreVisitUrls(e.target.value)}
              disabled={status === "running" || status === "starting" || status === "stopping"}
              placeholder="https://adsterra-link.com&#10;https://referral-site.com"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>Target URLs (your website, one per line)</label>
            <textarea
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              disabled={status === "running" || status === "starting" || status === "stopping"}
              placeholder="https://your-website.com&#10;https://your-other-site.com"
              rows={3}
            />
          </div>

          <div className="form-row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={preVisitScroll}
                onChange={(e) => setPreVisitScroll(e.target.checked)}
                disabled={status === "running" || status === "starting" || status === "stopping"}
              />
              Scroll on Pre-Visit URLs
            </label>
            <div className="form-group" style={{ minWidth: "180px" }}>
              <label>Pre-Visit Stay (ms)</label>
              <input
                type="number"
                min="1000"
                value={preVisitStayDuration}
                onChange={(e) => setPreVisitStayDuration(Number(e.target.value))}
                disabled={status === "running" || status === "starting" || status === "stopping"}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Workers ({workers})</label>
              <input
                type="range"
                min="1"
                max="20"
                value={workers}
                onChange={(e) => setWorkers(Number(e.target.value))}
                disabled={status === "running" || status === "starting" || status === "stopping"}
              />
            </div>
            <div className="form-group">
              <label>Visits per worker</label>
              <input
                type="number"
                min="1"
                value={visitsPerWorker}
                onChange={(e) => setVisitsPerWorker(Number(e.target.value))}
                disabled={status === "running" || status === "starting" || status === "stopping"}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Scroll duration (ms)</label>
              <input
                type="number"
                min="500"
                value={scrollDuration}
                onChange={(e) => setScrollDuration(Number(e.target.value))}
                disabled={status === "running" || status === "starting" || status === "stopping"}
              />
            </div>
            <div className="form-group">
              <label>Stay duration (ms)</label>
              <input
                type="number"
                min="1000"
                value={stayDuration}
                onChange={(e) => setStayDuration(Number(e.target.value))}
                disabled={status === "running" || status === "starting" || status === "stopping"}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Proxies (one per line, optional)</label>
            <textarea
              value={proxies}
              onChange={(e) => setProxies(e.target.value)}
              disabled={status === "running" || status === "starting" || status === "stopping"}
              placeholder="http://proxy1:port&#10;http://proxy2:port"
              rows={3}
            />
          </div>

          <div className="form-row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={scroll}
                onChange={(e) => setScroll(e.target.checked)}
                disabled={status === "running" || status === "starting" || status === "stopping"}
              />
              Enable scrolling
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={headless}
                onChange={(e) => setHeadless(e.target.checked)}
                disabled={status === "running" || status === "starting" || status === "stopping"}
              />
              Headless mode
            </label>
          </div>

          <div className="button-row">
            <button
              className="btn btn-primary"
              onClick={startTraffic}
              disabled={status === "running" || status === "starting" || status === "stopping"}
            >
              Start Traffic
            </button>
            <button
              className="btn btn-danger"
              onClick={stopTraffic}
              disabled={status !== "running" && status !== "starting"}
            >
              Stop
            </button>
          </div>
        </div>

        <div className="stats-section">
          <h2>Statistics</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{totalVisits}</div>
              <div className="stat-label">Total Visits</div>
            </div>
            <div className="stat-card success">
              <div className="stat-value">{successfulVisits}</div>
              <div className="stat-label">Successful</div>
            </div>
            <div className="stat-card error">
              <div className="stat-value">{failedVisits}</div>
              <div className="stat-label">Failed</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{activeWorkers}</div>
              <div className="stat-label">Active Workers</div>
            </div>
          </div>
          <div className={`status-badge status-${status}`}>
            Status: {status.charAt(0).toUpperCase() + status.slice(1)}
          </div>
        </div>
      </div>

      <div className="logs-section">
        <h2>Logs</h2>
        <div className="logs-container">
          {logs.map((log, i) => (
            <div key={i} className="log-line">{log}</div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>
    </>
  );
}
