from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
import json
from .models import Note, UserStorage
from django.shortcuts import get_object_or_404
from django.db import transaction
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

# Helper function to notify WebSocket clients about note updates
def notify_note_update(user_id, note_id, status, note_content=None):
    try:
        channel_layer = get_channel_layer()
        message = {
            "type": "broadcast_note_update",
            "note_id": note_id,
            "status": status
        }
        
        # Include note content in the WebSocket message if provided
        # This allows other clients to update their local copies without making a separate request
        if note_content:
            # Ensure boolean fields are explicitly formatted as booleans
            if 'locked' in note_content:
                note_content['locked'] = bool(note_content['locked'])
            if 'pinned' in note_content:
                note_content['pinned'] = bool(note_content['pinned'])
            if 'encrypted' in note_content:
                note_content['encrypted'] = bool(note_content['encrypted'])
                
            message["note_content"] = note_content
            
            # Log when locked or pinned status is being changed
            if 'locked' in note_content or 'pinned' in note_content:
                print(f"Note {note_id} update includes important status changes: "
                      f"locked={note_content.get('locked')}, pinned={note_content.get('pinned')}")
            
        async_to_sync(channel_layer.group_send)(
            f"user_{user_id}",
            message
        )
    except Exception as e:
        print(f"WebSocket notification error: {e}")
        import traceback
        print(traceback.format_exc())

# Helper function to notify WebSocket clients about storage updates
def notify_storage_update(user_id, storage_data):
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"user_{user_id}",
            {
                "type": "broadcast_storage_update",
                "storage": storage_data
            }
        )
    except Exception as e:
        print(f"WebSocket notification error: {e}")

