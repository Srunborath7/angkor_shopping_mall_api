import os
import json
import random

import numpy as np
import pandas as pd
import tensorflow as tf

from load_data import load_interactions
from model import RecommendationModel


EMBEDDING_DIM = 64
BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR     = os.path.join(BASE_DIR, "model")

os.makedirs(MODEL_DIR, exist_ok=True)


def train_model():
    df = load_interactions()

    if len(df) < 2:
        raise RuntimeError(
            f"Not enough interactions to train (got {len(df)}, need at least 2). "
            "Interact with some products first (view / search / order)."
        )

    print(f"Loaded {len(df)} interaction records.")

    # Create ID mappings
    users    = df["user_id"].astype(str).unique()
    products = df["product_id"].astype(str).unique()

    user_to_index    = {uid: idx for idx, uid in enumerate(users)}
    product_to_index = {pid: idx for idx, pid in enumerate(products)}

    df["user_index"]    = df["user_id"].astype(str).map(user_to_index)
    df["product_index"] = df["product_id"].astype(str).map(product_to_index)

    print(f"Unique users: {len(users)}  |  Unique products: {len(products)}")

    positive_pairs = set(
        zip(
            df["user_index"].astype(int),
            df["product_index"].astype(int),
        )
    )

    model = RecommendationModel(
        num_users    = len(users),
        num_products = len(products),
        embedding_dim= EMBEDDING_DIM,
    )

    optimizer = tf.keras.optimizers.Adam(learning_rate=0.001)

    BATCH_SIZE = min(256, max(16, len(df) // 4))
    EPOCHS     = max(20, min(100, len(df) // 10))

    print(f"Training: {EPOCHS} epochs  |  batch size: {BATCH_SIZE}")

    def generate_batch():
        user_ids     = []
        positive_ids = []
        negative_ids = []

        for _ in range(BATCH_SIZE):
            row = df.sample(n=1).iloc[0]

            uid = int(row["user_index"])
            pos = int(row["product_index"])

            for _ in range(100):  # max retries
                neg = random.randrange(len(products))
                if (uid, neg) not in positive_pairs:
                    break

            user_ids.append(uid)
            positive_ids.append(pos)
            negative_ids.append(neg)

        return (
            tf.constant(user_ids,     dtype=tf.int32),
            tf.constant(positive_ids, dtype=tf.int32),
            tf.constant(negative_ids, dtype=tf.int32),
        )

    @tf.function
    def train_step(user_ids, positive_ids, negative_ids):
        with tf.GradientTape() as tape:
            positive_scores = model(user_ids, positive_ids)
            negative_scores = model(user_ids, negative_ids)

            difference = positive_scores - negative_scores
            loss = -tf.reduce_mean(tf.math.log_sigmoid(difference))

            if model.losses:
                loss += 1e-4 * tf.add_n(model.losses)

        gradients = tape.gradient(loss, model.trainable_variables)
        optimizer.apply_gradients(zip(gradients, model.trainable_variables))
        return loss

    steps_per_epoch = max(1, len(df) // BATCH_SIZE)
    best_loss       = float("inf")

    for epoch in range(EPOCHS):
        losses = []

        for _ in range(steps_per_epoch):
            u, p, n = generate_batch()
            loss    = train_step(u, p, n)
            losses.append(float(loss))

        epoch_loss = np.mean(losses)
        if epoch_loss < best_loss:
            best_loss = epoch_loss

        if (epoch + 1) % 5 == 0 or epoch == EPOCHS - 1:
            print(f"Epoch {epoch + 1:3d}/{EPOCHS}  loss: {epoch_loss:.4f}  best: {best_loss:.4f}")

    # Save weights
    model.save_weights(os.path.join(MODEL_DIR, "recommendation.weights.h5"))
    print("Model weights saved.")

    with open(os.path.join(MODEL_DIR, "user_mapping.json"), "w") as f:
        json.dump(user_to_index, f)

    with open(os.path.join(MODEL_DIR, "product_mapping.json"), "w") as f:
        json.dump(product_to_index, f)

    meta = {
        "num_users":        len(users),
        "num_products":     len(products),
        "embedding_dim":    EMBEDDING_DIM,
        "epochs":           EPOCHS,
        "batch_size":       BATCH_SIZE,
        "best_loss":        float(best_loss),
        "num_interactions": len(df),
    }

    with open(os.path.join(MODEL_DIR, "model_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    print("\n[OK] Training complete.")
    print(f"   Users    : {len(users)}")
    print(f"   Products : {len(products)}")
    print(f"   Best loss: {best_loss:.4f}")

    return meta


if __name__ == "__main__":
    train_model()