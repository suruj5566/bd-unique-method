const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

const TELEGRAM_BOT_TOKEN = '8806967153:AAFE7X5CS_t7o4FvzuU4x5qK_emgRok6GW0';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

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
    process.exit(1);
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

আপনি নিচের কমান্ডগুলো ব্যবহার করতে পারেন:

/balance — ব্যালেন্স দেখুন
/stats — পরিসংখ্যান দেখুন
/getnumber — নতুন নাম্বার নিন
/otps — সাম্প্রতিক OTP দেখুন
/help — সাহায্য দেখুন`);
    } 
    else if (text === '/help') {
      await sendTelegramMessage(chatId, `📌 **কমান্ডের তালিকা:**

/balance — আপনার ওয়ালেট ব্যালেন্স দেখুন
/stats — টুডে ও অল-টাইম পরিসংখ্যান দেখুন
/getnumber — একটি নতুন ভার্চুয়াল নাম্বার নিন
/otps — সর্বশেষ ৫টি OTP দেখুন
/start — বট পুনরায় চালু করুন`);
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
    else {
      await sendTelegramMessage(chatId, `❓ **অজানা কমান্ড!**

সঠিক কমান্ড পেতে /help ব্যবহার করুন।`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('টেলিগ্রাম ত্রুটি:', error);
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
    console.error('টেলিগ্রাম পাঠানোর ত্রুটি:', error);
  }
}

// ================================================================
//  API রাউটস
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