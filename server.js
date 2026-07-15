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

// ================================================================
//  TELEGRAM BOT TOKEN
// ================================================================
const TELEGRAM_BOT_TOKEN = '8806967153:AAFE7X5CS_t7o4FvzuU4x5qK_emgRok6GW0';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// ================================================================
//  OTP API (SMSPool) — আপনার API Key
// ================================================================
const OTP_API_KEY = 'nx_6pBZ1wxR5cQkx5tSBQi9L_zavkrNdzU9eYxXOg';
const OTP_API_BASE = 'https://api.smspool.net';

// ================================================================
//  MONGODB
// ================================================================
const MONGODB_URI = 'mongodb+srv://surujsarkar01_db_user:hSiXnPCwFKWeChNm@cluster0.uovzwiy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'bd_unique_method';
let db, numbersCollection, otpsCollection, usersCollection;

async function connectDB() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    numbersCollection = db.collection('numbers');
    otpsCollection = db.collection('otps');
    usersCollection = db.collection('users');
    console.log('✅ MongoDB Connected');
    const usersCount = await usersCollection.countDocuments();
    if (usersCount === 0) {
      await usersCollection.insertOne({
        balance: 0,
        totalEarned: 0,
        totalOtps: 0,
        totalNumbers: 0,
        referBalance: 0,
        referredUsers: []
      });
    }
  } catch (error) {
    console.error('❌ MongoDB Error:', error);
  }
}

// ================================================================
//  TELEGRAM FUNCTIONS
// ================================================================
async function sendTelegramMessage(chatId, text, extra = {}) {
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', ...extra })
    });
  } catch (error) {
    console.error('❌ Telegram send error:', error);
  }
}

// ================================================================
//  OTP API FUNCTIONS (GET NUMBER & CHECK OTP)
// ================================================================

app.post('/api/get-number', async (req, res) => {
  try {
    const { country, service } = req.body;
    const response = await fetch(`${OTP_API_BASE}/purchase/1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        api_key: OTP_API_KEY,
        country: country || 'US',
        service: service || 'google'
      })
    });
    const data = await response.json();
    if (data.success !== false && data.number) {
      await numbersCollection.insertOne({
        id: data.order_id || data.id || 'N/A',
        number: data.number,
        country: data.country || country,
        status: 'assigned',
        source: 'smspool',
        orderId: data.order_id || data.id,
        createdAt: new Date()
      });
      await usersCollection.updateOne({}, { $inc: { totalNumbers: 1 } });
      return res.json({ success: true, number: data });
    } else {
      return res.json({ success: false, message: data.message || 'Failed to get number' });
    }
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
});

app.get('/api/check-otp', async (req, res) => {
  try {
    const { orderId } = req.query;
    if (!orderId) {
      return res.json({ success: false, message: 'Order ID required' });
    }
    const response = await fetch(`${OTP_API_BASE}/sms/1/${orderId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ api_key: OTP_API_KEY })
    });
    const data = await response.json();
    if (data.success !== false && data.sms) {
      const otpMatch = data.sms.match(/\b\d{4,6}\b/);
      await otpsCollection.insertOne({
        number: data.number || 'N/A',
        otp: otpMatch ? otpMatch[0] : data.sms,
        message: data.sms,
        service: 'SMSPool',
        status: 'success',
        timestamp: new Date().toISOString(),
        orderId: orderId
      });
      await usersCollection.updateOne({}, { $inc: { balance: 0.10, totalEarned: 0.10, totalOtps: 1 } });
      return res.json({ success: true, otp: data });
    } else {
      return res.json({ success: false, message: data.message || 'No OTP found' });
    }
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
});

