alter table public.content_items
  add column if not exists strategy_id uuid references public.strategies(id) on delete set null;

create index if not exists content_items_strategy_id_idx
  on public.content_items (strategy_id)
  where strategy_id is not null;

alter table public.content_items
  add column if not exists topic text;
