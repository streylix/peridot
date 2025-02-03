import React from 'react';
import { Download, Gift, Lock, Link2, Pin, Trash2 } from 'lucide-react';

function NoteToolbar({ note, onUpdateNote, onDeleteNote }) {
  const searchForRhymes = async (query) => {
    const response = await fetch(
      `https://rhymebrain.com/talk?function=getRhymes&word=${query}&maxResults=1`
    );
    return response.json();
  };

  const searchGiphy = async (word) => {
    const response = await fetch(
      `https://api.giphy.com/v1/gifs/search?api_key=GkVHnnWLvZCSOlLfkGF1vyBilm4h4iCS&q=${word}&limit=1&offset=0&rating=g&lang=en&bundle=messaging_non_clips`
    );
    return response.json();
  };

  const handleGifNote = async () => {
    const query = prompt("Enter Giphy Rhyme Search Query");
    if (query) {
      try {
        const rhymeResults = await searchForRhymes(query);
        const gifResults = await searchGiphy(rhymeResults[0].word);
        console.log(`Word entered: ${query} | Rhyme chosen: ${rhymeResults[0].word}`);
        addGif(gifResults.data[0].images.fixed_height.url);
      } catch (error) {
        console.error('Error fetching GIF:', error);
      }
    }
  };

  const addGif = (gifUrl) => {
    const embed = `<embed src="${gifUrl}" id="gif" width="200" height="200">`;
    const newContent = note.content + embed;
    onUpdateNote({ content: newContent });
  };

  const handleBlobExport = () => {
    const blob = new Blob([JSON.stringify(note)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${note.title}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleEmbedLink = () => {
    const url = prompt('Enter the link URL:');
    if (url) {
      const embed = `<embed src="${url}" class="resizable-img">`;
      const newContent = note.content + embed;
      onUpdateNote({ content: newContent });
    }
  };

  const handleLockNote = async () => {
    if (!note.locked) {
      const password = prompt("Lock note | Enter a password for this note");
      const confirmPass = prompt("Lock note | Confirm password");
      if (password && password === confirmPass) {
        await encryptNote(note, password);
        onUpdateNote({
          locked: true,
          content: '',
        });
      } else {
        alert("Passwords did not match");
      }
    } else {
      const verifyPass = prompt("Enter password");
      const willUnlock = await decryptNote(note, verifyPass, false);
      if (willUnlock && confirm("Are you sure you want to unlock this note?")) {
        onUpdateNote({
          locked: false,
          encryptedContent: null,
          iv: null,
          keyParams: null,
        });
      }
    }
  };

  const handlePinNote = () => {
    onUpdateNote({ pinned: !note.pinned });
  };

  return (
    <div className="note-toolbar">
      <button type="button" onClick={handleBlobExport} title="Export Note">
        <Download size={24} />
      </button>
      <button type="button" onClick={handleGifNote} title="Add GIF">
        <Gift size={24} />
      </button>
      <button type="button" onClick={handleLockNote} title="Lock/Unlock Note">
        <Lock size={24} />
      </button>
      <button type="button" onClick={handleEmbedLink} title="Embed Link">
        <Link2 size={24} />
      </button>
      <button type="button" onClick={handlePinNote} title="Pin/Unpin Note">
        <Pin size={24} />
      </button>
      <button type="button" onClick={onDeleteNote} title="Delete Note">
        <Trash2 size={24} />
      </button>
    </div>
  );
}

export default NoteToolbar;