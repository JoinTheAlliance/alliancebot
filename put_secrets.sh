#!/bin/bash

# Ensure the .dev.vars file exists
if [ ! -f .dev.vars ]; then
    echo ".dev.vars file not found!"
    exit 1
fi

# Read each line from the .dev.vars file
while IFS= read -r line; do
    # Skip empty lines
    if [ -z "$line" ]; then
        continue
    fi

    # Split the line into name and value
    IFS='=' read -ra KV <<< "$line"
    key="${KV[0]}"
    value="${KV[1]}"

    # Use Wrangler to put the secret
    # The -n flag specifies the name of the secret
    # The <<< operator passes the value to the command as standard input
    echo "Setting secret for $key"
    npx wrangler secret put "$key" <<< "$value"
done < .dev.vars
