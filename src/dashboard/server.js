// ========================================================
// FILE: src/dashboard/server.js
// ========================================================
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');

module.exports = function (app) {
    // 1. الاتصال بقاعدة البيانات
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
            ? { rejectUnauthorized: false }
            : false
    });

    pool.on('error', (err) => console.error('⚠️ Database Error:', err));

    app.set('trust proxy', 1);
    app.use(express.static('public'));

    // 2. إعداد نظام الجلسات (مع تعطيل إنشاء الجدول لأنه موجود مسبقاً لتجنب الخطأ)
    app.use(session({
        store: new pgSession({
            pool: pool,
            tableName: 'user_sessions',
            createTableIfMissing: false, // هنا الحل الجذري للمشكلة اللي ظهرت لك
        }),
        secret: process.env.SESSION_SECRET || 'ZENO_TICKETS_SUPER_SECRET',
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 86400000,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        }
    }));

    // ==========================================
    // الصفحة الرئيسية
    // ==========================================
    app.get('/', (req, res) => {
        const user = req.session?.user;
        const error = req.query.error;

        const userAvatar = user?.avatar
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=128`
            : 'https://cdn.discordapp.com/embed/avatars/0.png';

        res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl" class="dark">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>ZENO TICKETS - الرئيسية</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800;900&display=swap" rel="stylesheet">
            <style>
                html, body { background-color: #08080a !important; color: #ffffff !important; font-family: 'Cairo', sans-serif !important; }
                .purple-glow { background: radial-gradient(circle at 50% 30%, rgba(168, 85, 247, 0.15), transparent 70%); }
                .glass-card { background-color: #12121a !important; border: 1px solid #232334 !important; }
            </style>
        </head>
        <body class="min-h-screen flex flex-col justify-between purple-glow">
            <header class="bg-[#0b0b10]/95 border-b border-[#1f1f2e] sticky top-0 z-50 backdrop-blur-md">
                <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <a href="/" class="flex items-center gap-3">
                        <div class="w-11 h-11 rounded-full border-2 border-purple-500/50 flex items-center justify-center bg-[#12121a] overflow-hidden">
                            <img src="/logo.png" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" class="w-full h-full object-cover">
                        </div>
                        <span class="text-xl font-black tracking-[0.25em]">Z E N O</span>
                    </a>
                    <div>
                        ${user ? `
                            <div class="flex items-center gap-3">
                                <a href="/dashboard" class="flex items-center gap-2 bg-[#13131c] border border-[#232334] px-4 py-2 rounded-xl hover:border-purple-500/50 transition">
                                    <img src="${userAvatar}" class="w-7 h-7 rounded-lg object-cover">
                                    <span class="text-sm font-bold">${user.username}</span>
                                </a>
                                <a href="/logout" class="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-sm font-bold transition">خروج</a>
                            </div>
                        ` : `
                            <a href="/auth/discord" class="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-bold transition shadow-lg shadow-purple-600/30">تسجيل الدخول</a>
                        `}
                    </div>
                </div>
            </header>

            <main class="max-w-4xl mx-auto px-6 py-20 text-center flex-1 flex flex-col items-center justify-center">
                <div class="inline-flex items-center gap-2 bg-[#181824] border border-purple-500/30 px-4 py-1.5 rounded-full text-xs font-bold text-purple-300 mb-6">✨ لوحة تحكم ZENO TICKETS</div>
                <h1 class="text-4xl md:text-6xl font-black mb-6">نظام تذاكر ديسكورد <span class="text-purple-400">الاحترافي</span></h1>
                <p class="text-gray-400 text-sm md:text-base max-w-2xl mb-10 font-semibold leading-relaxed">أفضل حل لإدارة خوادم الديسكورد، بناء نظام تذاكر متطور، وحماية مجتمعك بأدوات إشرافية ذكية وقابلة للتخصيص بالكامل.</p>
                <div class="flex flex-wrap gap-4 justify-center">
                    <a href="/dashboard" class="px-8 py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-sm transition shadow-lg shadow-purple-600/30 hover:scale-105">الدخول للوحة التحكم</a>
                </div>
            </main>
        </body>
        </html>
        `);
    });

    // ==========================================
    // مسار المصادقة (دخول الديسكورد)
    // ==========================================
    app.get('/auth/discord', (req, res) => {
        const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
        const redirectUri = encodeURIComponent(`${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}/auth/discord/callback`);
        res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20guilds`);
    });

    // ==========================================
    // الـ Callback 
    // ==========================================
    app.get('/auth/discord/callback', async (req, res) => {
        const code = req.query.code;
        if (!code) return res.redirect('/?error=no_code_provided');

        try {
            const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
            const clientSecret = process.env.CLIENT_SECRET || process.env.DISCORD_CLIENT_SECRET;
            const redirectUri = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}/auth/discord/callback`;

            const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: redirectUri
                }),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            if (!tokenRes.ok) throw new Error('Failed to get token');
            const tokenData = await tokenRes.json();

            const [userRes, guildsRes] = await Promise.all([
                fetch('https://discord.com/api/users/@me', { headers: { authorization: `Bearer ${tokenData.access_token}` } }),
                fetch('https://discord.com/api/users/@me/guilds', { headers: { authorization: `Bearer ${tokenData.access_token}` } })
            ]);

            req.session.user = await userRes.json();
            const allGuilds = await guildsRes.json();

            req.session.guilds = Array.isArray(allGuilds)
                ? allGuilds.filter(g => (g.permissions & 0x8) === 0x8 || (g.permissions & 0x20) === 0x20)
                : [];

            req.session.save((err) => {
                if (err) console.error("Session Save Error:", err);
                res.redirect('/dashboard');
            });
        } catch (error) {
            console.error("Auth Error:", error);
            res.redirect('/');
        }
    });

    // ==========================================
    // لوحة التحكم (السيرفرات بالتصميم الكامل)
    // ==========================================
    app.get('/dashboard', (req, res) => {
        if (!req.session?.user) return res.redirect('/auth/discord');

        const user = req.session.user;
        const guilds = req.session.guilds || [];

        const guildsHtml = guilds.length > 0 ? guilds.map(guild => `
            <div class="glass-card rounded-2xl p-5 flex flex-col justify-between hover:border-purple-500/50 transition duration-300 group shadow-lg">
                <div class="flex items-center gap-4 mb-5">
                    <img src="${guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                         class="w-16 h-16 rounded-2xl object-cover border border-[#232334] group-hover:border-purple-500/50 transition">
                    <div>
                        <h3 class="font-bold text-white text-lg line-clamp-1">${guild.name}</h3>
                        <p class="text-xs text-gray-400 mt-1">صلاحيات الإدارة متوفرة</p>
                    </div>
                </div>
                <a href="/dashboard/${guild.id}" class="w-full text-center bg-[#181824] hover:bg-purple-600 text-white border border-[#232334] hover:border-purple-500 py-2.5 rounded-xl text-sm font-bold transition shadow-md shadow-purple-600/20">
                    إدارة الإعدادات
                </a>
            </div>
        `).join('') : `
            <div class="col-span-full text-center py-16 glass-card rounded-2xl">
                <div class="text-4xl mb-4">⚙️</div>
                <h3 class="text-xl font-bold text-white mb-2">لا توجد سيرفرات</h3>
                <p class="text-gray-400 text-sm">لم يتم العثور على سيرفرات تمتلك فيها صلاحية الإدارة.</p>
            </div>
        `;

        res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl" class="dark">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>لوحة التحكم - ZENO TICKETS</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800;900&display=swap" rel="stylesheet">
            <style>
                html, body { background-color: #08080a !important; color: #ffffff !important; font-family: 'Cairo', sans-serif !important; }
                .glass-card { background-color: #12121a !important; border: 1px solid #232334 !important; }
            </style>
        </head>
        <body class="min-h-screen flex flex-col">
            <header class="bg-[#0b0b10] border-b border-[#1f1f2e] sticky top-0 z-50">
                <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <a href="/" class="text-gray-400 hover:text-white transition font-bold text-sm bg-[#12121a] border border-[#232334] px-4 py-2 rounded-xl">العودة للرئيسية</a>
                        <h1 class="text-xl font-black text-white hidden sm:block">لوحة تحكم السيرفرات</h1>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="text-sm font-bold text-purple-300 bg-purple-500/10 border border-purple-500/20 px-4 py-2 rounded-xl flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            ${user.username}
                        </span>
                    </div>
                </div>
            </header>

            <main class="flex-1 max-w-7xl mx-auto w-full px-6 py-12">
                <div class="mb-8">
                    <h2 class="text-2xl font-black text-white mb-2">اختر سيرفر</h2>
                    <p class="text-gray-400 text-sm font-semibold">قم باختيار السيرفر الذي ترغب في ضبط إعدادات ZENO TICKETS داخله.</p>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    ${guildsHtml}
                </div>
            </main>
        </body>
        </html>
        `);
    });

    app.get('/logout', (req, res) => {
        req.session.destroy(() => {
            res.redirect('/');
        });
    });
};