// ================================================================
//  API রাউটস (সমস্যা সমাধান সহ)
// ================================================================

// middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
  }
  next();
});

// 1. Get Number
app.post('/api/fastx/get-number', async (req, res) => {
  try {
    const { range } = req.body;
    const response = await fetch(`${FASTX_BASE}/user/getnum`, {
      method: 'POST',
      headers: {
        'X-API-KEY': FASTX_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        range: range || '4473845XXX',
        is_national: false,
        remove_plus: false
      })
    });
    const data = await response.json();
    if (data.ok !== false && data.data) {
      const number = data.data?.number || data.data?.copy || 'N/A';
      await numbersCollection.insertOne({
        id: number,
        number: number,
        country: data.data?.country || 'Unknown',
        status: 'assigned',
        source: 'fastxotps'
      });
      await usersCollection.updateOne({}, { $inc: { totalNumbers: 1 } });
      return res.status(200).json({ success: true, number: data.data });
    }
    return res.status(200).json({ success: false, message: data?.message || 'Failed' });
  } catch (error) {
    return res.status(200).json({ success: false, message: error.message });
  }
});

// 2. Check OTP
app.get('/api/fastx/check-otp', async (req, res) => {
  try {
    const { number } = req.query;
    if (!number) {
      return res.status(200).json({ success: false, message: 'Number required' });
    }
    const response = await fetch(`${FASTX_BASE}/user/checknum?nomor=${encodeURIComponent(number)}`, {
      headers: { 'X-API-KEY': FASTX_API_KEY, 'Accept': 'application/json' }
    });
    const data = await response.json();
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
      return res.status(200).json({ success: true, otp: data.data });
    }
    return res.status(200).json({ success: false, message: data?.message || 'No OTP found' });
  } catch (error) {
    return res.status(200).json({ success: false, message: error.message });
  }
});

// 3. Stats
app.get('/api/stats', async (req, res) => {
  try {
    const user = await usersCollection.findOne({});
    const allOtps = await otpsCollection.find({}).toArray();
    const successOtps = allOtps.filter(o => o.status === 'success').length;
    return res.status(200).json({
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
    return res.status(200).json({ success: false, message: error.message });
  }
});

// 4. OTPs
app.get('/api/otps', async (req, res) => {
  try {
    const otps = await otpsCollection.find({}).sort({ timestamp: -1 }).toArray();
    return res.status(200).json({ success: true, otps });
  } catch (error) {
    return res.status(200).json({ success: false, message: error.message });
  }
});

// 5. Numbers
app.get('/api/numbers', async (req, res) => {
  try {
    const numbers = await numbersCollection.find({}).toArray();
    return res.status(200).json({ success: true, numbers });
  } catch (error) {
    return res.status(200).json({ success: false, message: error.message });
  }
});

// 6. Withdraw
app.post('/api/withdraw', async (req, res) => {
  try {
    const { amount, method } = req.body;
    if (!amount || amount < 1) {
      return res.status(200).json({ success: false, message: 'Minimum $1.00' });
    }
    const user = await usersCollection.findOne({});
    if (user.balance < amount) {
      return res.status(200).json({ success: false, message: 'Insufficient balance' });
    }
    await usersCollection.updateOne({}, { $inc: { balance: -amount } });
    return res.status(200).json({ success: true, message: `Withdraw $${amount} via ${method} successful` });
  } catch (error) {
    return res.status(200).json({ success: false, message: error.message });
  }
});