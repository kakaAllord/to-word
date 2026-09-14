# Deploying to-word on Railway

One repository, one Railway service, one volume, one Neon database. Start to
finish this is about ten minutes, most of it waiting for the first build.

---

## 1. Neon (2 minutes)

1. Create a project at [neon.tech](https://neon.tech).
2. On the dashboard, copy the connection string — take the **pooled** one. Its
   host contains `-pooler`, like
   `ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech`.
   The unpooled endpoint runs out of connections once the web app and the
   worker are both talking to it.
3. Keep `?sslmode=require` on the end. That is the whole database setup —
   tables are created automatically on the first boot.

## 2. GitHub

```bash
git push -u origin main
```

The remote is already configured as `git@github.com:kakaAllord/to-word.git`.

There is no password in the repository. You choose one the first time you open
the deployed app, and it is stored as a bcrypt hash in the database.

## 3. Railway (5 minutes)

**New Project → Deploy from GitHub repo → `kakaAllord/to-word`.**

Railway sees the `Dockerfile` and builds it. ffmpeg, the web server, the queue
worker and the migrations are all inside that image — there is no second
service to create and nothing to wire together.

### Variables

Service → **Variables** → add exactly two:

```
DATABASE_URL        postgres://…-pooler….neon.tech/neondb?sslmode=require
ELEVENLABS_API_KEY  sk_…
```

`PORT` is injected by Railway. Everything else defaults sensibly:

| Not set | What happens |
|---|---|
| `AUDIO_DIR` | the attached volume is detected and used |
| `SESSION_SECRET` | derived from `DATABASE_URL`, stable across deploys |
| `APP_PASSWORD` | the app asks you to choose a password on first open |

To change the password later, use **Password** in the app's sidebar.
`APP_PASSWORD` is the way back in if you are ever locked out: set it, sign in,
remove it.

### Volume — do not skip this

Service → **Settings → Volumes → Add Volume**, mount path:

```
/data/audio
```

Railway wipes the container filesystem on every deploy and restart. Without the
volume, audio uploaded before a deploy is gone after it, and any task still
being proofread loses its audio. Transcripts, edits and confirmations live in
Postgres and are safe either way — but you would have to re-upload.

The app detects the volume by itself. If it is missing, every page carries a red
banner saying so, and the deploy logs open with a warning block. There is no
way to have this misconfigured and not know.

### Domain

Service → **Settings → Networking → Generate Domain**, or **Custom Domain** and
point a `CNAME` at the value Railway gives you. Nothing in the app needs to know
its own URL, so no variable to update.

### Health check

`railway.json` already sets it: path `/api/health`, 300 s timeout. It returns
the database state, whether the worker has checked in recently, and whether the
ElevenLabs key is set. Only a dead database fails the check — a missing key or a
just-restarted worker is reported but will not roll back a working deploy.

## 4. First run

1. Open the domain. It asks you to choose a password — **do this immediately**,
   because whoever opens it first is the one who sets it.
2. Upload a short file first — two or three minutes of audio — and watch the
   task go `transcribing → proofreading`.
3. Map the speakers (`R`, `I`, `I2`), proofread, export the `.docx`.

If transcription fails, the task page shows ElevenLabs' own error message and a
**Retry transcription** button. The audio is still on the volume, so retrying
never means uploading again.

---

## Day to day

- **Deploys are safe.** Migrations are idempotent and run at every boot; tasks,
  segments, edits and confirmations are all in Neon.
- **Mark tasks paid.** That deletes the audio file and keeps the transcript, so
  volume usage stays flat as work accumulates. The sidebar doubles as the
  invoicing view.
- **Logs.** `[start …]` is the supervisor, `[worker …]` is the queue. If the
  worker crashes it is restarted automatically, with backoff, and the UI warns
  you while it is down.
- **Scaling apart**, if you ever want to: create a second service from the same
  repo with start command `npm run worker`, attach the same volume at
  `/data/audio`, and give it `DATABASE_URL` and `ELEVENLABS_API_KEY`. The
  supervisor in the first service can then be dropped down to
  `npm run start:web`.

## If something is wrong

| Symptom | Cause |
|---|---|
| Red banner: storage is not persistent | No volume attached, or `AUDIO_DIR` points somewhere else. Attach one at `/data/audio`. |
| Red banner: worker is not running | Check the logs for `[worker]`. It restarts itself; a permanent failure is usually a bad `DATABASE_URL`. |
| Health check failing on deploy | The database is unreachable. `/api/health` shows the exact driver error. |
| Task stuck on `transcribing` | Worker down (banner will say so) or Scribe is rate-limiting; the job retries with backoff and the task page shows the last error. |
| `401 Invalid API key` on a task | `ELEVENLABS_API_KEY` is wrong. Fix the variable, then press Retry — no re-upload. |

---

## A note on Vercel

Vercel can host the Next.js half, but not this app as a whole: there is no
always-on process for the queue worker, no persistent disk for the audio, and
function request bodies are capped far below a 150 MB upload. Running it there
means the worker on Railway/Fly/Render anyway, plus replacing the volume with
blob storage — a real code change in `src/lib/audio.ts`, the upload route and
`ensureCompressed`, not a setting. Railway with one volume is the shorter path
and the one this repo is built for.
