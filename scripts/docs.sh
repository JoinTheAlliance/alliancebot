#!/bin/bash

# Step 1: Clone the aframe repository
git clone https://github.com/jointhealliance/bgent --depth 1

# Step 2: Run the processDocs.mjs script on scripts/docs/
node scripts/processDocs.js bgent/docs/

# Step 3: Delete the cloned aframe directory
rm -rf bgent

echo "Process completed."
