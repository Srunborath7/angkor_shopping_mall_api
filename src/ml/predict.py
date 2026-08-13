import os
import json

import numpy as np
import tensorflow as tf
from sklearn.metrics.pairwise import cosine_similarity

from model import RecommendationModel

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model")

NUM_USERS = 0
NUM_PRODUCTS = 0
EMBEDDING_DIM = 64

user_mapping = {}
product_mapping = {}
reverse_products = {}
model = None
_product_indices = None
_product_embeddings = None


def load_model_state():
    global NUM_USERS, NUM_PRODUCTS, EMBEDDING_DIM
    global user_mapping, product_mapping, reverse_products
    global model, _product_indices, _product_embeddings

    meta_path = os.path.join(MODEL_PATH, "model_meta.json")
    user_map_path = os.path.join(MODEL_PATH, "user_mapping.json")
    prod_map_path = os.path.join(MODEL_PATH, "product_mapping.json")
    weights_path = os.path.join(MODEL_PATH, "recommendation.weights.h5")

    if not (os.path.exists(meta_path) and os.path.exists(weights_path)):
        print("[predict] Warning: Trained model files missing in model directory.")
        return False

    with open(meta_path) as f:
        meta = json.load(f)

    NUM_USERS = meta["num_users"]
    NUM_PRODUCTS = meta["num_products"]
    EMBEDDING_DIM = meta["embedding_dim"]

    with open(user_map_path) as f:
        user_mapping = json.load(f)

    with open(prod_map_path) as f:
        product_mapping = json.load(f)

    reverse_products = {int(idx): pid for pid, idx in product_mapping.items()}

    model = RecommendationModel(
        num_users=NUM_USERS,
        num_products=NUM_PRODUCTS,
        embedding_dim=EMBEDDING_DIM,
    )

    # Warm up model to build weights before loading
    model(tf.constant([0]), tf.constant([0]))
    model.load_weights(weights_path)

    _product_indices = np.arange(NUM_PRODUCTS, dtype=np.int32)
    _product_embeddings = model.product_embedding(
        tf.constant(_product_indices)
    ).numpy()

    print(f"[predict] Loaded model state — {NUM_USERS} users, {NUM_PRODUCTS} products.")
    return True


# Load initial state on module import
load_model_state()


def recommend(user_id: str, count: int = 10, recent_product_ids: list = None) -> dict:
    """
    Return top-`count` recommendations for `user_id`.
    Combines BPR collaborative filtering with recent search/view similarity vectors.
    """
    if model is None or _product_embeddings is None:
        return {"unknown_user": True, "recommendations": []}

    uid = str(user_id)
    has_user = uid in user_mapping
    scores = np.zeros(NUM_PRODUCTS, dtype=np.float32)

    if has_user:
        user_index = user_mapping[uid]
        user_indices = np.full(NUM_PRODUCTS, user_index, dtype=np.int32)
        scores = model(
            tf.constant(user_indices, dtype=tf.int32),
            tf.constant(_product_indices, dtype=tf.int32),
        ).numpy()

    # Blend in user's recent search & view interaction intent vector
    recent_indices = []
    if recent_product_ids:
        for rpid in recent_product_ids:
            spid = str(rpid)
            if spid in product_mapping:
                recent_indices.append(int(product_mapping[spid]))

    if recent_indices:
        user_intent_vec = np.mean(_product_embeddings[recent_indices], axis=0, keepdims=True)
        sims = cosine_similarity(user_intent_vec, _product_embeddings)[0]
        # Weight real-time search/view intent heavily
        scores = scores + (sims * 3.0)

    if not has_user and not recent_indices:
        return {"unknown_user": True, "recommendations": []}

    top_indices = np.argsort(scores)[::-1][:count]

    recommendations = [
        {
            "product_id": reverse_products[int(idx)],
            "score": float(scores[idx]),
        }
        for idx in top_indices
    ]

    return {"unknown_user": not has_user, "recommendations": recommendations}


def similar(product_id: str, count: int = 8) -> dict:
    """
    Return products most similar to `product_id` by embedding cosine similarity.
    """
    if model is None or _product_embeddings is None:
        return {"unknown_product": True, "similar": []}

    pid = str(product_id)

    if pid not in product_mapping:
        return {"unknown_product": True, "similar": []}

    product_index = int(product_mapping[pid])
    query_vec = _product_embeddings[product_index].reshape(1, -1)

    sims = cosine_similarity(query_vec, _product_embeddings)[0]
    sims[product_index] = -np.inf

    top_indices = np.argsort(sims)[::-1][:count]

    results = [
        {
            "product_id": reverse_products[int(idx)],
            "score": float(sims[idx]),
        }
        for idx in top_indices
        if sims[idx] > -np.inf
    ]

    return {"unknown_product": False, "similar": results}