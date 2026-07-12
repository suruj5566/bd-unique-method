const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// ================================================================
//  টেলিগ্রাম বট টোকেন
// ================================================================
const TELEGRAM_BOT_TOKEN = '8806967153:AAFE7X5CS_t7o4FvzuU4x5qK_emgRok6GW0';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// ================================================================
//  DGDNETWORK API
// ================================================================
const DGD_API_KEY = 'dgd_4128cad69ecf698ac7915fc81e5d6e9dd417e39ad667701e';
const DGD_BASE = 'https://dgddigital.com/api/v1';

// ================================================================
//  MongoDB সংযোগ
// ================================================================
const MONGODB_URI = 'mongodb+srv://surujsarkar01_db_user:hSiXnPCwFKWeChNm@cluster0.uovzwiy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'bd_unique_method';
let db, numbersCollection, otpsCollection, usersCollection, transactionsCollection;

async function connectDB() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    numbersCollection = db.collection('numbers');
    otpsCollection = db.collection('otps');
    usersCollection = db.collection('users');
    transactionsCollection = db.collection('transactions');
    console.log('✅ MongoDB সংযুক্ত!');
    await seedDefaultData();
  } catch (error) {
    console.error('❌ MongoDB সংযোগ ত্রুটি:', error);
  }
}

async function seedDefaultData() {
  const numbersCount = await numbersCollection.countDocuments();
  if (numbersCount === 0) {
    await numbersCollection.insertMany([
      { id: '1', number: '+8801712345678', country: 'Bangladesh', status: 'available', assignedTo: null },
      { id: '2', number: '+8801812345678', country: 'Bangladesh', status: 'available', assignedTo: null },
      { id: '3', number: '+8801912345678', country: 'Bangladesh', status: 'available', assignedTo: null },
      { id: '4', number: '+919876543210', country: 'India', status: 'available', assignedTo: null },
      { id: '5', number: '+16501234567', country: 'USA', status: 'available', assignedTo: null },
      { id: '6', number: '+447911123456', country: 'UK', status: 'available', assignedTo: null }
    ]);
  }
  const usersCount = await usersCollection.countDocuments();
  if (usersCount === 0) {
    await usersCollection.insertOne({
      balance: 107.800,
      totalEarned: 107.800,
      totalOtps: 672,
      totalNumbers: 1115
    });
  }
  const otpsCount = await otpsCollection.countDocuments();
  if (otpsCount === 0) {
    await otpsCollection.insertMany([
      { id: '1', number: '+8801712345678', otp: '123456', service: 'Facebook', status: 'success', timestamp: new Date().toISOString() },
      { id: '2', number: '+8801812345678', otp: '789012', service: 'Google', status: 'pending', timestamp: new Date().toISOString() },
      { id: '3', number: '+8801912345678', otp: '345678', service: 'WhatsApp', status: 'success', timestamp: new Date(Date.now() - 600000).toISOString() }
    ]);
  }
}

