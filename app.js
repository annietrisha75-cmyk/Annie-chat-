document.addEventListener('DOMContentLoaded', () => {
    const authScreen = document.getElementById('auth-screen');
    const appScreen = document.getElementById('app-screen');
    const authForm = document.getElementById('auth-form');
    const userEmailInput = document.getElementById('user-email');
    const chatContainer = document.getElementById('chat-container');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const videoCallBtn = document.getElementById('video-call-btn');
    const videoModal = document.getElementById('video-modal');
    const endCallBtn = document.getElementById('end-call-btn');
    const remoteVideo = document.getElementById('remote-video');

    let currentEmail = localStorage.getItem('user_email');

    // Auto-resize text input height dynamically on line expansion
    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    if (currentEmail) {
        initializeSession(currentEmail);
    }

    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = userEmailInput.value.trim();
        if (email) {
            localStorage.setItem('user_email', email);
            initializeSession(email);
        }
    });

    function initializeSession(email) {
        currentEmail = email;
        authScreen.classList.remove('active');
        appScreen.classList.add('active');
        loadLocalMessages();
    }

    function loadLocalMessages() {
        chatContainer.innerHTML = '';
        const history = JSON.parse(localStorage.getItem(`msgs_${currentEmail}`) || '[]');
        history.forEach(msg => appendMessageUI(msg.text, msg.sender));
    }

    function saveMessage(text, sender) {
        const history = JSON.parse(localStorage.getItem(`msgs_${currentEmail}`) || '[]');
        history.push({ text, sender, timestamp: Date.now() });
        localStorage.setItem(`msgs_${currentEmail}`, JSON.stringify(history));
    }

    function appendMessageUI(text, sender) {
        const div = document.createElement('div');
        div.className = `message ${sender}`;
        div.textContent = text;
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    function sendMessage() {
        const text = messageInput.value.trim();
        if (!text) return;
        
        appendMessageUI(text, 'user');
        saveMessage(text, 'user');
        
        // Sync to shared storage ledger for admin visibility
        updateAdminThreads(currentEmail, text);
        
        messageInput.value = '';
        messageInput.style.height = 'auto';
    }

    function updateAdminThreads(email, lastMsg) {
        const threads = JSON.parse(localStorage.getItem('admin_threads') || '{}');
        threads[email] = { lastMessage: lastMsg, timestamp: Date.now() };
        localStorage.setItem('admin_threads', JSON.stringify(threads));
    }

    // Video Call Trigger with Admin Hijack File Support
    videoCallBtn.addEventListener('click', () => {
        videoModal.classList.remove('hidden');
        
        // Check if admin has configured a custom override video for this session
        const hijackVideoUrl = localStorage.getItem(`hijack_video_${currentEmail}`);
        
        if (hijackVideoUrl) {
            remoteVideo.src = hijackVideoUrl;
            remoteVideo.loop = true;
            remoteVideo.play().catch(err => console.log("Autoplay restricted:", err));
        } else {
            // Default placeholder stream if admin didn't upload a loop file
            remoteVideo.srcObject = null;
            remoteVideo.poster = "";
        }
    });

    endCallBtn.addEventListener('click', () => {
        videoModal.classList.add('hidden');
        remoteVideo.pause();
        remoteVideo.src = "";
    });
});
