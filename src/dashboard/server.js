// ==========================================
// FILE: src/dashboard/server.js
// ==========================================
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
        ? { rejectUnauthorized: false }
        : false
});

module.exports = function (app) {
    app.set('trust proxy', 1);

    app.use(express.static('public'));

    // إعداد الـ Session مع تخزين آمن في PostgreSQL
    app.use(session({
        store: new pgSession({
            pool: pool,
            tableName: 'user_sessions',
            createTableIfMissing: true
        }),
        secret: process.env.SESSION_SECRET || 'zeno_secret_key',
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 86400000,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        }
    }));

    // 1. الصفحة الرئيسية (Landing Page)
    app.get('/', (req, res) => {
        const user = req.session && req.session.user ? req.session.user : null;
        const hasError = req.query.error;

        const userAvatar = user && user.avatar
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}`
            : 'https://cdn.discordapp.com/embed/avatars/0.png';

        res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl" class="dark">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>ZENO BOT - الرئيسية</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800;900&display=swap" rel="stylesheet">
            <style>
                * { box-sizing: border-box; }
                html, body {
                    background-color: #08080a !important;
                    color: #ffffff !important;
                    font-family: 'Cairo', sans-serif !important;
                    margin: 0; padding: 0;
                    scroll-behavior: smooth;
                }
                .purple-glow { background: radial-gradient(circle at 50% 30%, rgba(168, 85, 247, 0.18), transparent 70%); }
                .glass-card { background-color: #12121a !important; border: 1px solid #232334 !important; }
            </style>
        </head>
        <body class="min-h-screen flex flex-col justify-between purple-glow">

            <header class="bg-[#0b0b10]/95 border-b border-[#1f1f2e] sticky top-0 z-50 backdrop-blur-md">
                <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <a href="/" class="flex items-center gap-3">
                        <div class="w-11 h-11 rounded-full overflow-hidden border-2 border-purple-500/50 shadow-lg shadow-purple-600/30 flex items-center justify-center bg-[#12121a] shrink-0">
                            <img src="/logo.png" alt="ZENO" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='/logo.jpg';">
                        </div>
                        <span class="text-xl font-black tracking-[0.25em] text-white">Z E N O</span>
                    </a>
                    <div class="hidden md:flex items-center gap-8 text-xs font-bold text-gray-300">
                        <a href="#features" class="hover:text-purple-400 transition">المميزات</a>
                        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="hover:text-purple-400 transition">سيرفر الدعم الفني</a>
                    </div>
                    <div>
                        ${user ? `
                            <div class="flex items-center gap-3">
                                <a href="/dashboard" class="flex items-center gap-2 bg-[#13131c] border border-[#232334] px-3.5 py-1.5 rounded-xl hover:border-purple-500/50 transition">
                                    <img src="${userAvatar}" class="w-8 h-8 rounded-lg object-cover border border-purple-500/30">
                                    <span class="text-xs font-bold text-white hidden sm:inline">${user.username}</span>
                                </a>
                                <a href="/logout" class="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-bold transition">خروج</a>
                            </div>
                        ` : `
                            <a href="/auth/discord" class="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-purple-600/30">
                                تسجيل الدخول
                            </a>
                        `}
                    </div>
                </div>
            </header>

            ${hasError ? `
                <div class="max-w-xl mx-auto mt-6 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-xs font-bold text-center">
                    حدث خطأ أثناء المصادقة، يرجى المحاولة مرة أخرى.
                </div>
            ` : ''}

            <main class="max-w-4xl mx-auto px-6 py-20 text-center flex-1 flex flex-col items-center justify-center">
                <div class="inline-flex items-center gap-2 bg-[#181824] border border-purple-500/30 px-4 py-1.5 rounded-full text-xs font-bold text-purple-300 mb-6 shadow-md">
                    <span>✨</span>
                    <span>لوحة تحكم متطورة لإدارة سيرفرك</span>
                </div>
                <h1 class="text-4xl md:text-6xl font-black text-white leading-tight mb-6">
                    اصنع خادم ديسكورد <span class="text-purple-400">احترافي!</span>
                </h1>
                <p class="text-gray-300 text-sm md:text-base leading-relaxed max-w-2xl mb-10 font-semibold">
                    بوت متكامل لتوفير نظام التذاكر، الإشراف، الترحيب وأوامر إدارية متقدمة.
                </p>
                <div class="flex flex-wrap items-center justify-center gap-4">
                    <a href="https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || '1506005273893146775'}&permissions=8&scope=bot%20applications.commands" target="_blank" class="px-8 py-3.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-sm transition-all shadow-xl shadow-purple-600/30 hover:scale-105">
                        إضافة البوت في Discord
                    </a>
                    <a href="/dashboard" class="px-8 py-3.5 glass-card hover:bg-[#1a1a26] text-white font-bold rounded-xl text-sm transition-all hover:scale-105">
                        لوحة التحكم
                    </a>
                </div>
            </main>

            <footer class="border-t border-[#1f1f2e] bg-[#060608] py-6 text-center text-gray-400 text-xs font-semibold">
                جميع الحقوق محفوظة © ZENO BOT 2026
            </footer>
        </body>
        </html>
        `);
    });

    // 2. توجيه تسجيل الدخول بـ Discord
    app.get('/auth/discord', (req, res) => {
        const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || '1506005273893146775';
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const redirectUri = encodeURIComponent(`${protocol}://${req.get('host')}/auth/discord/callback`);
        res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20guilds`);
    });

    // 3. مسار الـ Callback الخاص بـ Discord
    app.get('/auth/discord/callback', async (req, res) => {
        const code = req.query.code;
        if (!code) return res.redirect('/?error=no_code');

        try {
            const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || '1506005273893146775';
            const clientSecret = process.env.CLIENT_SECRET || process.env.DISCORD_CLIENT_SECRET;
            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            const redirectUri = `${protocol}://${req.get('host')}/auth/discord/callback`;

            const params = new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri,
            });

            const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                body: params,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const tokenData = await tokenRes.json();

            if (!tokenData.access_token) {
                return res.redirect('/?error=auth_failed');
            }

            const userRes = await fetch('https://discord.com/api/users/@me', {
                headers: { authorization: `${tokenData.token_type} ${tokenData.access_token}` }
            });
            const userData = await userRes.json();

            const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
                headers: { authorization: `${tokenData.token_type} ${tokenData.access_token}` }
            });
            const userGuilds = await guildsRes.json();

            const adminGuilds = Array.isArray(userGuilds)
                ? userGuilds.filter(g => (g.permissions & 0x8) === 0x8 || (g.permissions & 0x20) === 0x20)
                : [];

            req.session.user = userData;
            req.session.guilds = adminGuilds;

            req.session.save(() => {
                res.redirect('/dashboard');
            });

        } catch (err) {
            console.error('OAuth Error:', err);
            res.redirect('/?error=exception');
        }
    });

    // 4. صفحة لوحة التحكم
    app.get('/dashboard', (req, res) => {
        if (!req.session || !req.session.user) {
            return res.redirect('/auth/discord');
        }

        const user = req.session.user;
        const guilds = req.session.guilds || [];

        const avatarFormat = user.avatar && user.avatar.startsWith('a_') ? 'gif' : 'png';
        const avatarUrl = user.avatar
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${avatarFormat}?size=256`
            : `https://cdn.discordapp.com/embed/avatars/0.png`;

        const guildsHtml = guilds.length > 0 ? guilds.map(guild => {
            const iconFormat = guild.icon && guild.icon.startsWith('a_') ? 'gif' : 'png';
            const guildIcon = guild.icon
                ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${iconFormat}?size=256`
                : `https://cdn.discordapp.com/embed/avatars/0.png`;

            return `
            <div data-name="${guild.name}" class="server-card bg-[#12121a] hover:bg-[#181824] border border-[#232334] hover:border-purple-500/50 transition-all duration-300 rounded-2xl p-4 flex items-center justify-between shadow-lg">
                <div class="flex items-center gap-4">
                    <img src="${guildIcon}" alt="${guild.name}" class="w-14 h-14 rounded-2xl object-cover border border-[#2f2f45] shrink-0">
                    <div>
                        <h3 class="font-bold text-white text-base line-clamp-1">${guild.name}</h3>
                        <span class="inline-block text-[11px] text-gray-400 font-semibold mt-0.5">مسؤول (Admin)</span>
                    </div>
                </div>
                <a href="/dashboard/${guild.id}" class="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-600/20 hover:scale-105 shrink-0">
                    تحديد
                </a>
            </div>
            `;
        }).join('') : `
            <div class="col-span-full bg-[#12121a] border border-[#232334] rounded-2xl p-10 text-center">
                <p class="text-gray-400 text-sm font-bold">لا توجد سيرفرات تملك فيها صلاحيات الإدارة.</p>
            </div>
        `;

        res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl" class="dark">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>لوحة التحكم - ZENO</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800;900&display=swap" rel="stylesheet">
            <style>
                html, body { background-color: #08080a !important; color: #ffffff !important; font-family: 'Cairo', sans-serif !important; }
            </style>
        </head>
        <body class="min-h-screen flex flex-col justify-between">
            <header class="bg-[#0b0b10]/95 border-b border-[#1f1f2e] sticky top-0 z-50 backdrop-blur-md">
                <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <a href="/" class="flex items-center gap-3">
                        <div class="w-11 h-11 rounded-full overflow-hidden border-2 border-purple-500/50 flex items-center justify-center bg-[#12121a] shrink-0">
                            <img src="/logo.png" alt="ZENO" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='/logo.jpg';">
                        </div>
                        <span class="text-xl font-black tracking-[0.25em] text-white">Z E N O</span>
                    </a>
                    <div class="flex items-center gap-4">
                        <div class="flex items-center gap-3 bg-[#13131c] border border-[#232334] px-3.5 py-1.5 rounded-xl">
                            <span class="text-xs font-bold text-white hidden sm:inline">${user.username}</span>
                            <img src="${avatarUrl}" class="w-8 h-8 rounded-lg object-cover border border-purple-500/30">
                        </div>
                        <a href="/logout" class="px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-bold transition">خروج</a>
                    </div>
                </div>
            </header>

            <main class="max-w-7xl mx-auto w-full px-6 py-10 flex-1">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-[#1f1f2e] pb-6">
                    <div>
                        <h1 class="text-2xl font-black text-white">سيرفراتي</h1>
                        <p class="text-xs text-gray-400 mt-1">اختر السيرفر الذي ترغب بإدارته</p>
                    </div>
                    <div class="w-full md:w-72">
                        <input type="text" id="searchInput" onkeyup="filterServers()" placeholder="بحث عن سيرفر..." class="w-full bg-[#12121a] border border-[#232334] focus:border-purple-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none transition">
                    </div>
                </div>
                <div id="serversGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${guildsHtml}
                </div>
            </main>

            <footer class="border-t border-[#1f1f2e] bg-[#060608] py-6 text-center text-gray-400 text-xs font-semibold">
                ZENO BOT © 2026 - جميع الحقوق محفوظة
            </footer>

            <script>
                function filterServers() {
                    const input = document.getElementById('searchInput').value.toLowerCase();
                    const cards = document.querySelectorAll('.server-card');
                    cards.forEach(card => {
                        const name = card.getAttribute('data-name').toLowerCase();
                        card.style.display = name.includes(input) ? 'flex' : 'none';
                    });
                }
            </script>
        </body>
        </html>
        `);
    });

    app.get('/logout', (req, res) => {
        if (req.session) {
            req.session.destroy(() => {
                res.redirect('/');
            });
        } else {
            res.redirect('/');
        }
    });
};