// ================================================================
//  DGDNETWORK API ইন্টিগ্রেশন (টাইমআউট + এরর হ্যান্ডলিং সহ)
// ================================================================
const DGD_API_KEY = 'dgd_4128cad69ecf698ac7915fc81e5d6e9dd417e39ad667701e';
const DGD_BASE = 'https://dgddigital.com/api/v1';

// 1. নাম্বার প্রোভিশন (টাইমআউট সহ)
app.post('/api/dgd/get-number', async (req, res) => {
  try {
    const { range, isNational, removePlus } = req.body;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 সেকেন্ড টাইমআউট

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
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('DGD Response not JSON:', text.substring(0, 200));
      return res.json({ 
        success: false, 
        message: 'API থেকে সঠিক রেসপন্স আসছে না। আপনার API Key সক্রিয় কিনা চেক করুন।',
        raw: text.substring(0, 200)
      });
    }
    
    if (data.ok !== false && data.data) {
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
      res.json({ 
        success: false, 
        message: data?.message || 'নাম্বার পাওয়া যায়নি। ক্রেডিট বা API Key চেক করুন।',
        raw: data 
      });
    }
  } catch (error) {
    console.error('DGD Error:', error);
    if (error.name === 'AbortError') {
      res.json({ success: false, message: 'API টাইমআউট! সার্ভার সাড়া দিচ্ছে না।' });
    } else {
      res.json({ success: false, message: error.message });
    }
  }
});

// 2. OTP চেক (টাইমআউট সহ)
app.get('/api/dgd/check-otp', async (req, res) => {
  try {
    const { number } = req.query;
    if (!number) {
      return res.json({ success: false, message: 'Number is required' });
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${DGD_BASE}/user/checknum?nomor=${encodeURIComponent(number)}`, {
      method: 'GET',
      headers: {
        'X-API-KEY': DGD_API_KEY,
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('DGD Check Response not JSON:', text.substring(0, 200));
      return res.json({ 
        success: false, 
        message: 'API থেকে সঠিক রেসপন্স আসছে না।',
        raw: text.substring(0, 200)
      });
    }
    
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
      res.json({ 
        success: false, 
        message: data?.message || 'কোনো তথ্য পাওয়া যায়নি',
        raw: data 
      });
    }
  } catch (error) {
    console.error('DGD Check Error:', error);
    if (error.name === 'AbortError') {
      res.json({ success: false, message: 'API টাইমআউট! সার্ভার সাড়া দিচ্ছে না।' });
    } else {
      res.json({ success: false, message: error.message });
    }
  }
});

// 3. অটো OTP চেকার (এরর হ্যান্ডলিং সহ)
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
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);

          const response = await fetch(`${DGD_BASE}/user/checknum?nomor=${encodeURIComponent(entry.number)}`, {
            headers: { 'X-API-KEY': DGD_API_KEY, 'Accept': 'application/json' },
            signal: controller.signal
          });
          clearTimeout(timeout);

          const text = await response.text();
          let data;
          try {
            data = JSON.parse(text);
          } catch (e) {
            console.error('OTP Checker JSON Error:', text.substring(0, 100));
            continue;
          }
          
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
        } catch (innerError) {
          console.error('OTP Checker inner error:', innerError.message);
        }
      }
    } catch (error) {
      console.error('OTP Checker Error:', error.message);
    }
  }, 5000);
}

startOtpChecker();