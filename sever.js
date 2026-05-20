const WebSocket = require('ws');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = '/data';
const HISTORY_FILE = path.join(DATA_DIR, 'data.json');
const MAX_HISTORY = 100;

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

let apiResponseData = [];
let patternHistory = [];
const activeConnections = new Map();
const processedSessions = new Set();
let connIdCounter = 0;
const WS_COUNT = 5;

function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const data = fs.readFileSync(HISTORY_FILE, 'utf8');
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) {
                patternHistory = parsed.slice(-MAX_HISTORY).reverse();
                apiResponseData = patternHistory;
                patternHistory.forEach(entry => {
                    if (entry.Phien) processedSessions.add(entry.Phien);
                });
                console.log(`📂 LOADED ${patternHistory.length} RECORDS FROM DISK`);
            }
        } else {
            console.log('📂 NO EXISTING DATA, STARTING FRESH');
        }
    } catch (err) {
        console.error('❌ LOAD ERROR:', err.message);
        patternHistory = [];
        apiResponseData = [];
    }
}

function saveHistory() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        const toSave = patternHistory.slice(0, MAX_HISTORY).reverse();
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(toSave, null, 2), 'utf8');
    } catch (err) {
        console.error('❌ SAVE ERROR:', err.message);
    }
}

function addNewEntry(entry) {
    if (processedSessions.has(entry.Phien)) {
        return false;
    }
    
    processedSessions.add(entry.Phien);
    patternHistory.unshift(entry);
    
    if (patternHistory.length > MAX_HISTORY) {
        const removed = patternHistory.pop();
        if (removed && removed.Phien) {
            processedSessions.delete(removed.Phien);
        }
    }
    
    if (processedSessions.size > MAX_HISTORY * 2) {
        const entries = [...processedSessions].slice(-MAX_HISTORY);
        processedSessions.clear();
        entries.forEach(e => processedSessions.add(e));
    }
    
    apiResponseData = patternHistory;
    saveHistory();
    console.log(`✅ PHIÊN ${entry.Phien}: ${entry.Xuc_xac_1}-${entry.Xuc_xac_2}-${entry.Xuc_xac_3} = ${entry.Tong} (${entry.Ket_qua}) | TOTAL: ${patternHistory.length}`);
    return true;
}

