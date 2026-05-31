const ORDER_STATUSES = [
  "Awaiting Instagram confirmation",
  "Confirmed",
  "Preparing order",
  "Booked with NCM",
  "In transit",
  "Delivered",
  "Cancelled"
];
const RETURN_FLAGS = ["none", "damaged_delivery", "wrong_size", "wrong_item", "review_requested", "resolved"];
const PBKDF2_ITERATIONS = 100000;
const MAX_BODY_BYTES = 65536;
const encoder = new TextEncoder();

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);
    if (request.method === "OPTIONS") {
      if (!cors) return json({ error: "Origin not allowed" }, 403);
      return new Response(null, { status: 204, headers: cors });
    }
    if (origin && !cors) return json({ error: "Origin not allowed" }, 403);

    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";

      if (path === "/health" && request.method === "GET") {
        return json({ ok: true, service: "niva-api" }, 200, cors);
      }
      if (path === "/products" && request.method === "GET") {
        return json({ products: await listProducts(env, false) }, 200, cors);
      }
      if (path === "/ai/style" && request.method === "POST") {
        if (!origin) fail(403, "Open NIVA Assistant from the official storefront.");
        return json({ reply: await geminiStyle(request, env, ip) }, 200, cors);
      }
      if (path === "/auth/register" && request.method === "POST") {
        return json(await register(request, env, ip), 201, cors);
      }
      if (path === "/auth/login" && request.method === "POST") {
        return json(await login(request, env, ip), 200, cors);
      }
      if (path === "/auth/logout" && request.method === "POST") {
        const session = await requireSession(request, env);
        await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(session.session_id).run();
        return json({ ok: true }, 200, cors);
      }
      if (path === "/me" && request.method === "GET") {
        const session = await requireSession(request, env);
        return json({ user: publicUser(session) }, 200, cors);
      }
      if (path === "/me/orders" && request.method === "GET") {
        const session = await requireSession(request, env);
        const rows = await env.DB.prepare(
          "SELECT order_num, items_summary, total, status, logistics_partner, tracking_number, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 30"
        ).bind(session.user_id).all();
        return json({ orders: rows.results.map(customerOrder) }, 200, cors);
      }
      if (path === "/orders" && request.method === "POST") {
        const session = await requireSession(request, env);
        return json({ order: await createOrder(request, env, session, ip) }, 201, cors);
      }
      if (path === "/track" && request.method === "POST") {
        return json({ order: await trackOrder(request, env, ip) }, 200, cors);
      }
      if (path === "/admin/bootstrap-status" && request.method === "GET") {
        return json({ available: await bootstrapAvailable(env) }, 200, cors);
      }
      if (path === "/admin/bootstrap" && request.method === "POST") {
        return json(await bootstrapAdmin(request, env, ip), 201, cors);
      }
      if (path === "/admin/orders" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await adminOrders(env), 200, cors);
      }
      if (path === "/admin/products" && request.method === "GET") {
        await requireAdmin(request, env);
        return json({ products: await listProducts(env, true) }, 200, cors);
      }
      if (path === "/admin/products" && request.method === "POST") {
        await requireAdmin(request, env);
        return json({ product: await createProduct(request, env) }, 201, cors);
      }

      const detailMatch = path.match(/^\/admin\/orders\/([0-9a-f-]+)$/i);
      if (detailMatch && request.method === "GET") {
        await requireAdmin(request, env);
        return json({ order: await adminOrder(env, detailMatch[1]) }, 200, cors);
      }
      if (detailMatch && request.method === "PATCH") {
        const admin = await requireAdmin(request, env);
        return json({ order: await updateAdminOrder(request, env, admin, detailMatch[1]) }, 200, cors);
      }
      const productMatch = path.match(/^\/admin\/products\/(\d+)$/);
      if (productMatch && request.method === "PATCH") {
        await requireAdmin(request, env);
        return json({ product: await updateProduct(request, env, Number(productMatch[1])) }, 200, cors);
      }

      return json({ error: "Not found" }, 404, cors);
    } catch (error) {
      const status = error.status || 500;
      console.error(JSON.stringify({ event: "request_error", status, message: error.message }));
      return json({ error: status === 500 ? "Something went wrong" : error.message }, status, cors);
    }
  }
};

