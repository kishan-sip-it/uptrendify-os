-- Secure private storage for tenant-owned brand logos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-assets',
  'brand-assets',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists brand_assets_select_member on storage.objects;
drop policy if exists brand_assets_insert_operator on storage.objects;
drop policy if exists brand_assets_update_operator on storage.objects;
drop policy if exists brand_assets_delete_operator on storage.objects;

create policy brand_assets_select_member
on storage.objects
for select
to authenticated
using (
  bucket_id = 'brand-assets'
  and private.is_org_member((storage.foldername(name))[1]::uuid)
);

create policy brand_assets_insert_operator
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'brand-assets'
  and private.has_org_role(
    (storage.foldername(name))[1]::uuid,
    array['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]
  )
);

create policy brand_assets_update_operator
on storage.objects
for update
to authenticated
using (
  bucket_id = 'brand-assets'
  and private.has_org_role(
    (storage.foldername(name))[1]::uuid,
    array['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]
  )
)
with check (
  bucket_id = 'brand-assets'
  and private.has_org_role(
    (storage.foldername(name))[1]::uuid,
    array['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]
  )
);

create policy brand_assets_delete_operator
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'brand-assets'
  and private.has_org_role(
    (storage.foldername(name))[1]::uuid,
    array['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]
  )
);
