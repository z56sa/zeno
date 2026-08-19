// ==========================================
// FILE: src/dashboard/server.js
// ==========================================

const express = require('express');
const path = require('path');
const session = require('express-session');
const axios = require('axios'); // تأكد إنك مثبت axios أو استخدم fetch المدمج
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// إعداد الجلسات (Sessions)
app.use(session({
    secret: process.env.SESSION_SECRET || 'zeno_secret_key_change_this',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // اجعلها true إذا كنت تستخدم HTTPS مع بروكسي متقدم، حاليا false مناسبة لريلواي
}));

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 1. مسار توجيه المستخدم لتسجيل الدخول بـ Discord
app.get('/auth/discord', (req, res) => {
    const CLIENT_ID = process.env.CLIENT_ID;
    if (!CLIENT_ID) {
        return res.status(500).send('Error: CLIENT_ID is not defined in environment variables.');
    }

    // تحديد رابط الـ Callback تلقائياً حسب الدومين الحالي في ريلواي
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const REDIRECT_URI = encodeURIComponent(`${protocol}://${req.get('host')}/auth/discord/callback`);

    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=identify%20guilds`;
    res.redirect(discordAuthUrl);
});

// 2. مسار استقبال الـ Callback بعد موافقة المستخدم
app.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.redirect('/?error=no_code');
    }

    try {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const REDIRECT_URI = `${protocol}://${req.get('host')}/auth/discord/callback`;

        // إرسال طلب لـ Discord لتبديل الـ Code بـ Access Token
        const tokenResponseData = new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI,
        });

        const tokenResult = await axios.post('https://discord.com/api/oauth2/token', tokenResponseData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const accessToken = tokenResult.data.access_token;

        // جلب معلومات المستخدم من ديسكورد
        const userResult = await axios.get('https://discord.com/api/users/@me', {
            headers: {
                authorization: `Bearer ${accessToken}`,
            },
        });

        // تخزين بيانات المستخدم في الجلسة
        req.session.user = userResult.data;

        // توجيهه للداشبورد بعد النجاح
        res.redirect('/dashboard');
    } catch (error) {
        console.error('Error during Discord OAuth:', error.response?.data || error.message);
        res.redirect('/?error=auth_failed');
    }
});

// مسار تسجيل الخروج
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// مسار لوحة التحكم (مع التحقق من الجلسة)
app.get('/dashboard', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/auth/discord');
    }

    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

module.exports = app;