-- ============================================================
-- NoteNow: Database Schema Migration (Supabase-compatible)
-- 5 tables: users, folders, documents, ai_summaries, notes
-- Includes: indexes, RLS (auth.uid()), updated_at triggers,
--           auth trigger, admin report functions
-- ============================================================

-- =========================
-- 1. TABLES
-- =========================

create table users (
  user_id            bigint generated always as identity primary key,
  auth_id            uuid unique,  -- links to auth.users.id
  email              varchar(150) not null unique,
  first_name         varchar(100),
  last_name          varchar(100),
  profile_image      text,
  role               char(1) not null default 'U' check (role in ('U','A')),
  -- secrets: store ciphertext only
  google_access_token_enc   text,
  google_refresh_token_enc  text,
  google_token_expires_at   timestamptz,
  gemini_api_key_enc        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table folders (
  folder_id          bigint generated always as identity primary key,
  folder_name        varchar(150) not null,
  parent_folder_id   bigint references folders(folder_id) on delete cascade,
  user_id            bigint not null references users(user_id) on delete cascade,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table documents (
  document_id        bigint generated always as identity primary key,
  document_name      varchar(255) not null,
  file_type          varchar(20)  not null default 'pdf',
  google_file_id     text not null,
  google_file_url    text,
  file_size          bigint,
  connected_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  user_id            bigint not null references users(user_id) on delete cascade,
  folder_id          bigint references folders(folder_id) on delete set null,
  unique (user_id, google_file_id)
);

create table ai_summaries (
  summary_id         bigint generated always as identity primary key,
  summary_content    text not null,
  created_at         timestamptz not null default now(),
  document_id        bigint not null references documents(document_id) on delete cascade,
  user_id            bigint not null references users(user_id) on delete cascade
);

create table notes (
  note_id            bigint generated always as identity primary key,
  note_type          char(1) not null check (note_type in ('D','T','H')),
  content            jsonb   not null,
  page_number        int     not null check (page_number >= 1),
  position_x         double precision not null check (position_x between 0 and 1),
  position_y         double precision not null check (position_y between 0 and 1),
  color              varchar(20),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  document_id        bigint not null references documents(document_id) on delete cascade,
  user_id            bigint not null references users(user_id) on delete cascade
);

-- =========================
-- 2. INDEXES
-- =========================

create index idx_users_auth_id on users(auth_id);
create index idx_folders_user_parent on folders(user_id, parent_folder_id);
create index idx_documents_user_folder on documents(user_id, folder_id);
create index idx_ai_summaries_document on ai_summaries(document_id);
create index idx_notes_document_page on notes(document_id, page_number);

-- =========================
-- 3. updated_at TRIGGER
-- =========================

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_users_updated_at
  before update on users
  for each row execute function update_updated_at_column();

create trigger trg_folders_updated_at
  before update on folders
  for each row execute function update_updated_at_column();

create trigger trg_documents_updated_at
  before update on documents
  for each row execute function update_updated_at_column();

create trigger trg_notes_updated_at
  before update on notes
  for each row execute function update_updated_at_column();

-- =========================
-- 4. HELPER FUNCTION
-- =========================

-- Maps auth.uid() → users.user_id for RLS policies
create or replace function get_my_user_id()
returns bigint
language sql
stable
security definer
as $$
  select user_id from users where auth_id = auth.uid()
$$;

-- =========================
-- 5. ROW LEVEL SECURITY (RLS)
-- =========================

alter table users enable row level security;
alter table folders enable row level security;
alter table documents enable row level security;
alter table ai_summaries enable row level security;
alter table notes enable row level security;

-- Users: can read/update only their own row
create policy "users_select_own" on users
  for select using (auth_id = auth.uid());

create policy "users_update_own" on users
  for update using (auth_id = auth.uid());

-- Folders: CRUD only own folders
create policy "folders_select_own" on folders
  for select using (user_id = get_my_user_id());

create policy "folders_insert_own" on folders
  for insert with check (user_id = get_my_user_id());

create policy "folders_update_own" on folders
  for update using (user_id = get_my_user_id());

create policy "folders_delete_own" on folders
  for delete using (user_id = get_my_user_id());

-- Documents: CRUD only own documents
create policy "documents_select_own" on documents
  for select using (user_id = get_my_user_id());

create policy "documents_insert_own" on documents
  for insert with check (user_id = get_my_user_id());

create policy "documents_update_own" on documents
  for update using (user_id = get_my_user_id());

create policy "documents_delete_own" on documents
  for delete using (user_id = get_my_user_id());

-- AI Summaries: CRUD only own summaries
create policy "ai_summaries_select_own" on ai_summaries
  for select using (user_id = get_my_user_id());

create policy "ai_summaries_insert_own" on ai_summaries
  for insert with check (user_id = get_my_user_id());

create policy "ai_summaries_delete_own" on ai_summaries
  for delete using (user_id = get_my_user_id());

-- Notes: CRUD only own notes
create policy "notes_select_own" on notes
  for select using (user_id = get_my_user_id());

create policy "notes_insert_own" on notes
  for insert with check (user_id = get_my_user_id());

create policy "notes_update_own" on notes
  for update using (user_id = get_my_user_id());

create policy "notes_delete_own" on notes
  for delete using (user_id = get_my_user_id());

-- =========================
-- 6. AUTH TRIGGER (auto-create users row on signup)
-- =========================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (auth_id, email, first_name, last_name, profile_image)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'given_name', split_part(new.raw_user_meta_data ->> 'full_name', ' ', 1)),
    coalesce(new.raw_user_meta_data ->> 'family_name', nullif(split_part(new.raw_user_meta_data ->> 'full_name', ' ', 2), '')),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (auth_id) do update set
    email = excluded.email,
    first_name = coalesce(excluded.first_name, public.users.first_name),
    last_name = coalesce(excluded.last_name, public.users.last_name),
    profile_image = coalesce(excluded.profile_image, public.users.profile_image);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =========================
-- 7. ADMIN REPORT FUNCTIONS (security definer — bypasses RLS)
-- =========================

create or replace function admin_user_stats()
returns json
language plpgsql
security definer
as $$
declare
  result json;
begin
  select json_build_object(
    'total_users', (select count(*) from users),
    'admin_count', (select count(*) from users where role = 'A'),
    'user_count',  (select count(*) from users where role = 'U')
  ) into result;
  return result;
end;
$$;

create or replace function admin_document_stats()
returns json
language plpgsql
security definer
as $$
declare
  result json;
begin
  select json_build_object(
    'total_documents', (select count(*) from documents),
    'per_user', (
      select json_agg(row_to_json(t))
      from (
        select u.user_id, u.email, u.first_name, u.last_name,
               count(d.document_id) as document_count
        from users u
        left join documents d on d.user_id = u.user_id
        group by u.user_id, u.email, u.first_name, u.last_name
        order by document_count desc
      ) t
    )
  ) into result;
  return result;
end;
$$;

create or replace function admin_summary_stats()
returns json
language plpgsql
security definer
as $$
declare
  result json;
begin
  select json_build_object(
    'total_summaries', (select count(*) from ai_summaries),
    'per_user', (
      select json_agg(row_to_json(t))
      from (
        select u.user_id, u.email, u.first_name, u.last_name,
               count(s.summary_id) as summary_count,
               (u.gemini_api_key_enc is not null) as has_gemini_key
        from users u
        left join ai_summaries s on s.user_id = u.user_id
        group by u.user_id, u.email, u.first_name, u.last_name, u.gemini_api_key_enc
        order by summary_count desc
      ) t
    )
  ) into result;
  return result;
end;
$$;
