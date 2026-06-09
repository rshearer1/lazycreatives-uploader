import { useEffect, useState } from "react";
import { makeApi } from "../api";
import type { Account, Overview } from "../types";
import { Button, fmtBytes, ProBadge } from "../components/ui";
import { ConnectPanel } from "../components/Connect";

const api = makeApi();

export function Home({ account, onAccount, onUpload }: {
  account: Account; onAccount: (a: Account) => void; onUpload: () => void;
}) {
  const [ov, setOv] = useState<Overview | null>(null);
  useEffect(() => { api.overview().then(setOv).catch(() => setOv(null)); }, [account]);

  const tiles = [
    { label: "Published", value: ov ? String(ov.uploaded_count) : "—", hint: ov ? fmtBytes(ov.uploaded_bytes) : "" },
    { label: "Errors", value: ov ? String(ov.error_count) : "—", hint: ov?.error_count ? "needs attention" : "all clear" },
    { label: "Auto-upload", value: ov?.schedule.enabled ? "On" : "Off",
      hint: ov?.schedule.enabled ? `every ${ov.schedule.interval_minutes} min` : "manual" },
    { label: "Last upload", value: ov?.last_upload ? ov.last_upload.slice(5, 16) : "—",
      hint: ov?.last_upload ? (ov.last_upload_ok ? "ok" : "failed") : "nothing yet" },
  ];

  return (
    <div>
      <h1>Home</h1>
      <div className="sub">Your SoundCloud publishing, on autopilot.</div>

      {ov?.mock && (
        <div className="banner banner--demo">
          🎧 Demo mode — no SoundCloud credentials are configured, so uploads go to a
          simulated account. Add your API keys to publish for real.
        </div>
      )}

      {!account.connected ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Connect your account</h2>
          <ConnectPanel account={account} onChange={onAccount} />
        </div>
      ) : null}

      <div className="grid-tiles" style={{ marginBottom: 20 }}>
        {tiles.map((t, i) => (
          <div key={t.label} className="tile tile--enter" style={{ ["--i" as any]: i }}>
            <div className="tile__label">{t.label}</div>
            <div className="tile__value">{t.value}</div>
            <div className="tile__hint">{t.hint}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="row-spread">
          <div>
            <div style={{ fontWeight: 650, fontSize: 15 }}>Ready to publish</div>
            <div className="sub" style={{ margin: "2px 0 0" }}>
              Scan your watched folders and upload new mixes.
            </div>
          </div>
          <Button kind="primary" onClick={onUpload} disabled={!account.connected}>
            Upload now
          </Button>
        </div>
        {ov && ov.tier === "free" && (
          <div className="locked-note">
            <span>Want hands-off publishing?</span>
            <b>Auto-upload a watched folder<ProBadge /></b>
            <span>— upgrade in Settings.</span>
          </div>
        )}
      </div>
    </div>
  );
}
