import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import User
from asgiref.sync import sync_to_async
from .models import Note

class NoteConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for handling real-time note updates
    """
    
    async def connect(self):
        """
        Called when the WebSocket is handshaking as part of initial connection
        """
        self.user = self.scope.get('user')
        self.user_id = None
        
        # Accept the connection
        await self.accept()
        
        # Send an initial connection message
        await self.send(text_data=json.dumps({
            'type': 'connection_established',
            'message': 'Connected to notes sync service'
        }))

    async def disconnect(self, close_code):
        """
        Called when the WebSocket closes for any reason
        """
        # If user was in a group, remove them
        if self.user_id:
            await self.channel_layer.group_discard(
                f"user_{self.user_id}",
                self.channel_name
            )

    async def receive(self, text_data):
        """
        Called when we get a text frame from the client
        """
        try:
            text_data_json = json.loads(text_data)
            message_type = text_data_json.get('type')
            
            # Handle authentication messages
            if message_type == 'authenticate':
                await self.authenticate(text_data_json)
            
            # Handle note update messages 
            elif message_type == 'note_update' and self.user_id:
                note_id = text_data_json.get('note_id')
                if note_id:
                    # Forward to the group
                    await self.channel_layer.group_send(
                        f"user_{self.user_id}",
                        {
                            'type': 'broadcast_note_update',
                            'note_id': note_id,
                            'status': text_data_json.get('status', {})
                        }
                    )
            
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid JSON format'
            }))
        except Exception as e:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': str(e)
            }))

    async def authenticate(self, data):
        """
        Authenticate the WebSocket connection
        """
        user_id = data.get('userId')
        
        if user_id:
            # Validate the user exists
            user_exists = await self.check_user_exists(user_id)
            
            if user_exists:
                # Store user ID and add to appropriate group
                self.user_id = user_id
                
                # Add to user-specific group for broadcasts
                await self.channel_layer.group_add(
                    f"user_{self.user_id}",
                    self.channel_name
                )
                
                await self.send(text_data=json.dumps({
                    'type': 'authenticated',
                    'userId': user_id
                }))
            else:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'Authentication failed: User not found'
                }))
        else:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Authentication failed: No user ID provided'
            }))

    async def broadcast_note_update(self, event):
        """
        Handler for broadcasting note updates to clients
        """
        # Send message to WebSocket
        message = {
            'type': 'sync_update',
            'noteId': event['note_id'],
            'status': event['status']
        }
        
        # Include note content if it was provided
        if 'note_content' in event:
            message['noteContent'] = event['note_content']
        
        await self.send(text_data=json.dumps(message))

    async def broadcast_storage_update(self, event):
        """
        Handler for broadcasting storage updates to clients
        """
        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            'type': 'storage_update',
            'storage': event['storage']
        }))

    @database_sync_to_async
    def check_user_exists(self, user_id):
        """
        Check if a user with the given ID exists
        """
        try:
            return User.objects.filter(id=user_id).exists()
        except:
            return False 