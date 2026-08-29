-- CITY LIFE RENTAL - STORAGE + AGREEMENT UPGRADE
-- Run this ONCE in Supabase SQL Editor before deploying v3.

-- Extra agreement fields used by the cloud app.
alter table public.rental_agreements
  add column if not exists terms text,
  add column if not exists renter_initials text;

-- Private storage buckets. public=false means files are not directly public.
insert into storage.buckets (id, name, public)
values
  ('customer-documents','customer-documents',false),
  ('inspection-photos','inspection-photos',false),
  ('signatures','signatures',false)
on conflict (id) do update set public = false;

-- Remove prior City Life policies if this upgrade is rerun.
drop policy if exists "clc customer docs select" on storage.objects;
drop policy if exists "clc customer docs insert" on storage.objects;
drop policy if exists "clc customer docs update" on storage.objects;
drop policy if exists "clc customer docs delete" on storage.objects;
drop policy if exists "clc inspection photos select" on storage.objects;
drop policy if exists "clc inspection photos insert" on storage.objects;
drop policy if exists "clc inspection photos update" on storage.objects;
drop policy if exists "clc inspection photos delete" on storage.objects;
drop policy if exists "clc signatures select" on storage.objects;
drop policy if exists "clc signatures insert" on storage.objects;
drop policy if exists "clc signatures update" on storage.objects;
drop policy if exists "clc signatures delete" on storage.objects;

-- Customer IDs / insurance: owner, manager, rental agent only.
create policy "clc customer docs select" on storage.objects
for select to authenticated
using (bucket_id='customer-documents' and public.has_role(array['owner','manager','rental_agent']));
create policy "clc customer docs insert" on storage.objects
for insert to authenticated
with check (bucket_id='customer-documents' and public.has_role(array['owner','manager','rental_agent']));
create policy "clc customer docs update" on storage.objects
for update to authenticated
using (bucket_id='customer-documents' and public.has_role(array['owner','manager','rental_agent']))
with check (bucket_id='customer-documents' and public.has_role(array['owner','manager','rental_agent']));
create policy "clc customer docs delete" on storage.objects
for delete to authenticated
using (bucket_id='customer-documents' and public.has_role(array['owner','manager']));

-- Inspection photos: operational staff including maintenance.
create policy "clc inspection photos select" on storage.objects
for select to authenticated
using (bucket_id='inspection-photos' and public.has_role(array['owner','manager','rental_agent','maintenance']));
create policy "clc inspection photos insert" on storage.objects
for insert to authenticated
with check (bucket_id='inspection-photos' and public.has_role(array['owner','manager','rental_agent','maintenance']));
create policy "clc inspection photos update" on storage.objects
for update to authenticated
using (bucket_id='inspection-photos' and public.has_role(array['owner','manager','rental_agent','maintenance']))
with check (bucket_id='inspection-photos' and public.has_role(array['owner','manager','rental_agent','maintenance']));
create policy "clc inspection photos delete" on storage.objects
for delete to authenticated
using (bucket_id='inspection-photos' and public.has_role(array['owner','manager']));

-- Electronic signatures: operations staff only; delete restricted to management.
create policy "clc signatures select" on storage.objects
for select to authenticated
using (bucket_id='signatures' and public.has_role(array['owner','manager','rental_agent']));
create policy "clc signatures insert" on storage.objects
for insert to authenticated
with check (bucket_id='signatures' and public.has_role(array['owner','manager','rental_agent']));
create policy "clc signatures update" on storage.objects
for update to authenticated
using (bucket_id='signatures' and public.has_role(array['owner','manager','rental_agent']))
with check (bucket_id='signatures' and public.has_role(array['owner','manager','rental_agent']));
create policy "clc signatures delete" on storage.objects
for delete to authenticated
using (bucket_id='signatures' and public.has_role(array['owner','manager']));
