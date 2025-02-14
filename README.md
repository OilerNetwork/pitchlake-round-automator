# Vault Automator

This service automates the state transitions of vault rounds, triggering state transition when the time is right.

## Round State Automation

The automator monitors and manages the following round state transitions:

- **Open → Auctioning**: Triggered when auction start time is reached
    - For newly deployed vaults, the open state handler initializes the reserve price for the first round
- **Auctioning → Running**: Triggered when auction end time is reached
- **Running → Settled**: Triggered when option settlement date is reached
    - Upon round settlement, a new round is being deployed in the same tx.

## Config

Multiple vaults can be automated simultaneously through this service. Each vault requires its own configuration in `docker-compose.yml`. By default, a single service is declared.

## How to Run

### Running the automation for a single vault

1. Copy and configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

2. Source the environment file:
```bash
source .env
```

3. Start a specific vault automation service. Vault1 is enabled by default
```bash
docker compose up vault1
```

### Running All Services

To start all configured vault services:
```bash
docker compose up
```

### Deployment
- To be added

### Monitoring logs
-  To be added
