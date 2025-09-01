#!/bin/bash

# Push to peridot repository (origin)
echo "Pushing to Peridot repository..."
git push origin HEAD:v0.13

# Check if the push was successful
if [ $? -eq 0 ]; then
    echo "Successfully pushed to Peridot repository"
else
    echo "Failed to push to Peridot repository"
    exit 1
fi

# Push to mynotes.io react-overhaul branch
echo "Pushing to mynotes.io react-overhaul branch..."
git push upstream HEAD:react-overhaul

# Check if the push was successful
if [ $? -eq 0 ]; then
    echo "Successfully pushed to react-overhaul branch"
else
    echo "Failed to push to react-overhaul branch"
    exit 1
fi

echo "All pushes completed successfully!"