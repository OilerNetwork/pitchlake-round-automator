import 'dotenv/config';
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
    FOSSIL_API_URL
} = process.env;

// Validate environment variables
if (!STARKNET_RPC || !STARKNET_PRIVATE_KEY || !STARKNET_ACCOUNT_ADDRESS || !VAULT_ADDRESSES || !FOSSIL_API_KEY || !FOSSIL_API_URL) {
    logger.error("Missing required environment variables");
    process.exit(1);
}

// Parse vault addresses
const vaultAddresses = VAULT_ADDRESSES.split(',').map(addr => addr.trim());

// Create services for each vault
const services = vaultAddresses.map(vaultAddress => {
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

logger.info("Starting state transition checks");
logger.info(`Monitoring ${services.length} vaults: ${vaultAddresses}`);

// Run all services in parallel and collect results
Promise.allSettled(services.map(service =>
    service.checkAndTransition()
        .catch(error => {
            logger.error(`Error in state transition check for vault ${service.getVaultAddress()}:`, error);
            return Promise.reject(error);
        })
))
.then(results => {
    const failures = results.filter(r => r.status === 'rejected').length;
    const successes = results.filter(r => r.status === 'fulfilled').length;
    
    logger.info(`State transition checks completed. Successes: ${successes}, Failures: ${failures}`);
    
    // Exit with error if any service failed
    if (failures > 0) {
        process.exit(1);
    }
    process.exit(0);
});