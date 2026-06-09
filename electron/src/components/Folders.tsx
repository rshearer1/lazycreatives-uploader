import { pickFolder } from "../api";
import { Button } from "./ui";

// Add/remove the folders the app watches for new renders. Shared by Setup + Settings.
export function Folders({ sources, onChange }: {
  sources: string[]; onChange: (s: string[]) => void;
}) {
  async function add() {
    const p = await pickFolder();
    if (p && !sources.includes(p)) onChange([...sources, p]);
  }
  return (
    <div>
      <div className="stack" style={{ marginBottom: 10 }}>
        {sources.length === 0 && (
          <div className="sub" style={{ margin: 0 }}>No folders yet — add the folder you render mixes into.</div>
        )}
        {sources.map((s) => (
          <div key={s} className="row" style={{ marginBottom: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
            </svg>
            <div className="row__main"><div className="row__title">{s}</div></div>
            <Button sm onClick={() => onChange(sources.filter((x) => x !== s))}>Remove</Button>
          </div>
        ))}
      </div>
      <Button kind="ghost" onClick={add}>+ Add folder</Button>
    </div>
  );
}
