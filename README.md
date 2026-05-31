# Karnataka Crime Intelligence & Analytical Platform

A **Crime Intelligence & Analytical Platform** for the Karnataka State Crime
Records Bureau (SCRB), built and deployed **exclusively on Zoho Catalyst**. It
replaces static, siloed Excel reporting with interactive dashboards, geospatial
hotspot maps, crime-pattern analytics, AI/ML risk scoring, criminal-network link
analysis, anomaly detection, and a bilingual (English / ಕನ್ನಡ), voice-enabled
conversational intelligence assistant — all grounded in **real, public Karnataka
State Police data**.

> **Live demo:** https://datahackathon2026-60072987070.development.catalystserverless.in/app/index.html
> &nbsp;·&nbsp; Friendly alias: https://app.helperhome.works/app/
>
> **Demo login (role-based):** `supervisor` / `scrb@2025` — additional roles in
> [Demo access](#demo-access).

---

## 1. Problem statement

Karnataka State Police maintains extensive crime records, but the analytical
ecosystem suffers from:

- **Data silos & manual processes** — records live in disconnected Excel sheets.
- **No advanced analytics** — behavioural patterns and criminal networks stay hidden.
- **Information gaps** — SCRB receives fragmented data, blocking state-wide analysis.
- **Reactive policing** — no systematic exploration of emerging trends.

This platform moves SCRB from reactive reporting to a proactive **Strategic
Intelligence Hub**.

## 2. Key features

| # | Capability | Where |
|---|------------|-------|
| 1 | **Interactive dashboards** — state KPIs, top districts, crime-head breakdowns | Dashboard |
| 2 | **Geospatial hotspot map** — district → police-station drill-down, colour/size by volume | Hotspot Map |
| 3 | **Spatiotemporal clusters** — time-of-day × location for proactive deployment | Hotspot Map |
| 4 | **Emerging-trend red-zone alerts** — pulsing markers + MoM/YoY spike detection | Map / Trends |
| 5 | **Criminal network & link analysis** — force-directed graph of offenders, accounts, gangs | Network |
| 6 | **Repeat-offender tracking & Modus Operandi** — cross-jurisdiction MO profiling | Network |
| 7 | **Association & key-player detection** — degree centrality, money-trail tracing | Network |
| 8 | **Socio-economic correlation** — Census 2011 (literacy, urbanisation, density) × crime | Socio-Economic |
| 9 | **Predictive risk scoring** — k-NN + Zia AutoML, composite district risk index | Risk / Socio |
| 10 | **Anomaly detection** — z-score behavioural-deviation call-outs (spatial + temporal) | Trends |
| 11 | **Real 12-month trends & forecasting** — least-squares projection on actual KSP monthly data | Trends |
| 12 | **Conversational assistant** — NL queries, LLM-grounded answers, English/Kannada + TTS | Ask Intelligence |
| 13 | **PDF intelligence reports** — server-side generation (SmartBrowz) | All pages |
| 14 | **Full-text search** — across the crime catalogue | Top bar |

## 3. Technology stack

**Frontend** — React 18 + Vite, React Router, Chart.js (`react-chartjs-2`),
Leaflet (`react-leaflet`), lucide-react icons, Web Speech API (Kannada TTS).
Builds into `client/` and is served by **Catalyst Web Client Hosting**.

**Backend** — Node.js 18 **Catalyst Advanced I/O function** (`functions/crime_api`,
Express) for analytics, NLQ, ML, reports; plus a standalone **Catalyst AppSail**
managed-runtime microservice (`appsail/`) exposing a public open-data API.

**Data** — ETL in Python (standard library only) under `etl/`, normalising raw
KSP CSVs into clean relational tables loaded into **Catalyst Data Store**.

### Catalyst services used

Serverless Functions · AppSail (managed runtime) · Web Client Hosting · Domain
Mappings (custom domain + SSL) · Data Store · NoSQL (audit logs) · Stratus
(report archival) · Cache · Data Store full-text Search · QuickML (LLM serving /
RAG + translation) · Zia AutoML (tabular model) · Zia Services (text analytics /
OCR) · SmartBrowz (PDF) · Authentication · API Gateway · Connections (OAuth) ·
Cron · Signals + Event Functions · Mail · Push Notifications · Pipelines (CI/CD).

## 4. Proposed impact & use case

- **Proactive deployment** — spatiotemporal hotspots tell SCRB *where* and *when*
  to position resources before crime peaks.
- **Break the silos** — network analysis links fragmented data points into
  organised-crime structures invisible in isolated spreadsheets.
- **Evidence-based prevention** — socio-economic correlation explains the *why*
  behind the *where*; anomaly detection flags cases that deviate from the norm.
- **Faster intelligence** — a natural-language assistant lets non-technical
  officers query state-wide data in English or Kannada and export briefings.

## 5. Data

Source: **Karnataka State Police — Monthly Crime Review (2025)**, published as
open data (Government Open Data License – India / Public Domain) via
[data.gov.in](https://www.data.gov.in).

- 12 monthly review files (`data/import/`)
- District-wise IPC/BNS & SLL totals, crime-head sub-type breakdowns, and crimes
  against Women / Children / SC-ST.

State totals reconcile to the official published figures.

> The KSP open dataset is **aggregate statistical data** — no incident-level
> records or PII. Analytics are built to that granularity and modules are
> integration-ready for SCRB's internal record systems.

## 6. Project layout

```
appsail/            Catalyst AppSail microservice (public open-data API)
client/             Catalyst-hosted static build output (Vite -> deploy artifact)
data/
  import/           Monthly KSP CSVs + reference tables
  processed/        Normalised relational tables (Data Store source)
  ml/               ML training / scoring datasets
etl/                Python ETL (stdlib only): normalise, validate, build datasets
functions/
  crime_api/        Advanced I/O function (Express): analytics + NLQ + ML + reports
  ingest_cron/      Scheduled ingestion (Cron)
  event_handler/    Event function (Signals: reacts to Data Store changes)
web/                React + Vite source (builds into client/)
catalyst.json       Catalyst project config
```

## 7. Local development

Prerequisites: **Node.js 18+**, **Python 3.9+**, **Catalyst CLI**
(`npm i -g zcatalyst-cli`).

```bash
# 1. (Optional) regenerate processed data from raw CSVs
python etl/monthly_temporal.py
python etl/validate.py            # reconciliation checks

# 2. Run the API function locally (port 9000)
cd functions/crime_api
npm install
node test/serve-local.js
node test/smoke.js                # analytics + NLQ + security smoke tests

# 3. Run the React frontend (proxies /server/crime_api -> :9000)
cd web
npm install
npm run dev                       # http://localhost:5173
```

## 8. Build & deploy to Catalyst

```bash
# Build the frontend into client/
cd web && npm run build && cd ..

# Log in (data center: India) and deploy
catalyst login --dc in
catalyst deploy                   # or: catalyst deploy --only "client,functions"

# Deploy the AppSail microservice
cd appsail && catalyst deploy
```

CI/CD is configured via **Catalyst Pipelines** (`catalyst-pipelines.yml`): a push
to `main` builds the frontend and runs `catalyst deploy` automatically.

### Configuration

Function environment variables live in `functions/crime_api/catalyst-config.json`.
For a public checkout, secrets are replaced with placeholders — set real values
in the Catalyst console (or the config file) before deploying:

- `ADMIN_TOKEN` — protects `/admin/*` maintenance endpoints.
- `ALERT_FROM_EMAIL` / `ALERT_TO_EMAIL` / `PUSH_RECIPIENTS` — alerting.
- `ENFORCE_AUTH` — `true` to require Catalyst Authentication on data endpoints
  (`false` in demo mode). Keep in sync with `DEMO` in `web/index.html` and
  `DEMO_MODE` in `web/src/auth.js`.

## 9. Demo access

The hosted demo runs in **demo mode** (Catalyst Authentication bypassed so
evaluators don't need accounts). Role-based logins:

| Username | Password | Role |
|----------|----------|------|
| `supervisor` | `scrb@2025` | Supervisor (full access) |
| `analyst` | `analyst@2025` | Analyst |
| `investigator` | `invest@2025` | Investigator |
| `policymaker` | `policy@2025` | Policy Maker |

## 10. API reference (`/server/crime_api`)

`GET /health` · `/overview` · `/districts` · `/districts/rank` · `/hotspots` ·
`/risk-scores` · `/categories` · `/categories/detail` · `/vulnerable` ·
`/trends/alerts` · `/forecast` · `/monthly/series` · `/monthly/forecast` ·
`/monthly/alerts` · `/anomalies` · `/network/*` · `/socio/*` · `/ml/*` ·
`/stations/*` · `/search` · `POST /ask` · `POST /translate` · `/report/*`

## 11. License

- **Code:** [MIT License](LICENSE).
- **Data:** the Karnataka State Police crime figures are public open data under
  the Government Open Data License – India (GODL) / public domain, credited to
  KSP via data.gov.in. The data license is independent of the code license.

---

*Built for Datathon 2026. Deployed on Zoho Catalyst.*
