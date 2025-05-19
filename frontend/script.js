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
      loadEntries();
    } catch (error) {
      console.error('Error submitting entry:', error);
    }
  });
} else {
  console.error('submitBtn not found');
}

// Sidebar toggle
const toggleSidebarButton = document.getElementById('toggleSidebar');
const sidebar = document.querySelector('.sidebar');
const container = document.querySelector('.container');
if (toggleSidebarButton && sidebar && container) {
  toggleSidebarButton.addEventListener('click', () => {
    sidebar.classList.toggle('sidebar-hidden');
    container.classList.toggle('sidebar-hidden');
    toggleSidebarButton.classList.toggle('sidebar-hidden');
    toggleSidebarButton.textContent = sidebar.classList.contains('sidebar-hidden') ? '→' : '←';
  });
} else {
  console.error('toggleSidebar, sidebar, or container not found');
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

  const closeButton = document.createElement('button');
  closeButton.classList.add('close-modal');
  closeButton.textContent = '×';
  closeButton.addEventListener('click', () => {
    modalOverlay.classList.remove('active');
    modalContent.classList.remove('active');
    setTimeout(() => modalOverlay.remove(), parseInt(getComputedStyle(document.documentElement).getPropertyValue('--transition-speed')) * 1000);
  });

  const questionHeader = document.createElement('h2');
  questionHeader.textContent = entry.question_text;

  const dateSubtitle = document.createElement('h3');
  dateSubtitle.textContent = entry.date.split('T')[0];

  const textContent = document.createElement('div');
  textContent.innerHTML = entry.text; // Render HTML content from Quill

  modalContent.appendChild(closeButton);
  modalContent.appendChild(questionHeader);
  modalContent.appendChild(dateSubtitle);
  modalContent.appendChild(textContent);
  modalOverlay.appendChild(modalContent);
  document.body.appendChild(modalOverlay);

  setTimeout(() => {
    modalOverlay.classList.add('active');
    modalContent.classList.add('active');
  }, 10);
}

// Load entries
async function loadEntries() {
  try {
    const res = await fetchWithAuth('/entries');
    if (!res.ok) throw new Error('Failed to fetch entries');
    const data = await res.json();
    const history = document.getElementById('history');
    if (history) {
      history.innerHTML = '';
      data.forEach(entry => {
        const li = document.createElement('li');
        li.textContent = `${entry.date.split('T')[0]}: ${entry.question_text}`;
        li.classList.add('entry-item');
        li.style.cursor = 'pointer';

        li.addEventListener('click', () => openModal(entry));
        history.appendChild(li);
      });
    } else {
      console.error('history element not found');
    }
  } catch (error) {
    console.error('Error loading entries:', error);
  }
}

// Load initial data
loadRandomQuestion();
loadEntries();