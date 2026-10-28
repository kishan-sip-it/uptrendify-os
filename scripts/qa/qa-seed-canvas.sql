-- Studio canvas QA seed — idempotent. Run with:
-- PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f scripts/qa/qa-seed-canvas.sql
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_confirm_status, email_change_token_current, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', 'b7a00000-0000-4000-8000-00000000c101', 'authenticated', 'authenticated', 'canvas-qa@example.com', crypt('canvas-qa-pass', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', 0, '', '')
on conflict (id) do update set encrypted_password = crypt('canvas-qa-pass', gen_salt('bf'));

insert into auth.identities (id, user_id, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
values ('b7a00000-0000-4000-8000-00000000c101', 'b7a00000-0000-4000-8000-00000000c101', 'email', jsonb_build_object('sub', 'b7a00000-0000-4000-8000-00000000c101', 'email', 'canvas-qa@example.com', 'email_verified', true), now(), now(), now())
on conflict (provider_id, id) do nothing;

insert into organizations (id, name, slug, created_at, updated_at)
values ('b7a00000-0000-4000-8000-00000000c102', 'Canvas QA Org', 'canvas-qa-org', now(), now())
on conflict (id) do nothing;

insert into organization_members (organization_id, user_id, role)
values ('b7a00000-0000-4000-8000-00000000c102', 'b7a00000-0000-4000-8000-00000000c101', 'OWNER')
on conflict do nothing;

insert into clients (id, organization_id, name, slug, created_at, updated_at)
values ('b7a00000-0000-4000-8000-00000000c103', 'b7a00000-0000-4000-8000-00000000c102', 'Canvas QA Client', 'canvas-qa-client', now(), now())
on conflict (id) do nothing;

insert into brands (id, organization_id, client_id, name, slug, website_url, status, analysis_version, created_at, updated_at, secondary_colors, brand_rules, audience_details, offer_details, positioning, messaging, visual_identity)
values ('b7a00000-0000-4000-8000-00000000c104', 'b7a00000-0000-4000-8000-00000000c102', 'b7a00000-0000-4000-8000-00000000c103', 'Canvas QA Brand', 'canvas-qa-brand', 'https://example.com', 'ACTIVE', 1, now(), now(), '{}', '{}', '{}', '{}', '{}', '{}', '{}')
on conflict (id) do nothing;

insert into content_items (id, organization_id, brand_id, type, title, status, created_at, updated_at, context)
values ('b7a00000-0000-4000-8000-00000000c105', 'b7a00000-0000-4000-8000-00000000c102', 'b7a00000-0000-4000-8000-00000000c104', 'SOCIAL_POST', 'Canvas QA Studio Doc', 'DRAFT', now(), now(), '{}')
on conflict (id) do update set title = excluded.title, updated_at = now();

insert into content_versions (id, organization_id, content_item_id, version, body, metadata, created_at)
values ('b7a00000-0000-4000-8000-00000000c106', 'b7a00000-0000-4000-8000-00000000c102', 'b7a00000-0000-4000-8000-00000000c105', 1,
'{"kind":"uptrendify-doc","version":1,"mode":"free","pages":[{"id":"page-1","size":"a4","blocks":[{"id":"blk-edge-shape","type":"shape","shape":"rectangle","color":"#7c5cff","align":"center","width":60,"height":120,"geometry":{"x":0,"y":0,"w":280,"h":170}},{"id":"blk-bottom-circle","type":"shape","shape":"circle","color":"#e0447c","align":"center","width":60,"height":120,"geometry":{"x":300,"y":980,"w":180,"h":180}},{"id":"blk-text","type":"text","text":"Edge selection QA","align":"left","color":null,"bg":null,"size":"md","bold":false,"italic":false,"underline":false,"fontSize":20,"geometry":{"x":320,"y":120,"w":300,"h":48}},{"id":"blk-rot-star","type":"shape","shape":"star","color":"#f5a623","align":"center","width":60,"height":120,"geometry":{"x":120,"y":500,"w":200,"h":200,"rotation":0}}]},{"id":"page-2","size":"square","blocks":[{"id":"blk-p2","type":"heading","text":"Page two","level":2,"align":"left","color":null,"bg":null,"bold":false,"italic":false,"underline":false,"geometry":{"x":60,"y":60,"w":320,"h":68}}]}]}',
'{}', now())
on conflict (id) do update set body = excluded.body;

update content_items set current_version_id = 'b7a00000-0000-4000-8000-00000000c106' where id = 'b7a00000-0000-4000-8000-00000000c105';
