// ==========================================
//  OTP Management Platform - ব্যাকএন্ড API
//  With Supabase Integration
// ==========================================

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ===== মিডলওয়্যার =====
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== স্ট্যাটিক ফাইল =====
app.use(express.static('.'));

// ==========================================
//  🔥 Supabase ক্লায়েন্ট
// ==========================================

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL বা SUPABASE_ANON_KEY সেট করা নেই!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('✅ Supabase সংযোগ স্থাপিত হয়েছে');

// ==========================================
//  📌 কনফিগারেশন
// ==========================================

const CONFIG = {
    DEV_MODE: process.env.NODE_ENV === 'development',
    OTP_EXPIRY_MINUTES: 5,
    USE_REAL_SMS: false
};

// ==========================================
//  🧠 ইউটিলিটি ফাংশন
// ==========================================

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateNumber() {
    const prefixes = ['4473845', '4473846', '4473847', '4473848', '4473849'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return prefix + suffix;
}

function generateOrderId() {
    return 'ORD-' + Date.now().toString(36).toUpperCase() + 
           Math.random().toString(36).substr(2, 4).toUpperCase();
}

// ==========================================
//  📞 OTP জেনারেট ও সেভ (Supabase)
// ==========================================

async function saveOTPToSupabase(phoneNumber, otp, orderId) {
    try {
        const expiresAt = new Date(Date.now() + CONFIG.OTP_EXPIRY_MINUTES * 60 * 1000);
        
        const { data, error } = await supabase
            .from('otp_records')
            .insert([
                {
                    phone_number: phoneNumber,
                    otp: otp,
                    order_id: orderId,
                    expires_at: expiresAt.toISOString(),
                    verified: false,
                    created_at: new Date().toISOString()
                }
            ]);
        
        if (error) {
            console.error('❌ Supabase সেভ করতে ব্যর্থ:', error);
            return { success: false, error: error.message };
        }
        
        console.log(`✅ OTP সেভ করা হয়েছে: ${phoneNumber}`);
        return { success: true, data };
        
    } catch (error) {
        console.error('❌ ডাটাবেস এরর:', error);
        return { success: false, error: error.message };
    }
}

// ==========================================
//  🔍 OTP ভেরিফাই (Supabase)
// ==========================================

async function verifyOTPFromSupabase(phoneNumber, otp) {
    try {
        const { data, error } = await supabase
            .from('otp_records')
            .select('*')
            .eq('phone_number', phoneNumber)
            .eq('otp', otp)
            .eq('verified', false)
            .single();
        
        if (error || !data) {
            return { 
                success: false, 
                message: 'OTP পাওয়া যায়নি বা ইতিমধ্যে ব্যবহার করা হয়েছে' 
            };
        }
        
        const expiresAt = new Date(data.expires_at);
        if (Date.now() > expiresAt.getTime()) {
            return { 
                success: false, 
                message: 'OTP এর মেয়াদ শেষ হয়েছে' 
            };
        }
        
        const { error: updateError } = await supabase
            .from('otp_records')
            .update({ verified: true, verified_at: new Date().toISOString() })
            .eq('id', data.id);
        
        if (updateError) {
            console.error('❌ আপডেট করতে ব্যর্থ:', updateError);
            return { success: false, message: 'OTP ভেরিফাই করতে ব্যর্থ' };
        }
        
        return { 
            success: true, 
            message: '✅ OTP সঠিক!',
            data: data
        };
        
    } catch (error) {
        console.error('❌ ভেরিফাই এরর:', error);
        return { success: false, message: 'সার্ভার ত্রুটি' };
    }
}

// ==========================================
//  🔥 API এন্ডপয়েন্টসমূহ
// ==========================================

// ১. নতুন নম্বর ও OTP জেনারেট
app.post('/api/get-otp', async (req, res) => {
    console.log('📥 নতুন OTP রিকোয়েস্ট');
    
    try {
        const phoneNumber = generateNumber();
        const otp = generateOTP();
        const orderId = generateOrderId();
        
        const result = await saveOTPToSupabase(phoneNumber, otp, orderId);
        
        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'OTP সেভ করতে ব্যর্থ',
                error: result.error
            });
        }
        
        console.log(`📞 নতুন নম্বর: ${phoneNumber}, OTP: ${otp}`);
        
        res.json({
            success: true,
            number: phoneNumber,
            orderId: orderId,
            otp: CONFIG.DEV_MODE ? otp : null,
            message: CONFIG.DEV_MODE ? 
                'ডেভ মোড: OTP জেনারেট হয়েছে' : 
                'OTP জেনারেট হয়েছে',
            expiresIn: `${CONFIG.OTP_EXPIRY_MINUTES} মিনিট`
        });
        
    } catch (error) {
        console.error('❌ OTP জেনারেট করতে ব্যর্থ:', error);
        res.status(500).json({
            success: false,
            message: 'সার্ভার ত্রুটি',
            error: error.message
        });
    }
});

