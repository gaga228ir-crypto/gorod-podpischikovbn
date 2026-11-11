-- Город подписчиков: база для заявок на дома.
-- Вставь целиком в Supabase → SQL Editor → Run.

-- ⬇⬇⬇ ЕДИНСТВЕННОЕ, ЧТО НУЖНО ПОМЕНЯТЬ: впиши свою почту вместо ТВОЙ_EMAIL (кавычки оставь) ⬇⬇⬇
create or replace function public.admin_email() returns text language sql immutable as $$ select 'ТВОЙ_EMAIL'::text $$;

create table if not exists public.residents (
  id          bigint generated always as identity primary key,
  nick        text not null check (nick ~ '^[a-z0-9_.]{2,24}$'),
  wish        text not null default '' check (char_length(wish) <= 200),
  code        text not null check (code ~ '^[0-9]{4}$'),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  recipe      jsonb,
  created_at  timestamptz not null default now(),
  approved_at timestamptz
);

-- один одобренный дом на ник
create unique index if not exists residents_one_approved on public.residents (nick) where status = 'approved';

-- не больше 3 заявок в ожидании на ник; на ник с домом заявку подать нельзя
create or replace function public.residents_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from residents where nick = new.nick and status = 'approved') then
    raise exception 'already_has_house';
  end if;
  if (select count(*) from residents where nick = new.nick and status = 'pending') >= 3 then
    raise exception 'too_many_pending';
  end if;
  return new;
end $$;
drop trigger if exists residents_limit on public.residents;
create trigger residents_limit before insert on public.residents
  for each row execute function public.residents_limit();

alter table public.residents enable row level security;

-- Посетители сайта (anon): видят только одобренные дома и только ник + рецепт;
-- могут лишь ДОБАВИТЬ заявку. Менять и удалять ничего не могут.
revoke all on public.residents from anon;
grant select (id, nick, recipe, status, approved_at) on public.residents to anon;

drop policy if exists anon_read on public.residents;
create policy anon_read on public.residents for select to anon using (status = 'approved');

drop policy if exists anon_apply on public.residents; -- заявки принимает только бот

-- Админ (ты, после входа на admin.html): полный доступ.
grant select, insert, update, delete on public.residents to authenticated;
drop policy if exists admin_all on public.residents;
create policy admin_all on public.residents for all to authenticated
  using ((auth.jwt() ->> 'email') = public.admin_email())
  with check ((auth.jwt() ->> 'email') = public.admin_email());

-- ===== Для ТГ-бота (запусти и этот блок; повторный запуск безопасен) =====
alter table public.residents add column if not exists tg_id bigint;
alter table public.residents add column if not exists claimed boolean not null default false;
create index if not exists residents_tg on public.residents (tg_id);

-- Оплаты звёздами за кастомизацию (видит только бот через service_role)
create table if not exists public.payments (
  id         bigint generated always as identity primary key,
  tg_id      bigint not null,
  nick       text not null,
  stars      int not null,
  charge_id  text not null unique,
  recipe     jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;

-- ===== Клад дня: кто нашёл (видит только бот через service_role) =====
create table if not exists public.klad (
  id         bigint generated always as identity primary key,
  tg_id      bigint not null,
  nick       text not null,
  day        date not null,
  used       boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tg_id, day)
);
alter table public.klad enable row level security;
revoke all on public.klad from anon, authenticated;

-- ===== Дома по описанию (нейросеть) =====
create table if not exists public.ai_orders (
  id bigint generated always as identity primary key, tg_id bigint not null, nick text not null, text text not null,
  status text not null default 'new', recipe jsonb, charge_id text, created_at timestamptz not null default now());
alter table public.ai_orders enable row level security;
revoke all on public.ai_orders from anon, authenticated;
