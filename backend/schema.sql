PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_num TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  district TEXT NOT NULL,
  address TEXT NOT NULL,
  landmark TEXT NOT NULL,
  instagram TEXT NOT NULL DEFAULT '',
  customer_notes TEXT NOT NULL DEFAULT '',
  items_summary TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  delivery_charge INTEGER NOT NULL,
  total INTEGER NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'Cash on Delivery',
  status TEXT NOT NULL DEFAULT 'Awaiting Instagram confirmation',
  logistics_partner TEXT NOT NULL DEFAULT 'NCM Courier',
  tracking_number TEXT NOT NULL DEFAULT '',
  return_flag TEXT NOT NULL DEFAULT 'none',
  admin_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tracking_number);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  image TEXT NOT NULL,
  category TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  total INTEGER NOT NULL,
  size TEXT NOT NULL,
  color TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_status_logs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_status_logs_order ON order_status_logs(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  image TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('dress', 'set')),
  family TEXT NOT NULL DEFAULT 'Dress',
  price INTEGER NOT NULL CHECK (price >= 0),
  sizes_json TEXT NOT NULL DEFAULT '["S","M","L"]',
  colors_json TEXT NOT NULL DEFAULT '["#1a1814"]',
  gallery_json TEXT NOT NULL DEFAULT '[]',
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  trending INTEGER NOT NULL DEFAULT 0 CHECK (trending IN (0, 1)),
  is_new INTEGER NOT NULL DEFAULT 0 CHECK (is_new IN (0, 1)),
  fabric TEXT NOT NULL DEFAULT '',
  occasion TEXT NOT NULL DEFAULT '',
  fit TEXT NOT NULL DEFAULT '',
  care TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_active ON products(active, category, id);

INSERT OR IGNORE INTO products (id, name, image, category, family, price, sizes_json, colors_json, gallery_json, stock, active, trending, is_new, fabric, occasion, fit, care, created_at, updated_at) VALUES
  (101, 'Rosette Tiered Off-Shoulder Midi Dress', 'rosette-pink-front', 'dress', 'Dress', 2499, '["S","M","L","XL"]', '["#f2a8b7","#7b9ec9","#f2ede6"]', '["rosette-pink-front","rosette-pink-side","rosette-blue-side"]', 10, 1, 1, 1, 'Tiered rosette texture with a soft off-shoulder neckline', 'Birthdays, brunch, dinners, photo days', 'Off-shoulder midi silhouette with a romantic tiered fall', 'Gentle hand wash, shade dry', '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z'),
  (102, 'Organza Ruffle Off-Shoulder Mini Dress', 'organza-black-front', 'dress', 'Dress', 2199, '["S","M","L"]', '["#1a1814","#f0a7bd"]', '["organza-black-front","organza-black-seated","organza-pink-front"]', 10, 1, 1, 1, 'Light organza ruffles with a structured mini shape', 'Parties, dates, birthdays, evening plans', 'Off-shoulder mini fit with statement volume', 'Steam low, gentle hand wash', '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z'),
  (103, 'Ivory Ruched Top & Brown Tiered Skirt Set', 'ivory-set-hero', 'set', 'Set', 2699, '["S","M","L","XL"]', '["#f2ede6","#8b5e3c","#c9a96e"]', '["ivory-set-hero","ivory-set-side","ivory-set-front-standing"]', 10, 1, 1, 1, 'Ruched ivory top paired with a brown tiered skirt', 'Brunch, college events, family plans, content days', 'Two-piece fit with a defined waist and soft skirt movement', 'Cold wash separately, shade dry', '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z'),
  (104, 'Pink Floral Smocked Puff-Sleeve Midi Dress', 'pink-floral-front', 'dress', 'Dress', 1799, '["S","M","L","XL"]', '["#f3b1c1","#f7efe9","#86a37b"]', '["pink-floral-front"]', 10, 1, 0, 1, 'Floral print with a smocked bodice and puff sleeves', 'Day outings, cafe plans, birthdays, soft events', 'Comfort smocked midi fit', 'Gentle wash inside out', '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z'),
  (105, 'Pink Dot Ruffle Halter & Trouser Set', 'pink-dot-front', 'set', 'Set', 2399, '["S","M","L"]', '["#f3a7b9","#ffffff","#1a1814"]', '["pink-dot-front","pink-dot-side"]', 10, 1, 1, 0, 'Ruffle halter top with coordinated dotted trousers', 'Reels, vacations, casual parties, sunny plans', 'Halter set with relaxed trouser ease', 'Cold hand wash, hang dry', '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z'),
  (106, 'Polka Dot Tie-Neck Trouser Set', 'polka-white-front', 'set', 'Set', 2299, '["S","M","L","XL"]', '["#fafaf7","#c83535","#1a1814"]', '["polka-white-front","polka-white-side","polka-red-side","polka-black-side"]', 10, 1, 1, 0, 'Tie-neck dotted top with matching easy trousers', 'Office dinners, college days, travel, content days', 'Relaxed coordinated trouser set', 'Cold wash, low iron', '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z'),
  (107, 'Taupe Linen Blazer & Trouser Set', 'taupe-linen-front', 'set', 'Set', 2999, '["S","M","L","XL"]', '["#b6a08a","#f2ede6","#1a1814"]', '["taupe-linen-front","taupe-linen-side"]', 10, 1, 0, 1, 'Linen-feel blazer with tailored matching trousers', 'Meetings, dinners, travel days, polished plans', 'Relaxed blazer fit with straight-leg trousers', 'Dry clean preferred or gentle cold wash', '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z');
