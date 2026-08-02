/**
 * Video Injector Reliability Guide & Helper Script
 * Ensures seamless playback on mobile web views (iOS/Android) 
 * by handling autoplay policies, codec fallbacks, and user-gesture unlocks.
 */

(function () {
    console.log("🛡️ Video Injector Reliability Guide Initialized");

    // 1. Force-unlock audio/video playback restrictions on first user interaction anywhere on the page
    const unlockAudioAndVideo = () => {
        const videos = document.querySelectorAll('video');
        videos.forEach(v => {
            v.muted = true;
            v.play().then(() => {
                v.pause();
                v.currentTime = 0;
            }).catch(() => {});
        });
        window.removeEventListener('click', unlockAudioAndVideo);
        window.removeEventListener('touchstart', unlockAudioAndVideo);
    };

    window.addEventListener('click', unlockAudioAndVideo);
    window.addEventListener('touchstart', unlockAudioAndVideo);

    // 2. Robust Wrapper to force-play injected videos under any circumstance
    window.forcePlayInjectedVideo = function (videoElement, videoSourceUrl, onFallbackTriggered) {
        if (!videoElement) return;

        videoElement.src = videoSourceUrl;
        videoElement.setAttribute('playsinline', 'true');
        videoElement.setAttribute('webkit-playsinline', 'true');
        videoElement.muted = false; // Attempt audio first

        videoElement.load();

        const playPromise = videoElement.play();

        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log("✅ Injected video playback started successfully.");
            }).catch(error => {
                console.warn("⚠️ Autoplay with sound blocked by browser policy. Falling back to muted autoplay...", error);
                
                // Fallback: Mute and play automatically if browser blocks audio
                videoElement.muted = true;
                videoElement.play().then(() => {
                    console.log("✅ Muted fallback playback active.");
                }).catch(err => {
                    console.error("❌ Critical: Video playback completely blocked.", err);
                    if (typeof onFallbackTriggered === 'function') {
                        onFallbackTriggered();
                    }
                });
            });
        }
    };
})();
