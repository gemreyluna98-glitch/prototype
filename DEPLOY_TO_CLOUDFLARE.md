# Cloudflare Pages Deployment Guide

## Ano ang pagbabago mula sa Vercel?

| Vercel | Cloudflare |
|--------|------------|
| Vercel KV / Redis (ioredis) | Cloudflare KV |
| Vercel Serverless Functions | Cloudflare Pages Functions |
| `/_vercel/insights/script.js` | (inalis) |

---

## Method 1: Deploy via GitHub (Recommended)

### Step 1 — I-push ang code sa GitHub
1. Gumawa ng bagong GitHub repository.
2. I-upload ang lahat ng files sa `cloudflare-version/` folder na ito.

### Step 2 — Gumawa ng Cloudflare KV Namespace
1. Pumunta sa [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Piliin ang iyong account → **Workers & Pages** → **KV**
3. Click **Create a namespace**
4. Pangalanan ito ng `COHIN_KV` (o kahit anong gusto mo)
5. **Kopyahin ang Namespace ID** — kakailanganin mo ito mamaya.

### Step 3 — I-deploy sa Cloudflare Pages
1. Sa Cloudflare Dashboard → **Workers & Pages** → **Create application** → **Pages**
2. Click **Connect to Git** at piliin ang iyong GitHub repo.
3. Sa **Build settings**:
   - **Framework preset**: `None`
   - **Build command**: (wag lagyan, iwan blank)
   - **Build output directory**: `/` (root)
4. Click **Save and Deploy**.

### Step 4 — I-bind ang KV Namespace
1. Pagka-deploy, pumunta sa iyong Pages project → **Settings** → **Functions**
2. Sa **KV namespace bindings**, click **Add binding**:
   - **Variable name**: `COHIN_KV`
   - **KV namespace**: piliin ang `COHIN_KV` na ginawa mo sa Step 2
3. Click **Save**.

### Step 5 — I-set ang Environment Variable para sa Password
1. Sa parehong Settings page → **Environment variables**
2. Click **Add variable**:
   - **Variable name**: `SYSTEM_PASSWORD`
   - **Value**: ang iyong password (hal. `101010`)
3. I-set ito sa parehong **Production** at **Preview**.
4. Click **Save**.

### Step 6 — Redeploy
1. Pumunta sa **Deployments** tab.
2. Click **...** sa pinakabagong deployment → **Retry deployment**.
3. Hintayin itong matapos. Done! 🎉

---

## Method 2: Direct Upload (Drag & Drop)

1. Mag-login sa [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. **Workers & Pages** → **Create application** → **Pages** → **Upload assets**
3. Pangalanan ang iyong project.
4. I-drag and drop ang buong `cloudflare-version/` folder.
5. Click **Deploy site**.
6. Sundan ang Steps 4–6 mula sa Method 1 para i-bind ang KV at i-set ang password.

---

## Paano gamitin ang `wrangler.toml` (para sa local testing)

1. I-install ang Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```
2. I-update ang `wrangler.toml` — palitan ang `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` ng actual na ID ng iyong KV namespace.
3. Gumawa ng `.dev.vars` file para sa local environment variables:
   ```
   SYSTEM_PASSWORD=101010
   ```
4. I-run ang local dev server:
   ```bash
   wrangler pages dev .
   ```

---

## Mga Importanteng Tandaan

- **Data migration**: Kung gusto mong ilipat ang existing data mula Vercel Redis patungong Cloudflare KV, i-export muna gamit ang backup feature ng app (File Ops → Backup), tapos i-restore sa bagong Cloudflare deployment.
- **Free tier**: Ang Cloudflare KV ay libre hanggang 100,000 reads/day at 1,000 writes/day — higit pa sa sapat para sa isang inventory system.
- **Walang Redis needed**: Hindi na kailangan ng external Redis server — built-in na ang KV sa Cloudflare.
