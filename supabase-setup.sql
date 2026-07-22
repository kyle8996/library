-- ============================================================
-- DK邻里少儿英语 · 绘本借阅系统 · Supabase 初始化 SQL
-- 复制以下内容到 Supabase 后台 → SQL Editor 执行即可
-- ============================================================

-- 1. 借阅记录表
create table if not exists public.library_borrowings (
  id            uuid primary key default gen_random_uuid(),
  child_name    text not null,
  class_name    text,
  teacher_name  text,
  book_photo    text,                       -- 封面图片 URL（Storage）或 base64
  borrow_date   date not null,
  due_date      date not null,
  status        text not null default 'borrowed',  -- borrowed | returned
  commitments   jsonb,                      -- 爱书承诺勾选记录
  returned_at   timestamptz,
  created_at    timestamptz default now()
);

create index if not exists idx_borrowings_child on public.library_borrowings (child_name);
create index if not exists idx_borrowings_status on public.library_borrowings (status);

-- 开启行级安全（RLS）
alter table public.library_borrowings enable row level security;

-- 2. 公开策略（适合家长公开扫码填写的内部小工具）
--    注意：此方案对匿名用户开放增/查/改/删，便于无登录使用。
--    若你希望更严格，可后续改为仅允许 insert/select，并把归还操作放到带密码的管理页。
drop policy if exists "allow insert" on public.library_borrowings;
create policy "allow insert" on public.library_borrowings
  for insert to anon, authenticated with check (true);

drop policy if exists "allow select" on public.library_borrowings;
create policy "allow select" on public.library_borrowings
  for select to anon, authenticated using (true);

drop policy if exists "allow update" on public.library_borrowings;
create policy "allow update" on public.library_borrowings
  for update to anon, authenticated using (true) with check (true);

drop policy if exists "allow delete" on public.library_borrowings;
create policy "allow delete" on public.library_borrowings
  for delete to anon, authenticated using (true);

-- 3. 图书封面图片存储桶（公开读，允许匿名上传）
insert into storage.buckets (id, name, public)
values ('book-covers', 'book-covers', true)
on conflict (id) do nothing;

drop policy if exists "book-covers public read" on storage.objects;
create policy "book-covers public read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'book-covers');

drop policy if exists "book-covers public upload" on storage.objects;
create policy "book-covers public upload" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'book-covers');

-- 完成 ✅ 执行后把 config.js 里的 SUPABASE_URL / SUPABASE_ANON_KEY 填上即可使用
