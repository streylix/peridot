#!/bin/bash
# This script sets up the Django backend for the Peridot application

echo "Setting up Peridot backend..."

cd peridot_backend

# Check for Python and pip
if ! command -v python3 &> /dev/null; then
    echo "Python 3 could not be found. Please install Python 3.8 or newer."
    exit 1
fi

# Create a virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate the virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install requirements
echo "Installing requirements..."
pip install -r requirements.txt

# Install WebSocket support packages
echo "Installing WebSocket support..."
pip install channels daphne

# Make migrations
echo "Making migrations..."
python manage.py makemigrations

# Apply migrations
echo "Applying migrations..."
python manage.py migrate

# Create a superuser if one doesn't exist
echo "Would you like to create a superuser? (y/n)"
read -r create_user
if [ "$create_user" = "y" ]; then
    python manage.py createsuperuser
fi

# Run the development server
echo "Setup complete! You can run the server with WebSocket support using:"
echo "cd peridot_backend && source venv/bin/activate && daphne -p 8000 peridot_backend.asgi:application"

# Offer to run the server
echo "Would you like to run the server now? (y/n)"
read -r run_server
if [ "$run_server" = "y" ]; then
    # Use Daphne for WebSocket support instead of the default Django server
    daphne -p 8000 peridot_backend.asgi:application
fi 