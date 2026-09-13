# Transcription Workbench — Implementation Spec

## 1. What this is

A single-operator web app for a freelance transcriptionist working on Swahili
field-interview audio. He is paid **$10 per completed audio file**. One audio
file = one task = one invoice.

The workflow the app must support:

1. Upload an audio file (typically 45–60 min, 80–150 MB, `.m4a`).
2. The app compresses it, sends it to a transcription API, and stores the result.
3. He proofreads the machine transcript **while listening to the audio**,
   correcting as he goes.
4. He exports a clean `.docx` and hands it to the client.

Step 3 is where all his time goes and is therefore where all the design effort
goes. Everything else is plumbing.

He works from a PC at home and sometimes from a phone. The app is hosted so he
can pick up work from either.

---

## 2. Evidence behind the technical choices

These decisions came from testing five providers on the operator's real audio
against a human-produced ground-truth transcript. Do not substitute a different
provider without re-testing.

| Provider | Score | Verdict |
|---|---|---|
| **ElevenLabs Scribe** | 43.7% | **Chosen.** Best real-world output. |
| Speechmatics | 56.3% | Rejected — scored high by transcribing 26% less |
| Groq Whisper | 21.3% | Rejected — hallucinates fluent invented text |
| Soniox | untested | Requires paid balance |
| Gemini | untested | No free tier on the available models |

Speechmatics scored higher on the raw metric but was rejected after reading the
output. It silently dropped the interviewer's short acknowledgements ("okay"
appeared 8 times in Scribe's output and 0 times in Speechmatics'), and it made
meaning-destroying single-word errors: `linalooza` ("rots") became `linaloweza`
("can"), and `ya udongo` ("because of soil") became `ya dini ya udongo`
("because of the religion of soil"). Scribe's errors are audibly wrong and
therefore fixable; Speechmatics' errors read as fluent prose and are not.

Groq Whisper additionally hallucinated entire English paragraphs that were never
spoken, and looped single words dozens of times.

**Known Scribe weaknesses to design around:**

- Writes numbers as Swahili words, never digits. `elfu mbili na kumi na nne`
  = 2014. `mia sita` = 600. The client's deliverable uses digits.
- Gets domain acronyms wrong: writes `MIVAF` for `MIVARF`.
- Diarization is unreliable **in both directions** — it returned 4 speaker IDs
  for 3 people in one section and 3 IDs where 4 people spoke in another.
- Reported `language_probability` of 0.152 for audio it then transcribed well.
  Do not gate any logic on that value.

---

## 3. Non-goals

Explicitly out of scope. Do not build these.

- **No multi-user accounts.** One operator, one password. No registration, no
  password reset, no roles, no email.
- **No real-time / word-by-word streaming transcription.** Scribe returns a
  whole file at once. There is no live text to stream.
- **No native mobile app.** Responsive web only.
- **No automatic text cleanup.** Never strip filler words, fix grammar,
  de-duplicate repetitions, or "improve" the transcript. The client's house
  style is strict verbatim.
- **No AI summarisation, translation, or sentiment features.**
- **No collaborative editing or comments.**

---

## 4. Architecture

Three deployed pieces:

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Web app    │────▶│  Neon        │◀────│  Worker     │
│  (Next.js)  │     │  Postgres    │     │  (Node)     │
└─────────────┘     └──────────────┘     └─────────────┘
       │                                        │
       │            ┌──────────────┐            │
       └───────────▶│ Volume       │◀───────────┘
                    │ (audio)      │            │
                    └──────────────┘            ▼
                                         ElevenLabs API
```

**Stack:** Next.js + TypeScript (web + API routes), a separate Node worker
process, Drizzle ORM against Neon Postgres, audio on a mounted volume. One repo,
two Railway services.

### Critical deployment constraints

**Railway's filesystem is ephemeral.** It is wiped on every deploy and restart.
Anything that must survive goes in Postgres or on an explicitly mounted volume.
Losing an afternoon of proofreading to a routine redeploy is the single worst
failure this app can have.

**Use Neon's pooled connection string**, not the direct one. Two services
opening connections against the unpooled endpoint will exhaust it.

**Transcription must not run inside an HTTP request.** A Scribe call on a
50-minute file takes minutes; a retry after a rate limit can take longer. The
web app enqueues a job and returns immediately. The worker polls the queue.

---

## 5. Data model

```sql
-- One row per audio file per invoice.
task
  id                uuid primary key
  name              text not null          -- operator-supplied, e.g. "AMCOS Mamba Same"
  status            text not null          -- see lifecycle below
  source_filename   text
  audio_path        text                   -- path on volume, null after deletion
  duration_seconds  real
  language          text default 'swa'
  provider          text default 'elevenlabs'
  provider_model    text default 'scribe_v1'
  error             text                   -- last failure message, if any
  created_at        timestamptz
  updated_at        timestamptz
  delivered_at      timestamptz
  paid_at           timestamptz

