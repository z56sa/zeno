// ==========================================
// FILE: src/dashboard/server.js
// ==========================================

const express = require('express');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const axios = require('axios');
const app = express();

app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// قراءة الملفات الثابتة من مجلد public
app.use(express.static(path.join(__dirname, 'public')));

const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

app.use(session({
    store: new pgSession({
        pool: pgPool,
        tableName: 'session',
        createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || 'zeno_secret_key_change_this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000
    }
}));

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// صفحة شروط الاستخدام
app.get('/terms.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

// صفحة سياسة الخصوصية
app.get('/privacy.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

// تسجيل الدخول بـ Discord
app.get('/auth/discord', (req, res) => {
    const CLIENT_ID = process.env.CLIENT_ID;
    if (!CLIENT_ID) {
        return res.status(500).send('Error: CLIENT_ID is not defined in environment variables.');
    }

    const REDIRECT_URI = encodeURIComponent("https://zeno-production-b6d7.up.railway.app/auth/discord/callback");
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=identify%20guilds`;

    res.redirect(discordAuthUrl);
});

// الـ Callback بعد المصادقة
app.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.redirect('/?error=no_code');
    }

    try {
        const REDIRECT_URI = "https://zeno-production-b6d7.up.railway.app/auth/discord/callback";

        const tokenResult = await axios({
            method: 'post',
            url: 'https://discord.com/api/oauth2/token',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64')}`
            },
            data: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI,
            }).toString(),
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

// تسجيل الخروج
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// مسار لوحة التحكم (تم توجيهه ليعرض index.html أو رسالة ترحيبية مؤقتة للمستخدم)
app.get('/dashboard', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/auth/discord');
    }

    // يمكنك تغيير هذا المسار لاحقاً إذا أنشأت ملف dashboard.html خاص
    res.send(`
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>لوحة التحكم - ZENO</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
            <style>body { font-family: 'Cairo', sans-serif; background-color: #0b0f19; color: #fff; }</style>
        </head>
        <body class="flex flex-col items-center justify-center min-h-screen">
            <div class="bg-[#131825] p-8 rounded-2xl border border-gray-800 text-center max-w-md w-full shadow-2xl">
                <h1 class="text-2xl font-bold mb-4 text-indigo-400">مرحباً بك، ${req.session.user.username}#${req.session.user.discriminator || '0'}</h1>
                <p class="text-gray-400 text-sm mb-6">تم تسجيل دخولك بنجاح إلى لوحة تحكم بوت ZENO!</p>
                <div class="flex justify-center gap-4">
                    <a href="/" class="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-bold transition">الرئيسية</a>
                    <a href="/logout" class="px-6 py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-xl text-sm font-bold transition">تسجيل الخروج</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

module.exports = app;