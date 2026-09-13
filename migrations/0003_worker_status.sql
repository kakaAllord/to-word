-- Liveness of the queue worker, so the app can tell the operator "nothing is
-- processing your file" instead of leaving a task stuck on "transcribing".
create table if not exists worker_status (
  id        text primary key,
  last_seen timestamptz not null default now(),
  note      text
);