// ================================================================
//  EXISTING API ROUTES
// ================================================================
app.get('/api/stats', async (req, res) => {
  try {
    const user = await usersCollection.findOne({});
    const allOtps = await otpsCollection.find({}).toArray();
    const successOtps = allOtps.filter(o => o.status === 'success').length;
    return res.json({
      success: true,
      today: {
        numbers: user?.totalNumbers || 0,
        otps: allOtps.length || 0,
        success: allOtps.length > 0 ? Math.round((successOtps / allOtps.length) * 100) + '%' : '0%'
      },
      allTime: {
        numbers: user?.totalNumbers || 0,
        otps: user?.totalOtps || 0,
        success: user?.totalOtps > 0 ? Math.round((successOtps / user?.totalOtps) * 100) + '%' : '0%',
        earned: user?.totalEarned || 0
      },
      balance: user?.balance || 0,
      referBalance: user?.referBalance || 0
    });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
});

app.get('/api/otps', async (req, res) => {
  try {
    const otps = await otpsCollection.find({}).sort({ timestamp: -1 }).toArray();
    return res.json({ success: true, otps });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
});

app.get('/api/numbers', async (req, res) => {
  try {
    const numbers = await numbersCollection.find({}).toArray();
    return res.json({ success: true, numbers });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
});

app.post('/api/withdraw', async (req, res) => {
  try {
    const { amount, method } = req.body;
    if (!amount || amount < 1) {
      return res.json({ success: false, message: 'Minimum $1.00' });
    }
    const user = await usersCollection.findOne({});
    if (!user || user.balance < amount) {
      return res.json({ success: false, message: 'Insufficient balance' });
    }
    await usersCollection.updateOne({}, { $inc: { balance: -amount } });
    return res.json({ success: true, message: `Withdraw $${amount} via ${method} successful` });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
});

// ================================================================
//  TELEGRAM WEBHOOK
// ================================================================
app.post('/api/telegram-webhook', async (req, res) => {
  try {
    const { message, callback_query } = req.body;
    if (!message && !callback_query) return res.sendStatus(200);
    const mainMenu = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📱 Get Number', callback_data: 'get_number' }],
          [{ text: '💰 Balance', callback_data: 'balance' }],
          [{ text: '💳 Withdraw', callback_data: 'withdraw' }],
          [{ text: '🔗 Refer', callback_data: 'refer' }]
        ]
      }
    };
    if (callback_query) {
      const chatId = callback_query.message.chat.id;
      const data = callback_query.data;
      if (data === 'get_number') {
        await sendTelegramMessage(chatId, `📱 **প্ল্যাটফর্ম সিলেক্ট করুন**`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Facebook (1%)', callback_data: 'platform_facebook' }],
              [{ text: 'Instagram (1%)', callback_data: 'platform_instagram' }],
              [{ text: 'WhatsApp (2%)', callback_data: 'platform_whatsapp' }],
              [{ text: 'Telegram (1%)', callback_data: 'platform_telegram' }],
              [{ text: '🔙 ফিরে যান', callback_data: 'back_menu' }]
            ]
          }
        });
      }
      else if (data.startsWith('platform_')) {
        const platform = data.replace('platform_', '');
        await sendTelegramMessage(chatId, `✅ **${platform.toUpperCase()}** সিলেক্ট করা হয়েছে!\n\nএখন রেঞ্জ দিন (যেমন: 4473845XXX):`);
      }
      else if (data === 'balance') {
        const user = await usersCollection.findOne({});
        await sendTelegramMessage(chatId,
          `💰 **আপনার ব্যালেন্স**\n\nব্যালেন্স: $${user?.balance?.toFixed(3) || '0.000'}\nমোট আয়: $${user?.totalEarned?.toFixed(3) || '0.000'}\nরেফার বোনাস: $${user?.referBalance?.toFixed(3) || '0.000'}\nমোট OTP: ${user?.totalOtps || 0}`,
          { reply_markup: { inline_keyboard: [[{ text: '🔙 মেনু', callback_data: 'back_menu' }]] } }
        );
      }
      else if (data === 'withdraw') {
        const user = await usersCollection.findOne({});
        await sendTelegramMessage(chatId,
          `💳 **উইথড্র**\n\nআপনার ব্যালেন্স: $${user?.balance?.toFixed(3) || '0.000'}`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'bKash', callback_data: 'withdraw_bkash' }],
                [{ text: 'Nagad', callback_data: 'withdraw_nagad' }],
                [{ text: 'Binance (USDT)', callback_data: 'withdraw_binance' }],
                [{ text: '🔙 ফিরে যান', callback_data: 'back_menu' }]
              ]
            }
          }
        );
      }
      else if (data === 'refer') {
        const referLink = `https://t.me/BDUNIQUE_METHOD_bot?start=ref_${chatId}`;
        await sendTelegramMessage(chatId, `🔗 **রেফার লিংক**\n\n${referLink}`, {
          reply_markup: { inline_keyboard: [[{ text: '🔙 মেনু', callback_data: 'back_menu' }]] }
        });
      }
      else if (data === 'back_menu') {
        await sendTelegramMessage(chatId, `👋 **BD UNIQUE METHOD** বটে ফিরে আসুন!`, mainMenu);
      }
      else if (data.startsWith('withdraw_')) {
        const method = data.replace('withdraw_', '');
        await sendTelegramMessage(chatId,
          `✅ **${method.toUpperCase()}** সিলেক্ট করা হয়েছে!\n\nআপনার উইথড্র রিকোয়েস্ট প্রক্রিয়াধীন...`,
          { reply_markup: { inline_keyboard: [[{ text: '🔙 মেনু', callback_data: 'back_menu' }]] } }
        );
      }
      return res.sendStatus(200);
    }
    if (!message) return res.sendStatus(200);
    const chatId = message.chat.id;
    const text = message.text || '';
    if (text === '/start') {
      await sendTelegramMessage(chatId, `👋 **BD UNIQUE METHOD** বটে স্বাগতম!`, mainMenu);
    } else {
      await sendTelegramMessage(chatId, `❓ আমি বুঝতে পারিনি। /start দিয়ে বট চালু করুন।`);
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(200);
  }
});

// ================================================================
//  WEBSITE ROUTE
// ================================================================
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// ================================================================
//  START SERVER
// ================================================================
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Website: http://localhost:${PORT}`);
    console.log(`✅ Bot: @BDUNIQUE_METHOD_bot`);
  });
});

module.exports = app;