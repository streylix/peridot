import { passwordStorage } from './PasswordStorageService';

export async function generateKey(password, salt, iterations = 100000) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: iterations,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptNote(note, password) {
  console.log('Starting note encryption:', { 
    noteId: note.id, 
    contentType: typeof note.content,
    contentLength: note.content?.length,
  });
  
  // Store the password securely
  await passwordStorage.storePassword(note.id, password);

  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iterations = 100000;
  const key = await generateKey(password, salt, iterations);
  const encoder = new TextEncoder();

  const contentString = Array.isArray(note.content) 
    ? new TextDecoder().decode(new Uint8Array(note.content)) 
    : note.content;
  
  // Get the first div's content for the visible title
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = note.content;
  const firstDiv = tempDiv.querySelector('div');
  const visibleTitle = (firstDiv?.textContent || '').trim() || 'Untitled';
  
  console.log('Title preparation:', {
    originalContent: note.content.substring(0, 50),
    firstDivContent: firstDiv?.innerHTML || 'No first div found',
    visibleTitle
  });

  // Encrypt the content
  const encodedContent = encoder.encode(note.content);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  console.log('Content preparation:', {
    encodedLength: encodedContent.length,
    ivLength: iv.length,
    saltLength: salt.length,
  });

  const encryptedContent = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encodedContent
  );

  // Convert ArrayBuffer to Array for storage
  const encryptedArray = Array.from(new Uint8Array(encryptedContent));
  const encryptedNote = {
    ...note,
    content: encryptedArray,
    visibleTitle,
    iv: Array.from(iv),
    keyParams: {
      salt: Array.from(salt),
      iterations
    },
    locked: true,
    encrypted: true
  };

  console.log('Encryption complete:', {
    hasEncryptedContent: !!encryptedArray.length,
    hasVisibleTitle: !!visibleTitle,
    hasKeyParams: !!encryptedNote.keyParams,
    hasIV: !!encryptedNote.iv,
    encryptedNote
  });

  return encryptedNote;
}

export async function decryptNote(note, password, permanent = false) {
  console.log('Starting note decryption:', { 
    noteId: note.id, 
    hasEncryptedContent: !!note.content,
    hasKeyParams: !!note.keyParams,
    hasIV: !!note.iv,
    isPermanent: permanent,
    note 
  });

  try {
    // Verify the password
    const storedPassword = await passwordStorage.getPassword(note.id);
    console.log('Password verification:', {
      hasStoredPassword: !!storedPassword,
      passwordsMatch: password === storedPassword
    });

    if (!storedPassword || password !== storedPassword) {
      return {
        success: false,
        error: "Incorrect password"
      };
    }

    // Verify all required encryption parameters are present
    if (!note.keyParams || !note.iv || !note.content) {
      console.error('Missing encryption parameters:', {
        hasKeyParams: !!note.keyParams,
        hasIV: !!note.iv,
        hasContent: !!note.content
      });
      return {
        success: false,
        error: "Missing encryption parameters"
      };
    }

    // Convert stored arrays back to Uint8Arrays
    const salt = new Uint8Array(note.keyParams.salt);
    const iterations = note.keyParams.iterations;
    const iv = new Uint8Array(note.iv);
    const encryptedContent = new Uint8Array(note.content);

    // Generate the key
    const key = await generateKey(password, salt, iterations);
    
    // Decrypt the content
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encryptedContent
    );
    
    // Convert the decrypted buffer to text
    const decoder = new TextDecoder();
    const decryptedContent = decoder.decode(decryptedBuffer);
    
    console.log('Decryption successful:', {
      hasDecryptedContent: !!decryptedContent
    });

    // If permanent unlock is requested, remove the stored password
    if (permanent) {
      await passwordStorage.removePassword(note.id);
      console.log('Removed stored password for permanent unlock');
    }
    
    // Create decrypted note object
    const decryptedNote = {
      ...note,
      content: decryptedContent,
      locked: !permanent,
      encrypted: false,
      // Remove encryption-specific fields
      iv: undefined,
      keyParams: undefined,
      visibleTitle: undefined
    };

    return {
      success: true,
      note: decryptedNote
    };
  } catch (e) {
    console.error("Decryption failed:", e);
    return {
      success: false,
      error: "Decryption failed: " + e.message
    };
  }
}

export async function reEncryptNote(note) {
  if (!note.locked || !note.id) return note;
  
  const password = await passwordStorage.getPassword(note.id);
  if (!password) return note;
  
  return encryptNote(note, password);
}

export async function permanentlyUnlockNote(noteId, password) {
  console.log('Attempting permanent unlock:', { noteId });
  try {
    const storedPassword = await passwordStorage.getPassword(noteId);
    if (!storedPassword || password !== storedPassword) {
      console.log('Password verification failed for permanent unlock');
      return {
        success: false,
        error: "Incorrect password"
      };
    }

    await passwordStorage.removePassword(noteId);
    console.log('Permanent unlock successful');
    
    return {
      success: true
    };
  } catch (error) {
    console.error("Failed to permanently unlock note:", error);
    return {
      success: false,
      error: "Failed to permanently unlock note"
    };
  }
}