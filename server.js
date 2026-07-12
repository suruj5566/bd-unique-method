const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ================================================================
//  MIDDLEWARE
// ================================================================
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// JSON রেসপন্স ফোর্স করুন
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
  }
  next();
});

// ================================================================
//  কনফিগারেশন
// ================================================================
const TELEGRAM_BOT_TOKEN = '8806967153:AAFE7X5CS_t7o4FvzuU4x5qK_emgRok6GW0';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const FASTX_API_KEY = 'MURAD_CB2D9D7650B867595C3AE975';
const FASTX_BASE = 'https://fastxotps.com/api/v1';

const MONGODB_URI = 'mongodb+srv://surujsarkar01_db_user:hSiXnPCwFKWeChNm@cluster0.uovzwiy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'bd_unique_method';
let db, numbersCollection, otpsCollection, usersCollection;

// ================================================================
//  MongoDB সংযোগ
// ================================================================
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
//  টেলিগ্রাম মেসেজ
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
//  FAST X OTP API কল
// ================================================================
async function callFastXAPI(endpoint, options = {}) {
  const url = `${FASTX_BASE}${endpoint}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-API-KEY': FASTX_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers
      }
    });
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('FASTX JSON Parse Error:', text.substring(0, 200));
      return { ok: false, message: 'Invalid JSON response', raw: text.substring(0, 200) };
    }
  } catch (error) {
    console.error('FASTX API Error:', error);
    return { ok: false, message: error.message };
  }
}

// ================================================================
//  API রাউটস
// ================================================================

// Get Number
app.post('/api/fastx/get-number', async (req, res) => {
  try {
    const { range } = req.body;
    const data = await callFastXAPI('/user/getnum', {
      method: 'POST',
      body: JSON.stringify({
        range: range || '4473845XXX',
        is_national: false,
        remove_plus: false
      })
    });
    
    if (data.ok !== false && data.data) {
      const number = data.data?.number || data.data?.copy || 'N/A';
      await numbersCollection.insertOne({
        id: number,
        number: number,
        country: data.data?.country || 'Unknown',
        status: 'assigned',
        source: 'fastxotps',
        createdAt: new Date()
      });
      await usersCollection.updateOne({}, { $inc: { totalNumbers: 1 } });
      return res.json({ success: true, number: data.data });
    } else {
      return res.json({ 
        success: false, 
        message: data?.message || 'নাম্বার পাওয়া যায়নি'
      });
    }
  } catch (error) {
    console.error('Get Number Error:', error);
    return res.json({ success: false, message: error.message });
  }
});

// Check OTP
app.get('/api/fastx/check-otp', async (req, res) => {
  try {
    const { number } = req.query;
    if (!number) {
      return res.json({ success: false, message: 'Number required' });
    }
    const data = await callFastXAPI(`/user/checknum?nomor=${encodeURIComponent(number)}`, {
      method: 'GET'
    });
    
    if (data.ok && data.data) {
      if (data.data.status === 'SUKSES' && data.data.kode_otp) {
        await otpsCollection.insertOne({
          number: data.data.nomor,
          otp: data.data.kode_otp,
          service: 'FASTXOTPS',
          status: 'success',
          timestamp: new Date().toISOString()
        });
        await usersCollection.updateOne({}, { $inc: { balance: 0.10, totalEarned: 0.10, totalOtps: 1 } });
      }
      return res.json({ success: true, otp: data.data });
    } else {
      return res.json({ success: false, message: data?.message || 'No OTP found' });
    }
  } catch (error) {
    console.error('Check OTP Error:', error);
    return res.json({ success: false, message: error.message });
  }
});

// Stats
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
    console.error('Stats Error:', error);
    return res.json({ success: false, message: error.message });
  }
});

// OTPs
app.get('/api/otps', async (req, res) => {
  try {
    const otps = await otpsCollection.find({}).sort({ timestamp: -1 }).toArray();
    return res.json({ success: true, otps });
  } catch (error) {
    console.error('OTPs Error:', error);
    return res.json({ success: false, message: error.message });
  }
});

// Numbers
app.get('/api/numbers', async (req, res) => {
  try {
    const numbers = await numbersCollection.find({}).toArray();
    return res.json({ success: true, numbers });
  } catch (error) {
    console.error('Numbers Error:', error);
    return res.json({ success: false, message: error.message });
  }
});

// Withdraw
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
    console.error('Withdraw Error:', error);
    return res.json({ success: false, message: error.message });
  }
});

// ================================================================
//  টেলিগ্রাম ওয়েবহুক
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
        await sendTelegramMessage(chatId,
          `📱 **প্ল্যাটফর্ম সিলেক্ট করুন**`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Facebook (1%)', callback_data: 'platform_facebook' }],
                [{ text: 'Instagram (1%)', callback_data: 'platform_instagram' }],
                [{ text: 'WhatsApp (2%)', callback_data: 'platform_whatsapp' }],
                [{ text: 'Telegram (1%)', callback_data: 'platform_telegram' }],
                [{ text: '🔙 ফিরে যান', callback_data: 'back_menu' }]
              ]
            }
          }
        );
      }
      else if (data.startsWith('platform_')) {
        const platform = data.replace('platform_', '');
        await sendTelegramMessage(chatId,
          `✅ **${platform.toUpperCase()}** সিলেক্ট করা হয়েছে!\n\nএখন রেঞ্জ দিন (যেমন: 4473845XXX):`
        );
      }
      else if (data === 'balance') {
        const user = await usersCollection.findOne({});
        await sendTelegramMessage(chatId,
          `💰 **আপনার ব্যালেন্স**\n\n` +
          `ব্যালেন্স: $${user?.balance?.toFixed(3) || '0.000'}\n` +
          `মোট আয়: $${user?.totalEarned?.toFixed(3) || '0.000'}\n` +
          `রেফার বোনাস: $${user?.referBalance?.toFixed(3) || '0.000'}\n` +
          `মোট OTP: ${user?.totalOtps || 0}`,
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
        await sendTelegramMessage(chatId,
          `🔗 **রেফার লিংক**\n\n${referLink}`,
          { reply_markup: { inline_keyboard: [[{ text: '🔙 মেনু', callback_data: 'back_menu' }]] } }
        );
      }
      else if (data === 'back_menu') {
        await sendTelegramMessage(chatId,
          `👋 **BD UNIQUE METHOD** বটে ফিরে আসুন!`,
          mainMenu
        );
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

    // টেক্সট মেসেজ
    if (!message) return res.sendStatus(200);
    const chatId = message.chat.id;
    const text = message.text || '';

    // রেঞ্জ চেক
    if (text.match(/^\d{4,10}X{0,3}$/)) {
      const range = text.trim();
      try {
        const data = await callFastXAPI('/user/getnum', {
          method: 'POST',
          body: JSON.stringify({ range, is_national: false, remove_plus: false })
        });
        if (data.ok !== false && data.data) {
          const number = data.data?.number || data.data?.copy || 'N/A';
          await numbersCollection.insertOne({
            id: number,
            number: number,
            country: data.data?.country || 'Unknown',
            status: 'assigned',
            source: 'fastxotps',
            assignedTo: 'telegram_' + chatId,
            createdAt: new Date()
          });
          await usersCollection.updateOne({}, { $inc: { totalNumbers: 1 } });
          await sendTelegramMessage(chatId,
            `✅ **নাম্বার প্রোভিশন হয়েছে!**\n\n📞 নাম্বার: ${number}\n🌍 দেশ: ${data.data?.country || 'Unknown'}`
          );
        } else {
          await sendTelegramMessage(chatId, `❌ ${data?.message || 'নাম্বার পাওয়া যায়নি'}`);
        }
      } catch (error) {
        await sendTelegramMessage(chatId, `❌ Error: ${error.message}`);
      }
      return res.sendStatus(200);
    }

    // কমান্ড
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
//  ওয়েবসাইট রুট
// ================================================================
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// ================================================================
//  সার্ভার চালু
// ================================================================
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Website: http://localhost:${PORT}`);
    console.log(`✅ Bot: @BDUNIQUE_METHOD_bot`);
  });
});

module.exports = app;