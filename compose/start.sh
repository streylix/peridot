#!/bin/sh

set -o errexit
set -o nounset

# Reinstall deps if requirements changed
CURRENT_HASH=$(cat requirements.txt requirements.dev.txt | md5sum | cut -d' ' -f1)
STORED_HASH=""
[ -f /opt/venv/.requirements_hash ] && STORED_HASH=$(cat /opt/venv/.requirements_hash)
if [ "$CURRENT_HASH" != "$STORED_HASH" ]; then
  echo "Requirements changed, installing dependencies..."
  pip install -r requirements.dev.txt
  echo "$CURRENT_HASH" > /opt/venv/.requirements_hash
fi

echo "Waiting for PostgreSQL..."
python << 'PYEOF'
import socket, time
while True:
    try:
        s = socket.create_connection(("db", 5432), timeout=2)
        s.close()
        break
    except (ConnectionRefusedError, socket.timeout, OSError):
        time.sleep(1)
PYEOF
echo "PostgreSQL ready"

echo "Running migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput || echo "Warning: collectstatic failed. Static files served from STATICFILES_DIRS."

echo "Creating superuser if it doesn't exist..."
python manage.py shell << END
from django.contrib.auth import get_user_model
import os

User = get_user_model()
email = os.environ.get('DEFAULT_SUPER_USER')
password = os.environ.get('DEFAULT_SUPER_USER_PASSWORD')

if email and password:
    if not User.objects.filter(email=email).exists():
        User.objects.create_superuser(email=email, password=password)
        print(f"Superuser {email} created")
    else:
        print(f"Superuser {email} already exists")
END

echo "Starting development server..."
python manage.py runserver 0.0.0.0:8001
