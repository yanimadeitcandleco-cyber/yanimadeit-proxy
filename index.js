const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let variantCosts = {};
const LOW_THRESHOLD = 5;

async function getToken() {
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', process.env.SHOPIFY_CLIENT_ID);
  params.append('client_secret', process.env.SHOPIFY_CLIENT_SECRET);
  const r = await fetch('https://' + process.env.SHOPIFY_STORE + '/admin/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  const d = await r.json();
  return d.access_token;
}

app.get('/shopify/products', async (req, res) => {
  try {
    const token = await getToken();
    const r = await fetch('https://' + process.env.SHOPIFY_STORE + '/admin/api/2026-04/products.json?limit=50', {
      headers: { 'X-Shopify-Access-Token': token }
    });
    const data = await r.json();
    const products = (data.products || []).map(function(p) {
      const total_inventory = p.variants.reduce(function(sum, v) { return sum + (v.inventory_quantity || 0); }, 0);
      const variants_with_costs = p.variants.map(function(v) {
        const cost = variantCosts[v.id] || 0;
        const price = parseFloat(v.price || 0);
        return Object.assign({}, v, {
          production_cost: cost,
          profit: cost > 0 ? (price - cost).toFixed(2) : null,
          profit_margin: cost > 0 ? (((price - cost) / price) * 100).toFixed(1) + '%' : 'N/A'
        });
      });
      return Object.assign({}, p, {
        variants: variants_with_costs,
        total_inventory: total_inventory,
        low_inventory_alert: total_inventory <= LOW_THRESHOLD
      });
    });
    res.json({ products: products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/shopify/orders', async (req, res) => {
  try {
    const token = await getToken();
    const r = await fetch('https://' + process.env.SHOPIFY_STORE + '/admin/api/2026-04/orders.json?limit=50&status=any', {
      headers: { 'X-Shopify-Access-Token': token }
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/shopify/inventory', async (req, res) => {
  try {
    const token = await getToken();
    const r = await fetch('https://' + process.env.SHOPIFY_STORE + '/admin/api/2026-04/products.json?limit=50', {
      headers: { 'X-Shopify-Access-Token': token }
    });
    const data = await r.json();
    const inventory = (data.products || []).map(function(p) {
      const qty = p.variants.reduce(function(sum, v) { return sum + (v.inventory_quantity || 0); }, 0);
      return { id: p.id, title: p.title, total_inventory: qty, low_alert: qty <= LOW_THRESHOLD };
    });
    res.json({ inventory: inventory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/costs', function(req, res) {
  const variant_id = req.body.variant_id;
  const cost = req.body.cost;
  if (!variant_id || cost === undefined) {
    return res.status(400).json({ error: 'Missing variant_id or cost' });
  }
  variantCosts[variant_id] = parseFloat(cost);
  res.json({ success: true, variant_id: variant_id, cost: variantCosts[variant_id] });
});

app.get('/costs', function(req, res) {
  res.json(variantCosts);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, function() { console.log('Yani Dashboard running on port ' + PORT); });
