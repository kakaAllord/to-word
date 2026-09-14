-- The operator's password, chosen on first run and stored only as a bcrypt
-- hash. Nothing about it lives in the repository or in the image.
create table if not exists app_auth (
  id            text primary key,
  password_hash text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
