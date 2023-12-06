
// Allows for tab to make a tab character in the editor
document.querySelector('.editable').addEventListener('keydown', function (e){
    if (e.key === 'Tab'){
        e.preventDefault();
        const tabChar = '\t';
        document.execCommand('insertText', false, tabChar);
    }
});

// Menu movement feature
document.addEventListener('DOMContentLoaded', function() {
    var button = document.getElementById('move-menu');
    var sidebar = document.getElementById('sidebar');
    var editable = document.getElementById('editable')
    var mainContent = document.getElementById('main-content');
    // Function to update the main content position
    function updateAffectedObjectPosition() {
        var margin = -(sidebar.offsetWidth);
        if (sidebar.classList.contains('animate-right')) {
            mainContent.style.marginLeft = '0px';
            editable.style.maxWidth = 160 + 'vh';
        } else {
            mainContent.style.marginLeft = margin + 'px';
            editable.style.maxWidth = 193 + 'vh';
        }
    }

    // Function to toggle the sidebar state
    function toggleSidebar() {
        if (sidebar.classList.contains('animate-left')) {
            sidebar.classList.remove('animate-left');
            sidebar.classList.add('animate-right');
            localStorage.setItem('sidebarExpanded', 'true');
            updateAffectedObjectPosition();
        } else if (sidebar.classList.contains('animate-right')){
            sidebar.classList.remove('animate-right');
            sidebar.classList.add('animate-left');
            localStorage.setItem('sidebarExpanded', 'false');
            updateAffectedObjectPosition();
        }
    }

    // Event listener for the toggle button
    button.addEventListener('click', function() {
        button.disabled = true;
        toggleSidebar();
        sidebar.addEventListener('animationend', function() {
            button.disabled = false;
        }, { once: true });
    });

    window.addEventListener('resize', updateAffectedObjectPosition);

    // Initialize the sidebar state from localStorage
    var sidebarExpanded = localStorage.getItem('sidebarExpanded');
    if (sidebarExpanded === 'true') {
        sidebar.classList.add('animate-right');
        updateAffectedObjectPosition();
    } else {
        sidebar.classList.add('animate-left');
        updateAffectedObjectPosition();
    }

    // Mobile feature only
    if ('ontouchstart' in window) {
        const noteList = document.querySelector('.note-list');
        noteList.addEventListener('click', function(){
            toggleSidebar();
        });
    }
});

