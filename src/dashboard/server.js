const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const database = require('../database');
const rawDb = database.db;

module.exports = function (app, client) {
    const sessionStore = new SqliteStore({
        client: rawDb,
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
                <title>ZENO - اصنع خادم ديسكورد احترافي!</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                <style>
                    body { background-color: #0b0c10; color: #ffffff; font-family: 'Cairo', sans-serif; }
                </style>
            </head>
            <body class="min-h-screen flex flex-col bg-[#0b0c10] text-gray-200 relative overflow-x-hidden selection:bg-purple-600 selection:text-white">

                <!-- Ambient Purple Glows & Black Mesh -->
                <div class="fixed inset-0 pointer-events-none z-0">
                    <div class="absolute -top-40 right-1/4 w-[600px] h-[600px] bg-purple-900/20 rounded-full blur-[140px]"></div>
                    <div class="absolute top-1/3 -left-40 w-[500px] h-[500px] bg-indigo-900/15 rounded-full blur-[130px]"></div>
                    <div class="absolute -bottom-40 right-1/3 w-[600px] h-[600px] bg-purple-800/10 rounded-full blur-[150px]"></div>
                </div>

                <!-- Header -->
                <header class="h-20 bg-[#0f1016]/80 backdrop-blur-md border-b border-purple-900/20 px-8 flex items-center justify-between sticky top-0 z-50">
                    <!-- Left: Profile or Login -->
                    <div class="flex items-center gap-5">
                        ${user ? `
                            <a href="/dashboard" class="flex items-center gap-2.5 px-4 py-2 bg-gradient-to-r from-purple-600 to-[#5865F2] hover:from-purple-500 hover:to-[#4752C4] text-white text-xs font-black rounded-xl transition shadow-lg shadow-purple-900/30">
                                <img src="${user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-5 h-5 rounded-full">
                                <span>لوحة التحكم</span>
                            </a>
                        ` : `
                            <a href="/auth/discord" class="px-5 py-2 bg-gradient-to-r from-purple-600 to-[#5865F2] hover:from-purple-500 hover:to-[#4752C4] text-white text-xs font-black rounded-xl transition shadow-lg shadow-purple-900/30">
                                تسجيل الدخول
                            </a>
                        `}
                        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="text-gray-400 hover:text-purple-300 text-xs font-bold transition">الدعم الفني</a>
                        <a href="#commands" class="text-gray-400 hover:text-purple-300 text-xs font-bold transition">الأوامر</a>
                    </div>

                    <!-- Center: Navigation Links (المميزات / المصادر) -->
                    <nav class="hidden md:flex items-center gap-8 text-xs font-bold text-gray-300">
                        <div class="relative group cursor-pointer">
                            <span class="hover:text-purple-300 flex items-center gap-1">المميزات <svg class="w-3.5 h-3.5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></span>
                            <div class="absolute top-full right-0 mt-2 w-48 bg-[#12131c] border border-purple-900/30 rounded-xl shadow-2xl p-2 hidden group-hover:block text-right backdrop-blur-lg">
                                <a href="/dashboard" class="block px-3 py-2 text-xs hover:bg-purple-950/40 hover:text-purple-300 rounded-lg transition">🛡️ الحماية و Anti-Nuke</a>
                                <a href="/dashboard" class="block px-3 py-2 text-xs hover:bg-purple-950/40 hover:text-purple-300 rounded-lg transition">💰 نظام الاقتصاد والبنك</a>
                                <a href="/dashboard" class="block px-3 py-2 text-xs hover:bg-purple-950/40 hover:text-purple-300 rounded-lg transition">🎮 الألعاب التفاعلية</a>
                                <a href="/dashboard" class="block px-3 py-2 text-xs hover:bg-purple-950/40 hover:text-purple-300 rounded-lg transition">🎫 نظام التذاكر</a>
                            </div>
                        </div>
                        <div class="relative group cursor-pointer">
                            <span class="hover:text-purple-300 flex items-center gap-1">المصادر <svg class="w-3.5 h-3.5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></span>
                            <div class="absolute top-full right-0 mt-2 w-48 bg-[#12131c] border border-purple-900/30 rounded-xl shadow-2xl p-2 hidden group-hover:block text-right backdrop-blur-lg">
                                <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="block px-3 py-2 text-xs hover:bg-purple-950/40 hover:text-purple-300 rounded-lg transition">سيرفر الدعم الفني</a>
                                <a href="/dashboard" class="block px-3 py-2 text-xs hover:bg-purple-950/40 hover:text-purple-300 rounded-lg transition">سجل التحديثات</a>
                            </div>
                        </div>
                    </nav>

                    <!-- Right: Logo -->
                    <div class="flex items-center gap-3">
                        <span class="font-black text-xl tracking-wider text-white">ZENO</span>
                        <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center font-black text-white text-sm shadow-lg shadow-purple-900/40">Z</div>
                    </div>
                </header>

                <!-- Hero Section ProBot Exact with Deep Black & Purple -->
                <main class="flex-1 flex flex-col items-center justify-center text-center px-4 py-20 max-w-4xl mx-auto z-10">
                    
                    <span class="px-4 py-1.5 bg-purple-950/60 border border-purple-800/40 text-purple-300 text-xs font-bold rounded-full mb-8 backdrop-blur-sm shadow-inner">
                        ✨ جديد: نظام التذاكر والحماية 100% مجاني بدون قيود
                    </span>

                    <h1 class="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-gray-100 to-purple-200 leading-tight mb-6 tracking-tight drop-shadow-sm">
                        اصنع خادم ديسكورد<br><span class="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-purple-300 to-indigo-300">احترافي!</span>
                    </h1>

                    <p class="text-gray-400 text-sm md:text-base max-w-2xl mb-10 leading-relaxed font-medium">
                        بوت متعدد الأغراض قابل للتخصيص الكامل يوفر لك بطاقات الترحيب، حماية ضد التخريب، أوامر الإشراف، الألعاب، واقتصاد وبنك متكامل.
                    </p>

                    <!-- Buttons with smaller size for Add Bot -->
                    <div class="flex flex-wrap gap-4 items-center justify-center">
                        <a href="/auth/discord" class="py-2.5 px-6 bg-gradient-to-r from-purple-600 to-[#5865F2] hover:from-purple-500 hover:to-[#4752C4] text-white text-xs font-bold rounded-xl transition shadow-lg shadow-purple-900/30 flex items-center gap-2">
                            <span>إضافة البوت في Discord</span>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                        </a>
                        <a href="/dashboard" class="py-2.5 px-6 bg-[#13141d]/90 hover:bg-[#1a1c29] text-gray-200 text-xs font-bold rounded-xl border border-purple-900/30 transition shadow-md hover:text-white">
                            لوحة التحكم
                        </a>
                    </div>

                    <!-- Live Stats Cards with Black/Purple borders -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mt-16 text-center">
                        <div class="bg-[#101118]/80 border border-purple-900/20 hover:border-purple-600/40 p-5 rounded-2xl shadow-xl backdrop-blur-sm transition">
                            <p class="text-2xl font-black text-white">${stats.guilds}</p>
                            <p class="text-gray-400 text-[11px] font-bold mt-1.5">سيرفرات نشطة</p>
                        </div>
                        <div class="bg-[#101118]/80 border border-purple-900/20 hover:border-purple-600/40 p-5 rounded-2xl shadow-xl backdrop-blur-sm transition">
                            <p class="text-2xl font-black text-white">${stats.users}</p>
                            <p class="text-gray-400 text-[11px] font-bold mt-1.5">أعضاء يخدمهم</p>
                        </div>
                        <div class="bg-[#101118]/80 border border-purple-900/20 hover:border-purple-600/40 p-5 rounded-2xl shadow-xl backdrop-blur-sm transition">
                            <p class="text-2xl font-black text-emerald-400">${stats.ping}ms</p>
                            <p class="text-gray-400 text-[11px] font-bold mt-1.5">استجابة البث الحية</p>
                        </div>
                        <div class="bg-[#101118]/80 border border-purple-900/20 hover:border-purple-600/40 p-5 rounded-2xl shadow-xl backdrop-blur-sm transition">
                            <p class="text-2xl font-black text-purple-400">100%</p>
                            <p class="text-gray-400 text-[11px] font-bold mt-1.5">جاهزية الحماية (نشط)</p>
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
            let userCoins = 0, userLevel = 1, userStars = 0;
            try {
                const userRow = rawDb.prepare('SELECT SUM(coins) as coins, MAX(level) as level, SUM(xp) as xp FROM users WHERE user_id = ?').get(user.id);
                userCoins = userRow?.coins || 0;
                userLevel = userRow?.level || 1;
                userStars = rawDb.prepare('SELECT COUNT(*) as count FROM stars WHERE receiver_id = ?').get(user.id)?.count || 0;
            } catch (err) {
                console.error("Error reading user stats:", err);
            }

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
                    body { background-color: #0b0c10; color: #e2e8f0; font-family: 'Cairo', sans-serif; }
                    ::-webkit-scrollbar { width: 5px; height: 5px; }
                    ::-webkit-scrollbar-thumb { background: #2e1065; border-radius: 10px; }
                </style>
            </head>
            <body class="min-h-screen flex flex-col bg-[#0b0c10] text-gray-200">

                <!-- Header -->
                <header class="h-16 bg-[#0f1016]/90 backdrop-blur-md border-b border-purple-950/40 px-6 flex items-center justify-between sticky top-0 z-50">
                    <div class="flex items-center gap-4">
                        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="text-xs text-gray-400 hover:text-purple-300 transition">الدعم الفني</a>
                        <span class="text-gray-700">|</span>
                        <a href="/#commands" class="text-xs text-gray-400 hover:text-purple-300 transition">الأوامر</a>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-black text-sm text-white tracking-wide">ZENO</span>
                        <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white font-black text-xs shadow-lg shadow-purple-900/30">Z</div>
                    </div>
                </header>

                <div class="flex-1 flex overflow-hidden">
                    
                    <!-- Main Content (Left in RTL) -->
                    <main class="flex-1 p-8 overflow-y-auto">
                        <!-- User Stats Header (ProBot Style Cards) -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                            <!-- الكريدت -->
                            <div class="bg-[#10111a] border border-purple-950/40 rounded-2xl p-5 flex items-center justify-between shadow-lg">
                                <div class="w-10 h-10 rounded-xl bg-purple-900/30 text-purple-400 flex items-center justify-center text-xl font-bold font-mono">¢</div>
                                <div class="text-right">
                                    <span class="text-xs font-bold text-gray-400">الكريدت</span>
                                    <h3 class="text-2xl font-black text-white mt-0.5">${userCoins.toLocaleString()}</h3>
                                </div>
                            </div>
                            <!-- المستوى -->
                            <div class="bg-[#10111a] border border-purple-950/40 rounded-2xl p-5 flex items-center justify-between shadow-lg">
                                <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center text-xl">⭐</div>
                                <div class="text-right">
                                    <span class="text-xs font-bold text-gray-400">المستوى</span>
                                    <h3 class="text-2xl font-black text-white mt-0.5">${userLevel}</h3>
                                </div>
                            </div>
                            <!-- الترتيب -->
                            <div class="bg-[#10111a] border border-purple-950/40 rounded-2xl p-5 flex items-center justify-between shadow-lg">
                                <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xl">🏆</div>
                                <div class="text-right">
                                    <span class="text-xs font-bold text-gray-400">الترتيب</span>
                                    <h3 class="text-2xl font-black text-white mt-0.5">#1</h3>
                                </div>
                            </div>
                            <!-- السمعة -->
                            <div class="bg-[#10111a] border border-purple-950/40 rounded-2xl p-5 flex items-center justify-between shadow-lg">
                                <div class="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center text-xl">✨</div>
                                <div class="text-right">
                                    <span class="text-xs font-bold text-gray-400">السمعة</span>
                                    <h3 class="text-2xl font-black text-white mt-0.5">${userStars}</h3>
                                </div>
                            </div>
                        </div>

                        <!-- Tab 1: نظرة عامة والخوادم (Default Overview) -->
                        <div id="tabOverview">
                            <div class="bg-[#10111a] border border-purple-950/40 rounded-3xl p-6 shadow-xl">
                                <h3 class="text-sm font-black text-white mb-4 text-right">خوادمك المتاحة للإدارة</h3>
                                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    ${guilds.map(g => `
                                        <a href="/dashboard/${g.id}" class="bg-[#12131c] hover:bg-[#181926] border border-purple-950/40 hover:border-purple-600/50 p-4 rounded-2xl flex items-center justify-between transition-all group shadow-md">
                                            <div class="w-8 h-8 rounded-xl bg-purple-950/40 flex items-center justify-center text-purple-400 group-hover:text-white transition">
                                                <svg class="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                                            </div>
                                            <div class="flex items-center gap-3 text-right">
                                                <div>
                                                    <h4 class="text-xs font-bold text-white group-hover:text-purple-300 transition truncate max-w-[150px]">${g.name}</h4>
                                                    <span class="text-[10px] text-purple-400/60 font-bold">صلاحية إدارية</span>
                                                </div>
                                                <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-10 h-10 rounded-xl object-cover bg-[#0f1016] border border-purple-950/40">
                                            </div>
                                        </a>
                                    `).join('')}
                                </div>
                            </div>
                        </div>

                        <!-- Tab 2: متجر خلفيات البروفايل (Wallpapers Shop) -->
                        <div id="tabWallpapers" class="hidden space-y-6">
                            <div class="bg-[#10111a] border border-purple-950/40 rounded-3xl p-6 shadow-xl">
                                <div class="flex items-center justify-between pb-4 mb-4 border-b border-purple-950/40">
                                    <span class="text-xs text-purple-400 font-bold">رصيدك: ${userCoins.toLocaleString()} ¢</span>
                                    <h3 class="text-sm font-black text-white text-right">متجر خلفيات البروفايل (Rank & Profile Backgrounds) 🖼️</h3>
                                </div>
                                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                    <div class="bg-[#12131c] border border-purple-950/40 rounded-2xl overflow-hidden shadow-lg group">
                                        <div class="h-28 bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-950 flex items-center justify-center text-3xl">🌌</div>
                                        <div class="p-4 text-right">
                                            <h4 class="text-xs font-bold text-white">Galaxy Neon</h4>
                                            <p class="text-[10px] text-gray-400 mt-0.5">خلفية النجوم والنيون الأرجواني</p>
                                            <div class="mt-3 flex items-center justify-between">
                                                <button onclick="buyItem('Galaxy Neon', 5000)" class="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold shadow-md hover:from-purple-500 hover:to-indigo-500 transition">شراء (5,000 ¢)</button>
                                                <span class="text-xs font-mono text-purple-300 font-bold">5,000 ¢</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="bg-[#12131c] border border-purple-950/40 rounded-2xl overflow-hidden shadow-lg group">
                                        <div class="h-28 bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 flex items-center justify-center text-3xl">🌲</div>
                                        <div class="p-4 text-right">
                                            <h4 class="text-xs font-bold text-white">Emerald Forest</h4>
                                            <p class="text-[10px] text-gray-400 mt-0.5">خلفية الطبيعة والزمرد الفخم</p>
                                            <div class="mt-3 flex items-center justify-between">
                                                <button onclick="buyItem('Emerald Forest', 7500)" class="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold shadow-md hover:from-purple-500 hover:to-indigo-500 transition">شراء (7,500 ¢)</button>
                                                <span class="text-xs font-mono text-purple-300 font-bold">7,500 ¢</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="bg-[#12131c] border border-purple-950/40 rounded-2xl overflow-hidden shadow-lg group">
                                        <div class="h-28 bg-gradient-to-r from-rose-950 via-zinc-900 to-amber-950 flex items-center justify-center text-3xl">🔥</div>
                                        <div class="p-4 text-right">
                                            <h4 class="text-xs font-bold text-white">Cyberpunk Gold</h4>
                                            <p class="text-[10px] text-gray-400 mt-0.5">خلفية اللهب والذهب الخالص</p>
                                            <div class="mt-3 flex items-center justify-between">
                                                <button onclick="buyItem('Cyberpunk Gold', 12000)" class="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold shadow-md hover:from-purple-500 hover:to-indigo-500 transition">شراء (12,000 ¢)</button>
                                                <span class="text-xs font-mono text-purple-300 font-bold">12,000 ¢</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Tab 3: شارات البروفايل (Badges Shop) -->
                        <div id="tabBadges" class="hidden space-y-6">
                            <div class="bg-[#10111a] border border-purple-950/40 rounded-3xl p-6 shadow-xl">
                                <div class="flex items-center justify-between pb-4 mb-4 border-b border-purple-950/40">
                                    <span class="text-xs text-purple-400 font-bold">رصيدك: ${userCoins.toLocaleString()} ¢</span>
                                    <h3 class="text-sm font-black text-white text-right">متجر شارات وأوسمة البروفايل 🎖️</h3>
                                </div>
                                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl text-center space-y-2">
                                        <span class="text-3xl block">👑</span>
                                        <h4 class="text-xs font-bold text-white">تاج الأساطير</h4>
                                        <p class="text-[10px] text-gray-400">شارة ملكية ذهبية</p>
                                        <button onclick="buyItem('Crown Badge', 10000)" class="w-full py-1.5 bg-purple-900/40 hover:bg-purple-800/60 text-purple-200 border border-purple-700/40 rounded-xl text-xs font-bold transition">10,000 ¢</button>
                                    </div>
                                    <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl text-center space-y-2">
                                        <span class="text-3xl block">💎</span>
                                        <h4 class="text-xs font-bold text-white">الماسة اللامعة</h4>
                                        <p class="text-[10px] text-gray-400">شارة النقاء والتميز</p>
                                        <button onclick="buyItem('Diamond Badge', 15000)" class="w-full py-1.5 bg-purple-900/40 hover:bg-purple-800/60 text-purple-200 border border-purple-700/40 rounded-xl text-xs font-bold transition">15,000 ¢</button>
                                    </div>
                                    <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl text-center space-y-2">
                                        <span class="text-3xl block">⚡</span>
                                        <h4 class="text-xs font-bold text-white">صاعقة النيون</h4>
                                        <p class="text-[10px] text-gray-400">شارة السرعة والقوة</p>
                                        <button onclick="buyItem('Lightning Badge', 8000)" class="w-full py-1.5 bg-purple-900/40 hover:bg-purple-800/60 text-purple-200 border border-purple-700/40 rounded-xl text-xs font-bold transition">8,000 ¢</button>
                                    </div>
                                    <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl text-center space-y-2">
                                        <span class="text-3xl block">🛡️</span>
                                        <h4 class="text-xs font-bold text-white">درع الحارس</h4>
                                        <p class="text-[10px] text-gray-400">شارة الشرف والحماية</p>
                                        <button onclick="buyItem('Guardian Badge', 6000)" class="w-full py-1.5 bg-purple-900/40 hover:bg-purple-800/60 text-purple-200 border border-purple-700/40 rounded-xl text-xs font-bold transition">6,000 ¢</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Tab 4: خلفيات الهوية (Identity Shop) -->
                        <div id="tabIdentity" class="hidden space-y-6">
                            <div class="bg-[#10111a] border border-purple-950/40 rounded-3xl p-6 shadow-xl text-right">
                                <h3 class="text-sm font-black text-white mb-2">خلفيات وبطاقات الهوية الشخصية 🪪</h3>
                                <p class="text-gray-400 text-xs mb-6">خصص بطاقة الهوية التي تظهر في الديسكورد عند كتابة أمر <span class="text-purple-400 font-mono">/id</span> أو <span class="text-purple-400 font-mono">/profile</span>.</p>
                                
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl flex items-center justify-between">
                                        <button onclick="buyItem('Dark Minimalist Card', 3000)" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold">تفعيل (3,000 ¢)</button>
                                        <div>
                                            <h4 class="text-xs font-bold text-white">Dark Minimalist</h4>
                                            <p class="text-[10px] text-gray-400">تصميم أسود داكن كلاسيكي فخم</p>
                                        </div>
                                    </div>
                                    <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl flex items-center justify-between">
                                        <button onclick="buyItem('Purple Glow Card', 4500)" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold">تفعيل (4,500 ¢)</button>
                                        <div>
                                            <h4 class="text-xs font-bold text-white">Purple Glow Pro</h4>
                                            <p class="text-[10px] text-gray-400">توهج بنفسجي متدرج ملكي</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Tab 5: قائمة المتصدرين (Leaderboards) -->
                        <div id="tabLeaderboard" class="hidden space-y-6">
                            <div class="bg-[#10111a] border border-purple-950/40 rounded-3xl p-6 shadow-xl">
                                <h3 class="text-sm font-black text-white mb-4 text-right">قائمة المتصدرين في النقاط والمستويات 🏆</h3>
                                <div class="space-y-3">
                                    <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl flex items-center justify-between">
                                        <span class="text-xs font-bold text-amber-400 font-mono">Level ${userLevel} • ${userCoins.toLocaleString()} ¢</span>
                                        <div class="flex items-center gap-3">
                                            <div class="text-right">
                                                <h4 class="text-xs font-bold text-white">${user.username} (أنت)</h4>
                                                <p class="text-[10px] text-purple-400">الترتيب: #1 في السيرفر</p>
                                            </div>
                                            <img src="${userAvatar}" class="w-10 h-10 rounded-xl object-cover border border-purple-500">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Tab 6: المكافأة اليومية والتصويت (Daily & Vote) -->
                        <div id="tabDaily" class="hidden space-y-6">
                            <div class="bg-[#10111a] border border-purple-950/40 rounded-3xl p-6 shadow-xl text-center space-y-4">
                                <span class="text-5xl block">🎁</span>
                                <h3 class="text-lg font-black text-white">مكافأتك اليومية (Daily Reward)</h3>
                                <p class="text-gray-400 text-xs max-w-md mx-auto">احصل على ما يصل إلى 1,000 كريدت يومياً مجاناً مع الحفاظ على سلسلة الأيام المتتالية (Daily Streak)!</p>
                                <button onclick="alert('✅ تم تسجيل مكافأتك اليومية! يمكنك استخدام أمر /daily في الديسكورد لاستلامها فوراً.')" class="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-900/40 transition">
                                    استلام المكافأة اليومية
                                </button>
                            </div>
                        </div>
                    </main>

                    <!-- Sidebar Right (ProBot Menu) -->
                    <aside class="w-64 bg-[#0f1016] border-l border-purple-950/40 p-5 flex flex-col justify-between shrink-0">
                        <div>
                            <!-- User Profile Box -->
                            <div class="flex flex-col items-center text-center pb-5 mb-4 border-b border-purple-950/40">
                                <img src="${userAvatar}" class="w-16 h-16 rounded-full border-2 border-purple-600 shadow-lg shadow-purple-900/40 mb-2 object-cover">
                                <h3 class="font-bold text-white text-sm">${user.username}</h3>
                            </div>

                            <!-- Nav Links with Active Tab Switchers -->
                            <div class="flex flex-col gap-1 text-xs text-right overflow-y-auto pr-1">
                                <span class="text-[10px] font-bold text-purple-400/60 px-3 py-1">عام</span>
                                <button onclick="switchTab('tabOverview', this)" class="nav-btn px-3 py-2 rounded-xl bg-gradient-to-r from-purple-700 to-indigo-700 text-white font-bold flex items-center justify-between shadow-md w-full">
                                    <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
                                    <span>نظرة عامة</span>
                                </button>

                                <span class="text-[10px] font-bold text-purple-400/60 px-3 pt-3 pb-1">متاجر الكريدت</span>
                                <button onclick="switchTab('tabWallpapers', this)" class="nav-btn px-3 py-1.5 rounded-xl text-gray-400 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-end gap-2 transition w-full">
                                    <span>خلفيات البروفايل</span>
                                    <span>🖼️</span>
                                </button>
                                <button onclick="switchTab('tabBadges', this)" class="nav-btn px-3 py-1.5 rounded-xl text-gray-400 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-end gap-2 transition w-full">
                                    <span>شارات البروفايل</span>
                                    <span>🎖️</span>
                                </button>
                                <button onclick="switchTab('tabIdentity', this)" class="nav-btn px-3 py-1.5 rounded-xl text-gray-400 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-end gap-2 transition w-full">
                                    <span>خلفيات الهوية</span>
                                    <span>🪪</span>
                                </button>

                                <span class="text-[10px] font-bold text-purple-400/60 px-3 pt-3 pb-1">قائمة المتصدرين</span>
                                <button onclick="switchTab('tabLeaderboard', this)" class="nav-btn px-3 py-1.5 rounded-xl text-gray-400 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-end gap-2 transition w-full">
                                    <span>أعلى 100 بواسطة XP</span>
                                    <span>🏆</span>
                                </button>
                                <button onclick="switchTab('tabLeaderboard', this)" class="nav-btn px-3 py-1.5 rounded-xl text-gray-400 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-end gap-2 transition w-full">
                                    <span>أغنى 100 ملياردير</span>
                                    <span>💰</span>
                                </button>

                                <span class="text-[10px] font-bold text-purple-400/60 px-3 pt-3 pb-1">أخرى</span>
                                <button onclick="switchTab('tabDaily', this)" class="nav-btn px-3 py-1.5 rounded-xl text-gray-400 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-end gap-2 transition w-full">
                                    <span>احصل على مكافأتك اليومية</span>
                                    <span>🎁</span>
                                </button>
                            </div>
                        </div>

                        <!-- Logout -->
                        <a href="/logout" class="px-3 py-2.5 rounded-xl text-red-400 hover:bg-red-950/20 text-xs font-bold text-right flex items-center justify-end gap-2 transition mt-2 border-t border-purple-950/40 pt-3">
                            <span>خروج</span>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                        </a>
                    </aside>

                    <!-- Server Rail (Far Right Column) -->
                    <div class="w-16 bg-[#08080c] border-l border-purple-950/40 py-4 flex flex-col items-center gap-3 shrink-0 overflow-y-auto">
                        <a href="/dashboard" class="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-purple-900/40">Z</a>
                        <div class="w-8 h-[1px] bg-purple-950/40"></div>
                        ${serverRailHtml}
                    </div>

                </div>
            </body>
            </html>
            `);
        } catch (error) {
            console.error("Dashboard /dashboard error:", error);
            res.status(500).send(`<pre style="color:red;background:#111;padding:20px;font-family:monospace">${error.stack || error.message || error}</pre>`);
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
                <title>${guild.name} | ZENO Dashboard</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                <style>
                    body { background-color: #0b0c10; color: #e2e8f0; font-family: 'Cairo', sans-serif; }
                    .toggle { position: relative; display: inline-block; width: 40px; height: 20px; }
                    .toggle input { opacity: 0; width: 0; height: 0; }
                    .slider { position: absolute; cursor: pointer; inset: 0; background: #1f212d; border-radius: 20px; transition: .2s; }
                    .slider:before { content: ''; position: absolute; width: 14px; height: 14px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .2s; }
                    input:checked + .slider { background: #9333ea; }
                    input:checked + .slider:before { transform: translateX(20px); }
                    ::-webkit-scrollbar { width: 5px; height: 5px; }
                    ::-webkit-scrollbar-thumb { background: #2e1065; border-radius: 10px; }
                </style>
            </head>
            <body class="min-h-screen flex flex-col bg-[#0b0c10] text-gray-200">

                <!-- Header -->
                <header class="h-16 bg-[#0f1016]/90 backdrop-blur-md border-b border-purple-950/40 px-6 flex items-center justify-between sticky top-0 z-50">
                    <div class="flex items-center gap-4">
                        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="text-xs text-gray-400 hover:text-purple-300 transition">الدعم الفني</a>
                        <span class="text-gray-700">|</span>
                        <a href="/dashboard" class="text-xs text-purple-400 hover:text-purple-300 font-bold transition">الخوادم</a>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-black text-sm text-white tracking-wide">ZENO</span>
                        <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white font-black text-xs shadow-lg shadow-purple-900/30">Z</div>
                    </div>
                </header>

                <div class="flex-1 flex overflow-hidden">
                    
                    <!-- Main Content (Modules & Fast Access) -->
                    <main class="flex-1 p-8 overflow-y-auto">
                        
                        <!-- Search Box -->
                        <div class="flex items-center justify-between mb-8">
                            <div class="relative w-72">
                                <input type="text" placeholder="...Search plugins" class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2 text-xs text-white outline-none">
                            </div>
                            <h2 class="text-xl font-black text-white">Fast Access</h2>
                        </div>

                        <!-- General (Plugins 4) -->
                        <div class="mb-10">
                            <div class="flex items-center justify-between mb-4">
                                <span class="text-xs font-bold text-purple-400/70">plugins 4</span>
                                <h3 class="text-sm font-bold text-gray-400">General</h3>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                
                                <!-- نظرة عامة -->
                                <div class="bg-[#10111a] border border-purple-950/40 hover:border-purple-600/30 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-2">
                                        <div class="w-8 h-8 rounded-xl bg-purple-950/40 flex items-center justify-center text-purple-300">👁️</div>
                                        <h4 class="font-bold text-white text-xs">نظرة عامة</h4>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Get main information about your server settings</p>
                                    <a href="/dashboard/${guildId}/general" class="w-full py-2 bg-purple-950/30 hover:bg-purple-600 hover:text-white text-purple-300 border border-purple-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- إعدادات السيرفر -->
                                <div class="bg-[#10111a] border border-purple-950/40 hover:border-purple-600/30 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-2">
                                        <div class="w-8 h-8 rounded-xl bg-purple-950/40 flex items-center justify-center text-purple-300">⚙️</div>
                                        <h4 class="font-bold text-white text-xs">إعدادات السيرفر</h4>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Manage your server settings</p>
                                    <a href="/dashboard/${guildId}/settings" class="w-full py-2 bg-purple-950/30 hover:bg-purple-600 hover:text-white text-purple-300 border border-purple-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- رسائل الإيمبد -->
                                <div class="bg-[#10111a] border border-purple-950/40 hover:border-purple-600/30 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-2">
                                        <div class="w-8 h-8 rounded-xl bg-purple-950/40 flex items-center justify-center text-purple-300">📄</div>
                                        <h4 class="font-bold text-white text-xs">رسائل الإيمبد</h4>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Create and manage embed messages</p>
                                    <a href="/dashboard/${guildId}/embed" class="w-full py-2 bg-purple-950/30 hover:bg-purple-600 hover:text-white text-purple-300 border border-purple-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- حماية السيرفر -->
                                <div class="bg-[#10111a] border border-purple-950/40 hover:border-purple-600/30 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-2">
                                        <div class="w-8 h-8 rounded-xl bg-purple-950/40 flex items-center justify-center text-purple-300">🛡️</div>
                                        <h4 class="font-bold text-white text-xs">حماية السيرفر</h4>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Anti-Nuke, Anti-Spam & Protection</p>
                                    <a href="/dashboard/${guildId}/protection" class="w-full py-2 bg-purple-950/30 hover:bg-purple-600 hover:text-white text-purple-300 border border-purple-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                            </div>
                        </div>

                        <!-- Modules (Plugins 12) -->
                        <div>
                            <div class="flex items-center justify-between mb-4">
                                <span class="text-xs font-bold text-purple-400/70">plugins 12</span>
                                <h3 class="text-sm font-bold text-gray-400">Modules</h3>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                                <!-- التسلية والألعاب -->
                                <div class="bg-[#10111a] border border-purple-950/40 hover:border-purple-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">التسلية والألعاب</h4>
                                            <span class="text-lg">🎮</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">روليت، مافيا، كراسي موسيقية، غميضة</p>
                                    <a href="/dashboard/${guildId}/fun" class="w-full py-2 bg-purple-950/30 hover:bg-gradient-to-r hover:from-purple-600 hover:to-indigo-600 hover:text-white text-purple-300 border border-purple-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- الأوامر العامة -->
                                <div class="bg-[#10111a] border border-purple-950/40 hover:border-purple-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'general_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">الأوامر العامة</h4>
                                            <span class="text-lg">⚙️</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Utility commands and features</p>
                                    <a href="/dashboard/${guildId}/general" class="w-full py-2 bg-purple-950/30 hover:bg-gradient-to-r hover:from-purple-600 hover:to-indigo-600 hover:text-white text-purple-300 border border-purple-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- الإشراف -->
                                <div class="bg-[#10111a] border border-purple-950/40 hover:border-purple-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'moderation_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">الإشراف</h4>
                                            <span class="text-lg">🔨</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Moderation tools and commands</p>
                                    <a href="/dashboard/${guildId}/moderation" class="w-full py-2 bg-purple-950/30 hover:bg-gradient-to-r hover:from-purple-600 hover:to-indigo-600 hover:text-white text-purple-300 border border-purple-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- الرقابة التلقائية -->
                                <div class="bg-[#10111a] border border-purple-950/40 hover:border-purple-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'automod_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">الرقابة التلقائية</h4>
                                            <span class="text-lg">🤖</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Automatic moderation features</p>
                                    <a href="/dashboard/${guildId}/automod" class="w-full py-2 bg-purple-950/30 hover:bg-gradient-to-r hover:from-purple-600 hover:to-indigo-600 hover:text-white text-purple-300 border border-purple-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- الترحيب والمغادرة -->
                                <div class="bg-[#10111a] border border-purple-950/40 hover:border-purple-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'welcome_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">الترحيب & المغادرة</h4>
                                            <span class="text-lg">👋</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Welcome card canvas and messages</p>
                                    <a href="/dashboard/${guildId}/welcome" class="w-full py-2 bg-purple-950/30 hover:bg-gradient-to-r hover:from-purple-600 hover:to-indigo-600 hover:text-white text-purple-300 border border-purple-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- الرد التلقائي -->
                                <div class="bg-[#10111a] border border-purple-950/40 hover:border-purple-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'autoresponder_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">الرد التلقائي</h4>
                                            <span class="text-lg">💬</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Custom automatic responders</p>
                                    <a href="/dashboard/${guildId}/autoresponder" class="w-full py-2 bg-purple-950/30 hover:bg-gradient-to-r hover:from-purple-600 hover:to-indigo-600 hover:text-white text-purple-300 border border-purple-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                            </div>
                        </div>

                        <script>
                            function toggleModule(guildId, moduleKey, status) {
                                fetch('/api/guild/' + guildId + '/module', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ module: moduleKey, enabled: status })
                                });
                            }
                        </script>
                    </main>

                    <!-- Server Settings Navigation Sidebar (ProBot Server Menu) -->
                    <aside class="w-64 bg-[#0f1016] border-l border-purple-950/40 p-5 flex flex-col shrink-0 overflow-y-auto">
                        
                        <!-- Server Icon & Title Header -->
                        <div class="flex flex-col items-center text-center pb-5 mb-4 border-b border-purple-950/40">
                            <img src="${guildIcon}" class="w-16 h-16 rounded-2xl bg-[#12131c] mb-2 object-cover shadow-lg border border-purple-900/30">
                            <h3 class="font-bold text-white text-sm truncate max-w-[200px]">${guild.name}</h3>
                        </div>

                        <!-- Menu Items -->
                        <div class="flex flex-col gap-1 text-xs text-right overflow-y-auto pr-1">
                            <span class="text-[10px] font-bold text-purple-400/60 px-3 py-1">عام</span>
                            <a href="/dashboard/${guildId}" class="px-3 py-2 rounded-xl bg-gradient-to-r from-purple-700 to-indigo-700 text-white font-bold flex items-center justify-between shadow-lg shadow-purple-950/50">
                                <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
                                <span>نظرة عامة</span>
                            </a>
                            <a href="/dashboard/${guildId}/general" class="px-3 py-1.5 rounded-xl text-gray-400 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-end gap-2 transition">
                                <span>إعدادات السيرفر</span>
                                <span>⚙️</span>
                            </a>
                            <a href="/dashboard/${guildId}/embed" class="px-3 py-1.5 rounded-xl text-gray-400 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-end gap-2 transition">
                                <span>رسائل الإيمبد</span>
                                <span>📄</span>
                            </a>

                            <span class="text-[10px] font-bold text-purple-400/60 px-3 pt-3 pb-1">قائمة الخصائص</span>
                            <a href="/dashboard/${guildId}/fun" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition">
                                <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                <span class="flex items-center gap-1.5"><span>التسلية والألعاب</span><span>🎮</span></span>
                            </a>
                            <a href="/dashboard/${guildId}/general" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition">
                                <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                <span class="flex items-center gap-1.5"><span>الأوامر العامة</span><span>⚙️</span></span>
                            </a>
                            <a href="/dashboard/${guildId}/welcome" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition">
                                <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                <span class="flex items-center gap-1.5"><span>الترحيب & المغادرة</span><span>👋</span></span>
                            </a>
                            <a href="/dashboard/${guildId}/autoresponder" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition">
                                <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                <span class="flex items-center gap-1.5"><span>الرد التلقائي</span><span>💬</span></span>
                            </a>
                            <a href="/dashboard/${guildId}/levels" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition">
                                <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                <span class="flex items-center gap-1.5"><span>نظام اللفلات</span><span>📈</span></span>
                            </a>
                            <a href="/dashboard/${guildId}/autoroles" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition">
                                <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                <span class="flex items-center gap-1.5"><span>الرتب التلقائية</span><span>🎖️</span></span>
                            </a>
                            <a href="/dashboard/${guildId}/colors" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition">
                                <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                <span class="flex items-center gap-1.5"><span>الألوان</span><span>🎨</span></span>
                            </a>
                            <a href="/dashboard/${guildId}/tempvoice" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition">
                                <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                <span class="flex items-center gap-1.5"><span>الرومات المؤقتة</span><span>🔊</span></span>
                            </a>
                            <a href="/dashboard/${guildId}/starboard" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition">
                                <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                <span class="flex items-center gap-1.5"><span>ستاربورد</span><span>⭐</span></span>
                            </a>
                            <a href="/dashboard/${guildId}/tickets" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition">
                                <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                <span class="flex items-center gap-1.5"><span>التذاكر</span><span>🎫</span></span>
                            </a>

                            <span class="text-[10px] font-bold text-purple-400/60 px-3 pt-3 pb-1">الإشراف</span>
                            <a href="/dashboard/${guildId}/moderation" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition">
                                <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                <span class="flex items-center gap-1.5"><span>الإشراف</span><span>🔨</span></span>
                            </a>
                            <a href="/dashboard/${guildId}/logs" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition">
                                <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                <span class="flex items-center gap-1.5"><span>اللوق (Logs)</span><span>📋</span></span>
                            </a>
                            <a href="/dashboard/${guildId}/automod" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition">
                                <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                <span class="flex items-center gap-1.5"><span>الرقابة التلقائية</span><span>🤖</span></span>
                            </a>
                            <a href="/dashboard/${guildId}/antiraid" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition">
                                <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                <span class="flex items-center gap-1.5"><span>مكافحة الغزو (Anti-Raid)</span><span>🛡️</span></span>
                            </a>
                            <a href="/dashboard/${guildId}/protection" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition">
                                <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                <span class="flex items-center gap-1.5"><span>الحماية الخاصة (Anti-Nuke)</span><span>🔒</span></span>
                            </a>
                        </div>
                    </aside>

                    <!-- Server Rail Column (Far Right) -->
                    <div class="w-16 bg-[#08080c] border-l border-purple-950/40 py-4 flex flex-col items-center gap-3 shrink-0 overflow-y-auto">
                        <a href="/dashboard" title="الرئيسية" class="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-purple-900/40">Z</a>
                        <div class="w-8 h-[1px] bg-purple-950/40"></div>
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
            let guild = guilds.find(g => g.id === guildId);

            if (!guild && client?.guilds?.cache) {
                const botGuild = client.guilds.cache.get(guildId);
                if (botGuild) {
                    guild = { id: botGuild.id, name: botGuild.name, icon: botGuild.icon };
                }
            }

            if (!guild) {
                guild = { id: guildId, name: 'Discord Server', icon: null };
            }

            const user = req.session.user;

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

    // ========================================================
    // 5. واجهة برمجية لحفظ التعديلات والتحديث الفوري في ديسكورد (Real-time Discord Sync)
    // ========================================================
    app.post('/api/guild/:guildId/module', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { module, enabled } = req.body;

            // تحديث في قاعدة بيانات SQLite فوراً
            database.updateGuildSetting(guildId, module, enabled ? 1 : 0);

            // إرسال إشعار في سيرفر الديسكورد إذا كانت هناك قناة سجلات
            const guildSettings = database.getGuildSettings(guildId);
            if (guildSettings?.log_channel && client?.channels?.cache) {
                const logCh = client.channels.cache.get(guildSettings.log_channel);
                if (logCh) {
                    logCh.send(`⚙️ **تحديث لوحة التحكم:** تم ${enabled ? 'تفعيل ✅' : 'تعطيل ❌'} موديول (\`${module}\`) بواسطة المشرف **${req.session.user.username}**`).catch(() => {});
                }
            }

            res.json({ success: true, guildId, module, enabled });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/settings', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { key, value } = req.body;

            database.updateGuildSetting(guildId, key, value);
            res.json({ success: true, guildId, key, value });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // إضافة رد تلقائي جديد (Auto Responder API)
    app.post('/api/guild/:guildId/autoresponder', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { trigger_word, reply_text } = req.body;

            if (trigger_word && reply_text) {
                database.addAutoResponder(guildId, trigger_word, reply_text);
            }
            res.json({ success: true, guildId });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // حذف رد تلقائي (Delete Auto Responder API)
    app.post('/api/guild/:guildId/autoresponder/delete', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { trigger_word } = req.body;

            if (trigger_word) {
                database.deleteAutoResponder(guildId, trigger_word);
            }
            res.json({ success: true, guildId });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // إرسال رسالة إيمبد مباشرة إلى الديسكورد (Send Embed API)
    app.post('/api/guild/:guildId/embed', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { channel_id, color, title, description, author, footer, image_url, thumbnail_url } = req.body;

            if (!channel_id || !description) {
                return res.status(400).json({ success: false, error: 'Channel ID and description are required' });
            }

            const channel = client.channels.cache.get(channel_id);
            if (!channel) {
                return res.status(404).json({ success: false, error: 'Channel not found or bot lacks access' });
            }

            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setColor(color || '#9333ea')
                .setDescription(description)
                .setTimestamp();

            if (title) embed.setTitle(title);
            if (author) embed.setAuthor({ name: author });
            if (footer) embed.setFooter({ text: footer });
            if (image_url) embed.setImage(image_url);
            if (thumbnail_url) embed.setThumbnail(thumbnail_url);

            await channel.send({ embeds: [embed] });
            res.json({ success: true });
        } catch (e) {
            console.error('Embed send error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // صفحات فرعية لجميع الأزرار (Moderation, Automod, Welcome, Tickets, Protection)
    app.get('/dashboard/:guildId/:section', (req, res) => {
        try {
            if (!req.session?.user) return res.redirect('/auth/discord');
            const { guildId, section } = req.params;
            const guilds = req.session.guilds || [];
            let guild = guilds.find(g => g.id === guildId);
            
            // إذا لم يتم العثور على السيرفر في الجلسة، نبحث عنه في كاش البوت مباشرة
            if (!guild && client?.guilds?.cache) {
                const botGuild = client.guilds.cache.get(guildId);
                if (botGuild) {
                    guild = { id: botGuild.id, name: botGuild.name, icon: botGuild.icon };
                }
            }

            if (!guild) {
                guild = { id: guildId, name: 'Discord Server', icon: null };
            }

            const user = req.session.user;
            let settings = {};
            try {
                settings = database.getGuildSettings ? database.getGuildSettings(guildId) : {};
            } catch (err) {
                console.error("Error reading guild settings:", err);
            }
            if (!settings) settings = {};

            const guildIcon = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

            const serverRailHtml = Array.isArray(guilds) && guilds.length > 0 ? guilds.map(g => `
                <a href="/dashboard/${g.id}" title="${g.name}" class="group relative flex items-center justify-center">
                    <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                         class="w-11 h-11 rounded-2xl ${g.id === guildId ? 'border-2 border-purple-500 shadow-lg shadow-purple-900/50' : 'border border-transparent'} hover:rounded-xl object-cover transition-all">
                </a>
            `).join('') : '';

            const sectionTitles = {
                'moderation': 'الإشراف وإدارة الأعضاء 🔨',
                'automod': 'الرقابة التلقائية وفلاتر السب والشات 🤖',
                'welcome': 'رسائل وبطاقات الترحيب والمغادرة 👋',
                'autoresponder': 'الرد التلقائي على الكلمات 💬',
                'tickets': 'نظام التذاكر والدعم الفني 🎫',
                'protection': 'جدار الحماية الشامل ومكافحة التخريب 🛡️',
                'antinuke': 'الحماية الخاصة (Anti-Nuke) 🔒',
                'antiraid': 'مكافحة الغزو والهجمات (Anti-Raid) 🚨',
                'levels': 'نظام الرتب واللفلات التفاعلي 📈',
                'tempvoice': 'الرومات الصوتية المؤقتة 🔊',
                'autoroles': 'الرتب التلقائية ورتب الدخول 🎖️',
                'starboard': 'قناة المشاهير (Starboard) ⭐',
                'embed': 'صانع رسائل الإيمبد المتقدم 📄',
                'colors': 'نظام اختيار ألوان الرتب 🎨',
                'logs': 'قنوات السجلات واللوق الشامل 📋',
                'fun': 'التسلية والألعاب والمنافسات 🎮',
                'general': 'الأوامر العامة والإعدادات الأساسية ⚙️',
                'settings': 'إعدادات السيرفر العامة ⚙️'
            };

            const title = sectionTitles[section] || ('إعدادات ' + section);

            // ==========================================
            // بناء استمارة الإعدادات الحقيقية المخصصة لكل موديول (ProBot Full Settings)
            // ==========================================
            let formFieldsHtml = '';

            if (section === 'protection' || section === 'antinuke') {
                formFieldsHtml = `
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <div class="flex items-center justify-between mb-4">
                                <label class="toggle"><input type="checkbox" name="anti_link" value="1" ${settings.anti_link ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="text-right">
                                    <h4 class="font-bold text-white text-sm">منع الروابط (Anti-Link)</h4>
                                    <p class="text-gray-400 text-[11px]">حذف روابط الديسكورد والمواقع غير المصرح بها فوراً</p>
                                </div>
                            </div>
                        </div>

                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <div class="flex items-center justify-between mb-4">
                                <label class="toggle"><input type="checkbox" name="anti_spam" value="1" ${settings.anti_spam ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="text-right">
                                    <h4 class="font-bold text-white text-sm">مكافحة السبام (Anti-Spam)</h4>
                                    <p class="text-gray-400 text-[11px]">منع التكرار والرسائل السريعة تلقائياً لحماية الشات</p>
                                </div>
                            </div>
                        </div>

                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <div class="flex items-center justify-between mb-4">
                                <label class="toggle"><input type="checkbox" name="anti_nuke_enabled" value="1" ${settings.anti_nuke_enabled ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="text-right">
                                    <h4 class="font-bold text-white text-sm">مكافحة التخريب (Anti-Nuke)</h4>
                                    <p class="text-gray-400 text-[11px]">حماية السيرفر من طرد أو حظر الرتب وتدمير القنوات</p>
                                </div>
                            </div>
                            <div class="mt-3">
                                <label class="block text-[11px] font-bold text-gray-400 mb-1 text-right">إجراء العقوبة عند التخريب</label>
                                <select name="anti_nuke_action" class="w-full bg-[#0b0c10] border border-purple-950/40 rounded-xl px-3 py-2 text-xs text-white outline-none">
                                    <option value="ban" ${settings.anti_nuke_action === 'ban' ? 'selected' : ''}>حظر فوري (Ban)</option>
                                    <option value="kick" ${settings.anti_nuke_action === 'kick' ? 'selected' : ''}>طرد من السيرفر (Kick)</option>
                                    <option value="strip_roles" ${settings.anti_nuke_action === 'strip_roles' ? 'selected' : ''}>سحب جميع الرتب (Strip Roles)</option>
                                </select>
                            </div>
                        </div>

                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <div class="text-right">
                                <h4 class="font-bold text-white text-sm mb-1">الحد الأدنى لعمر الحساب (Anti-Alt)</h4>
                                <p class="text-gray-400 text-[11px] mb-3">طرد الحسابات الوهمية والجديدة التي عمرها أقل من عدد الأيام المحدد</p>
                                <input type="number" name="anti_alt_days" value="${settings.anti_alt_days || 0}" min="0" max="365" class="w-full bg-[#0b0c10] border border-purple-950/40 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right" placeholder="0 لتعطيل الفحص">
                            </div>
                        </div>

                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <div class="text-right">
                                <h4 class="font-bold text-white text-sm mb-1">أقصى عدد منشن مسموح به في الرسالة</h4>
                                <input type="number" name="max_mentions" value="${settings.max_mentions || 4}" min="1" max="50" class="w-full bg-[#0b0c10] border border-purple-950/40 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                            </div>
                        </div>

                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <div class="text-right">
                                <h4 class="font-bold text-white text-sm mb-1">قناة سجلات الحماية (Protection Log Channel ID)</h4>
                                <input type="text" name="log_channel" value="${settings.log_channel || ''}" placeholder="ضع ID القناة..." class="w-full bg-[#0b0c10] border border-purple-950/40 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'welcome') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- Welcome Toggle & Live Card Preview -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <div class="flex items-center justify-between mb-4">
                                <label class="toggle"><input type="checkbox" name="welcome_image" value="1" ${settings.welcome_image ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="text-right">
                                    <h4 class="font-bold text-white text-sm">توليد بطاقة ترحيب مصممة بالاسم والافتار (Canvas Card)</h4>
                                    <p class="text-gray-400 text-[11px]">إرسال صورة ترحيبية احترافية تلقائياً لكل عضو ينضم للسيرفر</p>
                                </div>
                            </div>
                            <!-- Live Preview Visual -->
                            <div class="mt-4 p-4 rounded-xl bg-gradient-to-r from-purple-950/40 via-[#0d0e15] to-indigo-950/40 border border-purple-900/30 flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <div class="w-12 h-12 rounded-full border-2 border-purple-500 bg-[#1f212d] flex items-center justify-center text-lg">👤</div>
                                    <div class="text-right">
                                        <p class="text-xs font-bold text-white">WELCOME TO THE SERVER</p>
                                        <p class="text-[11px] text-purple-300 font-mono">Member #124</p>
                                    </div>
                                </div>
                                <span class="text-[10px] bg-purple-900/50 text-purple-200 px-2.5 py-1 rounded-lg border border-purple-700/40">معاينة مباشرة</span>
                            </div>
                        </div>

                        <!-- Channels & Roles Selection -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">قناة الترحيب (Welcome Channel ID)</label>
                                <input type="text" name="welcome_channel" value="${settings.welcome_channel || ''}" placeholder="ضع ID روم الترحيب هنا..." class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">الرتبة التلقائية للأعضاء الجدد (Auto-Role ID)</label>
                                <input type="text" name="auto_role" value="${settings.auto_role || ''}" placeholder="ضع ID الرتبة التلقائية..." class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                        </div>

                        <!-- Custom Message with Quick Insert Tags -->
                        <div>
                            <div class="flex items-center justify-between mb-2">
                                <div class="flex items-center gap-1.5">
                                    <button type="button" onclick="insertTag('[user]')" class="px-2 py-1 bg-purple-950/50 hover:bg-purple-800/60 text-purple-300 border border-purple-900/40 rounded-lg text-[10px] font-mono transition">+ منشن العضو [user]</button>
                                    <button type="button" onclick="insertTag('[server]')" class="px-2 py-1 bg-purple-950/50 hover:bg-purple-800/60 text-purple-300 border border-purple-900/40 rounded-lg text-[10px] font-mono transition">+ اسم السيرفر [server]</button>
                                    <button type="button" onclick="insertTag('[memberCount]')" class="px-2 py-1 bg-purple-950/50 hover:bg-purple-800/60 text-purple-300 border border-purple-900/40 rounded-lg text-[10px] font-mono transition">+ رقم العضو [memberCount]</button>
                                </div>
                                <label class="text-xs font-bold text-gray-300">رسالة الترحيب النصية</label>
                            </div>
                            <textarea id="welcomeTextarea" name="welcome_message" rows="4" placeholder="أهلاً بك [user] في سيرفر [server]! أنت العضو رقم [memberCount] 🎉 نتمنى لك قضاء وقت ممتع معنا!" class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right leading-relaxed">${settings.welcome_message || ''}</textarea>
                        </div>
                    </div>
                `;
            } else if (section === 'tickets') {
                formFieldsHtml = `
                    <div class="space-y-5">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">كاتيجوري التذاكر (Category ID)</label>
                                <input type="text" name="ticket_category" value="${settings.ticket_category || ''}" placeholder="ضع ID الكاتيجوري..." class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">رتبة الدعم الفني (Support Role ID)</label>
                                <input type="text" name="support_role" value="${settings.support_role || ''}" placeholder="ضع ID رتبة المشرفين..." class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-gray-300 mb-2 text-right">قناة حفظ السجلات والترانسكريبت (Ticket Log Channel ID)</label>
                            <input type="text" name="ticket_log_channel" value="${settings.ticket_log_channel || ''}" placeholder="ضع ID روم حفظ السجلات..." class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                        </div>
                    </div>
                `;
            } else if (section === 'levels') {
                formFieldsHtml = `
                    <div class="space-y-5">
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <div class="flex items-center justify-between mb-4">
                                <label class="toggle"><input type="checkbox" name="leveling_enabled" value="1" ${settings.leveling_enabled ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="text-right">
                                    <h4 class="font-bold text-white text-sm">تفعيل نظام اللفلات واكتساب XP</h4>
                                    <p class="text-gray-400 text-[11px]">يحصل الأعضاء على نقاط خبرة وتصنيف عند التفاعل</p>
                                </div>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">مضاعف نقاط الـ XP (Multiplier)</label>
                                <input type="number" step="0.1" name="level_multiplier" value="${settings.level_multiplier || 1.0}" class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">قناة إرسال الترقية (Level Up Channel ID)</label>
                                <input type="text" name="level_channel" value="${settings.level_channel || 'current'}" placeholder="current أو ID القناة..." class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-gray-300 mb-2 text-right">رسالة الترقية (المتغيرات: [user] [level])</label>
                            <input type="text" name="level_message" value="${settings.level_message || 'مبروك [user] لقد وصلت إلى المستوى [level]! 🎉'}" class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">
                        </div>
                    </div>
                `;
            } else if (section === 'automod') {
                formFieldsHtml = `
                    <div class="space-y-5">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="anti_caps" value="1" ${settings.anti_caps ? 'checked' : ''}><span class="slider"></span></label>
                                <span class="font-bold text-white text-xs">منع الحروف الكبيرة (Anti-Caps)</span>
                            </div>
                            <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="anti_emoji_spam" value="1" ${settings.anti_emoji_spam ? 'checked' : ''}><span class="slider"></span></label>
                                <span class="font-bold text-white text-xs">منع سبام الإيموجي (Anti-Emoji)</span>
                            </div>
                            <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="bad_words_enabled" value="1" ${settings.bad_words_enabled ? 'checked' : ''}><span class="slider"></span></label>
                                <span class="font-bold text-white text-xs">فلتر الكلمات المسيئة (Bad Words)</span>
                            </div>
                            <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="anti_line_spam" value="1" ${settings.anti_line_spam ? 'checked' : ''}><span class="slider"></span></label>
                                <span class="font-bold text-white text-xs">منع تكرار الأسطر الطويلة</span>
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-gray-300 mb-2 text-right">قائمة الكلمات المحظورة (افصل بينها بفاصلة)</label>
                            <textarea name="bad_words_list" rows="3" placeholder="كلمة1, كلمة2, كلمة3..." class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">${settings.bad_words_list || ''}</textarea>
                        </div>
                    </div>
                `;
            } else if (section === 'tempvoice') {
                formFieldsHtml = `
                    <div class="space-y-5">
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <div class="flex items-center justify-between mb-4">
                                <label class="toggle"><input type="checkbox" name="temp_voice_enabled" value="1" ${settings.temp_voice_enabled ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="text-right">
                                    <h4 class="font-bold text-white text-sm">تفعيل الرومات الصوتية المؤقتة</h4>
                                    <p class="text-gray-400 text-[11px]">إنشاء روم صوتي خاص تلقائياً عند دخول القناة الرئيسية</p>
                                </div>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">قناة الإنشاء الرئيسية (Join to Create Channel ID)</label>
                                <input type="text" name="temp_voice_channel" value="${settings.temp_voice_channel || ''}" placeholder="ضع ID القناة الصوتية..." class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">كاتيجوري الرومات المؤقتة (Category ID)</label>
                                <input type="text" name="temp_voice_category" value="${settings.temp_voice_category || ''}" placeholder="ضع ID الكاتيجوري..." class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'autoresponder') {
                const autoRespondersList = database.getAutoResponders ? database.getAutoResponders(guildId) : [];
                const respondersHtml = autoRespondersList && autoRespondersList.length > 0 ? autoRespondersList.map(r => `
                    <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                        <button type="button" onclick="deleteResponder('${guildId}', '${r.trigger_word}')" class="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-900/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                        <div class="text-right">
                            <p class="font-bold text-white text-xs">إذا كتب العضو: <span class="text-purple-300 font-mono bg-purple-950/40 px-2 py-0.5 rounded">"${r.trigger_word}"</span></p>
                            <p class="text-gray-300 text-xs mt-1">يرد البوت: <span class="text-gray-200">"${r.reply_text}"</span></p>
                        </div>
                    </div>
                `).join('') : '<p class="text-gray-500 text-xs text-center py-4">لا توجد ردود تلقائية مضافة حالياً. أضف ردك الأول بالأسفل!</p>';

                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- Current Responders List -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <h4 class="font-bold text-white text-sm mb-3 text-right">قائمة الردود التلقائية النشطة (${autoRespondersList.length})</h4>
                            <div class="space-y-2.5 max-h-60 overflow-y-auto">
                                ${respondersHtml}
                            </div>
                        </div>

                        <!-- Add New Responder Form -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl text-right">
                            <h4 class="font-bold text-white text-sm mb-1">إضافة رد تلقائي جديد 💬</h4>
                            <p class="text-gray-400 text-xs mb-4">يقوم البوت بالرد التلقائي فوراً في الشات بمجرد كتابة الكلمة المحددة.</p>
                            
                            <div class="space-y-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-1 text-right">الكلمة المفتاحية (Trigger Word)</label>
                                    <input type="text" id="triggerWordInput" placeholder="مثال: السلام عليكم أو رابط السيرفر" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-1 text-right">الرد التلقائي للبوت (Response Message)</label>
                                    <textarea id="replyTextInput" rows="3" placeholder="مثال: وعليكم السلام ورحمة الله وبركاته، أهلاً وسهلاً بك في سيرفرنا!" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right"></textarea>
                                </div>
                                <div class="pt-2">
                                    <button type="button" onclick="addAutoResponder('${guildId}')" class="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-purple-900/30">
                                        + إضافة وحفظ الرد التلقائي
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'general' || section === 'settings') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">برفكس البوت الافتراضي (Default Prefix)</label>
                                <input type="text" name="prefix" value="${settings.prefix || '#'}" class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">قناة السجلات العامة (General Logs Channel ID)</label>
                                <input type="text" name="log_channel" value="${settings.log_channel || ''}" placeholder="ضع ID القناة..." class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                        </div>

                        <!-- All 12 General & Utility Commands Suite -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <h4 class="font-bold text-white text-sm mb-4 text-right">جميع الأوامر العامة والخدمية المتاحة (12 أمراً)</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                
                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/ping & #ping</p>
                                        <p class="text-gray-400 text-[10px]">فحص سرعة استجابة البوت وسيرفرات ديسكورد</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/bot & #bot</p>
                                        <p class="text-gray-400 text-[10px]">عرض معلومات ومواصفات وإحصائيات البوت</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/server & #server</p>
                                        <p class="text-gray-400 text-[10px]">عرض معلومات السيرفر والأونر وتاريخ الإنشاء</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/user & #user</p>
                                        <p class="text-gray-400 text-[10px]">عرض بطاقة معلومات العضو ورتبه وتاريخ الانضمام</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/avatar & #avatar</p>
                                        <p class="text-gray-400 text-[10px]">عرض وتحميل الصورة الرمزية للعضو أو السيرفر</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/banner & #banner</p>
                                        <p class="text-gray-400 text-[10px]">عرض بنر الملف الشخصي أو بنر السيرفر</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/roles & #roles</p>
                                        <p class="text-gray-400 text-[10px]">عرض قائمة جميع رتب السيرفر وأعداد أعضائها</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/channels & #channels</p>
                                        <p class="text-gray-400 text-[10px]">إحصائيات القنوات الصوتية والنصية والكاتيجوري</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/help & #help</p>
                                        <p class="text-gray-400 text-[10px]">قائمة المساعدة التفاعلية المنسدلة لجميع الأوامر</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/profile & /id</p>
                                        <p class="text-gray-400 text-[10px]">بطاقة البروفايل التفاعلية مع الرصيد والمستوى</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/emojis & #emojis</p>
                                        <p class="text-gray-400 text-[10px]">استعراض وإحصاء جميع إيموجيات وستيكرات السيرفر</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/tax & #tax</p>
                                        <p class="text-gray-400 text-[10px]">حاسبة ضريبة بروبوت والتحويلات الذكية</p>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                `;
                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- Quick Stats & Settings -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">برفكس الأوامر (Prefix)</label>
                                <input type="text" name="prefix" value="${settings.prefix || '#'}" class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">قناة سجلات الإشراف (Mod Logs Channel ID)</label>
                                <input type="text" name="log_channel" value="${settings.log_channel || ''}" placeholder="ضع ID القناة..." class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                        </div>

                        <!-- Moderation Commands List (ProBot Style Toggles) -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <h4 class="font-bold text-white text-sm mb-4 text-right">أوامر الإشراف المتاحة</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                
                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/ban & #ban</p>
                                        <p class="text-gray-400 text-[10px]">حظر الأعضاء المؤقت والنهائي مع إرسال رسالة خاصة</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/kick & #kick</p>
                                        <p class="text-gray-400 text-[10px]">طرد الأعضاء المخالفين من السيرفر فوراً</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/timeout & /mute</p>
                                        <p class="text-gray-400 text-[10px]">إعطاء تايم اوت وكتم صوتي وكتابي بمدة محددة</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/warn & /warnings</p>
                                        <p class="text-gray-400 text-[10px]">نظام تحذيرات متقدم مع عقوبات تلقائية تراكمية</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/clear & #clear</p>
                                        <p class="text-gray-400 text-[10px]">مسح الرسائل مع فلاتر (بوتات، صور، روابط)</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/lock & /unlock</p>
                                        <p class="text-gray-400 text-[10px]">قفل وفتح القنوات النصية للسيرفر بالكامل أو لقناة معينة</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/role & /temprole</p>
                                        <p class="text-gray-400 text-[10px]">إعطاء وسحب الرتب المؤقتة والدائمة لعدة أعضاء</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/slowmode & #slowmode</p>
                                        <p class="text-gray-400 text-[10px]">تفعيل وإيقاف الوضع البطيء للرومات</p>
                                    </div>
                                </div>

                            </div>
                        </div>

                        <!-- Punishment System -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl text-right">
                            <h4 class="font-bold text-white text-sm mb-3">نظام العقوبات التلقائي للتحذيرات (Auto Warn Punishments)</h4>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                <div class="bg-[#0b0c10] p-4 rounded-xl border border-purple-950/30 text-center">
                                    <span class="text-xl mb-1 block">⏳</span>
                                    <p class="font-bold text-purple-300">3 تحذيرات</p>
                                    <p class="text-gray-400 text-[11px] mt-1">تايم اوت تلقائي لمدة 1 ساعة</p>
                                </div>
                                <div class="bg-[#0b0c10] p-4 rounded-xl border border-purple-950/30 text-center">
                                    <span class="text-xl mb-1 block">👢</span>
                                    <p class="font-bold text-amber-400">5 تحذيرات</p>
                                    <p class="text-gray-400 text-[11px] mt-1">طرد تلقائي من السيرفر (Kick)</p>
                                </div>
                                <div class="bg-[#0b0c10] p-4 rounded-xl border border-purple-950/30 text-center">
                                    <span class="text-xl mb-1 block">🔨</span>
                                    <p class="font-bold text-red-400">7 تحذيرات</p>
                                    <p class="text-gray-400 text-[11px] mt-1">حظر نهائي من السيرفر (Ban)</p>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'embed') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- Embed Controls -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-6 rounded-2xl space-y-5">
                            <h4 class="font-bold text-white text-sm text-right">صانع الإيمبد المتقدم (Interactive Embed Builder) 📄</h4>
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">القناة المستهدفة (Channel ID) <span class="text-purple-400">*</span></label>
                                    <input type="text" id="embedChannelInput" placeholder="ضع ID الروم هنا..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-mono">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">لون الإيمبد (Hex Color)</label>
                                    <div class="flex items-center gap-2">
                                        <input type="color" id="embedColorPicker" value="#9333ea" onchange="document.getElementById('embedColorInput').value = this.value; updateEmbedPreview()" class="w-10 h-9 rounded-xl bg-transparent border-0 cursor-pointer">
                                        <input type="text" id="embedColorInput" value="#9333ea" oninput="updateEmbedPreview()" placeholder="#9333ea" class="flex-1 bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2 text-xs text-white outline-none text-right font-mono">
                                    </div>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">اسم الكاتب (Author Name)</label>
                                    <input type="text" id="embedAuthorInput" oninput="updateEmbedPreview()" placeholder="اسم الكاتب أو الإدارة..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">عنوان الرسالة (Embed Title)</label>
                                    <input type="text" id="embedTitleInput" oninput="updateEmbedPreview()" placeholder="اكتب العنوان الرئيسي هنا..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">محتوى الرسالة (Description) <span class="text-purple-400">*</span></label>
                                <textarea id="embedDescInput" oninput="updateEmbedPreview()" rows="4" placeholder="اكتب تفاصيل الرسالة والإعلان والتنسيق هنا..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right leading-relaxed"></textarea>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">رابط صورة البنر الكبيرة (Banner Image URL)</label>
                                    <input type="text" id="embedImageInput" oninput="updateEmbedPreview()" placeholder="https://..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-left font-mono">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">النص السفلي (Footer Text)</label>
                                    <input type="text" id="embedFooterInput" oninput="updateEmbedPreview()" placeholder="حقوق السيرفر أو نص التذييل..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                            </div>

                            <!-- Live Interactive Preview Box -->
                            <div class="pt-4 border-t border-purple-950/40">
                                <h5 class="text-xs font-bold text-gray-400 mb-3 text-right">المعاينة الحية لرسالة الإيمبد (Discord Live Preview)</h5>
                                <div id="previewCard" class="bg-[#2b2d31] p-4 rounded-xl border-r-4 border-[#9333ea] text-right space-y-2 max-w-lg mx-auto shadow-xl">
                                    <p id="previewAuthor" class="text-[11px] font-bold text-gray-300 hidden"></p>
                                    <h4 id="previewTitle" class="text-sm font-bold text-white">عنوان الرسالة التجريبي</h4>
                                    <p id="previewDesc" class="text-xs text-gray-300 whitespace-pre-wrap">محتوى رسالة الإيمبد يظهر هنا كما سيبدو تماماً في الديسكورد...</p>
                                    <p id="previewFooter" class="text-[10px] text-gray-400 pt-2 border-t border-gray-700/40 hidden"></p>
                                </div>
                            </div>

                            <div class="pt-3 flex items-center justify-between">
                                <span id="embedSendStatus" class="text-xs font-bold text-emerald-400 hidden">✅ تم إرسال رسالة الإيمبد إلى الروم في الديسكورد بنجاح!</span>
                                <button type="button" onclick="sendEmbedToDiscord('${guildId}')" class="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-purple-900/40 flex items-center gap-2">
                                    <span>🚀</span>
                                    <span>إرسال الإيمبد إلى ديسكورد الآن</span>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'general' || section === 'settings') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- Server Overview Card -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-bold text-white text-sm">${guild.name}</h4>
                                    <p class="text-gray-400 text-xs font-mono">ID: ${guildId}</p>
                                </div>
                                <img src="${guildIcon}" class="w-12 h-12 rounded-2xl border border-purple-900/40 object-cover">
                            </div>
                            <span class="px-3 py-1 bg-purple-950/60 text-purple-300 border border-purple-800/40 rounded-xl text-xs font-bold">سيرفر نشط ✅</span>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">برفكس البوت الافتراضي (Default Prefix)</label>
                                <input type="text" name="prefix" value="${settings.prefix || '#'}" class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">قناة السجلات العامة (General Logs Channel ID)</label>
                                <input type="text" name="log_channel" value="${settings.log_channel || ''}" placeholder="ضع ID القناة..." class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                        </div>

                        <!-- All 12 General & Utility Commands Suite -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <h4 class="font-bold text-white text-sm mb-4 text-right">جميع الأوامر العامة والخدمية المتاحة (12 أمراً)</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                
                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/ping & #ping</p>
                                        <p class="text-gray-400 text-[10px]">فحص سرعة استجابة البوت وسيرفرات ديسكورد</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/bot & #bot</p>
                                        <p class="text-gray-400 text-[10px]">عرض معلومات ومواصفات وإحصائيات البوت</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/server & #server</p>
                                        <p class="text-gray-400 text-[10px]">عرض معلومات السيرفر والأونر وتاريخ الإنشاء</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/user & #user</p>
                                        <p class="text-gray-400 text-[10px]">عرض بطاقة معلومات العضو ورتبه وتاريخ الانضمام</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/avatar & #avatar</p>
                                        <p class="text-gray-400 text-[10px]">عرض وتحميل الصورة الرمزية للعضو أو السيرفر</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/banner & #banner</p>
                                        <p class="text-gray-400 text-[10px]">عرض بنر الملف الشخصي أو بنر السيرفر</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/roles & #roles</p>
                                        <p class="text-gray-400 text-[10px]">عرض قائمة جميع رتب السيرفر وأعداد أعضائها</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/channels & #channels</p>
                                        <p class="text-gray-400 text-[10px]">إحصائيات القنوات الصوتية والنصية والكاتيجوري</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/help & #help</p>
                                        <p class="text-gray-400 text-[10px]">قائمة المساعدة التفاعلية المنسدلة لجميع الأوامر</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/profile & /id</p>
                                        <p class="text-gray-400 text-[10px]">بطاقة البروفايل التفاعلية مع الرصيد والمستوى</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/emojis & #emojis</p>
                                        <p class="text-gray-400 text-[10px]">استعراض وإحصاء جميع إيموجيات وستيكرات السيرفر</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/tax & #tax</p>
                                        <p class="text-gray-400 text-[10px]">حاسبة ضريبة بروبوت والتحويلات الذكية</p>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'autoroles') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <h4 class="font-bold text-white text-sm mb-2 text-right">إعدادات الرتب التلقائية (Auto Roles)</h4>
                            <p class="text-gray-400 text-xs mb-4 text-right">يتم إعطاء هذه الرتب تلقائياً للأعضاء الجدد فور انضمامهم للسيرفر.</p>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">رتبة الأعضاء الجدد (Member Role ID)</label>
                                    <input type="text" name="auto_role" value="${settings.auto_role || ''}" placeholder="ضع ID الرتبة..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">رتبة البوتات التلقائية (Bot Role ID)</label>
                                    <input type="text" placeholder="ضع ID رتبة البوتات..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'starboard') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <h4 class="font-bold text-white text-sm mb-2 text-right">نظام ستاربورد (Starboard) ⭐</h4>
                            <p class="text-gray-400 text-xs mb-4 text-right">نشر الرسائل المميزة تلقائياً في روم المشاهير عند تفاعل الأعضاء عليها بإيموجي النجمة ⭐.</p>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">قناة الستاربورد (Starboard Channel ID)</label>
                                    <input type="text" placeholder="ضع ID القناة..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">الحد الأدنى للنجوم (Star Threshold)</label>
                                    <input type="number" value="3" min="1" max="50" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'colors') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl text-right">
                            <h4 class="font-bold text-white text-sm mb-2">نظام ألوان الرتب التفاعلي (Color Roles) 🎨</h4>
                            <p class="text-gray-400 text-xs mb-4">يتيح للأعضاء اختيار لون اسمهم في السيرفر عبر القائمة أو الأزرار التفاعلية.</p>
                            
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div class="p-3 bg-[#0b0c10] border border-purple-950/40 rounded-xl text-center">
                                    <span class="w-6 h-6 rounded-full bg-purple-500 inline-block mb-1 shadow-lg shadow-purple-500/50"></span>
                                    <p class="text-xs font-bold text-white">أرجواني الملكي</p>
                                </div>
                                <div class="p-3 bg-[#0b0c10] border border-purple-950/40 rounded-xl text-center">
                                    <span class="w-6 h-6 rounded-full bg-blue-500 inline-block mb-1 shadow-lg shadow-blue-500/50"></span>
                                    <p class="text-xs font-bold text-white">أزرق سماوي</p>
                                </div>
                                <div class="p-3 bg-[#0b0c10] border border-purple-950/40 rounded-xl text-center">
                                    <span class="w-6 h-6 rounded-full bg-emerald-500 inline-block mb-1 shadow-lg shadow-emerald-500/50"></span>
                                    <p class="text-xs font-bold text-white">أخضر زمردي</p>
                                </div>
                                <div class="p-3 bg-[#0b0c10] border border-purple-950/40 rounded-xl text-center">
                                    <span class="w-6 h-6 rounded-full bg-amber-500 inline-block mb-1 shadow-lg shadow-amber-500/50"></span>
                                    <p class="text-xs font-bold text-white">ذهبي متألق</p>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'logs') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <h4 class="font-bold text-white text-sm mb-4 text-right">قنوات السجلات واللوق الشامل (Full Audit Logging) 📋</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">سجلات الرسائل المحذوفة والمعدلة</label>
                                    <input type="text" name="log_channel" value="${settings.log_channel || ''}" placeholder="Channel ID..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">سجلات دخول وخروج الأعضاء</label>
                                    <input type="text" value="${settings.welcome_channel || ''}" placeholder="Channel ID..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">سجلات الرومات الصوتية</label>
                                    <input type="text" placeholder="Channel ID..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">سجلات الرتب والصلاحيات</label>
                                    <input type="text" placeholder="Channel ID..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'antiraid') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <h4 class="font-bold text-white text-sm mb-4 text-right">مكافحة الغزو والهجمات (Anti-Raid Protection) 🚨</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">الحد الأقصى لدخول الأعضاء في 10 ثوانٍ</label>
                                    <input type="number" value="5" min="2" max="50" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">الإجراء الفوري عند كشف هجوم</label>
                                    <select class="w-full bg-[#0b0c10] border border-purple-950/40 rounded-xl px-4 py-3 text-xs text-white outline-none">
                                        <option value="lockdown">إغلاق السيرفر مؤقتاً (Lockdown)</option>
                                        <option value="kick">طرد الأعضاء الجدد فوراً (Kick New Joins)</option>
                                        <option value="ban">حظر المهاجمين (Mass Ban)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'fun') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <h4 class="font-bold text-white text-sm mb-4 text-right">ألعاب ومنافسات البوت التفاعلية 🎮</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/roulette & #roulette</p>
                                        <p class="text-gray-400 text-[10px]">لعبة الروليت الكلاسيكية مع عجلة متحركة وتحديات حظ</p>
                                    </div>
                                </div>
                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/fight & #fight</p>
                                        <p class="text-gray-400 text-[10px]">قتال ومبارزة PvP تفاعلية بنقاط صحة HP مع الأصدقاء</p>
                                    </div>
                                </div>
                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/trivia & /quiz</p>
                                        <p class="text-gray-400 text-[10px]">مسابقات وأسئلة إسلامية وعامة مع مؤقت زمني</p>
                                    </div>
                                </div>
                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/coinflip & /dice</p>
                                        <p class="text-gray-400 text-[10px]">رمي النرد وملك أو كتابة مع مكافآت عملات</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                formFieldsHtml = `
                    <div class="space-y-5">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">برفكس الأوامر (Prefix)</label>
                                <input type="text" name="prefix" value="${settings.prefix || '#'}" class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">قناة السجلات (Log Channel ID)</label>
                                <input type="text" name="log_channel" value="${settings.log_channel || ''}" placeholder="ضع ID القناة..." class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                        </div>
                    </div>
                `;
            }

            res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${title} | ${guild.name}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                <style>
                    body { background-color: #0b0c10; color: #e2e8f0; font-family: 'Cairo', sans-serif; }
                    .toggle { position: relative; display: inline-block; width: 40px; height: 20px; }
                    .toggle input { opacity: 0; width: 0; height: 0; }
                    .slider { position: absolute; cursor: pointer; inset: 0; background: #1f212d; border-radius: 20px; transition: .2s; }
                    .slider:before { content: ''; position: absolute; width: 14px; height: 14px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .2s; }
                    input:checked + .slider { background: #9333ea; }
                    input:checked + .slider:before { transform: translateX(20px); }
                </style>
            </head>
            <body class="min-h-screen flex flex-col bg-[#0b0c10] text-gray-200">
                
                <!-- Header -->
                <header class="h-16 bg-[#0f1016]/90 backdrop-blur-md border-b border-purple-950/40 px-6 flex items-center justify-between sticky top-0 z-50">
                    <div class="flex items-center gap-4">
                        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="text-xs text-gray-400 hover:text-purple-300 transition">الدعم الفني</a>
                        <span class="text-gray-700">|</span>
                        <a href="/dashboard/${guildId}" class="text-xs text-purple-400 hover:text-purple-300 font-bold transition">الرجوع للوحة التحكم</a>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-black text-sm text-white tracking-wide">ZENO</span>
                        <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white font-black text-xs shadow-lg shadow-purple-900/30">Z</div>
                    </div>
                </header>

                <div class="flex-1 flex overflow-hidden">
                    <main class="flex-1 p-8 overflow-y-auto max-w-4xl mx-auto">
                        <div class="bg-[#10111a] border border-purple-950/40 rounded-3xl p-8 shadow-2xl mb-8">
                            <div class="flex items-center justify-between pb-6 mb-6 border-b border-purple-950/40">
                                <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', '${section}_enabled', this.checked)" checked><span class="slider"></span></label>
                                <div class="text-right">
                                    <h2 class="text-2xl font-black text-white">${title}</h2>
                                    <p class="text-gray-400 text-xs mt-1">يتم تطبيق كل التعديلات وحفظها مباشرة في سيرفر الديسكورد لحظياً بدون إعادة تشغيل.</p>
                                </div>
                            </div>

                            <form id="settingsForm" class="space-y-6">
                                ${formFieldsHtml}

                                <div class="pt-6 border-t border-purple-950/40 flex items-center justify-between flex-row-reverse">
                                    <button type="submit" class="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-purple-900/30 flex items-center gap-2">
                                        <span>💾</span>
                                        <span>حفظ التغييرات</span>
                                    </button>
                                    <span id="saveStatus" class="text-xs text-emerald-400 font-bold hidden flex items-center gap-1.5">
                                        <span>✅</span>
                                        <span>تم الحفظ وتطبيق التغييرات في السيرفر بنجاح!</span>
                                    </span>
                                </div>
                            </form>
                        </div>
                    </main>

                    <!-- Server Rail -->
                    <div class="w-16 bg-[#08080c] border-l border-purple-950/40 py-4 flex flex-col items-center gap-3 shrink-0 overflow-y-auto">
                        <a href="/dashboard" title="الرئيسية" class="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-purple-900/40">Z</a>
                        <div class="w-8 h-[1px] bg-purple-950/40"></div>
                        ${serverRailHtml}
                    </div>
                </div>

                <script>
                    async function addAutoResponder(guildId) {
                        const trigger = document.getElementById('triggerWordInput')?.value?.trim();
                        const reply = document.getElementById('replyTextInput')?.value?.trim();
                        if (!trigger || !reply) {
                            alert('الرجاء كتابة الكلمة المفتاحية ونص الرد!');
                            return;
                        }

                        const res = await fetch('/api/guild/' + guildId + '/autoresponder', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ trigger_word: trigger, reply_text: reply })
                        });
                        if (res.ok) {
                            location.reload();
                        }
                    }

                    async function deleteResponder(guildId, word) {
                        if (confirm('هل أنت متأكد من رغبتك في حذف هذا الرد التلقائي؟')) {
                            const res = await fetch('/api/guild/' + guildId + '/autoresponder/delete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ trigger_word: word })
                            });
                            if (res.ok) {
                                location.reload();
                            }
                        }
                    }

                    function updateEmbedPreview() {
                        const title = document.getElementById('embedTitleInput')?.value || 'عنوان الرسالة التجريبي';
                        const desc = document.getElementById('embedDescInput')?.value || 'محتوى رسالة الإيمبد يظهر هنا كما سيبدو تماماً في الديسكورد...';
                        const color = document.getElementById('embedColorInput')?.value || '#9333ea';
                        const author = document.getElementById('embedAuthorInput')?.value || '';
                        const footer = document.getElementById('embedFooterInput')?.value || '';

                        const previewCard = document.getElementById('previewCard');
                        const pTitle = document.getElementById('previewTitle');
                        const pDesc = document.getElementById('previewDesc');
                        const pAuthor = document.getElementById('previewAuthor');
                        const pFooter = document.getElementById('previewFooter');

                        if (previewCard) previewCard.style.borderColor = color;
                        if (pTitle) pTitle.innerText = title;
                        if (pDesc) pDesc.innerText = desc;

                        if (pAuthor) {
                            if (author) {
                                pAuthor.innerText = author;
                                pAuthor.classList.remove('hidden');
                            } else {
                                pAuthor.classList.add('hidden');
                            }
                        }

                        if (pFooter) {
                            if (footer) {
                                pFooter.innerText = footer;
                                pFooter.classList.remove('hidden');
                            } else {
                                pFooter.classList.add('hidden');
                            }
                        }
                    }

                    async function sendEmbedToDiscord(guildId) {
                        const channel_id = document.getElementById('embedChannelInput')?.value?.trim();
                        const color = document.getElementById('embedColorInput')?.value?.trim() || '#9333ea';
                        const title = document.getElementById('embedTitleInput')?.value?.trim();
                        const description = document.getElementById('embedDescInput')?.value?.trim();
                        const author = document.getElementById('embedAuthorInput')?.value?.trim();
                        const footer = document.getElementById('embedFooterInput')?.value?.trim();
                        const image_url = document.getElementById('embedImageInput')?.value?.trim();

                        if (!channel_id || !description) {
                            alert('الرجاء إدخال ID القناة المستهدفة ومحتوى الرسالة (Description)!');
                            return;
                        }

                        const res = await fetch('/api/guild/' + guildId + '/embed', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ channel_id, color, title, description, author, footer, image_url })
                        });

                        const status = document.getElementById('embedSendStatus');
                        if (res.ok) {
                            if (status) {
                                status.innerText = '✅ تم إرسال رسالة الإيمبد إلى الروم في الديسكورد بنجاح!';
                                status.classList.remove('hidden');
                                setTimeout(() => status.classList.add('hidden'), 5000);
                            }
                        } else {
                            const data = await res.json();
                            alert('حدث خطأ أثناء الإرسال: ' + (data.error || 'تأكد من صحة ID الروم وصلاحيات البوت'));
                        }
                    }

                    function insertTag(tag) {
                        const area = document.getElementById('welcomeTextarea');
                        if (area) {
                            area.value += ' ' + tag;
                            area.focus();
                        }
                    }

                    function toggleModule(guildId, key, val) {
                        fetch('/api/guild/' + guildId + '/module', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ module: key, enabled: val })
                        });
                    }

                    document.getElementById('settingsForm').addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const formData = new FormData(e.target);
                        for (let [key, value] of formData.entries()) {
                            await fetch('/api/guild/${guildId}/settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ key, value })
                            });
                        }
                        const status = document.getElementById('saveStatus');
                        status.classList.remove('hidden');
                        setTimeout(() => status.classList.add('hidden'), 4000);
                    });
                </script>
            </body>
            </html>
            `);
        } catch (e) {
            console.error("Dashboard render error:", e);
            res.status(500).send("Error rendering section: " + e.message);
        }
    });

};