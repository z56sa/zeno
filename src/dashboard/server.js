// ==========================================
// FILE: src/dashboard/server.js
// ==========================================

const express = require('express');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session); // 1. استدعاء مكتبة تخزين الجلسات في بورتغريس
const { Pool } = require('pg');                        // 2. استدعاء مكتبة الاتصال بقاعدة البيانات
const axios = require('axios');
const app = express();

// مفيد جداً لبروتوكولات الإحالة خلف بروكسي Railway
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 3. إعداد اتصال قاعدة البيانات (PostgreSQL) في Railway
const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // مطلوبة للاتصال الآمن مع Railway
    }
});

// 4. إعداد الجلسات (Sessions) لتخزينها في قاعدة البيانات بدلاً من الذاكرة العشوائية
app.use(session({
    store: new pgSession({
        pool: pgPool,                           // استخدام الـ pool المعرف أعلاه
        tableName: 'session',        // اسم الجدول الذي سيتم إنشاؤه تلقائياً في قاعدة البيانات
        createTableIfMissing: true   // إنشاء الجدول تلقائياً إذا لم يكن موجوداً
    }),
    secret: process.env.SESSION_SECRET || 'zeno_secret_key_change_this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // آمن ومتوافق تماماً مع HTTPS في Railway
        maxAge: 30 * 24 * 60 * 60 * 1000 // مدة الجلسة (30 يوم)
    }
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

    const REDIRECT_URI = encodeURIComponent("https://zeno-production-b6d7.up.railway.app/auth/discord/callback");
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=identify`;

    res.redirect(discordAuthUrl);
});

// 2. مسار استقبال الـ Callback بعد موافقة المستخدم
app.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.redirect('/?error=no_code');
    }

    try {
        const REDIRECT_URI = "https://zeno-production-b6d7.up.railway.app/auth/discord/callback";

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

        const userResult = await axios.get('https://discord.com/api/users/@me', {
            headers: {
                authorization: `Bearer ${accessToken}`,
            },
        });

        req.session.user = userResult.data;
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

// مسار لوحة التحكم
app.get('/dashboard', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/auth/discord');
    }

    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

module.exports = app;