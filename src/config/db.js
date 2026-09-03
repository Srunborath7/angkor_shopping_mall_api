const { Sequelize } = require('sequelize');
require('dotenv').config();

let dbUrl = process.env.DATABASE_URL || '';
// When using Supabase pooler on session mode (:5432), automatically route to transaction pooler (:6543) to prevent PostgreSQL transaction lock table exhaustion
if (dbUrl.includes('pooler.supabase.com:5432')) {
    dbUrl = dbUrl.replace(':5432', ':6543');
}

const sequelize = new Sequelize(dbUrl, {
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
