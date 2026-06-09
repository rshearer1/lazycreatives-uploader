import { useRef, useState } from "react";
import { makeApi, openExternal } from "../api";
import type { Account } from "../types";
import { Button } from "./ui";

const api = makeApi();

// Drives the SoundCloud sign-in: POST /api/connect, open the browser to the auth
// URL (skipped in mock mode, which connects instantly), then poll until the
// loopback callback completes. Reused by Setup, Home and Settings.
export function ConnectPanel({ account, onChange }: {
  account: Account; onChange: (a: Account) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  async function start() {
    setError(null); setBusy(true);
    try {
      const { connect_id, auth_url, status } = await api.connect();
      if (auth_url) openExternal(auth_url);
      if (status === "connected") return finish();
      // poll the loopback callback result
      const deadline = Date.now() + 300_000;
      const tick = async () => {
        try {
          const s = await api.connectStatus(connect_id);
          if (s.status === "connected") return finish();
          if (s.status === "failed") { setError(s.error || "Sign-in failed."); setBusy(false); return; }
        } catch { /* keep polling */ }
        if (Date.now() < deadline) pollRef.current = window.setTimeout(tick, 1200);
        else { setError("Sign-in timed out."); setBusy(false); }
      };
      pollRef.current = window.setTimeout(tick, 1200);
    } catch (e) {
      setError(String((e as Error).message)); setBusy(false);
    }
  }

  async function finish() {
    if (pollRef.current) window.clearTimeout(pollRef.current);
    setBusy(false);
    onChange(await api.account());
  }

  async function disconnect() {
    await api.disconnect();
    onChange(await api.account());
  }

  if (account.connected) {
    return (
      <div className="row-spread">
        <div>
          <span className="pill pill--ok">● Connected</span>{" "}
          <b>{account.account || "SoundCloud"}</b>
          {account.mock && <span className="pill" style={{ marginLeft: 8 }}>demo mode</span>}
        </div>
        <Button sm onClick={disconnect}>Disconnect</Button>
      </div>
    );
  }
  return (
    <div>
      <Button kind="sc" onClick={start} disabled={busy}>
        {busy ? "Waiting for browser…" : account.mock ? "Connect (demo account)" : "Connect SoundCloud"}
      </Button>
      {account.mock && (
        <div className="sub" style={{ margin: "8px 0 0", fontSize: 12 }}>
          No SoundCloud API credentials configured yet — connecting uses a built-in
          demo account so you can try the whole flow offline.
        </div>
      )}
      {error && <div className="locked-note" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{error}</div>}
    </div>
  );
}
