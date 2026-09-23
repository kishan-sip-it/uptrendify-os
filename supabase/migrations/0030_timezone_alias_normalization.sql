-- 0030_timezone_alias_normalization.sql
begin;

update public.organizations
set timezone = 'Asia/Kolkata'
where timezone = 'Asia/Calcutta';

update public.user_profiles
set timezone = 'Asia/Kolkata'
where timezone = 'Asia/Calcutta';

commit;
