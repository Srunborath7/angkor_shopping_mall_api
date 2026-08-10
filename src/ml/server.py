from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from predict import recommend, similar


app = FastAPI(
    title       = "Angkor Shopping Mall — Recommendation ML Service",
    description = "TensorFlow-powered product recommendation engine.",
    version     = "2.0.0",
)

# Allow requests from the Node.js API (localhost) and any CORS origins in dev
app.add_middleware(
    CORSMiddleware,
    allow_origins  = ["*"],
    allow_methods  = ["GET", "POST"],
    allow_headers  = ["*"],
)


# ─────────────────────────────────────────────
# Request schemas
# ─────────────────────────────────────────────

class RecommendRequest(BaseModel):
    user_id: str
    count:   int = 10


class SimilarRequest(BaseModel):
    product_id: str
    count:      int = 8


# ─────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────

@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "service": "recommendation-ml"}


# ─────────────────────────────────────────────
# Personalised recommendations
# ─────────────────────────────────────────────

@app.post("/recommend", tags=["Recommendations"])
def get_recommendations(req: RecommendRequest):
    """
    Return top-N products for a specific user.
    If the user is not in the training data, returns unknown_user=true
    so the Node.js API can fall back to popular products.
    """
    if req.count < 1 or req.count > 100:
        raise HTTPException(status_code=400, detail="count must be between 1 and 100")

    result = recommend(req.user_id, req.count)

    return {
        "success":          True,
        "unknown_user":     result["unknown_user"],
        "recommendations":  result["recommendations"],
    }


# ─────────────────────────────────────────────
# Similar products
# ─────────────────────────────────────────────

@app.post("/similar", tags=["Recommendations"])
def get_similar(req: SimilarRequest):
    """
    Return products most similar to a given product using
    cosine similarity on learned product embeddings.
    Falls back to unknown_product=true if product is not in the model.
    """
    if req.count < 1 or req.count > 100:
        raise HTTPException(status_code=400, detail="count must be between 1 and 100")

    result = similar(req.product_id, req.count)

    return {
        "success":         True,
        "unknown_product": result["unknown_product"],
        "similar":         result["similar"],
    }