async function register(request, env, ip) {
  await enforceRateLimit(env, `register:${ip}`, 5, 3600);
  const body = await readJson(request);
  const email = validEmail(body.email);
  const password = validPassword(body.password);
  const name = validText(body.name, "Full name", 2, 90);
  const phone = validPhone(body.phone);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) fail(409, "An account with this email already exists.");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const salt = randomToken(16);
  const passwordHash = await passwordDigest(password, salt);
  await env.DB.prepare(
    "INSERT INTO users (id, email, name, phone, password_salt, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'customer', ?, ?)"
  ).bind(id, email, name, phone, salt, passwordHash, now, now).run();
  const user = { user_id: id, email, name, phone, role: "customer" };
  return { token: await createSession(env, id), user: publicUser(user) };
}

async function login(request, env, ip) {
  const body = await readJson(request);
  const email = validEmail(body.email);
  const password = validPassword(body.password);
  await enforceRateLimit(env, `login:${ip}:${email}`, 8, 900);
  const user = await env.DB.prepare(
    "SELECT id AS user_id, email, name, phone, role, password_salt, password_hash FROM users WHERE email = ?"
  ).bind(email).first();
  if (!user || !safeEqual(await passwordDigest(password, user.password_salt), user.password_hash)) {
    fail(401, "Email or password is incorrect.");
  }
  return { token: await createSession(env, user.user_id), user: publicUser(user) };
}

async function bootstrapAvailable(env) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").first();
  return Number(row.count) === 0;
}

async function bootstrapAdmin(request, env, ip) {
  await enforceRateLimit(env, `bootstrap:${ip}`, 5, 3600);
  if (!(await bootstrapAvailable(env))) fail(403, "Administrator setup is already complete.");
  if (!env.ADMIN_BOOTSTRAP_CODE) fail(503, "Administrator setup is not configured.");
  const body = await readJson(request);
  if (!safeEqual(String(body.bootstrapCode || ""), env.ADMIN_BOOTSTRAP_CODE)) fail(403, "Setup code is incorrect.");
  const email = validEmail(body.email);
  const password = validPassword(body.password);
  const name = validText(body.name, "Full name", 2, 90);
  const existing = await env.DB.prepare(
    "SELECT id AS user_id, email, name, phone, role, password_salt, password_hash FROM users WHERE email = ?"
  ).bind(email).first();
  let user;
  const now = new Date().toISOString();
  if (existing) {
    if (!safeEqual(await passwordDigest(password, existing.password_salt), existing.password_hash)) {
      fail(401, "Email or password is incorrect.");
    }
    await env.DB.prepare("UPDATE users SET role = 'admin', name = ?, updated_at = ? WHERE id = ?")
      .bind(name, now, existing.user_id).run();
    user = { ...existing, name, role: "admin" };
  } else {
    const id = crypto.randomUUID();
    const salt = randomToken(16);
    const passwordHash = await passwordDigest(password, salt);
    await env.DB.prepare(
      "INSERT INTO users (id, email, name, phone, password_salt, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?, 'admin', ?, ?)"
    ).bind(id, email, name, salt, passwordHash, now, now).run();
    user = { user_id: id, email, name, phone: "", role: "admin" };
  }
  return { token: await createSession(env, user.user_id), user: publicUser(user) };
}

