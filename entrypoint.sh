#!/bin/sh

# Create log file and directory
mkdir -p /var/log/cron
touch /var/log/cron/state-transition.log

# Generate crontab file
./generate-crontab.sh

# Start cron service
service cron start

# Tail the logs
tail -f /var/log/cron/state-transition.log
