const WebSocket = require('ws');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const HISTORY_FILE = path.join('/tmp', 'data.json');
const MAX_HISTORY = 100;

let apiResponseData = [];
let currentSessionId = null;
let patternHistory = [];
let wsConnected = false;
let ws = null;
let pingInterval = null;
let reconnectTimeout = null;
let initTimeout = null;
let connectionCount = 0;

function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const data = fs.readFileSync(HISTORY_FILE, 'utf8');
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) {
                patternHistory = parsed.slice(-MAX_HISTORY).reverse();
                apiResponseData = patternHistory;
            }
        }
    } catch (err) {
        patternHistory = [];
        apiResponseData = [];
    }
}

function saveHistory() {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(patternHistory.slice().reverse(), null, 2), 'utf8');
    } catch (err) {}
}

function clearAllTimers() {
    clearInterval(pingInterval);
    clearTimeout(reconnectTimeout);
    clearTimeout(initTimeout);
}

function connectWebSocket() {
    clearAllTimers();
    
    if (ws) {
        try {
            ws.removeAllListeners();
            ws.terminate();
        } catch(e) {}
    }
    
    connectionCount++;
    console.log(`[${connectionCount}] Connecting to Sun.Win...`);
    
    ws = new WebSocket("wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0", {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Origin": "https://play.sun.win"
        }
    });

    ws.on('open', () => {
        console.log(`[${connectionCount}] Connected!`);
        wsConnected = true;
        
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
                    console.log(`[${connectionCount}] Sent init msg ${i+1}`);
                }
            }, i * 1000);
        });

        pingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.ping();
                console.log(`[${connectionCount}] Ping sent`);
            }
        }, 30000);
    });

    ws.on('pong', () => {
        wsConnected = true;
        console.log(`[${connectionCount}] Pong received`);
    });

    ws.on('message', (message) => {
        try {
            wsConnected = true;
            
            const data = JSON.parse(message);
            if (!Array.isArray(data) || typeof data[1] !== 'object') return;

            const { cmd, sid, d1, d2, d3, gBB } = data[1];

            if (cmd === 1008 && sid) {
                currentSessionId = sid;
                console.log(`[${connectionCount}] Session: ${sid}`);
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
                
                patternHistory.unshift(newEntry);
                
                if (patternHistory.length > MAX_HISTORY) {
                    patternHistory = patternHistory.slice(0, MAX_HISTORY);
                }
                
                apiResponseData = patternHistory;
                saveHistory();
                console.log(`[${connectionCount}] ${d1}-${d2}-${d3} = ${total} (${result}) | Total: ${patternHistory.length}`);
                currentSessionId = null;
            }
        } catch (e) {
            console.error(`[${connectionCount}] Parse error:`, e.message);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`[${connectionCount}] Closed: ${code} - ${reason}`);
        wsConnected = false;
        clearAllTimers();
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
    });

    ws.on('error', (err) => {
        console.error(`[${connectionCount}] Error:`, err.message);
        wsConnected = false;
    });
}

app.get('/sun', (req, res) => {
    res.json(apiResponseData);
});

loadHistory();
connectWebSocket();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} | Loaded ${patternHistory.length} records`);
});