// Everything else
document.addEventListener('DOMContentLoaded', function() {
    // variables for buttons before I just decided to start being lazy about it
    const addButton = document.querySelector('.new-note-btn');
    const noteList = document.querySelector('.note-list');
    const noteContent = document.querySelector('.main-content .editable');
    const debugButton = document.getElementById('debug-button');

    let passwordEntered = ''; // for content updating.. do I even use this?
    let noteCounter = JSON.parse(localStorage.getItem('noteCounter')) || 1; // Counting notes for new note incrementation
    let notesArray = JSON.parse(localStorage.getItem('notes')) || []; // for listing the notes
    let selectedNoteIndex = -1; // for universal note indexing
    let selectedId = -1; // Not used that much so i honestly forget why i needed this, but I think i do still so yeah


    // Whimsy button functionality
    document.getElementById('gif-note-btn').addEventListener('click', async function(){
        const query = prompt("Enter Giphy Rhyme Search Query");
        if (query){
            const rhymeResults = await (await searchForRhymes(query)).json();
            const gifResults = await (await searchGiphy(rhymeResults[0].word)).json()
            console.log(`Word entered: ${query} | Rhyme chosen: ${rhymeResults[0].word}`)
            addGif(gifResults.data[0].images.fixed_height.url);
        }
    });

    // Add the gif to the note
    async function addGif(gif){
        const contentDiv = noteContent.querySelector('div');
        if (contentDiv) {
            const link = document.createElement('embed');
            link.src = gif;
            link.id = 'gif';
            link.width = 200;
            link.height = 200;

            contentDiv.appendChild(link);
            notesArray[selectedNoteIndex].content = contentDiv.innerHTML;
            saveNotes();
        }
    }

    // Search for a rhyme using the users query
    async function searchForRhymes(query){
        return fetch(`https://rhymebrain.com/talk?function=getRhymes&word=${query}&maxResults=1`)
    }

    // Search for a gif using the rhyme query
    async function searchGiphy(word){
        return fetch(`https://api.giphy.com/v1/gifs/search?api_key=GkVHnnWLvZCSOlLfkGF1vyBilm4h4iCS&q=${word}&limit=1&offset=0&rating=g&lang=en&bundle=messaging_non_clips`)
    }

    // Blob export button functionality
    document.getElementById('blob-export-btn').addEventListener('click', function(){
        if (selectedNoteIndex >= 0){
            // Only exports the selected note
            const blob = new Blob([JSON.stringify(notesArray[selectedNoteIndex])], { type: "application/json" });
            const downURL = URL.createObjectURL(blob);
            const downLink = document.createElement('a');
            downLink.href = downURL;
            downLink.download = `${notesArray[selectedNoteIndex].title}.json`;
            document.body.appendChild(downLink);
            downLink.click();
            document.body.removeChild(downLink);

        }
    });

    // Counts notes for organizational purposes
    function getNoteCounter() {
        const newNoteTitles = notesArray.map(note => note.title.match(/^New Note(?: (\d+))?$/));
        const numbers = newNoteTitles.map(match => match ? (match[1] ? parseInt(match[1]) : 1) : 0);
        return Math.max(0, ...numbers) + 1;
    }

    // Load existing notes from local storage
    notesArray.forEach((note, index) => addNewNoteToList(note.title, index));
    if (notesArray.length > 0) {
        selectNote(0);
    }

    // Delete note button functionality
    document.getElementById('delete-selected-note-btn').addEventListener('click', function() {
        if (confirm("Are you sure you want to delete this note?")){
            if (selectedNoteIndex >= 0) {
                deleteNote(selectedNoteIndex);
            }
        }
    });

    // Array to track pinned notes
    var pinnedNotes = [];

    // Embed note functionality
    document.getElementById('embed-link-btn').addEventListener('click', function(){
        if (selectedNoteIndex >= 0) {
            const url = prompt('Enter the link URL:');
        if (url) {
            insertLinkIntoNote(url);
        }
        } else {
            alert('Please select a note first.');
        }
    });

    // Lock note functionality
    document.getElementById('lock-note-btn').addEventListener('click', async function(){
        if (selectedNoteIndex >= 0) {
            lockNote(notesArray[selectedNoteIndex].id);
        }
    });

    // Lock note internals
    async function lockNote(noteId){
        const note = notesArray.find(n => n.id === noteId);
        if (!note.locked){ // note isn't locked
            const password = prompt("Lock note | Enter a password for this note");
            const confirmPass = prompt("Lock note | Confirm password");
            if (password && password === confirmPass){
                await encryptNote(note, password);
                note.locked = true;
                rebuildNotesList();
                saveNotes()
                alert(`${note.title} is now locked with password ${password}`)
            } else {
                alert("Passwords did not match");
            }
        } else {
            const verifyPass = prompt("Enter password");
            const willUnlock = await decryptNote(note, verifyPass, false);
            if (willUnlock){
                if(confirm("Are you sure you want to unlock this note?")){
                    rebuildNotesList();
                    saveNotes()
                    note.locked = false;
                    alert(`${note.title} is now unlocked`);
                } else {
                    alert(`OK, ${note.title} remains locked`);
                }
            }
        }
    }

    // Generate key for password encryption
    async function generateKey(password, salt, iterations){
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

    // Encrypt the note contents of locked note
    async function encryptNote(note, password){
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iterations = 100;
        const key = await generateKey(password, salt, iterations);
        const encoder = new TextEncoder();
        const encodedContent = encoder.encode(note.content);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        const encryptedContent = await crypto.subtle.encrypt(
            { name:"AES-GCM", iv: iv },
            key,
            encodedContent
        );

        note.encryptedContent = Array.from(new Uint8Array(encryptedContent));
        note.iv = Array.from(iv);
        note.content = '';
        note.keyParams = { salt: Array.from(salt), iterations: iterations };

        await rebuildNotesList();
        await saveNotes();
    }

    // Decrypt the note contents of locked note
    async function decryptNote(note, password, temporary = false){
        const salt = new Uint8Array(note.keyParams.salt);
        const iterations = note.keyParams.iterations;
        const iv = new Uint8Array(note.iv);

        const key = await generateKey(password, salt, iterations);
        const decoder = new TextDecoder();
        const encryptedContent = new Uint8Array(note.encryptedContent);

        if (!temporary) {
            note.locked = false;
            note.encryptedContent = null;
            note.iv = null;
            note.keyParams = null;
        }

        // decrypt using subtle
        try {
            const decrypedContent = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv },
            key, encryptedContent
            );

        // decrypt the notes
        note.content = decoder.decode(decrypedContent);
        return true;
        } catch (e) {
            console.error("Decryption failed", e);
            alert("Incorrect password or decryption error.");
            return false;
        }
    }

    // For periodically updating locked notes
    async function reEncryptNoteContent(note, password) {
        if (note.locked && password) {
            await encryptNote(note, password);
        }
    }

    // Inserting links into notes (i.e images, videos, or links)
    function insertLinkIntoNote(url) {
        const contentDiv = noteContent.querySelector('div');
        if (contentDiv) {
            const link = document.createElement('embed');
            link.src = url;
            link.classList.add('resizable-img'); // broken but might be useful later

            contentDiv.appendChild(link);

            // Update the notes array and save
            notesArray[selectedNoteIndex].content = contentDiv.innerHTML;
            saveNotes();
        }
    }

    // Pin note functionality
    document.getElementById('pin-note-btn').addEventListener('click', function() {
        if (selectedNoteIndex >= 0) {
            var noteToPin = notesArray[selectedNoteIndex];
            noteToPin.pinned = !noteToPin.pinned; // Toggle pin status

            // Count the number of pinned notes
            const pinnedNotesCount = notesArray.reduce((count, note) => count + (note.pinned ? 1 : 0), 0);

            if (pinnedNotesCount > 3) {
                // Can only have 3 notes pinned at a time
                noteToPin.pinned = false;
                alert('You can only pin up to 3 notes.');
            }

            rebuildNotesList(); // Rebuild list
            saveNotes();
        }
    });

    // Add button functionality
    addButton.addEventListener('click', function() {
        const noteTitle = getUniqueNoteTitle();
        const newNote = { id: Date.now(), title: noteTitle, content: '' ,
        iv: null, encryptedContent: null,
        locked: false, keyParams: { salt: null, iterations: 100000 }};

        // Add new note after pinned notes
        const firstUnpinnedIndex = notesArray.findIndex(note => !note.pinned);
        if (firstUnpinnedIndex === -1) { // If no unpinned notes
            notesArray.push(newNote);
        } else {
            notesArray.splice(firstUnpinnedIndex, 0, newNote);
        }

        addNewNoteToList(noteTitle, notesArray.length - 1);
        rebuildNotesList(); // Rebuild list with new note
        selectNote(notesArray.findIndex(note => !note.pinned)); // Select the new note
        saveNotes();
    });

    // Debug button functionality (It's a spec for Phase 2 but is TBR)
    debugButton.addEventListener('click', function() {
        // Clear notes array and local storage
        if (confirm("Are you sure? This will delete all notes in the list")){
            notesArray = [];
            saveNotes();
            noteList.innerHTML = ''; // Clear the list in the DOM
            noteContent.innerHTML = ''; // Clear the main content
            noteCounter = getNoteCounter(); // Reset note counter
        }
    });

    // Adding to/Rebuilding the list
    function addNewNoteToList(title, index) {
        const listItem = document.createElement('li');

        // Ensure noteCounter is up to date
        noteCounter = getNoteCounter();

        listItem.textContent = title;
        listItem.className = 'note-item';
        listItem.setAttribute('data-index', index);

        if (notesArray[index].pinned) {
            listItem.innerHTML += ' 📌'; // Add pin icon
        }

        if (notesArray[index].locked) {
            listItem.innerHTML += ' 🔒'; // Add lock icon
        }

        listItem.addEventListener('click', async function() {
            await reEncryptNoteContent(notesArray[index], passwordEntered)
            await selectNote(index);
        });
        noteList.appendChild(listItem);
    }

    // Deleting a node internal functionality
    function deleteNote(index) {
        notesArray.splice(index, 1); // remove note
        saveNotes(); // update notes

        rebuildNotesList();

        if (notesArray.length > 0) {
            selectNote(Math.min(index, notesArray.length - 1)); // Select an appropriate note
        } else {
            noteContent.innerHTML = '';
            selectedNoteIndex = -1;
        }
        noteCounter = getNoteCounter();
    }

    // Rebuilding the notes list
    function rebuildNotesList() {
        noteList.innerHTML = ''; // Clear list
        notesArray.forEach((note, index) => addNewNoteToList(note.title, index));
    }

    // Selecting a note for configuration
    async function selectNote(index) {
        const notes = document.querySelectorAll('.note-item');

        let isUnlocked = true;
        const note = notesArray[index];

        // Check for locked note
        if (note.locked) {
            let password = prompt("Enter password to unlock this note:");
            if (password) {
                isUnlocked = await decryptNote(note, password, true);
                passwordEntered = password;
            } else {
                isUnlocked = false;
            }
        }

        notes.forEach(note => note.classList.remove('active'));
        notes[index].classList.add('active');
        selectedNoteIndex = index;
        selectedId = notesArray[index].id;



        if (isUnlocked){
            // Clear note content
            noteContent.innerHTML = '';

            // Create title element
            const titleElement = document.createElement('h1');
            titleElement.textContent = notesArray[index].title;
            titleElement.setAttribute('contenteditable', 'true');
            titleElement.addEventListener('keypress', handleTitleKeyPress);
            titleElement.addEventListener('blur', updateTitle);
            noteContent.appendChild(titleElement);

            // Create content element
            const contentElement = document.createElement('div');
            contentElement.innerHTML = notesArray[index].content.replace(`<h1 contenteditable="true">${titleElement.textContent}</h1>`,'');
            contentElement.setAttribute('contenteditable', 'true');
            contentElement.setAttribute('id', 'inner-note');
            contentElement.addEventListener('input', updateContent);
            noteContent.appendChild(contentElement);
        }
    }

    // For overriding tab key functionality
    function handleTitleKeyPress(event) {
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevent the default enter key action

            const contentElement = noteContent.querySelector('div');
        if (contentElement) {
            contentElement.focus(); // Move focus to the content element
        }
}
    }

    // When the title is modified
    function updateTitle(event) {
        const newTitle = event.target.innerText;
        if (selectedNoteIndex >= 0 && notesArray[selectedNoteIndex].title !== newTitle) {
            const newTitle = event.target.innerText;
            notesArray[selectedNoteIndex].title = newTitle;
            const sidebarTitle = noteList.querySelector(`[data-index="${selectedNoteIndex}"]`);
            sidebarTitle.textContent = newTitle;

            if (notesArray[selectedNoteIndex].pinned) {
                sidebarTitle.textContent += ' 📌'; // Add pin icon
            }
            if (notesArray[selectedNoteIndex].locked){
                sidebarTitle.textContent += ' 🔒'; // Add lock icon
            }
            moveNoteToTop(selectedNoteIndex);
            saveNotes();
        }
        if (notesArray[selectedNoteIndex].title === ""){
            deleteNote(selectedNoteIndex);
        }
    }

    // When the content is modified
    async function updateContent() {
        if (selectedNoteIndex >= 0) {
            const contentDiv = noteContent.querySelector('div');
            if (contentDiv) {
                notesArray[selectedNoteIndex].content = contentDiv.innerHTML;
                reEncryptNoteContent(notesArray[selectedNoteIndex], passwordEntered);
                moveNoteToTop(selectedNoteIndex);
                saveNotes();
            }
        }
    }

    // For when a new node is made to keep the integer value beside it accurate
    function getUniqueNoteTitle() {
        while (notesArray.some(note => note.title === `New Note${noteCounter > 1 ? ' ' + noteCounter : ''}`)) {
            noteCounter++;
        }
        return `New Note${noteCounter > 1 ? ' ' + noteCounter : ''}`;
    }

    // For saving the notes to localStorage
    function saveNotes() {
        localStorage.setItem('notes', JSON.stringify(notesArray));
        localStorage.setItem('noteCounter', noteCounter.toString());
    }

    // Startup selection
    if (notesArray.length > 0) {
        selectNote(0); // Might change to where it remembers your last note but too late for that rn
    }

    // ----=====SEARCH FUNCTIONALITY====----
    const searchInput = document.getElementById('note-search');

    // Initial functionality for searching
    searchInput.addEventListener('input', function() {
        const searchTerm = searchInput.value.toLowerCase();
        filterNotes(searchTerm);
    });

    // Filtering notes by term
    function filterNotes(searchTerm) {
        const noteItems = document.querySelectorAll('.note-item');
        noteItems.forEach((noteItem, index) => {
            const title = notesArray[index].title.toLowerCase();
            if (!notesArray[index].locked){ // if not isn't locked, otherwise do not search content
                const content = notesArray[index].content.toLowerCase();
                const noteMatches = title.includes(searchTerm) || content.includes(searchTerm);
                noteItem.style.display = noteMatches ? '' : 'none';
                return;
            }
            const noteMatches = title.includes(searchTerm);
            noteItem.style.display = noteMatches ? '' : 'none';
        });
    }

    // Initially used to shape the list as the search got more precise, but was later used for other things as well
    function rebuildNotesList() {
        noteList.innerHTML = ''; // Clear the list
        notesArray.sort((a, b) => { // Sort pinned on top of list
            if (a.pinned && !b.pinned) return -1; // if first is pinned and second is not
            if (!a.pinned && b.pinned) return 1; // if first is not pinned and second is
            return 0; // if both are pinned
        });

        // for every note, update the list
        notesArray.forEach((note, index) => addNewNoteToList(note.title, index));

        selectNoteAfterRebuild();
    }

    // Selecting a node after the page rebuilds, this prevents weird things from happening if the list is modified
    function selectNoteAfterRebuild(){
        const notes = document.querySelectorAll('.note-item');
        notes.forEach(note => note.classList.remove('active'));
        notes.forEach((noteItem, index) =>{
            if (notesArray[index].id === selectedId){
                selectedNoteIndex = index;
                notes[index].classList.add('active');
            }
        });
    }

    // For when the user makes a modification to a note, the list is sorted by recency
    function moveNoteToTop(index) {
        const note = notesArray[index];
        notesArray.splice(index, 1);
        const firstUnpinnedIndex = notesArray.findIndex(note => !note.pinned);
        if (firstUnpinnedIndex === -1 || note.pinned) {
            notesArray.push(note);
        } else {
            notesArray.splice(firstUnpinnedIndex, 0, note);
        }
        rebuildNotesList();
        selectNoteAfterRebuild(note.id);
    }
});