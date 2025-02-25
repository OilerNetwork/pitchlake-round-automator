import { 
    Contract, 
    RpcProvider, 
    Account,
    CairoCustomEnum,
} from "starknet";
import { Logger } from "winston";
import { ABI as VaultAbi } from "./abi/vault";
import { ABI as OptionRoundAbi } from "./abi/optionRound";
import axios from "axios";

// Enum matching the Cairo OptionRoundState
enum OptionRoundState {
    Open = 0,
    Auctioning = 1, 
    Running = 2,
    Settled = 3
}

type FossilRequest = {
    vaultAddress: string,    
    timestamp: number,      
    identifier: string   
};

export class StateTransitionService {
    private logger: Logger;
    private provider: RpcProvider;
    private account: Account;
    private vaultContract: Contract;
    private fossilApiKey: string;
    private fossilApiUrl: string;
    private vaultAddress: string;

    constructor(
        rpcUrl: string,
        privateKey: string,
        accountAddress: string,
        vaultAddress: string,
        fossilApiKey: string,
        fossilApiUrl: string,
        logger: Logger
    ) {
        this.logger = logger;
        this.provider = new RpcProvider({ nodeUrl: rpcUrl });
        this.account = new Account(
            this.provider,
            accountAddress,
            privateKey
        );
        this.vaultContract = new Contract(
            VaultAbi,
            vaultAddress,
            this.account
        );
        this.fossilApiKey = fossilApiKey;
        this.fossilApiUrl = fossilApiUrl;
        this.vaultAddress = vaultAddress;
    }

    getVaultAddress(): string {
        return this.vaultAddress;
    }

    async checkAndTransition(): Promise<void> {
        try {
            // Test connection before proceeding
            this.logger.info(`Checking RPC connection...`);
            await this.provider.getBlockNumber();
            this.logger.info(`Connected to RPC successfully`);
            
            const roundId = await this.vaultContract.get_current_round_id();
            const roundAddress = await this.vaultContract.get_round_address(roundId);

            // Convert decimal address to hex
            const roundAddressHex = "0x" + BigInt(roundAddress).toString(16);
            this.logger.info(`Checking round ${roundId} at ${roundAddressHex}`);

            const roundContract = new Contract(
                OptionRoundAbi,
                roundAddressHex,
                this.account
            );
            
            const stateRaw = await roundContract.get_state();
            const state = (stateRaw as CairoCustomEnum).activeVariant();

            const stateEnum = OptionRoundState[state as keyof typeof OptionRoundState];
            this.logger.info(`Current state: ${state}`);

            const currentTime = Math.floor(Date.now() / 1000);

            switch (stateEnum) {
                case OptionRoundState.Open:
                    await this.handleOpenState(roundContract, currentTime);
                    break;
                    
                case OptionRoundState.Auctioning:
                    await this.handleAuctioningState(roundContract, currentTime);
                    break;
                    
                case OptionRoundState.Running:
                    await this.handleRunningState(roundContract, currentTime);
                    break;
                    
                case OptionRoundState.Settled:
                    this.logger.info("Round is settled - no actions possible");
                    break;
            }
        } catch (error) {
            this.logger.error({
                message: "Error in transition check",
                error: error
            });
            throw error;
        }
    }

    private formatTimeLeft(current: number, target: number): string {
        const secondsLeft = Number(target) - Number(current);
        const hoursLeft = secondsLeft / 3600;
        return `${secondsLeft} seconds (${hoursLeft.toFixed(2)} hrs)`;
    }

    private async handleOpenState(roundContract: Contract, currentTime: number): Promise<void> {
        try {
            // Check if this is the first round that needs initialization
            const reservePrice = await roundContract.get_reserve_price();
            
            if (reservePrice === 0n) {
                this.logger.info("First round detected - needs initialization");
                const requestData = await this.vaultContract.get_request_to_start_first_round();
                
                // Format request data for timestamp check
                const requestTimestamp = Number(requestData[1]);
                
                // Check if Fossil has required blocks before proceeding
                if (!await this.fossilHasAllBlocks(requestTimestamp)) {
                    return;
                }
                
                // Initialize first round
                await this.sendFossilRequest(this.formatRawToFossilRequest(requestData));

                // The fossil request takes some time to process, so we'll exit here
                // and let the cron handle the state transition in the next iteration
                return;
            }

            // Existing auction start logic
            const auctionStartTime = Number(await roundContract.get_auction_start_date());
            
            if (currentTime < auctionStartTime) {
                this.logger.info(`Waiting for auction start time. Time left: ${this.formatTimeLeft(currentTime, auctionStartTime)}`);
                return;
            }

            this.logger.info("Starting auction...");
            
            const { transaction_hash } = await this.vaultContract.start_auction();
            await this.provider.waitForTransaction(transaction_hash);
            
            this.logger.info("Auction started successfully", {
                transactionHash: transaction_hash
            });
        } catch (error) {
            this.logger.error("Error handling Open state:", error);
            throw error;
        }
    }