async function createOrder(request, env, session, ip) {
  await enforceRateLimit(env, `order-user:${session.user_id}`, 5, 3600);
  await enforceRateLimit(env, `order-ip:${ip}`, 12, 3600);
  const body = await readJson(request);
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length || rawItems.length > 12) fail(400, "Your bag must contain between 1 and 12 items.");
  const delivery = body.delivery || {};
  const customerName = validText(delivery.name, "Full name", 2, 90);
  const phone = validPhone(delivery.phone);
  const email = delivery.email ? validEmail(delivery.email) : session.email;
  const district = validText(delivery.district, "District", 2, 60);
  const address = validText(delivery.address, "Address", 4, 240);
  const landmark = validText(delivery.landmark, "Landmark", 2, 140);
  const instagram = optionalText(delivery.instagram, 80);
  const customerNotes = optionalText(delivery.notes, 500);
  const requestedIds = [...new Set(rawItems.map((raw) => Number(raw.id)))];
  if (requestedIds.some((id) => !Number.isInteger(id) || id < 1)) fail(400, "One of your bag items is invalid.");
  const placeholders = requestedIds.map(() => "?").join(",");
  const productRows = await env.DB.prepare(
    `SELECT * FROM products WHERE active = 1 AND id IN (${placeholders})`
  ).bind(...requestedIds).all();
  const catalog = new Map(productRows.results.map((row) => [Number(row.id), productFromRow(row)]));
  let subtotal = 0;
  let totalQty = 0;
  const items = rawItems.map((raw) => {
    const id = Number(raw.id);
    const qty = Number(raw.qty);
    const product = catalog.get(id);
    if (!product || !Number.isInteger(qty) || qty < 1 || qty > 10) fail(400, "One of your bag items is invalid.");
    if (product.stock < qty) fail(409, `${product.name} does not have enough stock for this quantity.`);
    const size = String(raw.size || "").trim().toUpperCase();
    if (!product.sizes.includes(size)) fail(400, `Choose an available size for ${product.name}.`);
    const color = optionalText(raw.color, 32) || "Default";
    totalQty += qty;
    if (totalQty > 20) fail(400, "Your order has too many items.");
    const lineTotal = product.price * qty;
    subtotal += lineTotal;
    return { id, ...product, qty, size, color, total: lineTotal };
  });
  const reservations = [...items.reduce((map, item) => {
    const current = map.get(item.id) || { id: item.id, name: item.name, qty: 0 };
    current.qty += item.qty;
    map.set(item.id, current);
    return map;
  }, new Map()).values()];
  for (const reservation of reservations) {
    const product = catalog.get(reservation.id);
    if (product.stock < reservation.qty) fail(409, `${reservation.name} does not have enough stock for this quantity.`);
  }
  const reserveResults = await env.DB.batch(reservations.map((reservation) => env.DB.prepare(
    "UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ? AND stock >= ?"
  ).bind(reservation.qty, new Date().toISOString(), reservation.id, reservation.qty)));
  const reserved = reservations.filter((reservation, index) => Number(reserveResults[index]?.meta?.changes) === 1);
  if (reserved.length !== reservations.length) {
    await restoreReservations(env, reserved);
    fail(409, "One of these styles just sold out. Refresh your bag and choose an available quantity.");
  }
  const deliveryCharge = subtotal >= 1500 ? 0 : 120;
  const total = subtotal + deliveryCharge;
  const id = crypto.randomUUID();
  const orderNum = makeOrderNumber();
  const now = new Date().toISOString();
  const summary = items.map((item) => `${item.name} x${item.qty}`).join(" | ");
  const statements = [
    env.DB.prepare(
      "INSERT INTO orders (id, order_num, user_id, customer_name, phone, email, district, address, landmark, instagram, customer_notes, items_summary, subtotal, delivery_charge, total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, orderNum, session.user_id, customerName, phone, email, district, address, landmark, instagram, customerNotes, summary, subtotal, deliveryCharge, total, now, now),
    env.DB.prepare(
      "INSERT INTO order_status_logs (id, order_id, status, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), id, "Awaiting Instagram confirmation", "Order placed by customer", session.user_id, now),
    ...items.map((item) => env.DB.prepare(
      "INSERT INTO order_items (id, order_id, product_id, name, image, category, unit_price, qty, total, size, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), id, item.id, item.name, item.image, item.category, item.price, item.qty, item.total, item.size, item.color))
  ];
  try {
    await env.DB.batch(statements);
  } catch (error) {
    await restoreReservations(env, reservations);
    throw error;
  }
  return receiptOrder({
    id, order_num: orderNum, customer_name: customerName, phone, email, district, address, landmark, instagram,
    customer_notes: customerNotes, items_summary: summary, subtotal, delivery_charge: deliveryCharge, total,
    payment_method: "Cash on Delivery", status: "Awaiting Instagram confirmation", logistics_partner: "NCM Courier",
    tracking_number: "", created_at: now, items
  });
}

async function trackOrder(request, env, ip) {
  await enforceRateLimit(env, `track:${ip}`, 20, 600);
  const body = await readJson(request);
  const orderNum = validText(body.orderNum, "Order number", 6, 40).toUpperCase();
  const phoneLast4 = String(body.phoneLast4 || "").replace(/\D/g, "").slice(-4);
  const session = await optionalSession(request, env);
  const order = await env.DB.prepare(
    "SELECT id, order_num, user_id, items_summary, total, status, logistics_partner, tracking_number, phone, created_at FROM orders WHERE order_num = ? OR tracking_number = ?"
  ).bind(orderNum, orderNum).first();
  if (!order) fail(404, "No order found. Check your details or DM @niva.creation_.");
  const owner = session && session.user_id === order.user_id;
  if (!owner && (phoneLast4.length !== 4 || !String(order.phone).endsWith(phoneLast4))) {
    fail(404, "No order found. Check your details or DM @niva.creation_.");
  }
  return customerOrder(order);
}

async function adminOrders(env) {
  const [rows, stats] = await Promise.all([
    env.DB.prepare(
      "SELECT id, order_num, customer_name, phone, district, items_summary, total, status, tracking_number, return_flag, created_at, updated_at FROM orders ORDER BY created_at DESC LIMIT 300"
    ).all(),
    env.DB.prepare(
      "SELECT COUNT(*) AS total_orders, COALESCE(SUM(total), 0) AS revenue, SUM(CASE WHEN status = 'Awaiting Instagram confirmation' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status = 'Booked with NCM' OR status = 'In transit' THEN 1 ELSE 0 END) AS shipping, SUM(CASE WHEN return_flag <> 'none' AND return_flag <> 'resolved' THEN 1 ELSE 0 END) AS returns FROM orders"
    ).first()
  ]);
  return { orders: rows.results.map(adminOrderSummary), stats };
}

async function adminOrder(env, id) {
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  if (!order) fail(404, "Order not found.");
  const [items, logs] = await Promise.all([
    env.DB.prepare("SELECT product_id, name, image, category, unit_price, qty, total, size, color FROM order_items WHERE order_id = ? ORDER BY rowid").bind(id).all(),
    env.DB.prepare("SELECT status, note, created_by, created_at FROM order_status_logs WHERE order_id = ? ORDER BY created_at DESC").bind(id).all()
  ]);
  return fullAdminOrder(order, items.results, logs.results);
}

async function updateAdminOrder(request, env, admin, id) {
  const current = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  if (!current) fail(404, "Order not found.");
  const body = await readJson(request);
  const status = String(body.status || current.status);
  const trackingNumber = optionalText(body.trackingNumber ?? current.tracking_number, 80).toUpperCase();
  const returnFlag = String(body.returnFlag || current.return_flag);
  const adminNotes = optionalText(body.adminNotes ?? current.admin_notes, 2000);
  if (!ORDER_STATUSES.includes(status)) fail(400, "Choose a valid order status.");
  if (!RETURN_FLAGS.includes(returnFlag)) fail(400, "Choose a valid return flag.");
  if (current.status === "Cancelled" && status !== "Cancelled") fail(409, "Cancelled orders cannot be reopened. Ask the customer to place a fresh order.");
  const now = new Date().toISOString();
  const changes = [];
  if (status !== current.status) changes.push(`Status: ${status}`);
  if (trackingNumber !== current.tracking_number) changes.push(trackingNumber ? `Tracking added: ${trackingNumber}` : "Tracking removed");
  if (returnFlag !== current.return_flag) changes.push(`Return flag: ${returnFlag}`);
  if (status === "Cancelled" && current.status !== "Cancelled") {
    await restoreOrderStock(env, id);
    changes.push("Reserved stock returned to catalog");
  }
  await env.DB.prepare(
    "UPDATE orders SET status = ?, tracking_number = ?, return_flag = ?, admin_notes = ?, updated_at = ? WHERE id = ?"
  ).bind(status, trackingNumber, returnFlag, adminNotes, now, id).run();
  if (changes.length) {
    await env.DB.prepare(
      "INSERT INTO order_status_logs (id, order_id, status, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), id, status, changes.join(" | "), admin.user_id, now).run();
  }
  return adminOrder(env, id);
}

async function listProducts(env, includeInactive) {
  const rows = await env.DB.prepare(
    `SELECT * FROM products ${includeInactive ? "" : "WHERE active = 1"} ORDER BY active DESC, trending DESC, is_new DESC, id`
  ).all();
  return rows.results.map(publicProduct);
}

async function createProduct(request, env) {
  const body = await readJson(request);
  const product = productPayload(body);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    "INSERT INTO products (name, image, category, family, price, sizes_json, colors_json, gallery_json, stock, active, trending, is_new, fabric, occasion, fit, care, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    product.name, product.image, product.category, product.family, product.price, JSON.stringify(product.sizes),
    JSON.stringify(product.colors), JSON.stringify(product.gallery), product.stock, product.active ? 1 : 0,
    product.trending ? 1 : 0, product.isNew ? 1 : 0, product.fabric, product.occasion, product.fit, product.care, now, now
  ).run();
  const row = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(result.meta.last_row_id).first();
  return publicProduct(row);
}

async function updateProduct(request, env, id) {
  const current = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
  if (!current) fail(404, "Product not found.");
  const product = productPayload(await readJson(request), productFromRow(current));
  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE products SET name = ?, image = ?, category = ?, family = ?, price = ?, sizes_json = ?, colors_json = ?, gallery_json = ?, stock = ?, active = ?, trending = ?, is_new = ?, fabric = ?, occasion = ?, fit = ?, care = ?, updated_at = ? WHERE id = ?"
  ).bind(
    product.name, product.image, product.category, product.family, product.price, JSON.stringify(product.sizes),
    JSON.stringify(product.colors), JSON.stringify(product.gallery), product.stock, product.active ? 1 : 0,
    product.trending ? 1 : 0, product.isNew ? 1 : 0, product.fabric, product.occasion, product.fit, product.care, now, id
  ).run();
  return publicProduct(await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first());
}

function productPayload(body, current = {}) {
  const name = productText(body.name ?? current.name, "Product name", 2, 140);
  const image = validImageRef(body.image ?? current.image);
  const category = String(body.category ?? current.category ?? "dress").trim().toLowerCase();
  if (!["dress", "set"].includes(category)) fail(400, "Choose dress or set as the category.");
  const price = integerValue(body.price ?? current.price, "Price", 0, 1000000);
  const stock = integerValue(body.stock ?? current.stock, "Stock", 0, 100000);
  const sizes = listValue(body.sizes ?? current.sizes, ["S", "M", "L"], 12).map((value) => {
    const size = value.toUpperCase();
    if (!/^[A-Z0-9 -]{1,12}$/.test(size)) fail(400, "Use short letters or numbers for product sizes.");
    return size;
  });
  const colors = listValue(body.colors ?? current.colors, ["#1a1814"], 12).map((value) => {
    if (!/^#[0-9a-f]{6}$/i.test(value)) fail(400, "Use six-digit hex colors such as #1a1814.");
    return value.toLowerCase();
  });
  const gallery = listValue(body.gallery ?? current.gallery, [image], 16).map(validImageRef);
  return {
    name, image, category, family: category === "set" ? "Set" : "Dress", price, stock, sizes, colors, gallery,
    active: boolValue(body.active ?? current.active ?? true), trending: boolValue(body.trending ?? current.trending ?? false),
    isNew: boolValue(body.isNew ?? current.isNew ?? false), fabric: optionalProductText(body.fabric ?? current.fabric, 300),
    occasion: optionalProductText(body.occasion ?? current.occasion, 300), fit: optionalProductText(body.fit ?? current.fit, 300),
    care: optionalProductText(body.care ?? current.care, 300)
  };
}

function productFromRow(row) {
  return {
    id: Number(row.id), name: row.name, image: row.image, category: row.category, family: row.family, price: Number(row.price),
    sizes: jsonList(row.sizes_json, ["S", "M", "L"]), colors: jsonList(row.colors_json, ["#1a1814"]),
    gallery: jsonList(row.gallery_json, [row.image]), stock: Number(row.stock), active: Boolean(row.active),
    trending: Boolean(row.trending), isNew: Boolean(row.is_new), fabric: row.fabric || "", occasion: row.occasion || "",
    fit: row.fit || "", care: row.care || ""
  };
}

function publicProduct(row) {
  const product = productFromRow(row);
  return { ...product, ne: product.name, cat: product.category };
}

async function geminiStyle(request, env, ip) {
  if (!env.GEMINI_API_KEY) fail(503, "NIVA Assistant is being connected. Please DM @niva.creation_ for styling help for now.");
  await enforceRateLimit(env, "ai:global", 300, 86400);
  await enforceRateLimit(env, `ai:${ip}`, 20, 600);
  const message = validText((await readJson(request)).message, "Message", 2, 600);
  const products = await listProducts(env, false);
  const catalog = products.map((product) => `${product.name}: Rs. ${product.price}; stock ${product.stock}; ${product.occasion}`).join("\n");
  const prompt = `You are NIVA Assistant, a concise fashion stylist for a Nepal-based women's dresses and sets boutique. Recommend only products from the live catalog below. Mention price in NPR when recommending an item. For sizing, say customers should check the size guide and DM @niva.creation_ with measurements if unsure. Do not promise stock, delivery dates, returns beyond damaged-delivery or wrong-item/wrong-size fulfilment issues, or NCM tracking before parcel booking. Keep replies warm, useful, and under 110 words.\n\nLIVE CATALOG:\n${catalog}\n\nCUSTOMER MESSAGE:\n${message}`;
  const model = String(env.GEMINI_MODEL || "gemini-2.5-flash-lite").trim();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 180, temperature: 0.6 } })
  });
  if (!response.ok) {
    console.error(JSON.stringify({ event: "gemini_error", status: response.status }));
    fail(502, "NIVA Assistant is taking a short pause. Please DM @niva.creation_ for quick styling help.");
  }
  const data = await response.json();
  const reply = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!reply) fail(502, "NIVA Assistant could not answer that yet. Please DM @niva.creation_ for quick styling help.");
  return reply;
}

