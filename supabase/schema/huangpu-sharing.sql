-- Declarative schema for activity-only publication and its small metadata.
-- Full HR backups are not supported by this service. Apply explicitly; this is
-- not a generated migration. Existing installations need an explicit ALTER to
-- tighten the state envelope constraint to 16 KiB; CREATE IF NOT EXISTS does not.
begin;

create table if not exists public.hp_shared_workspaces (
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
  reader_hash text not null check (reader_hash ~ '^[0-9a-f]{64}$'),
  editor_hash text not null check (editor_hash ~ '^[0-9a-f]{64}$'),
  state_payload jsonb not null,
  published_payload jsonb not null,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  updated_at timestamptz not null default now(),
  constraint hp_shared_workspaces_distinct_roles check (reader_hash <> editor_hash),
  constraint hp_shared_workspaces_state_envelope check (
    jsonb_typeof(state_payload) = 'object'
    and state_payload ?& array['encoding', 'data', 'sha256']
    and state_payload - array['encoding', 'data', 'sha256'] = '{}'::jsonb
    and state_payload ->> 'encoding' = 'gzip-base64'
    and jsonb_typeof(state_payload -> 'data') = 'string'
    and length(state_payload ->> 'data') > 0
    and state_payload ->> 'data' !~ '[^A-Za-z0-9+/=]'
    and jsonb_typeof(state_payload -> 'sha256') = 'string'
    and state_payload ->> 'sha256' ~ '^[0-9a-f]{64}$'
    -- Envelope values are ASCII and cannot contain spaces. Removing JSONB's
    -- formatting spaces gives the same encoded byte count as JSON.stringify.
    and octet_length(replace(state_payload::text, ' ', '')) <= 16384
  ),
  constraint hp_shared_workspaces_published_envelope check (
    jsonb_typeof(published_payload) = 'object'
    and published_payload ?& array['encoding', 'data', 'sha256']
    and published_payload - array['encoding', 'data', 'sha256'] = '{}'::jsonb
    and published_payload ->> 'encoding' = 'gzip-base64'
    and jsonb_typeof(published_payload -> 'data') = 'string'
    and length(published_payload ->> 'data') > 0
    and published_payload ->> 'data' !~ '[^A-Za-z0-9+/=]'
    and jsonb_typeof(published_payload -> 'sha256') = 'string'
    and published_payload ->> 'sha256' ~ '^[0-9a-f]{64}$'
    and octet_length(replace(published_payload::text, ' ', '')) <= 2097152
  )
);

alter table public.hp_shared_workspaces enable row level security;
revoke all privileges on table public.hp_shared_workspaces from public, anon, authenticated;
grant select, insert, update on table public.hp_shared_workspaces to service_role;

-- No anon/authenticated RLS policies: only the service-role Edge Function may
-- access this table. Bearer capabilities are stored as hashes, never plaintext.
comment on table public.hp_shared_workspaces is
  'Activity-only published view and small publication metadata; no HR backups. Access only through the authenticated share Edge Function.';
comment on column public.hp_shared_workspaces.state_payload is
  'Gzip envelope of format/contentHash/sourceUpdatedAt metadata only; 16 KiB encoded and 8 KiB decoded limit in the Edge Function.';
comment on column public.hp_shared_workspaces.reader_hash is
  'Lowercase SHA-256 hex of the UTF-8 43-character base64url reader token.';
comment on column public.hp_shared_workspaces.editor_hash is
  'Lowercase SHA-256 hex of the UTF-8 43-character base64url editor token.';

commit;