    private async handleAuctioningState(roundContract: Contract, currentTime: number): Promise<void> {
        try {
            const auctionEndTime = Number(await roundContract.get_auction_end_date());
            
            if (currentTime < auctionEndTime) {
                this.logger.info(`Waiting for auction end time. Time left: ${this.formatTimeLeft(currentTime, auctionEndTime)}`);
                return;
            }

            this.logger.info("Ending auction...");
        
            const { transaction_hash } = await this.vaultContract.end_auction();
            await this.provider.waitForTransaction(transaction_hash);
            
            this.logger.info("Auction ended successfully", {
                transactionHash: transaction_hash
            });
        } catch (error) {
            this.logger.error("Error handling Auctioning state:", error);
            throw error;
        }
    }

    private async fossilHasAllBlocks(requestTimestamp: number): Promise<boolean> {
        const latestFossilBlockResponse = await axios.get(
            `${this.fossilApiUrl}/latest_block`
        );
        
        const latestFossilBlockTimestamp = latestFossilBlockResponse.data.block_timestamp;

        this.logger.debug("Latest Fossil block info:", {
            blockNumber: latestFossilBlockResponse.data.latest_block_number,
            blockTimestamp: latestFossilBlockTimestamp,
            requestTimestamp
        });

        if (latestFossilBlockTimestamp < requestTimestamp) {
            this.logger.info(`Waiting for Fossil blocks to reach settlement timestamp. Time difference: ${this.formatTimeLeft(latestFossilBlockTimestamp, requestTimestamp)}`);
            return false;
        }

        return true;
    }

    private formatRawToFossilRequest(rawData: any): FossilRequest {
        return {
            vaultAddress: "0x" + rawData[0].toString(16),
            timestamp: Number(rawData[1]),
            identifier: "0x" + rawData[2].toString(16)
        };
    }

    private async sendFossilRequest(requestData: FossilRequest): Promise<void> {
        // Format request data
        const vaultAddress = requestData.vaultAddress;
        const requestTimestamp = Number(requestData.timestamp);
        const identifier = requestData.identifier;

        const clientAddressRaw = await this.vaultContract.get_fossil_client_address();
        const clientAddress = "0x" + clientAddressRaw.toString(16);

        // Get round duration from vault contract
        const roundDuration = Number(await this.vaultContract.get_round_duration());

        // Calculate windows for each metric
        const twapWindow = roundDuration;
        const volatilityWindow = roundDuration * 3;
        const reservePriceWindow = roundDuration * 3;

        this.logger.debug("Calculation windows:", {
            roundDuration,
            twapWindow,
            volatilityWindow,
            reservePriceWindow
        });

        const fossilRequest = {
            identifiers: [identifier],
            params: {
                twap: [requestTimestamp - twapWindow, requestTimestamp],
                volatility: [requestTimestamp - volatilityWindow, requestTimestamp],
                reserve_price: [requestTimestamp - reservePriceWindow, requestTimestamp]
            },
            client_info: {
                client_address: clientAddress,
                vault_address: vaultAddress,
                timestamp: requestTimestamp
            }
        };

        this.logger.info("Sending request to Fossil API");
        this.logger.debug({ request: fossilRequest });

        const response = await axios.post(
            `${this.fossilApiUrl}/pricing_data`,
            fossilRequest,
            {
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": this.fossilApiKey
                }
            }
        );

        this.logger.info("Fossil request submitted. Job ID: " + response.data.job_id);
    }

    private async handleRunningState(roundContract: Contract, currentTime: number): Promise<void> {
        try {
            const settlementTime = Number(await roundContract.get_option_settlement_date());
            
            if (currentTime < settlementTime) {
                this.logger.info(`Waiting for settlement time. Time left: ${this.formatTimeLeft(currentTime, settlementTime)}`);
                return;
            }

            this.logger.info("Settlement time reached");
            
            const rawRequestData = await this.vaultContract.get_request_to_settle_round();
            const requestData = this.formatRawToFossilRequest(rawRequestData);
            
            // Check if Fossil has required blocks before proceeding
            if (!await this.fossilHasAllBlocks(Number(requestData.timestamp))) {
                return;
            }

            await this.sendFossilRequest(requestData);
        } catch (error) {
            this.logger.error("Error handling Running state:", error);
            throw error;
        }
    }
} 