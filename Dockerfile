FROM node:18-alpine

# Install crond
RUN apk add --no-cache dcron

WORKDIR /app

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