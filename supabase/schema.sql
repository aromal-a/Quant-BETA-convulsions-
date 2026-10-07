-- Quant-beam: sign-in + trading-session database (Supabase / Postgres).
--
-- CREDENTIALS
--   Supabase Auth persists the login itself in auth.users (Apple, Google,
--   email + bcrypt-hashed password, passkey). Never copy passwords into public tables.
--   The app keeps the user signed in by storing the Supabase session
--   (refresh token) in Expo SecureStore -> Keychain / Keystore.
--   Broker API tokens (Upstox, Binance) also stay on-device only; this DB
--   only records THAT a broker was linked, never the token.
--
-- SESSIONS
--   A trading session opens automatically the first time a user who has
--   linked a broker places a trade. It stays open until closed (manually or
--   after 30 min idle via close_idle_sessions()). The next trade opens a new one.

-- ---------- users ----------
create table public.profiles (
  id             uuid primary key references auth.users on delete cascade,
  display_name   text,
  home_country   text check (home_country in ('IN', 'US')) default 'IN',
  show_crypto    boolean not null default true,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz,
  broker_found_at timestamptz,   -- first broker linked
  first_trade_at  timestamptz    -- first trade placed
);

create table public.sign_in_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users on delete cascade,
  provider   text not null check (provider in ('apple','google','email','passkey')),
  platform   text check (platform in ('ios','android','web')),
  is_new_user boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- brokers ----------
create table public.broker_links (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users on delete cascade,
  broker    text not null check (broker in ('upstox','binance')),
  mode      text not null default 'paper' check (mode in ('paper','live')),
  label     text,                -- e.g. "Upstox ••••42" (masked, display only)
  linked_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, broker)
);

-- ---------- sessions + trades ----------
create table public.trading_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  broker_link_id uuid not null references public.broker_links on delete cascade,
  started_at     timestamptz not null default now(),
  last_trade_at  timestamptz not null default now(),
  ended_at       timestamptz,
  trade_count    int not null default 0
);
-- At most one open session per user.
create unique index one_open_session on public.trading_sessions (user_id) where ended_at is null;

create table public.trades (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users on delete cascade,
  broker_link_id uuid not null references public.broker_links on delete cascade,
  session_id     uuid references public.trading_sessions on delete set null,
  symbol         text not null,
  side           text not null check (side in ('buy','sell')),
  qty            numeric not null check (qty > 0),
  price          numeric not null check (price > 0),
  broker_order_id text,
  placed_at      timestamptz not null default now()
);

create table public.watchlist (
  user_id  uuid not null references auth.users on delete cascade,
  symbol   text not null,
  added_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

-- ---------- triggers ----------
-- New sign-up -> profile row.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- First broker link -> stamp profile.
create function public.handle_broker_link() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set broker_found_at = coalesce(broker_found_at, now()) where id = new.user_id;
  return new;
end $$;
create trigger on_broker_linked
  after insert on public.broker_links for each row execute function public.handle_broker_link();

-- Trade placed -> attach to open session, or start a new one.
create function public.handle_trade() returns trigger
language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  if not exists (select 1 from public.broker_links
                 where id = new.broker_link_id and user_id = new.user_id and revoked_at is null) then
    raise exception 'trade needs an active broker link';
  end if;

  select id into s from public.trading_sessions where user_id = new.user_id and ended_at is null;
  if s is null then
    insert into public.trading_sessions (user_id, broker_link_id)
    values (new.user_id, new.broker_link_id) returning id into s;
  end if;

  new.session_id := s;
  update public.trading_sessions set trade_count = trade_count + 1, last_trade_at = now() where id = s;
  update public.profiles set first_trade_at = coalesce(first_trade_at, now()) where id = new.user_id;
  return new;
end $$;
create trigger on_trade_placed
  before insert on public.trades for each row execute function public.handle_trade();

-- Close sessions idle > 30 min (schedule with pg_cron: every 5 min).
create function public.close_idle_sessions() returns void
language sql security definer set search_path = public as $$
  update public.trading_sessions set ended_at = last_trade_at
  where ended_at is null and last_trade_at < now() - interval '30 minutes';
$$;
-- select cron.schedule('close-idle-sessions', '*/5 * * * *', 'select public.close_idle_sessions()');

-- ---------- funnel: who signed up, found a broker, traded ----------
create view public.activation_funnel with (security_invoker = true) as
select p.id, p.display_name, p.created_at as signed_up_at,
       p.broker_found_at, p.first_trade_at,
       (select count(*) from public.trading_sessions t where t.user_id = p.id) as sessions
from public.profiles p;

-- ---------- row level security ----------
alter table public.profiles         enable row level security;
alter table public.sign_in_events   enable row level security;
alter table public.broker_links     enable row level security;
alter table public.trading_sessions enable row level security;
alter table public.trades           enable row level security;
alter table public.watchlist        enable row level security;

create policy "own profile"   on public.profiles       for all using (auth.uid() = id)      with check (auth.uid() = id);
create policy "own events"    on public.sign_in_events for select using (auth.uid() = user_id);
create policy "log own event" on public.sign_in_events for insert with check (auth.uid() = user_id);
create policy "own brokers"   on public.broker_links   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sessions"  on public.trading_sessions for select using (auth.uid() = user_id);
create policy "end own session" on public.trading_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own trades"    on public.trades         for select using (auth.uid() = user_id);
create policy "place own trade" on public.trades       for insert with check (auth.uid() = user_id);
create policy "own watchlist" on public.watchlist      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
