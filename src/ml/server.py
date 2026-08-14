from typing import List, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os

from predict import recommend, similar, load_model_state
from train import train_model


app = FastAPI(
    title       = "Angkor Shopping Mall — Recommendation ML Service",
    description = "TensorFlow-powered product recommendation engine.",
    version     = "2.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins  = ["*"],
    allow_methods  = ["GET", "POST", "HEAD", "OPTIONS"],
    allow_headers  = ["*"],
)


class RecommendRequest(BaseModel):
    user_id: str
    count:   int = 10
    recent_product_ids: Optional[List[str]] = None


class SimilarRequest(BaseModel):
    product_id: str
    count:      int = 8


@app.on_event("startup")
def startup_event():
    """
    On startup, load trained weights or automatically train if first time.
    """
    loaded = load_model_state()
    if not loaded:
        print("[server] Initial model weights missing. Triggering initial training...")
        try:
            train_model()
            load_model_state()
            print("[server] Initial training and weight loading completed.")
        except Exception as err:
            print(f"[server] Note: Initial training skipped or failed: {err}")


@app.get("/", tags=["Health"])
@app.head("/", tags=["Health"])
def root():
    return {
        "status":  "ok",
        "service": "recommendation-ml",
        "message": "Angkor Shopping Mall ML Service is running"
    }


@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
def health():
    return {"status": "ok", "service": "recommendation-ml"}


@app.post("/recommend", tags=["Recommendations"])
@app.post("/api/recommend", tags=["Recommendations"])
def get_recommendations(req: RecommendRequest):
    """
    Return top-N recommendations for a user based on ML embeddings & recent search/view history.
    """
    if req.count < 1 or req.count > 100:
        raise HTTPException(status_code=400, detail="count must be between 1 and 100")

    result = recommend(req.user_id, req.count, req.recent_product_ids)

    return {
        "success":          True,
        "unknown_user":     result["unknown_user"],
        "recommendations":  result["recommendations"],
    }


@app.post("/similar", tags=["Recommendations"])
@app.post("/api/similar", tags=["Recommendations"])
def get_similar(req: SimilarRequest):
    """
    Return products similar to a given product using cosine similarity on embeddings.
    """
    if req.count < 1 or req.count > 100:
        raise HTTPException(status_code=400, detail="count must be between 1 and 100")

    result = similar(req.product_id, req.count)

    return {
        "success":         True,
        "unknown_product": result["unknown_product"],
        "similar":         result["similar"],
    }


@app.post("/train", tags=["Training"])
@app.post("/api/train", tags=["Training"])
def trigger_training(background_tasks: BackgroundTasks):
    """
    Triggers model re-training on the latest user interaction history
    and automatically reloads the updated weights.
    """
    try:
        meta = train_model()
        load_model_state()
        return {
            "success": True,
            "message": "Model training completed and state reloaded successfully.",
            "meta":    meta,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")


@app.post("/reload", tags=["Training"])
@app.post("/api/reload", tags=["Training"])
def reload_model():
    """
    Reload model weights and ID mappings from disk.
    """
    success = load_model_state()
    if not success:
        raise HTTPException(status_code=400, detail="Failed to reload model state.")
    return {"success": True, "message": "Model state reloaded successfully."}