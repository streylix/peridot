#!/bin/sh

set -o errexit
set -o nounset

echo "Installing frontend dependencies..."
npm install

echo "Starting Vite dev server..."
npm run dev -- --host 0.0.0.0
