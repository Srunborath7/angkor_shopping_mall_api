import tensorflow as tf


class RecommendationModel(
    tf.keras.Model
):

    def __init__(
        self,
        num_users,
        num_products,
        embedding_dim=64
    ):
        super().__init__()

        self.user_embedding = (
            tf.keras.layers.Embedding(
                input_dim=num_users,
                output_dim=embedding_dim,
                name="user_embedding"
            )
        )

        self.product_embedding = (
            tf.keras.layers.Embedding(
                input_dim=num_products,
                output_dim=embedding_dim,
                name="product_embedding"
            )
        )

        self.user_bias = (
            tf.keras.layers.Embedding(
                input_dim=num_users,
                output_dim=1,
                name="user_bias"
            )
        )

        self.product_bias = (
            tf.keras.layers.Embedding(
                input_dim=num_products,
                output_dim=1,
                name="product_bias"
            )
        )

    def call(
        self,
        user_ids,
        product_ids
    ):

        user_vector = (
            self.user_embedding(user_ids)
        )

        product_vector = (
            self.product_embedding(product_ids)
        )

        user_bias = (
            self.user_bias(user_ids)
        )

        product_bias = (
            self.product_bias(product_ids)
        )

        score = tf.reduce_sum(
            user_vector * product_vector,
            axis=1
        )

        score += tf.squeeze(
            user_bias,
            axis=1
        )

        score += tf.squeeze(
            product_bias,
            axis=1
        )

        return score