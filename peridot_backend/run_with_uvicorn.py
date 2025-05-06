import os
import django
import subprocess
import sys

# Set up Django environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "peridot_backend.settings")
django.setup()

if __name__ == "__main__":
    import uvicorn
    
    # Get the current script directory path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Ensure static files are collected using the correct path to manage.py
    print("Collecting static files...")
    manage_py_path = os.path.join(script_dir, "manage.py")
    subprocess.run([sys.executable, manage_py_path, "collectstatic", "--noinput"])
    
    # Use port 8000 since we've freed it up
    port = 8000
    print(f"Starting uvicorn server with Django Channels support on port {port}...")
    uvicorn.run("peridot_backend.asgi:application", host="0.0.0.0", port=port, log_level="info") 