-- One row per diarized turn. This is the unit of editing.
segment
  id                uuid primary key
  task_id           uuid references task on delete cascade
  idx               integer not null       -- display order, 0-based
  start_seconds     real not null
  end_seconds       real not null
  raw_speaker       text                   -- provider's label, e.g. "speaker_0"
  original_text     text not null          -- never mutated after insert
  edited_text       text not null          -- starts equal to original_text
  confirmed         boolean default false
  updated_at        timestamptz
  unique (task_id, idx)

-- Maps provider speaker ids to the labels the client expects.
-- Many raw ids may map to one label.
speaker_map
  id                uuid primary key
  task_id           uuid references task on delete cascade
  raw_speaker       text not null
  label             text not null          -- "R", "I", "I2"
  unique (task_id, raw_speaker)

-- Find-and-replace terms. task_id null = applies to every task.
glossary_term
  id                uuid primary key
  task_id           uuid references task on delete cascade  -- nullable
  wrong             text not null
  right             text not null
  created_at        timestamptz

-- Queue. Worker claims rows with FOR UPDATE SKIP LOCKED.
job
  id                uuid primary key
  task_id           uuid references task on delete cascade
  state             text not null          -- queued | running | done | failed
  attempts          integer default 0
  last_error        text
  run_after         timestamptz            -- for backoff
  created_at        timestamptz
```

### Task lifecycle

```
uploaded → transcribing → proofreading → delivered → paid
                ↓
             failed  (retryable back to transcribing)
```

The sidebar shows status per task. This doubles as the operator's invoicing
view — he can see at a glance what is owed.

---

## 6. Transcription pipeline

Runs entirely in the worker.

### 6.1 Compress

Before sending anything, convert to 16 kHz mono Opus:

```
ffmpeg -i <input> -vn -ac 1 -ar 16000 -c:a libopus -b:a 16k <output>.ogg
```

Every ASR model resamples to 16 kHz mono internally, so this costs zero
accuracy and roughly 95% of the bytes. A 150 MB `.m4a` becomes about 7 MB.

**Store the Opus file, discard the original.** The compressed file is what gets
served back to the browser for playback, so this also keeps streaming cheap on
a slow connection.

### 6.2 Call ElevenLabs

```
POST https://api.elevenlabs.io/v1/speech-to-text
Header: xi-api-key: $ELEVENLABS_API_KEY
Multipart:
  file                <the .ogg>
  model_id            scribe_v1
  language_code       swa
  diarize             true
  tag_audio_events    false
  timestamps_granularity  word
