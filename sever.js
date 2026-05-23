const WebSocket = require('ws');
const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3001;
const MONGO_URI = 'mongodb+srv://zundar:zundar123@cluster0.56elvw7.mongodb.net/?retryWrites=true&w=majority';
const DB_NAME = 'sunwin';
const COLLECTION_NAME = 'history';
const MAX_SESSIONS = 100;
const WS_COUNT = 100;

let recentSessions = [];
let db = null;
let collection = null;
const connections = new Map();

async function connectMongoDB() {
    try {
        const client = new MongoClient(MONGO_URI);
        await client.connect();
        db = client.db(DB_NAME);
        collection = db.collection(COLLECTION_NAME);
        await collection.createIndex({ Phien: -1 }, { unique: true });
        
        const cursor = collection.find().sort({ Phien: -1 }).limit(MAX_SESSIONS);
        recentSessions = await cursor.toArray();
        recentSessions.forEach(doc => delete doc._id);
        
        console.log(`📂 LOADED ${recentSessions.length} FROM MONGODB`);
        return true;
    } catch (err) {
        console.error('❌ MONGODB ERROR:', err.message);
        return false;
    }
}

async function refreshFromDB() {
    if (!collection) return;
    try {
        const cursor = collection.find().sort({ Phien: -1 }).limit(MAX_SESSIONS);
        recentSessions = await cursor.toArray();
        recentSessions.forEach(doc => delete doc._id);
    } catch (err) {}
}

async function addSession(sessionId, d1, d2, d3, total, result) {
    if (!sessionId || !collection) return;
    
    try {
        await collection.insertOne({
            Phien: sessionId,
            Xuc_xac_1: d1,
            Xuc_xac_2: d2,
            Xuc_xac_3: d3,
            Tong: total,
            Ket_qua: result,
            timestamp: new Date().toISOString()
        });
        
        const exists = recentSessions.find(s => s.Phien === sessionId);
        if (!exists) {
            recentSessions.unshift({
                Phien: sessionId,
                Xuc_xac_1: d1,
                Xuc_xac_2: d2,
                Xuc_xac_3: d3,
                Tong: total,
                Ket_qua: result
            });
            
            recentSessions.sort((a, b) => b.Phien - a.Phien);
            
            if (recentSessions.length > MAX_SESSIONS) {
                recentSessions = recentSessions.slice(0, MAX_SESSIONS);
            }
            
            console.log(`✅ PHIÊN ${sessionId}: ${d1}-${d2}-${d3} = ${total} (${result}) | Total: ${recentSessions.length}`);
        }
    } catch (err) {
        if (err.code === 11000) return;
        console.error('❌ INSERT ERROR:', err.message);
    }
}

function createWebSocket(id) {
    let ws = null;
    let keepAliveInterval = null;
    let reconnectTimeout = null;
    let initTimeout = null;
    let currentSessionId = null;

    function clearAllTimers() {
        clearInterval(keepAliveInterval);
        clearTimeout(reconnectTimeout);
        clearTimeout(initTimeout);
    }

    function connect() {
        clearAllTimers();
        if (ws) {
            try { ws.removeAllListeners(); ws.terminate(); } catch(e) {}
        }

        ws = new WebSocket("wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Origin": "https://play.sun.win"
            }
        });

        ws.on('open', () => {
            connections.set(id, { ws, alive: true });
            
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
                    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
                }, i * 200);
            });

            keepAliveInterval = setInterval(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.ping();
                    ws.send(JSON.stringify([6, "MiniGame", "taixiuPlugin", { cmd: 1005 }]));
                }
            }, 3000 + Math.random() * 2000);
        });

        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);
                if (!Array.isArray(data) || typeof data[1] !== 'object') return;
                const { cmd, sid, d1, d2, d3, gBB } = data[1];
                if (cmd === 1008 && sid) currentSessionId = sid;
                if (cmd === 1003 && gBB && d1 !== undefined && d2 !== undefined && d3 !== undefined) {
                    const total = d1 + d2 + d3;
                    const result = total >= 11 ? "Tài" : "Xỉu";
                    await addSession(currentSessionId || sid, d1, d2, d3, total, result);
                }
            } catch (e) {}
        });

        ws.on('close', () => {
            connections.delete(id);
            clearAllTimers();
            reconnectTimeout = setTimeout(() => connect(), 500 + Math.random() * 1000);
        });

        ws.on('error', () => connections.delete(id));
    }

    connect();
}

app.get('/sun', async (req, res) => {
    await refreshFromDB();
    res.json(recentSessions);
});

app.get('/health', (req, res) => res.json({
    status: 'running',
    mongodb: !!db,
    ws_connections: connections.size,
    sessions: recentSessions.length
}));

async function start() {
    const mongoOk = await connectMongoDB();
    if (!mongoOk) {
        setTimeout(start, 5000);
        return;
    }
    
    for (let i = 0; i < WS_COUNT; i++) {
        setTimeout(() => createWebSocket(i), i * 1500);
    }
    
    setInterval(refreshFromDB, 10000);
}

start();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 ${WS_COUNT} WS | MONGODB | MAX: ${MAX_SESSIONS} | API: /sun | PORT: ${PORT}`);
});