async function restoreReservations(env, reservations) {
  if (!reservations.length) return;
  const now = new Date().toISOString();
  await env.DB.batch(reservations.map((reservation) => env.DB.prepare(
    "UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?"
  ).bind(reservation.qty, now, reservation.id)));
}

async function restoreOrderStock(env, orderId) {
  const rows = await env.DB.prepare(
    "SELECT product_id AS id, SUM(qty) AS qty FROM order_items WHERE order_id = ? GROUP BY product_id"
  ).bind(orderId).all();
  await restoreReservations(env, rows.results.map((row) => ({ id: Number(row.id), qty: Number(row.qty) })));
}

async function requireAdmin(request, env) {
  const session = await requireSession(request, env);
  if (session.role !== "admin") fail(403, "Administrator access required.");
  return session;
}

async function requireSession(request, env) {
  const session = await optionalSession(request, env);
  if (!session) fail(401, "Sign in to continue.");
  return session;
}

async function optionalSession(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const session = await env.DB.prepare(
    "SELECT sessions.id AS session_id, users.id AS user_id, users.email, users.name, users.phone, users.role FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?"
  ).bind(tokenHash, now).first();
  return session || null;
}

async function createSession(env, userId) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const days = Math.max(1, Math.min(90, Number(env.SESSION_DAYS) || 30));
  const expires = new Date(Date.now() + days * 86400000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(new Date().toISOString()),
    env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), userId, tokenHash, expires, new Date().toISOString())
  ]);
  return token;
}

