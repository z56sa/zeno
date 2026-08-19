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
app.use(express.static(path.join(__dirname, 'public')));

const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
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

app.get('/terms.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

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

// الـ Callback الجلوس وجلب بيانات المستخدم والسيرفرات
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

        // جلب معلومات المستخدم
        const userResult = await axios.get('https://discord.com/api/users/@me', {
            headers: { authorization: `Bearer ${accessToken}` },
        });

        // جلب سيرفرات المستخدم
        const guildsResult = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: { authorization: `Bearer ${accessToken}` },
        });

        req.session.user = userResult.data;
        // تصفية السيرفرات التي يمتلك فيها المستخدم صلاحية الإدارة (Administrator = 0x8 أو قريبة منها) أو صاحب السيرفر
        req.session.guilds = guildsResult.data.filter(guild => (guild.permissions & 0x8) === 0x8 || guild.owner);

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

// مسار لوحة التحكم الاحترافية الحقيقية
app.get('/dashboard', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/auth/discord');
    }

    const user = req.session.user;
    const guilds = req.session.guilds || [];
    const avatarUrl = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${user.discriminator % 5}.png`;

    // توليد قائمة السيرفرات HTML
    const guildsHtml = guilds.length > 0 ? guilds.map(guild => {
        const guildIcon = guild.icon
            ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
            : `https://cdn.discordapp.com/embed/avatars/0.png`;
        return `
            <div class="bg-[#131825] border border-gray-800 hover:border-indigo-500/50 transition p-4 rounded-2xl flex items-center justify-between shadow-lg">
                <div class="flex items-center gap-4">
                    <img src="${guildIcon}" alt="${guild.name}" class="w-12 h-12 rounded-2xl object-cover border border-gray-700">
                    <div>
                        <h3 class="font-bold text-white text-sm md:text-base">${guild.name}</h3>
                        <span class="text-xs text-indigo-400">مؤهل للإدارة</span>
                    </div>
                </div>
                <a href="/dashboard/${guild.id}" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/30">
                    إدارة السيرفر
                </a>
            </div>
        `;
    }).join('') : `<p class="text-gray-500 text-sm col-span-full text-center py-8">لا توجد سيرفرات تمتلك صلاحيات إدارية فيها.</p>`;

    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>لوحة التحكم - ZENO</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
            <style> body { font-family: 'Cairo', sans-serif; background-color: #0b0f19; color: #fff; } </style>
        </head>
        <body class="min-h-screen flex flex-col justify-between selection:bg-indigo-500 selection:text-white">

            <!-- الهيدر العلوي -->
            <header class="flex items-center justify-between px-8 py-5 border-b border-gray-800/60 bg-[#0b0f19]/80 backdrop-blur-md sticky top-0 z-50">
                <div class="flex items-center gap-3">
                    <span class="text-xl font-black tracking-wider text-indigo-400">ZENO</span>
                    <span class="text-xs bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full border border-indigo-500/20 font-bold">لوحة التحكم</span>
                </div>

                <!-- حساب المستخدم -->
                <div class="flex items-center gap-4">
                    <div class="flex items-center gap-3 bg-[#131825] px-4 py-2 rounded-2xl border border-gray-800">
                        <img src="${avatarUrl}" alt="Avatar" class="w-8 h-8 rounded-full border border-indigo-500">
                        <span class="text-xs font-bold text-gray-200">${user.username}</span>
                    </div>
                    <a href="/logout" class="px-4 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-600/30 rounded-2xl text-xs font-bold transition">
                        تسجيل الخروج
                    </a>
                </div>
            </header>

            <!-- محتوى لوحة التحكم -->
            <main class="max-w-6xl mx-auto px-6 py-12 flex-1 w-full">
                <div class="mb-8">
                    <h1 class="text-2xl md:text-3xl font-black mb-2">اختر خادماً لإدارته</h1>
                    <p class="text-gray-400 text-sm">قم باختيار أحد خوادم ديسكورد التي تمتلك صلاحيات إدارية عليها لتعديل إعدادات بوت ZENO.</p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${guildsHtml}
                </div>
            </main>

            <!-- الفوتر -->
            <footer class="py-6 text-center text-gray-500 text-xs border-t border-gray-800/40">
                جميع الحقوق محفوظة © ZENO BOT 2026 - <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="text-indigo-400 hover:underline">سيرفر الدعم</a>
            </footer>

        </body>
        </html>
    `);
});

module.exports = app;