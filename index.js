const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const LOW_THRESHOLD = 5;

// Default costs from cost sheets (Shopify unit cost)
// Format: shopify_variant_title -> { '5oz': cost, '9oz': cost, '12oz': cost }
const DEFAULT_COSTS = {
  'Plain Jane':       { '5oz': 10.86, '9oz': 13.97, '12oz': 18.70 },
  'Adjust':           { '5oz': 13.05, '9oz': 17.90, '12oz': 23.95 },
  'Anna Bird':        { '5oz': 12.74, '9oz': 17.35, '12oz': 23.20 },
  'Ask G.O.D':        { '5oz': 12.74, '9oz': 17.35, '12oz': 23.20 },
  'Balance':          { '5oz': 12.72, '9oz': 17.31, '12oz': 23.15 },
  'Be Honest':        { '5oz': 13.05, '9oz': 17.90, '12oz': 23.95 },
  'Body Language':    { '5oz': 10.86, '9oz': 13.97, '12oz': 18.70 },
  'Body language':    { '5oz': 10.86, '9oz': 13.97, '12oz': 18.70 },
  'C\'est La Vie':    { '5oz': 12.61, '9oz': 17.12, '12oz': 22.90 },
  'Create':           { '5oz': 13.99, '9oz': 19.60, '12oz': 26.20 },
  'Free Spirit':      { '5oz': 12.92, '9oz': 17.68, '12oz': 23.65 },
  'Fresh':            { '5oz': 13.05, '9oz': 17.90, '12oz': 23.95 },
  'Let it go!':       { '5oz': 13.05, '9oz': 17.90, '12oz': 23.95 },
  'Let It Go!':       { '5oz': 13.05, '9oz': 17.90, '12oz': 23.95 },
  'Life':             { '5oz': 14.30, '9oz': 20.15, '12oz': 26.95 },
  'Noice!':           { '5oz': 13.05, '9oz': 17.90, '12oz': 23.95 },
  'Patience':         { '5oz': 12.92, '9oz': 17.68, '12oz': 23.65 },
  'Pause':            { '5oz': 12.61, '9oz': 17.12, '12oz': 22.90 },
  'Profound':         { '5oz': 12.61, '9oz': 17.12, '12oz': 22.90 },
  'Rest':             { '5oz': 13.05, '9oz': 17.90, '12oz': 23.95 },
  'Smooth':           { '5oz': 12.92, '9oz': 17.68, '12oz': 23.65 },
  'Sweetest Taboo':   { '5oz': 10.86, '9oz': 13.97, '12oz': 18.70 },
  'Thank You':        { '5oz': 13.67, '9oz': 19.03, '12oz': 25.45 },
  'Transition':       { '5oz': 10.86, '9oz': 13.97, '12oz': 18.70 },
  'Vibe Worthy':      { '5oz': 13.39, '9oz': 18.52, '12oz': 24.77 },
  'You Decide':       { '5oz': 10.86, '9oz': 13.97, '12oz': 18.70 },
  'You decide':       { '5oz': 10.86, '9oz': 13.97, '12oz': 18.70 },
  'Sueño lúcido':     { '5oz': 12.42, '9oz': 16.78, '12oz': 22.45 },
};

// User overrides stored in memory
let variantCostOverrides = {};

function getCostForVariant(productTitle, variantTitle) {
  // Check user overrides first
  const overrideKey = productTitle + '|' + variantTitle;
  if (variantCostOverrides[overrideKey] !== undefined) {
    return variantCostOverrides[overrideKey];
  }
  // Fall back to default costs
  const productCosts = DEFAULT_COSTS[productTitle];
  if (productCosts) {
    const size = variantTitle.replace('Default Title', '').trim();
    return productCosts[size] || 0;
  }
  return 0;
}

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
        const cost = getCostForVariant(p.title, v.title || v.option1 || '');
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
  const product_title = req.body.product_title;
  const variant_title = req.body.variant_title;
  const cost = req.body.cost;
  if (!product_title || !variant_title || cost === undefined) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const key = product_title + '|' + variant_title;
  variantCostOverrides[key] = parseFloat(cost);
  res.json({ success: true, key: key, cost: variantCostOverrides[key] });
});

app.get('/costs', function(req, res) {
  res.json(variantCostOverrides);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, function() { console.log('Yani Dashboard running on port ' + PORT); });