// ২. OTP ভেরিফাই
app.post('/api/verify-otp', async (req, res) => {
    const { phoneNumber, otp } = req.body;
    
    console.log(`🔍 OTP চেক: ${phoneNumber} -> ${otp}`);
    
    if (!phoneNumber || !otp) {
        return res.status(400).json({
            success: false,
            message: 'ফোন নম্বর ও OTP প্রদান করুন'
        });
    }
    
    const result = await verifyOTPFromSupabase(phoneNumber, otp);
    res.json(result);
});

// ৩. নম্বরের OTP স্ট্যাটাস
app.get('/api/otp-status/:phoneNumber', async (req, res) => {
    const { phoneNumber } = req.params;
    
    try {
        const { data, error } = await supabase
            .from('otp_records')
            .select('*')
            .eq('phone_number', phoneNumber)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        
        if (error || !data) {
            return res.json({
                success: false,
                message: 'নম্বরটি পাওয়া যায়নি'
            });
        }
        
        res.json({
            success: true,
            number: data.phone_number,
            orderId: data.order_id,
            verified: data.verified,
            expiresAt: data.expires_at,
            timeLeft: Math.max(0, Math.floor((new Date(data.expires_at) - Date.now()) / 1000)) + ' সেকেন্ড'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'সার্ভার ত্রুটি'
        });
    }
});

// ৪. সব OTP তালিকা (অ্যাডমিন)
app.get('/api/all-otps', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('otp_records')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (error) {
            return res.status(500).json({
                success: false,
                message: 'ডেটা আনতে ব্যর্থ'
            });
        }
        
        res.json({
            success: true,
            count: data.length,
            data: data
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'সার্ভার ত্রুটি'
        });
    }
});

// ৫. হেলথ চেক
app.get('/api/health', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('otp_records')
            .select('count')
            .limit(1);
        
        res.json({
            status: '🟢 OK',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            supabase: error ? '❌ সংযোগ নেই' : '✅ সংযুক্ত',
            env: process.env.NODE_ENV || 'development'
        });
        
    } catch (error) {
        res.status(500).json({
            status: '🔴 ERROR',
            message: error.message
        });
    }
});

// ৬. হোম রুট
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// ==========================================
//  🚀 সার্ভার চালু
// ==========================================

app.listen(PORT, () => {
    console.log(`\n🚀 OTP Platform চালু হয়েছে!`);
    console.log(`📡 http://localhost:${PORT}`);
    console.log(`🔗 Supabase: ${supabaseUrl ? '✅ সংযুক্ত' : '❌ নেই'}`);
    console.log(`🧪 ডেভ মোড: ${CONFIG.DEV_MODE ? 'চালু ✅' : 'বন্ধ ❌'}`);
    console.log(`⏰ OTP মেয়াদ: ${CONFIG.OTP_EXPIRY_MINUTES} মিনিট\n`);
});

// ===== এরর হ্যান্ডলিং =====
process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('💥 Unhandled Rejection:', err);
});
