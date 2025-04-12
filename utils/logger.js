const winston = require('winston');
const { format } = winston;
const path = require('path');

const logFormat = format.printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level}]: ${message}`;
});

const logger = winston.createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        logFormat
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ 
            filename: path.join(__dirname, '../../logs/arbitrage.log'),
            maxsize: 10000000, // 10MB
            maxFiles: 5
        })
    ]
});

// Helper methods
logger.success = (message) => logger.info(`✅ ${message}`);
logger.warn = (message) => logger.warning(`⚠️ ${message}`);
logger.error = (message) => logger.error(`❌ ${message}`);

module.exports = logger;