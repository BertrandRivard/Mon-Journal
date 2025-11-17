// Check if user is authenticated at the start
const token = localStorage.getItem('token');
if (!token) {
  window.location.href = '/login.html'; // Redirect to login if no token
}

// Add Authorization header to fetch requests
const fetchWithAuth = (url, options = {}) => {
  options.headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  return fetch(url, options);
};

// Verify token validity by making a test request
fetchWithAuth('/question').catch(() => {
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  window.location.href = '/login.html';
});

// Initialize Quill editor
const quill = new Quill('#editor', {
  theme: 'snow',
  modules: {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }], // Headers for 3 different sizes
      ['bold', 'italic', 'underline'], // Bold, italic, underline
    ]
  },
  placeholder: 'Écrivez votre note ici...'
});

// Open settings modal
const settingsBtn = document.getElementById('settingsBtn');
if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    const existingModal = document.querySelector('.modal-overlay');
    if (existingModal) existingModal.remove();

    const modalOverlay = document.createElement('div');
    modalOverlay.classList.add('modal-overlay');

    const modalContent = document.createElement('div');
    modalContent.classList.add('modal-content');

    const closeButton = document.createElement('button');
    closeButton.classList.add('close-modal');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => {
      modalOverlay.classList.remove('active');
      modalContent.classList.remove('active');
      setTimeout(() => modalOverlay.remove(), parseInt(getComputedStyle(document.documentElement).getPropertyValue('--transition-speed')) * 1000);
    });

    const header = document.createElement('h2');
    header.textContent = 'Compte';

    const emailPara = document.createElement('p');
    emailPara.textContent = `Email: ${localStorage.getItem('email') || 'Non défini'}`;

    const rolePara = document.createElement('p');
    rolePara.textContent = `Rôle: ${localStorage.getItem('role') || 'Non défini'}`;

    const logoutButton = document.createElement('button');
    logoutButton.textContent = 'Déconnexion';
    logoutButton.classList.add('logout-btn');
    logoutButton.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      localStorage.removeItem('email');
      window.location.href = '/login.html';
    });

    modalContent.appendChild(closeButton);
    modalContent.appendChild(header);
    modalContent.appendChild(emailPara);
    modalContent.appendChild(rolePara);
    modalContent.appendChild(logoutButton);
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);

    setTimeout(() => {
      modalOverlay.classList.add('active');
      modalContent.classList.add('active');
    }, 10);
  });
} else {
  console.error('settingsBtn not found');
}

// Submit entry
const submitBtn = document.getElementById('submitBtn');
if (submitBtn) {
  submitBtn.addEventListener('click', async () => {
    const text = quill.root.innerHTML; // Get HTML content from Quill editor
    const questionId = document.getElementById('question').dataset.questionId;
    if (!text || text === '<p><br></p>' || !questionId) {
      console.error('Text or questionId missing');
      return;
    }

    try {
      await fetchWithAuth('/submit', {
        method: 'POST',
        body: JSON.stringify({ question_id: parseInt(questionId), text })
      });
      quill.setText(''); // Clear the editor
      currentPage = 1; // Reset to first page
      loadEntries(true); // Reload entries with reset
      loadRandomQuestion(); // Load a new random question
    } catch (error) {
      console.error('Error submitting entry:', error);
    }
  });
} else {
  console.error('submitBtn not found');
}

// Load random question
async function loadRandomQuestion() {
  try {
    const res = await fetchWithAuth('/question');
    if (!res.ok) throw new Error('Failed to fetch question');
    const data = await res.json();
    const questionElement = document.getElementById('question');
    if (questionElement) {
      questionElement.textContent = data.text;
      questionElement.dataset.questionId = data.id;
    } else {
      console.error('question element not found');
    }
  } catch (error) {
    console.error('Error loading question:', error);
  }
}

// Reload question
const reloadButton = document.getElementById('reloadQuestion');
if (reloadButton) {
  reloadButton.textContent = '♻️';
  reloadButton.addEventListener('click', () => {
    loadRandomQuestion();
  });
} else {
  console.error('reloadQuestion button not found');
}

