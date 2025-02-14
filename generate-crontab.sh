#!/bin/sh

if [ -z "${CRON_INTERVAL}" ]; then
    echo "Error: CRON_INTERVAL environment variable is not set"
    exit 1
fi

cat > /etc/crontabs/root << EOF
# Generated crontab file
${CRON_INTERVAL} node /app/dist/index.js >> /var/log/cron/state-transition.log 2>&1
EOF

echo "Contents of /etc/crontabs/root:"
cat /etc/crontabs/root

echo "Generated crontab with interval: ${CRON_INTERVAL}" 