async function enforceRateLimit(env, key, limit, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare("SELECT attempts, window_start FROM rate_limits WHERE key = ?").bind(key).first();
  if (!row || now - Number(row.window_start) >= windowSeconds) {
    await env.DB.prepare("INSERT INTO rate_limits (key, attempts, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = 1, window_start = excluded.window_start")
      .bind(key, now).run();
    return;
  }
  if (Number(row.attempts) >= limit) fail(429, "Too many attempts. Please try again later.");
  await env.DB.prepare("UPDATE rate_limits SET attempts = attempts + 1 WHERE key = ?").bind(key).run();
}

async function readJson(request) {
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) fail(413, "Request is too large.");
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(merged) || "{}");
  } catch {
    fail(400, "Send valid JSON.");
  }
}

function corsHeaders(origin, env) {
  if (!origin) return {};
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(headers || {}) }
  });
}

function publicUser(user) {
  return { id: user.user_id, email: user.email, name: user.name, phone: user.phone || "", role: user.role };
}

function receiptOrder(order) {
  const items = (order.items || []).map((item) => ({
    name: item.name, nameNe: item.name, image: item.image, category: item.category,
    unitPrice: item.price ?? item.unit_price, qty: item.qty, total: item.total, size: item.size, color: item.color
  }));
  return {
    id: order.id, orderNum: order.order_num, date: order.created_at, dateReadable: new Date(order.created_at).toLocaleString(),
    customerName: order.customer_name, phone: order.phone, email: order.email || "", district: order.district,
    address: order.address, landmark: order.landmark, instagram: order.instagram || "", notes: order.customer_notes || "",
    items, itemsSummary: order.items_summary, subtotal: order.subtotal, deliveryCharge: order.delivery_charge, total: order.total,
    paymentMethod: order.payment_method, status: order.status, logisticsPartner: order.logistics_partner,
    trackingNumber: order.tracking_number || ""
  };
}