// Open modal
function openModal(entry) {
  const existingModal = document.querySelector('.modal-overlay');
  if (existingModal) existingModal.remove();

  const modalOverlay = document.createElement('div');
  modalOverlay.classList.add('modal-overlay');

  const modalContent = document.createElement('div');
  modalContent.classList.add('modal-content');

  // Add click event to close modal when clicking outside
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.classList.remove('active');
      modalContent.classList.remove('active');
      document.body.classList.remove('modal-open');
      setTimeout(() => modalOverlay.remove(), parseInt(getComputedStyle(document.documentElement).getPropertyValue('--transition-speed')) * 1000);
    }
  });

  const modalHeader = document.createElement('div');
  modalHeader.classList.add('modal-header');

  const questionHeader = document.createElement('h2');
  questionHeader.textContent = entry.question_text;

  const dateSubtitle = document.createElement('h3');
  dateSubtitle.textContent = entry.date.split('T')[0];

  const textContent = document.createElement('div');
  textContent.innerHTML = entry.text;

  // Add edit button if the note can be modified
  const today = new Date().toISOString().split('T')[0];
  const noteDate = entry.date.split('T')[0];
  const canEdit = noteDate === today;

  if (canEdit) {
    const editButton = document.createElement('button');
    editButton.textContent = 'Modifier';
    editButton.classList.add('edit-btn');
    editButton.addEventListener('click', () => {
      // Create container for editor
      const editorContainer = document.createElement('div');
      editorContainer.id = 'modalEditorContainer';
      
      // Create editor element
      const editorElement = document.createElement('div');
      editorElement.id = 'modalEditor';
      editorContainer.appendChild(editorElement);
      
      // Replace text content with editor container
      textContent.innerHTML = '';
      textContent.appendChild(editorContainer);

      // Initialize Quill editor
      const quill = new Quill('#modalEditor', {
        theme: 'snow',
        modules: {
          toolbar: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline'],
          ]
        }
      });
      
      // Set initial content
      quill.root.innerHTML = entry.text;

      // Add save button
      const saveButton = document.createElement('button');
      saveButton.textContent = 'Enregistrer';
      saveButton.classList.add('save-btn');
      saveButton.addEventListener('click', async () => {
        try {
          const response = await fetchWithAuth('/submit', {
            method: 'POST',
            body: JSON.stringify({
              question_id: entry.question_id,
              text: quill.root.innerHTML,
              answer_id: entry.id
            })
          });

          if (!response.ok) {
            throw new Error('Failed to update note');
          }

          // Update the note in the grid
          const noteDiv = document.querySelector(`[data-note-id="${entry.id}"]`);
          if (noteDiv) {
            const noteText = noteDiv.querySelector('p');
            if (noteText) {
              noteText.textContent = quill.getText().substring(0, 100) + '...';
            }
          }

          // Close modal and reload entries
          modalOverlay.classList.remove('active');
          modalContent.classList.remove('active');
          document.body.classList.remove('modal-open');
          setTimeout(() => {
            modalOverlay.remove();
            loadEntries(true);
          }, parseInt(getComputedStyle(document.documentElement).getPropertyValue('--transition-speed')) * 1000);
        } catch (error) {
          console.error('Error updating note:', error);
          alert('Erreur lors de la mise à jour de la note');
        }
      });

      textContent.appendChild(saveButton);
      editButton.style.display = 'none';
    });

    modalHeader.appendChild(editButton);
  }

  modalHeader.appendChild(questionHeader);
  modalHeader.appendChild(dateSubtitle);
  modalContent.appendChild(modalHeader);
  modalContent.appendChild(textContent);
  modalOverlay.appendChild(modalContent);
  document.body.appendChild(modalOverlay);
  document.body.classList.add('modal-open');

  setTimeout(() => {
    modalOverlay.classList.add('active');
    modalContent.classList.add('active');
  }, 10);
}

let currentPage = 1;
let hasMore = true;
let currentSearch = '';
let currentSearchType = 'all';

// Load entries
async function loadEntries(reset = false) {
  if (reset) {
    currentPage = 1;
    hasMore = true;
  }

  if (!hasMore) return;

  try {
    const searchInput = document.getElementById('searchInput');
    const searchType = document.getElementById('searchType');
    const search = searchInput ? searchInput.value : '';
    const type = searchType ? searchType.value : 'all';

    const res = await fetchWithAuth(`/entries?page=${currentPage}&search=${encodeURIComponent(search)}&searchType=${type}`);
    if (!res.ok) throw new Error('Failed to fetch entries');
    const data = await res.json();
    
    const history = document.getElementById('history');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    
    if (history) {
      if (reset) {
        history.innerHTML = '';
      }
      
      data.entries.forEach(entry => {
        const noteDiv = document.createElement('div');
        noteDiv.classList.add('note-item');
        noteDiv.dataset.noteId = entry.id;

        const questionHeader = document.createElement('h3');
        questionHeader.textContent = entry.question_text;

        const datePara = document.createElement('p');
        datePara.textContent = entry.date.split('T')[0];

        // Add edit indicator if the note can be modified
        const today = new Date().toISOString().split('T')[0];
        const noteDate = entry.date.split('T')[0];
        if (noteDate === today) {
          const editIndicator = document.createElement('span');
          editIndicator.textContent = '✏️';
          editIndicator.style.marginLeft = '5px';
          datePara.appendChild(editIndicator);
        }

        noteDiv.appendChild(questionHeader);
        noteDiv.appendChild(datePara);
        noteDiv.addEventListener('click', () => openModal(entry));
        history.appendChild(noteDiv);
      });

      hasMore = data.hasMore;
      if (loadMoreBtn) {
        loadMoreBtn.style.display = hasMore ? 'block' : 'none';
      }
    }
  } catch (error) {
    console.error('Error loading entries:', error);
  }
}

// Add search functionality
const searchInput = document.getElementById('searchInput');
const searchType = document.getElementById('searchType');
const loadMoreBtn = document.getElementById('loadMoreBtn');

if (searchInput && searchType) {
  let searchTimeout;
  
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      loadEntries(true);
    }, 300);
  });

  searchType.addEventListener('change', () => {
    loadEntries(true);
  });
}

if (loadMoreBtn) {
  loadMoreBtn.addEventListener('click', () => {
    currentPage++;
    loadEntries();
  });
}

// Load initial data
loadRandomQuestion();
loadEntries(true);