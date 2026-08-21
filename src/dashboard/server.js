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
            const stats = {
                guilds: client?.guilds?.cache?.size || 0,
                users: client?.users?.cache?.size || 0,
                ping: client?.ws?.ping || 24
            };

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
                        <img src="/logo.png" class="w-9 h-9 rounded-xl object-cover border border-purple-500/40 shadow-lg shadow-purple-900/50" alt="ZENO">
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
            console.error("Dashboard / error:", e);
            res.status(500).send(`<pre style="color:red;background:#111;padding:20px;font-family:monospace">${e.stack || e.message || e}</pre>`);
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
    // 3. صفحة الملف الشخصي ولوحة تحكم المستخدم الكاملة (User Dashboard)
    // ========================================================
    app.get('/dashboard', (req, res) => {
        try {
            if (!req.session?.user) return res.redirect('/auth/discord');
            const user = req.session.user;
            const guilds = req.session.guilds || [];
            const userAvatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

            // جلب بيانات المستخدم الفعلية من SQLite
            let userCoins = 0, userLevel = 1, userStars = 0, userXp = 0, userLastDaily = 0, userWallpaper = 'default';
            let xpLeaderboard = [];
            let coinsLeaderboard = [];
            let userRankXp = 1;
            let userRankCoins = 1;

            try {
                const userRow = rawDb.prepare('SELECT SUM(coins) as coins, MAX(level) as level, SUM(reputation) as rep, SUM(xp) as xp, MAX(last_daily) as last_daily, MAX(wallpaper) as wallpaper FROM users WHERE user_id = ?').get(user.id);
                userCoins = userRow?.coins || 0;
                userLevel = userRow?.level || 1;
                userStars = userRow?.rep || 0;
                userXp = userRow?.xp || 0;
                userLastDaily = userRow?.last_daily || 0;
                userWallpaper = userRow?.wallpaper || 'default';

                xpLeaderboard = rawDb.prepare(`
                    SELECT user_id, SUM(xp) as total_xp, MAX(level) as max_level, SUM(coins) as total_coins
                    FROM users
                    GROUP BY user_id
                    ORDER BY total_xp DESC
                    LIMIT 100
                `).all();

                coinsLeaderboard = rawDb.prepare(`
                    SELECT user_id, SUM(coins) as total_coins, MAX(level) as max_level, SUM(xp) as total_xp
                    FROM users
                    GROUP BY user_id
                    ORDER BY total_coins DESC
                    LIMIT 100
                `).all();

                const xIndex = xpLeaderboard.findIndex(r => r.user_id === user.id);
                if (xIndex !== -1) userRankXp = xIndex + 1;

                const cIndex = coinsLeaderboard.findIndex(r => r.user_id === user.id);
                if (cIndex !== -1) userRankCoins = cIndex + 1;
            } catch (err) {}

            // التحقق من حالة المكافأة اليومية
            const now = Date.now();
            const dailyCooldown = 24 * 60 * 60 * 1000;
            const timePassed = now - userLastDaily;
            const canClaimDaily = timePassed >= dailyCooldown;
            const timeLeftMs = Math.max(0, dailyCooldown - timePassed);
            const hoursLeft = Math.floor(timeLeftMs / (1000 * 60 * 60));
            const minsLeft = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));

            // قائمة السيرفرات على الشريط الرأسي الأيمن (Server Rail)
            const serverRailHtml = guilds.map(g => `
                <a href="/dashboard/${g.id}" title="${g.name}" class="group relative flex items-center justify-center">
                    <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                         class="w-11 h-11 rounded-2xl bg-[#1e1f2b] hover:rounded-xl border border-transparent hover:border-[#5865F2] object-cover transition-all duration-200">
                </a>
            `).join('');

            // توليد قائمة متصدري الـ XP
            const xpLeaderboardHtml = xpLeaderboard.length > 0 ? xpLeaderboard.map((item, idx) => {
                const rank = idx + 1;
                let medal = `#${rank}`;
                let borderClass = 'border-purple-950/30';
                if (rank === 1) { medal = '🥇'; borderClass = 'border-amber-500/40 bg-amber-950/10'; }
                else if (rank === 2) { medal = '🥈'; borderClass = 'border-slate-400/40 bg-slate-900/20'; }
                else if (rank === 3) { medal = '🥉'; borderClass = 'border-amber-700/40 bg-amber-950/10'; }

                const isMe = item.user_id === user.id;
                const cachedUser = client?.users?.cache?.get(item.user_id);
                const displayName = isMe ? `${user.username} (أنت)` : (cachedUser ? cachedUser.username : `عضو #${item.user_id.slice(-4)}`);
                const avatarUrl = isMe ? userAvatar : (cachedUser ? cachedUser.displayAvatarURL({ size: 64 }) : 'https://cdn.discordapp.com/embed/avatars/0.png');

                return `
                    <div class="bg-[#12131c] border ${borderClass} p-4 rounded-2xl flex items-center justify-between transition ${isMe ? 'ring-1 ring-purple-500' : ''}">
                        <div class="flex items-center gap-4">
                            <span class="text-xs font-mono font-bold text-purple-300">Level ${item.max_level || 1} • ${(item.total_xp || 0).toLocaleString()} XP</span>
                            <span class="text-xs font-mono text-amber-400 font-bold hidden sm:inline">${(item.total_coins || 0).toLocaleString()} ⭐</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <div class="text-right">
                                <h4 class="text-xs font-bold text-white">${displayName}</h4>
                                <p class="text-[10px] text-purple-400 font-mono">الترتيب: #${rank}</p>
                            </div>
                            <img src="${avatarUrl}" class="w-9 h-9 rounded-xl object-cover border border-purple-950/40">
                            <span class="text-base font-bold min-w-[28px] text-center">${medal}</span>
                        </div>
                    </div>
                `;
            }).join('') : `
                <div class="text-center py-10 text-gray-500 text-xs">لا توجد بيانات مستخدمين مسجلة بعد</div>
            `;

            // توليد قائمة متصدري النجوم Star
            const coinsLeaderboardHtml = coinsLeaderboard.length > 0 ? coinsLeaderboard.map((item, idx) => {
                const rank = idx + 1;
                let medal = `#${rank}`;
                let borderClass = 'border-purple-950/30';
                if (rank === 1) { medal = '👑'; borderClass = 'border-yellow-500/40 bg-yellow-950/10'; }
                else if (rank === 2) { medal = '💎'; borderClass = 'border-cyan-400/40 bg-cyan-950/20'; }
                else if (rank === 3) { medal = '⭐'; borderClass = 'border-emerald-600/40 bg-emerald-950/10'; }

                const isMe = item.user_id === user.id;
                const cachedUser = client?.users?.cache?.get(item.user_id);
                const displayName = isMe ? `${user.username} (أنت)` : (cachedUser ? cachedUser.username : `عضو #${item.user_id.slice(-4)}`);
                const avatarUrl = isMe ? userAvatar : (cachedUser ? cachedUser.displayAvatarURL({ size: 64 }) : 'https://cdn.discordapp.com/embed/avatars/0.png');

                return `
                    <div class="bg-[#12131c] border ${borderClass} p-4 rounded-2xl flex items-center justify-between transition ${isMe ? 'ring-1 ring-purple-500' : ''}">
                        <div class="flex items-center gap-4">
                            <span class="text-xs font-mono font-bold text-amber-400">${(item.total_coins || 0).toLocaleString()} ⭐ Star</span>
                            <span class="text-xs font-mono text-gray-400 font-bold hidden sm:inline">Level ${item.max_level || 1}</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <div class="text-right">
                                <h4 class="text-xs font-bold text-white">${displayName}</h4>
                                <p class="text-[10px] text-amber-400 font-mono">الترتيب: #${rank}</p>
                            </div>
                            <img src="${avatarUrl}" class="w-9 h-9 rounded-xl object-cover border border-purple-950/40">
                            <span class="text-base font-bold min-w-[28px] text-center">${medal}</span>
                        </div>
                    </div>
                `;
            }).join('') : `
                <div class="text-center py-10 text-gray-500 text-xs">لا توجد بيانات نجوم مسجلة بعد</div>
            `;

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

                <!-- Toast Notification Container -->
                <div id="toast" class="fixed top-5 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 transform -translate-y-20 opacity-0 pointer-events-none px-6 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-2"></div>

                <!-- Header -->
                <header class="h-16 bg-[#0f1016]/90 backdrop-blur-md border-b border-purple-950/40 px-6 flex items-center justify-between sticky top-0 z-40">
                    <div class="flex items-center gap-4">
                        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="text-xs text-gray-400 hover:text-purple-300 transition">الدعم الفني</a>
                        <span class="text-gray-700">|</span>
                        <a href="/#commands" class="text-xs text-gray-400 hover:text-purple-300 transition">الأوامر</a>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-black text-sm text-white tracking-wide">ZENO</span>
                        <img src="/logo.png" class="w-8 h-8 rounded-xl object-cover border border-purple-500/40 shadow-lg shadow-purple-900/50" alt="ZENO">
                    </div>
                </header>

                <div class="flex-1 flex overflow-hidden">
                    
                    <!-- Main Content (Left in RTL) -->
                    <main class="flex-1 p-8 overflow-y-auto">
                        <!-- User Stats Header (ProBot Style Cards) -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                            <!-- Star -->
                            <div class="bg-[#10111a] border border-purple-950/40 rounded-2xl p-5 flex items-center justify-between shadow-lg">
                                <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center text-xl font-bold">⭐</div>
                                <div class="text-right">
                                    <span class="text-xs font-bold text-gray-400">Star</span>
                                    <h3 id="userCoinsDisplay" class="text-2xl font-black text-white mt-0.5">${userCoins.toLocaleString()}</h3>
                                </div>
                            </div>
                            <!-- المستوى -->
                            <div class="bg-[#10111a] border border-purple-950/40 rounded-2xl p-5 flex items-center justify-between shadow-lg">
                                <div class="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center text-xl">📈</div>
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
                                    <h3 class="text-2xl font-black text-white mt-0.5">#${userRankXp}</h3>
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
                        <div id="tabOverview" class="tab-content">
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
                        <div id="tabWallpapers" class="tab-content hidden space-y-6">
                            <div class="bg-[#10111a] border border-purple-950/40 rounded-3xl p-6 shadow-xl">
                                <div class="flex items-center justify-between pb-4 mb-4 border-b border-purple-950/40">
                                    <span class="text-xs text-amber-400 font-bold">رصيدك: <span class="user-coins-val">${userCoins.toLocaleString()}</span> ⭐ Star</span>
                                    <h3 class="text-sm font-black text-white text-right">متجر خلفيات البروفايل (Profile Backgrounds) 🖼️</h3>
                                </div>
                                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                    
                                    <div class="bg-[#12131c] border border-purple-950/40 rounded-2xl overflow-hidden shadow-lg group">
                                        <div class="h-28 bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-950 flex items-center justify-center text-3xl">🌌</div>
                                        <div class="p-4 text-right">
                                            <h4 class="text-xs font-bold text-white">Galaxy Neon</h4>
                                            <p class="text-[10px] text-gray-400 mt-0.5">خلفية النجوم والنيون الأرجواني</p>
                                            <div class="mt-3 flex items-center justify-between">
                                                <button onclick="buyItem('wallpaper', 'Galaxy Neon', 5000, this)" class="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold shadow-md hover:from-purple-500 hover:to-indigo-500 transition">شراء وتجهيز (5,000 ⭐)</button>
                                                <span class="text-xs font-mono text-amber-300 font-bold">5,000 ⭐</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="bg-[#12131c] border border-purple-950/40 rounded-2xl overflow-hidden shadow-lg group">
                                        <div class="h-28 bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 flex items-center justify-center text-3xl">🌲</div>
                                        <div class="p-4 text-right">
                                            <h4 class="text-xs font-bold text-white">Emerald Forest</h4>
                                            <p class="text-[10px] text-gray-400 mt-0.5">خلفية الطبيعة والزمرد الفخم</p>
                                            <div class="mt-3 flex items-center justify-between">
                                                <button onclick="buyItem('wallpaper', 'Emerald Forest', 7500, this)" class="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold shadow-md hover:from-purple-500 hover:to-indigo-500 transition">شراء وتجهيز (7,500 ⭐)</button>
                                                <span class="text-xs font-mono text-amber-300 font-bold">7,500 ⭐</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="bg-[#12131c] border border-purple-950/40 rounded-2xl overflow-hidden shadow-lg group">
                                        <div class="h-28 bg-gradient-to-r from-rose-950 via-zinc-900 to-amber-950 flex items-center justify-center text-3xl">🔥</div>
                                        <div class="p-4 text-right">
                                            <h4 class="text-xs font-bold text-white">Cyberpunk Gold</h4>
                                            <p class="text-[10px] text-gray-400 mt-0.5">خلفية اللهب والذهب الخالص</p>
                                            <div class="mt-3 flex items-center justify-between">
                                                <button onclick="buyItem('wallpaper', 'Cyberpunk Gold', 12000, this)" class="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold shadow-md hover:from-purple-500 hover:to-indigo-500 transition">شراء وتجهيز (12,000 ⭐)</button>
                                                <span class="text-xs font-mono text-amber-300 font-bold">12,000 ⭐</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="bg-[#12131c] border border-purple-950/40 rounded-2xl overflow-hidden shadow-lg group">
                                        <div class="h-28 bg-gradient-to-r from-cyan-950 via-blue-900 to-indigo-950 flex items-center justify-center text-3xl">❄️</div>
                                        <div class="p-4 text-right">
                                            <h4 class="text-xs font-bold text-white">Arctic Frost</h4>
                                            <p class="text-[10px] text-gray-400 mt-0.5">خلفية الجليد والكريستال السماوي</p>
                                            <div class="mt-3 flex items-center justify-between">
                                                <button onclick="buyItem('wallpaper', 'Arctic Frost', 6000, this)" class="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold shadow-md hover:from-purple-500 hover:to-indigo-500 transition">شراء وتجهيز (6,000 ⭐)</button>
                                                <span class="text-xs font-mono text-amber-300 font-bold">6,000 ⭐</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="bg-[#12131c] border border-purple-950/40 rounded-2xl overflow-hidden shadow-lg group">
                                        <div class="h-28 bg-gradient-to-r from-red-950 via-purple-950 to-neutral-900 flex items-center justify-center text-3xl">🩸</div>
                                        <div class="p-4 text-right">
                                            <h4 class="text-xs font-bold text-white">Crimson Samurai</h4>
                                            <p class="text-[10px] text-gray-400 mt-0.5">خلفية الساموراي القرمزي الفخم</p>
                                            <div class="mt-3 flex items-center justify-between">
                                                <button onclick="buyItem('wallpaper', 'Crimson Samurai', 9000, this)" class="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold shadow-md hover:from-purple-500 hover:to-indigo-500 transition">شراء وتجهيز (9,000 ⭐)</button>
                                                <span class="text-xs font-mono text-amber-300 font-bold">9,000 ⭐</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="bg-[#12131c] border border-purple-950/40 rounded-2xl overflow-hidden shadow-lg group">
                                        <div class="h-28 bg-gradient-to-r from-yellow-950 via-amber-900 to-orange-950 flex items-center justify-center text-3xl">👑</div>
                                        <div class="p-4 text-right">
                                            <h4 class="text-xs font-bold text-white">Royal Empire</h4>
                                            <p class="text-[10px] text-gray-400 mt-0.5">خلفية الإمبراطورية الملكية الذهبية</p>
                                            <div class="mt-3 flex items-center justify-between">
                                                <button onclick="buyItem('wallpaper', 'Royal Empire', 15000, this)" class="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold shadow-md hover:from-purple-500 hover:to-indigo-500 transition">شراء وتجهيز (15,000 ⭐)</button>
                                                <span class="text-xs font-mono text-amber-300 font-bold">15,000 ⭐</span>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>

                        <!-- Tab 3: شارات البروفايل (Badges Shop) -->
                        <div id="tabBadges" class="tab-content hidden space-y-6">
                            <div class="bg-[#10111a] border border-purple-950/40 rounded-3xl p-6 shadow-xl">
                                <div class="flex items-center justify-between pb-4 mb-4 border-b border-purple-950/40">
                                    <span class="text-xs text-amber-400 font-bold">رصيدك: <span class="user-coins-val">${userCoins.toLocaleString()}</span> ⭐ Star</span>
                                    <h3 class="text-sm font-black text-white text-right">متجر شارات وأوسمة البروفايل 🎖️</h3>
                                </div>
                                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl text-center space-y-2">
                                        <span class="text-3xl block">👑</span>
                                        <h4 class="text-xs font-bold text-white">تاج الأساطير</h4>
                                        <p class="text-[10px] text-gray-400">شارة ملكية ذهبية</p>
                                        <button onclick="buyItem('badge', 'Crown Badge', 10000, this)" class="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold transition shadow-md">شراء (10,000 ⭐)</button>
                                    </div>
                                    <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl text-center space-y-2">
                                        <span class="text-3xl block">💎</span>
                                        <h4 class="text-xs font-bold text-white">الماسة اللامعة</h4>
                                        <p class="text-[10px] text-gray-400">شارة النقاء والتميز</p>
                                        <button onclick="buyItem('badge', 'Diamond Badge', 15000, this)" class="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold transition shadow-md">شراء (15,000 ⭐)</button>
                                    </div>
                                    <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl text-center space-y-2">
                                        <span class="text-3xl block">⚡</span>
                                        <h4 class="text-xs font-bold text-white">صاعقة النيون</h4>
                                        <p class="text-[10px] text-gray-400">شارة السرعة والقوة</p>
                                        <button onclick="buyItem('badge', 'Lightning Badge', 8000, this)" class="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold transition shadow-md">شراء (8,000 ⭐)</button>
                                    </div>
                                    <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl text-center space-y-2">
                                        <span class="text-3xl block">🛡️</span>
                                        <h4 class="text-xs font-bold text-white">درع الحارس</h4>
                                        <p class="text-[10px] text-gray-400">شارة الشرف والحماية</p>
                                        <button onclick="buyItem('badge', 'Guardian Badge', 6000, this)" class="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold transition shadow-md">شراء (6,000 ⭐)</button>
                                    </div>
                                    <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl text-center space-y-2">
                                        <span class="text-3xl block">🔥</span>
                                        <h4 class="text-xs font-bold text-white">لهب العزيمة</h4>
                                        <p class="text-[10px] text-gray-400">شارة النشاط والحماس</p>
                                        <button onclick="buyItem('badge', 'Fire Badge', 7000, this)" class="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold transition shadow-md">شراء (7,000 ⭐)</button>
                                    </div>
                                    <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl text-center space-y-2">
                                        <span class="text-3xl block">🚀</span>
                                        <h4 class="text-xs font-bold text-white">رائد الفضاء</h4>
                                        <p class="text-[10px] text-gray-400">شارة الوصول للقمة</p>
                                        <button onclick="buyItem('badge', 'Rocket Badge', 12000, this)" class="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold transition shadow-md">شراء (12,000 ⭐)</button>
                                    </div>
                                    <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl text-center space-y-2">
                                        <span class="text-3xl block">🌟</span>
                                        <h4 class="text-xs font-bold text-white">النجم الساطع</h4>
                                        <p class="text-[10px] text-gray-400">شارة التألق المستمر</p>
                                        <button onclick="buyItem('badge', 'Star Badge', 9000, this)" class="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold transition shadow-md">شراء (9,000 ⭐)</button>
                                    </div>
                                    <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl text-center space-y-2">
                                        <span class="text-3xl block">🎭</span>
                                        <h4 class="text-xs font-bold text-white">قناع الغموض</h4>
                                        <p class="text-[10px] text-gray-400">شارة الأسلوب الفريد</p>
                                        <button onclick="buyItem('badge', 'Mask Badge', 5000, this)" class="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold transition shadow-md">شراء (5,000 ⭐)</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Tab 4: خلفيات الهوية (Identity Shop) -->
                        <div id="tabIdentity" class="tab-content hidden space-y-6">
                            <div class="bg-[#10111a] border border-purple-950/40 rounded-3xl p-6 shadow-xl text-right">
                                <h3 class="text-sm font-black text-white mb-2">خلفيات وبطاقات الهوية الشخصية 🪪</h3>
                                <p class="text-gray-400 text-xs mb-6">خصص تصميم بطاقة الهوية التي تظهر في الديسكورد عند كتابة أمر <span class="text-purple-400 font-mono">/id</span> أو <span class="text-purple-400 font-mono">/profile</span>.</p>
                                
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl flex items-center justify-between">
                                        <button onclick="buyItem('identity', 'Dark Minimalist', 3000, this)" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold">تفعيل (3,000 ⭐)</button>
                                        <div>
                                            <h4 class="text-xs font-bold text-white">Dark Minimalist</h4>
                                            <p class="text-[10px] text-gray-400">تصميم أسود داكن كلاسيكي فخم</p>
                                        </div>
                                    </div>
                                    <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl flex items-center justify-between">
                                        <button onclick="buyItem('identity', 'Purple Glow Pro', 4500, this)" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold">تفعيل (4,500 ⭐)</button>
                                        <div>
                                            <h4 class="text-xs font-bold text-white">Purple Glow Pro</h4>
                                            <p class="text-[10px] text-gray-400">توهج بنفسجي متدرج ملكي</p>
                                        </div>
                                    </div>
                                    <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl flex items-center justify-between">
                                        <button onclick="buyItem('identity', 'Golden Executive', 8000, this)" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold">تفعيل (8,000 ⭐)</button>
                                        <div>
                                            <h4 class="text-xs font-bold text-white">Golden Executive</h4>
                                            <p class="text-[10px] text-gray-400">بطاقة كبار الشخصيات بالذهب اللامع</p>
                                        </div>
                                    </div>
                                    <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl flex items-center justify-between">
                                        <button onclick="buyItem('identity', 'Cyber Matrix', 6000, this)" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold">تفعيل (6,000 ⭐)</button>
                                        <div>
                                            <h4 class="text-xs font-bold text-white">Cyber Matrix</h4>
                                            <p class="text-[10px] text-gray-400">بطاقة نيون إلكترونية مستقبلية</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Tab 5: قائمة المتصدرين بالـ XP (Leaderboards XP) -->
                        <div id="tabLeaderboard" class="tab-content hidden space-y-6">
                            <div class="bg-[#10111a] border border-purple-950/40 rounded-3xl p-6 shadow-xl">
                                <div class="flex items-center justify-between mb-4 border-b border-purple-950/40 pb-3">
                                    <span class="text-xs text-purple-400 font-mono font-bold">ترتيبك الحالي: #${userRankXp}</span>
                                    <h3 class="text-sm font-black text-white text-right">أعلى 100 عضو بواسطة نقاط الخبرة (XP Leaderboard) 🏆</h3>
                                </div>
                                <div class="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                                    ${xpLeaderboardHtml}
                                </div>
                            </div>
                        </div>

                        <!-- Tab 5B: قائمة أغنى 100 ملياردير (Coins Leaderboard) -->
                        <div id="tabCoinsLeaderboard" class="tab-content hidden space-y-6">
                            <div class="bg-[#10111a] border border-purple-950/40 rounded-3xl p-6 shadow-xl">
                                <div class="flex items-center justify-between mb-4 border-b border-purple-950/40 pb-3">
                                    <span class="text-xs text-amber-400 font-mono font-bold">ترتيبك المالي: #${userRankCoins}</span>
                                    <h3 class="text-sm font-black text-white text-right">أغنى 100 عضو برصيد النجوم (Richest 100 Star) ⭐</h3>
                                </div>
                                <div class="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                                    ${coinsLeaderboardHtml}
                                </div>
                            </div>
                        </div>

                        <!-- Tab 6: المكافأة اليومية (Daily Reward) -->
                        <div id="tabDaily" class="tab-content hidden space-y-6">
                            <div class="bg-[#10111a] border border-purple-950/40 rounded-3xl p-8 shadow-xl text-center space-y-5 max-w-xl mx-auto">
                                <div class="w-20 h-20 rounded-3xl bg-gradient-to-tr from-purple-600/30 to-indigo-600/30 border border-purple-500/40 flex items-center justify-center text-4xl mx-auto shadow-xl shadow-purple-900/30">
                                    🎁
                                </div>
                                <div>
                                    <h3 class="text-xl font-black text-white">المكافأة اليومية (Daily Star Reward)</h3>
                                    <p class="text-gray-400 text-xs mt-2 leading-relaxed">
                                        احصل على <span class="text-amber-300 font-bold">500 إلى 1,000 نجوم (Stars)</span> مجاناً كل 24 ساعة!
                                        حافظ على سلسلة أيامك المتتالية لمضاعفة أرباحك.
                                    </p>
                                </div>

                                <div class="bg-[#12131c] border border-purple-950/40 rounded-2xl p-4 flex items-center justify-around text-xs">
                                    <div>
                                        <span class="text-gray-400 block text-[11px]">مكافأة اليوم</span>
                                        <span class="text-amber-400 font-black font-mono text-sm">+500 ⭐</span>
                                    </div>
                                    <div class="w-px h-8 bg-purple-950/50"></div>
                                    <div>
                                        <span class="text-gray-400 block text-[11px]">التكرار</span>
                                        <span class="text-purple-300 font-bold">كل 24 ساعة</span>
                                    </div>
                                </div>

                                <div id="dailyActionBox">
                                    ${canClaimDaily ? `
                                        <button id="claimDailyBtn" onclick="claimDaily()" class="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs rounded-xl shadow-lg shadow-purple-900/40 transition transform active:scale-95">
                                            🎁 استلام المكافأة اليومية الآن (+500 ⭐)
                                        </button>
                                    ` : `
                                        <button disabled class="w-full py-3.5 bg-purple-950/40 border border-purple-900/30 text-gray-400 font-bold text-xs rounded-xl cursor-not-allowed">
                                            ⏳ تم الاستلام مسبقاً! يتبقى حوالي ${hoursLeft} ساعة و ${minsLeft} دقيقة
                                        </button>
                                    `}
                                </div>
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
                                <span class="text-[10px] text-amber-400 font-mono mt-0.5">${userCoins.toLocaleString()} ⭐</span>
                            </div>

                            <!-- Nav Links with Active Tab Switchers -->
                            <div class="flex flex-col gap-1 text-xs text-right overflow-y-auto pr-1">
                                <span class="text-[10px] font-bold text-purple-400/60 px-3 py-1">عام</span>
                                <button onclick="switchTab('tabOverview', this)" class="nav-btn px-3 py-2 rounded-xl bg-gradient-to-r from-purple-700 to-indigo-700 text-white font-bold flex items-center justify-between shadow-md w-full transition">
                                    <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
                                    <span>نظرة عامة</span>
                                </button>

                                <span class="text-[10px] font-bold text-purple-400/60 px-3 pt-3 pb-1">متاجر النجوم</span>
                                <button onclick="switchTab('tabWallpapers', this)" class="nav-btn px-3 py-2 rounded-xl text-gray-400 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition w-full">
                                    <span class="text-base">🖼️</span>
                                    <span>خلفيات البروفايل</span>
                                </button>
                                <button onclick="switchTab('tabBadges', this)" class="nav-btn px-3 py-2 rounded-xl text-gray-400 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition w-full">
                                    <span class="text-base">🎖️</span>
                                    <span>شارات البروفايل</span>
                                </button>
                                <button onclick="switchTab('tabIdentity', this)" class="nav-btn px-3 py-2 rounded-xl text-gray-400 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition w-full">
                                    <span class="text-base">🪪</span>
                                    <span>خلفيات الهوية</span>
                                </button>

                                <span class="text-[10px] font-bold text-purple-400/60 px-3 pt-3 pb-1">قائمة المتصدرين</span>
                                <button onclick="switchTab('tabLeaderboard', this)" class="nav-btn px-3 py-2 rounded-xl text-gray-400 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition w-full">
                                    <span class="text-base">🏆</span>
                                    <span>أعلى 100 بواسطة XP</span>
                                </button>
                                <button onclick="switchTab('tabCoinsLeaderboard', this)" class="nav-btn px-3 py-2 rounded-xl text-gray-400 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition w-full">
                                    <span class="text-base">⭐</span>
                                    <span>أغنى 100 بالنجوم</span>
                                </button>

                                <span class="text-[10px] font-bold text-purple-400/60 px-3 pt-3 pb-1">أخرى</span>
                                <button onclick="switchTab('tabDaily', this)" class="nav-btn px-3 py-2 rounded-xl text-gray-400 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition w-full">
                                    <span class="text-base">🎁</span>
                                    <span>احصل على مكافأتك اليومية</span>
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
                        <a href="/dashboard" title="${user.username}" class="group relative flex items-center justify-center">
                            <img src="${userAvatar}" class="w-11 h-11 rounded-2xl border-2 border-purple-500 shadow-lg shadow-purple-900/50 hover:rounded-xl object-cover transition-all" alt="${user.username}">
                        </a>
                        <div class="w-8 h-[1px] bg-purple-950/40"></div>
                        ${serverRailHtml}
                    </div>

                </div>

                <!-- Client Side Script -->
                <script>
                    function showToast(msg, isError = false) {
                        const toast = document.getElementById('toast');
                        toast.innerText = msg;
                        toast.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 px-6 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-2 transform translate-y-0 opacity-100 ' + 
                            (isError ? 'bg-red-900/90 text-red-200 border border-red-700' : 'bg-purple-900/90 text-purple-200 border border-purple-600');
                        setTimeout(() => {
                            toast.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 transform -translate-y-20 opacity-0 pointer-events-none px-6 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-2';
                        }, 3500);
                    }

                    function switchTab(tabId, btn) {
                        document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
                        const target = document.getElementById(tabId);
                        if (target) target.classList.remove('hidden');

                        document.querySelectorAll('.nav-btn').forEach(b => {
                            b.className = 'nav-btn px-3 py-2 rounded-xl text-gray-400 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition w-full';
                        });

                        if (btn) {
                            btn.className = 'nav-btn px-3 py-2 rounded-xl bg-gradient-to-r from-purple-700 to-indigo-700 text-white font-bold flex items-center justify-between shadow-md w-full transition';
                        }
                    }

                    async function claimDaily() {
                        const btn = document.getElementById('claimDailyBtn');
                        if (btn) {
                            btn.disabled = true;
                            btn.innerText = '⏳ جاري الاستلام...';
                        }
                        try {
                            const res = await fetch('/api/user/claim-daily', { method: 'POST' });
                            const data = await res.json();
                            if (data.success) {
                                showToast('🎉 ' + data.message);
                                const d = document.getElementById('userCoinsDisplay');
                                if (d) d.innerText = Number(data.newCoins).toLocaleString();
                                document.querySelectorAll('.user-coins-val').forEach(el => el.innerText = Number(data.newCoins).toLocaleString());
                                const box = document.getElementById('dailyActionBox');
                                if (box) {
                                    box.innerHTML = '<button disabled class="w-full py-3.5 bg-purple-950/40 border border-purple-900/30 text-gray-400 font-bold text-xs rounded-xl cursor-not-allowed">⏳ تم استلام المكافأة بنجاح! عد غداً للحصول على مكافأة جديدة.</button>';
                                }
                            } else {
                                showToast(data.error || 'حدث خطأ أثناء الاستلام', true);
                                if (btn) {
                                    btn.disabled = false;
                                    btn.innerText = '🎁 استلام المكافأة اليومية الآن (+500 ⭐)';
                                }
                            }
                        } catch (err) {
                            showToast('فشل الاتصال بالخادم', true);
                            if (btn) {
                                btn.disabled = false;
                                btn.innerText = '🎁 استلام المكافأة اليومية الآن (+500 ⭐)';
                            }
                        }
                    }

                    async function buyItem(type, name, price, btn) {
                        if (!confirm('هل أنت متأكد من شراء وتجهيز: ' + name + ' مقابل ' + price.toLocaleString() + ' ⭐؟')) return;
                        
                        const originalText = btn ? btn.innerText : '';
                        if (btn) {
                            btn.disabled = true;
                            btn.innerText = '⏳ جاري الشراء...';
                        }

                        try {
                            const res = await fetch('/api/user/buy-item', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ type, name, price })
                            });
                            const data = await res.json();
                            if (data.success) {
                                showToast('✅ ' + data.message);
                                const d = document.getElementById('userCoinsDisplay');
                                if (d) d.innerText = Number(data.newCoins).toLocaleString();
                                document.querySelectorAll('.user-coins-val').forEach(el => el.innerText = Number(data.newCoins).toLocaleString());
                                if (btn) btn.innerText = '✅ مجهّز ومفعّل';
                            } else {
                                showToast(data.error || 'فشلت عملية الشراء', true);
                                if (btn) {
                                    btn.disabled = false;
                                    btn.innerText = originalText;
                                }
                            }
                        } catch (err) {
                            showToast('فشل الاتصال بالخادم', true);
                            if (btn) {
                                btn.disabled = false;
                                btn.innerText = originalText;
                            }
                        }
                    }
                </script>
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
                        <img src="/logo.png" class="w-8 h-8 rounded-xl object-cover border border-purple-500/40 shadow-lg shadow-purple-900/50" alt="ZENO">
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
                                    <a href="/dashboard/${guildId}/overview" class="w-full py-2 bg-purple-950/30 hover:bg-purple-600 hover:text-white text-purple-300 border border-purple-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
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

                                <!-- البوستات -->
                                <div class="bg-[#10111a] border border-pink-950/40 hover:border-pink-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'boost_enabled', this.checked)" ${true ? 'checked' : ''}><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">البوستات</h4>
                                            <span class="text-lg">🚀</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">رسائل شكر تلقائية للداعمين بالبوست</p>
                                    <a href="/dashboard/${guildId}/boost" class="w-full py-2 bg-pink-950/30 hover:bg-gradient-to-r hover:from-pink-600 hover:to-purple-600 hover:text-white text-pink-300 border border-pink-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- التذاكر والدعم الفني -->
                                <div class="bg-[#10111a] border border-purple-950/40 hover:border-purple-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'ticket_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">نظام التذاكر</h4>
                                            <span class="text-lg">🎫</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">لوحات دعم فني مخصصة وترانسكريبت</p>
                                    <a href="/dashboard/${guildId}/tickets" class="w-full py-2 bg-purple-950/30 hover:bg-gradient-to-r hover:from-purple-600 hover:to-indigo-600 hover:text-white text-purple-300 border border-purple-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- المستويات واللفلات -->
                                <div class="bg-[#10111a] border border-purple-950/40 hover:border-purple-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'leveling_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">المستويات & XP</h4>
                                            <span class="text-lg">📈</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">نظام الرتب ونقاط الخبرة وبطاقات الرانك</p>
                                    <a href="/dashboard/${guildId}/levels" class="w-full py-2 bg-purple-950/30 hover:bg-gradient-to-r hover:from-purple-600 hover:to-indigo-600 hover:text-white text-purple-300 border border-purple-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- الرومات المؤقتة -->
                                <div class="bg-[#10111a] border border-purple-950/40 hover:border-purple-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'temp_voice_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">رومات مؤقتة</h4>
                                            <span class="text-lg">🔊</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">إنشاء قنوات صوتية خاصة تلقائياً</p>
                                    <a href="/dashboard/${guildId}/tempvoice" class="w-full py-2 bg-purple-950/30 hover:bg-gradient-to-r hover:from-purple-600 hover:to-indigo-600 hover:text-white text-purple-300 border border-purple-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- التحقق والتفعيل -->
                                <div class="bg-[#10111a] border border-purple-950/40 hover:border-purple-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'verify_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">التحقق & التفعيل</h4>
                                            <span class="text-lg">🛡️</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">لوحة تفعيل الأعضاء بالأزرار التفاعلية</p>
                                    <a href="/dashboard/${guildId}/verification" class="w-full py-2 bg-purple-950/30 hover:bg-gradient-to-r hover:from-purple-600 hover:to-indigo-600 hover:text-white text-purple-300 border border-purple-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- الاقتصاد والنجوم -->
                                <div class="bg-[#10111a] border border-amber-950/40 hover:border-amber-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'economy_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">الاقتصاد والنجوم</h4>
                                            <span class="text-lg">⭐</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">البنك، الوظائف، تحويلات النجوم، والمكافآت</p>
                                    <a href="/dashboard/${guildId}/economy" class="w-full py-2 bg-amber-950/30 hover:bg-gradient-to-r hover:from-amber-600 hover:to-yellow-600 hover:text-white text-amber-300 border border-amber-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- القرآن الكريم والراديو 24/7 -->
                                <div class="bg-[#10111a] border border-emerald-950/40 hover:border-emerald-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'quran_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">القرآن الكريم & الراديو</h4>
                                            <span class="text-lg">📻</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">بث تلاوات وإذاعات القرآن الكريم 24/7 في الروم الصوتي</p>
                                    <a href="/dashboard/${guildId}/quran" class="w-full py-2 bg-emerald-950/30 hover:bg-gradient-to-r hover:from-emerald-600 hover:to-teal-600 hover:text-white text-emerald-300 border border-emerald-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- نظام التقديمات (Applications) -->
                                <div class="bg-[#10111a] border border-indigo-950/40 hover:border-indigo-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'applications_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">نظام التقديمات</h4>
                                            <span class="text-lg">📝</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">إنشاء وتخصيص استمارات التقديم مع لوحة أزرار تفاعلية ومراجعة الطلبات</p>
                                    <a href="/dashboard/${guildId}/applications" class="w-full py-2 bg-indigo-950/30 hover:bg-gradient-to-r hover:from-indigo-600 hover:to-purple-600 hover:text-white text-indigo-300 border border-indigo-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- الإحصائيات والتحليلات (Analytics) -->
                                <div class="bg-[#10111a] border border-purple-950/40 hover:border-purple-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <span class="px-2 py-0.5 bg-purple-950/60 text-purple-300 rounded-lg text-[10px] font-bold">مباشر 📊</span>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">الإحصائيات & التحليلات</h4>
                                            <span class="text-lg">📊</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">تحليلات بيانية دقيقة لتفاعل الرسائل، دخول وخروج الأعضاء، والرومات الصوتية</p>
                                    <a href="/dashboard/${guildId}/analytics" class="w-full py-2 bg-purple-950/30 hover:bg-gradient-to-r hover:from-purple-600 hover:to-indigo-600 hover:text-white text-purple-300 border border-purple-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- مظهر البوت (Bot Appearance) -->
                                <div class="bg-[#10111a] border border-amber-950/40 hover:border-amber-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <span class="px-2 py-0.5 bg-amber-950/60 text-amber-300 rounded-lg text-[10px] font-bold">مجاني 👑</span>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">مظهر البوت</h4>
                                            <span class="text-lg">🎨</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">تخصيص الاسم المستعار، الأفاتار، البانر، وحالة ونوع النشاط مجاناً</p>
                                    <a href="/dashboard/${guildId}/appearance" class="w-full py-2 bg-amber-950/30 hover:bg-gradient-to-r hover:from-amber-600 hover:to-yellow-600 hover:text-white text-amber-300 border border-amber-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
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
                            <a href="/dashboard/${guildId}/analytics" class="px-3 py-1.5 rounded-xl text-gray-400 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-end gap-2 transition">
                                <span>الإحصائيات</span>
                                <span>📊</span>
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
                            <a href="/dashboard/${guildId}/boost" class="px-3 py-1.5 rounded-xl text-gray-300 hover:text-purple-300 hover:bg-purple-950/30 font-medium flex items-center justify-between transition">
                                <span class="w-2 h-2 rounded-full bg-pink-400"></span>
                                <span class="flex items-center gap-1.5"><span>البوستات</span><span>🚀</span></span>
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
                            <a href="/dashboard/${guildId}/quran" class="px-3 py-1.5 rounded-xl text-emerald-300 hover:text-emerald-200 hover:bg-emerald-950/30 font-medium flex items-center justify-between transition">
                                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                                <span class="flex items-center gap-1.5"><span>القرآن & الراديو</span><span>📻</span></span>
                            </a>
                            <a href="/dashboard/${guildId}/applications" class="px-3 py-1.5 rounded-xl text-indigo-300 hover:text-indigo-200 hover:bg-indigo-950/30 font-medium flex items-center justify-between transition">
                                <span class="w-2 h-2 rounded-full bg-indigo-400"></span>
                                <span class="flex items-center gap-1.5"><span>التقديمات</span><span>📝</span></span>
                            </a>
                            <a href="/dashboard/${guildId}/appearance" class="px-3 py-1.5 rounded-xl text-amber-300 hover:text-amber-200 hover:bg-amber-950/30 font-medium flex items-center justify-between transition">
                                <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                                <span class="flex items-center gap-1.5"><span>مظهر البوت</span><span>🎨</span></span>
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
                        <a href="/dashboard" title="${user.username}" class="group relative flex items-center justify-center">
                            <img src="${userAvatar}" class="w-11 h-11 rounded-2xl border-2 border-purple-500 shadow-lg shadow-purple-900/50 hover:rounded-xl object-cover transition-all" alt="${user.username}">
                        </a>
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

    // إرسال لوحة التذاكر التفاعلية مباشرة إلى الديسكورد (Send Ticket Panel API)
    app.post('/api/guild/:guildId/send-ticket-panel', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { channelId, title, desc } = req.body;

            if (!channelId) {
                return res.status(400).json({ success: false, error: 'Channel ID is required' });
            }

            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) {
                return res.status(404).json({ success: false, error: 'لم يتم العثور على القناة أو البوت يفتقر لصلاحيات الوصول إليها.' });
            }

            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const panelEmbed = new EmbedBuilder()
                .setColor('#9333ea')
                .setTitle(title || '🎫 نظام الدعم الفني والمساعدة')
                .setDescription(desc || 'لفتح تذكرة جديدة والتواصل مع فريق الإدارة والدعم الفني، يرجى الضغط على الزر بالأسفل.')
                .setFooter({ text: `${channel.guild?.name || 'Server'} • Ticket System` })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('open_ticket')
                    .setLabel('فتح تذكرة | Open Ticket')
                    .setEmoji('📩')
                    .setStyle(ButtonStyle.Primary)
            );

            await channel.send({ embeds: [panelEmbed], components: [row] });
            res.json({ success: true });
        } catch (e) {
            console.error('Ticket panel send error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // إرسال لوحة التحقق والتفعيل التفاعلية إلى الديسكورد (Send Verification Panel API)
    app.post('/api/guild/:guildId/send-verification-panel', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { channelId, roleId, message } = req.body;

            if (!channelId || !roleId) {
                return res.status(400).json({ success: false, error: 'Channel ID and Role ID are required' });
            }

            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) {
                return res.status(404).json({ success: false, error: 'لم يتم العثور على القناة أو البوت يفتقر لصلاحيات الوصول إليها.' });
            }

            // حفظ الإعدادات في قاعدة البيانات
            database.updateGuildSetting(guildId, 'verify_enabled', 1);
            database.updateGuildSetting(guildId, 'verification_enabled', 1);
            database.updateGuildSetting(guildId, 'verify_channel', channelId);
            database.updateGuildSetting(guildId, 'verification_channel', channelId);
            database.updateGuildSetting(guildId, 'verify_role', roleId);
            database.updateGuildSetting(guildId, 'verification_role', roleId);
            if (message) database.updateGuildSetting(guildId, 'verify_message', message);

            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const verifyEmbed = new EmbedBuilder()
                .setColor('#10b981')
                .setTitle('📌 إثبات نفسك والتفعيل')
                .setDescription(message || 'عشان تثبت نفسك، اضغط على الزر الموجود تحت الرسالة، وبكذا يتم تفعيلك وسترى جميع الرومات.')
                .setFooter({ text: `${channel.guild?.name || 'Server'} • Verification System` })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_quick_verify')
                    .setLabel('✅ تحقق الآن / إثبات نفسك')
                    .setStyle(ButtonStyle.Success)
            );

            await channel.send({ embeds: [verifyEmbed], components: [row] });
            res.json({ success: true });
        } catch (e) {
            console.error('Verification panel send error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // تشغيل إذاعة القرآن الكريم المباشرة 24/7 من الداشبورد
    app.post('/api/guild/:guildId/quran/start', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { channelId, stationKey } = req.body;

            if (!channelId) {
                return res.status(400).json({ success: false, error: 'يرجى تحديد ID الروم الصوتي أولاً' });
            }

            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isVoiceBased()) {
                return res.status(404).json({ success: false, error: 'لم يتم العثور على القناة الصوتية أو أن البوت يفتقر لصلاحية الدخول والتحدث.' });
            }

            const audioManager = require('../utils/audioPlayer');
            const station = audioManager.quranStations[stationKey] || audioManager.quranStations['cairo_radio'];

            database.updateGuildSetting(guildId, 'quran_enabled', 1);
            database.updateGuildSetting(guildId, 'quran_channel', channelId);
            if (stationKey) database.updateGuildSetting(guildId, 'quran_station', stationKey);

            await audioManager.playStream(channel, station.url, station.name);

            res.json({ success: true, stationName: station.name, channelName: channel.name });
        } catch (e) {
            console.error('Quran start error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // إيقاف إذاعة القرآن الكريم من الداشبورد ومغادرة الروم
    app.post('/api/guild/:guildId/quran/stop', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const audioManager = require('../utils/audioPlayer');
            audioManager.stop(guildId);
            database.updateGuildSetting(guildId, 'quran_enabled', 0);
            res.json({ success: true });
        } catch (e) {
            console.error('Quran stop error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // فحص حالة الراديو الحالية
    app.get('/api/guild/:guildId/quran/status', (req, res) => {
        try {
            const { guildId } = req.params;
            const audioManager = require('../utils/audioPlayer');
            const status = audioManager.getRadioStatus(guildId);
            res.json({ success: true, ...status });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // إنشاء نموذج تقديم جديد
    app.post('/api/guild/:guildId/applications/create', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { title, description, log_channel, accepted_role, questions } = req.body;

            if (!title) return res.status(400).json({ success: false, error: 'يرجى كتابة عنوان التقديم' });

            const qList = Array.isArray(questions) ? questions.filter(q => q && q.trim().length > 0) : (questions ? questions.split('\n').filter(q => q.trim().length > 0) : ['ما هو سبب تقديمك؟']);

            const appObj = database.createApplication(guildId, title, description || '', qList, log_channel || null, accepted_role || null);
            res.json({ success: true, app: appObj });
        } catch (e) {
            console.error('Create application error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // حذف نموذج تقديم
    app.post('/api/guild/:guildId/applications/delete', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { id } = req.body;
            database.deleteApplication(id);
            res.json({ success: true });
        } catch (e) {
            console.error('Delete application error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // إرسال لوحة التقديمات إلى الروم في الديسكورد
    app.post('/api/guild/:guildId/applications/send-panel', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { channelId, messageText, panelType, embedTitle, embedDescription, embedColor } = req.body;

            if (!channelId) return res.status(400).json({ success: false, error: 'يرجى تحديد ID القناة' });

            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) {
                return res.status(404).json({ success: false, error: 'لم يتم العثور على القناة النصية أو البوت يفتقر للصلاحية' });
            }

            const apps = database.getApplications(guildId);
            if (!apps || apps.length === 0) {
                return res.status(400).json({ success: false, error: 'لا توجد أي استمارات تقديم تم إنشاؤها بعد' });
            }

            let payload = {};
            if (messageText) {
                payload.content = messageText;
            }

            if (embedTitle || embedDescription) {
                const { EmbedBuilder } = require('discord.js');
                const embed = new EmbedBuilder()
                    .setColor(embedColor || '#9333ea')
                    .setTitle(embedTitle || '📝 لوحة استمارات التقديم')
                    .setDescription(embedDescription || 'اضغط على الزر أدناه أو اختر التقديم المناسب لتعبئة الاستمارة:')
                    .setFooter({ text: channel.guild.name, iconURL: channel.guild.iconURL({ dynamic: true }) })
                    .setTimestamp();
                payload.embeds = [embed];
            }

            const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
            const row = new ActionRowBuilder();

            if (panelType === 'select') {
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('select_apply_form')
                    .setPlaceholder('اختر استمارة التقديم من القائمة...')
                    .addOptions(
                        apps.slice(0, 25).map(a => ({
                            label: a.title,
                            value: a.id.toString(),
                            description: (a.description || 'اضغط لتعبئة النموذج').slice(0, 90),
                            emoji: '📝'
                        }))
                    );
                row.addComponents(selectMenu);
            } else {
                apps.slice(0, 5).forEach(a => {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`btn_apply_${a.id}`)
                            .setLabel(a.title.slice(0, 80))
                            .setEmoji('📝')
                            .setStyle(ButtonStyle.Primary)
                    );
                });
            }

            payload.components = [row];
            await channel.send(payload);
            res.json({ success: true });
        } catch (e) {
            console.error('Send application panel error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // حفظ وتطبيق مظهر البوت وحالته (Bot Appearance & Presence) مجاناً
    app.post('/api/guild/:guildId/appearance/save', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { bot_name, bot_status, bot_activity_type, bot_activity_text, bot_avatar_url, bot_banner_url } = req.body;

            const botGuild = client.guilds.cache.get(guildId);
            if (botGuild && botGuild.members?.me) {
                // 1. تغيير اسم البوت المستعار داخل السيرفر
                if (bot_name !== undefined) {
                    await botGuild.members.me.setNickname(bot_name || null).catch(() => {});
                }
            }

            // 2. تحديث حالة ونشاط البوت
            if (client.user) {
                const presenceStatus = ['online', 'idle', 'dnd', 'invisible'].includes(bot_status) ? bot_status : 'online';
                
                const { ActivityType } = require('discord.js');
                let actType = ActivityType.Playing;
                if (bot_activity_type === 'watching' || bot_activity_type === '3') actType = ActivityType.Watching;
                else if (bot_activity_type === 'listening' || bot_activity_type === '2') actType = ActivityType.Listening;
                else if (bot_activity_type === 'streaming' || bot_activity_type === '1') actType = ActivityType.Streaming;
                else if (bot_activity_type === 'competing' || bot_activity_type === '5') actType = ActivityType.Competing;

                const actName = bot_activity_text || `${client.guilds.cache.size} Servers | #help`;
                
                client.user.setPresence({
                    status: presenceStatus,
                    activities: [{ name: actName, type: actType }]
                });

                // 3. تحديث صورة الأفاتار إن تم توفير رابط جديد
                if (bot_avatar_url && bot_avatar_url.startsWith('http') && bot_avatar_url !== client.user.displayAvatarURL()) {
                    await client.user.setAvatar(bot_avatar_url).catch(err => {
                        console.log('Avatar update note (rate limits may apply):', err.message);
                    });
                }
            }

            // 4. حفظ الإعدادات في قاعدة البيانات
            if (bot_name !== undefined) database.updateGuildSetting(guildId, 'bot_nickname', bot_name);
            if (bot_status !== undefined) database.updateGuildSetting(guildId, 'bot_status', bot_status);
            if (bot_activity_type !== undefined) database.updateGuildSetting(guildId, 'bot_activity_type', bot_activity_type);
            if (bot_activity_text !== undefined) database.updateGuildSetting(guildId, 'bot_activity_text', bot_activity_text);
            if (bot_avatar_url !== undefined) database.updateGuildSetting(guildId, 'bot_avatar_url', bot_avatar_url);
            if (bot_banner_url !== undefined) database.updateGuildSetting(guildId, 'bot_banner_url', bot_banner_url);

            res.json({ success: true });
        } catch (e) {
            console.error('Bot appearance save error:', e);
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
            const userAvatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

            const serverRailHtml = Array.isArray(guilds) && guilds.length > 0 ? guilds.map(g => `
                <a href="/dashboard/${g.id}" title="${g.name}" class="group relative flex items-center justify-center">
                    <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                         class="w-11 h-11 rounded-2xl ${g.id === guildId ? 'border-2 border-purple-500 shadow-lg shadow-purple-900/50' : 'border border-transparent'} hover:rounded-xl object-cover transition-all">
                </a>
            `).join('') : '';

            const sectionTitles = {
                'overview': 'نظرة عامة على السيرفر 📊',
                'analytics': 'الإحصائيات والتحليلات 📊',
                'stats': 'الإحصائيات والتحليلات 📊',
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
                'general': 'الأوامر العامة والخدمية للأعضاء ⚙️',
                'settings': 'إعدادات السيرفر العامة ⚙️',
                'boost': 'البوستات - رسالة الشكر للداعمين 🚀',
                'quran': 'إذاعات وتلاوات القرآن الكريم 24/7 📻',
                'radio': 'إذاعات وتلاوات القرآن الكريم 24/7 📻',
                'applications': 'نظام التقديمات 📝',
                'apply': 'نظام التقديمات 📝',
                'appearance': 'مظهر البوت 🎨',
                'bot-appearance': 'مظهر البوت 🎨'
            };

            const title = sectionTitles[section] || ('إعدادات ' + section);

            const botGuild = client.guilds.cache.get(guildId);
            const guildRoles = botGuild ? botGuild.roles.cache
                .filter(r => r.name !== '@everyone')
                .sort((a, b) => b.position - a.position)
                .map(r => ({ id: r.id, name: r.name, color: r.hexColor !== '#000000' ? r.hexColor : '#99aab5' })) : [];

            const guildTextChannels = botGuild ? botGuild.channels.cache
                .filter(c => c.isTextBased() && !c.isVoiceBased() && !c.isThread())
                .sort((a, b) => a.rawPosition - b.rawPosition)
                .map(c => ({ id: c.id, name: c.name })) : [];

            const guildVoiceChannels = botGuild ? botGuild.channels.cache
                .filter(c => c.isVoiceBased())
                .sort((a, b) => a.rawPosition - b.rawPosition)
                .map(c => ({ id: c.id, name: c.name })) : [];

            const guildCategories = botGuild ? botGuild.channels.cache
                .filter(c => c.type === 4)
                .sort((a, b) => a.rawPosition - b.rawPosition)
                .map(c => ({ id: c.id, name: c.name })) : [];

            function renderRoleSelect(inputName, selectedId, placeholder = '...اختر') {
                return `
                    <div class="relative">
                        <select name="${inputName}" id="${inputName}" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer appearance-none">
                            <option value="">${placeholder}</option>
                            ${guildRoles.map(r => `<option value="${r.id}" ${String(selectedId) === String(r.id) ? 'selected' : ''}>${r.name} ⚪</option>`).join('')}
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center px-3 text-gray-400">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/></svg>
                        </div>
                    </div>
                `;
            }

            function renderChannelSelect(inputName, selectedId, placeholder = '...اختر') {
                return `
                    <div class="relative">
                        <select name="${inputName}" id="${inputName}" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer appearance-none">
                            <option value="">${placeholder}</option>
                            ${guildTextChannels.map(c => `<option value="${c.id}" ${String(selectedId) === String(c.id) ? 'selected' : ''}># ${c.name}</option>`).join('')}
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center px-3 text-gray-400">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/></svg>
                        </div>
                    </div>
                `;
            }

            function renderVoiceSelect(inputName, selectedId, placeholder = '...اختر') {
                return `
                    <div class="relative">
                        <select name="${inputName}" id="${inputName}" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer appearance-none">
                            <option value="">${placeholder}</option>
                            ${guildVoiceChannels.map(c => `<option value="${c.id}" ${String(selectedId) === String(c.id) ? 'selected' : ''}>🔊 ${c.name}</option>`).join('')}
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center px-3 text-gray-400">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/></svg>
                        </div>
                    </div>
                `;
            }

            function renderCategorySelect(inputName, selectedId, placeholder = '...اختر') {
                return `
                    <div class="relative">
                        <select name="${inputName}" id="${inputName}" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer appearance-none">
                            <option value="">${placeholder}</option>
                            ${guildCategories.map(c => `<option value="${c.id}" ${String(selectedId) === String(c.id) ? 'selected' : ''}>📁 ${c.name}</option>`).join('')}
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center px-3 text-gray-400">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/></svg>
                        </div>
                    </div>
                `;
            }

            // ==========================================
            // بناء استمارة الإعدادات الحقيقية المخصصة لكل موديول (ProBot Full Settings)
            // ==========================================
            let formFieldsHtml = '';

            if (section === 'boost') {
                formFieldsHtml = `
                    <div class="space-y-6">

                        <!-- إعدادات البوستات الرئيسية -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-6 rounded-2xl space-y-5 text-right">
                            <div class="flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="boost_enabled" ${settings.boost_enabled !== 0 ? 'checked' : ''} onchange="saveSetting('boost_enabled', this.checked ? 1 : 0)"><span class="slider"></span></label>
                                <div>
                                    <h4 class="font-bold text-white text-sm">رسائل البوست (Server Boost Messages)</h4>
                                    <p class="text-gray-400 text-[11px]">إرسال رسالة تلقائية عندما يقوم أحد الأعضاء بعمل بوست للسيرفر 🚀</p>
                                </div>
                            </div>

                            <!-- قناة البوست -->
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2">قناة إعلانات البوست (Boost Channel) <span class="text-purple-400">*</span></label>
                                ${renderChannelSelect('boost_channel', settings.boost_channel)}
                            </div>

                            <!-- رسالة البوست مع التاغات -->
                            <div>
                                <div class="flex items-center justify-between mb-2">
                                    <div class="flex items-center gap-1.5 flex-wrap">
                                        <button type="button" onclick="insertBoostTag('[user]')" class="px-2 py-1 bg-purple-950/50 hover:bg-purple-800/60 text-purple-300 border border-purple-900/40 rounded-lg text-[10px] font-mono transition">+ [user]</button>
                                        <button type="button" onclick="insertBoostTag('[globalName]')" class="px-2 py-1 bg-purple-950/50 hover:bg-purple-800/60 text-purple-300 border border-purple-900/40 rounded-lg text-[10px] font-mono transition">+ [globalName]</button>
                                        <button type="button" onclick="insertBoostTag('[totalBoosts]')" class="px-2 py-1 bg-purple-950/50 hover:bg-purple-800/60 text-purple-300 border border-purple-900/40 rounded-lg text-[10px] font-mono transition">+ [totalBoosts]</button>
                                        <button type="button" onclick="insertBoostTag('[serverName]')" class="px-2 py-1 bg-purple-950/50 hover:bg-purple-800/60 text-purple-300 border border-purple-900/40 rounded-lg text-[10px] font-mono transition">+ [serverName]</button>
                                    </div>
                                    <label class="text-xs font-bold text-gray-300">رسالة البوست في القناة</label>
                                </div>
                                <textarea id="boostTextarea" name="boost_message" rows="4" placeholder="🎉 شكراً [user] لدعمك السيرفر بالبوست! أصبح عدد البوستات الآن [totalBoosts] بوست!" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right leading-relaxed">${settings.boost_message || ''}</textarea>
                            </div>

                            <!-- معاينة حية -->
                            <div class="bg-[#2b2d31] border-r-4 border-[#f47fff] p-4 rounded-xl text-right max-w-md">
                                <div class="flex items-center gap-3 mb-2">
                                    <div class="w-8 h-8 rounded-full bg-[#f47fff]/20 flex items-center justify-center text-lg">🚀</div>
                                    <span class="text-xs font-bold text-[#f47fff]">ZENO Bot</span>
                                </div>
                                <p class="text-xs text-gray-300">${settings.boost_message || '🎉 شكراً [user] لدعمك السيرفر بالبوست! أصبح عدد البوستات الآن [totalBoosts] بوست!'}</p>
                            </div>
                        </div>

                        <!-- إرسال إلى الخاص (DM) -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-6 rounded-2xl space-y-4 text-right">
                            <div class="flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="boost_dm_enabled" ${settings.boost_dm_enabled ? 'checked' : ''} onchange="saveSetting('boost_dm_enabled', this.checked ? 1 : 0)"><span class="slider"></span></label>
                                <div>
                                    <h4 class="font-bold text-white text-sm">إرسال رسالة شكر في الخاص (DM Thank You)</h4>
                                    <p class="text-gray-400 text-[11px]">إرسال رسالة شخصية في الخاص لكل عضو يقوم بعمل بوست</p>
                                </div>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2">رسالة الخاص (DM Message)</label>
                                <textarea name="boost_dm_message" rows="3" placeholder="شكراً جزيلاً لدعمك سيرفر [serverName] بالبوست! 🚀" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right leading-relaxed">${settings.boost_dm_message || ''}</textarea>
                            </div>
                        </div>

                        <!-- إرسال كـ Embed -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl text-right">
                            <div class="flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="boost_embed_enabled" ${settings.boost_embed_enabled ? 'checked' : ''} onchange="saveSetting('boost_embed_enabled', this.checked ? 1 : 0)"><span class="slider"></span></label>
                                <div>
                                    <h4 class="font-bold text-white text-sm">إرسال كرسالة Embed ملوّنة بالوردي</h4>
                                    <p class="text-gray-400 text-[11px]">رسالة منسقة بلون Nitro الوردي مع معلومات العضو وعدد البوستات</p>
                                </div>
                            </div>
                        </div>

                        <!-- متغيرات البوست -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl text-right">
                            <h4 class="font-bold text-white text-sm mb-3">المتغيرات المدعومة 🏷️</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                <div class="flex justify-between items-center py-2 border-b border-purple-950/30">
                                    <span class="text-gray-400">منشن العضو الداعم</span>
                                    <code class="text-purple-400 bg-purple-950/30 px-2 py-0.5 rounded">[user]</code>
                                </div>
                                <div class="flex justify-between items-center py-2 border-b border-purple-950/30">
                                    <span class="text-gray-400">الاسم العام للعضو</span>
                                    <code class="text-purple-400 bg-purple-950/30 px-2 py-0.5 rounded">[globalName]</code>
                                </div>
                                <div class="flex justify-between items-center py-2 border-b border-purple-950/30">
                                    <span class="text-gray-400">اسم المستخدم</span>
                                    <code class="text-purple-400 bg-purple-950/30 px-2 py-0.5 rounded">[userName]</code>
                                </div>
                                <div class="flex justify-between items-center py-2 border-b border-purple-950/30">
                                    <span class="text-gray-400">إجمالي البوستات في السيرفر</span>
                                    <code class="text-purple-400 bg-purple-950/30 px-2 py-0.5 rounded">[totalBoosts]</code>
                                </div>
                                <div class="flex justify-between items-center py-2">
                                    <span class="text-gray-400">اسم السيرفر</span>
                                    <code class="text-purple-400 bg-purple-950/30 px-2 py-0.5 rounded">[serverName]</code>
                                </div>
                            </div>
                        </div>
                    </div>
                    <script>
                    function insertBoostTag(tag) {
                        const ta = document.getElementById('boostTextarea');
                        if (!ta) return;
                        const start = ta.selectionStart, end = ta.selectionEnd;
                        ta.value = ta.value.substring(0, start) + tag + ta.value.substring(end);
                        ta.selectionStart = ta.selectionEnd = start + tag.length;
                        ta.focus();
                    }
                    function saveSetting(key, value) {
                        fetch('/api/guild/${guildId}/settings', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({ key, value })
                        });
                    }
                    </script>
                `;
            } else if (section === 'protection' || section === 'antinuke') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- Main Protection Master Toggle Card -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl flex items-center justify-between">
                            <label class="toggle"><input type="checkbox" name="anti_nuke_enabled" value="1" ${settings.anti_nuke_enabled ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="text-right">
                                <h4 class="font-bold text-white text-sm">جدار الحماية الشامل ومكافحة التخريب 🛡️</h4>
                                <p class="text-gray-400 text-xs mt-0.5">تفعيل وتأمين السيرفر ضد الهجمات والتخريب والسبام وحماية القنوات والرتب فوراً</p>
                            </div>
                        </div>

                        <!-- 6 Cards Grid matching Image 5 -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <!-- 1. منع الروابط -->
                            <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="anti_link" value="1" ${settings.anti_link ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="text-right">
                                    <h4 class="font-bold text-white text-xs">منع الروابط (Anti-Link)</h4>
                                    <p class="text-gray-400 text-[11px] mt-0.5">حذف روابط الديسكورد والمواقع غير المصرح بها فوراً</p>
                                </div>
                            </div>

                            <!-- 2. مكافحة السبام -->
                            <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="anti_spam" value="1" ${settings.anti_spam ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="text-right">
                                    <h4 class="font-bold text-white text-xs">مكافحة السبام (Anti-Spam)</h4>
                                    <p class="text-gray-400 text-[11px] mt-0.5">منع تكرار الرسائل السريعة تلقائياً لحماية الشات</p>
                                </div>
                            </div>

                            <!-- 3. مكافحة التخريب والنظام -->
                            <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl space-y-3">
                                <div class="flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" name="anti_nuke_enabled" value="1" ${settings.anti_nuke_enabled ? 'checked' : ''}><span class="slider"></span></label>
                                    <div class="text-right">
                                        <h4 class="font-bold text-white text-xs">مكافحة التخريب (Anti-Nuke)</h4>
                                        <p class="text-gray-400 text-[11px] mt-0.5">حماية السيرفر من طرد أو حظر الرتب وتدمير القنوات</p>
                                    </div>
                                </div>
                                <div>
                                    <label class="block text-[11px] font-bold text-gray-400 mb-1 text-right">إجراء العقوبة عند التخريب</label>
                                    <select name="anti_nuke_action" class="w-full bg-[#0b0c10] border border-purple-950/40 rounded-xl px-3 py-2 text-xs text-white outline-none">
                                        <option value="ban" ${settings.anti_nuke_action === 'ban' ? 'selected' : ''}>حظر فوري (Ban)</option>
                                        <option value="kick" ${settings.anti_nuke_action === 'kick' ? 'selected' : ''}>طرد من السيرفر (Kick)</option>
                                        <option value="strip_roles" ${settings.anti_nuke_action === 'strip_roles' ? 'selected' : ''}>سحب جميع الرتب (Strip Roles)</option>
                                    </select>
                                </div>
                            </div>

                            <!-- 4. الحد الأدنى لعمر الحساب -->
                            <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl text-right space-y-2">
                                <h4 class="font-bold text-white text-xs">الحد الأدنى لعمر الحساب (Anti-Alt)</h4>
                                <p class="text-gray-400 text-[11px]">طرد الحسابات الوهمية والجديدة التي عمرها أقل من عدد الأيام المحدد</p>
                                <input type="number" name="anti_alt_days" value="${settings.anti_alt_days || 0}" min="0" max="365" class="w-full bg-[#0b0c10] border border-purple-950/40 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right" placeholder="0 لتعطيل الفحص">
                            </div>

                            <!-- 5. أقصى عدد منشن -->
                            <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl text-right space-y-2">
                                <h4 class="font-bold text-white text-xs">أقصى عدد منشن مسموح به في الرسالة (Max Mentions)</h4>
                                <p class="text-gray-400 text-[11px]">معاقبة الأعضاء الذين يرسلون رسائل بمنشن جماعي مفرط</p>
                                <input type="number" name="max_mentions" value="${settings.max_mentions || 4}" min="1" max="50" class="w-full bg-[#0b0c10] border border-purple-950/40 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                            </div>

                            <!-- 6. قناة سجلات الحماية -->
                            <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl text-right space-y-2">
                                <h4 class="font-bold text-white text-xs">قناة سجلات الحماية (Protection Log Channel ID)</h4>
                                <p class="text-gray-400 text-[11px]">إرسال تقارير محاولات التخريب والسبام والروابط المحذوفة</p>
                                <input type="text" name="log_channel" value="${settings.log_channel || ''}" placeholder="ضع ID القناة..." class="w-full bg-[#0b0c10] border border-purple-950/40 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                            </div>
                        </div>

                        <!-- Advanced Automod & Badwords Filter -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl space-y-4">
                            <h4 class="font-bold text-white text-sm text-right">فلاتر الرقابة التلقائية الإضافية (Automod Filters) 🛡️</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" name="anti_caps" value="1" ${settings.anti_caps ? 'checked' : ''}><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">منع الحروف الكبيرة (Anti-Caps)</p>
                                        <p class="text-gray-400 text-[10px]">حذف الرسائل المكتوبة بحروف كبيرة مفرطة (CAPS)</p>
                                    </div>
                                </div>
                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" name="anti_emoji_spam" value="1" ${settings.anti_emoji_spam ? 'checked' : ''}><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">منع سبام الإيموجي (Anti-Emoji Spam)</p>
                                        <p class="text-gray-400 text-[10px]">منع الرسائل التي تحتوي على عدد كبير من الإيموجيات</p>
                                    </div>
                                </div>
                            </div>

                            <div class="pt-3 border-t border-purple-950/30">
                                <div class="flex items-center justify-between mb-3">
                                    <label class="toggle"><input type="checkbox" name="bad_words_enabled" value="1" ${settings.bad_words_enabled ? 'checked' : ''}><span class="slider"></span></label>
                                    <div class="text-right">
                                        <h5 class="font-bold text-white text-xs">فلتر الكلمات المسيئة والبذيئة (Bad Words Filter)</h5>
                                        <p class="text-gray-400 text-[11px]">حذف الرسائل التي تحتوي على كلمات محظورة تلقائياً وتنبيه العضو</p>
                                    </div>
                                </div>
                                <textarea name="bad_words_list" rows="3" placeholder="اكتب الكلمات المحظورة مفصولة بفواصل (مثال: كلمة1, كلمة2, كلمة3)..." class="w-full bg-[#0b0c10] border border-purple-950/40 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-mono">${settings.bad_words_list || ''}</textarea>
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'welcome') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- Welcome Header & Live Card -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <div class="flex items-center justify-between mb-4">
                                <label class="toggle"><input type="checkbox" name="welcome_image" value="1" ${settings.welcome_image ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="text-right">
                                    <h4 class="font-bold text-white text-sm">توليد بطاقة ترحيب مصممة بالاسم والافتار (Canvas Card)</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">إرسال صورة ترحيبية احترافية تلقائياً لكل عضو ينضم للسيرفر</p>
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

                        <!-- Welcome Channel & Message -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl space-y-4 text-right">
                            <h4 class="font-bold text-white text-sm">إعدادات رسالة الترحيب في القناة 📢</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة الترحيب (Welcome Channel) <span class="text-purple-400">*</span></label>
                                    ${renderChannelSelect('welcome_channel', settings.welcome_channel)}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الرتبة التلقائية للأعضاء (Auto-Role)</label>
                                    ${renderRoleSelect('auto_role', settings.auto_role)}
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2">نص رسالة الترحيب</label>
                                <textarea id="welcomeMsgInput" name="welcome_message" rows="3" placeholder="مرحباً بك [user] في سيرفر [server]! أنت العضو رقم [memberCount] 🎉" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none leading-relaxed text-right">${settings.welcome_message || ''}</textarea>
                                
                                <!-- Quick Tag Badges -->
                                <div class="flex flex-wrap gap-2 mt-2 items-center justify-end">
                                    <span class="text-[11px] text-gray-400">إدراج متغير سريع:</span>
                                    <button type="button" onclick="insertTag('welcomeMsgInput', '[user]')" class="px-2.5 py-1 bg-purple-950/60 hover:bg-purple-800/60 border border-purple-800/40 text-purple-200 rounded-lg text-[11px] font-mono transition">[user]</button>
                                    <button type="button" onclick="insertTag('welcomeMsgInput', '[userName]')" class="px-2.5 py-1 bg-purple-950/60 hover:bg-purple-800/60 border border-purple-800/40 text-purple-200 rounded-lg text-[11px] font-mono transition">[userName]</button>
                                    <button type="button" onclick="insertTag('welcomeMsgInput', '[server]')" class="px-2.5 py-1 bg-purple-950/60 hover:bg-purple-800/60 border border-purple-800/40 text-purple-200 rounded-lg text-[11px] font-mono transition">[server]</button>
                                    <button type="button" onclick="insertTag('welcomeMsgInput', '[memberCount]')" class="px-2.5 py-1 bg-purple-950/60 hover:bg-purple-800/60 border border-purple-800/40 text-purple-200 rounded-lg text-[11px] font-mono transition">[memberCount]</button>
                                </div>
                            </div>

                            <div class="pt-2 flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="welcome_embed_enabled" value="1" ${settings.welcome_embed_enabled ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="text-right">
                                    <p class="font-bold text-white text-xs">إرسال الترحيب كـ Embed منسق</p>
                                    <p class="text-gray-400 text-[10px]">تضمين الرسالة في بطاقة ملونة وأنيقة مع اللوجو</p>
                                </div>
                            </div>
                        </div>

                        <!-- DM Welcome Message -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl space-y-4 text-right">
                            <div class="flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="welcome_dm_enabled" value="1" ${settings.welcome_dm_enabled ? 'checked' : ''}><span class="slider"></span></label>
                                <div>
                                    <h4 class="font-bold text-white text-sm">رسائل الترحيب في الخاص (Direct Message) 📩</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">إرسال رسالة ترحيب خاصة للعضو الجديد فور انضمامه</p>
                                </div>
                            </div>
                            <textarea name="welcome_dm_message" rows="3" placeholder="أهلاً بك يا [user] في سيرفرنا [server]! نتمنى لك وقتاً ممتعاً 🌟" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none leading-relaxed text-right">${settings.welcome_dm_message || ''}</textarea>
                        </div>

                        <!-- Leave / Goodbye System -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl space-y-4 text-right">
                            <div class="flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="leave_enabled" value="1" ${settings.leave_enabled ? 'checked' : ''}><span class="slider"></span></label>
                                <div>
                                    <h4 class="font-bold text-white text-sm">رسائل المغادرة وتوديع الأعضاء (Leave / Goodbye) 👋</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">إرسال إشعار وتوديع في القناة عند خروج أي عضو من السيرفر</p>
                                </div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة المغادرة (Leave Channel)</label>
                                    ${renderChannelSelect('leave_channel', settings.leave_channel)}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">نص رسالة المغادرة</label>
                                    <input type="text" name="leave_message" value="${settings.leave_message || 'وداعاً [userName]، نتمنى رؤيتك قريباً 👋'}" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'tickets') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- Master Toggle Card -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl flex items-center justify-between">
                            <label class="toggle"><input type="checkbox" name="ticket_enabled" value="1" ${settings.ticket_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="text-right">
                                <h4 class="font-bold text-white text-sm">نظام التذاكر والدعم الفني المتقدم (Pro Tickets) 🎫</h4>
                                <p class="text-gray-400 text-xs mt-0.5">فتح وإدارة تذاكر الدعم الفني للأعضاء مع أقسام متعددة وأزرار سريعة وحفظ السجلات (Transcripts)</p>
                            </div>
                        </div>

                        <!-- Core Setup Grid -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl space-y-4">
                            <h4 class="font-bold text-white text-sm text-right">الإعدادات الأساسية للرومات والرتب ⚙️</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">كاتيجوري التذاكر المفتوحة (Ticket Category)</label>
                                    ${renderCategorySelect('ticket_category', settings.ticket_category)}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">رتبة مسؤولي الدعم الفني (Support Role)</label>
                                    ${renderRoleSelect('support_role', settings.support_role)}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة حفظ السجلات والترانسكريبت (Ticket Log Channel)</label>
                                    ${renderChannelSelect('ticket_log_channel', settings.ticket_log_channel)}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الحد الأقصى للتذاكر المفتوحة للعضو الواحد</label>
                                    <input type="number" name="ticket_max_open" value="${settings.ticket_max_open || 1}" min="1" max="5" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none font-mono text-right">
                                </div>
                            </div>
                        </div>

                        <!-- Ticket Message & Greeting -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl space-y-3 text-right">
                            <div class="flex items-center justify-between">
                                <span class="text-[11px] text-gray-400 font-mono">[user] [userName] [server]</span>
                                <h4 class="font-bold text-white text-sm">رسالة الترحيب داخل التذكرة الجديدة 📩</h4>
                            </div>
                            <textarea name="ticket_welcome_msg" rows="3" placeholder="مرحباً بك [user] في تذكرتك الخاصة! يرجى توضيح استفسارك أو مشكلتك بالتفصيل وسيقوم فريق الدعم بالرد عليك قريباً." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right leading-relaxed">${settings.ticket_welcome_msg || ''}</textarea>
                        </div>

                        <!-- Interactive Ticket Panel Deployer -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-6 rounded-2xl space-y-4 text-right">
                            <div class="flex items-center justify-between">
                                <span class="px-2.5 py-1 bg-purple-950/60 text-purple-300 border border-purple-800/40 rounded-lg text-xs font-bold">🚀 إرسال فوري</span>
                                <h4 class="font-bold text-white text-sm">إنشاء وإرسال لوحة التذاكر التفاعلية إلى الديسكورد 🔘</h4>
                            </div>
                            <p class="text-gray-400 text-xs">قم بتحديد روم الدعم الفني بالأسفل واضغط زر الإرسال لينشر البوت لوحة التذاكر التفاعلية بالأزرار فوراً في السيرفر:</p>
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">روم إرسال اللوحة (Channel) <span class="text-purple-400">*</span></label>
                                    ${renderChannelSelect('ticket_panel_channel', settings.ticket_panel_channel)}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">عنوان لوحة التذاكر</label>
                                    <input type="text" id="panelTitleInput" value="${settings.ticket_panel_title || '🎫 نظام الدعم الفني والمساعدة'}" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">
                                </div>
                            </div>

                            <div class="mt-2">
                                <label class="block text-xs font-bold text-gray-300 mb-2">وصف لوحة التذاكر</label>
                                <textarea id="panelDescInput" rows="2" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">${settings.ticket_panel_desc || 'لفتح تذكرة جديدة والتواصل مع فريق الإدارة والدعم الفني، يرجى الضغط على الزر بالأسفل.'}</textarea>
                            </div>

                            <div class="pt-2 flex justify-end">
                                <button type="button" onclick="sendTicketPanelDirect()" id="sendPanelBtn" class="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2">
                                    <span>🚀 إرسال لوحة التذاكر إلى الروم المحدد</span>
                                </button>
                            </div>
                            <div id="panelSendStatus" class="text-xs font-bold text-center hidden mt-2"></div>
                        </div>
                    </div>

                    <script>
                    async function sendTicketPanelDirect() {
                        const channelId = document.getElementById('panelChannelInput').value.trim();
                        const title = document.getElementById('panelTitleInput').value.trim();
                        const desc = document.getElementById('panelDescInput').value.trim();
                        const statusEl = document.getElementById('panelSendStatus');
                        const btn = document.getElementById('sendPanelBtn');

                        if (!channelId) {
                            alert('يرجى كتابة ID القناة أولاً!');
                            return;
                        }

                        btn.disabled = true;
                        btn.innerHTML = '⏳ جارٍ الإرسال...';
                        statusEl.className = 'text-xs font-bold text-center text-purple-400 mt-2 block';
                        statusEl.innerText = 'جارٍ إرسال لوحة التذاكر إلى ديسكورد...';

                        try {
                            const res = await fetch('/api/guild/${guildId}/send-ticket-panel', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ channelId, title, desc })
                            });
                            const data = await res.json();
                            if (data.success) {
                                statusEl.className = 'text-xs font-bold text-center text-emerald-400 mt-2 block';
                                statusEl.innerText = '✅ تم إرسال لوحة التذاكر بنجاح إلى الروم في السيرفر!';
                            } else {
                                statusEl.className = 'text-xs font-bold text-center text-rose-400 mt-2 block';
                                statusEl.innerText = '❌ خطأ: ' + (data.error || 'فشل إرسال اللوحة، تأكد من صلاحيات البوت في الروم');
                            }
                        } catch (err) {
                            statusEl.className = 'text-xs font-bold text-center text-rose-400 mt-2 block';
                            statusEl.innerText = '❌ حدث خطأ أثناء الاتصال بالخادم';
                        } finally {
                            btn.disabled = false;
                            btn.innerHTML = '<span>🚀 إرسال لوحة التذاكر إلى الروم المحدد</span>';
                        }
                    }
                    </script>
                `;
            } else if (section === 'levels') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- Master Leveling Toggle Card -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl flex items-center justify-between">
                            <label class="toggle"><input type="checkbox" name="leveling_enabled" value="1" ${settings.leveling_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="text-right">
                                <h4 class="font-bold text-white text-sm">نظام المستويات واللفلات التفاعلي (Leveling & XP) 📈</h4>
                                <p class="text-gray-400 text-xs mt-0.5">منح نقاط خبرة XP للأعضاء عند التفاعل في الشات وإرسال إشعارات الترقية وبطاقات الرانك</p>
                            </div>
                        </div>

                        <!-- Core Leveling Configuration -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl space-y-4 text-right">
                            <h4 class="font-bold text-white text-sm">إعدادات الخبرة XP والإعلانات ⚙️</h4>
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">مضاعف نقاط الـ XP (XP Multiplier)</label>
                                    <input type="number" step="0.1" name="level_multiplier" value="${settings.level_multiplier || 1.0}" min="0.1" max="10.0" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none font-mono text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة إرسال رسائل الترقية (Level Up Channel)</label>
                                    <input type="text" name="level_channel" value="${settings.level_channel || 'current'}" placeholder="current (نفس الروم) أو ضع ID الروم..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none font-mono text-right">
                                    <p class="text-[10px] text-gray-400 mt-1">اكتب <code class="text-purple-400">current</code> للإرسال بنفس الروم، أو <code class="text-purple-400">dm</code> للخاص، أو <code class="text-purple-400">disabled</code> لتعطيل الرسائل، أو ID روم مخصص.</p>
                                </div>
                            </div>
                        </div>

                        <!-- Level Up Message Customizer -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl space-y-3 text-right">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-1.5 flex-wrap">
                                    <button type="button" onclick="insertLevelTag('[user]')" class="px-2 py-1 bg-purple-950/50 hover:bg-purple-800/60 text-purple-300 border border-purple-900/40 rounded-lg text-[10px] font-mono transition">+ [user]</button>
                                    <button type="button" onclick="insertLevelTag('[level]')" class="px-2 py-1 bg-purple-950/50 hover:bg-purple-800/60 text-purple-300 border border-purple-900/40 rounded-lg text-[10px] font-mono transition">+ [level]</button>
                                    <button type="button" onclick="insertLevelTag('[userName]')" class="px-2 py-1 bg-purple-950/50 hover:bg-purple-800/60 text-purple-300 border border-purple-900/40 rounded-lg text-[10px] font-mono transition">+ [userName]</button>
                                    <button type="button" onclick="insertLevelTag('[server]')" class="px-2 py-1 bg-purple-950/50 hover:bg-purple-800/60 text-purple-300 border border-purple-900/40 rounded-lg text-[10px] font-mono transition">+ [server]</button>
                                </div>
                                <h4 class="font-bold text-white text-sm">نص رسالة الترقية (Level Up Message) 🎉</h4>
                            </div>
                            <textarea id="levelMsgTextarea" name="level_message" rows="3" placeholder="🎉 مبروك يا [user]! لقد وصلت إلى المستوى [level]! 🚀" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none leading-relaxed text-right">${settings.level_message || '🎉 مبروك يا [user]! لقد وصلت إلى المستوى [level]! 🚀'}</textarea>
                        </div>
                    </div>

                    <script>
                    function insertLevelTag(tag) {
                        const ta = document.getElementById('levelMsgTextarea');
                        if (!ta) return;
                        const start = ta.selectionStart, end = ta.selectionEnd;
                        ta.value = ta.value.substring(0, start) + tag + ta.value.substring(end);
                        ta.selectionStart = ta.selectionEnd = start + tag.length;
                        ta.focus();
                    }
                    </script>
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
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">قناة الإنشاء الرئيسية (Join to Create Voice)</label>
                                ${renderVoiceSelect('temp_voice_channel', settings.temp_voice_channel)}
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">كاتيجوري الرومات المؤقتة (Category)</label>
                                ${renderCategorySelect('temp_voice_category', settings.temp_voice_category)}
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'overview' || section === 'analytics' || section === 'stats') {
                const botGuild = client?.guilds?.cache?.get(guildId);
                const totalMembers = botGuild ? botGuild.memberCount : (guild.memberCount || 0);
                const totalBots = botGuild ? botGuild.members?.cache?.filter(m => m.user?.bot)?.size || 0 : 0;
                const totalChannels = botGuild ? botGuild.channels?.cache?.size || 0 : 0;
                const totalRoles = botGuild ? botGuild.roles?.cache?.size || 0 : 0;
                const boostCount = botGuild ? (botGuild.premiumSubscriptionCount || 0) : 0;
                const boostTier = botGuild ? (botGuild.premiumTier || 0) : 0;

                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- Header & Duration Selector -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
                            <div class="flex items-center gap-3 justify-end w-full md:w-auto">
                                <label class="text-xs font-bold text-gray-400">المدة</label>
                                <select id="statsDurationSelect" onchange="changeStatsDuration(this.value)" class="bg-[#0b0c10] border border-purple-950/40 text-white rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-purple-600 cursor-pointer">
                                    <option value="7d" selected>7 أيام</option>
                                    <option value="24h">24 ساعة</option>
                                    <option value="14d">14 يوم</option>
                                    <option value="30d">30 يوم</option>
                                </select>
                            </div>
                            <div class="text-right w-full md:w-auto">
                                <h3 class="font-black text-white text-xl">الإحصائيات</h3>
                                <p class="text-gray-400 text-xs mt-1">يوفر إحصاءات وتحليلات تفصيلية عن نشاط السيرفر بما في ذلك تفاعل الأعضاء، الرسائل، والمزيد من المقاييس.</p>
                            </div>
                        </div>

                        <!-- 4 Stat Cards Row -->
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl text-right">
                                <span class="text-gray-400 text-[11px] block">إجمالي الأعضاء</span>
                                <h4 class="text-xl font-black text-white mt-1">${totalMembers.toLocaleString()}</h4>
                                <span class="text-[10px] text-purple-400">👤 أعضاء السيرفر</span>
                            </div>
                            <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl text-right">
                                <span class="text-gray-400 text-[11px] block">البوتات المساعدة</span>
                                <h4 class="text-xl font-black text-indigo-300 mt-1">${totalBots}</h4>
                                <span class="text-[10px] text-indigo-400">🤖 حسابات بوتات</span>
                            </div>
                            <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl text-right">
                                <span class="text-gray-400 text-[11px] block">القنوات والرومات</span>
                                <h4 class="text-xl font-black text-purple-300 mt-1">${totalChannels}</h4>
                                <span class="text-[10px] text-purple-400">💬 صوتية وكتابية</span>
                            </div>
                            <div class="bg-[#12131c] border border-purple-950/40 p-4 rounded-2xl text-right">
                                <span class="text-gray-400 text-[11px] block">مستوى البوست</span>
                                <h4 class="text-xl font-black text-pink-400 mt-1">Level ${boostTier}</h4>
                                <span class="text-[10px] text-pink-400">🚀 ${boostCount} Boosts</span>
                            </div>
                        </div>

                        <!-- Chart 1: الرسائل (Messages Chart) -->
                        <div class="bg-[#12131c] border border-purple-950/40 rounded-2xl p-6 shadow-xl space-y-4 text-right">
                            <div class="flex items-center justify-between">
                                <button type="button" class="text-gray-500 hover:text-purple-400 text-sm">☰</button>
                                <h4 class="font-bold text-white text-sm">الرسائل</h4>
                            </div>
                            <div id="messagesChartContainer" class="w-full h-72"></div>
                        </div>

                        <!-- Chart 2: دخول/خروج (Joins & Leaves Chart) -->
                        <div class="bg-[#12131c] border border-purple-950/40 rounded-2xl p-6 shadow-xl space-y-4 text-right">
                            <div class="flex items-center justify-between">
                                <button type="button" class="text-gray-500 hover:text-purple-400 text-sm">☰</button>
                                <h4 class="font-bold text-white text-sm">دخول/خروج</h4>
                            </div>
                            <div id="joinsLeavesChartContainer" class="w-full h-80"></div>
                        </div>

                        <!-- Chart 3: المتصلين بالرومات الصوتية (Voice Active Members Chart) -->
                        <div class="bg-[#12131c] border border-purple-950/40 rounded-2xl p-6 shadow-xl space-y-4 text-right">
                            <div class="flex items-center justify-between">
                                <button type="button" class="text-gray-500 hover:text-purple-400 text-sm">☰</button>
                                <h4 class="font-bold text-white text-sm">المتصلين بالرومات الصوتية</h4>
                            </div>
                            <div id="voiceChartContainer" class="w-full h-80"></div>
                        </div>
                    </div>

                    <script>
                    let messagesChartInstance = null;
                    let joinsLeavesChartInstance = null;
                    let voiceChartInstance = null;

                    const statsDataset = {
                        '7d': {
                            msgCategories: ['18 Aug 06:00', '18 Aug 12:00', '18 Aug 18:00', '19 Aug 00:00', '19 Aug 06:00', '19 Aug 12:00', '19 Aug 18:00', '20 Aug 00:00', '20 Aug 06:00', '20 Aug 12:00', '20 Aug 18:00'],
                            msgData: [12, 45, 98, 140, 110, 65, 30, 22, 50, 85, 105],
                            jlCategories: ['18 Aug 00:00', '18 Aug 12:00', '19 Aug 00:00', '19 Aug 12:00', '20 Aug 00:00', '20 Aug 12:00', '21 Aug 00:00'],
                            leaves: [0, 0, 0, 0, 0, 5, 0],
                            joins: [0, 1, 0, 2, 0, 4, 0],
                            voiceCategories: ['18 Aug 00:00', '18 Aug 12:00', '19 Aug 00:00', '19 Aug 12:00', '20 Aug 00:00', '20 Aug 12:00', '21 Aug 00:00'],
                            voiceWithBots: [0, 0, 0, 0, 0, 0, 1],
                            voiceNoBots: [0, 0, 0, 0, 0, 0, 1]
                        },
                        '24h': {
                            msgCategories: ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'],
                            msgData: [15, 8, 5, 35, 78, 92, 115, 60],
                            jlCategories: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
                            leaves: [0, 0, 1, 2, 1, 1],
                            joins: [1, 0, 2, 3, 1, 2],
                            voiceCategories: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
                            voiceWithBots: [0, 0, 1, 2, 3, 2],
                            voiceNoBots: [0, 0, 1, 2, 2, 1]
                        },
                        '14d': {
                            msgCategories: ['Day 1', 'Day 3', 'Day 5', 'Day 7', 'Day 9', 'Day 11', 'Day 13'],
                            msgData: [80, 120, 210, 340, 290, 420, 380],
                            jlCategories: ['Day 1', 'Day 3', 'Day 5', 'Day 7', 'Day 9', 'Day 11', 'Day 13'],
                            leaves: [2, 1, 4, 3, 5, 2, 3],
                            joins: [5, 4, 8, 12, 9, 15, 11],
                            voiceCategories: ['Day 1', 'Day 3', 'Day 5', 'Day 7', 'Day 9', 'Day 11', 'Day 13'],
                            voiceWithBots: [1, 2, 3, 5, 4, 6, 5],
                            voiceNoBots: [1, 1, 2, 4, 3, 5, 4]
                        },
                        '30d': {
                            msgCategories: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                            msgData: [520, 890, 1450, 1890],
                            jlCategories: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                            leaves: [8, 14, 19, 12],
                            joins: [24, 45, 68, 85],
                            voiceCategories: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                            voiceWithBots: [4, 8, 12, 16],
                            voiceNoBots: [3, 6, 10, 14]
                        }
                    };

                    function initAllCharts(period = '7d') {
                        const data = statsDataset[period] || statsDataset['7d'];

                        // 1. Messages Chart (Area Spline with Purple Gradient)
                        const msgOptions = {
                            series: [{ name: 'الرسائل', data: data.msgData }],
                            chart: {
                                height: 280,
                                type: 'area',
                                toolbar: { show: false },
                                background: 'transparent'
                            },
                            dataLabels: { enabled: false },
                            stroke: { curve: 'smooth', width: 3, colors: ['#a855f7'] },
                            fill: {
                                type: 'gradient',
                                gradient: {
                                    shadeIntensity: 1,
                                    opacityFrom: 0.65,
                                    opacityTo: 0.05,
                                    stops: [0, 90, 100],
                                    colorStops: [
                                        { offset: 0, color: '#9333ea', opacity: 0.7 },
                                        { offset: 100, color: '#3b0764', opacity: 0.05 }
                                    ]
                                }
                            },
                            grid: { borderColor: '#1f212d', strokeDashArray: 3 },
                            xaxis: {
                                categories: data.msgCategories,
                                labels: { style: { colors: '#94a3b8', fontSize: '10px' } },
                                axisBorder: { color: '#1f212d' }
                            },
                            yaxis: { labels: { style: { colors: '#94a3b8', fontSize: '10px' } } },
                            tooltip: { theme: 'dark' }
                        };

                        if (messagesChartInstance) messagesChartInstance.destroy();
                        messagesChartInstance = new ApexCharts(document.querySelector("#messagesChartContainer"), msgOptions);
                        messagesChartInstance.render();

                        // 2. Joins & Leaves Chart (Dual Column Bar)
                        const jlOptions = {
                            series: [
                                { name: 'خروج الأعضاء', data: data.leaves },
                                { name: 'انضمام الأعضاء', data: data.joins }
                            ],
                            chart: {
                                height: 300,
                                type: 'bar',
                                toolbar: { show: false },
                                background: 'transparent'
                            },
                            colors: ['#dc2626', '#16a34a'],
                            plotOptions: {
                                bar: {
                                    horizontal: false,
                                    columnWidth: '55%',
                                    borderRadius: 6,
                                    dataLabels: { position: 'top' }
                                }
                            },
                            dataLabels: {
                                enabled: true,
                                formatter: (val) => val > 0 ? val : '',
                                style: { fontSize: '12px', colors: ['#ffffff'], fontWeight: 'bold' },
                                offsetY: -20
                            },
                            grid: { borderColor: '#1f212d', strokeDashArray: 3 },
                            xaxis: {
                                categories: data.jlCategories,
                                labels: { style: { colors: '#94a3b8', fontSize: '10px' } },
                                axisBorder: { color: '#1f212d' }
                            },
                            yaxis: { labels: { style: { colors: '#94a3b8', fontSize: '10px' } } },
                            legend: {
                                position: 'bottom',
                                labels: { colors: '#cbd5e1' },
                                markers: { radius: 4 }
                            },
                            tooltip: { theme: 'dark' }
                        };

                        if (joinsLeavesChartInstance) joinsLeavesChartInstance.destroy();
                        joinsLeavesChartInstance = new ApexCharts(document.querySelector("#joinsLeavesChartContainer"), jlOptions);
                        joinsLeavesChartInstance.render();

                        // 3. Voice Connections Chart
                        const voiceOptions = {
                            series: [
                                { name: 'العدد يشمل البوتات', data: data.voiceWithBots },
                                { name: 'العدد باستثناء البوتات', data: data.voiceNoBots }
                            ],
                            chart: {
                                height: 300,
                                type: 'bar',
                                toolbar: { show: false },
                                background: 'transparent'
                            },
                            colors: ['#6366f1', '#a855f7'],
                            plotOptions: {
                                bar: {
                                    horizontal: false,
                                    columnWidth: '40%',
                                    borderRadius: 6,
                                    dataLabels: { position: 'top' }
                                }
                            },
                            dataLabels: {
                                enabled: true,
                                formatter: (val) => val > 0 ? val : '',
                                style: { fontSize: '12px', colors: ['#ffffff'], fontWeight: 'bold' },
                                offsetY: -20
                            },
                            grid: { borderColor: '#1f212d', strokeDashArray: 3 },
                            xaxis: {
                                categories: data.voiceCategories,
                                labels: { style: { colors: '#94a3b8', fontSize: '10px' } },
                                axisBorder: { color: '#1f212d' }
                            },
                            yaxis: { labels: { style: { colors: '#94a3b8', fontSize: '10px' } } },
                            legend: {
                                position: 'bottom',
                                labels: { colors: '#cbd5e1' },
                                markers: { radius: 4 }
                            },
                            tooltip: { theme: 'dark' }
                        };

                        if (voiceChartInstance) voiceChartInstance.destroy();
                        voiceChartInstance = new ApexCharts(document.querySelector("#voiceChartContainer"), voiceOptions);
                        voiceChartInstance.render();
                    }

                    function changeStatsDuration(period) {
                        initAllCharts(period);
                    }

                    window.addEventListener('DOMContentLoaded', () => {
                        initAllCharts('7d');
                    });
                    </script>
                `;
            } else if (section === 'autoresponder') {
                const autoRespondersList = database.getAutoResponders ? database.getAutoResponders(guildId) : [];
                const respondersHtml = autoRespondersList && autoRespondersList.length > 0 ? autoRespondersList.map(r => `
                    <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                        <button type="button" onclick="deleteResponder('${guildId}', '${r.id || r.trigger_word}')" class="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-900/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
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
                            <div class="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                                ${respondersHtml}
                            </div>
                        </div>

                        <!-- Add New Responder Form -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl text-right">
                            <h4 class="font-bold text-white text-sm mb-1">إضافة رد تلقائي جديد 💬</h4>
                            <p class="text-gray-400 text-xs mb-4">يقوم البوت بالرد التلقائي فوراً في الشات بمجرد كتابة الكلمة المحددة (يمكنك إضافة أكثر من رد لنفس الكلمة أو لكلمات متعددة).</p>
                            
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
            } else if (section === 'settings') {
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
                            <span class="px-3 py-1 bg-purple-950/60 text-purple-300 border border-purple-800/40 rounded-xl text-xs font-bold">إعدادات السيرفر ⚙️</span>
                        </div>

                        <!-- Core Server Settings Form -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl space-y-4">
                            <h4 class="font-bold text-white text-sm text-right">الإعدادات الأساسية للنظام ⚙️</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">برفكس البوت الافتراضي (Default Prefix)</label>
                                    <input type="text" name="prefix" value="${settings.prefix || '#'}" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">لغة البوت في السيرفر (Bot Language)</label>
                                    <select name="bot_language" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">
                                        <option value="ar" ${settings.bot_language !== 'en' ? 'selected' : ''}>العربية (Arabic) 🇸🇦</option>
                                        <option value="en" ${settings.bot_language === 'en' ? 'selected' : ''}>English (الإنجليزية) 🇺🇸</option>
                                    </select>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">رتبة مسؤولي وإدارة البوت (Bot Manager Role)</label>
                                    ${renderRoleSelect('admin_role', settings.admin_role)}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">قناة الإعلانات والتحديثات (Announcements Channel)</label>
                                    ${renderChannelSelect('announcements_channel', settings.announcements_channel)}
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">قناة السجلات العامة للبوت (General Logs Channel)</label>
                                ${renderChannelSelect('log_channel', settings.log_channel)}
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'general') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- General Commands Overview matching Image 3 -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl flex items-center justify-between">
                            <span class="px-3 py-1 bg-purple-950/60 text-purple-300 border border-purple-800/40 rounded-xl text-xs font-bold">12 أمراً متاحاً</span>
                            <div class="text-right">
                                <h4 class="font-bold text-white text-sm">الأوامر العامة والخدمية للأعضاء ⚙️</h4>
                                <p class="text-gray-400 text-xs mt-0.5">أوامر التفاعل والمعلومات والخدمات المتاحة لجميع أعضاء السيرفر</p>
                            </div>
                        </div>

                        <!-- 12 General Member Commands Only matching Image 3 -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <h4 class="font-bold text-white text-sm mb-4 text-right">قائمة الأوامر الخدمية والعامة</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                
                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">help & #help</p>
                                        <p class="text-gray-400 text-[10px]">قائمة المساعدة التفاعلية المنسدلة لجميع الأوامر</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">profile & /id</p>
                                        <p class="text-gray-400 text-[10px]">بطاقة البروفايل التفاعلية مع الرصيد والمستوى والسمعة</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">avatar & #avatar</p>
                                        <p class="text-gray-400 text-[10px]">عرض وتحميل الصورة الرمزية للعضو أو السيرفر</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">banner & #banner</p>
                                        <p class="text-gray-400 text-[10px]">عرض بنر الملف الشخصي أو بنر السيرفر بجودة عالية</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">server & #server</p>
                                        <p class="text-gray-400 text-[10px]">عرض معلومات السيرفر والأونر وتاريخ الإنشاء والإحصائيات</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">user & #user</p>
                                        <p class="text-gray-400 text-[10px]">عرض بطاقة معلومات العضو ورتبه وتاريخ الانضمام</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">ping & #ping</p>
                                        <p class="text-gray-400 text-[10px]">فحص سرعة استجابة البوت وسيرفرات ديسكورد</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">tax & #tax</p>
                                        <p class="text-gray-400 text-[10px]">حاسبة ضريبة بروبوت والتحويلات الذكية</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">stars & #stars</p>
                                        <p class="text-gray-400 text-[10px]">استعراض رصيد النجوم والسمعة وإعطاء النجوم للأعضاء</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">roles & #roles</p>
                                        <p class="text-gray-400 text-[10px]">عرض قائمة جميع رتب السيرفر وأعداد أعضائها</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">channels & #channels</p>
                                        <p class="text-gray-400 text-[10px]">إحصائيات القنوات الصوتية والنصية والكاتيجوري</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">emojis & #emojis</p>
                                        <p class="text-gray-400 text-[10px]">استعراض وإحصاء جميع إيموجيات وستيكرات السيرفر</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">giveaway & #giveaway</p>
                                        <p class="text-gray-400 text-[10px]">إنشاء وإدارة مسابقات الجيف أواي وتحديد الفائزين</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">poll & #poll</p>
                                        <p class="text-gray-400 text-[10px]">إنشاء استطلاعات وتصويت تفاعلي للأعضاء</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">quran & #quran</p>
                                        <p class="text-gray-400 text-[10px]">الاستماع لآيات وسور القرآن الكريم والتفاسير</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">radio & #radio</p>
                                        <p class="text-gray-400 text-[10px]">تشغيل إذاعة القرآن الكريم على مدار الساعة</p>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'moderation') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- إعدادات القناة والبرفكس -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">برفكس الأوامر (Prefix)</label>
                                <input type="text" name="prefix" value="${settings.prefix || '#'}" class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">قناة سجلات الإشراف (Moderation Logs)</label>
                                ${renderChannelSelect('log_channel', settings.log_channel)}
                            </div>
                        </div>

                        <!-- أوامر الإشراف الكاملة -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl">
                            <h4 class="font-bold text-white text-sm mb-4 text-right">أوامر الإشراف المتاحة 🔨</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/ban & #ban</p>
                                        <p class="text-gray-400 text-[10px]">حظر الأعضاء المؤقت والنهائي مع إرسال رسالة خاصة قبل الحظر</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/unban</p>
                                        <p class="text-gray-400 text-[10px]">رفع الحظر عن عضو محظور مع البحث باليوزرنيم</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/kick & #kick</p>
                                        <p class="text-gray-400 text-[10px]">طرد الأعضاء المخالفين مع إرسال رسالة خاصة قبل الطرد</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/warn & /warnings & #warn</p>
                                        <p class="text-gray-400 text-[10px]">نظام تحذيرات متقدم مع عقوبات تلقائية تراكمية</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/timeout & /mute & /untimeout</p>
                                        <p class="text-gray-400 text-[10px]">تايم اوت مؤقت وكتم صوتي وكتابي برسالة خاصة</p>
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
                                        <p class="text-gray-400 text-[10px]">قفل وفتح القنوات للسيرفر بالكامل أو قناة معينة</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/role & /temprole</p>
                                        <p class="text-gray-400 text-[10px]">إعطاء وسحب الرتب المؤقتة والدائمة حتى 5 أعضاء</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/slowmode & #slowmode</p>
                                        <p class="text-gray-400 text-[10px]">تفعيل وإيقاف الوضع البطيء لقناة أو كل القنوات</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/unban & /bans</p>
                                        <p class="text-gray-400 text-[10px]">عرض قائمة المحظورين ورفع الحظر بالاسم أو الـ ID</p>
                                    </div>
                                </div>

                            </div>
                        </div>

                        <!-- نظام العقوبات التلقائي -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl text-right">
                            <h4 class="font-bold text-white text-sm mb-3">نظام العقوبات التلقائي للتحذيرات ⚠️</h4>
                            <p class="text-gray-400 text-xs mb-4">عند تراكم التحذيرات يتم تطبيق العقوبات تلقائياً على العضو</p>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                <div class="bg-[#0b0c10] p-4 rounded-xl border border-yellow-900/40 text-center">
                                    <span class="text-2xl mb-2 block">⏳</span>
                                    <p class="font-bold text-yellow-300 text-sm">3 تحذيرات</p>
                                    <p class="text-gray-400 text-[11px] mt-1">تايم اوت تلقائي لمدة 1 ساعة</p>
                                </div>
                                <div class="bg-[#0b0c10] p-4 rounded-xl border border-orange-900/40 text-center">
                                    <span class="text-2xl mb-2 block">👢</span>
                                    <p class="font-bold text-orange-400 text-sm">5 تحذيرات</p>
                                    <p class="text-gray-400 text-[11px] mt-1">طرد تلقائي من السيرفر (Kick)</p>
                                </div>
                                <div class="bg-[#0b0c10] p-4 rounded-xl border border-red-900/40 text-center">
                                    <span class="text-2xl mb-2 block">🔨</span>
                                    <p class="font-bold text-red-400 text-sm">7 تحذيرات</p>
                                    <p class="text-gray-400 text-[11px] mt-1">حظر نهائي من السيرفر (Ban)</p>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'embed') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- Header Section matching Image 4 -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                            <div class="flex items-center gap-3">
                                <span class="px-3.5 py-1.5 bg-purple-950/60 text-purple-300 border border-purple-800/40 rounded-xl text-xs font-mono font-bold">30 / 00</span>
                            </div>
                            <div class="text-right">
                                <h3 class="font-black text-white text-base">رسائل الأمبد</h3>
                                <p class="text-gray-400 text-xs mt-1">إرسال أمبد مع محتوى، تعديل الرسائل، والتعامل مع الردود الديناميكية بسلاسة.</p>
                            </div>
                        </div>

                        <!-- Dashed Create Button matching Image 4 -->
                        <div onclick="document.getElementById('embedBuilderBox').classList.toggle('hidden'); document.getElementById('embedBuilderBox').scrollIntoView({behavior: 'smooth'})" class="border-2 border-dashed border-purple-800/40 hover:border-purple-500 bg-[#12131c]/50 hover:bg-[#12131c] p-8 rounded-2xl text-center cursor-pointer transition group">
                            <div class="w-12 h-12 rounded-2xl bg-purple-950/60 group-hover:bg-purple-600/30 text-purple-400 group-hover:text-purple-200 border border-purple-800/40 flex items-center justify-center text-xl mx-auto mb-3 transition">
                                +
                            </div>
                            <h4 class="font-bold text-white text-sm group-hover:text-purple-300 transition">+ إنشاء رسالة أمبد</h4>
                            <p class="text-gray-500 text-xs mt-1">اضغط هنا لفتح المحرر التفاعلي وتصميم وإرسال رسالة إيمبد جديدة</p>
                        </div>

                        <!-- Interactive Embed Builder -->
                        <div id="embedBuilderBox" class="bg-[#12131c] border border-purple-950/40 p-6 rounded-2xl space-y-5">
                            <h4 class="font-bold text-white text-sm text-right">محرر رسائل الإيمبد التفاعلي (Interactive Embed Builder) 📄</h4>
                            
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

                            <div class="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                                <span id="embedSendStatus" class="text-xs font-bold text-emerald-400 hidden">✅ تم إرسال رسالة الإيمبد إلى الروم في الديسكورد بنجاح!</span>
                                <button type="button" onclick="sendEmbedToDiscord('${guildId}')" class="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-purple-900/40 flex items-center justify-center gap-2">
                                    <span>🚀</span>
                                    <span>إرسال الإيمبد إلى ديسكورد الآن</span>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'fun') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- Fun Games Header Master Toggle matching Image 4 -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-6 rounded-2xl flex items-center justify-between">
                            <label class="toggle"><input type="checkbox" name="fun_enabled" value="1" ${settings.fun_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="text-right">
                                <h3 class="font-black text-white text-base">التسلية 🎮</h3>
                                <p class="text-gray-400 text-xs mt-1">يضيف متعة إلى سيرفرك بميزات مثل الروليت، الكراسي، المافيا، الغميضة مع المزيد من الألعاب.</p>
                            </div>
                        </div>

                        <!-- Games Grid matching Image 4 -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-6 rounded-2xl">
                            <h4 class="font-bold text-white text-sm mb-4 text-right">الألعاب</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                
                                <!-- روليت -->
                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <button type="button" class="text-gray-500 hover:text-purple-400 p-1 rounded-lg">⚙️</button>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">روليت</p>
                                            <p class="text-gray-400 text-[10px]">روليت الكازينو الأوروبي ومضاعفة أرباح النجوم</p>
                                        </div>
                                        <div class="w-10 h-10 bg-purple-950/30 rounded-xl flex items-center justify-center text-xl">🎲</div>
                                    </div>
                                </div>

                                <!-- الكراسي -->
                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <button type="button" class="text-gray-500 hover:text-purple-400 p-1 rounded-lg">⚙️</button>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">الكراسي</p>
                                            <p class="text-gray-400 text-[10px]">لعبة الكراسي الموسيقية التفاعلية في الشات</p>
                                        </div>
                                        <div class="w-10 h-10 bg-purple-950/30 rounded-xl flex items-center justify-center text-xl">🪑</div>
                                    </div>
                                </div>

                                <!-- مافيا -->
                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <button type="button" class="text-gray-500 hover:text-purple-400 p-1 rounded-lg">⚙️</button>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">مافيا</p>
                                            <p class="text-gray-400 text-[10px]">لعبة المافيا والغموض بين الأعضاء</p>
                                        </div>
                                        <div class="w-10 h-10 bg-purple-950/30 rounded-xl flex items-center justify-center text-xl">🎭</div>
                                    </div>
                                </div>

                                <!-- الغميضة -->
                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <button type="button" class="text-gray-500 hover:text-purple-400 p-1 rounded-lg">⚙️</button>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">الغميضة</p>
                                            <p class="text-gray-400 text-[10px]">لعبة الغميضة والبحث عن المختبئين</p>
                                        </div>
                                        <div class="w-10 h-10 bg-purple-950/30 rounded-xl flex items-center justify-center text-xl">🙈</div>
                                    </div>
                                </div>

                                <!-- رمي العملة -->
                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <button type="button" class="text-gray-500 hover:text-purple-400 p-1 rounded-lg">⚙️</button>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">رمي العملة (Coinflip)</p>
                                            <p class="text-gray-400 text-[10px]">ملك أو كتابة مع رهانات حماسية</p>
                                        </div>
                                        <div class="w-10 h-10 bg-purple-950/30 rounded-xl flex items-center justify-center text-xl">🪙</div>
                                    </div>
                                </div>

                                <!-- قتال ومبارزات -->
                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <button type="button" class="text-gray-500 hover:text-purple-400 p-1 rounded-lg">⚙️</button>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">قتال ومبارزة (Fight)</p>
                                            <p class="text-gray-400 text-[10px]">تحديات PvP حماسية بين الأعضاء بنظام النقاط</p>
                                        </div>
                                        <div class="w-10 h-10 bg-purple-950/30 rounded-xl flex items-center justify-center text-xl">⚔️</div>
                                    </div>
                                </div>

                                <!-- مسابقات وسين جيم -->
                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <button type="button" class="text-gray-500 hover:text-purple-400 p-1 rounded-lg">⚙️</button>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">مسابقات وأسئلة (Trivia)</p>
                                            <p class="text-gray-400 text-[10px]">أسئلة إسلامية وثقافية وجوائز نجوم</p>
                                        </div>
                                        <div class="w-10 h-10 bg-purple-950/30 rounded-xl flex items-center justify-center text-xl">❓</div>
                                    </div>
                                </div>

                                <!-- بلاك جاك -->
                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <button type="button" class="text-gray-500 hover:text-purple-400 p-1 rounded-lg">⚙️</button>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">بلاك جاك (Blackjack)</p>
                                            <p class="text-gray-400 text-[10px]">لعبة 21 والورق والتحديات المالية السريعة</p>
                                        </div>
                                        <div class="w-10 h-10 bg-purple-950/30 rounded-xl flex items-center justify-center text-xl">🃏</div>
                                    </div>
                                </div>

                                <!-- ميمز -->
                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <button type="button" class="text-gray-500 hover:text-purple-400 p-1 rounded-lg">⚙️</button>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">ميمز (Meme)</p>
                                            <p class="text-gray-400 text-[10px]">جلب صور ونكت مضحكة عشوائية من ريديت</p>
                                        </div>
                                        <div class="w-10 h-10 bg-purple-950/30 rounded-xl flex items-center justify-center text-xl">🐸</div>
                                    </div>
                                </div>

                                <!-- الكرة السحرية -->
                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <button type="button" class="text-gray-500 hover:text-purple-400 p-1 rounded-lg">⚙️</button>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">الكرة السحرية (8Ball)</p>
                                            <p class="text-gray-400 text-[10px]">الإجابة على التساؤلات والتوقعات الغامضة</p>
                                        </div>
                                        <div class="w-10 h-10 bg-purple-950/30 rounded-xl flex items-center justify-center text-xl">🎱</div>
                                    </div>
                                </div>

                                <!-- حجر ورقة مقص -->
                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <button type="button" class="text-gray-500 hover:text-purple-400 p-1 rounded-lg">⚙️</button>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">حجر ورقة مقص (RPS)</p>
                                            <p class="text-gray-400 text-[10px]">لعبة حجر ورقة مقص ضد البوت أو الأعضاء</p>
                                        </div>
                                        <div class="w-10 h-10 bg-purple-950/30 rounded-xl flex items-center justify-center text-xl">✂️</div>
                                    </div>
                                </div>

                                <!-- رمي النرد -->
                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <button type="button" class="text-gray-500 hover:text-purple-400 p-1 rounded-lg">⚙️</button>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">رمي النرد (Dice)</p>
                                            <p class="text-gray-400 text-[10px]">لعبة رمي النرد والمراهنة على الأرقام</p>
                                        </div>
                                        <div class="w-10 h-10 bg-purple-950/30 rounded-xl flex items-center justify-center text-xl">🎲</div>
                                    </div>
                                </div>

                            </div>
                        </div>

                        <!-- Commands Section matching Image 4 -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-6 rounded-2xl space-y-4">
                            <h4 class="font-bold text-white text-sm text-right">الأوامر</h4>
                            <div class="space-y-3">
                                
                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-purple-400">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">points</p>
                                            <p class="text-gray-400 text-xs">نظام نقاط وتصنيف اللاعبين على مستوى السيرفر</p>
                                        </div>
                                        <div class="w-8 h-8 bg-purple-950/40 rounded-lg flex items-center justify-center text-purple-400 font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-purple-400">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">game stop</p>
                                            <p class="text-gray-400 text-xs">إيقاف وإنهاء أي لعبة جارية في القناة الحالية فوراً</p>
                                        </div>
                                        <div class="w-8 h-8 bg-purple-950/40 rounded-lg flex items-center justify-center text-purple-400 font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-purple-400">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">dice</p>
                                            <p class="text-gray-400 text-xs">رمي النرد والمراهنة على الأرقام والنتائج</p>
                                        </div>
                                        <div class="w-8 h-8 bg-purple-950/40 rounded-lg flex items-center justify-center text-purple-400 font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-purple-400">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">coinflip</p>
                                            <p class="text-gray-400 text-xs">رمي العملة ملك أو كتابة مع رهانات حماسية</p>
                                        </div>
                                        <div class="w-8 h-8 bg-purple-950/40 rounded-lg flex items-center justify-center text-purple-400 font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-purple-400">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">fight</p>
                                            <p class="text-gray-400 text-xs">تحديات وقتال PvP حماسي بين الأعضاء بنقاط صحة HP</p>
                                        </div>
                                        <div class="w-8 h-8 bg-purple-950/40 rounded-lg flex items-center justify-center text-purple-400 font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-purple-400">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">trivia</p>
                                            <p class="text-gray-400 text-xs">مسابقات وسين جيم إسلامية وثقافية مع جوائز نجوم</p>
                                        </div>
                                        <div class="w-8 h-8 bg-purple-950/40 rounded-lg flex items-center justify-center text-purple-400 font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-purple-400">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">roulette</p>
                                            <p class="text-gray-400 text-xs">روليت الكازينو الأوروبي ومضاعفة أرباح النجوم</p>
                                        </div>
                                        <div class="w-8 h-8 bg-purple-950/40 rounded-lg flex items-center justify-center text-purple-400 font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-purple-400">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">blackjack</p>
                                            <p class="text-gray-400 text-xs">لعبة 21 والورق والتحديات المالية السريعة</p>
                                        </div>
                                        <div class="w-8 h-8 bg-purple-950/40 rounded-lg flex items-center justify-center text-purple-400 font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-purple-400">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">meme</p>
                                            <p class="text-gray-400 text-xs">جلب صور ونكت وميمز مضحكة عشوائية من ريديت</p>
                                        </div>
                                        <div class="w-8 h-8 bg-purple-950/40 rounded-lg flex items-center justify-center text-purple-400 font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-purple-400">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">8ball</p>
                                            <p class="text-gray-400 text-xs">الكرة السحرية للإجابة على جميع الأسئلة والتوقعات</p>
                                        </div>
                                        <div class="w-8 h-8 bg-purple-950/40 rounded-lg flex items-center justify-center text-purple-400 font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-purple-400">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">rps</p>
                                            <p class="text-gray-400 text-xs">لعبة حجر ورقة مقص ضد البوت أو الأعضاء</p>
                                        </div>
                                        <div class="w-8 h-8 bg-purple-950/40 rounded-lg flex items-center justify-center text-purple-400 font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-purple-400">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">chairs</p>
                                            <p class="text-gray-400 text-xs">لعبة الكراسي الموسيقية التفاعلية في الشات</p>
                                        </div>
                                        <div class="w-8 h-8 bg-purple-950/40 rounded-lg flex items-center justify-center text-purple-400 font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-purple-400">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">mafia</p>
                                            <p class="text-gray-400 text-xs">لعبة المافيا والغموض بين الأعضاء في الشات</p>
                                        </div>
                                        <div class="w-8 h-8 bg-purple-950/40 rounded-lg flex items-center justify-center text-purple-400 font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-purple-400">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">hideseek</p>
                                            <p class="text-gray-400 text-xs">لعبة الغميضة والبحث عن الأعضاء المختبئين</p>
                                        </div>
                                        <div class="w-8 h-8 bg-purple-950/40 rounded-lg flex items-center justify-center text-purple-400 font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                            </div>
                        </div>

                        <!-- Economy Betting Settings -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl space-y-4 text-right">
                            <h4 class="font-bold text-white text-sm">إعدادات الرهانات ومضاعف الجوائز 💰</h4>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الحد الأدنى للرهان (Min Bet)</label>
                                    <input type="number" name="min_bet" value="${settings.min_bet || 10}" min="1" class="w-full bg-[#0b0c10] border border-purple-950/40 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الحد الأقصى للرهان (Max Bet)</label>
                                    <input type="number" name="max_bet" value="${settings.max_bet || 50000}" min="100" class="w-full bg-[#0b0c10] border border-purple-950/40 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">مضاعف المكافآت (Multiplier)</label>
                                    <input type="number" step="0.1" name="game_rewards_multiplier" value="${settings.game_rewards_multiplier || 1.0}" min="0.5" max="5.0" class="w-full bg-[#0b0c10] border border-purple-950/40 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
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
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">رتب التلقائية للأعضاء (Member Auto-Role)</label>
                                    ${renderRoleSelect('auto_role', settings.auto_role)}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">الرتب التلقائية للبيوتات (Bot Auto-Role)</label>
                                    ${renderRoleSelect('auto_bot_role', settings.auto_bot_role)}
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
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">قناة الستاربورد (Starboard Channel)</label>
                                    ${renderChannelSelect('starboard_channel', settings.starboard_channel)}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">الحد الأدنى للنجوم (Star Threshold)</label>
                                    <input type="number" name="starboard_count" value="${settings.starboard_count || 3}" min="1" max="50" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
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
                                    ${renderChannelSelect('log_channel', settings.log_channel)}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">سجلات دخول وخروج الأعضاء</label>
                                    ${renderChannelSelect('welcome_channel', settings.welcome_channel)}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">سجلات الرومات الصوتية</label>
                                    ${renderChannelSelect('log_voice_channel', settings.log_voice_channel)}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">سجلات الرتب والصلاحيات</label>
                                    ${renderChannelSelect('log_roles_channel', settings.log_roles_channel)}
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
            } else if (section === 'verification') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- Master Verification Toggle -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl flex items-center justify-between">
                            <label class="toggle"><input type="checkbox" name="verify_enabled" value="1" ${settings.verify_enabled ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="text-right">
                                <h4 class="font-bold text-white text-sm">نظام التحقق والتفعيل التفاعلي (Verification System) 🛡️</h4>
                                <p class="text-gray-400 text-xs mt-0.5">إعطاء رتبة معينة للأعضاء تلقائياً بعد ضغطهم على زر التحقق "تحقق الآن"</p>
                            </div>
                        </div>

                        <!-- Core Verification Settings -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl space-y-4 text-right">
                            <h4 class="font-bold text-white text-sm">إعدادات الرتبة والروم ⚙️</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">روم التحقق (Verification Channel) <span class="text-purple-400">*</span></label>
                                    ${renderChannelSelect('verify_channel', settings.verify_channel)}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الرتبة الممنوحة عند التفعيل (Verified Role) <span class="text-purple-400">*</span></label>
                                    ${renderRoleSelect('verify_role', settings.verify_role)}
                                </div>
                            </div>
                        </div>

                        <!-- Verification Message Customizer -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl space-y-3 text-right">
                            <h4 class="font-bold text-white text-sm">رسالة لوحة التحقق (Verification Message) 📌</h4>
                            <textarea id="verifyMsgInput" name="verify_message" rows="3" placeholder="📌 إثبات نفسك&#10;&#10;عشان تثبت نفسك، اضغط على الزر الموجود تحت الرسالة، وبكذا يتم تفعيلك وسترى جميع الرومات." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right leading-relaxed">${settings.verify_message || '📌 إثبات نفسك\n\nعشان تثبت نفسك، اضغط على الزر الموجود تحت الرسالة، وبكذا يتم تفعيلك وسترى جميع الرومات.'}</textarea>
                        </div>

                        <!-- Interactive Verification Panel Deployer -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-6 rounded-2xl space-y-4 text-right">
                            <div class="flex items-center justify-between">
                                <span class="px-2.5 py-1 bg-purple-950/60 text-purple-300 border border-purple-800/40 rounded-lg text-xs font-bold">🚀 نشر مباشر</span>
                                <h4 class="font-bold text-white text-sm">إرسال لوحة التحقق التفاعلية إلى الديسكورد 🔘</h4>
                            </div>
                            <p class="text-gray-400 text-xs">اضغط الزر بالأسفل ليقوم البوت بنشر رسالة التحقق مع الزر التفاعلي فوراً في الروم المحدد أعلاه، وعندما يضغط العضو على الزر سيحصل على الرتبة مباشرة:</p>
                            
                            <div class="pt-2 flex justify-end">
                                <button type="button" onclick="sendVerificationPanelDirect()" id="sendVerifyBtn" class="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2">
                                    <span>🚀 إرسال ونشر لوحة التحقق في الروم الآن</span>
                                </button>
                            </div>
                            <div id="verifySendStatus" class="text-xs font-bold text-center hidden mt-2"></div>
                        </div>
                    </div>

                    <script>
                    async function sendVerificationPanelDirect() {
                        const channelId = document.getElementById('verifyChannelInput').value.trim();
                        const roleId = document.getElementById('verifyRoleInput').value.trim();
                        const message = document.getElementById('verifyMsgInput').value.trim();
                        const statusEl = document.getElementById('verifySendStatus');
                        const btn = document.getElementById('sendVerifyBtn');

                        if (!channelId || !roleId) {
                            alert('يرجى تحديد ID روم التحقق و ID الرتبة الممنوحة أولاً!');
                            return;
                        }

                        btn.disabled = true;
                        btn.innerHTML = '⏳ جارٍ النشر...';
                        statusEl.className = 'text-xs font-bold text-center text-purple-400 mt-2 block';
                        statusEl.innerText = 'جارٍ إرسال لوحة التفعيل إلى ديسكورد...';

                        try {
                            const res = await fetch('/api/guild/${guildId}/send-verification-panel', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ channelId, roleId, message })
                            });
                            const data = await res.json();
                            if (data.success) {
                                statusEl.className = 'text-xs font-bold text-center text-emerald-400 mt-2 block';
                                statusEl.innerText = '✅ تم نشر رسالة وزر التفعيل بنجاح في القناة!';
                            } else {
                                statusEl.className = 'text-xs font-bold text-center text-rose-400 mt-2 block';
                                statusEl.innerText = '❌ خطأ: ' + (data.error || 'فشل النشر، تأكد من صلاحيات البوت في القناة والرتبة');
                            }
                        } catch (err) {
                            statusEl.className = 'text-xs font-bold text-center text-rose-400 mt-2 block';
                            statusEl.innerText = '❌ حدث خطأ أثناء الاتصال بالخادم';
                        } finally {
                            btn.disabled = false;
                            btn.innerHTML = '<span>🚀 إرسال ونشر لوحة التحقق في الروم الآن</span>';
                        }
                    }
                    </script>
                `;
            } else if (section === 'reactionroles') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl text-right">
                            <h4 class="font-bold text-white text-sm mb-1">الرتب التفاعلية بالأزرار (Reaction & Button Roles) 🔘</h4>
                            <p class="text-gray-400 text-xs mb-4">إنشاء رسالة بأزرار تفاعلية تمكن الأعضاء من إعطاء أو إزالة الرتب عن أنفسهم بنقرة واحدة.</p>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">روم إرسال الرسالة (Channel ID) <span class="text-purple-400">*</span></label>
                                    <input type="text" id="rrChannel" placeholder="ضع ID القناة..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الرتبة المراد إعطاؤها (Role ID) <span class="text-purple-400">*</span></label>
                                    <input type="text" id="rrRole" placeholder="ضع ID الرتبة..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-right">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">نص الزر (Button Label)</label>
                                    <input type="text" id="rrLabel" placeholder="مثال: الإشعارات 🔔 أو الأخبار" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">عنوان رسالة الإيمبد (Embed Title)</label>
                                    <input type="text" id="rrTitle" placeholder="مثال: اختر رتبتك من هنا" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                            </div>

                            <div class="mt-4">
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">وصف الرسالة (Description)</label>
                                <textarea id="rrDesc" rows="3" placeholder="اضغط على الزر بالأسفل للحصول على الرتبة أو إزالتها..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right"></textarea>
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'economy') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl flex items-center justify-between">
                            <label class="toggle"><input type="checkbox" name="economy_enabled" value="1" ${settings.economy_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="text-right">
                                <h4 class="font-bold text-white text-sm">نظام اقتصاد وعملة السيرفر (Economy & Star System) 💰</h4>
                                <p class="text-gray-400 text-xs mt-0.5">تفعيل نظام النجوم، البنك، التحويلات، العمل والوظائف، وسوق الرتب والمراهنات</p>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">المكافأة اليومية الأساسية (/daily)</label>
                                <input type="number" name="daily_amount" value="${settings.daily_amount || 500}" min="50" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">مدة انتظار أمر العمل (/work بالساعات)</label>
                                <input type="number" name="work_cooldown" value="${settings.work_cooldown || 4}" min="1" max="24" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">نسبة ضريبة التحويل (/pay %)</label>
                                <input type="number" step="0.5" name="transfer_tax" value="${settings.transfer_tax || 5}" min="0" max="20" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                            </div>
                        </div>

                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl text-right">
                            <h4 class="font-bold text-white text-sm mb-3">أوامر الاقتصاد المتوفرة بالأعضاء 💳</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3 rounded-xl flex items-center justify-between">
                                    <span class="text-xs text-emerald-400 font-bold">نشط ✅</span>
                                    <div>
                                        <p class="font-bold text-white text-xs">/bank (deposit & withdraw)</p>
                                        <p class="text-gray-400 text-[10px]">إيداع وسحب وحماية النجوم في الحساب البنكي</p>
                                    </div>
                                </div>
                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3 rounded-xl flex items-center justify-between">
                                    <span class="text-xs text-emerald-400 font-bold">نشط ✅</span>
                                    <div>
                                        <p class="font-bold text-white text-xs">/work</p>
                                        <p class="text-gray-400 text-[10px]">العمل في وظائف عشوائية وكسب المكافآت</p>
                                    </div>
                                </div>
                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3 rounded-xl flex items-center justify-between">
                                    <span class="text-xs text-emerald-400 font-bold">نشط ✅</span>
                                    <div>
                                        <p class="font-bold text-white text-xs">/gamble & /casino</p>
                                        <p class="text-gray-400 text-[10px]">المراهنة ومضاعفة النجوم في ألعاب الكازينو</p>
                                    </div>
                                </div>
                                <div class="bg-[#0b0c10] border border-purple-950/30 p-3 rounded-xl flex items-center justify-between">
                                    <span class="text-xs text-emerald-400 font-bold">نشط ✅</span>
                                    <div>
                                        <p class="font-bold text-white text-xs">/leaderboard</p>
                                        <p class="text-gray-400 text-[10px]">قائمة أثرياء ومتصدري النجوم والخبرة XP</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'quran' || section === 'radio') {
                const botGuild = client.guilds.cache.get(guildId);
                const voiceChannels = botGuild ? botGuild.channels.cache.filter(c => c.isVoiceBased()).map(c => ({ id: c.id, name: c.name })) : [];
                const voiceChannelOptions = voiceChannels.map(vc => `
                    <option value="${vc.id}" ${settings.quran_channel === vc.id ? 'selected' : ''}>🔊 ${vc.name}</option>
                `).join('');

                const stations = [
                    { id: 'cairo_radio', name: '📻 إذاعة القرآن الكريم من القاهرة 🇪🇬 (بث مباشر 24/7)' },
                    { id: 'makkah_radio', name: '📻 إذاعة القرآن الكريم من مكة المكرمة 🇸🇦 (بث مباشر 24/7)' },
                    { id: 'afasy', name: '📖 الشيخ مشاري راشد العفاسي (تلاوات خاشعة)' },
                    { id: 'abdulbasit', name: '📖 الشيخ عبدالباسط عبدالصمد (المصحف المجود)' },
                    { id: 'muaiqly', name: '📖 الشيخ ماهر المعيقلي (تلاوة الحرم المكي)' },
                    { id: 'dosari', name: '📖 الشيخ ياسر الدوسري (تلاوة مؤثرة خاشعة)' },
                    { id: 'ghamdi', name: '📖 الشيخ سعد الغامدي (المصحف المرتل)' },
                    { id: 'sudais', name: '📖 الشيخ عبدالرحمن السديس (أجمل التلاوات)' },
                    { id: 'shuraim', name: '📖 الشيخ سعود الشريم (تلاوات مميزة)' },
                    { id: 'husary', name: '📖 الشيخ محمود خليل الحصري (المصحف المرتل)' }
                ];
                const stationOptions = stations.map(s => `
                    <option value="${s.id}" ${(settings.quran_station || 'cairo_radio') === s.id ? 'selected' : ''}>${s.name}</option>
                `).join('');

                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- حالة البث الحالية والمشغل الحي -->
                        <div class="bg-gradient-to-r from-emerald-950/40 via-[#12131c] to-teal-950/40 border border-emerald-900/40 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
                            <div class="flex items-center gap-3">
                                <button type="button" onclick="stopRadioDirect()" id="stopRadioBtn" class="px-5 py-2.5 bg-rose-950/60 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-800/40 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg">
                                    <span>⏹️ إيقاف البث</span>
                                </button>
                                <button type="button" onclick="startRadioDirect()" id="startRadioBtn" class="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-emerald-900/40">
                                    <span>▶️ تشغيل الآن</span>
                                </button>
                            </div>
                            <div class="text-right">
                                <div class="flex items-center gap-2 justify-end mb-1">
                                    <div id="equalizerAnim" class="hidden flex items-center gap-1">
                                        <span class="w-1 h-3 bg-emerald-400 rounded-full animate-bounce"></span>
                                        <span class="w-1 h-5 bg-emerald-400 rounded-full animate-pulse"></span>
                                        <span class="w-1 h-4 bg-teal-400 rounded-full animate-bounce"></span>
                                        <span class="w-1 h-6 bg-teal-300 rounded-full animate-pulse"></span>
                                        <span class="w-1 h-3 bg-emerald-400 rounded-full animate-bounce"></span>
                                    </div>
                                    <span id="radioLiveBadge" class="px-3 py-1 rounded-full text-[10px] font-bold bg-gray-800 text-gray-400 border border-gray-700">جاري فحص الحالة...</span>
                                    <h4 class="font-bold text-white text-base">إذاعات وتلاوات القرآن الكريم 24/7 📻</h4>
                                </div>
                                <div class="flex items-center gap-2 justify-end text-gray-400 text-xs mt-1">
                                    <span class="text-emerald-400 font-mono text-[10px] bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">HQ 320kbps Crystal Sound</span>
                                    <span class="text-purple-300 font-bold text-[10px] bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/40">بدون ديفن (Non-Deafened) 🔊</span>
                                </div>
                            </div>
                        </div>

                        <!-- إعدادات الروم الصوتي والمحطة -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-6 rounded-2xl space-y-4 text-right">
                            <div class="flex items-center justify-between border-b border-purple-950/40 pb-3">
                                <span class="text-xs text-gray-400 font-bold">اختر الروم الصوتي أو ضع الـ ID يدوياً</span>
                                <h4 class="font-bold text-white text-sm">إعدادات الروم والمحطة ⚙️</h4>
                            </div>
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">اختر الروم الصوتي من السيرفر <span class="text-emerald-400">*</span></label>
                                    ${voiceChannels.length > 0 ? `
                                        <select id="voiceChannelSelect" onchange="document.getElementById('quranChannelInput').value = this.value" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-emerald-500 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer mb-2">
                                            <option value="">-- اختر من قائمة الرومات --</option>
                                            ${voiceChannelOptions}
                                        </select>
                                    ` : ''}
                                    <input type="text" id="quranChannelInput" name="quran_channel" value="${settings.quran_channel || ''}" placeholder="أو اكتب ID الروم الصوتي هنا..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>

                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">المحطة أو القارئ المفضل <span class="text-emerald-400">*</span></label>
                                    <select id="quranStationSelect" name="quran_station" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-emerald-500 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer">
                                        ${stationOptions}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- إعدادات التشغيل المستمر 24/7 والديفن -->
                        <div class="bg-[#12131c] border border-purple-950/40 p-5 rounded-2xl space-y-4 text-right">
                            <div class="flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="quran_enabled" value="1" ${settings.quran_enabled ? 'checked' : ''}><span class="slider"></span></label>
                                <div>
                                    <h4 class="font-bold text-white text-sm">البقاء متصلاً دائماً 24/7 (Always-On 24/7)</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">يقوم البوت بإعادة الاتصال بالروم الصوتي وتشغيل التلاوة تلقائياً في حال إعادة تشغيل البوت أو انقطاع الاتصال.</p>
                                </div>
                            </div>
                        </div>

                        <div id="quranStatusMsg" class="text-xs font-bold text-center hidden py-3 px-4 rounded-xl border"></div>
                    </div>

                    <script>
                    async function checkRadioStatus() {
                        try {
                            const res = await fetch('/api/guild/${guildId}/quran/status');
                            const data = await res.json();
                            const badge = document.getElementById('radioLiveBadge');
                            const eqAnim = document.getElementById('equalizerAnim');
                            if (data.isPlaying) {
                                badge.className = 'px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 animate-pulse';
                                badge.innerText = '🟢 البث يعمل الآن: ' + (data.channelName || 'في الروم الصوتي');
                                if (eqAnim) eqAnim.classList.remove('hidden');
                            } else {
                                badge.className = 'px-3 py-1 rounded-full text-[10px] font-bold bg-gray-800 text-gray-400 border border-gray-700';
                                badge.innerText = '🔴 البوت غير متصل حالياً';
                                if (eqAnim) eqAnim.classList.add('hidden');
                            }
                        } catch(e) {}
                    }
                    checkRadioStatus();

                    async function startRadioDirect() {
                        const channelId = document.getElementById('quranChannelInput').value.trim();
                        const stationKey = document.getElementById('quranStationSelect').value;
                        const statusMsg = document.getElementById('quranStatusMsg');
                        const btn = document.getElementById('startRadioBtn');

                        if (!channelId) {
                            alert('يرجى اختيار أو كتابة ID الروم الصوتي أولاً!');
                            return;
                        }

                        btn.disabled = true;
                        btn.innerHTML = '⏳ جارٍ البدء...';
                        statusMsg.className = 'text-xs font-bold text-center text-purple-400 mt-2 block bg-purple-950/30 border border-purple-800/40 py-2.5 px-4 rounded-xl';
                        statusMsg.innerText = 'جارٍ تشغيل الراديو في الروم الصوتي...';

                        try {
                            const res = await fetch('/api/guild/${guildId}/quran/start', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ channelId, stationKey })
                            });
                            const data = await res.json();
                            if (data.success) {
                                statusMsg.className = 'text-xs font-bold text-center text-emerald-400 mt-2 block bg-emerald-950/40 border border-emerald-800 py-2.5 px-4 rounded-xl';
                                statusMsg.innerText = '✅ تم تشغيل ' + (data.stationName || 'إذاعة القرآن') + ' بنجاح في ' + (data.channelName || 'الروم الصوتي') + '!';
                                checkRadioStatus();
                            } else {
                                statusMsg.className = 'text-xs font-bold text-center text-rose-400 mt-2 block bg-rose-950/40 border border-rose-800 py-2.5 px-4 rounded-xl';
                                statusMsg.innerText = '❌ خطأ: ' + (data.error || 'فشل الاتصال بالروم الصوتي');
                            }
                        } catch(e) {
                            statusMsg.className = 'text-xs font-bold text-center text-rose-400 mt-2 block bg-rose-950/40 border border-rose-800 py-2.5 px-4 rounded-xl';
                            statusMsg.innerText = '❌ حدث خطأ أثناء الاتصال بالخادم';
                        } finally {
                            btn.disabled = false;
                            btn.innerHTML = '<span>▶️ تشغيل الآن</span>';
                        }
                    }

                    async function stopRadioDirect() {
                        const statusMsg = document.getElementById('quranStatusMsg');
                        const btn = document.getElementById('stopRadioBtn');

                        btn.disabled = true;
                        btn.innerHTML = '⏳ جارٍ الإيقاف...';

                        try {
                            const res = await fetch('/api/guild/${guildId}/quran/stop', { method: 'POST' });
                            const data = await res.json();
                            if (data.success) {
                                statusMsg.className = 'text-xs font-bold text-center text-amber-400 mt-2 block bg-amber-950/40 border border-amber-800 py-2.5 px-4 rounded-xl';
                                statusMsg.innerText = '⏹️ تم إيقاف الراديو ومغادرة الروم الصوتي.';
                                checkRadioStatus();
                            }
                        } catch(e) {
                            alert('حدث خطأ أثناء الإيقاف');
                        } finally {
                            btn.disabled = false;
                            btn.innerHTML = '<span>⏹️ إيقاف البث</span>';
                        }
                    }
                    </script>
                `;
            } else if (section === 'applications' || section === 'apply') {
                const appsList = database.getApplications ? database.getApplications(guildId) : [];
                const appsCountFormatted = appsList.length.toString().padStart(2, '0');

                const appsCardsHtml = appsList.length > 0 ? appsList.map(a => {
                    let qList = [];
                    try { qList = typeof a.questions === 'string' ? JSON.parse(a.questions) : a.questions; } catch(e) { qList = []; }
                    return `
                        <div class="bg-[#0b0c10] border border-purple-950/40 p-4 rounded-xl flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <button type="button" onclick="deleteAppForm('${a.id}')" class="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-900/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                                <span class="px-2.5 py-1 bg-purple-950/60 text-purple-300 rounded-lg text-[10px] font-bold">${qList.length} أسئلة</span>
                            </div>
                            <div class="text-right">
                                <h5 class="font-bold text-white text-xs">${a.title}</h5>
                                <p class="text-gray-400 text-[11px] mt-0.5">${a.description || 'بدون وصف'}</p>
                            </div>
                        </div>
                    `;
                }).join('') : '';

                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- Top Card: التقديمات Header & Form Creator -->
                        <div class="bg-[#12131c] border border-purple-950/40 rounded-2xl p-6 shadow-xl space-y-4 text-right">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-1 bg-[#0b0c10] border border-purple-950/40 px-3 py-1 rounded-xl text-xs font-mono font-bold text-gray-300">
                                    <span class="text-purple-400">${appsCountFormatted}</span>
                                    <span>/</span>
                                    <span class="text-gray-500">00</span>
                                </div>
                                <h4 class="font-bold text-white text-base">التقديمات</h4>
                            </div>

                            <!-- Dashed Create Button -->
                            <div onclick="toggleCreateAppForm()" class="border-2 border-dashed border-purple-950/70 hover:border-purple-600/70 bg-[#0b0c10]/40 hover:bg-purple-950/20 rounded-2xl p-6 flex items-center justify-center gap-2 cursor-pointer transition text-gray-300 hover:text-white">
                                <span class="text-xs font-bold">إنشاء تقديم</span>
                                <span class="w-5 h-5 rounded-full bg-purple-900/60 flex items-center justify-center text-xs font-bold text-purple-300">➕</span>
                            </div>

                            <!-- Inline Form for Creating an Application (Hidden by default) -->
                            <div id="createAppModal" class="hidden bg-[#0b0c10] border border-purple-900/40 rounded-2xl p-5 space-y-4 mt-4">
                                <div class="flex items-center justify-between border-b border-purple-950/40 pb-3">
                                    <button type="button" onclick="toggleCreateAppForm()" class="text-gray-500 hover:text-white text-xs font-bold">✕ إلغاء</button>
                                    <h5 class="font-bold text-purple-300 text-xs">✨ إضافة استمارة تقديم جديدة</h5>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1.5">عنوان التقديم <span class="text-rose-400">*</span></label>
                                        <input type="text" id="newAppTitle" placeholder="مثال: تقديم إدارة السيرفر / دعم فني" class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1.5">وصف التقديم (اختياري)</label>
                                        <input type="text" id="newAppDesc" placeholder="شروط أو توضيح بسيط للتقديم..." class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1.5">روم استلام الطلبات (Log Channel)</label>
                                        ${renderChannelSelect('newAppLogChan', '')}
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1.5">الرتبة الممنوحة عند القبول (Accepted Role)</label>
                                        ${renderRoleSelect('newAppRole', '')}
                                    </div>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-1.5">أسئلة الاستمارة (سؤال في كل سطر - حتى 5 أسئلة)</label>
                                    <textarea id="newAppQuestions" rows="4" placeholder="1. كم عمرك؟&#10;2. ما هي خبراتك السابقة في الإدارة؟&#10;3. كم ساعة تتواجد يومياً في الديسكورد؟" class="w-full bg-[#12131c] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none"></textarea>
                                </div>
                                <div class="flex justify-end pt-2">
                                    <button type="button" onclick="submitCreateApp()" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-1.5">
                                        <span>💾 حفظ الاستمارة</span>
                                    </button>
                                </div>
                            </div>

                            <!-- List of Current Applications -->
                            <div class="space-y-2 mt-3">
                                ${appsCardsHtml}
                            </div>
                        </div>

                        <!-- Section 2: الأوامر (Commands list) -->
                        <div class="bg-[#12131c] border border-purple-950/40 rounded-2xl p-6 shadow-xl space-y-3 text-right">
                            <h4 class="font-bold text-white text-base mb-3">الأوامر</h4>

                            <!-- Command 1: applications pending -->
                            <div class="bg-[#0b0c10] border border-purple-950/30 p-4 rounded-xl flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <button type="button" class="w-7 h-7 rounded-lg bg-purple-950/40 text-gray-400 hover:text-white flex items-center justify-center text-xs">✏️</button>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <div class="font-mono font-bold text-white text-xs">applications pending</div>
                                        <p class="text-gray-400 text-[11px] mt-0.5">عرض التقديمات قيد الانتظار</p>
                                    </div>
                                    <div class="w-6 h-6 rounded-md bg-purple-950/60 text-purple-300 flex items-center justify-center text-xs font-mono font-bold">&gt;_</div>
                                </div>
                            </div>

                            <!-- Command 2: applications points list -->
                            <div class="bg-[#0b0c10] border border-purple-950/30 p-4 rounded-xl flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <button type="button" class="w-7 h-7 rounded-lg bg-purple-950/40 text-gray-400 hover:text-white flex items-center justify-center text-xs">✏️</button>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <div class="font-mono font-bold text-white text-xs">applications points list</div>
                                        <p class="text-gray-400 text-[11px] mt-0.5">عرض نقاط التقديمات الخاصة بك أو الخاصة بعضو آخر</p>
                                    </div>
                                    <div class="w-6 h-6 rounded-md bg-purple-950/60 text-purple-300 flex items-center justify-center text-xs font-mono font-bold">&gt;_</div>
                                </div>
                            </div>

                            <!-- Command 3: applications points reset -->
                            <div class="bg-[#0b0c10] border border-purple-950/30 p-4 rounded-xl flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <button type="button" class="w-7 h-7 rounded-lg bg-purple-950/40 text-gray-400 hover:text-white flex items-center justify-center text-xs">✏️</button>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <div class="font-mono font-bold text-white text-xs">applications points reset_user|reset_server</div>
                                        <p class="text-gray-400 text-[11px] mt-0.5">إعادة تعيين نقاط التقديمات لسيرفر أو لعضو</p>
                                    </div>
                                    <div class="w-6 h-6 rounded-md bg-purple-950/60 text-purple-300 flex items-center justify-center text-xs font-mono font-bold">&gt;_</div>
                                </div>
                            </div>

                            <!-- Command 4: applications points set -->
                            <div class="bg-[#0b0c10] border border-purple-950/30 p-4 rounded-xl flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <button type="button" class="w-7 h-7 rounded-lg bg-purple-950/40 text-gray-400 hover:text-white flex items-center justify-center text-xs">✏️</button>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <div class="font-mono font-bold text-white text-xs">applications points set</div>
                                        <p class="text-gray-400 text-[11px] mt-0.5">تعيين نقاط التقديمات لعضو</p>
                                    </div>
                                    <div class="w-6 h-6 rounded-md bg-purple-950/60 text-purple-300 flex items-center justify-center text-xs font-mono font-bold">&gt;_</div>
                                </div>
                            </div>
                        </div>

                        <!-- Section 3: منشئ الرسالة الواحدة (Single Message Panel Deployer) -->
                        <div class="bg-[#12131c] border border-purple-950/40 rounded-2xl p-6 shadow-xl space-y-5 text-right">
                            <div>
                                <h4 class="font-bold text-white text-base">منشئ الرسالة الواحدة</h4>
                                <p class="text-gray-400 text-xs mt-0.5">أنشئ وأرسل رسالة واحدة تتضمن جميع التقديمات لسهولة عرضها.</p>
                            </div>

                            <!-- Discord Message Preview Box -->
                            <div class="bg-[#0b0c10] border border-purple-950/40 rounded-2xl p-4 space-y-3">
                                <div class="flex items-center justify-between text-gray-400 text-[11px]">
                                    <div class="flex items-center gap-2">
                                        <img src="/logo.png" class="w-6 h-6 rounded-full object-cover">
                                        <span class="font-bold text-white text-xs">ZENO</span>
                                        <span class="px-1.5 py-0.2 bg-purple-600 text-white rounded text-[9px] font-bold">APP</span>
                                        <span class="text-[10px]">Today at 08:23</span>
                                    </div>
                                    <span id="charCounter" class="font-mono text-gray-500">17/2000</span>
                                </div>

                                <textarea id="panelMessageText" oninput="updateCharCount(this)" rows="2" placeholder="Your message here..." class="w-full bg-transparent border-none text-xs text-gray-200 outline-none resize-none leading-relaxed">يرجى الضغط على الزر أدناه أو اختيار الاستمارة المناسبة للتقديم:</textarea>
                            </div>

                            <!-- Panel Options & Deploy Settings -->
                            <div class="space-y-4">
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                                    <div class="flex items-center gap-2 justify-end">
                                        <span class="text-xs text-gray-400 font-bold">نوع العرض:</span>
                                        <div class="flex items-center bg-[#0b0c10] border border-purple-950/40 p-1 rounded-xl gap-1">
                                            <button type="button" onclick="setPanelType('buttons')" id="btnTypeButtons" class="px-3 py-1 rounded-lg text-xs font-bold bg-purple-600 text-white transition">ضغطة زر</button>
                                            <button type="button" onclick="setPanelType('select')" id="btnTypeSelect" class="px-3 py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition">قائمة الاختيار</button>
                                        </div>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1.5 text-right">القناة المستهدفة لنشر اللوحة:</label>
                                        ${renderChannelSelect('panelDeployChannel', '')}
                                    </div>
                                </div>

                                <div class="flex justify-end pt-2">
                                    <button type="button" onclick="sendApplicationPanelDirect()" id="sendAppPanelBtn" class="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2">
                                        <span>إرسال اللوحة ➔</span>
                                    </button>
                                </div>
                                <div id="panelSendStatus" class="text-xs font-bold text-center hidden py-2 px-4 rounded-xl border"></div>
                            </div>
                        </div>
                    </div>

                    <script>
                    let currentPanelType = 'buttons';

                    function toggleCreateAppForm() {
                        const modal = document.getElementById('createAppModal');
                        modal.classList.toggle('hidden');
                    }

                    function updateCharCount(el) {
                        const counter = document.getElementById('charCounter');
                        counter.innerText = el.value.length + '/2000';
                    }

                    function setPanelType(type) {
                        currentPanelType = type;
                        const btnButtons = document.getElementById('btnTypeButtons');
                        const btnSelect = document.getElementById('btnTypeSelect');
                        if (type === 'buttons') {
                            btnButtons.className = 'px-3 py-1 rounded-lg text-xs font-bold bg-purple-600 text-white transition';
                            btnSelect.className = 'px-3 py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition';
                        } else {
                            btnSelect.className = 'px-3 py-1 rounded-lg text-xs font-bold bg-purple-600 text-white transition';
                            btnButtons.className = 'px-3 py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition';
                        }
                    }

                    async function submitCreateApp() {
                        const title = document.getElementById('newAppTitle').value.trim();
                        const description = document.getElementById('newAppDesc').value.trim();
                        const log_channel = document.getElementById('newAppLogChan').value.trim();
                        const accepted_role = document.getElementById('newAppRole').value.trim();
                        const questionsRaw = document.getElementById('newAppQuestions').value.trim();

                        if (!title) {
                            alert('يرجى كتابة عنوان التقديم أولاً!');
                            return;
                        }

                        const questions = questionsRaw.split('\\n').filter(q => q.trim().length > 0);

                        try {
                            const res = await fetch('/api/guild/${guildId}/applications/create', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ title, description, log_channel, accepted_role, questions })
                            });
                            const data = await res.json();
                            if (data.success) {
                                location.reload();
                            } else {
                                alert('خطأ: ' + (data.error || 'فشل حفظ الاستمارة'));
                            }
                        } catch(e) {
                            alert('حدث خطأ أثناء الاتصال بالخادم');
                        }
                    }

                    async function deleteAppForm(id) {
                        if (!confirm('هل أنت متأكد من رغبتك في حذف هذا التقديم؟')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/applications/delete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id })
                            });
                            const data = await res.json();
                            if (data.success) {
                                location.reload();
                            }
                        } catch(e) {
                            alert('خطأ أثناء الحذف');
                        }
                    }

                    async function sendApplicationPanelDirect() {
                        const channelId = document.getElementById('panelDeployChannel').value.trim();
                        const messageText = document.getElementById('panelMessageText').value.trim();
                        const statusEl = document.getElementById('panelSendStatus');
                        const btn = document.getElementById('sendAppPanelBtn');

                        if (!channelId) {
                            alert('يرجى كتابة ID القناة المستهدفة أولاً!');
                            return;
                        }

                        btn.disabled = true;
                        btn.innerHTML = '⏳ جارٍ الإرسال...';
                        statusEl.className = 'text-xs font-bold text-center text-purple-400 mt-2 block bg-purple-950/30 border border-purple-800/40 py-2 px-4 rounded-xl';
                        statusEl.innerText = 'جارٍ نشر لوحة التقديمات في ديسكورد...';

                        try {
                            const res = await fetch('/api/guild/${guildId}/applications/send-panel', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    channelId,
                                    messageText,
                                    panelType: currentPanelType,
                                    embedTitle: '📝 استمارات التقديم المتاحة',
                                    embedDescription: 'اضغط على الزر أدناه أو اختر التقديم المناسب لتعبئة الاستمارة:'
                                })
                            });
                            const data = await res.json();
                            if (data.success) {
                                statusEl.className = 'text-xs font-bold text-center text-emerald-400 mt-2 block bg-emerald-950/40 border border-emerald-800 py-2 px-4 rounded-xl';
                                statusEl.innerText = '✅ تم نشر لوحة التقديمات بنجاح في القناة المحددة!';
                            } else {
                                statusEl.className = 'text-xs font-bold text-center text-rose-400 mt-2 block bg-rose-950/40 border border-rose-800 py-2 px-4 rounded-xl';
                                statusEl.innerText = '❌ خطأ: ' + (data.error || 'فشل النشر، تأكد من وجود استمارات وصلاحيات البوت');
                            }
                        } catch(e) {
                            statusEl.className = 'text-xs font-bold text-center text-rose-400 mt-2 block bg-rose-950/40 border border-rose-800 py-2 px-4 rounded-xl';
                            statusEl.innerText = '❌ حدث خطأ أثناء الاتصال بالخادم';
                        } finally {
                            btn.disabled = false;
                            btn.innerHTML = '<span>إرسال اللوحة ➔</span>';
                        }
                    }
                    </script>
                `;
            } else if (section === 'appearance' || section === 'bot-appearance') {
                const botGuild = client.guilds.cache.get(guildId);
                const botMember = botGuild?.members?.me;
                const botNameVal = settings.bot_nickname || botMember?.nickname || client.user?.username || 'ZENO';
                const botAvatarVal = settings.bot_avatar_url || client.user?.displayAvatarURL() || '';
                const botBannerVal = settings.bot_banner_url || '';
                const botStatusVal = settings.bot_status || 'online';
                const botActTypeVal = settings.bot_activity_type || 'playing';
                const botActTextVal = settings.bot_activity_text || 'ZENO Bot | #help';

                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- Top Header -->
                        <div class="text-right">
                            <h2 class="text-2xl font-black text-white">مظهر البوت</h2>
                            <p class="text-gray-400 text-xs mt-1">يعرض ويخصص ملف تعريف البوت، بما في ذلك المعلومات مثل الحالة والصورة الرمزية والتفاصيل المخصصة الأخرى.</p>
                        </div>

                        <!-- Appearance Card (Free & Unlocked) -->
                        <div class="bg-[#12131c] border border-purple-950/40 rounded-3xl p-7 shadow-2xl space-y-6 text-right relative overflow-hidden">
                            <!-- Header with Golden Crown -->
                            <div class="flex items-center justify-between border-b border-purple-950/40 pb-4">
                                <span class="px-3 py-1 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md">
                                    <span>✨ ميزة مجانية للجميع</span>
                                </span>
                                <div class="flex items-center gap-2">
                                    <h4 class="font-bold text-white text-base">مظهر</h4>
                                    <span class="text-amber-400 text-lg">👑</span>
                                </div>
                            </div>

                            <!-- Avatar & Banner Visual Boxes -->
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                                <!-- Banner Box -->
                                <div class="space-y-2">
                                    <label class="block text-xs font-bold text-gray-400">خلفية (Banner)</label>
                                    <div class="h-32 rounded-2xl bg-[#0b0c10] border-2 border-dashed border-purple-950/60 hover:border-purple-600/50 flex flex-col items-center justify-center relative overflow-hidden transition group">
                                        <div id="bannerPreview" class="absolute inset-0 bg-cover bg-center ${botBannerVal ? '' : 'hidden'}" style="background-image: url('${botBannerVal}');"></div>
                                        <div class="flex flex-col items-center gap-1 z-10 text-gray-500 group-hover:text-purple-300">
                                            <span class="text-2xl">🖼️</span>
                                            <span class="text-[10px] font-bold">ضع رابط الخلفية بالأسفل</span>
                                        </div>
                                    </div>
                                    <input type="text" id="botBannerInput" oninput="updateBannerPreview(this.value)" value="${botBannerVal}" placeholder="رابط صورة الخلفية (URL)..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>

                                <!-- Avatar Box -->
                                <div class="space-y-2 flex flex-col items-end">
                                    <label class="block text-xs font-bold text-gray-400">الصورة الرمزية (Avatar)</label>
                                    <div class="w-28 h-28 rounded-full bg-[#0b0c10] border-2 border-purple-600/60 shadow-xl shadow-purple-900/30 overflow-hidden flex items-center justify-center relative group">
                                        <img id="avatarPreview" src="${botAvatarVal}" class="w-full h-full object-cover">
                                    </div>
                                    <input type="text" id="botAvatarInput" oninput="updateAvatarPreview(this.value)" value="${botAvatarVal}" placeholder="رابط الصورة الرمزية (URL)..." class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right mt-1">
                                </div>
                            </div>

                            <!-- Bot Name with 0/32 character counter -->
                            <div class="space-y-1.5 pt-2">
                                <div class="flex items-center justify-between text-xs">
                                    <span id="botNameCharCount" class="font-mono text-gray-500">${botNameVal.length}/32</span>
                                    <label class="font-bold text-gray-300">أسم البوت في السيرفر (Bot Nickname)</label>
                                </div>
                                <input type="text" id="botNameInput" maxlength="32" oninput="updateBotNameCount(this)" value="${botNameVal}" placeholder="Nova Bot / ZENO" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-bold">
                            </div>

                            <!-- Bot Status Dropdown -->
                            <div class="space-y-1.5">
                                <label class="block text-xs font-bold text-gray-300">الحالة (Presence Status)</label>
                                <select id="botStatusSelect" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer">
                                    <option value="online" ${botStatusVal === 'online' ? 'selected' : ''}>🟢 متصل (Online)</option>
                                    <option value="idle" ${botStatusVal === 'idle' ? 'selected' : ''}>🟡 خامل (Idle)</option>
                                    <option value="dnd" ${botStatusVal === 'dnd' ? 'selected' : ''}>🔴 عدم الإزعاج (Do Not Disturb)</option>
                                    <option value="invisible" ${botStatusVal === 'invisible' ? 'selected' : ''}>⚪ غير متصل (Invisible)</option>
                                </select>
                            </div>

                            <!-- Activity Type Dropdown -->
                            <div class="space-y-1.5">
                                <label class="block text-xs font-bold text-gray-300">نوع النشاط (Activity Type)</label>
                                <select id="botActTypeSelect" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer">
                                    <option value="playing" ${botActTypeVal === 'playing' ? 'selected' : ''}>🎮 يلعب (Playing)</option>
                                    <option value="watching" ${botActTypeVal === 'watching' ? 'selected' : ''}>📺 يشاهد (Watching)</option>
                                    <option value="listening" ${botActTypeVal === 'listening' ? 'selected' : ''}>🎧 يستمع إلى (Listening)</option>
                                    <option value="streaming" ${botActTypeVal === 'streaming' ? 'selected' : ''}>📡 يبث مباشر (Streaming)</option>
                                    <option value="competing" ${botActTypeVal === 'competing' ? 'selected' : ''}>🏆 ينافس في (Competing)</option>
                                </select>
                            </div>

                            <!-- Activity Status Text -->
                            <div class="space-y-1.5">
                                <label class="block text-xs font-bold text-gray-300">نص النشاط المخصص (Activity Text)</label>
                                <input type="text" id="botActTextInput" value="${botActTextVal}" placeholder="ZENO Bot | #help | حماية وسيرفرات" class="w-full bg-[#0b0c10] border border-purple-950/40 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">
                            </div>

                            <!-- Save Button (Green Button matching image) -->
                            <div class="pt-4 border-t border-purple-950/40 flex items-center justify-between">
                                <div id="appearanceSaveStatus" class="text-xs font-bold hidden"></div>
                                <button type="button" onclick="saveAppearanceDirect()" id="saveAppearanceBtn" class="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-emerald-950/50 flex items-center gap-2">
                                    <span>حفظ</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <script>
                    function updateBotNameCount(el) {
                        document.getElementById('botNameCharCount').innerText = el.value.length + '/32';
                    }

                    function updateAvatarPreview(url) {
                        if (url && url.startsWith('http')) {
                            document.getElementById('avatarPreview').src = url;
                        }
                    }

                    function updateBannerPreview(url) {
                        const preview = document.getElementById('bannerPreview');
                        if (url && url.startsWith('http')) {
                            preview.style.backgroundImage = 'url(' + url + ')';
                            preview.classList.remove('hidden');
                        } else {
                            preview.classList.add('hidden');
                        }
                    }

                    async function saveAppearanceDirect() {
                        const bot_name = document.getElementById('botNameInput').value.trim();
                        const bot_status = document.getElementById('botStatusSelect').value;
                        const bot_activity_type = document.getElementById('botActTypeSelect').value;
                        const bot_activity_text = document.getElementById('botActTextInput').value.trim();
                        const bot_avatar_url = document.getElementById('botAvatarInput').value.trim();
                        const bot_banner_url = document.getElementById('botBannerInput').value.trim();

                        const btn = document.getElementById('saveAppearanceBtn');
                        const statusEl = document.getElementById('appearanceSaveStatus');

                        btn.disabled = true;
                        btn.innerHTML = '⏳ جارٍ الحفظ...';

                        try {
                            const res = await fetch('/api/guild/${guildId}/appearance/save', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    bot_name,
                                    bot_status,
                                    bot_activity_type,
                                    bot_activity_text,
                                    bot_avatar_url,
                                    bot_banner_url
                                })
                            });
                            const data = await res.json();
                            if (data.success) {
                                statusEl.className = 'text-xs font-bold text-emerald-400 block';
                                statusEl.innerText = '✅ تم تطبيق وحفظ مظهر البوت بنجاح في السيرفر!';
                            } else {
                                statusEl.className = 'text-xs font-bold text-rose-400 block';
                                statusEl.innerText = '❌ خطأ: ' + (data.error || 'فشل حفظ الإعدادات');
                            }
                        } catch(e) {
                            statusEl.className = 'text-xs font-bold text-rose-400 block';
                            statusEl.innerText = '❌ حدث خطأ أثناء الاتصال بالخادم';
                        } finally {
                            btn.disabled = false;
                            btn.innerHTML = '<span>حفظ</span>';
                        }
                    }
                    </script>
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
                <script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>
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
                        <img src="/logo.png" class="w-8 h-8 rounded-xl object-cover border border-purple-500/40 shadow-lg shadow-purple-900/50" alt="ZENO">
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
                        <a href="/dashboard" title="${user.username}" class="group relative flex items-center justify-center">
                            <img src="${userAvatar}" class="w-11 h-11 rounded-2xl border-2 border-purple-500 shadow-lg shadow-purple-900/50 hover:rounded-xl object-cover transition-all" alt="${user.username}">
                        </a>
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

    // ========================================================
    // User APIs (Daily Reward, Store Purchases & Equips)
    // ========================================================
    app.post('/api/user/claim-daily', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'يجب تسجيل الدخول أولاً' });
            const userId = req.session.user.id;
            
            const userRow = rawDb.prepare('SELECT MAX(last_daily) as last_daily, SUM(coins) as coins FROM users WHERE user_id = ?').get(userId);
            const now = Date.now();
            const dailyCooldown = 24 * 60 * 60 * 1000;
            const lastDaily = userRow?.last_daily || 0;

            if (now - lastDaily < dailyCooldown) {
                const timeLeft = dailyCooldown - (now - lastDaily);
                const h = Math.floor(timeLeft / (1000 * 60 * 60));
                const m = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                return res.status(400).json({ 
                    success: false, 
                    error: `لقد استلمت مكافأتك اليومية مسبقاً! يتبقى ${h} ساعة و ${m} دقيقة` 
                });
            }

            const reward = 500;
            const existingCount = rawDb.prepare('SELECT COUNT(*) as count FROM users WHERE user_id = ?').get(userId)?.count || 0;
            if (existingCount === 0) {
                rawDb.prepare('INSERT INTO users (user_id, guild_id, coins, last_daily) VALUES (?, ?, ?, ?)').run(userId, 'global', reward, now);
            } else {
                rawDb.prepare('UPDATE users SET coins = coins + ?, last_daily = ? WHERE user_id = ?').run(reward, now, userId);
            }

            const updated = rawDb.prepare('SELECT SUM(coins) as coins FROM users WHERE user_id = ?').get(userId);
            return res.json({
                success: true,
                message: `تم استلام مكافأتك اليومية بنجاح (+${reward} ⭐)!`,
                newCoins: updated?.coins || reward
            });
        } catch (err) {
            console.error('Error claiming daily:', err);
            return res.status(500).json({ success: false, error: 'حدث خطأ في السيرفر أثناء الاستلام' });
        }
    });

    app.post('/api/user/buy-item', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'يجب تسجيل الدخول أولاً' });
            const userId = req.session.user.id;
            const { type, name, price } = req.body;
            const cost = parseInt(price) || 0;

            const userRow = rawDb.prepare('SELECT SUM(coins) as coins FROM users WHERE user_id = ?').get(userId);
            const userCoins = userRow?.coins || 0;

            if (userCoins < cost) {
                return res.status(400).json({
                    success: false,
                    error: `عذراً، رصيدك غير كافٍ! تحتاج إلى ${cost.toLocaleString()} ⭐ بينما رصيدك الحالي ${userCoins.toLocaleString()} ⭐`
                });
            }

            // Deduct coins & equip item
            if (type === 'wallpaper') {
                rawDb.prepare('UPDATE users SET coins = MAX(0, coins - ?), wallpaper = ? WHERE user_id = ?').run(cost, name, userId);
            } else {
                rawDb.prepare('UPDATE users SET coins = MAX(0, coins - ?) WHERE user_id = ?').run(cost, userId);
            }

            const updated = rawDb.prepare('SELECT SUM(coins) as coins FROM users WHERE user_id = ?').get(userId);
            return res.json({
                success: true,
                message: `تم شراء وتجهيز "${name}" بنجاح!`,
                newCoins: updated?.coins || 0
            });
        } catch (err) {
            console.error('Error buying item:', err);
            return res.status(500).json({ success: false, error: 'حدث خطأ أثناء تنفيذ الشراء' });
        }
    });

};