function customerOrder(order) {
  return {
    orderNum: order.order_num, itemsSummary: order.items_summary, total: order.total, status: order.status,
    logisticsPartner: order.logistics_partner, trackingNumber: order.tracking_number || "", date: order.created_at
  };
}

function adminOrderSummary(order) {
  return {
    id: order.id, orderNum: order.order_num, customerName: order.customer_name, phone: order.phone, district: order.district,
    itemsSummary: order.items_summary, total: order.total, status: order.status, trackingNumber: order.tracking_number || "",
    returnFlag: order.return_flag, date: order.created_at, updatedAt: order.updated_at
  };
}

function fullAdminOrder(order, items, logs) {
  return {
    ...adminOrderSummary(order), email: order.email || "", address: order.address, landmark: order.landmark,
    instagram: order.instagram || "", customerNotes: order.customer_notes || "", adminNotes: order.admin_notes || "",
    subtotal: order.subtotal, deliveryCharge: order.delivery_charge, paymentMethod: order.payment_method,
    logisticsPartner: order.logistics_partner, items, logs
  };
}

function validEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180) fail(400, "Enter a valid email address.");
  return email;
}

function validPassword(value) {
  const password = String(value || "");
  if (password.length < 8 || password.length > 128) fail(400, "Use a password with at least 8 characters.");
  return password;
}

