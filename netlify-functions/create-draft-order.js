// CommonJS + global fetch (Node 18 on Netlify)
const STORE = process.env.SHOPIFY_STORE;               // e.g. googlereviewdemo7.myshopify.com
const API_VERSION = "2024-04";
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

// OPTIONAL: comma-separated allowlist; if empty we fallback to "*"
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || "";

// Build CORS headers
function corsHeaders(origin) {
  const allowList = ALLOWED_ORIGINS.split(",").map(s => s.trim()).filter(Boolean);
  const allowOrigin = allowList.length === 0 ? "*" : (allowList.includes(origin) ? origin : allowList[0]);
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json"
  };
}

exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin) || "";
  const headers = corsHeaders(origin);

  // 1) Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  // 2) Guard
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ ok:false, error:"Method Not Allowed" }) };
  }
  if (!STORE || !ADMIN_TOKEN) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok:false, error:"Missing SHOPIFY_STORE / SHOPIFY_ADMIN_TOKEN" }) };
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const { line_items = [], note = "" } = payload;
    if (!Array.isArray(line_items) || line_items.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok:false, error:"No line_items" }) };
    }

    // Map incoming to Shopify Draft Order format (custom prices)
    const items = line_items.map(li => {
      const cents = Number.isFinite(li.price_cents) ? li.price_cents : 0;
      const price = (cents / 100).toFixed(2);
      return {
        title: li.title || "Custom Item",
        quantity: li.quantity || 1,
        sku: li.sku || undefined,
        price,
        taxable: false,
        properties: Array.isArray(li.properties) ? li.properties : []
      };
    });

    const body = { draft_order: { line_items: items, note: note || "Configurator Draft Order", use_customer_default_address: true } };

    const res = await fetch(`https://${STORE}/admin/api/${API_VERSION}/draft_orders.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ADMIN_TOKEN
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok || !data || !data.draft_order) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok:false, error:"Shopify error", details: data }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok:true, invoice_url: data.draft_order.invoice_url }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok:false, error: e.message }) };
  }
};
