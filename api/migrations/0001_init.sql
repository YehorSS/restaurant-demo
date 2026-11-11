CREATE TABLE restaurants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tz TEXT NOT NULL,
  phone TEXT NOT NULL,
  prefix TEXT NOT NULL
);

-- one row per opening shift; weekday 0 = Sunday
CREATE TABLE hours (
  rid TEXT NOT NULL REFERENCES restaurants(id),
  weekday INTEGER NOT NULL,
  open TEXT NOT NULL,
  close TEXT NOT NULL
);

CREATE TABLE tables (
  id INTEGER PRIMARY KEY,
  rid TEXT NOT NULL REFERENCES restaurants(id),
  seats INTEGER NOT NULL,
  label TEXT NOT NULL
);

CREATE TABLE menu_sections (
  id INTEGER PRIMARY KEY,
  rid TEXT NOT NULL REFERENCES restaurants(id),
  sort INTEGER NOT NULL,
  title_en TEXT NOT NULL,
  title_local TEXT NOT NULL
);

CREATE TABLE dishes (
  id INTEGER PRIMARY KEY,
  section_id INTEGER NOT NULL REFERENCES menu_sections(id),
  sort INTEGER NOT NULL,
  name_en TEXT NOT NULL,
  name_local TEXT NOT NULL,
  desc_en TEXT NOT NULL,
  desc_local TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  weight_g INTEGER,
  photo TEXT,
  fire INTEGER NOT NULL DEFAULT 0,
  out_of_stock INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE bookings (
  id INTEGER PRIMARY KEY,
  rid TEXT NOT NULL REFERENCES restaurants(id),
  code TEXT NOT NULL UNIQUE,
  table_id INTEGER NOT NULL REFERENCES tables(id),
  start_utc INTEGER NOT NULL,
  end_utc INTEGER NOT NULL,
  party INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX bookings_table_time ON bookings(table_id, start_utc);
CREATE INDEX bookings_rid_time ON bookings(rid, start_utc);

CREATE TABLE closed_days (
  rid TEXT NOT NULL REFERENCES restaurants(id),
  date TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'owner',
  PRIMARY KEY (rid, date)
);

CREATE TABLE users (
  login TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  login TEXT NOT NULL REFERENCES users(login),
  expires_at INTEGER NOT NULL
);

-- fixed-window counters for rate limits
CREATE TABLE hits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);
