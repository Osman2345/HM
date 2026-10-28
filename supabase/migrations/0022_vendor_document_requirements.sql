create table if not exists public.vendor_documents (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.users(id) on delete cascade,
  document_type text not null check (document_type in ('national_id', 'hotel_document', 'business_document')),
  file_url text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (vendor_id, document_type)
);

create index if not exists vendor_documents_vendor_idx on public.vendor_documents(vendor_id, document_type);
alter table public.vendor_documents enable row level security;

drop policy if exists "vendor_documents_select_own_or_admin" on public.vendor_documents;
create policy "vendor_documents_select_own_or_admin" on public.vendor_documents
for select using (
  public.is_admin() or exists (
    select 1 from public.users u where u.id = auth.uid() and u.id = vendor_documents.vendor_id
  )
);

drop policy if exists "vendor_documents_insert_own" on public.vendor_documents;
create policy "vendor_documents_insert_own" on public.vendor_documents
for insert with check (
  exists (
    select 1 from public.users u where u.id = auth.uid() and u.id = vendor_documents.vendor_id
  )
);

drop policy if exists "vendor_documents_no_client_update_delete" on public.vendor_documents;
create policy "vendor_documents_no_client_update_delete" on public.vendor_documents
for update using (false)
with check (false);

drop policy if exists "vendor_documents_no_client_delete" on public.vendor_documents;
create policy "vendor_documents_no_client_delete" on public.vendor_documents
for delete using (false);

update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']
where id = 'vendor-documents';
