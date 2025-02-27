import winston from "winston";

export function setupLogger(label: string): winston.Logger {
    return winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            winston.format.label({ label }),
            winston.format.timestamp(),
            winston.format.colorize(),
            winston.format.errors({ stack: true }),
            winston.format.printf(({ timestamp, level, message, label, stack }) => {
                if (stack) {
                    return `${timestamp} [${label}] ${level}: ${message}\n${stack}`;
                }
                return `${timestamp} [${label}] ${level}: ${message}`;
            })
        ),
        transports: [
            new winston.transports.Console(),
            new winston.transports.File({ 
                filename: 'logs/error.log', 
                level: 'error' 
            }),
            new winston.transports.File({ 
                filename: 'logs/combined.log' 
            })
        ]
    });
} 