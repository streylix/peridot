from django.urls import path
from . import consumers

# WebSocket URL patterns
websocket_urlpatterns = [
    path("ws/sync/", consumers.NoteConsumer.as_asgi()),
] 