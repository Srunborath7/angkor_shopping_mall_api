const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    pool: {
        max: 10,
        min: 0,
        acquire: 60000,
        idle: 10000,
        evict: 10000
    },
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        },
        keepAlive: true,
        statement_timeout: 45000
    },
    retry: {
        max: 3,
        match: [
            /out of shared memory/i,
            /ConnectionAcquireTimeoutError/i,
            /SequelizeConnectionError/i,
            /SequelizeConnectionRefusedError/i,
            /SequelizeHostNotFoundError/i,
            /SequelizeHostNotReachableError/i,
            /SequelizeInvalidConnectionError/i,
            /SequelizeConnectionTimedOutError/i,
            /TimeoutError/i
        ]
    }
});

module.exports = sequelize;
