const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const textOutput = document.getElementById('text-content');
const statusElement = document.getElementById('status');
const keyboardContainer = document.getElementById('keyboard-container');

// Sound Effects (Synthesis)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'hover') {
        osc.frequency.value = 400;
        osc.type = 'sine';
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'press') {
        osc.frequency.value = 600;
        osc.type = 'square';
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
    }
}

// Keyboard Layout
const keys = [
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
    'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P',
    'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';',
    'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '?',
    'SPACE', 'BACK'
];

// Generate Keyboard UI
keys.forEach(key => {
    const keyElement = document.createElement('div');
    keyElement.classList.add('key');
    keyElement.innerText = key === 'SPACE' ? '' : (key === 'BACK' ? '⌫' : key);
    keyElement.dataset.key = key;

    if (key === 'SPACE') keyElement.classList.add('key-space');
    if (key === 'BACK') keyElement.classList.add('key-backspace');

    keyboardContainer.appendChild(keyElement);
});

// State
let lastHoveredKey = null;
let hoverStartTime = 0;
const HOVER_THRESHOLD = 500; // ms to trigger key press by hovering
let isPinching = false;

function onResults(results) {
    // Canvas setup
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Draw Camera Feed (Force rendering on Canvas to ensure visibility)
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    // Draw Hand Landmarks
    if (results.multiHandLandmarks) {
        statusElement.innerText = "Targeting System // Locked";
        statusElement.style.color = "#00f3ff";

        for (const landmarks of results.multiHandLandmarks) {
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS,
                { color: '#00f3ff', lineWidth: 2 }); // Cyan connections
            drawLandmarks(canvasCtx, landmarks,
                { color: '#bc13fe', lineWidth: 1, radius: 3 }); // Purple joints

            // Interaction Logic
            // We'll use the Index Finger Tip (Landmark 8) for interaction
            const indexTip = landmarks[8];

            // Map Hand Coordinates (0-1) to Window logic (HUD Mode)
            // X: 0 (left) -> 1 (right) of camera frame maps to 0 -> Window Width
            // Mirror logic: 1 - x
            const x = (1 - indexTip.x) * window.innerWidth;
            const y = indexTip.y * window.innerHeight;

            // Draw Cursor for visual feedback
            drawMainCursor(x, y);

            checkCollision(x, y);
            checkClick(landmarks);
        }
    } else {
        statusElement.innerText = "Searching for Pilot...";
        statusElement.style.color = "rgba(255,255,255,0.5)";
        removeMainCursor();
    }
    canvasCtx.restore();
}

let cursorElement = null;
function drawMainCursor(x, y) {
    if (!cursorElement) {
        cursorElement = document.createElement('div');
        cursorElement.style.position = 'fixed';
        cursorElement.style.width = '20px';
        cursorElement.style.height = '20px';
        cursorElement.style.border = '2px solid #00f3ff';
        cursorElement.style.borderRadius = '50%';
        cursorElement.style.pointerEvents = 'none';
        cursorElement.style.zIndex = '9999';
        cursorElement.style.transform = 'translate(-50%, -50%)';
        cursorElement.style.boxShadow = '0 0 10px #00f3ff, inset 0 0 5px #00f3ff';
        cursorElement.style.transition = 'width 0.1s, height 0.1s, background-color 0.1s';
        document.body.appendChild(cursorElement);
    }
    cursorElement.style.left = x + 'px';
    cursorElement.style.top = y + 'px';

    // Pulse effect based on pinch state
    if (isPinching) {
        cursorElement.style.backgroundColor = '#bc13fe';
        cursorElement.style.transform = 'translate(-50%, -50%) scale(0.5)';
        cursorElement.style.boxShadow = '0 0 15px #bc13fe';
    } else {
        cursorElement.style.backgroundColor = 'transparent';
        cursorElement.style.transform = 'translate(-50%, -50%) scale(1)';
        cursorElement.style.boxShadow = '0 0 10px #00f3ff, inset 0 0 5px #00f3ff';
    }
}