```

`tag_audio_events` must be **false**. With it on, Scribe emitted `[kero]`,
`[ukipiga meza]` and `[kib Ad]` — noise the operator would delete by hand. It
did correctly catch `[ukicheko]` (laughter) a few times, but the ratio is bad.

Handle 429 by reading `retry-after`, then exponential backoff. Mark the job
`failed` with the real API message after 5 attempts. Never swallow an API
error — the operator needs to see it.

### 6.3 Build segments

The response contains a flat `words` array. Each entry has `text`, `start`,
`end`, `type` (`word` | `spacing` | `audio_event`) and `speaker_id`.

Group consecutive words into turns, breaking whenever `speaker_id` changes.
Write one `segment` row per turn with `original_text` and `edited_text` both set
to the turn text.

### 6.4 Apply glossary

After segments are written, run every `glossary_term` for this task plus every
global term (`task_id is null`) as a case-insensitive whole-word replace against
`edited_text`. Leave `original_text` untouched.

Seed the global glossary with:

```
MIVAF   → MIVARF
AMPOS   → AMCOS
Amcos   → AMCOS
```

Set `status = 'proofreading'` when done.

### 6.5 Provider abstraction

Define a `TranscriptionProvider` interface with one method that takes an audio
path and returns `{ turns: [{ speaker, start, end, text }], language }`.
Implement `ElevenLabsProvider` now. The provider name is a column on `task`, so
a future file can be routed elsewhere without touching anything else.

---

## 7. Build order

**Build the audio–transcript binding first, as a vertical slice, before the
sidebar, the queue, the upload flow or any styling.** It is the risky part and
everything else rests on it. If it feels wrong, nothing built on top of it is
worth keeping.

Minimum first milestone — hardcode a task id, seed the database by hand:

- Transcript renders as a list of segments with speaker labels.
- An audio player is fixed to the viewport.
- Clicking any segment seeks the audio to that segment's `start_seconds`.
- While audio plays, the currently-sounding segment is highlighted and scrolls
  itself into view.
- Editing a segment's text saves it.
- Keyboard: play/pause, back 5 s, forward 5 s, and speed change all work
  **while the cursor is inside a text field**.

Get that right, show it to the operator, then build outward:

1. Upload → job → worker → segments (the real pipeline)
2. Task sidebar and lifecycle
3. Speaker mapping screen
4. Glossary management
5. Export
6. Auth and deployment
7. Mobile layout

---

## 8. The proofreading interface

This is the product. Everything else supports it.

### 8.1 Layout

**Do not build two side-by-side panels of original and edited text.** In
practice the operator corrects text in place; a second column consumes half the
screen to show something he needs only occasionally. Give that space to the
audio instead.

Desktop: single column of segments, comfortable reading measure, audio player
pinned to the bottom of the viewport. Sidebar of tasks on the left, collapsible.

Each segment shows: speaker label, the editable text, and a confirm control.
The original machine text is available per-segment on demand — a small "show
original" toggle or a revert-this-segment action — not permanently on screen.

### 8.2 Audio binding

- Click a segment → audio seeks to `start_seconds`.
- Audio playing → the segment covering `currentTime` gets a visible highlight
  and auto-scrolls into view. Suspend auto-scroll while the operator is typing
  or has manually scrolled, and resume on the next seek.
- The player must handle a 50-minute Opus file over a slow connection. Use HTTP
  range requests; do not load the whole file before allowing playback.

### 8.3 Keyboard (desktop)

These must work **while the cursor is in a text input**, since the operator
types and controls playback simultaneously. Use modifier combinations that do
not collide with text editing.

| Key | Action |
|---|---|
| `Ctrl+Space` | play / pause |
| `Ctrl+←` / `Ctrl+→` | seek back / forward 5 s |
| `Ctrl+↑` / `Ctrl+↓` | previous / next segment |
| `Ctrl+Enter` | confirm this segment and move to the next |
| `Ctrl+\` | cycle speed 0.75 / 1 / 1.25 / 1.5 |

Show a shortcuts reference in the UI. Do not make them configurable.

### 8.4 Progress — per segment, not a bookmark

**Progress is a `confirmed` boolean on every segment, not a single cursor
position.** A cursor breaks the moment he skips ahead to check something.

This gives, for free:

- A percentage-complete figure per task (`confirmed / total`).
- A **"jump to first unconfirmed"** action, which is what makes reopening the
  app after a break trivial.
- Per-task progress in the sidebar, so the whole batch is visible at once.

`Ctrl+Enter` confirms and advances. Confirmed segments are visually
de-emphasised but stay editable.

### 8.5 Saving

The operator's connection is unreliable and he must never lose a paragraph.

- Save **per segment**, debounced ~800 ms after typing stops.
- Mirror every edit to `localStorage` keyed by segment id, immediately.
- On load, reconcile: if a cached edit is newer than the server's
  `updated_at`, push it and tell the operator it was recovered.
- Show a small per-segment save state (saving / saved / not saved).
- Never use a save-on-blur-only strategy.

### 8.6 Mobile

Fully capable, not a cut-down view. Same segments, same editing, same confirm.

- No keyboard shortcuts. Large tap targets instead: a persistent bar with
  back-5 s, play/pause, forward-5 s, speed, and confirm.
- Tap a segment to seek; tap again to edit.
- The player bar must not be covered by the on-screen keyboard.

---

## 9. Speaker mapping

Scribe returns `speaker_0`, `speaker_1`, `speaker_2`... The client expects `R`
(respondent), `I` (interviewer) and `I2` (second interviewer).

The mapping is **many-to-one**. Scribe over-split the same person across
multiple ids in testing, so a rename-only UI would leave the operator fixing
labels by hand all day.

Mapping screen, shown after transcription completes:

- List every distinct `raw_speaker` with its share of total words and a
  play-button that plays that speaker's first few seconds.
- For each, assign a label: `R`, `I`, `I2`, or a free-text label.
- Several raw ids may be given the same label.
- Applying writes `speaker_map` rows. Display resolves through the map; it does
  not rewrite `segment` rows.

Also allow per-segment override in the proofreading view — diarization will
occasionally misattribute a single turn and he must be able to fix it inline
without touching the whole mapping.

---

## 10. Glossary

Two scopes: global (applies to every task) and per-task.

- Simple `wrong → right` pairs, case-insensitive, whole-word.
- Managed from a settings screen and from within a task.
- Applied automatically after transcription (§6.4).
- A "re-apply glossary" action on a task, for terms added later. It must only
  touch **unconfirmed** segments — never overwrite work he has already checked.

Seed with the acronyms in §6.4. He will add proper nouns per task
(`Mbaraka Ally`, `Julieth Uroki`, `Mamba Ginger Growers`, `tangawizi`).

**Number conversion:** Scribe writes numbers as Swahili words. Do not attempt
automatic conversion — `elfu mbili na kumi na nne` → `2014` is ambiguous enough
to corrupt data silently. The glossary handles the recurring cases and he types
the rest.

---

## 11. Export

Exports the **edited** text, never the original.

Formats: `.docx` and `.md`. Both must match the client's existing house style:

```
AMCOS_Mamba_Same_MIVARF

