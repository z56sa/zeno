// ========================================================
// FILE: src/dashboard/server.js
// ========================================================
const express = require('express');
const session = require('express-session');

module.exports = function (app) {
    // استخدمنا الذاكرة المؤقتة لتجاوز مشاكل قاعدة البيانات حالياً
    const sessionStore = new session.MemoryStore();

    app.set('trust proxy', 1);
    app.use(express.static('public'));

    // إعداد الجلسات
    app.use(session({
        store: sessionStore,
        secret: process.env.SESSION_SECRET || 'ZENO_TICKETS_SUPER_SECRET',
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 86400000,
            secure: false, // تم تعطيلها مؤقتاً لتجنب مشاكل التشفير
            sameSite: 'lax'
        }
    }));

    // ==========================================
    // الصفحة الرئيسية
    // ==========================================
    app.get('/', (req, res) => {
        try {
            const user = req.session?.user;
            res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>ZENO TICKETS</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
                <style>
                    body { background-color: #121317; color: #ffffff; font-family: 'Cairo', sans-serif; }
                </style>
            </head>
            <body class="flex flex-col items-center justify-center min-h-screen">
                <h1 class="text-5xl font-extrabold mb-4">اصنع خادم ديسكورد <span class="text-purple-500">احترافي!</span></h1>
                <p class="text-gray-400 mb-8 max-w-lg text-center leading-relaxed">بوت متعدد الأغراض قابل للتخصيص جدًا حيث يوفر لك تخصيص رسائل ترحيبية وسجلات متعمقة وأدوات إشراف قوية.</p>
                ${user
                    ? `<a href="/dashboard" class="px-8 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-bold transition">الذهاب للوحة التحكم</a>`
                    : `<a href="/auth/discord" class="px-8 py-3 bg-[#5865F2] hover:bg-[#4752C4] rounded-lg font-bold transition flex items-center gap-2">إضافة البوت في Discord</a>`
                }
            </body>
            </html>
            `);
        } catch (error) {
            res.status(500).send("حدث خطأ في تحميل الصفحة الرئيسية.");
        }
    });

    // ==========================================
    // المصادقة مع ديسكورد
    // ==========================================
    app.get('/auth/discord', (req, res) => {
        const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
        const redirectUri = encodeURIComponent(`${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}/auth/discord/callback`);
        res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20guilds`);
    });

    app.get('/auth/discord/callback', async (req, res) => {
        const code = req.query.code;
        if (!code) return res.redirect('/');
        try {
            const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
            const clientSecret = process.env.CLIENT_SECRET || process.env.DISCORD_CLIENT_SECRET;
            const redirectUri = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}/auth/discord/callback`;

            const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            const tokenData = await tokenRes.json();

            const [userRes, guildsRes] = await Promise.all([
                fetch('https://discord.com/api/users/@me', { headers: { authorization: `Bearer ${tokenData.access_token}` } }),
                fetch('https://discord.com/api/users/@me/guilds', { headers: { authorization: `Bearer ${tokenData.access_token}` } })
            ]);

            req.session.user = await userRes.json();
            const allGuilds = await guildsRes.json();
            req.session.guilds = Array.isArray(allGuilds) ? allGuilds.filter(g => (g.permissions & 0x8) === 0x8 || (g.permissions & 0x20) === 0x20) : [];

            req.session.save(() => res.redirect('/dashboard'));
        } catch (error) {
            console.error("Auth Error:", error);
            res.redirect('/');
        }
    });

    // ==========================================
    // لوحة التحكم (بتصميم مستوحى من ProBot)
    // ==========================================
    app.get('/dashboard', (req, res) => {
        try {
            if (!req.session?.user) return res.redirect('/auth/discord');
            const user = req.session.user;
            const guilds = req.session.guilds || [];

            const userAvatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

            const guildsHtml = guilds.length > 0 ? guilds.map(guild => `
                <a href="/dashboard/${guild.id}" class="bg-[#1f2026] border border-[#2a2b33] rounded-xl p-5 flex items-center justify-between hover:border-purple-500 transition group">
                    <div class="flex items-center gap-4">
                        <img src="${guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-14 h-14 rounded-full bg-[#121317]">
                        <div>
                            <h3 class="font-bold text-white group-hover:text-purple-400 transition">${guild.name}</h3>
                            <p class="text-xs text-gray-500 mt-1">مدير السيرفر</p>
                        </div>
                    </div>
                    <div class="bg-[#2a2b33] p-2 rounded-lg text-gray-400 group-hover:bg-purple-600 group-hover:text-white transition">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                    </div>
                </a>
            `).join('') : '<p class="text-gray-400">لا توجد سيرفرات.</p>';

            res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>لوحة التحكم | ZENO</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
                <style>
                    body { background-color: #121317; color: #d1d5db; font-family: 'Cairo', sans-serif; overflow-x: hidden; }
                    .sidebar-bg { background-color: #1a1b20; border-left: 1px solid #23242a; }
                </style>
            </head>
            <body class="flex h-screen overflow-hidden">
                
                <!-- الشريط الجانبي (مستوحى من برو بوت) -->
                <aside class="w-72 sidebar-bg h-full flex flex-col hidden md:flex">
                    <div class="p-6 border-b border-[#23242a] flex items-center gap-3">
                        <div class="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center font-bold text-white text-xl">Z</div>
                        <span class="font-black text-xl text-white">ZENO BOT</span>
                    </div>
                    
                    <div class="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
                        <!-- البروفايل -->
                        <div class="flex flex-col items-center bg-[#23242a] p-4 rounded-xl">
                            <img src="${userAvatar}" class="w-20 h-20 rounded-full border-4 border-[#1a1b20] mb-2">
                            <h2 class="font-bold text-white">${user.username}</h2>
                            <a href="/logout" class="text-xs text-red-400 hover:text-red-300 mt-2">تسجيل الخروج</a>
                        </div>

                        <!-- القائمة -->
                        <div>
                            <h4 class="text-xs font-bold text-gray-500 mb-2 px-2">قائمة الخصائص</h4>
                            <ul class="space-y-1">
                                <li><a href="#" class="block px-3 py-2 text-sm text-white bg-purple-600 rounded-lg font-semibold">🏠 اختيار السيرفر</a></li>
                                <li><a href="#" class="block px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-[#23242a] rounded-lg transition">⚙️ إعدادات الحساب</a></li>
                            </ul>
                        </div>
                    </div>
                </aside>

                <!-- المحتوى الرئيسي -->
                <main class="flex-1 h-full overflow-y-auto bg-[#121317] p-8 md:p-12">
                    <header class="flex justify-between items-center mb-10">
                        <div>
                            <h2 class="text-3xl font-bold text-white">اختيار السيرفر</h2>
                            <p class="text-gray-400 mt-2 text-sm">قم باختيار السيرفر الذي ترغب بإدارته من القائمة أدناه.</p>
                        </div>
                    </header>

                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        ${guildsHtml}
                    </div>
                </main>

            </body>
            </html>
            `);
        } catch (error) {
            res.status(500).send("حدث خطأ في تحميل لوحة التحكم.");
        }
    });

    app.get('/logout', (req, res) => {
        req.session.destroy(() => res.redirect('/'));
    });
};