function removeMainCursor() {
    if (cursorElement) {
        cursorElement.remove();
        cursorElement = null;
    }
}

function checkCollision(x, y) {
    // Simple point-in-rect collision with all keys
    const keyElements = document.querySelectorAll('.key');
    let hovered = null;

    keyElements.forEach(keyEl => {
        const rect = keyEl.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            hovered = keyEl;
        }
    });

    if (hovered) {
        if (lastHoveredKey !== hovered) {
            if (lastHoveredKey) lastHoveredKey.classList.remove('hovered');
            hovered.classList.add('hovered');
            lastHoveredKey = hovered;
            hoverStartTime = Date.now();
            playSound('hover');
        }
    } else {
        if (lastHoveredKey) {
            lastHoveredKey.classList.remove('hovered');
            lastHoveredKey = null;
        }
    }
}

function checkClick(landmarks) {
    // Pinch detection: Distance between Thumb Tip (4) and Index Tip (8)
    const thumb = landmarks[4];
    const index = landmarks[8];

    const distance = Math.sqrt(Math.pow(thumb.x - index.x, 2) + Math.pow(thumb.y - index.y, 2));

    // Threshold usually around 0.05
    if (distance < 0.05) {
        if (!isPinching && lastHoveredKey) {
            triggerKey(lastHoveredKey);
            isPinching = true;
        }
    } else {
        isPinching = false;
    }
}

// Particle System
function createParticles(rect) {
    const particlesContainer = document.createElement('div');
    particlesContainer.id = 'particles';
    document.body.appendChild(particlesContainer);

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (let i = 0; i < 15; i++) {
        const p = document.createElement('div');
        const size = Math.random() * 6 + 4;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.background = `hsl(${Math.random() * 60 + 260}, 100%, 50%)`; // Purple to Blue range
        p.style.position = 'absolute';
        p.style.left = centerX + 'px';
        p.style.top = centerY + 'px';
        p.style.borderRadius = '50%';
        p.style.pointerEvents = 'none';
        p.style.boxShadow = '0 0 10px currentColor';

        // Random velocity
        const angle = Math.random() * 2 * Math.PI;
        const velocity = Math.random() * 150 + 50;
        const tx = Math.cos(angle) * velocity;
        const ty = Math.sin(angle) * velocity;

        p.animate([
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: `translate(${tx}px, ${ty}px) scale(0)`, opacity: 0 }
        ], {
            duration: 800,
            easing: 'cubic-bezier(0, .9, .57, 1)',
        });

        particlesContainer.appendChild(p);
    }

    // Cleanup
    setTimeout(() => particlesContainer.remove(), 800);
}

function triggerKey(keyEl) {
    keyEl.classList.add('pressed');
    setTimeout(() => keyEl.classList.remove('pressed'), 200);
    playSound('press');

    createParticles(keyEl.getBoundingClientRect());

    const value = keyEl.dataset.key;
    if (value === 'BACK') {
        textOutput.innerText = textOutput.innerText.slice(0, -1);
    } else if (value === 'SPACE') {
        textOutput.innerText += ' ';
    } else {
        textOutput.innerText += value;
    }
}

// Initialize MediaPipe Hands
const hands = new Hands({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
});

hands.onResults(onResults);

// Manual Camera Setup (Replacing MediaPipe Camera Utils for reliability)
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: 640,
                height: 480,
                frameRate: { ideal: 30 }
            }
        });

        videoElement.srcObject = stream;

        videoElement.onloadedmetadata = () => {
            videoElement.play();
            statusElement.innerText = "Camera Feed Acquired...";
            requestAnimationFrame(processingLoop);
        };
    } catch (error) {
        console.error("Camera Error:", error);
        statusElement.innerText = "Error: Camera Access Denied";
        statusElement.style.color = "red";
    }
}

async function processingLoop() {
    // Only send if video has data
    if (videoElement.readyState >= 2) {
        await hands.send({ image: videoElement });
    }
    requestAnimationFrame(processingLoop);
}

// Start System
initCamera();
