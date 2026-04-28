const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let productionCosts = {};
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
      const cost = productionCosts[p.id] || 0;
      const price = parseFloat(p.variants[0] ? p.variants[0].price : 0);
      const inventory = p.variants.reduce(function(sum, v) { return sum + (v.inventory_quantity || 0); }, 0);
      return Object.assign({}, p, {
