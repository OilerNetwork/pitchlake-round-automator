import 'dotenv/config';
import cron from 'node-cron';
import { StateTransitionService } from "./transition";
import { setupLogger } from "./logger";

const logger = setupLogger('Manager');

// Load environment variables
const {
    STARKNET_RPC,
    STARKNET_PRIVATE_KEY,
    STARKNET_ACCOUNT_ADDRESS,
    VAULT_ADDRESSES,
    FOSSIL_API_KEY,
    FOSSIL_API_URL,
    CRON_SCHEDULE
} = process.env;

// Validate environment variables and set up services
let services: StateTransitionService[] = [];


// Check required environment variables
if (!STARKNET_RPC || !STARKNET_PRIVATE_KEY || !STARKNET_ACCOUNT_ADDRESS || !VAULT_ADDRESSES || !FOSSIL_API_KEY || !FOSSIL_API_URL) {
    throw new Error("Missing required environment variables");
}

// Validate cron schedule
if (!cron.validate(CRON_SCHEDULE as string)) {
    throw new Error(`Invalid cron schedule: ${CRON_SCHEDULE}`);
}

// Parse vault addresses
const vaultAddresses = VAULT_ADDRESSES.split(',').map(addr => addr.trim());

// Create services for each vault
services = vaultAddresses.map(vaultAddress => {
    const logger = setupLogger(`Vault ${vaultAddress.slice(0, 7)}`);
    return new StateTransitionService(
        STARKNET_RPC,
        STARKNET_PRIVATE_KEY,
        STARKNET_ACCOUNT_ADDRESS,
        vaultAddress,
        FOSSIL_API_KEY,
        FOSSIL_API_URL,
        logger
    )
});

logger.info("Starting state transition service");
logger.info(`Monitoring ${services.length} vaults: ${vaultAddresses}`);
logger.info(`Cron schedule: ${CRON_SCHEDULE}`);

cron.schedule(CRON_SCHEDULE as string, async () => {
    logger.info("Running scheduled state transition checks");
    
    const results = await Promise.allSettled(services.map(service =>
        service.checkAndTransition()
            .catch(error => {
                logger.error(`Error in state transition check for vault ${service.getVaultAddress()}:`, error);
                return Promise.reject(error);
            })
    ));

    const failures = results.filter(r => r.status === 'rejected').length;
    const successes = results.filter(r => r.status === 'fulfilled').length;
    
    logger.info(`State transition checks completed. Successes: ${successes}, Failures: ${failures}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    logger.info('Received SIGTERM signal. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('Received SIGINT signal. Shutting down gracefully...');
    process.exit(0);
});