R: Naitwa Mbaraka Ally, mimi ni mwenyekiti wa wakulima tangawizi.
I: Mmh wamezoea kukuita mwenyekiti wa kiwanda.
R: Au mwenyekiti wa kiwanda yote sawa. Hahaha
```

- Title line = task name.
- One paragraph per segment, prefixed with the mapped speaker label and a colon.
- Consecutive segments with the same label merge into one paragraph.
- **No timestamps by default.** Timestamps exist to drive audio sync during
  proofreading; they are internal machinery, not part of the deliverable.
  Provide a toggle to include them for the operator's own use.
- Warn before exporting a task with unconfirmed segments, but allow it.

Use `docx` (npm) for Word output. Plain UTF-8 for Markdown.

---

## 12. Auth

Single shared password. No accounts.

- Password comes from the `APP_PASSWORD` environment variable. **Never
  hardcode it and never commit it.** Store a hash (bcrypt or argon2), compare
  on submit.
- On success, set an httpOnly, secure, sameSite=lax session cookie with a long
  expiry (30 days) — he should not re-authenticate daily.
- Every page and every API route is behind the check except the login page
  itself and the health check.
- The ElevenLabs API key lives in `ELEVENLABS_API_KEY` server-side only. It must
  never reach the browser.
- Audio files are served through an authenticated route, not from a public
  static path.

---

## 13. Environment and deployment

```
DATABASE_URL          Neon POOLED connection string
APP_PASSWORD_HASH     bcrypt hash of the operator's password
SESSION_SECRET        random 32+ bytes
ELEVENLABS_API_KEY    server-side only
AUDIO_DIR             mount path of the volume, e.g. /data/audio
MAX_UPLOAD_MB         200
```

Two Railway services from one repo — `web` and `worker` — sharing the database
and the volume. Provide a `docker-compose.yml` or equivalent for local
development so the whole thing runs on his PC without deploying.

### Retention

When a task is marked `paid`, delete its audio file and null `audio_path`.
Segments and the transcript stay forever; they are small. This keeps storage
flat as the work accumulates.

---

## 14. Acceptance criteria

The build is done when all of these are true:

1. Uploading a 50-minute `.m4a` produces a diarized, speaker-labelled transcript
   without any HTTP request timing out.
2. Clicking any segment seeks the audio there, and playing audio highlights and
   scrolls to the current segment.
3. `Ctrl+Space` pauses playback while the cursor is inside a text field.
4. Editing a segment, then killing the browser tab mid-edit, then reopening,
   preserves the edit.
5. Redeploying the app does not lose any task, segment, edit or confirmation.
6. "Jump to first unconfirmed" lands on the right segment after the operator has
   skipped around out of order.
7. Assigning `speaker_1` and `speaker_3` both to `I` relabels both everywhere.
8. Exported `.docx` opens in Word, contains no timestamps, and uses `R:` / `I:` /
   `I2:` prefixes.
9. Re-applying the glossary does not alter any confirmed segment.
10. The whole flow — upload, proofread, confirm, export — is usable on a phone.
11. An ElevenLabs failure surfaces the real API message in the UI and the task
    can be retried without re-uploading.

---

## 15. Build notes

- Verbatim is a feature. Resist every instinct to tidy the text.
- Surface real errors. This operator debugged four transcription APIs from raw
  error strings; hiding a message behind "Something went wrong" actively costs
  him time.
- The transcript is the hero. Typography, line length and contrast in the
  proofreading view matter more than anything else in the app — he will be
  staring at it for hours.
- Prefer boring, obvious implementations. This app needs to still work in six
  months without maintenance.