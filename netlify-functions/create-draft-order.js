// netlify/functions/create-draft-order.js
import fetch from "node-fetch";

const STORE = process.env.SHOPIFY_STORE;               // e.g. googlereviewdemo7.myshopify.com
const API_VERSION = "2024-04";
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;   // Admin API token with draft_orders write

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }
    if (!STORE || !ADMIN_TOKEN) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing env vars" }) };
    }

    const payload = JSON.parse(event.body || "{}");
    const { line_items = [], note = "" } = payload;

    const items = line_items.map((li) => {
      const priceFloat = (li.price_cents ?? 0) / 100;
      return {
        title: li.title || "Custom Item",
        quantity: li.quantity || 1,
        sku: li.sku || undefined,
        price: priceFloat.toFixed(2),
        properties: li.properties || [],
        taxable: false
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
      return { statusCode: 500, body: JSON.stringify({ ok:false, error:"Shopify error", details:data }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, invoice_url: data.draft_order.invoice_url })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: e.message }) };
  }
};
