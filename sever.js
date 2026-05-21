const WebSocket = require('ws');
const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3001;
const MONGO_URI = 'mongodb+srv://zundar:zundar123@cluster0.56elvw7.mongodb.net/?retryWrites=true&w=majority';
const DB_NAME = 'sunwin';
const COLLECTION_NAME = 'history';
const MAX_HISTORY = 100;

let apiResponseData = [];
let patternHistory = [];
let db = null;
let collection = null;
let ws = null;
let pingInterval = null;
let reconnectTimeout = null;
let healthCheckInterval = null;
let lastMessageTime = Date.now();
let currentSessionId = null;
let lastDiceHash = null;
let lastEntryTime = 0;

async function connectMongoDB() {
    try {
        const client = new MongoClient(MONGO_URI, {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 15000
        });
        
        await client.connect();
        db = client.db(DB_NAME);
        collection = db.collection(COLLECTION_NAME);
        
        await collection.createIndex({ Phien: 1 }, { unique: true });
        await collection.createIndex({ timestamp: -1 });
        
        const cursor = collection.find().sort({ timestamp: -1 }).limit(MAX_HISTORY);
        patternHistory = await cursor.toArray();
        
        patternHistory.forEach(doc => delete doc._id);
        apiResponseData = patternHistory;
        
        console.log(`📂 MONGODB CONNECTED - LOADED ${patternHistory.length} RECORDS`);
        return true;
    } catch (err) {
        console.error('❌ MONGODB ERROR:', err.message);
        return false;
    }
}

async function saveToMongoDB(entry) {
    try {
        await collection.updateOne(
            { Phien: entry.Phien },
            { $setOnInsert: entry },
            { upsert: true }
        );
    } catch (err) {
        if (err.code !== 11000) {
            console.error('❌ SAVE ERROR:', err.message);
        }
    }
}

function isDuplicateEntry(d1, d2, d3, total) {
    const now = Date.now();
    const diceHash = `${d1}-${d2}-${d3}-${total}`;
    
    if (diceHash === lastDiceHash && (now - lastEntryTime) < 5000) {
        return true;
    }
    
    for (let i = 0; i < Math.min(3, patternHistory.length); i++) {
        const entry = patternHistory[i];
        if (entry.Xuc_xac_1 === d1 && 
            entry.Xuc_xac_2 === d2 && 
            entry.Xuc_xac_3 === d3 && 
            (now - new Date(entry.timestamp).getTime()) < 10000) {
            return true;
        }
    }
    
    return false;
}

async function addNewEntry(d1, d2, d3, total, result, sessionId) {
    if (isDuplicateEntry(d1, d2, d3, total)) {
        return false;
    }
    
    lastDiceHash = `${d1}-${d2}-${d3}-${total}`;
    lastEntryTime = Date.now();
    
    const newEntry = {
        Phien: sessionId,
        Xuc_xac_1: d1,
        Xuc_xac_2: d2,
        Xuc_xac_3: d3,
        Tong: total,
        Ket_qua: result,
        timestamp: new Date().toISOString()
    };
    
    patternHistory.unshift(newEntry);
    
    if (patternHistory.length > MAX_HISTORY) {
        patternHistory = patternHistory.slice(0, MAX_HISTORY);
    }
    
    apiResponseData = patternHistory;
    
    saveToMongoDB(newEntry);
    
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
    console.log('🔌 CONNECTING WEBSOCKET...');
    
    ws = new WebSocket("wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0", {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Origin": "https://play.sun.win"
        },
        handshakeTimeout: 10000,
        maxPayload: 104857600
    });

    ws.on('open', () => {
        console.log('✅ WEBSOCKET CONNECTED');
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
                
                addNewEntry(d1, d2, d3, total, result, currentSessionId);
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

app.get('/health', (req, res) => {
    res.json({
        status: 'running',
        mongodb: !!db,
        records: patternHistory.length
    });
});

async function start() {
    const mongoOk = await connectMongoDB();
    if (!mongoOk) {
        console.log('⚠️ MONGODB FAILED, RETRY IN 5s...');
        setTimeout(start, 5000);
        return;
    }
    connectWebSocket();
}

start();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVER PORT: ${PORT}`);
});
