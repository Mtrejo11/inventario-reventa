-- Ejecuta este SQL en tu proyecto Supabase (SQL Editor).

-- Tabla de productos
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  brand text,
  category text not null check (category in ('cartera','ropa','zapatos','accesorios','otro')),
  store text,
  color text,
  condition text,
  cost numeric(10,2) not null default 0,
  price numeric(10,2) not null default 0,
  qty integer not null default 1,
  notes text,
  photo_url text,
  photo_path text,
  sold boolean not null default false,
  sold_price numeric(10,2),
  sold_date date,
  sold_note text,
  promo_urls text[] not null default '{}',
  extra_photo_urls text[] not null default '{}',
  extra_photo_paths text[] not null default '{}'
);

-- Migración aditiva para bases existentes:
alter table public.products add column if not exists promo_urls text[] not null default '{}';
alter table public.products add column if not exists extra_photo_urls text[] not null default '{}';
alter table public.products add column if not exists extra_photo_paths text[] not null default '{}';

-- Índices útiles
create index if not exists products_created_at_idx on public.products (created_at desc);
create index if not exists products_sold_idx on public.products (sold);
create index if not exists products_category_idx on public.products (category);
create index if not exists products_store_idx on public.products (store);

-- RLS: app de uso personal. Permitimos acceso público anónimo (ajusta si quieres auth).
alter table public.products enable row level security;

drop policy if exists "anon read" on public.products;
drop policy if exists "anon write" on public.products;
drop policy if exists "auth read" on public.products;
drop policy if exists "auth write" on public.products;

-- Solo usuarios autenticados. Todos los autenticados comparten el mismo inventario.
create policy "auth read"
  on public.products for select
  to authenticated
  using (true);

create policy "auth write"
  on public.products for all
  to authenticated
  using (true)
  with check (true);

-- Storage bucket para las fotos.
-- Ejecuta desde la UI de Supabase o con: (necesita el rol de servicio)
-- insert into storage.buckets (id, name, public) values ('product-photos','product-photos', true)
--   on conflict (id) do nothing;
-- O crea el bucket "product-photos" como PÚBLICO desde Dashboard > Storage.

-- Policies del bucket. Bucket marcado como público (para getPublicUrl).
-- Las escrituras SOLO para usuarios autenticados.
-- Corre este SQL O configúralo en Storage > product-photos > Policies.

drop policy if exists "anon upload product-photos" on storage.objects;
drop policy if exists "anon delete product-photos" on storage.objects;

create policy "auth upload product-photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-photos');

create policy "auth delete product-photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-photos');

create policy "auth update product-photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-photos');
