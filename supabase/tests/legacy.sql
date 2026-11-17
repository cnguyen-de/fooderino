-- The legacy production schema described at the top of backfill-v2.sql, with
-- seed rows that hit every branch of the backfill.

create type public."AmountType" as enum ('gram', 'kg', 'count');

create table public.lists (
  uid        bigint primary key,
  created_at timestamptz default now(),
  name       text,
  id         uuid unique,
  users      jsonb,
  admin      uuid
);

create table public.items (
  id                 bigint primary key,
  list_id            uuid,
  name               text,
  location           text,
  store              text,
  amount             numeric,
  amount_to_purchase numeric,
  amount_type        public."AmountType",
  default_amount     numeric,
  best_before        date,
  "user"             text,
  created_at         timestamptz default now(),
  last_updated       timestamptz
);

create table public.logs (
  id         uuid primary key,
  created_at timestamptz default now(),
  list_id    uuid,
  item       text,
  "user"     text,
  payload    text,
  action     text
);

create table public.recipes (
  index        bigint primary key,
  created_at   timestamptz default now(),
  id           uuid,
  name         text,
  description  text,
  ingredients  jsonb,
  instructions text,
  saved        boolean
);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@x.com', '{"full_name":"Alice"}'),
  ('a0000000-0000-0000-0000-00000000000b', 'Bob@X.com',   '{}'),
  ('a0000000-0000-0000-0000-00000000000c', 'carol@x.com', '{"name":"Carol"}'),
  ('a0000000-0000-0000-0000-00000000000f', 'frank@x.com', '{"full_name":"Frank","picture":"f.png"}'),
  ('a0000000-0000-0000-0000-000000000001', 'grace@x.com', '{}'),
  ('a0000000-0000-0000-0000-000000000002', 'heidi@x.com', '{}');

-- dave@x.com and erin@x.com have no auth.users row yet.
insert into public.lists (uid, created_at, name, id, users, admin) values
  (1, '2025-05-01', 'Home', '10000000-0000-0000-0000-000000000001',
   '[{"email":"alice@x.com","name":"Alice","admin":true},{"email":"bob@x.com"},{"email":"Dave@x.com","name":"Dave"}]',
   'a0000000-0000-0000-0000-00000000000a'),
  (2, '2025-05-02', 'Flat', '10000000-0000-0000-0000-000000000002',
   '[{"email":"carol@x.com"},{"email":"erin@x.com"}]', null),
  (3, '2025-05-03', 'Cabin', '10000000-0000-0000-0000-000000000003',
   '[{"email":"carol@x.com","admin":true},{"email":" erin@x.com "}]',
   'a0000000-0000-0000-0000-00000000000c'),
  (4, '2025-05-04', 'Frank''s', '10000000-0000-0000-0000-000000000004',
   '[]', 'a0000000-0000-0000-0000-00000000000f'),
  (5, '2025-05-05', 'Ghost', null, '[{"name":"no email"}]', null);

insert into public.items (id, list_id, name, location, store, amount, amount_to_purchase,
                          amount_type, default_amount, best_before, "user", last_updated) values
  (1,  '10000000-0000-0000-0000-000000000001', 'Milk',  'Fridge',  'Lidl', 2,   0, 'count', 1,   '2026-11-20', 'alice@x.com', '2026-11-01'),
  (2,  '10000000-0000-0000-0000-000000000001', 'Eggs',  'fridge ', ' ',    0,   1, 'count', 1,   null, 'alice@x.com', '2026-11-01'),
  (3,  '10000000-0000-0000-0000-000000000001', 'Bread', 'Pantry',  '',     1,   0, 'count', 1,   null, 'alice@x.com', '2026-11-01'),
  (4,  '10000000-0000-0000-0000-000000000001', 'bread ', 'Freezer', null,  2,   0, 'count', 1,   null, 'alice@x.com', '2026-11-01'),
  (5,  '10000000-0000-0000-0000-000000000001', 'Flour', '',        '',     1.5, 0, 'kg',    0.5, null, 'alice@x.com', '2026-11-01'),
  (6,  '10000000-0000-0000-0000-000000000001', 'Oops',  null,      null,   -1,  0, 'count', 0,   null, 'alice@x.com', null),
  (7,  '10000000-0000-0000-0000-000000000002', 'Rice',  'Pantry',  'Asian market', 500, 0, 'gram', 100, '2027-01-01', 'carol@x.com', '2026-11-01'),
  (8,  '10000000-0000-0000-0000-000000000003', 'rice',  'Shelf',   '',     200, 100, 'gram', 100, '2026-12-01', 'carol@x.com', '2026-11-01'),
  (9,  '10000000-0000-0000-0000-000000000003', 'Coffee', '',       '',     1,   0, 'count', 1,   null, 'carol@x.com', '2026-11-01'),
  (10, null,                                   'Orphan', '',       '',     1,   0, 'count', 1,   null, null, null),
  (11, '10000000-0000-0000-0000-0000000000ff', 'Dangling', '',     '',     1,   0, null,    null, null, null, null),
  (12, '10000000-0000-0000-0000-000000000002', 'Soy sauce', 'Pantry', '',  1,   0, 'count', 1,   null, 'erin@x.com', '2026-11-01');

