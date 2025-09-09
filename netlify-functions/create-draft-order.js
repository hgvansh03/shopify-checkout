// netlify/functions/create-draft-order.js
import fetch from "node-fetch";

/**
 * ENV required (Netlify → Site settings → Environment variables):
 *  SHOPIFY_STORE            e.g. googlereviewdemo7.myshopify.com
 *  SHOPIFY_ADMIN_TOKEN      Admin API token with write_draft_orders
 *
 * Optional:
 *  ALLOWED_ORIGINS          Comma separated origins for CORS
 *                           e.g. https://googlereviewdemo7.myshopify.com,https://rjjcqyqebjufavdg-76061999317.shopifypreview.com,https://your-custom-domain.com
 */

const STORE = process.env.SHOPIFY_STORE;
const API_VERSION = "2024-04";
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

// Build CORS headers
function corsHeaders(origin) {
  const allowList = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  // If no allowlist set, * (use only for testing). Better to set exact origins.
  const allowOrigin =
    allowList.length === 0
      ? "*"
      : (allowList.includes(origin) ? origin : allowList[0]); // pick matching or first allowed

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json"
  };
}

export const handler = async (event) => {
  const origin = event.headers?.origin || "";
  const headers = corsHeaders(origin);

  // 1) Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

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

    // map incoming to Shopify Draft Order format (custom prices)
    const items = line_items.map(li => {
      const cents = Number.isFinite(li.price_cents) ? li.price_cents : 0;
      const price = (cents / 100).toFixed(2);

      return {
        title: li.title || "Custom Item",
        quantity: li.quantity || 1,
        sku: li.sku || undefined,
        price,                    // custom price per line
        taxable: false,           // if you want taxes, set true
        properties: Array.isArray(li.properties) ? li.properties : []
      };
    });

    const body = {
      draft_order: {
        line_items: items,
        note: note || "Configurator Draft Order",
        use_customer_default_address: true
      }
    };

    const res = await fetch(
      `https://${STORE}/admin/api/${API_VERSION}/draft_orders.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": ADMIN_TOKEN
        },
        body: JSON.stringify(body)
      }
    );

    const data = await res.json();
    if (!res.ok || !data?.draft_order) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok:false, error:"Shopify error", details:data }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok:true, invoice_url: data.draft_order.invoice_url })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok:false, error: e.message }) };
  }
};
