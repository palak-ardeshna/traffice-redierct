import { useState, useEffect, useCallback } from "react";
import type { RedirectLink } from "@flowpilot/ipc-contracts";

export function RedirectTab(): JSX.Element {
  const [destUrl, setDestUrl] = useState("");
  const [adScript, setAdScript] = useState("");
  const [adDirectUrl, setAdDirectUrl] = useState("");
  const [title, setTitle] = useState("Preparing your link");
  const [delaySeconds, setDelaySeconds] = useState(5);

  const [baseUrl, setBaseUrl] = useState("");
  const [links, setLinks] = useState<RedirectLink[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const refresh = useCallback(async () => {
    const res = await window.trafficguru.invoke("redirect:list", {});
    if (res.ok) {
      setBaseUrl(res.data.baseUrl);
      setLinks(res.data.links);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = async () => {
    setError("");
    const res = await window.trafficguru.invoke("redirect:create", {
      destUrl: destUrl.trim(),
      adScript: adScript.trim() || undefined,
      adDirectUrl: adDirectUrl.trim() || undefined,
      title: title.trim() || undefined,
      delaySeconds,
    });
    if (!res.ok) {
      setError(res.error.detail || res.error.title);
      return;
    }
    setDestUrl("");
    setAdScript("");
    setAdDirectUrl("");
    await refresh();
  };

  const remove = async (slug: string) => {
    await window.trafficguru.invoke("redirect:delete", { slug });
    await refresh();
  };

  const copy = (url: string) => {
    void navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(""), 1500);
  };

  return (
    <div className="content" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="config-section">
        <h2>Create a monetized link</h2>

        <div className="form-group">
          <label>Destination URL (your website)</label>
          <input
            type="text"
            value={destUrl}
            onChange={(e) => setDestUrl(e.target.value)}
            placeholder="https://your-website.com/page"
          />
        </div>

        <div className="form-group">
          <label>Adsterra ad script(s) — shown during the wait</label>
          <textarea
            value={adScript}
            onChange={(e) => setAdScript(e.target.value)}
            rows={3}
            placeholder="Paste Social Bar / Banner / Popunder tag(s). Optional if you use a Direct Link."
          />
        </div>

        <div className="form-group">
          <label>Adsterra Direct Link — opens in a new tab on Continue</label>
          <input
            type="text"
            value={adDirectUrl}
            onChange={(e) => setAdDirectUrl(e.target.value)}
            placeholder="https://www.effectiveratecpm.com/... (optional)"
          />
        </div>

        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label>Page title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Wait (sec)</label>
            <input
              type="number"
              min={0}
              max={30}
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="button-row">
          <button className="btn btn-primary" onClick={create} disabled={!destUrl.trim()}>
            Create link
          </button>
        </div>

        {error && (
          <div className="status-badge status-idle" style={{ marginTop: 16, color: "var(--error)" }}>
            {error}
          </div>
        )}
      </div>

      <div className="stats-section">
        <h2>Your links {baseUrl && <span style={{ fontSize: 12, color: "var(--muted)" }}>({baseUrl})</span>}</h2>
        {links.length === 0 && <p style={{ color: "var(--muted)", fontSize: 14 }}>No links yet.</p>}
        {links.map((l) => {
          const url = `${baseUrl}/${l.slug}`;
          return (
            <div key={l.slug} className="stat-card" style={{ textAlign: "left", marginBottom: 12 }}>
              <div style={{ fontWeight: 600, wordBreak: "break-all", marginBottom: 4 }}>{url}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", wordBreak: "break-all" }}>→ {l.destUrl}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                {l.clicks} clicks · {l.uniqueVisitors} new · {l.adViews} ad views
              </div>
              <div className="button-row" style={{ marginTop: 10, gap: 8 }}>
                <button className="btn btn-primary" style={{ padding: "8px 14px" }} onClick={() => copy(url)}>
                  {copied === url ? "Copied!" : "Copy"}
                </button>
                <button className="btn btn-danger" style={{ padding: "8px 14px" }} onClick={() => remove(l.slug)}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