insert into public.logs (id, created_at, list_id, item, "user", payload, action) values
  ('20000000-0000-0000-0000-000000000001', '2026-10-01', '10000000-0000-0000-0000-000000000001', 'milk',  'alice@x.com', '0 → 2',      'updated'),
  ('20000000-0000-0000-0000-000000000002', '2026-10-05', '10000000-0000-0000-0000-000000000001', 'Milk',  'bob@x.com',   '2 → 1',      'updated'),
  ('20000000-0000-0000-0000-000000000003', '2026-10-06', '10000000-0000-0000-0000-000000000001', 'Gone',  'alice@x.com', '1 → 2',      'updated'),
  ('20000000-0000-0000-0000-000000000004', '2026-10-07', '10000000-0000-0000-0000-000000000001', 'Milk',  'alice@x.com', '',           'created'),
  ('20000000-0000-0000-0000-000000000005', '2026-10-08', '10000000-0000-0000-0000-000000000001', 'Milk',  'alice@x.com', '2 → 2',      'updated'),
  ('20000000-0000-0000-0000-000000000006', '2026-10-09', '10000000-0000-0000-0000-000000000001', 'Milk',  'alice@x.com', 'abc',        'updated'),
  ('20000000-0000-0000-0000-000000000007', '2026-10-10', '10000000-0000-0000-0000-000000000001', 'Bread', 'alice@x.com', '1 → 3',      'updated'),
  ('20000000-0000-0000-0000-000000000008', '2026-10-11', '10000000-0000-0000-0000-000000000001', 'Flour', 'alice@x.com', '1.5->1',     'inventory'),
  ('20000000-0000-0000-0000-000000000009', '2026-10-12', null,                                   'Milk',  'alice@x.com', '0 → 1',      'updated'),
  ('20000000-0000-0000-0000-00000000000a', '2026-10-13', '10000000-0000-0000-0000-000000000001', ' eggs ', 'dave@x.com', ' 1 → 4 ',    'inventory'),
  ('20000000-0000-0000-0000-00000000000b', '2026-10-14', '10000000-0000-0000-0000-000000000002', 'Rice',  'carol@x.com', '0 → 1',      'updated'),
  ('20000000-0000-0000-0000-00000000000c', '2026-10-15', '10000000-0000-0000-0000-000000000001', 'Eggs',  'alice@x.com', '',           'deleted'),
  ('20000000-0000-0000-0000-00000000000d', '2026-10-16', '10000000-0000-0000-0000-000000000001', 'Milk',  'alice@x.com', '1 → 2 extra', 'updated'),
  ('20000000-0000-0000-0000-00000000000e', '2026-10-17', '10000000-0000-0000-0000-000000000001', 'Milk',  'alice@x.com', null,         'updated');

insert into public.recipes (index, created_at, id, name, description, ingredients, instructions, saved) values
  (1, '2025-06-01', 'a0000000-0000-0000-0000-00000000000a', 'Pancakes', 'Fluffy', '[{"name":"Flour"}]', 'Mix.', true),
  (2, null,         'a0000000-0000-0000-0000-00000000000c', 'Rice bowl', null, null, null, null);
