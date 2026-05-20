const WebSocket = require('ws');
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
let ws = null;
let pingInterval = null;
let reconnectTimeout = null;
let healthCheckInterval = null;
let lastMessageTime = Date.now();
let currentSessionId = null;
let lastDiceHash = null;
let lastEntryTime = 0;

function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const data = fs.readFileSync(HISTORY_FILE, 'utf8');
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) {
                patternHistory = parsed.slice(-MAX_HISTORY).reverse();
                apiResponseData = patternHistory;
                console.log(`📂 LOADED ${patternHistory.length} RECORDS`);
            }
        }
    } catch (err) {
        patternHistory = [];
        apiResponseData = [];
    }
}

function saveHistory() {
    try {
        const toSave = patternHistory.slice(0, MAX_HISTORY).reverse();
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(toSave, null, 2), 'utf8');
    } catch (err) {}
}

function isDuplicateEntry(d1, d2, d3, total, sessionId) {
    const now = Date.now();
    const diceHash = `${d1}-${d2}-${d3}-${total}`;
    
    if (diceHash === lastDiceHash && (now - lastEntryTime) < 5000) {
        return true;
    }
    
    const recentEntries = patternHistory.slice(0, 3);
    for (const entry of recentEntries) {
        if (entry.Xuc_xac_1 === d1 && 
            entry.Xuc_xac_2 === d2 && 
            entry.Xuc_xac_3 === d3 && 
            (now - new Date(entry.timestamp).getTime()) < 10000) {
            return true;
        }
    }
    
    return false;
}

function addNewEntry(d1, d2, d3, total, result, sessionId) {
    if (isDuplicateEntry(d1, d2, d3, total, sessionId)) {
        return false;
    }
    
    lastDiceHash = `${d1}-${d2}-${d3}-${total}`;
    lastEntryTime = Date.now();
    
    const newEntry = {
        "Phien": sessionId,
        "Xuc_xac_1": d1,
        "Xuc_xac_2": d2,
        "Xuc_xac_3": d3,
        "Tong": total,
        "Ket_qua": result,
        "timestamp": new Date().toISOString()
    };
    
    patternHistory.unshift(newEntry);
    
    if (patternHistory.length > MAX_HISTORY) {
        patternHistory = patternHistory.slice(0, MAX_HISTORY);
    }
    
    apiResponseData = patternHistory;
    saveHistory();
    console.log(`✅ PHIÊN ${sessionId}: ${d1}-${d2}-${d3} = ${total} (${result}) | TOTAL: ${patternHistory.length}`);
    return true;
}

function connectWebSocket() {
    if (ws) {
        try {
            ws.removeAllListeners();
            ws.terminate();
        } catch(e) {}
    }
    
    clearInterval(pingInterval);
    clearTimeout(reconnectTimeout);
    clearInterval(healthCheckInterval);
    
    lastMessageTime = Date.now();
    console.log('🔌 CONNECTING...');
    
    ws = new WebSocket("wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0", {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Origin": "https://play.sun.win"
        },
        handshakeTimeout: 10000,
        maxPayload: 104857600
    });

    ws.on('open', () => {
        console.log('✅ CONNECTED');
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
            setTimeout(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(msg));
                }
            }, i * 500);
        });

        pingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.ping();
            }
        }, 10000);

        healthCheckInterval = setInterval(() => {
            const now = Date.now();
            const timeSinceLastMsg = now - lastMessageTime;
            
            if (timeSinceLastMsg > 40000) {
                console.log(`⚠️ NO DATA ${Math.floor(timeSinceLastMsg/1000)}s - RECONNECTING...`);
                connectWebSocket();
            }
        }, 5000);
    });

    ws.on('pong', () => {
        lastMessageTime = Date.now();
    });

    ws.on('message', (message) => {
        try {
            lastMessageTime = Date.now();
            
            const data = JSON.parse(message);
            if (!Array.isArray(data) || typeof data[1] !== 'object') return;

            const { cmd, sid, d1, d2, d3, gBB } = data[1];

            if (cmd === 1008 && sid) {
                currentSessionId = sid;
                console.log(`🎮 SESSION: ${sid}`);
            }
            
            if (cmd === 1003 && gBB && d1 !== undefined && d2 !== undefined && d3 !== undefined) {
                const total = d1 + d2 + d3;
                const result = total >= 11 ? "Tài" : "Xỉu";
                
                if (addNewEntry(d1, d2, d3, total, result, currentSessionId)) {
                    console.log(`🎲 ${d1}-${d2}-${d3} = ${total} (${result})`);
                }
            }
        } catch (e) {}
    });

    ws.on('close', (code) => {
        console.log(`🔌 CLOSED: ${code}`);
        clearInterval(pingInterval);
        clearInterval(healthCheckInterval);
        reconnectTimeout = setTimeout(connectWebSocket, 1000);
    });

    ws.on('error', (err) => {
        console.error(`❌ ERROR: ${err.message}`);
    });
}

app.get('/sun', (req, res) => {
    res.json(apiResponseData);
});

loadHistory();
connectWebSocket();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVER PORT: ${PORT} | DATA: ${patternHistory.length}`);
});
