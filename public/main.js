const DOM = {
    startBtn: document.getElementById('startBtn'),
    statusText: document.getElementById('statusText'),
    currentSpeed: document.getElementById('currentSpeed'),
    currentUnit: document.getElementById('currentUnit'),
    pingResult: document.getElementById('pingResult'),
    downResult: document.getElementById('downResult'),
    downUnit: document.getElementById('downUnit'),
    upResult: document.getElementById('upResult'),
    upUnit: document.getElementById('upUnit'),
    gaugeProgress: document.querySelector('.gauge-progress'),
    cards: document.querySelectorAll('.result-card')
};

// SVG arc length is approx 400
const MAX_DASH_OFFSET = 400;

// Config for 10G testing
// 10 Gbps = 10,000 Mbps. We set the gauge max to 10,000.
// But we want it to look good for lower speeds too.
// We'll dynamically scale the gauge max if speed goes over.
let gaugeMax = 1000; // Start with 1Gbps scale

function updateGauge(speedMbps) {
    if (speedMbps > gaugeMax && gaugeMax < 10000) {
        gaugeMax = 10000; // Switch to 10G scale
    }
    
    // Clamp speed
    const clamped = Math.min(Math.max(speedMbps, 0), gaugeMax);
    const percentage = clamped / gaugeMax;
    
    // Calculate offset: 400 to 0 (0 is full)
    const offset = MAX_DASH_OFFSET * (1 - percentage);
    DOM.gaugeProgress.style.strokeDashoffset = offset;

    // Format display
    if (speedMbps >= 1000) {
        DOM.currentSpeed.textContent = (speedMbps / 1000).toFixed(2);
        DOM.currentUnit.textContent = 'Gbps';
    } else {
        DOM.currentSpeed.textContent = speedMbps.toFixed(1);
        DOM.currentUnit.textContent = 'Mbps';
    }
}

function resetUI() {
    DOM.pingResult.textContent = '--';
    DOM.downResult.textContent = '--';
    DOM.downUnit.textContent = 'Mbps';
    DOM.upResult.textContent = '--';
    DOM.upUnit.textContent = 'Mbps';
    DOM.currentSpeed.textContent = '0.0';
    DOM.currentUnit.textContent = 'Mbps';
    DOM.gaugeProgress.style.strokeDashoffset = MAX_DASH_OFFSET;
    gaugeMax = 1000; // Reset scale to 1G initially
    
    DOM.cards.forEach(c => c.classList.remove('active'));
}

function updateResultCard(resultEl, unitEl, speedMbps) {
    if (speedMbps >= 1000) {
        resultEl.textContent = (speedMbps / 1000).toFixed(2);
        unitEl.textContent = 'Gbps';
    } else {
        resultEl.textContent = speedMbps.toFixed(1);
        unitEl.textContent = 'Mbps';
    }
}

async function runPingTest() {
    DOM.cards[0].classList.add('active');
    DOM.statusText.textContent = 'Testing Latency...';
    
    let totalLatency = 0;
    const pings = 5;
    
    for (let i = 0; i < pings; i++) {
        const start = performance.now();
        try {
            await fetch('/ping?_t=' + Date.now());
        } catch(e) {}
        const end = performance.now();
        totalLatency += (end - start);
    }
    
    const avgLatency = (totalLatency / pings).toFixed(1);
    DOM.pingResult.textContent = avgLatency;
    DOM.cards[0].classList.remove('active');
    
    return avgLatency;
}

