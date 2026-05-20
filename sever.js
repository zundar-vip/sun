const WebSocket = require('ws');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT =s.env.PORT || 3001;
const HISTORY_FILE = path.join('/tmp', 'data.json');
const MAX_HISTORY = 100;

let apiResponseData = {
    "Phien": null,
    "Xuc_xac_1": null,
    "Xuc_xac_2": null,
    "Xuc_xac_3": null,
    "Tong": null,
    "Ket_qua": ""
};

let currentSessionId = null;
let patternHistory = [];
let wsConnected = false;
let lastDataTimestamp = Date.now();
let dataTimeout = null;
const DATA_TIMEOUT = 30000;

function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const data = fs.readFileSync(HISTORY_FILE, 'utf8');
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) {
                patternHistory = parsed.slice(-MAX_HISTORY);
            }
        }
    } catch (err) {
        patternHistory = [];
    }
}

function saveHistory() {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(patternHistory, null, 2), 'utf8');
    } catch (err) {}
}

function resetDataTimeout() {
    lastDataTimestamp = Date.now();
    clearTimeout(dataTimeout);
    dataTimeout = setTimeout(() => {
        if (Date.now() - lastDataTimestamp >= DATA_TIMEOUT) {
            wsConnected = false;
        }
    }, DATA_TIMEOUT);
}

function connectWebSocket() {
    const ws = new WebSocket("wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0", {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Origin": "https://play.sun.win"
        }
    });

    ws.on('open', () => {
        wsConnected = true;
        lastDataTimestamp = Date.now();
        resetDataTimeout();
        
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
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(msg));
                }
            }, i * 600);
        });

        setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.ping();
        }, 15000);
    });

    ws.on('pong', () => {
        wsConnected = true;
        lastDataTimestamp = Date.now();
        resetDataTimeout();
    });

    ws.on('message', (message) => {
        try {
            wsConnected = true;
            lastDataTimestamp = Date.now();
            resetDataTimeout();
            
            const data = JSON.parse(message);
            if (!Array.isArray(data) || typeof data[1] !== 'object') return;

            const { cmd, sid, d1, d2, d3, gBB } = data[1];

            if (cmd === 1008 && sid) currentSessionId = sid;
            
            if (cmd === 1003 && gBB && d1 && d2 && d3) {
                const total = d1 + d2 + d3;
                const result = total > 10 ? "Tài" : "Xỉu";

                apiResponseData = {
                    "Phien": currentSessionId,
                    "Xuc_xac_1": d1,
                    "Xuc_xac_2": d2,
                    "Xuc_xac_3": d3,
                    "Tong": total,
                    "Ket_qua": result
                };
                
                patternHistory.push({
                    session: currentSessionId,
                    dice: [d1, d2, d3],
                    total: total,
                    result: result,
                    timestamp: new Date().toISOString()
                });
                
                if (patternHistory.length > MAX_HISTORY) {
                    patternHistory = patternHistory.slice(-MAX_HISTORY);
                }
                
                saveHistory();
                currentSessionId = null;
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        wsConnected = false;
        clearTimeout(dataTimeout);
        setTimeout(connectWebSocket, 2500);
    });

    ws.on('error', () => {
        wsConnected = false;
        ws.close();
    });
}

app.get('/api/sungoc', (req, res) => {
    res.json(apiResponseData);
});

loadHistory();
connectWebSocket();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
