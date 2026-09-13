'use client';

/** Shown in the UI, not configurable (spec 8.3). */
const SHORTCUTS: [string, string][] = [
  ['Ctrl + Space', 'Play / pause'],
  ['Ctrl + ←  /  Ctrl + →', 'Seek back / forward 5 seconds'],
  ['Ctrl + ↑  /  Ctrl + ↓', 'Previous / next segment'],
  ['Ctrl + Enter', 'Confirm this segment and move to the next'],
  ['Ctrl + \\', 'Cycle speed 0.75 / 1 / 1.25 / 1.5'],
];

export default function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="dialog-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard shortcuts</h2>
        <p className="small muted">
          All of these work while the cursor is inside a text box, so you can type and control
          playback at the same time.
        </p>
        <div className="shortcuts">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys}>
              <kbd>{keys}</kbd>
              <span>{action}</span>
            </div>
          ))}
        </div>
        <button className="primary" onClick={onClose} style={{ marginTop: '1rem' }}>
          Close
        </button>
      </div>
    </div>
  );
}
