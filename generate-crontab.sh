#!/bin/sh

if [ -z "${CRON_SCHEDULE}" ]; then
    echo "Error: CRON_SCHEDULE environment variable is not set"
    exit 1
fi

# Remove any quotes from CRON_SCHEDULE
CRON_SCHEDULE=$(echo "${CRON_SCHEDULE}" | tr -d '"')

# Add cron job to the crontab file for the root user
echo "${CRON_SCHEDULE} node /app/dist/index.js >> /var/log/cron/state-transition.log 2>&1" > /var/spool/cron/crontabs/root

# Ensure correct permissions
chmod 600 /var/spool/cron/crontabs/root

echo "Generated crontab config with schedule: ${CRON_SCHEDULE}" 

# Start the cron service
service cron start
