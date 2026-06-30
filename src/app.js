const express = require('express');
const app = express();
app.use(express.json());
require('./models/relationships');
const roleRoutes = require('./routes/roleRoute');
const userRoutes = require('./routes/userRoute');
const authRoutes = require('./routes/authRoute');
app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Server is running successfully"
    });
});
app.get("/test-email", async (req, res) => {
    try {
        await sendOtpEmail("srunborath44@gmail.com", "0974242291");
        res.send("sent");
    } catch (err) {
        console.log(err);
        res.status(500).send(err.message);
    }
});
app.use('/api/roles', roleRoutes);
app.use('/api/users', userRoutes)
app.use('/api/auth', authRoutes);

module.exports = app;