const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

const DB_PATH = path.join(__dirname, 'data', 'db.json');

function readDB() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch {
    const defaultData = {
      numbers: [
        { id: '1', number: '+8801712345678', country: 'Bangladesh', status: 'available', assignedTo: null },
        { id: '2', number: '+8801812345678', country: 'Bangladesh', status: 'available', assignedTo: null },
        { id: '3', number: '+8801912345678', country: 'Bangladesh', status: 'available', assignedTo: null },
        { id: '4', number: '+919876543210', country: 'India', status: 'available', assignedTo: null },
        { id: '5', number: '+16501234567', country: 'USA', status: 'available', assignedTo: null },
        { id: '6', number: '+447911123456', country: 'UK', status: 'available', assignedTo: null }
      ],
      otps: [
        { id: '1', number: '+8801712345678', otp: '123456', service: 'Facebook', status: 'success', timestamp: new Date().toISOString() },
        { id: '2', number: '+8801812345678', otp: '789012', service: 'Google', status: 'pending', timestamp: new Date().toISOString() },
        { id: '3', number: '+8801912345678', otp: '345678', service: 'WhatsApp', status: 'success', timestamp: new Date(Date.now() - 600000).toISOString() }
      ],
      users: {
        balance: 107.800,
        totalEarned: 107.800,
        totalOtps: 672,
        totalNumbers: 1115
      },
      transactions: [
        { id: '1', type: 'earned', amount: 0.650, description: 'OTP Success - Facebook', timestamp: new Date().toISOString() }
      ]
    };
    if (!fs.existsSync(path.dirname(DB_PATH))) {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

app.get('/api/stats', (req, res) => {
  const db = readDB();
  const totalOtps = db.otps.length;
  const successOtps = db.otps.filter(o => o.status === 'success').length;
  res.json({
    success: true,
    today: {
      numbers: db.users.totalNumbers || 58,
      otps: totalOtps || 39,
      success: totalOtps > 0 ? Math.round((successOtps / totalOtps) * 100) + '%' : '0%'
    },
    allTime: {
      numbers: db.users.totalNumbers || 1115,
      otps: db.users.totalOtps || 672,
      success: db.users.totalOtps > 0 ? Math.round((successOtps / (db.users.totalOtps || 1)) * 100) + '%' : '0%',
      earned: db.users.totalEarned || 107.800
    },
    balance: db.users.balance || 107.800
  });
});

app.get('/api/numbers', (req, res) => {
  const db = readDB();
  res.json({ success: true, numbers: db.numbers });
});

app.post('/api/get-number', (req, res) => {
  const db = readDB();
  const available = db.numbers.find(n => n.status === 'available');
  if (!available) {
    return res.json({ success: false, message: 'No numbers available!' });
  }
  available.status = 'assigned';
  available.assignedTo = 'user_' + Date.now();
  writeDB(db);
  res.json({ success: true, number: available.number, country: available.country, id: available.id });
});

app.get('/api/otps', (req, res) => {
  const db = readDB();
  res.json({ success: true, otps: db.otps.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)) });
});

app.get('/api/success-otps', (req, res) => {
  const db = readDB();
  const successOtps = db.otps.filter(o => o.status === 'success');
  res.json({ success: true, otps: successOtps });
});

app.get('/api/live-console', (req, res) => {
  const db = readDB();
  const latest = db.otps.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10);
  res.json({ success: true, otps: latest });
});

app.get('/api/wallet', (req, res) => {
  const db = readDB();
  res.json({ success: true, balance: db.users.balance, totalEarned: db.users.totalEarned, transactions: db.transactions || [] });
});

app.post('/api/create-otp', (req, res) => {
  const { number, service } = req.body;
  const db = readDB();
  const newOtp = {
    id: uuidv4(),
    number: number || '+8801712345678',
    otp: String(Math.floor(100000 + Math.random() * 900000)),
    service: service || 'Unknown',
    status: Math.random() > 0.3 ? 'success' : 'pending',
    timestamp: new Date().toISOString()
  };
  db.otps.push(newOtp);
  if (newOtp.status === 'success') {
    const earned = 0.650;
    db.users.balance += earned;
    db.users.totalEarned += earned;
    db.users.totalOtps += 1;
    db.transactions.push({
      id: uuidv4(),
      type: 'earned',
      amount: earned,
      description: `OTP Success - ${newOtp.service}`,
      timestamp: new Date().toISOString()
    });
  }
  writeDB(db);
  res.json({ success: true, otp: newOtp });
});

app.listen(PORT, () => {
  console.log(`✅ BD UNIQUE METHOD Server running at http://localhost:${PORT}`);
});