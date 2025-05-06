import os
import django
from channels.routing import get_default_application

# Set up Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "peridot_backend.settings")
django.setup()

# Get the ASGI application
application = get_default_application()

if __name__ == "__main__":
    import sys
    from daphne.server import Server
    
    # Run Daphne with verbose output
    print("Starting Daphne server with Django Channels support...")
    Server(application, verbosity=2).run(host="0.0.0.0", port=8000) 