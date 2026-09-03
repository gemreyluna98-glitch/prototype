# Cloudflare Pages Deployment Guide

Ang Cohin Inventory System ay gumagamit ng **Cloudflare D1** (SQLite-based database) para sa storage — hindi na KV.

---

## Method 1: Deploy via GitHub (Recommended)

### Step 1 — I-push ang code sa GitHub
1. Gumawa ng bagong GitHub repository.
2. I-upload ang lahat ng files sa folder na ito.

### Step 2 — Gumawa ng D1 Database
1. Pumunta sa [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Piliin ang iyong account → **Workers & Pages** → **D1 SQL Database**
3. Click **Create database**
4. Pangalanan ito ng `cohin-db` (o kahit anong gusto mo)
5. Pagkatapos magawa, buksan ang **Console** tab ng bagong database, i-paste ang buong laman ng `functions/d1/schema.sql` na file na ito, tapos i-run — gagawa ito ng mga kailangang tables (`items`, `transaction_history`, `pallet_capacities`).

### Step 3 — I-deploy sa Cloudflare Pages
1. Sa Cloudflare Dashboard → **Workers & Pages** → **Create application** → **Pages**
2. Click **Connect to Git** at piliin ang iyong GitHub repo.
3. Sa **Build settings**:
   - **Framework preset**: `None`
   - **Build command**: (wag lagyan, iwan blank)
   - **Build output directory**: `/` (root)
4. Click **Save and Deploy**.

### Step 4 — I-bind ang D1 Database
1. Pagka-deploy, pumunta sa iyong Pages project → **Settings** → **Bindings**
2. Click **Add** → **D1 database**:
   - **Variable name**: `DB`
   - **D1 database**: piliin ang `cohin-db` na ginawa mo sa Step 2
3. Click **Save**.

### Step 5 — I-set ang Environment Variables
1. Sa parehong Settings page → **Environment variables and Secrets**
2. Click **Add variable**:
   - **Variable name**: `SYSTEM_PASSWORD`
   - **Value**: ang iyong password (hal. `101010`)
3. I-set ito sa parehong **Production** at **Preview**.
4. (Optional pero rekomendado) Magdagdag ng isa pang variable:
   - **Variable name**: `SESSION_SECRET`
   - **Value**: kahit anong mahabang random na text (hal. `openssl rand -hex 32` sa terminal, o kahit anong 32+ character na random string)
   - Ginagamit ito para pumirma sa mga session token pagkatapos mag-login. Kung hindi mo ito ise-set, gagamitin na lang ng system ang `SYSTEM_PASSWORD` bilang pansamantalang signing key — gumagana pa rin, pero mas mainam kung magkaiba ang dalawa.
5. Piliing gawing **Encrypt/Secret** ang dalawang variable na ito kung available ang option — para hindi ito makita ng kahit sino sa dashboard mismo.
6. (Rekomendado bago mag-production) Magdagdag pa ng isa pang variable:
   - **Variable name**: `ALLOWED_ORIGIN`
   - **Value**: ang buong URL ng iyong Pages site (hal. `https://your-project.pages.dev`)
   - Kung hindi mo ito ise-set, ang API ay tatanggap pa rin ng requests mula sa kahit anong website (`*`) — gumagana pa rin, pero mas ligtas kung i-restrict mo ito sa sarili mong domain lang.
7. Click **Save**.

### Step 6 — Redeploy
1. Pumunta sa **Deployments** tab.
2. Click **...** sa pinakabagong deployment → **Retry deployment**.
3. Hintayin itong matapos. Done! 🎉

---

## Method 2: Direct Upload (Drag & Drop)

1. Mag-login sa [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. **Workers & Pages** → **Create application** → **Pages** → **Upload assets**
3. Pangalanan ang iyong project.
4. I-drag and drop ang buong folder na ito.
5. Click **Deploy site**.
6. Sundan ang Steps 2, 4–6 mula sa Method 1 para gawin/i-bind ang D1 database at i-set ang mga password.

---

## Paano gamitin ang `wrangler.toml` (para sa local testing)

1. I-install ang Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```
2. I-update ang `wrangler.toml` — palitan ang `database_id` ng actual na ID ng iyong D1 database (makikita sa D1 dashboard pagkatapos itong gawin).
3. Gumawa ng `.dev.vars` file para sa local environment variables:
   ```
   SYSTEM_PASSWORD=101010
   SESSION_SECRET=kahit-anong-random-string-dito
   ```
4. Gawin ang local na bersyon ng D1 schema:
   ```bash
   wrangler d1 execute cohin-db --local --file=functions/d1/schema.sql
   ```
5. I-run ang local dev server:
   ```bash
   wrangler pages dev .
   ```

---

## Mga Importanteng Tandaan

- **⚠️ Kailangang i-update ang schema kung existing na deployment ka:** Idinagdag ang bagong `active_session` table (para sa single-active-session enforcement — nililimitahan ang pag-edit sa isang device lang nang sabay-sabay). Kung may existing ka nang D1 database, kailangan mong i-run ulit ang `functions/d1/schema.sql` laban dito bago gumana ang feature na ito. Ligtas itong ulitin kahit may laman na ang tables mo (`CREATE TABLE IF NOT EXISTS`) — hindi nito hahawakan o babaguhin ang existing data mo, idadagdag lang ang bagong table. Via Cloudflare Dashboard → D1 → piliin ang database mo → **Console** tab → i-paste ang buong laman ng `functions/d1/schema.sql` → Execute. O via CLI: `wrangler d1 execute cohin-db --file=functions/d1/schema.sql --remote`

- **Backup bago mag-migrate**: Bago gumawa ng malaking pagbabago sa database (bagong deployment, schema update), i-export muna gamit ang backup feature ng app (File Ops → Backup) bilang safety net.
- **Free tier**: Ang Cloudflare D1 ay may libreng tier na sapat na para sa isang inventory system ng ganitong laki (hanggang ilang libong SKU).
- **Schema reference**: Nasa `functions/d1/schema.sql` ang kasalukuyang buong schema — gamitin ito bilang reference kung kailangan mong gumawa ng bagong database instance (staging, backup, atbp.).
