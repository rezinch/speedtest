const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Pre-allocate a 50MB buffer of random data to avoid CPU overhead during generation
const CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB
const randomDataChunk = Buffer.alloc(CHUNK_SIZE);
for (let i = 0; i < CHUNK_SIZE; i += 4096) {
    randomDataChunk.writeUInt32LE(Math.random() * 0xFFFFFFFF >>> 0, i);
}

// Download endpoint
app.get('/download', (req, res) => {
    // Default to downloading 100MB if not specified
    const size = parseInt(req.query.size, 10) || 100 * 1024 * 1024; 
    let bytesSent = 0;

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', size.toString());
    // Cache control to ensure real network test
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Streaming function
    function write() {
        let ok = true;
        while (bytesSent < size && ok) {
            const bytesLeft = size - bytesSent;
            const bytesToWrite = Math.min(bytesLeft, CHUNK_SIZE);
            const chunk = bytesToWrite === CHUNK_SIZE ? randomDataChunk : randomDataChunk.slice(0, bytesToWrite);
            
            bytesSent += bytesToWrite;
            ok = res.write(chunk);
        }
        if (bytesSent < size) {
            // Wait for it to drain then write some more
            res.once('drain', write);
        } else {
            res.end();
        }
    }

    write();
});

// Upload endpoint
app.post('/upload', (req, res) => {
    // We don't parse the body, we just drain the stream and count bytes
    let bytesReceived = 0;

    req.on('data', (chunk) => {
        bytesReceived += chunk.length;
    });

    req.on('end', () => {
        res.status(200).json({ success: true, bytesReceived });
    });

    req.on('error', (err) => {
        console.error('Upload stream error:', err);
        res.status(500).send('Error');
    });
});

// Ping endpoint
app.get('/ping', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).send('pong');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Speed Test Server running on http://0.0.0.0:${PORT}`);
    console.log(`Accessible on localhost and your local LAN IP.`);
});
