'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

/**
 * Adding a file is one gesture: click the plus (or drop a file on it) and the
 * upload starts. The task name is taken from the filename and can be renamed
 * later, so nothing stands between the page and the file.
 *
 * The file streams to the server as the raw request body (XHR, not fetch,
 * because fetch gives no upload progress), and the server streams it straight
 * to the volume — a 150 MB .m4a is never held in memory.
 */
export default function UploadPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function upload(file: File) {
    setError(null);
    setProgress(0);

    const name = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    const query = new URLSearchParams({ name: name || file.name, filename: file.name });
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
      if (inputRef.current) inputRef.current.value = '';
      if (xhr.status >= 200 && xhr.status < 300 && payload.id) {
        router.push(`/tasks/${payload.id}`);
        router.refresh();
      } else {
        setError(payload.error || `Upload failed (HTTP ${xhr.status}).`);
      }
    };
    xhr.send(file);
  }

  const busy = progress !== null;
  const percent = Math.round((progress ?? 0) * 100);

  return (
    <>
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.m4a,.mp3,.wav,.ogg,.opus,.aac,.flac"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) upload(picked);
        }}
        hidden
      />

      <button
        type="button"
        className={over ? 'dropzone over' : 'dropzone'}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Add an audio file"
        title="Add an audio file"
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped && !busy) upload(dropped);
        }}
      >
        {busy ? (
          <span className="dropzone-progress">
            <span className="bar" style={{ display: 'block', width: '100%' }}>
              <span style={{ width: `${percent}%` }} />
            </span>
            <span className="small muted">{percent}%</span>
          </span>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M12 5v14M5 12h14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>
    </>
  );
}