function createConnection(index) {
    const connId = ++connIdCounter;
    let ws = null;
    let pingInterval = null;
    let reconnectTimeout = null;
    let initTimeout = null;
    let healthCheckInterval = null;
    let lastMessageTime = Date.now();
    let currentSessionId = null;
    let isActive = true;

    function clearAllTimers() {
        clearInterval(pingInterval);
        clearTimeout(reconnectTimeout);
        clearTimeout(initTimeout);
        clearInterval(healthCheckInterval);
    }

    function forceReconnect(reason) {
        console.log(`[WS#${index}] FORCE RECONNECT: ${reason}`);
        clearAllTimers();
        if (ws) {
            try {
                ws.removeAllListeners();
                ws.terminate();
            } catch(e) {}
        }
        activeConnections.delete(connId);
        isActive = false;
        const delay = 300 + Math.random() * 2000;
        setTimeout(() => createConnection(index), delay);
    }

    function connect() {
        clearAllTimers();
        
        if (ws) {
            try {
                ws.removeAllListeners();
                ws.terminate();
            } catch(e) {}
        }

        lastMessageTime = Date.now();
        
        ws = new WebSocket("wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Origin": "https://play.sun.win"
            },
            handshakeTimeout: 10000,
            maxPayload: 104857600,
            skipUTF8Validation: true
        });

        ws.on('open', () => {
            console.log(`[WS#${index}] CONNECTED`);
            activeConnections.set(connId, { ws, lastMessageTime, index });
            lastMessageTime = Date.now();
            
            const initMsgs = [
                [1, "MiniGame", "GM_apivopnhaan", "WangLin", {
                    "info": "{\"ipAddress\":\"113.185.45.88\",\"wsToken\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJwbGFtYW1hIiwiYm90IjowLCJpc01lcmNoYW50IjpmYWxzZSwidmVyaWZpZWRCYW5rQWNjb3VudCI6ZmFsc2UsInBsYXlFdmVudExvYmJ5IjpmYWxzZSwiY3VzdG9tZXJJZCI6MzMxNDgxMTYyLCJhZmZJZCI6IkdFTVdJTiIsImJhbm5lZCI6ZmFsc2UsImJyYW5kIjoiZ2VtIiwidGltZXN0YW1wIjoxNzY2NDc0NzgwMDA2LCJsb2NrR2FtZXMiOltdLCJhbW91bnQiOjAsImxvY2tDaGF0IjpmYWxzZSwicGhvbmVWZXJpZmllZCI6ZmFsc2UsImlwQWRkcmVzcyI6IjExMy4xODUuNDUuODgiLCJtdXRlIjpmYWxzZSwiYXZhdGFyIjoiaHR0cHM6Ly9pbWFnZXMuc3dpbnNob3AubmV0L2ltYWdlcy9hdmF0YXIvYXZhdGFyXzE4LnBuZyIsInBsYXRmb3JtSWQiOjUsInVzZXJJZCI6IjZhOGI0ZDM4LTFlYzEtNDUxYi1hYTA1LWYyZDkwYWFhNGM1MCIsInJlZ1RpbWUiOjE3NjY0NzQ3NTEzOTEsInBob25lIjoiIiwiZGVwb3NpdCI6ZmFsc2UsInVzZXJuYW1lIjoiR01fYXBpdm9wbmhhYW4ifQ.YFOscbeojWNlRo7490BtlzkDGYmwVpnlgOoh04oCJy4\",\"locale\":\"vi\",\"userId\":\"6a8b4d38-1ec1-451b-aa05-f2d90aaa4c50\",\"username\":\"GM_apivopnhaan\",\"timestamp\":1766474780007,\"refreshToken\":\"63d5c9be0c494b74b53ba150d69039fd.7592f06d63974473b4aaa1ea849b2940\"}",
                    "signature": "66772A1641AA8B18BD99207CE448EA00ECA6D8A4D457C1FF13AB092C22C8DECF0C0014971639A0FBA9984701A91FCCBE3056ABC1BE1541D1C198AA18AF3C45595AF6601F8B048947ADF8F48A9E3E074162F9BA3E6C0F7543D38BD54FD4C0A2C56D19716CC5353BBC73D12C3A92F78C833F4EFFDC4AB99E55C77AD2CDFA91E296"
                }],
                [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
                [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]
            ];
            
            initMsgs.forEach((msg, i) => {
                initTimeout = setTimeout(() => {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify(msg));
                    }
                }, i * 400 + Math.random() * 400);
            });

            pingInterval = setInterval(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.ping();
                }
            }, 8000 + Math.random() * 4000);

            healthCheckInterval = setInterval(() => {
                const now = Date.now();
                const timeSinceLastMsg = now - lastMessageTime;
                
                if (timeSinceLastMsg > 35000) {
                    forceReconnect(`NO DATA ${Math.floor(timeSinceLastMsg/1000)}s`);
                }
                
                if (!ws || ws.readyState !== WebSocket.OPEN) {
                    forceReconnect('SOCKET NOT OPEN');
                }
            }, 6000);
        });

        ws.on('pong', () => {
            lastMessageTime = Date.now();
            activeConnections.set(connId, { ws, lastMessageTime, index });
        });

        ws.on('message', (message) => {
            try {
                lastMessageTime = Date.now();
                activeConnections.set(connId, { ws, lastMessageTime, index });
                
                const data = JSON.parse(message);
                if (!Array.isArray(data) || typeof data[1] !== 'object') return;

                const { cmd, sid, d1, d2, d3, gBB } = data[1];

                if (cmd === 1008 && sid) {
                    currentSessionId = sid;
                    console.log(`[WS#${index}] SESSION: ${sid}`);
                }
                
                if (cmd === 1003 && gBB && d1 && d2 && d3) {
                    const total = d1 + d2 + d3;
                    const result = total > 10 ? "Tài" : "Xỉu";

                    const newEntry = {
                        "Phien": currentSessionId,
                        "Xuc_xac_1": d1,
                        "Xuc_xac_2": d2,
                        "Xuc_xac_3": d3,
                        "Tong": total,
                        "Ket_qua": result,
                        "timestamp": new Date().toISOString()
                    };
                    
                    if (addNewEntry(newEntry)) {
                        console.log(`✅ [WS#${index}] PHIÊN ${currentSessionId} ADDED!`);
                    } else {
                        console.log(`⏭️ [WS#${index}] PHIÊN ${currentSessionId} DUPLICATE`);
                    }
                    
                    currentSessionId = null;
                }
            } catch (e) {
                console.error(`[WS#${index}] PARSE ERROR:`, e.message);
            }
        });

        ws.on('close', (code, reason) => {
            console.log(`[WS#${index}] CLOSED: ${code} - ${reason}`);
            activeConnections.delete(connId);
            clearAllTimers();
            const delay = 200 + Math.random() * 800;
            reconnectTimeout = setTimeout(() => {
                if (isActive) connect();
            }, delay);
        });

        ws.on('error', (err) => {
            console.error(`[WS#${index}] ERROR: ${err.message}`);
            activeConnections.delete(connId);
        });
    }

    connect();
    return connId;
}

app.get('/sun', (req, res) => {
    res.json(apiResponseData);
});

app.get('/health', (req, res) => {
    const activeCount = activeConnections.size;
    res.json({
        status: 'running',
        ws_connections: activeCount,
        total_records: patternHistory.length,
        last_record: patternHistory[0] || null
    });
});

loadHistory();

for (let i = 0; i < WS_COUNT; i++) {
    setTimeout(() => {
        createConnection(i);
        console.log(`🚀 STARTED WS#${i}`);
    }, i * 1200);
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVER PORT: ${PORT} | ${WS_COUNT} CONNECTIONS | DATA: ${patternHistory.length}`);
});
