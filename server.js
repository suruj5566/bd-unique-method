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
//  কনফিগারেশন
// ================================================================
const TELEGRAM_BOT_TOKEN = '8806967153:AAFE7X5CS_t7o4FvzuU4x5qK_emgRok6GW0';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const FASTX_API_KEY = 'MURAD_CB2D9D7650B867595C3AE975';
const FASTX_BASE = 'https://fastxotps.com/api/v1';

const MONGODB_URI = 'mongodb+srv://surujsarkar01_db_user:hSiXnPCwFKWeChNm@cluster0.uovzwiy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'bd_unique_method';
let db, numbersCollection, otpsCollection, usersCollection, transactionsCollection;

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
    transactionsCollection = db.collection('transactions');
    console.log('✅ MongoDB সংযুক্ত!');
    await seedDefaultData();
  } catch (error) {
    console.error('❌ MongoDB ত্রুটি:', error);
  }
}

async function seedDefaultData() {
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
}

// ================================================================
//  টেলিগ্রাম মেসেজ পাঠানো
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
//  টেলিগ্রাম ওয়েবহুক হ্যান্ডলার (সম্পূর্ণ বট)
// ================================================================
app.post('/api/telegram-webhook', async (req, res) => {
  try {
    const { message, callback_query } = req.body;
    
    // ============================================================
    //  CALLBACK QUERY (বাটন ক্লিক)
    // ============================================================
    if (callback_query) {
      const chatId = callback_query.message.chat.id;
      const data = callback_query.data;

      if (data === 'get_number') {
        await sendTelegramMessage(chatId,
          `📱 **প্ল্যাটফর্ম সিলেক্ট করুন**\n\n` +
          `যে প্ল্যাটফর্মের জন্য নাম্বার চান, সেটি বেছে নিন:`,
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
          `✅ **${platform.toUpperCase()}** সিলেক্ট করা হয়েছে!\n\n` +
          `এখন রেঞ্জ দিন (যেমন: 4473845XXX):`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔙 ফিরে যান', callback_data: 'get_number' }]
              ]
            }
          }
        );
        // ইউজারের রেসপন্সের জন্য অপেক্ষা করুন
        // পরবর্তী মেসেজে রেঞ্জ নিয়ে নাম্বার জেনারেট করবেন
      }
      else if (data === 'balance') {
        const user = await usersCollection.findOne({});
        await sendTelegramMessage(chatId,
          `💰 **আপনার ব্যালেন্স**\n\n` +
          `ব্যালেন্স: $${user?.balance?.toFixed(3) || '0.000'}\n` +
          `মোট আয়: $${user?.totalEarned?.toFixed(3) || '0.000'}\n` +
          `রেফার বোনাস: $${user?.referBalance?.toFixed(3) || '0.000'}\n` +
          `মোট OTP: ${user?.totalOtps || 0}`,
          {
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 মেনু', callback_data: 'back_menu' }]]
            }
          }
        );
      }
      else if (data === 'withdraw') {
        await sendTelegramMessage(chatId,
          `💳 **উইথড্র**\n\n` +
          `আপনার ব্যালেন্স: $${(await usersCollection.findOne({}))?.balance?.toFixed(3) || '0.000'}\n\n` +
          `কোন মেথডে উইথড্র করবেন?`,
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
          `🔗 **রেফার লিংক**\n\n` +
          `আপনার রেফার লিংক:\n` +
          `${referLink}\n\n` +
          `প্রতিটি রেফারের জন্য আপনি $0.05 বোনাস পাবেন!\n` +
          `আপনার মোট রেফার: ${(await usersCollection.findOne({}))?.referredUsers?.length || 0}`,
          {
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 মেনু', callback_data: 'back_menu' }]]
            }
          }
        );
      }
      else if (data === 'back_menu') {
        await sendTelegramMessage(chatId,
          `👋 **BD UNIQUE METHOD** বটে ফিরে আসুন!\n\n` +
          `নিচের বাটনগুলো ব্যবহার করুন:`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '📱 Get Number', callback_data: 'get_number' }],
                [{ text: '💰 Balance', callback_data: 'balance' }],
                [{ text: '💳 Withdraw', callback_data: 'withdraw' }],
                [{ text: '🔗 Refer', callback_data: 'refer' }]
              ]
            }
          }
        );
      }
      else if (data.startsWith('withdraw_')) {
        const method = data.replace('withdraw_', '');
        await sendTelegramMessage(chatId,
          `✅ **${method.toUpperCase()}** সিলেক্ট করা হয়েছে!\n\n` +
          `আপনার উইথড্র রিকোয়েস্ট প্রক্রিয়াধীন...\n` +
          `মিনিমাম $1.00 উইথড্র করতে পারবেন।\n\n` +
          `আপনার বর্তমান ব্যালেন্স: $${(await usersCollection.findOne({}))?.balance?.toFixed(3) || '0.000'}`,
          {
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 মেনু', callback_data: 'back_menu' }]]
            }
          }
        );
      }

      return res.sendStatus(200);
    }

    // ============================================================
    //  টেক্সট মেসেজ
    // ============================================================
    if (!message) return res.sendStatus(200);
    const chatId = message.chat.id;
    const text = message.text || '';

    // রেঞ্জ ইনপুট চেক (Get Number-এর পরে)
    if (text.match(/^\d{4,10}X{0,3}$/)) {
      const range = text.trim();
      try {
        const response = await fetch(`${FASTX_BASE}/user/getnum`, {
          method: 'POST',
          headers: {
            'X-API-KEY': FASTX_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ range, is_national: false, remove_plus: false })
        });
        const data = await response.json();
        if (data.ok !== false && data.data) {
          const number = data.data?.number || data.data?.copy || 'N/A';
          await numbersCollection.insertOne({
            id: number,
            number: number,
            country: data.data?.country || 'Unknown',
            status: 'assigned',
            assignedTo: 'telegram_' + chatId,
            source: 'fastxotps'
          });
          await sendTelegramMessage(chatId,
            `✅ **নাম্বার প্রোভিশন হয়েছে!**\n\n` +
            `📞 নাম্বার: ${number}\n` +
            `🌍 দেশ: ${data.data?.country || 'Unknown'}\n\n` +
            `OTP আসার জন্য অপেক্ষা করুন...`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔄 OTP চেক করুন', callback_data: 'check_otp' }],
                  [{ text: '🔙 মেনু', callback_data: 'back_menu' }]
                ]
              }
            }
          );
          // অটো OTP চেকার চালু করুন
          setTimeout(() => checkAndSendOtp(chatId, number), 15000);
        } else {
          await sendTelegramMessage(chatId,
            `❌ **নাম্বার নেওয়া ব্যর্থ!**\n\n` +
            `${data.message || 'অনুগ্রহ করে সঠিক রেঞ্জ দিন'}`
          );
        }
      } catch (error) {
        await sendTelegramMessage(chatId, `❌ Error: ${error.message}`);
      }
      return res.sendStatus(200);
    }

    // ============================================================
    //  কমান্ড হ্যান্ডলার
    // ============================================================
    if (text === '/start') {
      // চেক করুন রেফার লিংক থেকে এসেছে কিনা
      const refMatch = text.match(/ref_(\d+)/);
      if (refMatch) {
        const referrerId = refMatch[1];
        await usersCollection.updateOne(
          { id: referrerId },
          { $inc: { referBalance: 0.05 }, $addToSet: { referredUsers: chatId } }
        );
        await sendTelegramMessage(referrerId, `🎉 নতুন রেফার! আপনি $0.05 বোনাস পেয়েছেন!`);
      }

      await sendTelegramMessage(chatId,
        `👋 **BD UNIQUE METHOD** বটে স্বাগতম!\n\n` +
        `আপনি নিচের বাটনগুলো ব্যবহার করতে পারেন:\n` +
        `📱 Get Number — নতুন নাম্বার নিন\n` +
        `💰 Balance — ব্যালেন্স দেখুন\n` +
        `💳 Withdraw — টাকা তুলুন\n` +
        `🔗 Refer — রেফার লিংক পাবেন\n\n` +
        `⚡ প্রতিটি OTP সফল হলে $0.10 আয় হয়!`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📱 Get Number', callback_data: 'get_number' }],
              [{ text: '💰 Balance', callback_data: 'balance' }],
              [{ text: '💳 Withdraw', callback_data: 'withdraw' }],
              [{ text: '🔗 Refer', callback_data: 'refer' }]
            ]
          }
        }
      );
    }
    else if (text === '/balance') {
      const user = await usersCollection.findOne({});
      await sendTelegramMessage(chatId,
        `💰 **আপনার ব্যালেন্স**\n\n` +
        `ব্যালেন্স: $${user?.balance?.toFixed(3) || '0.000'}\n` +
        `মোট আয়: $${user?.totalEarned?.toFixed(3) || '0.000'}\n` +
        `রেফার বোনাস: $${user?.referBalance?.toFixed(3) || '0.000'}\n` +
        `মোট OTP: ${user?.totalOtps || 0}`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 মেনু', callback_data: 'back_menu' }]]
          }
        }
      );
    }
    else {
      await sendTelegramMessage(chatId,
        `❓ আমি বুঝতে পারিনি।\n\n` +
        `/start দিয়ে বট চালু করুন অথবা নিচের বাটন ব্যবহার করুন।`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 মেনু', callback_data: 'back_menu' }]]
          }
        }
      );
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.sendStatus(200);
  }
});

