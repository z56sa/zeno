const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const { db } = require('../database');

module.exports = function (app, client) {
    const sessionStore = new SqliteStore({
        client: db,
        expired: {
            clear: true,
            intervalMs: 900000 // تنظيف كل 15 دقيقة
        }
    });

    app.set('trust proxy', 1);
    app.use(express.static('public'));

    app.use(session({
        store: sessionStore,
        secret: process.env.SESSION_SECRET || 'ZENO_TICKETS_SUPER_SECRET',
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 86400000 * 7, // 7 أيام
            secure: false,
            sameSite: 'lax'
        }
    }));

    // ========================================================
    // 1. الصفحة الرئيسية (Landing Page)
    // ========================================================
    app.get('/', (req, res) => {
        try {
            const user = req.session?.user;
            const stats = db.prepare ? {
                guilds: client?.guilds?.cache?.size || 0,
                users: client?.users?.cache?.size || 0,
                ping: client?.ws?.ping || 24
            } : { guilds: 0, users: 0, ping: 24 };

            res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>ZENO - بوت ديسكورد الشامل</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                <style>
                    body { background-color: #12131a; color: #ffffff; font-family: 'Cairo', sans-serif; }
                </style>
            </head>
            <body class="min-h-screen flex flex-col bg-[#12131a]">
                <!-- Navbar -->
                <header class="w-full px-8 py-4 bg-[#181924]/80 backdrop-blur-md border-b border-[#232430] flex items-center justify-between sticky top-0 z-50">
                    <div class="flex items-center gap-4">
                        ${user ? `
                            <a href="/dashboard" class="flex items-center gap-2 px-4 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold rounded-xl transition shadow">
                                <span>لوحة التحكم</span>
                            </a>
                        ` : `
                            <a href="/auth/discord" class="flex items-center gap-2 px-5 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold rounded-xl transition shadow">
                                <span>تسجيل الدخول</span>
                            </a>
                        `}
                        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="text-gray-400 hover:text-white text-xs font-bold transition">الدعم الفني</a>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="font-black text-lg tracking-wider text-white">ZENO</span>
                        <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#5865F2] to-purple-600 flex items-center justify-center font-black text-white text-sm shadow">Z</div>
                    </div>
                </header>

                <!-- Hero Section -->
                <main class="flex-1 flex flex-col items-center justify-center text-center px-4 py-20 max-w-4xl mx-auto">
                    <span class="px-4 py-1.5 bg-purple-600/10 border border-purple-500/20 text-purple-300 text-xs font-bold rounded-full mb-6">
                        ★ الجيل المتطور لإدارة وحماية سيرفرات Discord
                    </span>
                    <h1 class="text-4xl md:text-6xl font-black text-white leading-tight mb-6">
                        اصنع مجتمعاً متكاملاً مع <br><span class="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-indigo-300 to-white">ZENO</span>
                    </h1>
                    <p class="text-gray-400 text-sm md:text-base max-w-2xl mb-10 leading-relaxed">
                        نظام سحابي ذكي وشامل يوفر لسيرفرك تذاكر دعم فني فورية مع تقييمات، جدار حماية صارم Anti-Nuke، عملة Star Coin ومتاجر افتراضية، ورومات صوتية تفاعلية.
                    </p>
                    <div class="flex flex-wrap gap-4 items-center justify-center">
                        <a href="/auth/discord" class="px-8 py-3.5 bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-bold rounded-xl transition shadow-lg shadow-[#5865F2]/25">
                            🚀 دعوة البوت لسيرفرك
                        </a>
                        <a href="/dashboard" class="px-8 py-3.5 bg-[#1e1f2b] hover:bg-[#282937] text-gray-200 text-sm font-bold rounded-xl border border-[#2d2e3d] transition">
                            ⚙️ الدخول للوحة التحكم
                        </a>
                    </div>

                    <!-- Live Stats -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mt-16 text-center">
                        <div class="bg-[#181924] border border-[#232430] p-5 rounded-2xl">
                            <p class="text-xl font-black text-white">${stats.guilds}</p>
                            <p class="text-gray-400 text-xs mt-1">سيرفرات نشطة</p>
                        </div>
                        <div class="bg-[#181924] border border-[#232430] p-5 rounded-2xl">
                            <p class="text-xl font-black text-white">${stats.users}</p>
                            <p class="text-gray-400 text-xs mt-1">أعضاء يخدمهم</p>
                        </div>
                        <div class="bg-[#181924] border border-[#232430] p-5 rounded-2xl">
                            <p class="text-xl font-black text-emerald-400">${stats.ping}ms</p>
                            <p class="text-gray-400 text-xs mt-1">استجابة البث الحية</p>
                        </div>
                        <div class="bg-[#181924] border border-[#232430] p-5 rounded-2xl">
                            <p class="text-xl font-black text-purple-400">100%</p>
                            <p class="text-gray-400 text-xs mt-1">جاهزية الحماية (نشط)</p>
                        </div>
                    </div>
                </main>
            </body>
            </html>
            `);
        } catch (e) {
            res.status(500).send("Error");
        }
    });

    // ========================================================
    // 2. مصادقة ديسكورد OAuth2
    // ========================================================
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
            res.redirect('/');
        }
    });

    app.get('/logout', (req, res) => {
        req.session.destroy(() => res.redirect('/'));
    });

    // ========================================================
    // 3. لوحة المستخدم واختيار السيرفرات (مطابقة تماماً لـ ProBot Dashboard)
    // ========================================================
    app.get('/dashboard', (req, res) => {
        try {
            if (!req.session?.user) return res.redirect('/auth/discord');
            const user = req.session.user;
            const guilds = req.session.guilds || [];
            const userAvatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

            // جلب بيانات المستخدم من SQLite
            const userRow = db.prepare('SELECT SUM(coins) as coins, MAX(level) as level, SUM(xp) as xp FROM users WHERE user_id = ?').get(user.id);
            const userCoins = userRow?.coins || 0;
            const userLevel = userRow?.level || 1;
            const userStars = db.prepare('SELECT COUNT(*) as count FROM stars WHERE receiver_id = ?').get(user.id)?.count || 0;

            // قائمة السيرفرات على الشريط الرأسي الأيمن (Server Rail)
            const serverRailHtml = guilds.map(g => `
                <a href="/dashboard/${g.id}" title="${g.name}" class="group relative flex items-center justify-center">
                    <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                         class="w-11 h-11 rounded-2xl bg-[#1e1f2b] hover:rounded-xl border border-transparent hover:border-[#5865F2] object-cover transition-all duration-200">
                </a>
            `).join('');

            res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>لوحة التحكم | ZENO</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                <style>
                    body { background-color: #171821; color: #d1d5db; font-family: 'Cairo', sans-serif; }
                    ::-webkit-scrollbar { width: 5px; height: 5px; }
                    ::-webkit-scrollbar-thumb { background: #282937; border-radius: 10px; }
                </style>
            </head>
            <body class="min-h-screen flex flex-col bg-[#171821] text-gray-200">

                <!-- Header -->
                <header class="h-14 bg-[#1e1f2b] border-b border-[#282937] px-6 flex items-center justify-between z-50">
                    <div class="flex items-center gap-4">
                        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="text-xs text-gray-400 hover:text-white flex items-center gap-1.5">
                            <span>الدعم الفني</span>
                        </a>
                        <span class="text-gray-600">|</span>
                        <a href="/#commands" class="text-xs text-gray-400 hover:text-white flex items-center gap-1.5">
                            <span>الأوامر</span>
                        </a>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-black text-sm text-white tracking-wide">ZENO</span>
                        <div class="w-7 h-7 rounded-lg bg-[#5865F2] flex items-center justify-center text-white font-black text-xs">Z</div>
                    </div>
                </header>

                <div class="flex-1 flex overflow-hidden">
                    
                    <!-- Main Content (Left in RTL) -->
                    <main class="flex-1 p-8 overflow-y-auto">
                        <!-- User Stats Header (ProBot Style Cards) -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                            <!-- الكريدت -->
                            <div class="bg-[#1e1f2b] border border-[#282937] rounded-2xl p-5 flex items-center justify-between shadow-lg">
                                <div class="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center text-xl font-bold font-mono">¢</div>
                                <div class="text-right">
                                    <span class="text-xs font-bold text-gray-400">الكريدت</span>
                                    <h3 class="text-2xl font-black text-white mt-0.5">${userCoins.toLocaleString()}</h3>
                                </div>
                            </div>
                            <!-- المستوى -->
                            <div class="bg-[#1e1f2b] border border-[#282937] rounded-2xl p-5 flex items-center justify-between shadow-lg">
                                <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center text-xl">⭐</div>
                                <div class="text-right">
                                    <span class="text-xs font-bold text-gray-400">المستوى</span>
                                    <h3 class="text-2xl font-black text-white mt-0.5">${userLevel}</h3>
                                </div>
                            </div>
                            <!-- الترتيب -->
                            <div class="bg-[#1e1f2b] border border-[#282937] rounded-2xl p-5 flex items-center justify-between shadow-lg">
                                <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xl">🏆</div>
                                <div class="text-right">
                                    <span class="text-xs font-bold text-gray-400">الترتيب</span>
                                    <h3 class="text-2xl font-black text-white mt-0.5">#1</h3>
                                </div>
                            </div>
                            <!-- السمعة -->
                            <div class="bg-[#1e1f2b] border border-[#282937] rounded-2xl p-5 flex items-center justify-between shadow-lg">
                                <div class="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center text-xl">✨</div>
                                <div class="text-right">
                                    <span class="text-xs font-bold text-gray-400">السمعة</span>
                                    <h3 class="text-2xl font-black text-white mt-0.5">${userStars}</h3>
                                </div>
                            </div>
                        </div>

                        <!-- خوادمك للبدء -->
                        <div class="bg-[#1e1f2b] border border-[#282937] rounded-2xl p-6 shadow-xl">
                            <h3 class="text-sm font-black text-white mb-4 text-right">خوادمك المتاحة للإدارة</h3>
                            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                ${guilds.map(g => `
                                    <a href="/dashboard/${g.id}" class="bg-[#171821] hover:bg-[#232432] border border-[#282937] hover:border-[#5865F2] p-4 rounded-xl flex items-center justify-between transition-all group">
                                        <div class="w-8 h-8 rounded-lg bg-[#282937] flex items-center justify-center text-gray-400 group-hover:text-white transition">
                                            <svg class="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                                        </div>
                                        <div class="flex items-center gap-3 text-right">
                                            <div>
                                                <h4 class="text-xs font-bold text-white group-hover:text-[#5865F2] transition truncate max-w-[150px]">${g.name}</h4>
                                                <span class="text-[10px] text-gray-500 font-bold">صلاحية إدارية</span>
                                            </div>
                                            <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-10 h-10 rounded-xl object-cover bg-[#1e1f2b]">
                                        </div>
                                    </a>
                                `).join('')}
                            </div>
                        </div>
                    </main>

                    <!-- Sidebar Right (ProBot Menu) -->
                    <aside class="w-64 bg-[#1e1f2b] border-l border-[#282937] p-5 flex flex-col justify-between shrink-0">
                        <div>
                            <!-- User Profile Box -->
                            <div class="flex flex-col items-center text-center pb-5 mb-4 border-b border-[#282937]">
                                <img src="${userAvatar}" class="w-16 h-16 rounded-full border-2 border-[#5865F2] shadow-lg mb-2 object-cover">
                                <h3 class="font-bold text-white text-sm">${user.username}</h3>
                            </div>

                            <!-- Nav Links -->
                            <div class="flex flex-col gap-1 text-xs text-right overflow-y-auto pr-1">
                                <span class="text-[10px] font-bold text-gray-500 px-3 py-1">عام</span>
                                <a href="/dashboard" class="px-3 py-2 rounded-xl bg-[#5865F2] text-white font-bold flex items-center justify-between">
                                    <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
                                    <span>نظرة عامة</span>
                                </a>

                                <span class="text-[10px] font-bold text-gray-500 px-3 pt-3 pb-1">متاجر الكريدت</span>
                                <a href="#wallpapers" class="px-3 py-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-end gap-2">
                                    <span>خلفيات البروفايل</span>
                                    <span>🖼️</span>
                                </a>
                                <a href="#badges" class="px-3 py-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-end gap-2">
                                    <span>شارات البروفايل</span>
                                    <span>🎖️</span>
                                </a>
                                <a href="#identity" class="px-3 py-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-end gap-2">
                                    <span>خلفيات الهوية</span>
                                    <span>🪪</span>
                                </a>

                                <span class="text-[10px] font-bold text-gray-500 px-3 pt-3 pb-1">قائمة المتصدرين</span>
                                <a href="/#leaderboard" class="px-3 py-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-end gap-2">
                                    <span>أعلى 100 بواسطة XP</span>
                                    <span>🏆</span>
                                </a>
                                <a href="/#rich" class="px-3 py-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-end gap-2">
                                    <span>أغنى 100 ملياردير</span>
                                    <span>💰</span>
                                </a>
                                <a href="#rep" class="px-3 py-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-end gap-2">
                                    <span>أعلى 100 نقاط السمعة</span>
                                    <span>⭐</span>
                                </a>

                                <span class="text-[10px] font-bold text-gray-500 px-3 pt-3 pb-1">أخرى</span>
                                <a href="/#daily" class="px-3 py-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-end gap-2">
                                    <span>احصل على مكافأتك اليومية</span>
                                    <span>🎁</span>
                                </a>
                                <a href="#vote" class="px-3 py-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-end gap-2">
                                    <span>التصويت</span>
                                    <span>👍</span>
                                </a>
                                <a href="#transfers" class="px-3 py-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-end gap-2">
                                    <span>سجل عمليات الكريدت</span>
                                    <span>🔄</span>
                                </a>
                            </div>
                        </div>

                        <!-- Logout -->
                        <a href="/logout" class="px-3 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 text-xs font-bold text-right flex items-center justify-end gap-2 transition mt-2 border-t border-[#282937] pt-3">
                            <span>خروج</span>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                        </a>
                    </aside>

                    <!-- Server Rail (Far Right Column) -->
                    <div class="w-16 bg-[#12131a] border-l border-[#282937] py-4 flex flex-col items-center gap-3 shrink-0 overflow-y-auto">
                        <a href="/dashboard" class="w-11 h-11 rounded-2xl bg-[#5865F2] flex items-center justify-center text-white font-black text-sm shadow">Z</a>
                        <div class="w-8 h-[1px] bg-[#282937]"></div>
                        ${serverRailHtml}
                    </div>

                </div>
            </body>
            </html>
            `);
        } catch (error) {
            res.status(500).send("Error");
        }
    });

    // ========================================================
    // 4. صفحة السيرفر الداخلية المخصصة (ProBot Exact Server Management)
    // ========================================================
    app.get('/dashboard/:guildId', (req, res) => {
        try {
            if (!req.session?.user) return res.redirect('/auth/discord');
            const guildId = req.params.guildId;
            const guilds = req.session.guilds || [];
            const guild = guilds.find(g => g.id === guildId);
            const user = req.session.user;

            if (!guild) return res.redirect('/dashboard');

            const userAvatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
            const guildIcon = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

            // الشريط الرأسي الأيمن للسيرفرات
            const serverRailHtml = guilds.map(g => `
                <a href="/dashboard/${g.id}" title="${g.name}" class="group relative flex items-center justify-center">
                    <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                         class="w-11 h-11 rounded-2xl ${g.id === guildId ? 'border-2 border-[#5865F2]' : 'border border-transparent'} hover:rounded-xl object-cover transition-all">
                </a>
            `).join('');

            res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${guild.name} | ProBot Style Dashboard</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                <style>
                    body { background-color: #171821; color: #d1d5db; font-family: 'Cairo', sans-serif; }
                    .toggle { position: relative; display: inline-block; width: 42px; height: 22px; }
                    .toggle input { opacity: 0; width: 0; height: 0; }
                    .slider { position: absolute; cursor: pointer; inset: 0; background: #282937; border-radius: 24px; transition: .2s; }
                    .slider:before { content: ''; position: absolute; width: 16px; height: 16px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .2s; }
                    input:checked + .slider { background: #5865F2; }
                    input:checked + .slider:before { transform: translateX(20px); }
                </style>
            </head>
            <body class="min-h-screen flex flex-col bg-[#171821] text-gray-200">

                <!-- Header -->
                <header class="h-14 bg-[#1e1f2b] border-b border-[#282937] px-6 flex items-center justify-between z-50">
                    <div class="flex items-center gap-4">
                        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="text-xs text-gray-400 hover:text-white">الدعم الفني</a>
                        <span class="text-gray-600">|</span>
                        <a href="/dashboard" class="text-xs text-gray-400 hover:text-white">الخوادم</a>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-black text-sm text-white tracking-wide">ZENO</span>
                        <div class="w-7 h-7 rounded-lg bg-[#5865F2] flex items-center justify-center text-white font-black text-xs">Z</div>
                    </div>
                </header>

                <div class="flex-1 flex overflow-hidden">
                    
                    <!-- Main Content (Modules & Fast Access) -->
                    <main class="flex-1 p-8 overflow-y-auto">
                        
                        <!-- Search Box -->
                        <div class="flex items-center justify-between mb-8">
                            <div class="relative w-72">
                                <input type="text" placeholder="...Search plugins" class="w-full bg-[#1e1f2b] border border-[#282937] focus:border-[#5865F2] rounded-xl px-4 py-2.5 text-xs text-white outline-none">
                            </div>
                            <h2 class="text-xl font-black text-white">Fast Access</h2>
                        </div>

                        <!-- General (Plugins 4) -->
                        <div class="mb-10">
                            <div class="flex items-center justify-between mb-4">
                                <span class="text-xs font-bold text-gray-500">plugins 4</span>
                                <h3 class="text-sm font-bold text-gray-400">General</h3>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                
                                <!-- نظرة عامة -->
                                <div class="bg-[#1e1f2b] border border-[#282937] rounded-xl p-5 flex flex-col justify-between">
                                    <div class="flex items-center justify-between mb-2">
                                        <div class="w-8 h-8 rounded-lg bg-[#282937] flex items-center justify-center text-gray-400">👁️</div>
                                        <h4 class="font-bold text-white text-sm">نظرة عامة</h4>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Get main information about your server settings</p>
                                    <a href="/dashboard/${guildId}" class="w-full py-2 bg-[#282937] hover:bg-[#323444] text-gray-300 rounded-lg text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- إعدادات السيرفر -->
                                <div class="bg-[#1e1f2b] border border-[#282937] rounded-xl p-5 flex flex-col justify-between">
                                    <div class="flex items-center justify-between mb-2">
                                        <div class="w-8 h-8 rounded-lg bg-[#282937] flex items-center justify-center text-gray-400">⚙️</div>
                                        <h4 class="font-bold text-white text-sm">إعدادات السيرفر</h4>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Manage your server settings</p>
                                    <a href="/dashboard/${guildId}" class="w-full py-2 bg-[#282937] hover:bg-[#323444] text-gray-300 rounded-lg text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- رسائل الإيمبد -->
                                <div class="bg-[#1e1f2b] border border-[#282937] rounded-xl p-5 flex flex-col justify-between">
                                    <div class="flex items-center justify-between mb-2">
                                        <div class="w-8 h-8 rounded-lg bg-[#282937] flex items-center justify-center text-gray-400">📄</div>
                                        <h4 class="font-bold text-white text-sm">رسائل الإيمبد</h4>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Create and manage embed messages</p>
                                    <a href="/dashboard/${guildId}" class="w-full py-2 bg-[#282937] hover:bg-[#323444] text-gray-300 rounded-lg text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- حماية السيرفر -->
                                <div class="bg-[#1e1f2b] border border-[#282937] rounded-xl p-5 flex flex-col justify-between">
                                    <div class="flex items-center justify-between mb-2">
                                        <div class="w-8 h-8 rounded-lg bg-[#282937] flex items-center justify-center text-gray-400">🛡️</div>
                                        <h4 class="font-bold text-white text-sm">حماية السيرفر</h4>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Anti-Nuke, Anti-Spam & Protection</p>
                                    <a href="/dashboard/${guildId}" class="w-full py-2 bg-[#282937] hover:bg-[#323444] text-gray-300 rounded-lg text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                            </div>
                        </div>

                        <!-- Modules (Plugins 12) -->
                        <div>
                            <div class="flex items-center justify-between mb-4">
                                <span class="text-xs font-bold text-gray-500">plugins 12</span>
                                <h3 class="text-sm font-bold text-gray-400">Modules</h3>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                                <!-- التسلية والألعاب -->
                                <div class="bg-[#1e1f2b] border border-[#282937] hover:border-[#5865F2] rounded-xl p-5 flex flex-col justify-between transition">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">التسلية والألعاب</h4>
                                            <span class="text-lg">🎮</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">روليت، مافيا، كراسي موسيقية، غميضة</p>
                                    <a href="/dashboard/${guildId}/fun" class="w-full py-2 bg-[#282937] hover:bg-[#5865F2] hover:text-white text-gray-300 rounded-lg text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- الأوامر العامة -->
                                <div class="bg-[#1e1f2b] border border-[#282937] rounded-xl p-5 flex flex-col justify-between">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">الأوامر العامة</h4>
                                            <span class="text-lg">⚙️</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Utility commands and features</p>
                                    <button class="w-full py-2 bg-[#282937] hover:bg-[#323444] text-gray-300 rounded-lg text-xs font-bold transition">&gt; Visit</button>
                                </div>

                                <!-- الإشراف -->
                                <div class="bg-[#1e1f2b] border border-[#282937] rounded-xl p-5 flex flex-col justify-between">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">الإشراف</h4>
                                            <span class="text-lg">🔨</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Moderation tools and commands</p>
                                    <button class="w-full py-2 bg-[#282937] hover:bg-[#323444] text-gray-300 rounded-lg text-xs font-bold transition">&gt; Visit</button>
                                </div>

                                <!-- الرقابة التلقائية -->
                                <div class="bg-[#1e1f2b] border border-[#282937] rounded-xl p-5 flex flex-col justify-between">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">الرقابة التلقائية</h4>
                                            <span class="text-lg">🤖</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Automatic moderation features</p>
                                    <button class="w-full py-2 bg-[#282937] hover:bg-[#323444] text-gray-300 rounded-lg text-xs font-bold transition">&gt; Visit</button>
                                </div>

                                <!-- الترحيب والمغادرة -->
                                <div class="bg-[#1e1f2b] border border-[#282937] rounded-xl p-5 flex flex-col justify-between">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">الترحيب & المغادرة</h4>
                                            <span class="text-lg">👋</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Welcome card canvas and messages</p>
                                    <button class="w-full py-2 bg-[#282937] hover:bg-[#323444] text-gray-300 rounded-lg text-xs font-bold transition">&gt; Visit</button>
                                </div>

                                <!-- الرد التلقائي -->
                                <div class="bg-[#1e1f2b] border border-[#282937] rounded-xl p-5 flex flex-col justify-between">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">الرد التلقائي</h4>
                                            <span class="text-lg">💬</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Custom automatic responders</p>
                                    <button class="w-full py-2 bg-[#282937] hover:bg-[#323444] text-gray-300 rounded-lg text-xs font-bold transition">&gt; Visit</button>
                                </div>

                            </div>
                        </div>
                    </main>

                    <!-- Server Settings Navigation Sidebar (ProBot Server Menu) -->
                    <aside class="w-64 bg-[#1e1f2b] border-l border-[#282937] p-5 flex flex-col shrink-0 overflow-y-auto">
                        
                        <!-- Server Icon & Title Header -->
                        <div class="flex flex-col items-center text-center pb-5 mb-4 border-b border-[#282937]">
                            <img src="${guildIcon}" class="w-16 h-16 rounded-2xl bg-[#171821] mb-2 object-cover shadow-lg border border-[#282937]">
                            <h3 class="font-bold text-white text-sm truncate max-w-[200px]">${guild.name}</h3>
                        </div>

                        <!-- Menu Items -->
                        <div class="flex flex-col gap-1 text-xs text-right overflow-y-auto pr-1">
                            <span class="text-[10px] font-bold text-gray-500 px-3 py-1">عام</span>
                            <a href="/dashboard/${guildId}" class="px-3 py-2 rounded-xl bg-[#5865F2] text-white font-bold flex items-center justify-between">
                                <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
                                <span>نظرة عامة</span>
                            </a>
                            <a href="/dashboard/${guildId}" class="px-3 py-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-end gap-2">
                                <span>إعدادات السيرفر</span>
                                <span>⚙️</span>
                            </a>
                            <a href="/dashboard/${guildId}" class="px-3 py-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-end gap-2">
                                <span>رسائل الإيمبد</span>
                                <span>📄</span>
                            </a>

                            <span class="text-[10px] font-bold text-gray-500 px-3 pt-3 pb-1">قائمة الخصائص</span>
                            <a href="/dashboard/${guildId}/fun" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-between">
                                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                                <span class="flex items-center gap-1.5"><span>التسلية والألعاب</span><span>🎮</span></span>
                            </a>
                            <a href="/dashboard/${guildId}" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-between">
                                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                                <span class="flex items-center gap-1.5"><span>الأوامر العامة</span><span>⚙️</span></span>
                            </a>
                            <a href="/dashboard/${guildId}" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-between">
                                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                                <span class="flex items-center gap-1.5"><span>الترحيب & المغادرة</span><span>👋</span></span>
                            </a>
                            <a href="/dashboard/${guildId}" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-between">
                                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                                <span class="flex items-center gap-1.5"><span>الرد التلقائي</span><span>💬</span></span>
                            </a>
                            <a href="/dashboard/${guildId}" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-between">
                                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                                <span class="flex items-center gap-1.5"><span>نظام اللفلات</span><span>📈</span></span>
                            </a>
                            <a href="/dashboard/${guildId}" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-between">
                                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                                <span class="flex items-center gap-1.5"><span>الرتب التلقائية</span><span>🎖️</span></span>
                            </a>
                            <a href="/dashboard/${guildId}" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-between">
                                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                                <span class="flex items-center gap-1.5"><span>الألوان</span><span>🎨</span></span>
                            </a>
                            <a href="/dashboard/${guildId}" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-between">
                                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                                <span class="flex items-center gap-1.5"><span>الرومات المؤقتة</span><span>🔊</span></span>
                            </a>
                            <a href="/dashboard/${guildId}" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-between">
                                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                                <span class="flex items-center gap-1.5"><span>ستاربورد</span><span>⭐</span></span>
                            </a>
                            <a href="/dashboard/${guildId}" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-between">
                                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                                <span class="flex items-center gap-1.5"><span>التذاكر</span><span>🎫</span></span>
                            </a>

                            <span class="text-[10px] font-bold text-gray-500 px-3 pt-3 pb-1">الإشراف</span>
                            <a href="/dashboard/${guildId}" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-between">
                                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                                <span class="flex items-center gap-1.5"><span>الإشراف</span><span>🔨</span></span>
                            </a>
                            <a href="/dashboard/${guildId}" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-between">
                                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                                <span class="flex items-center gap-1.5"><span>اللوق (Logs)</span><span>📋</span></span>
                            </a>
                            <a href="/dashboard/${guildId}" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-between">
                                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                                <span class="flex items-center gap-1.5"><span>الرقابة التلقائية</span><span>🤖</span></span>
                            </a>
                            <a href="/dashboard/${guildId}" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-between">
                                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                                <span class="flex items-center gap-1.5"><span>مكافحة الغزو (Anti-Raid)</span><span>🛡️</span></span>
                            </a>
                            <a href="/dashboard/${guildId}" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-between">
                                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                                <span class="flex items-center gap-1.5"><span>الحماية الخاصة (Anti-Nuke)</span><span>🔒</span></span>
                            </a>
                        </div>
                    </aside>

                    <!-- Server Rail Column (Far Right) -->
                    <div class="w-16 bg-[#12131a] border-l border-[#282937] py-4 flex flex-col items-center gap-3 shrink-0 overflow-y-auto">
                        <a href="/dashboard" title="الرئيسية" class="w-11 h-11 rounded-2xl bg-[#5865F2] flex items-center justify-center text-white font-black text-sm shadow">Z</a>
                        <div class="w-8 h-[1px] bg-[#282937]"></div>
                        ${serverRailHtml}
                    </div>

                </div>
            </body>
            </html>
            `);
        } catch (error) {
            res.status(500).send("Error");
        }
    });

    // ========================================================
    // 5. صفحة التسلية والألعاب (مطابقة تماماً للصورة)
    // ========================================================
    app.get('/dashboard/:guildId/fun', (req, res) => {
        try {
            if (!req.session?.user) return res.redirect('/auth/discord');
            const guildId = req.params.guildId;
            const guilds = req.session.guilds || [];
            const guild = guilds.find(g => g.id === guildId);
            const user = req.session.user;

            if (!guild) return res.redirect('/dashboard');

            const guildIcon = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

            const serverRailHtml = guilds.map(g => `
                <a href="/dashboard/${g.id}" title="${g.name}" class="group relative flex items-center justify-center">
                    <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                         class="w-11 h-11 rounded-2xl ${g.id === guildId ? 'border-2 border-[#5865F2]' : 'border border-transparent'} hover:rounded-xl object-cover transition-all">
                </a>
            `).join('');

            res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>التسلية | ${guild.name}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                <style>
                    body { background-color: #171821; color: #d1d5db; font-family: 'Cairo', sans-serif; }
                    .toggle { position: relative; display: inline-block; width: 42px; height: 22px; }
                    .toggle input { opacity: 0; width: 0; height: 0; }
                    .slider { position: absolute; cursor: pointer; inset: 0; background: #282937; border-radius: 24px; transition: .2s; }
                    .slider:before { content: ''; position: absolute; width: 16px; height: 16px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .2s; }
                    input:checked + .slider { background: #5865F2; }
                    input:checked + .slider:before { transform: translateX(20px); }
                    .tab-btn.active { color: #5865F2; border-bottom: 2px solid #5865F2; }
                </style>
            </head>
            <body class="min-h-screen flex flex-col bg-[#171821] text-gray-200">

                <!-- Header -->
                <header class="h-14 bg-[#1e1f2b] border-b border-[#282937] px-6 flex items-center justify-between z-50">
                    <div class="flex items-center gap-4">
                        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="text-xs text-gray-400 hover:text-white">الدعم الفني</a>
                        <span class="text-gray-600">|</span>
                        <a href="/dashboard/${guildId}" class="text-xs text-gray-400 hover:text-white">إدارة السيرفر</a>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-black text-sm text-white tracking-wide">ZENO</span>
                        <div class="w-7 h-7 rounded-lg bg-[#5865F2] flex items-center justify-center text-white font-black text-xs">Z</div>
                    </div>
                </header>

                <div class="flex-1 flex overflow-hidden">
                    
                    <!-- Main Content -->
                    <main class="flex-1 p-8 overflow-y-auto">
                        
                        <!-- Top Header Toggle -->
                        <div class="flex items-center justify-between pb-6 mb-6 border-b border-[#282937]">
                            <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                            <div class="text-right">
                                <h2 class="text-2xl font-black text-white">التسلية</h2>
                                <p class="text-gray-400 text-xs mt-1">يضيف متعة إلى سيرفرك بميزات مثيرة مثل الروليت وكت تويت، مع المزيد من الألعاب في الطريق.</p>
                            </div>
                        </div>

                        <!-- Tabs (Right Aligned) -->
                        <div class="border-b border-[#282937] mb-8 flex gap-8 justify-end">
                            <button class="tab-btn active pb-3 text-sm font-bold">الألعاب</button>
                            <button class="tab-btn pb-3 text-sm font-bold text-gray-400 hover:text-white">الألعاب الصغيرة</button>
                            <button class="tab-btn pb-3 text-sm font-bold text-gray-400 hover:text-white">كت تويت</button>
                        </div>

                        <!-- Games Section -->
                        <div class="bg-[#1e1f2b] border border-[#282937] rounded-2xl p-6 mb-6 shadow-xl">
                            <h3 class="text-sm font-black text-white mb-4 text-right">الألعاب</h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

                                <!-- روليت -->
                                <div class="bg-[#171821] border border-[#282937] rounded-xl p-4 flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <div class="w-10 h-10 bg-[#282937] rounded-xl flex items-center justify-center text-xl">🎲</div>
                                        <span class="font-bold text-white text-sm">روليت</span>
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <button class="text-gray-500 hover:text-[#5865F2] p-1.5 rounded-lg">⚙️</button>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                </div>

                                <!-- الكراسي -->
                                <div class="bg-[#171821] border border-[#282937] rounded-xl p-4 flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <div class="w-10 h-10 bg-[#282937] rounded-xl flex items-center justify-center text-xl">🪑</div>
                                        <span class="font-bold text-white text-sm">الكراسي</span>
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <button class="text-gray-500 hover:text-[#5865F2] p-1.5 rounded-lg">⚙️</button>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                </div>

                                <!-- الغميضة -->
                                <div class="bg-[#171821] border border-[#282937] rounded-xl p-4 flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <div class="w-10 h-10 bg-[#282937] rounded-xl flex items-center justify-center text-xl">👁️</div>
                                        <span class="font-bold text-white text-sm">الغميضة</span>
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <button class="text-gray-500 hover:text-[#5865F2] p-1.5 rounded-lg">⚙️</button>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                </div>

                                <!-- مافيا -->
                                <div class="bg-[#171821] border border-[#282937] rounded-xl p-4 flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <div class="w-10 h-10 bg-[#282937] rounded-xl flex items-center justify-center text-xl">🎭</div>
                                        <span class="font-bold text-white text-sm">مافيا</span>
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <button class="text-gray-500 hover:text-[#5865F2] p-1.5 rounded-lg">⚙️</button>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                </div>

                            </div>
                        </div>

                        <!-- Commands Section -->
                        <div class="bg-[#1e1f2b] border border-[#282937] rounded-2xl p-6 shadow-xl">
                            <h3 class="text-sm font-black text-white mb-4 text-right">الأوامر</h3>
                            <div class="flex flex-col gap-3">

                                <div class="bg-[#171821] border border-[#282937] rounded-xl p-4 flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button class="text-gray-500 hover:text-[#5865F2]">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">points</p>
                                            <p class="text-gray-400 text-xs">نظام نقاط على مستوى السيرفر</p>
                                        </div>
                                        <div class="w-8 h-8 bg-[#282937] rounded-lg flex items-center justify-center text-[#5865F2] font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#171821] border border-[#282937] rounded-xl p-4 flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button class="text-gray-500 hover:text-[#5865F2]">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">game stop</p>
                                            <p class="text-gray-400 text-xs">إيقاف لعبة في القناة الحالية</p>
                                        </div>
                                        <div class="w-8 h-8 bg-[#282937] rounded-lg flex items-center justify-center text-[#5865F2] font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                            </div>
                        </div>

                    </main>

                    <!-- Sidebar Right -->
                    <aside class="w-64 bg-[#1e1f2b] border-l border-[#282937] p-5 flex flex-col shrink-0 overflow-y-auto">
                        <div class="flex flex-col items-center text-center pb-5 mb-4 border-b border-[#282937]">
                            <img src="${guildIcon}" class="w-16 h-16 rounded-2xl bg-[#171821] mb-2 object-cover shadow-lg border border-[#282937]">
                            <h3 class="font-bold text-white text-sm truncate max-w-[200px]">${guild.name}</h3>
                        </div>

                        <div class="flex flex-col gap-1 text-xs text-right">
                            <span class="text-[10px] font-bold text-gray-500 px-3 py-1">عام</span>
                            <a href="/dashboard/${guildId}" class="px-3 py-2 rounded-xl text-gray-400 hover:text-white hover:bg-[#282937] font-medium text-right">نظرة عامة</a>
                            <a href="/dashboard/${guildId}" class="px-3 py-2 rounded-xl text-gray-400 hover:text-white hover:bg-[#282937] font-medium text-right">إعدادات السيرفر</a>
                            
                            <span class="text-[10px] font-bold text-gray-500 px-3 pt-3 pb-1">قائمة الخصائص</span>
                            <a href="/dashboard/${guildId}/fun" class="px-3 py-2 rounded-xl bg-[#5865F2] text-white font-bold flex items-center justify-between">
                                <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
                                <span>التسلية والألعاب</span>
                            </a>
                            <a href="#" class="px-3 py-2 rounded-xl text-gray-400 hover:text-white hover:bg-[#282937] font-medium flex items-center justify-between">
                                <span class="text-emerald-400">●</span>
                                <span>الأوامر العامة</span>
                            </a>
                        </div>
                    </aside>

                    <!-- Server Rail -->
                    <div class="w-16 bg-[#12131a] border-l border-[#282937] py-4 flex flex-col items-center gap-3 shrink-0 overflow-y-auto">
                        <a href="/dashboard" title="الرئيسية" class="w-11 h-11 rounded-2xl bg-[#5865F2] flex items-center justify-center text-white font-black text-sm shadow">Z</a>
                        <div class="w-8 h-[1px] bg-[#282937]"></div>
                        ${serverRailHtml}
                    </div>

                </div>
            </body>
            </html>
            `);
        } catch (error) {
            res.status(500).send("Error");
        }
    });

};