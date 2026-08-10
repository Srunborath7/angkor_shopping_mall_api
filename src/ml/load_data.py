import pandas as pd
from sqlalchemy import create_engine, text

from config import DATABASE_URL


def load_interactions() -> pd.DataFrame:
    """
    Load and return aggregated user-product interactions from the database.

    Interaction types and their default weights (set per-row in the API):
        view   = 1
        search = 2
        cart   = 3
        order  = 5

    Returns a DataFrame with columns: user_id, product_id, weight
    """
    # Use SQLAlchemy engine (avoids pandas deprecation warning with raw psycopg2)
    engine = create_engine(DATABASE_URL)

    query = text("""
        SELECT
            user_id,
            product_id,
            SUM(weight) AS weight
        FROM
            user_product_interactions
        GROUP BY
            user_id,
            product_id
        HAVING
            SUM(weight) > 0
        ORDER BY
            weight DESC
    """)

    with engine.connect() as conn:
        df = pd.read_sql(query, conn)

    df["user_id"]    = df["user_id"].astype(str)
    df["product_id"] = df["product_id"].astype(str)
    df["weight"]     = df["weight"].astype(float)

    print(f"[load_data] Loaded {len(df)} user-product interaction pairs.")
    return df