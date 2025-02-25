#!/bin/sh

if [ -z "${CRON_SCHEDULE}" ]; then
    echo "Error: CRON_SCHEDULE environment variable is not set"
    exit 1
fi

# Remove any quotes from CRON_SCHEDULE
CRON_SCHEDULE=$(echo "${CRON_SCHEDULE}" | tr -d '"')

cat > /etc/crontabs/root << EOF
# Generated crontab file
${CRON_SCHEDULE} node /app/dist/index.js >> /var/log/cron/state-transition.log 2>&1
EOF

echo "Contents of /etc/crontabs/root:"
cat /etc/crontabs/root

echo "Generated crontab config with schedule: ${CRON_SCHEDULE}" 