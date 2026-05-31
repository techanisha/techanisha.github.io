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
