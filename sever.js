const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3001;

const WEBSOCKET_URL = "wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0";
const WS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Origin": "https://play.sun.win"
};

const initialMessages = [
    [1, "MiniGame", "GM_apivopnhaan", "WangLin", {
        "info": "{\"ipAddress\":\"113.185.45.88\",\"wsToken\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJwbGFtYW1hIiwiYm90IjowLCJpc01lcmNoYW50IjpmYWxzZSwidmVyaWZpZWRCYW5rQWNjb3VudCI6ZmFsc2UsInBsYXlFdmVudExvYmJ5IjpmYWxzZSwiY3VzdG9tZXJJZCI6MzMxNDgxMTYyLCJhZmZJZCI6IkdFTVdJTiIsImJhbm5lZCI6ZmFsc2UsImJyYW5kIjoiZ2VtIiwidGltZXN0YW1wIjoxNzY2NDc0NzgwMDA2LCJsb2NrR2FtZXMiOltdLCJhbW91bnQiOjAsImxvY2tDaGF0IjpmYWxzZSwicGhvbmVWZXJpZmllZCI6ZmFsc2UsImlwQWRkcmVzcyI6IjExMy4xODUuNDUuODgiLCJtdXRlIjpmYWxzZSwiYXZhdGFyIjoiaHR0cHM6Ly9pbWFnZXMuc3dpbnNob3AubmV0L2ltYWdlcy9hdmF0YXIvYXZhdGFyXzE4LnBuZyIsInBsYXRmb3JtSWQiOjUsInVzZXJJZCI6IjZhOGI0ZDM4LTFlYzEtNDUxYi1hYTA1LWYyZDkwYWFhNGM1MCIsInJlZ1RpbWUiOjE3NjY0NzQ3NTEzOTEsInBob25lIjoiIiwiZGVwb3NpdCI6ZmFsc2UsInVzZXJuYW1lIjoiR01fYXBpdm9wbmhhYW4ifQ.YFOscbeojWNlRo7490BtlzkDGYmwVpnlgOoh04oCJy4\",\"locale\":\"vi\",\"userId\":\"6a8b4d38-1ec1-451b-aa05-f2d90aaa4c50\",\"username\":\"GM_apivopnhaan\",\"timestamp\":1766474780007,\"refreshToken\":\"63d5c9be0c494b74b53ba150d69039fd.7592f06d63974473b4aaa1ea849b2940\"}",
        "signature": "66772A1641AA8B18BD99207CE448EA00ECA6D8A4D457C1FF13AB092C22C8DECF0C0014971639A0FBA9984701A91FCCBE3056ABC1BE1541D1C198AA18AF3C45595AF6601F8B048947ADF8F48A9E3E074162F9BA3E6C0F7543D38BD54FD4C0A2C56D19716CC5353BBC73D12C3A92F78C833F4EFFDC4AB99E55C77AD2CDFA91E296"
    }],
    [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
    [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]
];

let allSessions = [];
let recentSessions = [];
const MAX_DISPLAY = 10;
const MAX_STORE = 100;
const WS_COUNT = 10;
let nextPrediction = "Tài";
let lastSessionId = 0;

function detectPattern(history) {
    const arr = history.map(s => s.Ket_qua === "Tài" ? "T" : "X");
    if (arr.length < 2) return nextPrediction;

    const n = arr.length;

    if (n >= 3) {
        let bệtLen = 1;
        for (let i = 1; i < n && i < 6; i++) {
            if (arr[i] === arr[0]) bệtLen++;
            else break;
        }
        if (bệtLen >= 3) return arr[0] === "T" ? "Tài" : "Xỉu";
    }

    if (n >= 4) {
        if (arr[0] === arr[2] && arr[1] === arr[3] && arr[0] !== arr[1]) {
            return arr[1] === "T" ? "Tài" : "Xỉu";
        }
    }

    if (n >= 3) {
        if (arr[0] !== arr[1] && arr[1] !== arr[2] && arr[0] === arr[2]) {
            return arr[0] === "T" ? "Xỉu" : "Tài";
        }
    }

    if (n >= 6) {
        const s = arr.slice(0, 6);
        if (s.join("") === "TTXXTT") return "Xỉu";
        if (s.join("") === "XXTTXX") return "Tài";
    }

    if (n >= 4) {
        const s = arr.slice(0, 4);
        if (s.join("") === "TTTT") return "Tài";
        if (s.join("") === "XXXX") return "Xỉu";
    }

    let countT = 0, countX = 0;
    for (let i = 0; i < Math.min(n, 5); i++) {
        if (arr[i] === "T") countT++;
        else countX++;
    }
    return countT > countX ? "Tài" : "Xỉu";
}

function addSession(sessionId, d1, d2, d3, total, result) {
    if (!sessionId) return;
    if (allSessions.find(s => s.Phien === sessionId)) return;
    if (sessionId <= lastSessionId) return;

    lastSessionId = sessionId;

    const entry = {
        Phien: sessionId,
        Xuc_xac_1: d1,
        Xuc_xac_2: d2,
        Xuc_xac_3: d3,
        Tong: total,
        Ket_qua: result,
        Du_doan: nextPrediction
    };

    allSessions.unshift(entry);
    if (allSessions.length > MAX_STORE) allSessions = allSessions.slice(0, MAX_STORE);

    recentSessions = allSessions.slice(0, MAX_DISPLAY);

    nextPrediction = detectPattern(allSessions);
}

function createWS(id) {
    let ws = null;
    let keepAlive = null;
    let reconnect = null;
    let localSid = null;

    function connect() {
        clearInterval(keepAlive);
        clearTimeout(reconnect);
        if (ws) { try { ws.terminate(); } catch(e) {} }

        ws = new WebSocket(WEBSOCKET_URL, { headers: WS_HEADERS });

        ws.on('open', () => {
            initialMessages.forEach((m, i) => {
                setTimeout(() => {
                    if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
                }, i * 200);
            });

            keepAlive = setInterval(() => {
                if (ws && ws.readyState === 1) {
                    ws.ping();
                    ws.send(JSON.stringify([6, "MiniGame", "taixiuPlugin", { cmd: 1005 }]));
                }
            }, 2000);
        });

        ws.on('message', (msg) => {
            try {
                const d = JSON.parse(msg);
                if (!Array.isArray(d) || typeof d[1] !== 'object') return;
                const { cmd, sid, d1, d2, d3, gBB } = d[1];
                if (cmd === 1008 && sid) localSid = sid;
                if (cmd === 1003 && gBB && d1 !== undefined && d2 !== undefined && d3 !== undefined) {
                    const total = d1 + d2 + d3;
                    const result = total >= 11 ? "Tài" : "Xỉu";
                    addSession(localSid, d1, d2, d3, total, result);
                }
            } catch(e) {}
        });

        ws.on('close', () => {
            clearInterval(keepAlive);
            reconnect = setTimeout(connect, 500);
        });

        ws.on('error', () => ws.close());
    }
    connect();
}

app.get('/sun', (req, res) => res.json(recentSessions));

for (let i = 0; i < WS_COUNT; i++) {
    setTimeout(() => createWS(i), i * 1000);
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 ${WS_COUNT} WS | 10 PHIÊN + DỰ ĐOÁN | PORT: ${PORT}`);
});
