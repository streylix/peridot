                # Notify WebSocket clients
                note_status = {
                    'status': 'not-synced',
                    'lastSynced': None,
                    'size': 0
                }
                notify_note_update(user.id, note_id, note_status, None)
                
                # Also notify about storage update 