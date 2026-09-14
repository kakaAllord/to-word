# to-word

Proofread machine transcripts of Swahili field-interview audio against the
audio, and hand the client a clean `.docx`.

One audio file = one task = one invoice ($10).

## Deploying (the short version)

Push this repo, add it to Railway, paste two variables, attach a volume,
generate a domain, start working. Full walkthrough: **[DEPLOY.md](DEPLOY.md)**.

```
DATABASE_URL        your Neon pooled connection string
ELEVENLABS_API_KEY  your ElevenLabs key
```

Everything else has a working default: the container runs the web app, the
queue worker, the database migrations and ffmpeg by itself.

## What it does

1. Upload a 45–60 minute `.m4a` (80–150 MB).
2. It is compressed to 16 kHz mono Opus and sent to ElevenLabs Scribe.
3. You proofread while listening, correcting in place.
4. Export `.docx` (or `.md`) in the client's house style.

Verbatim is a feature. Nothing here strips filler words, fixes grammar,
de-duplicates repetitions or "improves" the text. The machine transcript is
kept untouched under every segment (`original_text`); only your edits
(`edited_text`) are ever exported.

## How it is put together

```
one container ──┬── web (Next.js)  ──┬── Neon Postgres
                └── worker (Node) ───┘
                        │
                   audio volume ──> ElevenLabs Scribe
```

`npm start` runs the migrations, then supervises both processes: the worker is
restarted automatically if it dies, and if the web server dies the container
exits so the platform restarts it. Transcription never runs inside an HTTP
request — the web app queues a job and returns immediately.

Everything durable lives in Postgres or on the mounted volume. A redeploy must
never cost an afternoon of proofreading, so if the volume is missing the app
says so, loudly, on every page.

You can still split it into two services (`npm run start:web` and
`npm run worker` sharing one volume) if you ever want to scale them apart.

## Signing in

One password, no accounts, and **no password anywhere in this repository**. The
first time you open a fresh deployment it asks you to choose one; it is hashed
with bcrypt and stored in the database. Every visit after that just asks for it.

Because the first visitor sets the password, open the app and set it as soon as
the first deploy goes green.

Change it later at **Password** in the sidebar. Locked out? Set `APP_PASSWORD`
in the Railway service variables — it overrides the stored password for as long
as it is set, so you can get in, remove the variable, and carry on.

## Running it on your PC

```bash
cp .env.example .env          # add ELEVENLABS_API_KEY
docker compose up --build     # http://localhost:3000
```

Without Docker (needs Postgres 16 and ffmpeg on PATH):

```bash
npm install
export DATABASE_URL=postgres://...
npm run dev          # terminal 1
npm run worker:dev   # terminal 2
```

## Keyboard (desktop)

All of these work with the cursor inside a text box, because you type and
control playback at the same time.

| Key | Action |
|---|---|
| `Ctrl+Space` | play / pause |
| `Ctrl+←` / `Ctrl+→` | seek back / forward 5 s |
| `Ctrl+↑` / `Ctrl+↓` | previous / next segment |
| `Ctrl+Enter` | confirm this segment and move to the next |
| `Ctrl+\` | cycle speed 0.75 / 1 / 1.25 / 1.5 |

## Progress and saving

Progress is a `confirmed` flag on every segment, not a bookmark — skipping
ahead to check something never loses your place, and "jump to first
unconfirmed" is always right.

Edits save per segment ~800 ms after you stop typing, and are mirrored to
`localStorage` immediately. If the connection drops or the tab dies mid-edit,
the next load reconciles the cache against the server, pushes anything newer,
and tells you it recovered it.

## Environment

| Variable | Required | Default |
|---|---|---|
| `DATABASE_URL` | yes | — (Neon **pooled** string) |
| `ELEVENLABS_API_KEY` | yes | — |
| `APP_PASSWORD` / `APP_PASSWORD_HASH` | no | the password you set on first run |
| `AUDIO_DIR` | no | the Railway volume, else `/data/audio` |
| `SESSION_SECRET` | no | derived from `DATABASE_URL` |
| `MAX_UPLOAD_MB` | no | 200 |
| `FFMPEG_PATH` | no | `ffmpeg` on PATH |

## Layout of the code

```
migrations/           hand-written SQL, applied in order at every boot
scripts/start.ts      container entrypoint: migrate + supervise web & worker
src/db/               Drizzle schema, lazy pool, migration runner
src/providers/        TranscriptionProvider interface + ElevenLabs (Scribe)
src/worker/           queue loop, ffmpeg compression, the pipeline
src/lib/              auth/session, glossary, speakers, export, audio ranges
src/app/api/          route handlers, all behind withAuth()
src/components/       Workbench (the proofreading UI), player, mapper, dialogs
```

## Provider choice

ElevenLabs Scribe was chosen after testing five providers against a
human-produced ground truth. Do not swap it without re-testing: Speechmatics
scored better on the raw metric only because it transcribed 26% less, and its
errors read as fluent prose (`linalooza` "rots" → `linaloweza` "can"), which is
far more expensive to catch than Scribe's audibly-wrong errors.

Known Scribe behaviour this app is built around:

- Numbers come back as Swahili words. No automatic conversion is attempted —
  it is ambiguous enough to corrupt the transcript silently. Use the glossary
  for recurring cases.
- Domain acronyms come back wrong (`MIVAF` for `MIVARF`); the seeded global
  glossary fixes them.
- Diarization is unreliable in both directions, so speaker mapping is
  many-to-one and there is a per-segment override.
- `language_probability` is meaningless here (0.152 on audio it transcribed
  well); no logic reads it.
