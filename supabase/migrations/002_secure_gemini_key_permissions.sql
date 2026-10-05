-- ============================================================
-- NoteNow: Migration 002 - Secure Column Privileges & Views
-- ข้อจำกัด: ไม่มีการเพิ่ม/แก้ไขคอลัมน์หรือตารางใดๆ
-- วัตถุประสงค์:
-- 1. ปิดสิทธิ์ SELECT คอลัมน์ลับ (gemini_api_key_enc, google_token) สำหรับ anon & authenticated
-- 2. เปิดให้ Client อ่านได้เฉพาะ Safe Columns
-- 3. สร้าง View ให้เข้าถึงสถานะ has_gemini_key ได้อย่างปลอดภัย
-- ============================================================

-- 1. ยกเลิกสิทธิ์ SELECT บนตาราง users ทั้งหมดสำหรับบทบาทฝั่งไคลเอนต์
revoke select on table public.users from anon, authenticated;

-- 2. อนุญาตให้อ่านเฉพาะคอลัมน์ที่ปลอดภัยสำหรับ authenticated role เท่านั้น
grant select (
  user_id,
  auth_id,
  email,
  first_name,
  last_name,
  profile_image,
  role,
  created_at,
  updated_at
) on table public.users to authenticated;

-- หมายเหตุ: คอลัมน์ต่อไปนี้จะไม่ได้รับสิทธิ์ SELECT สำหรับ authenticated / anon:
-- - gemini_api_key_enc
-- - google_access_token_enc
-- - google_refresh_token_enc
-- - google_token_expires_at
-- เฉพาะ service_role (Backend API Server) เท่านั้นที่มีสิทธิ์อ่าน/เขียนคอลัมน์ลับเหล่านี้

-- 3. ตรวจสอบให้แน่ใจว่า RLS บนตาราง users ยังคงบังคับใช้เฉพาะแถวของตนเอง
alter table public.users enable row level security;

-- ตรวจสอบหรือสร้าง Policy ให้ผู้ใช้ select/update เฉพาะแถวของตนเอง
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select using (auth_id = auth.uid());

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update using (auth_id = auth.uid())
  with check (auth_id = auth.uid());

-- 4. สร้าง Secure View เพื่อให้ Client หรือ Dashboard สามารถตรวจสอบสถานะ has_gemini_key ได้โดยตรง
create or replace view public.users_profile as
select
  user_id,
  auth_id,
  email,
  first_name,
  last_name,
  profile_image,
  role,
  (gemini_api_key_enc is not null) as has_gemini_key,
  created_at,
  updated_at
from public.users;

-- กำหนดให้ View ทำงานภายใต้สิทธิ์ RLS ของผู้เรียก (security_invoker)
alter view public.users_profile set (security_invoker = on);
grant select on public.users_profile to authenticated;

-- 5. ตรวจสอบ Admin Report Function ให้รายงานเฉพาะ Boolean has_gemini_key
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
        group by u.user_id, u.email, u.first_name, u.last_name, (u.gemini_api_key_enc is not null)
        order by summary_count desc
      ) t
    )
  ) into result;
  return result;
end;
$$;