// ================================================================
//  টেলিগ্রাম ওয়েবহুক হ্যান্ডলার
// ================================================================
app.post('/api/telegram-webhook', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.sendStatus(200);

    const chatId = message.chat.id;
    const text = message.text || '';

    if (text === '/start') {
      await sendTelegramMessage(chatId, `👋 **BD UNIQUE METHOD** বটে স্বাগতম!

আপনি সরাসরি একটি **নাম্বার** টাইপ করলেই আমি OTP খুঁজে দেব।

📌 উদাহরণ: +8801712345678

অথবা কমান্ড ব্যবহার করুন:
/balance — ব্যালেন্স দেখুন
/stats — পরিসংখ্যান দেখুন
/getnumber — নতুন নাম্বার নিন
/otps — সাম্প্রতিক OTP দেখুন
/dgd-get — DGDNETWORK থেকে নাম্বার নিন
/dgd-check [নাম্বার] — OTP চেক করুন
/help — সাহায্য দেখুন`);
    } 
    else if (text === '/help') {
      await sendTelegramMessage(chatId, `📌 **কমান্ডের তালিকা:**

/balance — আপনার ওয়ালেট ব্যালেন্স দেখুন
/stats — টুডে ও অল-টাইম পরিসংখ্যান দেখুন
/getnumber — একটি নতুন ভার্চুয়াল নাম্বার নিন
/otps — সর্বশেষ ৫টি OTP দেখুন
/dgd-get — DGDNETWORK থেকে নতুন নাম্বার নিন
/dgd-check [নাম্বার] — OTP চেক করুন
/start — বট পুনরায় চালু করুন

অথবা সরাসরি একটি **নাম্বার** টাইপ করলেই আমি OTP খুঁজে দেব।`);
    }
    else if (text === '/balance') {
      const user = await usersCollection.findOne({});
      await sendTelegramMessage(chatId, `💰 **ওয়ালেট ব্যালেন্স**
      
ব্যালেন্স: $${user?.balance?.toFixed(3) || '0.000'}
মোট আয়: $${user?.totalEarned?.toFixed(3) || '0.000'}`);
    }
    else if (text === '/stats') {
      const user = await usersCollection.findOne({});
      const allOtps = await otpsCollection.find({}).toArray();
      const successOtps = allOtps.filter(o => o.status === 'success').length;
      const totalOtps = allOtps.length;
      await sendTelegramMessage(chatId, `📊 **পরিসংখ্যান**
      
📱 নাম্বার: ${user?.totalNumbers || 0}
📨 মোট OTP: ${user?.totalOtps || 0}
✅ সফল OTP: ${successOtps}
📈 সাফল্যের হার: ${totalOtps > 0 ? Math.round((successOtps / totalOtps) * 100) : 0}%`);
    }
    else if (text === '/getnumber') {
      const available = await numbersCollection.findOne({ status: 'available' });
      if (!available) {
        await sendTelegramMessage(chatId, '❌ কোনো নাম্বার উপলব্ধ নেই!');
      } else {
        await numbersCollection.updateOne(
          { _id: available._id },
          { $set: { status: 'assigned', assignedTo: 'telegram_' + chatId } }
        );
        await sendTelegramMessage(chatId, `✅ **নতুন নাম্বার রিজার্ভ হয়েছে!**
        
📞 নাম্বার: ${available.number}
🌍 দেশ: ${available.country}
🆔 আইডি: ${available.id}`);
      }
    }
    else if (text === '/otps') {
      const otps = await otpsCollection.find({}).sort({ timestamp: -1 }).limit(5).toArray();
      if (otps.length === 0) {
        await sendTelegramMessage(chatId, '📭 কোনো OTP পাওয়া যায়নি।');
      } else {
        let msg = '📨 **সর্বশেষ ৫টি OTP:**\n\n';
        otps.forEach((o, i) => {
          msg += `${i+1}. ${o.number} → \`${o.otp}\` (${o.service}) [${o.status === 'success' ? '✅ সফল' : '⏳ pending'}]\n`;
        });
        await sendTelegramMessage(chatId, msg);
      }
    }
    // ============================================================
    //  DGDNETWORK কমান্ড
    // ============================================================
    else if (text === '/dgd-get') {
      const response = await fetch(`${app.get('baseUrl') || 'https://bd-unique-method.vercel.app'}/api/dgd/get-number`, { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        const num = data.number?.number || data.number?.copy || 'N/A';
        await sendTelegramMessage(chatId, `✅ **DGDNETWORK নাম্বার প্রোভিশন হয়েছে!**
        
📞 নাম্বার: ${num}
🌍 দেশ: ${data.number?.country || 'Unknown'}`);
      } else {
        await sendTelegramMessage(chatId, `❌ ${data.message}`);
      }
    }
    else if (text.startsWith('/dgd-check ')) {
      const number = text.split(' ')[1];
      if (!number) {
        await sendTelegramMessage(chatId, '❌ নাম্বার দিন: /dgd-check 447384512345');
        return;
      }
      const response = await fetch(`${app.get('baseUrl') || 'https://bd-unique-method.vercel.app'}/api/dgd/check-otp?number=${number}`);
      const data = await response.json();
      if (data.success && data.otp) {
        await sendTelegramMessage(chatId, `🔑 **OTP স্ট্যাটাস**
        
📞 নাম্বার: ${data.otp.nomor}
📊 স্ট্যাটাস: ${data.otp.status}
🔢 OTP: ${data.otp.kode_otp || 'পাওয়া যায়নি'}`);
      } else {
        await sendTelegramMessage(chatId, `📭 ${data.message || 'কোনো তথ্য পাওয়া যায়নি'}`);
      }
    }
    // ============================================================
    //  নাম্বার ডিটেক্ট (ইউজার নাম্বার টাইপ করলে)
    // ============================================================
    else {
      const phoneRegex = /^(\+?\d{1,4}[\s\-]?)?\(?\d{1,4}\)?[\s\-]?\d{1,4}[\s\-]?\d{1,9}$/;
      const cleanedText = text.replace(/\s/g, '');
      
      if (phoneRegex.test(cleanedText) || cleanedText.match(/^\+?\d{10,15}$/)) {
        const otp = await otpsCollection.findOne({ number: { $regex: cleanedText, $options: 'i' } });
        
        if (otp) {
          await sendTelegramMessage(chatId, `🔑 **OTP পাওয়া গেছে!**

📞 নাম্বার: ${otp.number}
🔢 OTP: \`${otp.otp}\`
📱 সার্ভিস: ${otp.service}
📊 স্ট্যাটাস: ${otp.status === 'success' ? '✅ সফল' : '⏳ pending'}`);
        } else {
          await sendTelegramMessage(chatId, `🔍 **${cleanedText}** এই নাম্বারের জন্য কোনো OTP পাওয়া যায়নি।

💡 টিপস:
- সঠিক নাম্বার দিন (যেমন: +8801712345678)
- অথবা /getnumber দিয়ে নতুন নাম্বার নিন`);
        }
      } else {
        await sendTelegramMessage(chatId, `❓ আমি বুঝতে পারিনি।

📌 সরাসরি একটি **নাম্বার** টাইপ করলে OTP খুঁজে দেব।
অথবা /help দেখুন।`);
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.sendStatus(200);
  }
});

async function sendTelegramMessage(chatId, text) {
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: chatId, 
        text: text,
        parse_mode: 'Markdown' 
      })
    });
  } catch (error) {
    console.error('❌ Telegram send error:', error);
  }
}

