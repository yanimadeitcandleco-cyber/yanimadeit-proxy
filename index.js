const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory storage for production costs
let productionCosts = {};
const LOW_INVENTORY_THRESHOLD = 5;

// Auto-refresh Shopify token
async function getShopifyToken() {
  const response = await fetch(
    `https://${process.env.SHOPIFY_STORE}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      }),
    }
  );
  const data = await response.json();
  return data.access_token;
}

// GET /shopify/products
app.get('/shopify/products', async (req, res) => {
  try {
    const token = await getShopifyToken();
    const response = await fetch(
      `https://${process.env.SHOPIFY_STORE}/admin/api/2026-04/products.json?limit=50`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    const data = await response.json();

    const products = (data.products || []).map(p => {
      const cost = productionCosts[p.id] || 0;
      const price = parseFloat(p.variants[0]?.price || 0);
      const inventory = p.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0);
      return {
        ...p,
        production_cost: cost,
        profit_margin: cost > 0 ? (((price - cost) / price) * 100).toFixed(1) + '%' : 'N/A',
        total_inventory: inventory,
        low_inventory_alert: inventory <= LOW_INVENTORY_THRESHOLD,
      };
    });

    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /shopify/orders
app.get('/shopify/orders', async (req, res) => {
  try {
    const token = await getShopifyToken();
    const response = await fetch(
      `https://${process.env.SHOPIFY_STORE}/admin/api/2026-04/orders.json?limit=50&status=any`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /shopify/inventory
app.get('/shopify/inventory', async
