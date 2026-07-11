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
//  MONGODB CONNECTION
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
    console.log('✅ MongoDB Connected Successfully!');

    await seedDefaultData();
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
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
    console.log('✅ Default numbers seeded');
  }

  const usersCount = await usersCollection.countDocuments();
  if (usersCount === 0) {
    await usersCollection.insertOne({
      balance: 107.800,
      totalEarned: 107.800,
      totalOtps: 672,
      totalNumbers: 1115
    });
    console.log('✅ Default user seeded');
  }

  const otpsCount = await otpsCollection.countDocuments();
  if (otpsCount === 0) {
    await otpsCollection.insertMany([
      { id: '1', number: '+8801712345678', otp: '123456', service: 'Facebook', status: 'success', timestamp: new Date().toISOString() },
      { id: '2', number: '+8801812345678', otp: '789012', service: 'Google', status: 'pending', timestamp: new Date().toISOString() },
      { id: '3', number: '+8801912345678', otp: '345678', service: 'WhatsApp', status: 'success', timestamp: new Date(Date.now() - 600000).toISOString() }
    ]);
    console.log('✅ Default OTPs seeded');
  }
}

// ================================================================
//  API ROUTES
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
    if (!available) {
      return res.json({ success: false, message: 'No numbers available!' });
    }
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
    res.json({
      success: true,
      balance: user?.balance || 0,
      totalEarned: user?.totalEarned || 0,
      transactions: transactions || []
    });
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
      await usersCollection.updateOne(
        {},
        { $inc: { balance: earned, totalEarned: earned, totalOtps: 1 } }
      );
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
//  START SERVER
// ================================================================
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ BD UNIQUE METHOD Server running at http://localhost:${PORT}`);
  });
});