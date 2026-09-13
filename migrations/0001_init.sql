create extension if not exists "pgcrypto";

create table if not exists task (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  status           text not null default 'uploaded',
  source_filename  text,
  audio_path       text,
  duration_seconds real,
  language         text default 'swa',
  provider         text default 'elevenlabs',
  provider_model   text default 'scribe_v1',
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  delivered_at     timestamptz,
  paid_at          timestamptz
);

create table if not exists segment (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid not null references task(id) on delete cascade,
  idx              integer not null,
  start_seconds    real not null,
  end_seconds      real not null,
  raw_speaker      text,
  original_text    text not null,
  edited_text      text not null,
  speaker_override text,
  confirmed        boolean not null default false,
  updated_at       timestamptz not null default now(),
  constraint segment_task_idx_unique unique (task_id, idx)
);
create index if not exists segment_task_idx on segment (task_id, idx);

create table if not exists speaker_map (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references task(id) on delete cascade,
  raw_speaker text not null,
  label       text not null,
  constraint speaker_map_task_raw_unique unique (task_id, raw_speaker)
);

create table if not exists glossary_term (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid references task(id) on delete cascade,
  wrong      text not null,
  -- "right" is a reserved word in SQL; it must stay quoted in raw statements.
  "right"    text not null,
  created_at timestamptz not null default now()
);
create index if not exists glossary_term_task_idx on glossary_term (task_id);

create table if not exists job (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references task(id) on delete cascade,
  state      text not null default 'queued',
  attempts   integer not null default 0,
  last_error text,
  run_after  timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists job_claim_idx on job (state, run_after);
