export async function generateKey(password, salt, iterations) {
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
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iterations = 100000;
    const key = await generateKey(password, salt, iterations);
    const encoder = new TextEncoder();
    const encodedContent = encoder.encode(note.content);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
    const encryptedContent = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encodedContent
    );
  
    return {
      encryptedContent: Array.from(new Uint8Array(encryptedContent)),
      iv: Array.from(iv),
      keyParams: { salt: Array.from(salt), iterations }
    };
  }
  
  export async function decryptNote(note, password, temporary = false) {
    const salt = new Uint8Array(note.keyParams.salt);
    const iterations = note.keyParams.iterations;
    const iv = new Uint8Array(note.iv);
    const key = await generateKey(password, salt, iterations);
    
    try {
      const decryptedContent = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        new Uint8Array(note.encryptedContent)
      );
      
      const decoder = new TextDecoder();
      const content = decoder.decode(decryptedContent);
      
      return {
        success: true,
        content,
        temporary
      };
    } catch (e) {
      console.error("Decryption failed", e);
      return {
        success: false,
        error: "Incorrect password or decryption error."
      };
    }
  }