async function runDownloadTest() {
    DOM.cards[1].classList.add('active');
    DOM.statusText.textContent = 'Testing Download Speed...';
    
    // For 10G, we need parallel connections to saturate the link.
    const connections = 8;
    const durationMs = 5000; // 5 seconds test
    let totalBytes = 0;
    
    const startTime = performance.now();
    let isTesting = true;

    // Display loop
    const displayInterval = setInterval(() => {
        const elapsed = (performance.now() - startTime) / 1000;
        if (elapsed > 0) {
            const speedMbps = (totalBytes * 8 / 1000000) / elapsed;
            updateGauge(speedMbps);
            updateResultCard(DOM.downResult, DOM.downUnit, speedMbps);
        }
    }, 100);

    // Stop after duration
    setTimeout(() => {
        isTesting = false;
    }, durationMs);

    // Download worker function
    async function downloadWorker() {
        while (isTesting) {
            try {
                // Request 100MB chunk
                const response = await fetch('/download?size=104857600&_t=' + Math.random());
                if (!response.body) break;
                
                const reader = response.body.getReader();
                while (isTesting) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    totalBytes += value.length;
                }
                reader.cancel();
            } catch(e) {
                if(isTesting) console.error("Download error", e);
            }
        }
    }

    // Start parallel downloads
    const workers = [];
    for (let i = 0; i < connections; i++) {
        workers.push(downloadWorker());
    }
    
    await Promise.all(workers);
    clearInterval(displayInterval);
    
    const finalElapsed = (performance.now() - startTime) / 1000;
    const finalMbps = (totalBytes * 8 / 1000000) / finalElapsed;
    
    updateResultCard(DOM.downResult, DOM.downUnit, finalMbps);
    DOM.cards[1].classList.remove('active');
    
    updateGauge(0);
    return finalMbps;
}

async function runUploadTest() {
    DOM.cards[2].classList.add('active');
    DOM.statusText.textContent = 'Testing Upload Speed...';
    
    const connections = 4;
    const durationMs = 5000; // 5 seconds
    let totalBytes = 0;
    
    // Generate a 10MB buffer for uploading with completely random incompressible data
    const chunk = new Uint8Array(10 * 1024 * 1024);
    for (let i = 0; i < chunk.length; i += 65536) {
        window.crypto.getRandomValues(chunk.subarray(i, i + Math.min(65536, chunk.length - i)));
    }

    const startTime = performance.now();
    let isTesting = true;

    // Display loop
    const displayInterval = setInterval(() => {
        const elapsed = (performance.now() - startTime) / 1000;
        if (elapsed > 0) {
            const speedMbps = (totalBytes * 8 / 1000000) / elapsed;
            updateGauge(speedMbps);
            updateResultCard(DOM.upResult, DOM.upUnit, speedMbps);
        }
    }, 100);

    setTimeout(() => {
        isTesting = false;
    }, durationMs);

    async function uploadWorker() {
        while (isTesting) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 2000); // 2s timeout per chunk just in case
                
                await fetch('/upload?_t=' + Math.random(), {
                    method: 'POST',
                    body: chunk,
                    headers: { 'Content-Type': 'application/octet-stream' },
                    signal: controller.signal
                });
                clearTimeout(timeout);
                totalBytes += chunk.length;
            } catch (e) {
                // Aborts are expected if we cancel
            }
        }
    }

    const workers = [];
    for (let i = 0; i < connections; i++) {
        workers.push(uploadWorker());
    }

    await Promise.all(workers);
    clearInterval(displayInterval);
    
    const finalElapsed = (performance.now() - startTime) / 1000;
    const finalMbps = (totalBytes * 8 / 1000000) / finalElapsed;
    
    updateResultCard(DOM.upResult, DOM.upUnit, finalMbps);
    DOM.cards[2].classList.remove('active');
    
    updateGauge(0);
    return finalMbps;
}

DOM.startBtn.addEventListener('click', async () => {
    DOM.startBtn.disabled = true;
    DOM.startBtn.textContent = 'Testing...';
    DOM.startBtn.classList.add('pulsing');
    
    resetUI();
    
    try {
        await runPingTest();
        await runDownloadTest();
        await runUploadTest();
        
        DOM.statusText.textContent = 'Test Complete';
    } catch (e) {
        console.error(e);
        DOM.statusText.textContent = 'An error occurred during testing.';
    } finally {
        DOM.startBtn.disabled = false;
        DOM.startBtn.textContent = 'Restart Test';
        DOM.startBtn.classList.remove('pulsing');
        updateGauge(0);
    }
});

// Init
updateGauge(0);
