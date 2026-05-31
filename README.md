<div align="center">

# 🛡️ Karnataka Crime Intelligence & Analytical Platform

### A Strategic Intelligence Hub for the Karnataka State Crime Records Bureau (SCRB)

Replacing static, siloed Excel reporting with interactive dashboards, geospatial hotspot maps, criminal‑network link analysis, AI/ML risk scoring, anomaly detection, and a bilingual (English / ಕನ್ನಡ) voice‑enabled intelligence assistant — built and deployed **exclusively on Zoho Catalyst**.

[![Deployed on Zoho Catalyst](https://img.shields.io/badge/Deployed%20on-Zoho%20Catalyst-2e7d32)](https://datahackathon2026-60072987070.development.catalystserverless.in/app/index.html)
[![Frontend](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-61dafb)](#-technology-stack)
[![Backend](https://img.shields.io/badge/Backend-Node.js%2018%20(Catalyst%20Functions)-339933)](#-technology-stack)
[![Data](https://img.shields.io/badge/Data-Real%20KSP%20%2B%201.6M%20FIRs-ff9933)](#-data-sources)
[![License](https://img.shields.io/badge/Code-MIT-blue)](LICENSE)

**🔗 Live Demo:** **[app.helperhome.works/app/](https://app.helperhome.works/app/)** &nbsp;·&nbsp; [native Catalyst URL](https://datahackathon2026-60072987070.development.catalystserverless.in/app/index.html)
&nbsp;·&nbsp; **Login:** `supervisor` / `scrb@2025`

</div>

---

## 📑 Table of contents

1. [Problem statement](#1--problem-statement)
2. [Solution overview](#2--solution-overview)
3. [Key features](#3--key-features)
4. [Architecture](#4--architecture)
5. [Technology stack](#-technology-stack)
6. [Catalyst services used](#6--catalyst-services-used)
7. [Data sources](#-data-sources)
8. [Project structure](#7--project-structure)
9. [Getting started (local)](#8--getting-started-local-development)
10. [Build & deploy](#9--build--deploy-to-catalyst)
11. [Configuration](#10--configuration)
12. [Demo access](#11--demo-access)
13. [API reference](#12--api-reference)
14. [License](#13--license)

---

## 1. 🎯 Problem statement

Karnataka State Police maintains extensive crime records, yet the analytical ecosystem faces four hurdles:

| Challenge | Reality today |
|-----------|---------------|
| **Data silos & manual processes** | Records live in disconnected, Excel‑based reports — no integrated system. |
| **Lack of advanced analytics** | No AI‑driven approach; behavioural patterns and criminal networks stay hidden. |
| **Information gaps** | SCRB receives fragmented data, blocking comprehensive state‑wide analysis. |
| **Reactive, not proactive** | Without systematic trend exploration, investigators lack tools for prevention. |

## 2. 💡 Solution overview

A state‑of‑the‑art platform that fuses **sociological insight** and **criminological intelligence** with cutting‑edge technology, moving SCRB from reactive reporting to a proactive **Strategic Intelligence Hub** across eight analytical workspaces:

> **Dashboard · Hotspot Map · Crime Patterns · Trends & Forecast · Risk & Vulnerable · Socio‑Economic · Network Analysis · Ask Intelligence**

## 3. ✨ Key features

### 🗺️ Advanced visualization
- **Interactive dashboards** — statewide KPIs split by data source, top districts, range distribution, real monthly trend.
- **Geospatial hotspot map** — three live layers: district bubbles, **real police‑station drill‑down**, and **live incident clusters** (real FIR coordinates), with a heat‑graded legend and auto‑fit navigation.
- **Spatiotemporal clusters** — time‑of‑day × location matrix to deploy resources *where* and *when* crime peaks.
- **Emerging‑trend red‑zone alerts** — pulsing map markers + MoM/YoY spike detection on the real 12‑month series.

### 🔗 Criminological network & link analysis
- **Relationship mapping** — force‑directed graph connecting offenders, accounts, and recurring locations.
- **Repeat‑offender tracking** — cross‑jurisdiction profiling with distinct **Modus Operandi (MO)** counts.
- **Association detection** — degree‑centrality key players, gang detection, and money‑trail tracing.

### 🧠 Sociological & AI/ML‑driven intelligence
- **Socio‑economic correlation** — Census 2011 (literacy, urbanisation, density, population) × crime, with Pearson coefficients.
- **Predictive risk scoring** — k‑NN classifier + hosted **Catalyst Zia AutoML** model + composite district risk index.
- **Anomaly detection** — z‑score behavioural‑deviation call‑outs (spatial outliers + temporal baseline breaks).
- **Case‑outcome analytics** — real arrest & conviction rates per district from 1.6M+ FIRs.

### 🤖 Conversational intelligence
- **Ask Intelligence** — natural‑language queries answered by a **Catalyst QuickML LLM (Qwen 2.5)** *grounded* in retrieved data (RAG‑style, hallucination‑safe), with **voice input**, **English ⇄ Kannada** translation + TTS, and **PDF export** (SmartBrowz).
- **Full‑text search** across the crime catalogue from the top bar.

## 4. 🏗️ Architecture

```
                        ┌──────────────────────────────────────────────┐
                        │              Zoho Catalyst                    │
                        │                                               │
  Browser  ─── HTTPS ──▶│  Domain Mapping (SSL) ─▶ Web Client Hosting   │
  (React SPA)           │                          (client/ build)      │
        │               │                                               │
        │  /server/...  │  API Gateway ─▶ Advanced I/O Function          │
        └──────────────▶│                 (functions/crime_api, Express) │
                        │                     │                          │
                        │     ┌───────────────┼───────────────┐         │
                        │     ▼       ▼        ▼       ▼        ▼         │
                        │  Data    QuickML   Zia   SmartBrowz Stratus    │
                        │  Store    LLM     AutoML   (PDF)   NoSQL Cache │
                        │  (ZCQL)  (RAG)   /Services        Search Mail  │
                        │                                          Push  │
                        │                                               │
                        │  Cron ─▶ ingest_cron   Signals ─▶ event_handler│
                        │  AppSail ─▶ public open-data microservice      │
                        │  Pipelines ─▶ CI/CD (build + deploy on push)   │
                        └──────────────────────────────────────────────┘

  ETL (Python, stdlib)  ─▶  data/processed/*.csv  ─▶  bundled into function + seeded to Data Store
```

**Request flow:** the SPA and the API share one origin, so the frontend calls `/server/crime_api/*` directly. The analytics layer is storage‑agnostic — it reads **Catalyst Data Store** (ZCQL) in production and falls back to bundled CSVs for resilience, so the app never hard‑fails.

## 🧰 Technology stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, Vite, React Router, Chart.js (`react-chartjs-2`), Leaflet (`react-leaflet`), lucide‑react, Web Speech API |
| **Backend** | Node.js 18 — Catalyst Advanced I/O Function (Express) + Catalyst AppSail microservice |
| **Data / ML** | Catalyst Data Store (ZCQL), Zia AutoML, QuickML LLM serving; Python (stdlib‑only) ETL |
| **Tooling** | Catalyst CLI, Catalyst Pipelines (CI/CD), GitHub |

## 6. ⚙️ Catalyst services used

This platform is **deployed exclusively on Zoho Catalyst**, genuinely using native services across the capability matrix:

| Capability | Catalyst service | Where it's used |
|------------|------------------|-----------------|
| Serverless backend logic | **Functions** (Advanced I/O) | `functions/crime_api` |
| Docker / managed runtime web app | **AppSail** | `appsail/` public open‑data API |
| Frontend / SPA hosting | **Web Client Hosting** | `client/` (Vite build) |
| Custom domain + SSL | **Domain Mappings** | `app.helperhome.works` |
| Relational database | **Data Store** | districts, crime heads, summaries (ZCQL) |
| Unstructured data | **NoSQL** | audit logs |
| Object / blob storage | **Stratus** | PDF report archival |
| Cache | **Cache** | cached aggregates (overview, hotspots, anomalies) |
| Full‑text search | **Data Store Search** | unified crime‑catalogue search |
| Text LLM / RAG | **QuickML (LLM serving)** | grounded NL assistant (Qwen 2.5) + EN⇄Kannada |
| Automated tabular ML | **Zia AutoML** | hosted crime‑risk band model |
| OCR / text analytics | **Zia Services** | case‑note analysis + OCR endpoints |
| PDF / headless browser | **SmartBrowz** | intelligence briefings & conversation export |
| Auth / login | **Authentication** | role‑based access (4 personas) |
| API routing / throttling | **API Gateway** | fronts the function + web client |
| OAuth tokens | **Connections** | scoped QuickML access |
| Scheduled jobs | **Cron** | `ingest_cron` data refresh |
| In‑project events | **Signals + Event Functions** | `event_handler` reacts to Data Store changes |
| Transactional email | **Mail** | emerging‑trend spike alerts |
| Push notifications | **Push Notifications** | supervisor spike alerts |
| CI/CD | **Pipelines** | build + deploy on push to `main` |

## 🗃️ Data sources

Two **real, public** Karnataka crime datasets:

**1. KSP Monthly Crime Review (2025)** — aggregate state/district figures, published as open data (Government Open Data License – India) via [data.gov.in](https://www.data.gov.in). Powers district dashboards, trends, forecasting, socio‑economic correlation, and anomaly detection.

**2. Karnataka Police FIR dataset (2016–2024)** — **~1.67M incident‑level FIR records** (Apache‑2.0, via Kaggle), ~487K with valid geo‑coordinates. Powers the real geospatial hotspot map, police‑unit drill‑down, live‑incident clusters, crime‑group breakdowns, and case‑outcome analytics (arrest & conviction rates).

> **Data integrity & transparency**
> District‑level analytics reconcile to official published figures. The FIR dataset provides genuine incident coordinates and case outcomes. The 573 MB raw FIR file is **not committed** — `etl/fir_incidents.py` streams and aggregates it into compact tables (≤52 KB) under `data/processed/`, bundled into the API.
> Criminal‑network / per‑offender link analysis uses **clearly‑labelled synthetic data** grounded in the real distributions, because offender‑identity links are not present in any public dataset — the module is engineered to plug into SCRB internal records unchanged.

## 7. 📂 Project structure

```
.
├── appsail/                 Catalyst AppSail microservice (public open-data API)
├── client/                  Catalyst-hosted static build output (Vite → deploy artifact)
├── data/
│   ├── import/              Source CSVs (12 monthly KSP files; raw FIR file is git-ignored)
│   ├── processed/           Normalised relational tables (Data Store source + API bundle)
│   └── ml/                  ML training / scoring datasets
├── etl/                     Python ETL (stdlib only): normalise, validate, build datasets
│   ├── monthly_temporal.py  Real 12-month KSP series
│   ├── fir_incidents.py     Streams 1.67M FIRs → compact hotspot/unit/group/outcome tables
│   └── ...
├── functions/
│   ├── crime_api/           Advanced I/O function (Express): analytics, NLQ, ML, reports
│   │   ├── index.js         Route definitions + hardening middleware
│   │   ├── lib/             analytics · nlq · llm · zia · fir · network · socio · store · ...
│   │   └── data/            Bundled processed CSVs (CSV fallback for Data Store)
│   ├── ingest_cron/         Scheduled ingestion (Cron)
│   └── event_handler/       Event function (Signals: reacts to Data Store changes)
├── web/                     React + Vite source (builds into client/)
│   └── src/
│       ├── pages/           Dashboard · HotspotMap · Patterns · Trends · Risk · Socio · Network · Assistant
│       ├── components/      ui/ · charts/ · Icon · Brand · NetworkGraph · ...
│       └── styles/          theme · layout · components (design system)
├── catalyst.json            Catalyst project config
├── catalyst-pipelines.yml   CI/CD pipeline (build + deploy)
└── LICENSE                  MIT
```

## 8. 🚀 Getting started (local development)

### Prerequisites
- **Node.js 18+**
- **Python 3.9+** (ETL is standard‑library only — no `pip install` needed)
- **Catalyst CLI** — `npm i -g zcatalyst-cli`

### Steps

```bash
# 0. Clone
git clone https://github.com/shirish-raj-gupta/karnataka-crime-intelligence-platform.git
cd karnataka-crime-intelligence-platform

# 1. (Optional) regenerate processed data from source CSVs
python etl/monthly_temporal.py     # real 12-month KSP series
python etl/validate.py             # reconciliation checks
#    For the FIR layer, download FIR_Details_Data.csv (Kaggle) into data/import/, then:
python etl/fir_incidents.py        # aggregate 1.67M FIRs → compact tables

# 2. Run the API function locally (http://localhost:9000)
cd functions/crime_api
npm install
node test/serve-local.js
node test/smoke.js                 # analytics + NLQ + security smoke tests

# 3. Run the React frontend (proxies /server/crime_api → :9000)
cd ../../web
npm install
npm run dev                        # http://localhost:5173
```

> In local/demo mode the app uses bundled CSVs and skips the Catalyst SDK, so it runs with **zero cloud credentials**.

## 9. ☁️ Build & deploy to Catalyst

```bash
# Build the frontend into client/
cd web && npm run build && cd ..

# Authenticate (data center: India) and deploy everything
catalyst login --dc in
catalyst deploy                          # or: catalyst deploy --only "client,functions"

# Deploy the standalone AppSail microservice
cd appsail && catalyst deploy
```

**Continuous deployment** is wired through **Catalyst Pipelines** (`catalyst-pipelines.yml`): every push to `main` builds the frontend and runs `catalyst deploy` automatically.

## 10. 🔧 Configuration

Function environment variables live in `functions/crime_api/catalyst-config.json`. For a public checkout, secrets are replaced with placeholders — set real values in the Catalyst console before deploying:

| Variable | Purpose |
|----------|---------|
| `ADMIN_TOKEN` | Protects `/admin/*` maintenance endpoints. |
| `ALERT_FROM_EMAIL` / `ALERT_TO_EMAIL` / `PUSH_RECIPIENTS` | Mail & push alert recipients. |
| `USE_DATASTORE` | `true` to read from Data Store (else bundled CSV). |
| `USE_CACHE` / `USE_LLM` / `AUDIT_ENABLED` | Toggle Cache, QuickML LLM, NoSQL audit. |
| `ZIA_AUTOML_MODEL_ID` | Hosted Zia AutoML model id for risk prediction. |
| `ENFORCE_AUTH` | `true` requires Catalyst Authentication (keep in sync with `DEMO` in `web/index.html` & `DEMO_MODE` in `web/src/auth.js`). |

## 11. 🔐 Demo access

The hosted demo runs in **demo mode** (Catalyst Authentication bypassed so evaluators need no account). Role‑based logins:

| Username | Password | Role | Access |
|----------|----------|------|--------|
| `supervisor` | `scrb@2025` | Supervisor | Full access |
| `analyst` | `analyst@2025` | Analyst | Analytical views |
| `investigator` | `invest@2025` | Investigator | Network & cases |
| `policymaker` | `policy@2025` | Policy Maker | Strategic dashboards |

## 12. 📡 API reference

Base path: **`/server/crime_api`** — standard envelope `{ ok, result }` / `{ ok:false, error, request_id }`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Liveness + data provenance |
| `GET` | `/overview` | Statewide snapshot for dashboards |
| `GET` | `/districts` · `/districts/rank` | District reference & ranking |
| `GET` | `/hotspots` | Statistical (z‑score) district hotspots |
| `GET` | `/risk-scores` | Composite district risk index |
| `GET` | `/categories` · `/categories/detail` | Crime‑head breakdown & sub‑type drill‑down |
| `GET` | `/vulnerable` | Crimes vs Women / Children / SC‑ST |
| `GET` | `/trends/alerts` · `/forecast` | Emerging‑spike alerts & projection |
| `GET` | `/monthly/series` · `/monthly/forecast` · `/monthly/alerts` | Real 12‑month series, forecast & spikes |
| `GET` | `/anomalies` | Behavioural anomaly detection (spatial + temporal) |
| `GET` | `/fir/hotspots` · `/fir/units` · `/fir/groups` · `/fir/outcomes` | **Real** incident‑level FIR analytics |
| `GET` | `/network/*` | Graph, repeat offenders, gangs, money trail, associations |
| `GET` | `/socio/*` · `/ml/*` | Socio‑economic correlation & ML risk prediction |
| `GET` | `/stations/*` | Police‑station drill‑down & spatiotemporal clusters |
| `GET` | `/search?q=` | Full‑text search (Catalyst Search) |
| `POST` | `/ask` | Natural‑language query (grounded LLM) |
| `POST` | `/translate` | English ⇄ Kannada (QuickML LLM) |
| `GET/POST` | `/report/*` | PDF intelligence briefing & conversation export |

## 13. 📄 License

- **Code** — [MIT License](LICENSE).
- **Data** — Karnataka crime data is public open data (Government Open Data License – India / Apache‑2.0), credited to the Karnataka State Police via data.gov.in and Kaggle. The data licenses are independent of the code license.

---

<div align="center">

**Built for Datathon 2026 · Deployed end‑to‑end on Zoho Catalyst**

*Moving the SCRB from reactive reporting to proactive, evidence‑based prevention.*

</div>
