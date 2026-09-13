'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

/**
 * Upload with real progress. The file streams to the server as the raw request
 * body (XHR, not fetch, because fetch gives no upload progress), and the server
 * streams it straight to the volume — a 150 MB .m4a is never held in memory.
 */
export default function UploadPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(selected: File | null) {
    setFile(selected);
    setError(null);
    if (selected && !name.trim()) {
      setName(selected.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    }
  }

  function upload() {
    if (!file) return;
    setError(null);
    setProgress(0);

    const query = new URLSearchParams({
      name: name.trim() || file.name,
      filename: file.name,
    });
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/upload?${query.toString()}`);
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(event.loaded / event.total);
    };
    xhr.onerror = () => {
      setProgress(null);
      setError('Upload failed: the connection dropped. Nothing was saved; try again.');
    };
    xhr.onload = () => {
      setProgress(null);
      let payload: { id?: string; error?: string } = {};
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        payload = {};
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload.id) {
        setFile(null);
        setName('');
        if (inputRef.current) inputRef.current.value = '';
        router.push(`/tasks/${payload.id}`);
        router.refresh();
      } else {
        setError(payload.error || `Upload failed (HTTP ${xhr.status}).`);
      }
    };
    xhr.send(file);
  }

  const busy = progress !== null;

  return (
    <div className="card">
      <h2>New task</h2>
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
      <div className="row" style={{ alignItems: 'flex-end', gap: '0.75rem' }}>
        <label style={{ flex: '1 1 240px' }}>
          <span className="small muted">Task name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="AMCOS Mamba Same"
            disabled={busy}
          />
        </label>
        <label style={{ flex: '1 1 240px' }}>
          <span className="small muted">Audio file</span>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.m4a,.mp3,.wav,.ogg,.opus,.aac,.flac"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            disabled={busy}
            style={{ padding: '0.35rem' }}
          />
        </label>
        <button className="primary" onClick={upload} disabled={!file || busy}>
          {busy ? 'Uploading…' : 'Upload and transcribe'}
        </button>
      </div>

      {busy && (
        <div style={{ marginTop: '0.8rem' }}>
          <span className="bar" style={{ display: 'block' }}>
            <span style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </span>
          <p className="small muted" style={{ margin: '0.35rem 0 0' }}>
            {Math.round((progress ?? 0) * 100)}% uploaded. Keep this tab open until it finishes;
            transcription itself runs on the server and you can close the tab once it starts.
          </p>
        </div>
      )}

      {!busy && (
        <p className="small muted" style={{ margin: '0.7rem 0 0' }}>
          The file is compressed to 16 kHz mono Opus on the server, then sent to ElevenLabs
          Scribe. A 50-minute interview usually takes a few minutes.
        </p>
      )}
    </div>
  );
}
