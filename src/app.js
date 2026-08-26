const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

require("./models/relationships");

app.use(
    cors({
        origin: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "https://angkorshoppingmall.netlify.app"
        ],
        methods: [
            "GET",
            "POST",
            "PUT",
            "DELETE",
            "PATCH",
            "OPTIONS"
        ],
        allowedHeaders: [
            "Content-Type",
            "Authorization"
        ],
        credentials: true
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const {
    handleTelegramWebhook
} = require("./config/telegram");

app.post(
    "/telegram/webhook",
    handleTelegramWebhook
);

const roleRoutes = require("./routes/roleRoute");
const userRoutes = require("./routes/userRoute");
const authRoutes = require("./routes/authRoute");
const categoryRoutes = require("./routes/categoryRoute");
const brandRoutes = require("./routes/brandRoute");
const productRoutes = require("./routes/productRoute");
const cartRoutes = require("./routes/cartRoute");
const orderRoutes = require("./routes/orderRoute");
const paymentRoutes = require("./routes/paymentRoute");
const recommendationRoutes = require("./routes/recommendationRoute");
const productVariantRoutes = require("./routes/productVariantRoute");
const productDetailRoutes = require("./routes/productDetailRoute");
const productImageRoutes = require("./routes/productImageRoute");
const productReviewRoutes = require("./routes/productReviewRoute");
const supplierRoutes = require("./routes/supplierRoute");
const purchaseOrderRoutes = require("./routes/purchaseOrderRoute");
const flashSaleRoutes = require("./routes/flashSaleRoute");
const tradeProductRoutes = require("./routes/tradeProductRoute");
const tradeOfferRoutes = require("./routes/tradeOfferRoute");
const chatbotRoutes = require("./routes/chatbotRoute");
const supportRoutes = require("./routes/supportMessageRoute");
const attendanceRoutes = require("./routes/attendanceRoute");

app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Server is running successfully"
    });
});

app.get("/pay/:orderId", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "views",
            "checkout.html"
        )
    );
});

app.use("/api/roles", roleRoutes);
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/products", productRoutes);
app.use("/api/flash-sales", flashSaleRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/purchase-orders", purchaseOrderRoutes);
app.use("/api/trade-products", tradeProductRoutes);
app.use("/api/trade-offers", tradeOfferRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/attendance", attendanceRoutes);

app.use("/api", productVariantRoutes);
app.use("/api", productDetailRoutes);
app.use("/api", productImageRoutes);
app.use("/api", productReviewRoutes);

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Resource not found"
    });
});

app.use((err, req, res, next) => {
    console.error("Global Error:", err);
    res.status(500).json({
        success: false,
        message: "Internal server error"
    });
});

module.exports = app;
