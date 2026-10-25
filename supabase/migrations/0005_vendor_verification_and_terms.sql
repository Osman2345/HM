alter table public.users
  add column if not exists vendor_terms_accepted_at timestamptz,
  add column if not exists vendor_terms_version text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  account_role public.user_role;
  accepted_at timestamptz;
begin
  account_role := case
    when coalesce(new.raw_user_meta_data->>'role', 'user') in ('user', 'vendor')
      then coalesce(new.raw_user_meta_data->>'role', 'user')::public.user_role
    else 'user'::public.user_role
  end;

  if account_role = 'vendor' then
    if nullif(btrim(new.raw_user_meta_data->>'business_name'), '') is null
       or nullif(new.raw_user_meta_data->>'vendor_terms_version', '') is null
       or nullif(new.raw_user_meta_data->>'vendor_terms_accepted_at', '') is null then
      raise exception 'Vendor business details and acceptance of vendor terms are required';
    end if;
    accepted_at := (new.raw_user_meta_data->>'vendor_terms_accepted_at')::timestamptz;
  end if;

  insert into public.users (
    id,
    fullname,
    email,
    role,
    vendor_status,
    business_name,
    business_description,
    business_document_url,
    vendor_terms_accepted_at,
    vendor_terms_version
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'fullname', split_part(new.email, '@', 1)),
    new.email,
    account_role,
    case when account_role = 'vendor' then 'pending' else 'approved' end,
    nullif(btrim(new.raw_user_meta_data->>'business_name'), ''),
    new.raw_user_meta_data->>'business_description',
    new.raw_user_meta_data->>'business_document_url',
    accepted_at,
    nullif(new.raw_user_meta_data->>'vendor_terms_version', '')
  );

  return new;
end;
$$;

update storage.buckets
   set public = false,
       file_size_limit = 10485760,
       allowed_mime_types = array[
         'application/pdf',
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/heic',
         'image/heif'
       ]
 where id = 'vendor-documents';
