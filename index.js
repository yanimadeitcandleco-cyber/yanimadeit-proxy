const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/shopify/products', async (req, res) => {
  const { store, token } = req.query;
  if (!store || !token) return res.status(400).json({ error: 'Missing store or token' });
  try {
    const response = await fetch(`https://${store}/admin/api/2024-01/products.json?limit=50`, {
      headers: { 'X-Shopify-Access-Token': token }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log('Proxy running on port ' + PORT));
