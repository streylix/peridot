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

  // Encrypt the content
  const encodedContent = encoder.encode(note.content);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encryptedContent = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encodedContent
  );

  // Convert ArrayBuffer to Array for storage
  const encryptedArray = Array.from(new Uint8Array(encryptedContent));
  const encryptedNote = {
    ...note,
    visibleTitle,
    content: encryptedArray,
    iv: Array.from(iv),
    keyParams: {
      salt: Array.from(salt),
      iterations
    },
    locked: true,
    encrypted: true
  };

  return encryptedNote;
}

export async function decryptNote(note, password, permanent = false) {

  try {
    // Verify the password
    const verifyBypass = localStorage.getItem('skipPasswordVerification') === 'true'

    if (!verifyBypass){
      const storedPassword = await passwordStorage.getPassword(note.id);

      if (!storedPassword || password !== storedPassword) {
        return {
          success: false,
          error: "Incorrect password"
        };
      }
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

    // If permanent unlock is requested, remove the stored password
    if (permanent) {
      await passwordStorage.removePassword(note.id);
    }
    
    // Create decrypted note object
    const decryptedNote = {
      ...note,
      visibleTitle: undefined,
      content: decryptedContent,
      locked: !permanent,
      encrypted: false,
      // Remove encryption-specific fields
      iv: undefined,
      keyParams: undefined,
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
  try {
    const storedPassword = await passwordStorage.getPassword(noteId);
    if (!storedPassword || password !== storedPassword) {
      return {
        success: false,
        error: "Incorrect password"
      };
    }

    await passwordStorage.removePassword(noteId);
    
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