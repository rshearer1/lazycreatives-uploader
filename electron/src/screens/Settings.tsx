import { useState } from "react";
import { makeApi } from "../api";
import type { Account, Config, Entitlement, Sharing } from "../types";
import { Button, ProBadge } from "../components/ui";
import { Folders } from "../components/Folders";
import { ConnectPanel } from "../components/Connect";

const api = makeApi();

export function Settings({ cfg, account, ent, onCfg, onAccount, onEnt }: {
  cfg: Config; account: Account; ent: Entitlement;
  onCfg: (c: Config) => void; onAccount: (a: Account) => void; onEnt: (e: Entitlement) => void;
}) {
  const [draft, setDraft] = useState<Config>(cfg);
  const [savedFlash, setSavedFlash] = useState(false);
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseError, setLicenseError] = useState<string | null>(null);

  function set<K extends keyof Config>(k: K, v: Config[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  async function save() {
    const saved = await api.saveSettings(draft);
    setDraft(saved); onCfg(saved);
    setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500);
  }

  async function activate() {
    setLicenseError(null);
    try { onEnt(await api.activateLicense(licenseKey.trim())); setLicenseKey(""); }
    catch (e) { setLicenseError(String((e as Error).message)); }
  }
  async function deactivate() { onEnt(await api.deactivateLicense()); }

  const canAuto = ent.features.auto_upload;

  return (
    <div>
      <h1>Settings</h1>
      <div className="sub">Folders, defaults, automation, and your account.</div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>SoundCloud account</h2>
        <ConnectPanel account={account} onChange={onAccount} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Watched folders</h2>
        <Folders sources={draft.sources} onChange={(s) => set("sources", s)} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Upload defaults</h2>
        <label className="field">
          <span>Title template</span>
          <input type="text" value={draft.title_template}
            onChange={(e) => set("title_template", e.target.value)} placeholder="{name}" />
        </label>
        <label className="field">
          <span>Default release</span>
          <select value={draft.default_sharing} onChange={(e) => set("default_sharing", e.target.value as Sharing)}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>
        <label className="field">
          <span>Genre</span>
          <input type="text" value={draft.default_genre}
            onChange={(e) => set("default_genre", e.target.value)} placeholder="e.g. House" />
        </label>
        <label className="field">
          <span>Tags (comma-separated)</span>
          <input type="text" value={draft.default_tags.join(", ")}
            onChange={(e) => set("default_tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} />
        </label>
        <label className="field">
          <span>Default description</span>
          <textarea value={draft.default_description}
            onChange={(e) => set("default_description", e.target.value)} />
        </label>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Automation {!canAuto && <ProBadge />}</h2>
        <p className="sub" style={{ marginTop: 0 }}>
          Watch your folders and publish new renders automatically.
        </p>
        <label className="field" style={{ opacity: canAuto ? 1 : 0.55 }}>
          <span>Check every (minutes) — 0 = off</span>
          <input type="number" min={0} max={44640} disabled={!canAuto}
            value={draft.interval_minutes}
            onChange={(e) => set("interval_minutes", Math.max(0, Number(e.target.value) || 0))} />
        </label>
        {!canAuto && (
          <div className="locked-note">Automatic watch-folder uploads are a Pro feature.</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 24 }}>
        <Button kind="primary" onClick={save}>Save settings</Button>
        {savedFlash && <span className="pill pill--ok">Saved</span>}
      </div>

      <div className="card">
        <h2>Plan</h2>
        {ent.tier === "free" ? (
          <>
            <p className="sub" style={{ marginTop: 0 }}>
              You're on <b>Free</b>. Pro unlocks auto-upload, batch publishing, scheduled
              release and more.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="text" placeholder="Licence key" value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)} style={{ flex: 1 }} />
              <Button kind="primary" onClick={activate} disabled={!licenseKey.trim()}>Activate</Button>
            </div>
            {licenseError && <div className="locked-note" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{licenseError}</div>}
          </>
        ) : (
          <div className="row-spread">
            <div><span className="pill pill--ok">● {ent.tier.toUpperCase()}</span> All features unlocked.</div>
            <Button sm onClick={deactivate}>Deactivate</Button>
          </div>
        )}
      </div>
    </div>
  );
}
