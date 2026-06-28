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
app.use('/api/roles', roleRoutes);
app.use('/api/users', userRoutes)
app.use('/api/auth', authRoutes);

module.exports = app;