// ================================================================
//  DGDNETWORK API রাউটস
// ================================================================

// 1. নাম্বার প্রোভিশন
app.post('/api/dgd/get-number', async (req, res) => {
  try {
    const { range, isNational, removePlus } = req.body;
    const response = await fetch(`${DGD_BASE}/user/getnum`, {
      method: 'POST',
      headers: {
        'X-API-KEY': DGD_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        range: range || '4473845XXX',
        is_national: isNational || false,
        remove_plus: removePlus || false
      })
    });
    const data = await response.json();
    
    if (data.ok !== false) {
      const number = data.data?.number || data.data?.phone || data.data?.copy || 'N/A';
      await numbersCollection.insertOne({
        id: number,
        number: number,
        country: data.data?.country || 'Unknown',
        operator: data.data?.operator || 'Unknown',
        status: 'assigned',
        assignedTo: 'user_' + Date.now(),
        source: 'dgdnetwork',
        raw: data
      });
      res.json({ success: true, number: data.data });
    } else {
      res.json({ success: false, message: data.message || 'Failed to get number' });
    }
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// 2. OTP চেক
app.get('/api/dgd/check-otp', async (req, res) => {
  try {
    const { number } = req.query;
    if (!number) {
      return res.json({ success: false, message: 'Number is required' });
    }
    
    const response = await fetch(`${DGD_BASE}/user/checknum?nomor=${encodeURIComponent(number)}`, {
      method: 'GET',
      headers: {
        'X-API-KEY': DGD_API_KEY,
        'Accept': 'application/json'
      }
    });
    const data = await response.json();
    
    if (data.ok && data.data) {
      if (data.data.status === 'SUKSES' && data.data.kode_otp) {
        await otpsCollection.insertOne({
          number: data.data.nomor,
          otp: data.data.kode_otp,
          message: `OTP for ${data.data.nomor}: ${data.data.kode_otp}`,
          service: 'DGDNETWORK',
          status: 'success',
          timestamp: new Date().toISOString(),
          source: 'dgdnetwork'
        });
      }
      res.json({ success: true, otp: data.data });
    } else {
      res.json({ success: false, message: data.message || 'No data found' });
    }
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// 3. অটো OTP চেকার (প্রতি ৫ সেকেন্ড)
let otpCheckInterval = null;

function startOtpChecker() {
  if (otpCheckInterval) clearInterval(otpCheckInterval);
  otpCheckInterval = setInterval(async () => {
    try {
      const pendingNumbers = await numbersCollection.find({ 
        status: 'assigned',
        source: 'dgdnetwork'
      }).toArray();
      
      for (const entry of pendingNumbers) {
        const response = await fetch(`${DGD_BASE}/user/checknum?nomor=${encodeURIComponent(entry.number)}`, {
          headers: { 'X-API-KEY': DGD_API_KEY, 'Accept': 'application/json' }
        });
        const data = await response.json();
        
        if (data.ok && data.data?.status === 'SUKSES' && data.data?.kode_otp) {
          await otpsCollection.insertOne({
            number: data.data.nomor,
            otp: data.data.kode_otp,
            message: `OTP for ${data.data.nomor}: ${data.data.kode_otp}`,
            service: 'DGDNETWORK',
            status: 'success',
            timestamp: new Date().toISOString(),
            source: 'dgdnetwork'
          });
          await numbersCollection.updateOne(
            { _id: entry._id },
            { $set: { status: 'completed' } }
          );
        }
      }
    } catch (error) {
      console.error('OTP Checker Error:', error);
    }
  }, 5000);
}

startOtpChecker();

// ================================================================
//  অন্যান্য API রাউটস
// ================================================================
app.get('/api/stats', async (req, res) => {
  try {
    const user = await usersCollection.findOne({});
    const allOtps = await otpsCollection.find({}).toArray();
    const totalOtps = allOtps.length;
    const successOtps = allOtps.filter(o => o.status === 'success').length;
    res.json({
      success: true,
      today: {
        numbers: user?.totalNumbers || 58,
        otps: totalOtps || 39,
        success: totalOtps > 0 ? Math.round((successOtps / totalOtps) * 100) + '%' : '0%'
      },
      allTime: {
        numbers: user?.totalNumbers || 1115,
        otps: user?.totalOtps || 672,
        success: user?.totalOtps > 0 ? Math.round((successOtps / (user?.totalOtps || 1)) * 100) + '%' : '0%',
        earned: user?.totalEarned || 107.800
      },
      balance: user?.balance || 107.800
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.get('/api/numbers', async (req, res) => {
  try {
    const numbers = await numbersCollection.find({}).toArray();
    res.json({ success: true, numbers });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.post('/api/get-number', async (req, res) => {
  try {
    const available = await numbersCollection.findOne({ status: 'available' });
    if (!available) return res.json({ success: false, message: 'No numbers available!' });
    await numbersCollection.updateOne(
      { _id: available._id },
      { $set: { status: 'assigned', assignedTo: 'user_' + Date.now() } }
    );
    res.json({ success: true, number: available.number, country: available.country, id: available.id });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.get('/api/otps', async (req, res) => {
  try {
    const otps = await otpsCollection.find({}).sort({ timestamp: -1 }).toArray();
    res.json({ success: true, otps });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.get('/api/success-otps', async (req, res) => {
  try {
    const otps = await otpsCollection.find({ status: 'success' }).sort({ timestamp: -1 }).toArray();
    res.json({ success: true, otps });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.get('/api/live-console', async (req, res) => {
  try {
    const otps = await otpsCollection.find({}).sort({ timestamp: -1 }).limit(10).toArray();
    res.json({ success: true, otps });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.get('/api/wallet', async (req, res) => {
  try {
    const user = await usersCollection.findOne({});
    const transactions = await transactionsCollection.find({}).sort({ timestamp: -1 }).toArray();
    res.json({ success: true, balance: user?.balance || 0, totalEarned: user?.totalEarned || 0, transactions: transactions || [] });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.post('/api/create-otp', async (req, res) => {
  try {
    const { number, service } = req.body;
    const newOtp = {
      id: uuidv4(),
      number: number || '+8801712345678',
      otp: String(Math.floor(100000 + Math.random() * 900000)),
      service: service || 'Unknown',
      status: Math.random() > 0.3 ? 'success' : 'pending',
      timestamp: new Date().toISOString()
    };
    await otpsCollection.insertOne(newOtp);
    if (newOtp.status === 'success') {
      const earned = 0.650;
      await usersCollection.updateOne({}, { $inc: { balance: earned, totalEarned: earned, totalOtps: 1 } });
      await transactionsCollection.insertOne({
        id: uuidv4(),
        type: 'earned',
        amount: earned,
        description: `OTP Success - ${newOtp.service}`,
        timestamp: new Date().toISOString()
      });
    }
    res.json({ success: true, otp: newOtp });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.post('/api/add-number', async (req, res) => {
  try {
    const { number, country } = req.body;
    const newNumber = {
      id: uuidv4(),
      number: number,
      country: country || 'Unknown',
      status: 'available',
      assignedTo: null
    };
    await numbersCollection.insertOne(newNumber);
    await usersCollection.updateOne({}, { $inc: { totalNumbers: 1 } });
    res.json({ success: true, number: newNumber });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ================================================================
//  সার্ভার চালু
// ================================================================
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ BD UNIQUE METHOD Server running at http://localhost:${PORT}`);
  });
});

module.exports = app;