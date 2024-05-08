#!/bin/bash

# Determine available memory on the system
avail_memory=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
avail_memory_gb=$((avail_memory / 1024 / 1024))
min_limit=$((avail_memory_gb * 10 / 100))
if [ "$min_limit" -lt "4096" ]; then
    min_limit=4096
fi
max_memory=$((avail_memory_gb - min_limit))

# Print memory limit message
echo "Memory limit set to ${max_memory}MB"

# Wait for 5 seconds
sleep 5

# Set maximum memory usage for Node.js
export NODE_OPTIONS="--max-old-space-size=${max_memory}"

# Run Node.js application
node do.js
