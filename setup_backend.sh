#!/bin/bash
# Setup script for Peridot backend

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
echo "Setup complete! Run the server using:"
echo "cd peridot_backend && source venv/bin/activate && python manage.py runserver"

# Offer to run the server
echo "Would you like to run the server now? (y/n)"
read -r run_server
if [ "$run_server" = "y" ]; then
    python manage.py runserver
fi 