@csrf_exempt # For simplicity in this example, disable CSRF. In production, use proper CSRF handling.
def register_user(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            username = data.get('username')
            email = data.get('email')
            password = data.get('password')

            if not all([username, email, password]):
                return JsonResponse({'error': 'Missing fields'}, status=400)

            if User.objects.filter(username=username).exists():
                return JsonResponse({'error': 'Username already exists'}, status=400)
            
            if User.objects.filter(email=email).exists():
                return JsonResponse({'error': 'Email already exists'}, status=400)

            user = User.objects.create_user(username=username, email=email, password=password)
            # Create storage for the user
            UserStorage.objects.create(user=user)
            # login(request, user) # Optional: Log in the user immediately after registration
            return JsonResponse({'message': 'User created successfully'}, status=201)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Only POST method allowed'}, status=405)

@csrf_exempt # For simplicity in this example, disable CSRF. In production, use proper CSRF handling.
def login_user(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            # Allow login with either username or email
            identifier = data.get('email') # Assuming 'email' field from frontend can be username or email
            password = data.get('password')
            
            print(f"Login attempt with identifier: {identifier}")

            if not all([identifier, password]):
                return JsonResponse({'error': 'Missing fields'}, status=400)

            # Try to authenticate with username first
            user = authenticate(request, username=identifier, password=password)
            
            # If not authenticated with username, try with email
            if user is None:
                try:
                    user_by_email = User.objects.get(email=identifier)
                    user = authenticate(request, username=user_by_email.username, password=password)
                except User.DoesNotExist:
                    user = None # Keep user as None if email not found
                    print(f"No user found with email: {identifier}")
                    
            print(f"Authentication result: {'Success' if user else 'Failed'}")

            if user is not None:
                login(request, user)
                # Create storage for user if it doesn't exist
                UserStorage.objects.get_or_create(user=user)
                
                # Set session cookie path to root for better sharing between API and frontend
                request.session.cookie_name = 'peridot_sessionid'
                
                response = JsonResponse({
                    'message': 'Login successful', 
                    'user': {
                        'id': user.id,
                        'username': user.username,
                        'email': user.email
                    }
                }, status=200)
                
                return response
            else:
                return JsonResponse({'error': 'Invalid credentials'}, status=400)
        except json.JSONDecodeError:
            print("JSON decode error in login request")
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        except Exception as e:
            print(f"Login error: {str(e)}")
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Only POST method allowed'}, status=405)

# Basic logout view (optional, good to have)
@csrf_exempt
def logout_user(request):
    if request.method == 'POST': # Or GET, depending on preference
        logout(request)
        return JsonResponse({'message': 'Logout successful'}, status=200)
    return JsonResponse({'error': 'Only POST method allowed for logout'}, status=405)

@csrf_exempt
def check_auth_status(request):
    if request.user.is_authenticated:
        return JsonResponse({
            'isAuthenticated': True,
            'user': {
                'id': request.user.id,
                'username': request.user.username,
                'email': request.user.email
            }
        }, status=200)
    else:
        return JsonResponse({'isAuthenticated': False}, status=401) # 401 Unauthorized

# Note synchronization views
@csrf_exempt
@login_required(login_url=None)
def notes_list(request):
    """List all notes for the current user or create a new note"""
    user = request.user
    
    if request.method == 'GET':
        # Get all notes for the current user
        notes = Note.objects.filter(user=user)
        notes_data = []
        
        for note in notes:
            notes_data.append({
                'id': note.id,
                'content': note.content,
                'date_created': note.date_created,
                'date_modified': note.date_modified,
                'locked': note.locked,
                'encrypted': note.encrypted,
                'folder_path': note.folder_path,
                'pinned': note.pinned,
                'visible_title': note.visible_title,
                'tags': note.tags,
                'user': user.id,
                'key_params': note.key_params,
                'iv': note.iv
            })
        
        return JsonResponse(notes_data, safe=False)
    
    elif request.method == 'POST':
        # Create a new note
        try:
            data = json.loads(request.body)
            
            # Extract note ID from the data, assuming frontend sends it
            note_id = data.get('id')
            if not note_id:
                return JsonResponse({'error': 'Note ID is required'}, status=400)
            
            # Check if a note with this ID already exists for this user
            if Note.objects.filter(id=note_id, user=user).exists():
                return JsonResponse({'error': 'Note with this ID already exists'}, status=400)
            
            with transaction.atomic():
                # Calculate content size
                content = data.get('content', '')
                # Handle content that might be a list (for encrypted notes)
                if isinstance(content, list):
                    content_size = len(json.dumps(content).encode('utf-8'))
                else:
                    content_size = len(str(content).encode('utf-8'))
                
                # Get or create user storage
                storage, created = UserStorage.objects.get_or_create(user=user)
                
                # Check if user has enough storage
                if storage.used_bytes + content_size > storage.total_bytes:
                    return JsonResponse({'error': 'Storage quota exceeded'}, status=400)
                
                # Clean up data before creating note
                note_data = {
                    'id': note_id,
                    'user': user,
                    'content': content,
                    'locked': data.get('locked', False),
                    'encrypted': data.get('encrypted', False),
                    'folder_path': data.get('folder_path', ''),
                    'pinned': data.get('pinned', False),
                    'visible_title': data.get('visible_title', ''),
                    'tags': data.get('tags', [])
                }
                
                # Handle encryption fields
                if data.get('encrypted') and data.get('locked'):
                    note_data['key_params'] = data.get('key_params')
                    note_data['iv'] = data.get('iv')
                
                try:
                    # Create the note
                    note = Note.objects.create(**note_data)
                    
                    # Update storage usage
                    storage.used_bytes += content_size
                    storage.save()
                    
                    # Notify WebSocket clients
                    note_status = {
                        'status': 'synced',
                        'lastSynced': note.date_modified.isoformat(),
                        'size': content_size
                    }
                    
                    # Include note content in the notification for real-time sync
                    note_content = {
                        'id': note.id,
                        'content': note.content,
                        'dateCreated': note.date_created.isoformat(),
                        'dateModified': note.date_modified.isoformat(),
                        'locked': note.locked,
                        'encrypted': note.encrypted,
                        'folderPath': note.folder_path,
                        'pinned': note.pinned,
                        'visibleTitle': note.visible_title,
                        'tags': note.tags,
                        'keyParams': note.key_params,
                        'iv': note.iv
                    }
                    
                    notify_note_update(user.id, note_id, note_status, note_content)
                    
                    # Also notify about storage update
                    storage_data = {
                        'total_bytes': storage.total_bytes,
                        'used_bytes': storage.used_bytes,
                        'available_bytes': storage.total_bytes - storage.used_bytes,
                        'percent_used': (storage.used_bytes / storage.total_bytes) * 100 if storage.total_bytes > 0 else 0
                    }
                    notify_storage_update(user.id, storage_data)
                    
                    return JsonResponse({
                        'id': note.id,
                        'content': note.content,
                        'date_created': note.date_created,
                        'date_modified': note.date_modified,
                        'locked': note.locked,
                        'encrypted': note.encrypted,
                        'folder_path': note.folder_path,
                        'pinned': note.pinned,
                        'visible_title': note.visible_title,
                        'tags': note.tags,
                        'user': user.id,
                        'key_params': note.key_params,
                        'iv': note.iv
                    }, status=201)
                except Exception as create_error:
                    # Log detailed error information for debugging
                    print(f"Error creating note: {create_error}")
                    print(f"Note data: {note_data}")
                    return JsonResponse({'error': f'Failed to create note: {str(create_error)}'}, status=500)
            
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        except Exception as e:
            print(f"Unexpected error in note creation: {e}")
            return JsonResponse({'error': str(e)}, status=500)
    
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
@login_required(login_url=None)
def note_detail(request, note_id):
    """Retrieve, update or delete a note"""
    user = request.user
    
    # Try to get the note, ensuring it belongs to the current user
    try:
        note = Note.objects.get(id=note_id, user=user)
    except Note.DoesNotExist:
        return JsonResponse({'error': 'Note not found'}, status=404)
    
    if request.method == 'GET':
        # Return the note details
        return JsonResponse({
            'id': note.id,
            'content': note.content,
            'date_created': note.date_created,
            'date_modified': note.date_modified,
            'locked': note.locked,
            'encrypted': note.encrypted,
            'folder_path': note.folder_path,
            'pinned': note.pinned,
            'visible_title': note.visible_title,
            'tags': note.tags,
            'user': user.id,
            'key_params': note.key_params,
            'iv': note.iv
        })
    
    elif request.method == 'PUT':
        # Update the note
        try:
            data = json.loads(request.body)
            
            # Debug log the incoming data
            print(f"Updating note {note_id} with data: {json.dumps(data, default=str)[:500]}...")
            
            with transaction.atomic():
                # Calculate old and new content size
                if isinstance(note.content, list):
                    old_content_size = len(json.dumps(note.content).encode('utf-8'))
                else:
                    old_content_size = len(note.content.encode('utf-8')) if note.content else 0
                    
                # Safely handle key_params and iv fields
                try:
                    # Check for both camelCase and snake_case versions of fields
                    key_params = data.get('keyParams', data.get('key_params'))
                    if key_params is not None:
                        # Ensure it's a valid JSON object
                        if not isinstance(key_params, dict):
                            key_params = json.loads(key_params) if isinstance(key_params, str) else None
                            print(f"Converted key_params to: {type(key_params)}")
                    
                    iv = data.get('iv')
                    if iv is not None:
                        # Ensure it's a valid JSON array
                        if not isinstance(iv, list) and iv is not None:
                            iv = json.loads(iv) if isinstance(iv, str) else None
                            print(f"Converted iv to: {type(iv)}")
                    
                    # Handle encrypted content serialization
                    new_content = data.get('content', note.content)
                    if isinstance(new_content, list) and data.get('encrypted', False) and data.get('locked', False):
                        print(f"Note {note_id} has encrypted content as list with length {len(new_content)}")
                        # Calculate content size for lists
                        new_content_size = len(json.dumps(new_content).encode('utf-8'))
                    else:
                        # Calculate content size for strings
                        new_content_size = len(new_content.encode('utf-8')) if new_content else 0
                except Exception as conversion_error:
                    print(f"Error converting encryption data: {conversion_error}")
                    # Continue with original values if conversion fails
                    key_params = note.key_params
                    iv = note.iv
                
                # Ensure content type is consistent with encryption state
                if data.get('locked', False) and data.get('encrypted', False):
                    # For locked/encrypted notes, ensure content is properly handled
                    if not isinstance(new_content, list) and new_content is not None:
                        try:
                            # Try to parse it if it might be a stringified array
                            if isinstance(new_content, str) and new_content.startswith('[') and new_content.endswith(']'):
                                new_content = json.loads(new_content)
                                print(f"Converted string content to array for encrypted note")
                        except Exception as content_error:
                            print(f"Error converting encrypted content: {content_error}")
                
                # Update the note with proper field name handling
                note.content = new_content
                
                # Log current and new locked/pinned status for debugging
                current_locked = note.locked
                current_pinned = note.pinned
                new_locked = data.get('locked', note.locked)
                new_pinned = data.get('pinned', note.pinned)
                
                if current_locked != new_locked:
                    print(f"Changing lock status for note {note_id} from {current_locked} to {new_locked}")
                
                if current_pinned != new_pinned:
                    print(f"Changing pin status for note {note_id} from {current_pinned} to {new_pinned}")
                
                note.locked = new_locked
                note.encrypted = data.get('encrypted', note.encrypted)
                note.folder_path = data.get('folder_path', data.get('folderPath', note.folder_path))
                note.pinned = new_pinned
                note.visible_title = data.get('visible_title', data.get('visibleTitle', note.visible_title))
                note.tags = data.get('tags', note.tags)
                
                # Safely update encryption fields with fallback to current values
                if 'keyParams' in data or 'key_params' in data:
                    note.key_params = key_params
                if 'iv' in data:
                    note.iv = iv
                
                try:
                    note.save()
                    print(f"Note {note_id} saved successfully")
                except Exception as save_error:
                    print(f"Error saving note {note_id}: {save_error}")
                    print(f"Note data: locked={note.locked}, encrypted={note.encrypted}, pinned={note.pinned}")
                    print(f"Key params type: {type(note.key_params)}, IV type: {type(note.iv)}")
                    raise
                
                # Update storage usage
                storage = UserStorage.objects.get(user=user)
                size_difference = new_content_size - old_content_size
                if size_difference > 0 and storage.used_bytes + size_difference > storage.total_bytes:
                    return JsonResponse({'error': 'Storage quota exceeded'}, status=400)
                storage.used_bytes += size_difference
                storage.save()
                
                # Notify WebSocket clients
                note_status = {
                    'status': 'synced',
                    'lastSynced': note.date_modified.isoformat(),
                    'size': new_content_size
                }
                
                # Include note content in the notification for real-time sync
                note_content = {
                    'id': note.id,
                    'content': note.content,
                    'dateCreated': note.date_created.isoformat(),
                    'dateModified': note.date_modified.isoformat(),
                    'locked': note.locked,
                    'encrypted': note.encrypted,
                    'folderPath': note.folder_path,
                    'pinned': note.pinned,
                    'visibleTitle': note.visible_title,
                    'tags': note.tags,
                    'keyParams': note.key_params,
                    'iv': note.iv
                }
                
                notify_note_update(user.id, note_id, note_status, note_content)
                
                # Also notify about storage update
                storage_data = {
                    'total_bytes': storage.total_bytes,
                    'used_bytes': storage.used_bytes,
                    'available_bytes': storage.total_bytes - storage.used_bytes,
                    'percent_used': (storage.used_bytes / storage.total_bytes) * 100 if storage.total_bytes > 0 else 0
                }
                notify_storage_update(user.id, storage_data)
                
                return JsonResponse({
                    'id': note.id,
                    'content': note.content,
                    'date_created': note.date_created,
                    'date_modified': note.date_modified,
                    'locked': note.locked,
                    'encrypted': note.encrypted,
                    'folder_path': note.folder_path,
                    'pinned': note.pinned,
                    'visible_title': note.visible_title,
                    'tags': note.tags,
                    'user': user.id,
                    'key_params': note.key_params,
                    'iv': note.iv
                })
            
        except json.JSONDecodeError as json_error:
            print(f"Invalid JSON format: {json_error}")
            return JsonResponse({'error': 'Invalid JSON format'}, status=400)
        except Exception as e:
            import traceback
            print(f"Error updating note {note_id}: {e}")
            print(traceback.format_exc())
            return JsonResponse({'error': str(e)}, status=500)
    
    elif request.method == 'DELETE':
        # Delete the note
        try:
            with transaction.atomic():
                # Calculate content size for storage update
                content_size = len(note.content.encode('utf-8')) if note.content else 0
                
                # Delete the note
                note.delete()
                
                # Update storage usage
                storage = UserStorage.objects.get(user=user)
                storage.used_bytes = max(0, storage.used_bytes - content_size)
                storage.save()
                
                # Notify WebSocket clients
                note_status = {
                    'status': 'not-synced',
                    'lastSynced': None,
                    'size': 0
                }
                notify_note_update(user.id, note_id, note_status)
                
                # Also notify about storage update
                storage_data = {
                    'total_bytes': storage.total_bytes,
                    'used_bytes': storage.used_bytes,
                    'available_bytes': storage.total_bytes - storage.used_bytes,
                    'percent_used': (storage.used_bytes / storage.total_bytes) * 100 if storage.total_bytes > 0 else 0
                }
                notify_storage_update(user.id, storage_data)
                
                return JsonResponse({'message': 'Note deleted successfully'})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@login_required(login_url=None)
def storage_info(request):
    """Get storage information for the current user"""
    user = request.user
    
    try:
        # Get or create storage for the user
        storage, created = UserStorage.objects.get_or_create(user=user)
        
        storage_data = {
            'total_bytes': storage.total_bytes,
            'used_bytes': storage.used_bytes,
            'available_bytes': storage.total_bytes - storage.used_bytes,
            'percent_used': (storage.used_bytes / storage.total_bytes) * 100 if storage.total_bytes > 0 else 0
        }
        
        return JsonResponse(storage_data)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500) 