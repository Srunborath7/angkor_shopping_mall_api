import os
import json

import numpy as np
import tensorflow as tf
from sklearn.metrics.pairwise import cosine_similarity

from model import RecommendationModel


MODEL_DIR = "model"


# -----------------------------------------------
# Load model metadata
# -----------------------------------------------

with open(os.path.join(MODEL_DIR, "model_meta.json")) as f:
    meta = json.load(f)

NUM_USERS     = meta["num_users"]
NUM_PRODUCTS  = meta["num_products"]
EMBEDDING_DIM = meta["embedding_dim"]


# -----------------------------------------------
# Load ID mappings
# -----------------------------------------------

with open(os.path.join(MODEL_DIR, "user_mapping.json")) as f:
    user_mapping = json.load(f)

with open(os.path.join(MODEL_DIR, "product_mapping.json")) as f:
    product_mapping = json.load(f)

reverse_products = {
    int(idx): pid
    for pid, idx in product_mapping.items()
}


# -----------------------------------------------
# Build and load model
# -----------------------------------------------

model = RecommendationModel(
    num_users    = NUM_USERS,
    num_products = NUM_PRODUCTS,
    embedding_dim= EMBEDDING_DIM,
)

# Warm up model to build weights before loading
model(tf.constant([0]), tf.constant([0]))

model.load_weights(
    os.path.join(MODEL_DIR, "recommendation.weights.h5")
)

print(f"[predict] Model loaded — {NUM_USERS} users, {NUM_PRODUCTS} products.")


# -----------------------------------------------
# Pre-compute product embedding matrix
# (used for cosine-similarity similar-product lookup)
# -----------------------------------------------

_product_indices  = np.arange(NUM_PRODUCTS, dtype=np.int32)
_product_embeddings = model.product_embedding(
    tf.constant(_product_indices)
).numpy()  # shape: (NUM_PRODUCTS, EMBEDDING_DIM)


# -----------------------------------------------
# Personalised recommendations
# -----------------------------------------------

def recommend(user_id: str, count: int = 10) -> dict:
    """
    Return top-`count` products for `user_id`.

    Returns:
        {
            "unknown_user": bool,
            "recommendations": [{"product_id": str, "score": float}, ...]
        }
    """
    uid = str(user_id)

    if uid not in user_mapping:
        return {"unknown_user": True, "recommendations": []}

    user_index = user_mapping[uid]

    user_indices = np.full(NUM_PRODUCTS, user_index, dtype=np.int32)

    scores = model(
        tf.constant(user_indices, dtype=tf.int32),
        tf.constant(_product_indices, dtype=tf.int32),
    ).numpy()

    top_indices = np.argsort(scores)[::-1][:count]

    recommendations = [
        {
            "product_id": reverse_products[int(idx)],
            "score":      float(scores[idx]),
        }
        for idx in top_indices
    ]

    return {"unknown_user": False, "recommendations": recommendations}


# -----------------------------------------------
# Similar products (cosine similarity on embeddings)
# -----------------------------------------------

def similar(product_id: str, count: int = 8) -> dict:
    """
    Return products most similar to `product_id` by embedding cosine similarity.

    Returns:
        {
            "unknown_product": bool,
            "similar": [{"product_id": str, "score": float}, ...]
        }
    """
    pid = str(product_id)

    if pid not in product_mapping:
        return {"unknown_product": True, "similar": []}

    product_index = int(product_mapping[pid])

    query_vec = _product_embeddings[product_index].reshape(1, -1)  # (1, D)

    # Cosine similarity against every product embedding
    sims = cosine_similarity(query_vec, _product_embeddings)[0]  # (NUM_PRODUCTS,)

    # Exclude the query product itself
    sims[product_index] = -np.inf

    top_indices = np.argsort(sims)[::-1][:count]

    results = [
        {
            "product_id": reverse_products[int(idx)],
            "score":      float(sims[idx]),
        }
        for idx in top_indices
        if sims[idx] > -np.inf
    ]

    return {"unknown_product": False, "similar": results}