// ================================================================
//  অটো OTP চেকার
// ================================================================
async function checkAndSendOtp(chatId, number) {
  try {
    const response = await fetch(`${FASTX_BASE}/user/checknum?nomor=${encodeURIComponent(number)}`, {
      headers: { 'X-API-KEY': FASTX_API_KEY, 'Accept': 'application/json' }
    });
    const data = await response.json();
    if (data.ok && data.data?.status === 'SUKSES' && data.data?.kode_otp) {
      await otpsCollection.insertOne({
        number: data.data.nomor,
        otp: data.data.kode_otp,
        service: 'FASTXOTPS',
        status: 'success',
        timestamp: new Date().toISOString()
      });
      // ইউজারের ব্যালেন্স আপডেট
      await usersCollection.updateOne({}, { $inc: { balance: 0.10, totalEarned: 0.10, totalOtps: 1 } });
      await sendTelegramMessage(chatId,
        `🔑 **OTP পাওয়া গেছে!**\n\n` +
        `📞 নাম্বার: ${data.data.nomor}\n` +
        `🔢 OTP: \`${data.data.kode_otp}\`\n\n` +
        `💰 $0.10 আপনার ব্যালেন্সে যোগ হয়েছে!`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '💰 Balance', callback_data: 'balance' }]]
          }
        }
      );
    } else {
      // ১৫ সেকেন্ড পর আবার চেষ্টা করুন
      setTimeout(() => checkAndSendOtp(chatId, number), 10000);
    }
  } catch (error) {
    console.error('OTP check error:', error);
  }
}

