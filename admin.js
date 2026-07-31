document.addEventListener('DOMContentLoaded', () => {
    const adminAuth = document.getElementById('admin-auth');
    const adminDashboard = document.getElementById('admin-dashboard');
    const adminLoginForm = document.getElementById('admin-login-form');
    const adminPassInput = document.getElementById('admin-pass');
    const adminError = document.getElementById('admin-error');
    const threadList = document.getElementById('thread-list');
    const adminWorkspace = document.getElementById('admin-workspace');
    const adminBack = document.getElementById('admin-back');
    const activeUserEmailTitle = document.getElementById('active-user-email');
    const adminChatMessages = document.getElementById('admin-chat-messages');
    const adminMsgInput = document.getElementById('admin-msg-input');
    const adminSendBtn = document.getElementById('admin-send-btn');
    
    const hijackVideoFile = document.getElementById('hijack-video-file');
    const uploadHijackBtn = document.getElementById('upload-hijack-btn');

    let activeEmail = null;

    // Hardcoded master password for access control
    const MASTER_PASS = "admin1234";

    adminLoginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (adminPassInput.value === MASTER_PASS) {
            adminAuth.classList.remove('active');
            adminDashboard.classList.add('active');
            loadThreads();
        } else {
            adminError.classList.remove('hidden');
        }
    });

    function loadThreads() {
        threadList.innerHTML = '';
        const threads = JSON.parse(localStorage.getItem('admin_threads') || '{}');
        
        Object.keys(threads).forEach(email => {
            const item = document.createElement('div');
            item.className = 'thread-item';
            item.innerHTML = `<strong>${email}</strong><p>${threads[email].lastMessage}</p>`;
            item.addEventListener('click', () => openWorkspace(email));
            threadList.appendChild(item);
        });
    }

    function openWorkspace(email) {
        activeEmail = email;
        activeUserEmailTitle.textContent = email;
        adminWorkspace.classList.remove('hidden');
        loadWorkspaceMessages();
    }

    adminBack.addEventListener('click', () => {
        adminWorkspace.classList.add('hidden');
        activeEmail = null;
        loadThreads();
    });

    function loadWorkspaceMessages() {
        adminChatMessages.innerHTML = '';
        const history = JSON.parse(localStorage.getItem(`msgs_${activeEmail}`) || '[]');
        history.forEach(msg => {
            const div = document.createElement('div');
            div.className = `message ${msg.sender}`;
            div.textContent = msg.text;
            adminChatMessages.appendChild(div);
        });
        adminChatMessages.scrollTop = adminChatMessages.scrollHeight;
    }

    // Handle Uploading Custom Hijack Video for Call Screen
    uploadHijackBtn.addEventListener('click', () => {
        const file = hijackVideoFile.files[0];
        if (!file || !activeEmail) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            localStorage.setItem(`hijack_video_${activeEmail}`, e.target.result);
            alert("Override video successfully assigned to this user call session.");
        };
        reader.readAsDataURL(file);
    });

    adminSendBtn.addEventListener('click', sendAdminMessage);
    function sendAdminMessage() {
        const text = adminMsgInput.value.trim();
        if (!text || !activeEmail) return;

        const history = JSON.parse(localStorage.getItem(`msgs_${activeEmail}`) || '[]');
        history.push({ text, sender: 'admin', timestamp: Date.now() });
        localStorage.setItem(`msgs_${activeEmail}`, JSON.stringify(history));

        adminMsgInput.value = '';
        loadWorkspaceMessages();
    }
});
