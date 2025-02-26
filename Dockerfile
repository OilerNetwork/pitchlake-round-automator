FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    cron \
    build-essential \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*


# Install crond
# RUN apt-get update && apt-get install -y cron

WORKDIR /app

ENV FOSSIL_API_KEY=${FOSSIL_API_KEY}
ENV CRON_SCHEDULE=${CRON_SCHEDULE}
ENV VAULT_ADDRESSES=${VAULT_ADDRESSES}
ENV STARKNET_PRIVATE_KEY=${STARKNET_PRIVATE_KEY}
ENV STARKNET_ACCOUNT_ADDRESS=${STARKNET_ACCOUNT_ADDRESS}
ENV STARKNET_RPC=${STARKNET_RPC}
ENV FOSSIL_API_URL=${FOSSIL_API_URL}

# Copy rest of the source code
COPY . .

# Install dependencies
RUN npm install

# Build TypeScript
RUN npm run build

# Create log directory
RUN mkdir -p /var/log/cron

# Make generate-crontab.sh executable
RUN chmod +x generate-crontab.sh

# Script to run both crond and tail logs
RUN chmod +x entrypoint.sh

# Run the entrypoint script
CMD ["./entrypoint.sh"] 