function validPhone(value) {
  const phone = String(value || "").replace(/[\s-]/g, "");
  if (!/^(?:\+?977)?9\d{9}$/.test(phone)) fail(400, "Enter a valid Nepal mobile number.");
  return phone;
}

function validText(value, label, min, max) {
  const text = String(value || "").trim();
  if (text.length < min || text.length > max) fail(400, `${label} is required.`);
  return text;
}

function optionalText(value, max) {
  const text = String(value || "").trim();
  if (text.length > max) fail(400, "One of your details is too long.");
  return text;
}

function productText(value, label, min, max) {
  const text = validText(value, label, min, max);
  if (/[<>]/.test(text)) fail(400, `${label} cannot contain HTML characters.`);
  return text;
}

function optionalProductText(value, max) {
  const text = optionalText(value, max);
  if (/[<>]/.test(text)) fail(400, "Product descriptions cannot contain HTML characters.");
  return text;
}

function integerValue(value, label, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) fail(400, `${label} must be a whole number between ${min} and ${max}.`);
  return number;
}

function boolValue(value) {
  return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
}

function listValue(value, fallback, maxItems) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  const cleaned = list.map((item) => String(item).trim()).filter(Boolean);
  if (!cleaned.length) return fallback;
  if (cleaned.length > maxItems || cleaned.some((item) => item.length > 500)) fail(400, "One of your product lists is too long.");
  return [...new Set(cleaned)];
}

function validImageRef(value) {
  const ref = validText(value, "Product image", 2, 500);
  if (!/^(?:[a-z0-9][a-z0-9-]*|niva-v2-assets\/[a-z0-9/_-]+\.(?:jpe?g|png|webp)|https:\/\/[a-z0-9./_%?=&-]+)$/i.test(ref)) {
    fail(400, "Use a safe product image key, local image path, or HTTPS image URL.");
  }
  return ref;
}

function jsonList(value, fallback) {
  try {
    const list = JSON.parse(value || "[]");
    return Array.isArray(list) && list.length ? list : fallback;
  } catch {
    return fallback;
  }
}

function makeOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `NIVA-${date}-${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

async function passwordDigest(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64Url(salt), iterations: PBKDF2_ITERATIONS },
    key,
    256
  );
  return toBase64Url(new Uint8Array(bits));
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toBase64Url(new Uint8Array(digest));
}

function randomToken(length) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(length)));
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function safeEqual(left, right) {
  const a = encoder.encode(String(left));
  const b = encoder.encode(String(right));
  let result = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) result |= (a[i] || 0) ^ (b[i] || 0);
  return result === 0;
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