// ================================================================
//  ওয়েবসাইট API রাউটস
// ================================================================
app.get('/api/stats', async (req, res) => {
  try {
    const user = await usersCollection.findOne({});
    const allOtps = await otpsCollection.find({}).toArray();
    const successOtps = allOtps.filter(o => o.status === 'success').length;
    res.json({
      success: true,
      today: { numbers: user?.totalNumbers || 0, otps: allOtps.length || 0, success: allOtps.length > 0 ? Math.round((successOtps/allOtps.length)*100)+'%' : '0%' },
      allTime: { numbers: user?.totalNumbers || 0, otps: user?.totalOtps || 0, success: user?.totalOtps > 0 ? Math.round((successOtps/user?.totalOtps)*100)+'%' : '0%', earned: user?.totalEarned || 0 },
      balance: user?.balance || 0,
      referBalance: user?.referBalance || 0
    });
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

app.get('/api/numbers', async (req, res) => {
  try {
    const numbers = await numbersCollection.find({}).toArray();
    res.json({ success: true, numbers });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.post('/api/add-number', async (req, res) => {
  try {
    const { number, country } = req.body;
    await numbersCollection.insertOne({ id: uuidv4(), number, country, status: 'available', source: 'manual' });
    res.json({ success: true, message: 'Number added' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ================================================================
//  সার্ভার চালু
// ================================================================
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Bot: @BDUNIQUE_METHOD_bot`);
    console.log(`✅ Website: http://localhost:${PORT}`);
  });
});

module.exports = app;