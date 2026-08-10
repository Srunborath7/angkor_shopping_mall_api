# Angkor Shopping Mall API

A professional Node.js + Express REST API with a TensorFlow-powered ML recommendation engine.

---

## 🚀 Quick Start

> ⚠️ **Important** — always run commands from the `angkor_shopping_mall_api` directory, not from the parent folder.

```bash
# Navigate to the API directory first
cd E:\Angkor_Shopping_Mall\angkor_shopping_mall_api

# Install Node.js dependencies (first time only)
npm install

# Start in development mode (auto-reload)
npm run dev

# OR start in production mode
npm start
```

The API will be available at `http://localhost:3000`

---

## 🤖 ML Recommendation Service

The ML service is a separate Python FastAPI server that the Node.js API communicates with.

### Setup Python environment

```bash
cd src/ml

# Create virtual environment (first time only)
python -m venv .venv

# Activate virtual environment
# Windows:
.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
```

### Train the model

```bash
cd src/ml
python train.py
```

The model trains on data from `user_product_interactions` table. Requires at least 10 interaction records.

### Start the ML server

```bash
cd src/ml
uvicorn server:app --host 127.0.0.1 --port 8001 --reload
```

ML endpoints:
- `GET  http://127.0.0.1:8001/health` — health check
- `POST http://127.0.0.1:8001/recommend` — personalised recommendations
- `POST http://127.0.0.1:8001/similar` — similar product suggestions

---

## 📡 API Endpoints

### Auth
| Method | Route | Auth |
|--------|-------|------|
| POST | `/api/auth/register` | No |
| POST | `/api/auth/login` | No |
| POST | `/api/auth/refresh` | No |
| POST | `/api/auth/logout` | Yes |

### Products
| Method | Route | Auth |
|--------|-------|------|
| GET | `/api/products` | No |
| GET | `/api/products/true` | No (paginated, active only) |
| GET | `/api/products/:id` | No (tracks view if logged in) |
| POST | `/api/products` | Yes (admin) |
| PUT | `/api/products/:id` | Yes (admin) |
| DELETE | `/api/products/:id` | Yes (admin) |

### Recommendations (ML-powered)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/recommendations` | Yes | Personalised recommendations for logged-in user |
| GET | `/api/recommendations/popular` | No | Globally trending products |
| GET | `/api/recommendations/search?q=keyword` | No | Search-aware product suggestions |
| GET | `/api/recommendations/similar/:productId` | No | Products similar to a given product |

### Orders
| Method | Route | Auth |
|--------|-------|------|
| POST | `/api/orders/checkout` | Yes (tracks order interactions) |
| GET | `/api/orders` | Yes |
| GET | `/api/orders/:id` | Yes |
| PUT | `/api/orders/:id/status` | Yes (admin) |

---

## 🔑 Environment Variables

Copy `.env` and fill in your values:

```env
DATABASE_URL=postgresql://...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
BOT_TOKEN=...
APP_URL=...
PORT=3000
```

---

## 🧠 How Interaction Tracking Works

The system automatically records user behaviour into `user_product_interactions`:

| Event | Weight | Trigger |
|-------|--------|---------|
| View product | 1 | Authenticated user opens product detail |
| Search products | 2 | Authenticated user searches (1 record per matched product) |
| Place order | 5 | User completes checkout (1 record per ordered product) |

The ML model trains on this data to produce personalised recommendations.
