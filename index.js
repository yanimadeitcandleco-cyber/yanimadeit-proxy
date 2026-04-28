app.get('/shopify/products', async (req, res) => {
  try {
    const token = await getToken();
    const r = await fetch('https://' + process.env.SHOPIFY_STORE + '/admin/api/2026-04/products.json?limit=50', {
      headers: { 'X-Shopify-Access-Token': token }
    });
    const data = await r.json();
    const products = (data.products || []).map(function(p) {
      const cost = productionCosts[p.id] || 0;
      const price = parseFloat(p.variants[0] ? p.variants[0].price : 0);
      const inventory = p.variants.reduce(function(sum, v) { return sum + (v.inventory_quantity || 0); }, 0);
      return Object.assign({}, p, {
        production_cost: cost,
        profit_margin: cost > 0 ? (((price - cost) / price) * 100).toFixed(1) + '%' : 'N/A',
        total_inventory: inventory,
        low_inventory_alert: inventory <= LOW_THRESHOLD
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
  const product_id = req.body.product_id;
  const cost = req.body.cost;
  if (!product_id || cost === undefined) {
    return res.status(400).json({ error: 'Missing product_id or cost' });
  }
  productionCosts[product_id] = parseFloat(cost);
  res.json({ success: true, product_id: product_id, cost: productionCosts[product_id] });
});

app.get('/costs', function(req, res) {
  res.json(productionCosts);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, function() { console.log('Yani Dashboard running on port ' + PORT); });
