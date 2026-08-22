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
                    :root {
                        --bg-main: #0b0d14;
                        --bg-sidebar: #10121b;
                        --bg-card: #151722;
                        --bg-card-hover: #1c1f2e;
                        --primary: #5865f2;
                        --primary-hover: #4752c4;
                        --border: rgba(255, 255, 255, 0.05);
                        --text-muted: #a3a6aa;
                    }
                    body { background-color: var(--bg-main) !important; color: #ffffff !important; font-family: 'Cairo', sans-serif !important; }
                    /* Scrollbar */
                    ::-webkit-scrollbar { width: 8px; height: 8px; }
                    ::-webkit-scrollbar-track { background: var(--bg-main); }
                    ::-webkit-scrollbar-thumb { background: #2f3146; border-radius: 10px; }
                    ::-webkit-scrollbar-thumb:hover { background: #40445f; }
                    
                    /* Glassmorphism & Cards */
                    .probot-card {
                        background: var(--bg-card) !important;
                        border: 1px solid var(--border) !important;
                        border-radius: 16px !important;
                        transition: all 0.3s ease !important;
                        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2) !important;
                    }
                    .probot-card:hover {
                        background: var(--bg-card-hover) !important;
                        border-color: rgba(88, 101, 242, 0.4) !important;
                        transform: translateY(-3px) !important;
                        box-shadow: 0 6px 25px rgba(0, 0, 0, 0.3) !important;
                    }
                    
                    /* Toggles */
                    .toggle { position: relative; display: inline-block; width: 44px; height: 24px; }
                    .toggle input { opacity: 0; width: 0; height: 0; }
                    .slider { position: absolute; cursor: pointer; inset: 0; background: #2f3146; border-radius: 24px; transition: .3s; }
                    .slider:before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .3s; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                    input:checked + .slider { background: var(--primary); }
                    input:checked + .slider:before { transform: translateX(20px); }
                    
                    /* Buttons */
                    .btn-primary {
                        background-color: var(--primary);
                        color: white;
                        transition: all 0.2s;
                    }
                    .btn-primary:hover {
                        background-color: var(--primary-hover);
                        box-shadow: 0 4px 15px rgba(88, 101, 242, 0.4);
                    }
                </style>

            </head>
            <body class="min-h-screen flex flex-col bg-[#0b0d14] text-gray-200 relative overflow-x-hidden selection:bg-purple-600 selection:text-white">

                <!-- Ambient Purple Glows & Black Mesh -->
                <div class="fixed inset-0 pointer-events-none z-0">
                    <div class="absolute -top-40 right-1/4 w-[600px] h-[600px] bg-[#5865f2]/10 rounded-full blur-[140px]"></div>
                    <div class="absolute top-1/3 -left-40 w-[500px] h-[500px] bg-[#4752c4]/10 rounded-full blur-[130px]"></div>
                    <div class="absolute -bottom-40 right-1/3 w-[600px] h-[600px] bg-[#5865f2]/5 rounded-full blur-[150px]"></div>
                </div>

                <!-- Header -->
                <header class="h-20 bg-[#10121b]/90 backdrop-blur-md border-b border-white/5 px-8 flex items-center justify-between sticky top-0 z-50">
                    <!-- Left: Profile or Login -->
                    <div class="flex items-center gap-5">
                        ${user ? `
                            <a href="/dashboard" class="flex items-center gap-2.5 px-4 py-2 bg-gradient-to-r from-[#5865f2] to-[#4752c4] hover:from-[#4752c4] hover:to-[#3b45a6] text-white text-xs font-black rounded-xl transition shadow-lg shadow-black/20">
                                <img src="${user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-5 h-5 rounded-full">
                                <span>لوحة التحكم</span>
                            </a>
                        ` : `
                            <a href="/auth/discord" class="px-5 py-2 bg-gradient-to-r from-[#5865f2] to-[#4752c4] hover:from-[#4752c4] hover:to-[#3b45a6] text-white text-xs font-black rounded-xl transition shadow-lg shadow-black/20">
                                تسجيل الدخول
                            </a>
                        `}
                        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="text-gray-400 hover:text-gray-200 text-xs font-bold transition">الدعم الفني</a>
                        <a href="#commands" class="text-gray-400 hover:text-gray-200 text-xs font-bold transition">الأوامر</a>
                    </div>

                    <!-- Center: Navigation Links (المميزات / المصادر) -->
                    <nav class="hidden md:flex items-center gap-8 text-xs font-bold text-gray-300">
                        <div class="relative group cursor-pointer">
                            <span class="hover:text-gray-200 flex items-center gap-1">المميزات <svg class="w-3.5 h-3.5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></span>
                            <div class="absolute top-full right-0 mt-2 w-48 bg-[#1c1f2e] border border-white/5 rounded-xl shadow-2xl p-2 hidden group-hover:block text-right backdrop-blur-lg">
                                <a href="/dashboard" class="block px-3 py-2 text-xs hover:bg-[#151722] hover:text-gray-200 rounded-lg transition">🛡️ الحماية و Anti-Nuke</a>
                                <a href="/dashboard" class="block px-3 py-2 text-xs hover:bg-[#151722] hover:text-gray-200 rounded-lg transition">💰 نظام الاقتصاد والبنك</a>
                                <a href="/dashboard" class="block px-3 py-2 text-xs hover:bg-[#151722] hover:text-gray-200 rounded-lg transition">🎮 الألعاب التفاعلية</a>
                                <a href="/dashboard" class="block px-3 py-2 text-xs hover:bg-[#151722] hover:text-gray-200 rounded-lg transition">🎫 نظام التذاكر</a>
                            </div>
                        </div>
                        <div class="relative group cursor-pointer">
                            <span class="hover:text-gray-200 flex items-center gap-1">المصادر <svg class="w-3.5 h-3.5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></span>
                            <div class="absolute top-full right-0 mt-2 w-48 bg-[#1c1f2e] border border-white/5 rounded-xl shadow-2xl p-2 hidden group-hover:block text-right backdrop-blur-lg">
                                <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="block px-3 py-2 text-xs hover:bg-[#151722] hover:text-gray-200 rounded-lg transition">سيرفر الدعم الفني</a>
                                <a href="/dashboard" class="block px-3 py-2 text-xs hover:bg-[#151722] hover:text-gray-200 rounded-lg transition">سجل التحديثات</a>
                            </div>
                        </div>
                    </nav>

                    <!-- Right: Logo -->
                    <div class="flex items-center gap-3">
                        <span class="font-black text-xl tracking-wider text-white">ZENO</span>
                        <img src="/logo.png" class="w-9 h-9 rounded-xl object-cover border border-purple-500/40 shadow-lg shadow-black/40" alt="ZENO">
                    </div>
                </header>

                <!-- Hero Section ProBot Exact with Deep Black & Purple -->
                <main class="flex-1 flex flex-col items-center justify-center text-center px-4 py-20 max-w-4xl mx-auto z-10">
                    
                    <span class="px-4 py-1.5 bg-purple-950/60 border border-purple-800/40 text-gray-200 text-xs font-bold rounded-full mb-8 backdrop-blur-sm shadow-inner">
                        ✨ جديد: نظام التذاكر والحماية 100% مجاني بدون قيود
                    </span>

                    <h1 class="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-gray-100 to-purple-200 leading-tight mb-6 tracking-tight drop-shadow-sm">
                        اصنع خادم ديسكورد<br><span class="text-transparent bg-clip-text bg-gradient-to-r from-[#5865f2] via-[#8b5cf6] to-[#4752c4]">احترافي!</span>
                    </h1>

                    <p class="text-gray-400 text-sm md:text-base max-w-2xl mb-10 leading-relaxed font-medium">
                        بوت متعدد الأغراض قابل للتخصيص الكامل يوفر لك بطاقات الترحيب، حماية ضد التخريب، أوامر الإشراف، الألعاب، واقتصاد وبنك متكامل.
                    </p>

                    <!-- Buttons with smaller size for Add Bot -->
                    <div class="flex flex-wrap gap-4 items-center justify-center">
                        <a href="/auth/discord" class="py-2.5 px-6 bg-gradient-to-r from-[#5865f2] to-[#4752c4] hover:from-[#4752c4] hover:to-[#3b45a6] text-white text-xs font-bold rounded-xl transition shadow-lg shadow-black/20 flex items-center gap-2">
                            <span>إضافة البوت في Discord</span>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                        </a>
                        <a href="/dashboard" class="py-2.5 px-6 bg-[#13141d]/90 hover:bg-[#1a1c29] text-gray-200 text-xs font-bold rounded-xl border border-white/5 transition shadow-md hover:text-white">
                            لوحة التحكم
                        </a>
                    </div>

                    <!-- Live Stats Cards with Black/Purple borders -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mt-16 text-center">
                        <div class="bg-[#101118]/80 border border-white/5 hover:border-[#5865f2]/40 p-5 rounded-2xl shadow-xl backdrop-blur-sm transition">
                            <p class="text-2xl font-black text-white">${stats.guilds}</p>
                            <p class="text-gray-400 text-[11px] font-bold mt-1.5">سيرفرات نشطة</p>
                        </div>
                        <div class="bg-[#101118]/80 border border-white/5 hover:border-[#5865f2]/40 p-5 rounded-2xl shadow-xl backdrop-blur-sm transition">
                            <p class="text-2xl font-black text-white">${stats.users}</p>
                            <p class="text-gray-400 text-[11px] font-bold mt-1.5">أعضاء يخدمهم</p>
                        </div>
                        <div class="bg-[#101118]/80 border border-white/5 hover:border-[#5865f2]/40 p-5 rounded-2xl shadow-xl backdrop-blur-sm transition">
                            <p class="text-2xl font-black text-emerald-400">${stats.ping}ms</p>
                            <p class="text-gray-400 text-[11px] font-bold mt-1.5">استجابة البث الحية</p>
                        </div>
                        <div class="bg-[#101118]/80 border border-white/5 hover:border-[#5865f2]/40 p-5 rounded-2xl shadow-xl backdrop-blur-sm transition">
                            <p class="text-2xl font-black text-[#5865f2]">100%</p>
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

            // التحقق من حالة المكافأة اليومية (Global 24H Cooldown)
            const now = Date.now();
            const dailyCooldown = 24 * 60 * 60 * 1000;
            const timePassed = now - userLastDaily;
            const canClaimDaily = timePassed >= dailyCooldown;
            const unlockTimestamp = userLastDaily + dailyCooldown;
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
                    <div class="bg-[#1c1f2e] border ${borderClass} p-4 rounded-2xl flex items-center justify-between transition ${isMe ? 'ring-1 ring-purple-500' : ''}">
                        <div class="flex items-center gap-4">
                            <span class="text-xs font-mono font-bold text-gray-200">Level ${item.max_level || 1} • ${(item.total_xp || 0).toLocaleString()} XP</span>
                            <span class="text-xs font-mono text-amber-400 font-bold hidden sm:inline">${(item.total_coins || 0).toLocaleString()} ⭐</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <div class="text-right">
                                <h4 class="text-xs font-bold text-white">${displayName}</h4>
                                <p class="text-[10px] text-[#5865f2] font-mono">الترتيب: #${rank}</p>
                            </div>
                            <img src="${avatarUrl}" class="w-9 h-9 rounded-xl object-cover border border-white/5">
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
                    <div class="bg-[#1c1f2e] border ${borderClass} p-4 rounded-2xl flex items-center justify-between transition ${isMe ? 'ring-1 ring-purple-500' : ''}">
                        <div class="flex items-center gap-4">
                            <span class="text-xs font-mono font-bold text-amber-400">${(item.total_coins || 0).toLocaleString()} ⭐ Star</span>
                            <span class="text-xs font-mono text-gray-400 font-bold hidden sm:inline">Level ${item.max_level || 1}</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <div class="text-right">
                                <h4 class="text-xs font-bold text-white">${displayName}</h4>
                                <p class="text-[10px] text-amber-400 font-mono">الترتيب: #${rank}</p>
                            </div>
                            <img src="${avatarUrl}" class="w-9 h-9 rounded-xl object-cover border border-white/5">
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
                    :root {
                        --bg-main: #0b0d14;
                        --bg-sidebar: #10121b;
                        --bg-card: #151722;
                        --bg-card-hover: #1c1f2e;
                        --primary: #5865f2;
                        --primary-hover: #4752c4;
                        --border: rgba(255, 255, 255, 0.05);
                        --text-muted: #a3a6aa;
                    }
                    body { background-color: var(--bg-main) !important; color: #ffffff !important; font-family: 'Cairo', sans-serif !important; }
                    /* Scrollbar */
                    ::-webkit-scrollbar { width: 8px; height: 8px; }
                    ::-webkit-scrollbar-track { background: var(--bg-main); }
                    ::-webkit-scrollbar-thumb { background: #2f3146; border-radius: 10px; }
                    ::-webkit-scrollbar-thumb:hover { background: #40445f; }
                    
                    /* Glassmorphism & Cards */
                    .probot-card {
                        background: var(--bg-card) !important;
                        border: 1px solid var(--border) !important;
                        border-radius: 16px !important;
                        transition: all 0.3s ease !important;
                        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2) !important;
                    }
                    .probot-card:hover {
                        background: var(--bg-card-hover) !important;
                        border-color: rgba(88, 101, 242, 0.4) !important;
                        transform: translateY(-3px) !important;
                        box-shadow: 0 6px 25px rgba(0, 0, 0, 0.3) !important;
                    }
                    
                    /* Toggles */
                    .toggle { position: relative; display: inline-block; width: 44px; height: 24px; }
                    .toggle input { opacity: 0; width: 0; height: 0; }
                    .slider { position: absolute; cursor: pointer; inset: 0; background: #2f3146; border-radius: 24px; transition: .3s; }
                    .slider:before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .3s; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                    input:checked + .slider { background: var(--primary); }
                    input:checked + .slider:before { transform: translateX(20px); }
                    
                    /* Buttons */
                    .btn-primary {
                        background-color: var(--primary);
                        color: white;
                        transition: all 0.2s;
                    }
                    .btn-primary:hover {
                        background-color: var(--primary-hover);
                        box-shadow: 0 4px 15px rgba(88, 101, 242, 0.4);
                    }
                </style>

            </head>
            <body class="min-h-screen flex flex-col bg-[#0b0d14] text-gray-200">

                <!-- Toast Notification Container -->
                <div id="toast" class="fixed top-5 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 transform -translate-y-20 opacity-0 pointer-events-none px-6 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-2"></div>

                <!-- Header -->
                <header class="h-16 bg-[#10121b]/95 backdrop-blur-md border-b border-white/5 px-6 flex items-center justify-between sticky top-0 z-40">
                    <div class="flex items-center gap-4">
                        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="text-xs text-gray-400 hover:text-gray-200 transition">الدعم الفني</a>
                        <span class="text-gray-700">|</span>
                        <a href="/#commands" class="text-xs text-gray-400 hover:text-gray-200 transition">الأوامر</a>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-black text-sm text-white tracking-wide">ZENO</span>
                        <img src="/logo.png" class="w-8 h-8 rounded-xl object-cover border border-purple-500/40 shadow-lg shadow-black/40" alt="ZENO">
                    </div>
                </header>

                <div class="flex-1 flex overflow-hidden">
                    
                    <!-- Main Content (Left in RTL - Novax User Dashboard Style) -->
                    <main class="flex-1 p-8 overflow-y-auto custom-scrollbar space-y-6">
                        
                        <!-- Tab 1: نظرة عامة والملف الشخصي (Novax Exact Style) -->
                        <div id="tabOverview" class="tab-content space-y-6">
                            
                            <!-- Header Title -->
                            <div class="flex items-center justify-end gap-2 text-white font-black text-lg">
                                <span>نظرة عامة</span>
                                <span class="text-purple-400">🎛️</span>
                            </div>

                            <!-- Top Stats 4-Grid (Novax Exact Order & Icons: الذهب / السمعة / التصنيف / المستوى) -->
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                
                                <!-- 1. الذهب (Golds / Stars) -->
                                <div class="bg-[#10121b] border border-white/5 hover:border-purple-500/30 rounded-2xl p-4 flex items-center justify-between shadow-lg transition">
                                    <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center text-xl font-bold shadow-inner">🪙</div>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-gray-400">الذهب</span>
                                        <h3 id="userCoinsDisplay" class="text-xl font-black text-white mt-0.5">${userCoins.toLocaleString()}</h3>
                                    </div>
                                </div>

                                <!-- 2. السمعة (Reputation) -->
                                <div class="bg-[#10121b] border border-white/5 hover:border-purple-500/30 rounded-2xl p-4 flex items-center justify-between shadow-lg transition">
                                    <div class="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center text-xl shadow-inner">👍</div>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-gray-400">السمعة</span>
                                        <h3 class="text-xl font-black text-white mt-0.5">${userStars}</h3>
                                    </div>
                                </div>

                                <!-- 3. التصنيف (Rank) -->
                                <div class="bg-[#10121b] border border-white/5 hover:border-purple-500/30 rounded-2xl p-4 flex items-center justify-between shadow-lg transition">
                                    <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xl shadow-inner">🏆</div>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-gray-400">التصنيف</span>
                                        <h3 class="text-xl font-black text-white mt-0.5">#${userRankXp}</h3>
                                    </div>
                                </div>

                                <!-- 4. المستوى (Level) -->
                                <div class="bg-[#10121b] border border-white/5 hover:border-purple-500/30 rounded-2xl p-4 flex items-center justify-between shadow-lg transition">
                                    <div class="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xl shadow-inner">📈</div>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-gray-400">المستوى</span>
                                        <h3 class="text-xl font-black text-white mt-0.5">${userLevel}</h3>
                                    </div>
                                </div>

                            </div>

                            <!-- خوادمك المتاحة للإدارة (Servers List) -->
                            <div class="bg-[#10121b] border border-white/5 rounded-3xl p-6 shadow-xl space-y-4">
                                <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                    <span class="text-xs text-purple-400 font-bold bg-purple-950/40 px-2.5 py-1 rounded-lg">${guilds.length} سيرفر</span>
                                    <h3 class="text-sm font-black text-white text-right flex items-center gap-2"><span>خوادمك المتاحة للإدارة</span><span>🛡️</span></h3>
                                </div>
                                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    ${guilds.map(g => `
                                        <a href="/dashboard/${g.id}" class="bg-[#151724] hover:bg-[#1c1f2e] border border-white/5 hover:border-purple-500/40 p-4 rounded-2xl flex items-center justify-between transition-all group shadow-md">
                                            <div class="w-8 h-8 rounded-xl bg-[#0b0d14] flex items-center justify-center text-gray-400 group-hover:text-purple-400 group-hover:translate-x-[-2px] transition">
                                                <svg class="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                                            </div>
                                            <div class="flex items-center gap-3 text-right">
                                                <div>
                                                    <h4 class="text-xs font-bold text-white group-hover:text-purple-300 transition truncate max-w-[140px]">${g.name}</h4>
                                                    <span class="text-[10px] text-gray-400">صلاحية إدارية</span>
                                                </div>
                                                <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-10 h-10 rounded-xl object-cover bg-[#090a10] border border-white/5 ring-1 ring-white/10 group-hover:ring-purple-500/40 transition">
                                            </div>
                                        </a>
                                    `).join('')}
                                </div>
                            </div>

                            <!-- آخر معاملات الذهب (Recent Gold Transactions - Novax Exact Style) -->
                            <div class="bg-[#10121b] border border-white/5 rounded-3xl p-6 shadow-xl space-y-4 text-right">
                                <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                    <span class="text-xs text-gray-400">سجل التحويلات والمكافآت</span>
                                    <h3 class="text-sm font-black text-white flex items-center gap-2"><span>آخر 5 معاملات الذهب</span><span>🪙</span></h3>
                                </div>

                                <div class="overflow-x-auto">
                                    <div class="bg-gradient-to-r from-emerald-950/30 via-[#151724] to-[#151724] border border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between shadow-lg">
                                        <div class="flex items-center gap-2 text-emerald-400 font-bold font-mono text-sm">
                                            <span>↗️ ${userCoins.toLocaleString()}</span>
                                            <span class="text-xs text-gray-400 font-normal">الرصيد</span>
                                        </div>
                                        <div class="text-emerald-400 font-mono font-bold text-sm">
                                            +500
                                            <span class="text-[10px] text-gray-400 block font-normal">المبلغ</span>
                                        </div>
                                        <div class="text-gray-300 text-xs text-center">
                                            <span>اليوم</span>
                                            <span class="text-[10px] text-gray-400 block">تاريخ</span>
                                        </div>
                                        <div class="flex items-center gap-2.5 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white leading-tight">المكافأة اليومية (Daily)</h5>
                                                <span class="text-[10px] text-gray-400 font-mono">ZENO Bot System</span>
                                            </div>
                                            <div class="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-sm font-bold border border-purple-500/30">🎁</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- قسم الملف الشخصي وبطاقة الهوية (Profile Card & Identity Card - Novax Exact Style) -->
                            <div class="space-y-4 text-right">
                                <h3 class="text-sm font-black text-white flex items-center justify-end gap-2"><span>الملف الشخصي</span><span>👤</span></h3>
                                
                                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    
                                    <!-- 1. الملف الشخصي (Main Profile Card) -->
                                    <div class="bg-[#10121b] border border-white/5 rounded-3xl p-5 shadow-xl space-y-4">
                                        <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                            <button onclick="switchTab('tabWallpapers')" class="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-bold transition flex items-center gap-1.5">
                                                <span>✏️</span>
                                                <span>تعديل البطاقة</span>
                                            </button>
                                            <h4 class="text-xs font-black text-white">الملف الشخصي</h4>
                                        </div>

                                        <!-- The Graphic Discord Card (Purple Nebula Design) -->
                                        <div class="relative rounded-2xl overflow-hidden bg-gradient-to-br from-purple-950 via-[#18112e] to-[#0d071a] border border-purple-500/30 p-5 shadow-2xl space-y-4">
                                            <!-- Top Header in Card -->
                                            <div class="flex items-center justify-between">
                                                <span class="px-2.5 py-1 bg-purple-900/60 border border-purple-500/40 text-purple-200 text-[10px] font-bold rounded-lg">+0 REP</span>
                                                <div class="flex items-center gap-3">
                                                    <div class="text-right">
                                                        <h4 class="text-sm font-black text-white leading-tight">@${user.username}</h4>
                                                    </div>
                                                    <img src="${userAvatar}" class="w-12 h-12 rounded-2xl object-cover ring-2 ring-purple-500/60 shadow-lg shadow-black/40">
                                                </div>
                                            </div>

                                            <!-- About Me Box -->
                                            <div class="bg-black/30 border border-white/5 rounded-xl p-3 text-right">
                                                <span class="text-[9px] font-bold text-gray-400 block mb-0.5">ABOUT ME</span>
                                                <p class="text-xs text-gray-200">مرحباً بك في لوحة تحكم ZENO Bot!</p>
                                            </div>

                                            <!-- Stats & Gold in Card -->
                                            <div class="grid grid-cols-2 gap-3 text-right">
                                                <div class="bg-black/30 border border-white/5 rounded-xl p-3 space-y-1 text-xs">
                                                    <span class="text-[9px] font-bold text-gray-400 block">STATISTICS</span>
                                                    <div class="text-[11px] text-gray-300 flex items-center justify-between">
                                                        <span class="font-bold text-purple-300">${userLevel}</span>
                                                        <span>⚡ LEVEL:</span>
                                                    </div>
                                                    <div class="text-[11px] text-gray-300 flex items-center justify-between">
                                                        <span class="font-bold text-emerald-400">#${userRankXp}</span>
                                                        <span>🏆 RANK:</span>
                                                    </div>
                                                    <div class="text-[11px] text-gray-300 flex items-center justify-between">
                                                        <span class="font-bold text-gray-200 font-mono">${userXp} XP</span>
                                                        <span>✨ XP:</span>
                                                    </div>
                                                </div>

                                                <div class="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2 text-right">
                                                    <span class="text-[9px] font-bold text-gray-400 block">GOLDS</span>
                                                    <div class="flex items-center justify-end gap-1.5 text-amber-400 font-black text-sm">
                                                        <span>${userCoins.toLocaleString()}</span>
                                                        <span class="text-base">🪙</span>
                                                    </div>
                                                    <span class="text-[9px] font-bold text-gray-400 block pt-1">BADGES</span>
                                                    <div class="flex items-center justify-end gap-1 text-base">
                                                        <span>👑</span><span>💎</span><span>🔥</span><span>⚡</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- 2. بطاقة الهوية (Identity / Voice & Invites Card) -->
                                    <div class="bg-[#10121b] border border-white/5 rounded-3xl p-5 shadow-xl space-y-4">
                                        <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                            <button onclick="switchTab('tabIdentity')" class="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-bold transition flex items-center gap-1.5">
                                                <span>✏️</span>
                                                <span>تعديل البطاقة</span>
                                            </button>
                                            <h4 class="text-xs font-black text-white">بطاقة الهوية</h4>
                                        </div>

                                        <!-- The Graphic Identity Card -->
                                        <div class="relative rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-950 via-[#101426] to-[#090b14] border border-indigo-500/30 p-5 shadow-2xl space-y-4">
                                            <div class="flex items-center justify-between">
                                                <div class="text-left text-xs font-bold text-indigo-300 bg-indigo-950/60 border border-indigo-800/40 px-3 py-1 rounded-xl">
                                                    <span>INVITES: 0</span>
                                                </div>
                                                <div class="flex items-center gap-3">
                                                    <div class="text-right">
                                                        <h4 class="text-sm font-black text-white leading-tight">@${user.username}</h4>
                                                        <span class="text-[10px] text-gray-400">ID CARD</span>
                                                    </div>
                                                    <img src="${userAvatar}" class="w-12 h-12 rounded-2xl object-cover ring-2 ring-indigo-500/60 shadow-lg shadow-black/40">
                                                </div>
                                            </div>

                                            <div class="grid grid-cols-2 gap-3 text-right">
                                                <div class="bg-black/30 border border-white/5 rounded-xl p-3 space-y-1">
                                                    <div class="flex items-center justify-between text-xs text-indigo-400 font-bold mb-1">
                                                        <span>TOP #1</span>
                                                        <span>💬 TEXT</span>
                                                    </div>
                                                    <div class="text-[10px] text-gray-300">TOTAL XP: <span class="font-mono text-white">${userXp}</span></div>
                                                    <div class="text-[10px] text-gray-300">STREAK: <span class="font-mono text-emerald-400">Active</span></div>
                                                </div>

                                                <div class="bg-black/30 border border-white/5 rounded-xl p-3 space-y-1">
                                                    <div class="flex items-center justify-between text-xs text-purple-400 font-bold mb-1">
                                                        <span>TOP #1</span>
                                                        <span>🎙️ VOICE</span>
                                                    </div>
                                                    <div class="text-[10px] text-gray-300">VOICE TIME: <span class="font-mono text-white">Online</span></div>
                                                    <div class="text-[10px] text-gray-300">STREAK: <span class="font-mono text-emerald-400">Level ${userLevel}</span></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>

                        </div>

                        <!-- Tab 2: متجر خلفيات البروفايل (Wallpapers Shop) -->
                        <div id="tabWallpapers" class="tab-content hidden space-y-6">
                            <div class="probot-card border border-white/5 rounded-3xl p-6 shadow-xl">
                                <div class="flex items-center justify-between pb-4 mb-4 border-b border-white/5">
                                    <span class="text-xs text-amber-400 font-bold">رصيدك: <span class="user-coins-val">${userCoins.toLocaleString()}</span> 🪙 الذهب</span>
                                    <h3 class="text-sm font-black text-white text-right">متجر خلفيات الملف الشخصي 🖼️</h3>
                                </div>
                                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                    
                                    <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl overflow-hidden shadow-lg group">
                                        <div class="h-28 bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-950 flex items-center justify-center text-3xl">🌌</div>
                                        <div class="p-4 text-right">
                                            <h4 class="text-xs font-bold text-white">Galaxy Neon</h4>
                                            <p class="text-[10px] text-gray-400 mt-0.5">خلفية النجوم والنيون الأرجواني</p>
                                            <div class="mt-3 flex items-center justify-between">
                                                <button onclick="buyItem('wallpaper', 'Galaxy Neon', 5000, this)" class="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold shadow-md hover:from-purple-500 hover:to-indigo-500 transition">شراء وتجهيز</button>
                                                <span class="text-xs font-mono text-amber-300 font-bold">5,000 🪙</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl overflow-hidden shadow-lg group">
                                        <div class="h-28 bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 flex items-center justify-center text-3xl">🌲</div>
                                        <div class="p-4 text-right">
                                            <h4 class="text-xs font-bold text-white">Emerald Forest</h4>
                                            <p class="text-[10px] text-gray-400 mt-0.5">خلفية الطبيعة والزمرد الفخم</p>
                                            <div class="mt-3 flex items-center justify-between">
                                                <button onclick="buyItem('wallpaper', 'Emerald Forest', 7500, this)" class="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold shadow-md hover:from-purple-500 hover:to-indigo-500 transition">شراء وتجهيز</button>
                                                <span class="text-xs font-mono text-amber-300 font-bold">7,500 🪙</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl overflow-hidden shadow-lg group">
                                        <div class="h-28 bg-gradient-to-r from-rose-950 via-zinc-900 to-amber-950 flex items-center justify-center text-3xl">🔥</div>
                                        <div class="p-4 text-right">
                                            <h4 class="text-xs font-bold text-white">Cyberpunk Gold</h4>
                                            <p class="text-[10px] text-gray-400 mt-0.5">خلفية اللهب والذهب الخالص</p>
                                            <div class="mt-3 flex items-center justify-between">
                                                <button onclick="buyItem('wallpaper', 'Cyberpunk Gold', 12000, this)" class="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold shadow-md hover:from-purple-500 hover:to-indigo-500 transition">شراء وتجهيز</button>
                                                <span class="text-xs font-mono text-amber-300 font-bold">12,000 🪙</span>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>

                        <!-- Tab 3: شارات البروفايل (Badges Shop) -->
                        <div id="tabBadges" class="tab-content hidden space-y-6">
                            <div class="probot-card border border-white/5 rounded-3xl p-6 shadow-xl">
                                <div class="flex items-center justify-between pb-4 mb-4 border-b border-white/5">
                                    <span class="text-xs text-amber-400 font-bold">رصيدك: <span class="user-coins-val">${userCoins.toLocaleString()}</span> 🪙 الذهب</span>
                                    <h3 class="text-sm font-black text-white text-right">متجر شارات وأوسمة الملف الشخصي 🎖️</h3>
                                </div>
                                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl text-center space-y-2">
                                        <span class="text-3xl block">👑</span>
                                        <h4 class="text-xs font-bold text-white">تاج الأساطير</h4>
                                        <p class="text-[10px] text-gray-400">شارة ملكية ذهبية</p>
                                        <button onclick="buyItem('badge', 'Crown Badge', 10000, this)" class="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold transition shadow-md">شراء (10,000 🪙)</button>
                                    </div>
                                    <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl text-center space-y-2">
                                        <span class="text-3xl block">💎</span>
                                        <h4 class="text-xs font-bold text-white">الماسة اللامعة</h4>
                                        <p class="text-[10px] text-gray-400">شارة النقاء والتميز</p>
                                        <button onclick="buyItem('badge', 'Diamond Badge', 15000, this)" class="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold transition shadow-md">شراء (15,000 🪙)</button>
                                    </div>
                                    <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl text-center space-y-2">
                                        <span class="text-3xl block">⚡</span>
                                        <h4 class="text-xs font-bold text-white">صاعقة النيون</h4>
                                        <p class="text-[10px] text-gray-400">شارة السرعة والقوة</p>
                                        <button onclick="buyItem('badge', 'Lightning Badge', 8000, this)" class="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold transition shadow-md">شراء (8,000 🪙)</button>
                                    </div>
                                    <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl text-center space-y-2">
                                        <span class="text-3xl block">🔥</span>
                                        <h4 class="text-xs font-bold text-white">لهب العزيمة</h4>
                                        <p class="text-[10px] text-gray-400">شارة النشاط والحماس</p>
                                        <button onclick="buyItem('badge', 'Fire Badge', 7000, this)" class="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold transition shadow-md">شراء (7,000 🪙)</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Tab 4: خلفيات بطاقة الهوية (Identity Shop) -->
                        <div id="tabIdentity" class="tab-content hidden space-y-6">
                            <div class="probot-card border border-white/5 rounded-3xl p-6 shadow-xl text-right">
                                <h3 class="text-sm font-black text-white mb-2">خلفيات بطاقة الهوية 🪪</h3>
                                <p class="text-gray-400 text-xs mb-6">خصص تصميم بطاقة الهوية التي تظهر في الديسكورد عند كتابة أمر <span class="text-purple-400 font-mono">/id</span> أو <span class="text-purple-400 font-mono">/profile</span>.</p>
                                
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                                        <button onclick="buyItem('identity', 'Dark Minimalist', 3000, this)" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold">تفعيل (3,000 🪙)</button>
                                        <div>
                                            <h4 class="text-xs font-bold text-white">Dark Minimalist</h4>
                                            <p class="text-[10px] text-gray-400">تصميم أسود داكن كلاسيكي فخم</p>
                                        </div>
                                    </div>
                                    <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                                        <button onclick="buyItem('identity', 'Purple Glow Pro', 4500, this)" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold">تفعيل (4,500 🪙)</button>
                                        <div>
                                            <h4 class="text-xs font-bold text-white">Purple Glow Pro</h4>
                                            <p class="text-[10px] text-gray-400">توهج بنفسجي متدرج ملكي</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Tab 5: لوحة المتصدرين (Leaderboards) -->
                        <div id="tabLeaderboard" class="tab-content hidden space-y-6">
                            <div class="probot-card border border-white/5 rounded-3xl p-6 shadow-xl">
                                <div class="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                                    <span class="text-xs text-purple-400 font-mono font-bold">ترتيبك الحالي: #${userRankXp}</span>
                                    <h3 class="text-sm font-black text-white text-right">أعلى 100 عضو بواسطة نقاط الخبرة (XP Leaderboard) 🏆</h3>
                                </div>
                                <div class="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                                    ${xpLeaderboardHtml}
                                </div>
                            </div>
                        </div>

                        <!-- Tab 5B: أغنى الأثرياء (Coins Leaderboard) -->
                        <div id="tabCoinsLeaderboard" class="tab-content hidden space-y-6">
                            <div class="probot-card border border-white/5 rounded-3xl p-6 shadow-xl">
                                <div class="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                                    <span class="text-xs text-amber-400 font-mono font-bold">ترتيبك المالي: #${userRankCoins}</span>
                                    <h3 class="text-sm font-black text-white text-right">أغنى الأثرياء برصيد الذهب 🪙</h3>
                                </div>
                                <div class="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                                    ${coinsLeaderboardHtml}
                                </div>
                            </div>
                        </div>

                        <!-- Tab 6: الراتب اليومي (Daily Reward) -->
                        <div id="tabDaily" class="tab-content hidden space-y-6">
                            <div class="probot-card border border-white/5 rounded-3xl p-8 shadow-xl text-center space-y-5 max-w-xl mx-auto">
                                <div class="w-20 h-20 rounded-3xl bg-gradient-to-tr from-purple-600/30 to-indigo-600/30 border border-purple-500/40 flex items-center justify-center text-4xl mx-auto shadow-xl shadow-black/20">
                                    🎁
                                </div>
                                <div>
                                    <h3 class="text-xl font-black text-white">الراتب اليومي (Daily Reward)</h3>
                                    <p class="text-gray-400 text-xs mt-2 leading-relaxed">
                                        احصل على <span class="text-amber-300 font-bold">500 إلى 1,000 من الذهب</span> مجاناً كل 24 ساعة!
                                    </p>
                                </div>

                                <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-4 flex items-center justify-around text-xs">
                                    <div>
                                        <span class="text-gray-400 block text-[11px]">مكافأة اليوم</span>
                                        <span class="text-amber-400 font-black font-mono text-sm">+500 🪙</span>
                                    </div>
                                    <div class="w-px h-8 bg-purple-950/50"></div>
                                    <div>
                                        <span class="text-gray-400 block text-[11px]">التكرار</span>
                                        <span class="text-gray-200 font-bold">كل 24 ساعة</span>
                                    </div>
                                </div>

                                <div id="dailyActionBox" class="space-y-4">
                                    ${canClaimDaily ? `
                                        <button id="claimDailyBtn" onclick="claimDaily()" class="w-full py-4 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-purple-900/40 transition transform active:scale-95 flex items-center justify-center gap-2">
                                            <span>🎁</span>
                                            <span>استلام الراتب اليومي الآن (+500 🪙)</span>
                                        </button>
                                    ` : `
                                        <div class="bg-[#0b0d14] border border-purple-950/60 rounded-2xl p-5 space-y-4">
                                            <div class="flex items-center justify-between text-xs font-bold text-gray-300">
                                                <span class="flex items-center gap-1 text-purple-400"><span>⏰</span><span>الراتب القادم</span></span>
                                                <span class="text-gray-400">الوقت المتبقي بالضبط</span>
                                            </div>

                                            <div class="grid grid-cols-3 gap-3">
                                                <div class="bg-[#1c1f2e] border border-purple-900/40 rounded-xl p-3 text-center shadow-inner">
                                                    <span id="cdHours" class="text-2xl font-black text-white font-mono block">${String(hoursLeft).padStart(2, '0')}</span>
                                                    <span class="text-[10px] text-gray-400 font-bold mt-0.5 block">ساعة</span>
                                                </div>
                                                <div class="bg-[#1c1f2e] border border-purple-900/40 rounded-xl p-3 text-center shadow-inner">
                                                    <span id="cdMins" class="text-2xl font-black text-white font-mono block">${String(minsLeft).padStart(2, '0')}</span>
                                                    <span class="text-[10px] text-gray-400 font-bold mt-0.5 block">دقيقة</span>
                                                </div>
                                                <div class="bg-[#1c1f2e] border border-purple-900/40 rounded-xl p-3 text-center shadow-inner">
                                                    <span id="cdSecs" class="text-2xl font-black text-purple-400 font-mono block">00</span>
                                                    <span class="text-[10px] text-gray-400 font-bold mt-0.5 block">ثانية</span>
                                                </div>
                                            </div>

                                            <button disabled class="w-full py-3 bg-[#151722] border border-white/5 text-gray-400 font-bold text-xs rounded-xl cursor-not-allowed flex items-center justify-center gap-2">
                                                <span>⌛</span>
                                                <span>تم استلام راتب اليوم! عد بعد انتهاء الوقت أعلاه</span>
                                            </button>
                                        </div>
                                    `}
                                </div>
                            </div>
                        </div>

                    </main>

                    <!-- Sidebar Right (Novax User Dashboard Menu with Exact Categories) -->
                    <aside class="w-72 bg-[#090a10] border-l border-white/5 flex flex-col shrink-0 h-full select-none">
                        
                        <!-- Top Server Management Switcher Card (Novax Style) -->
                        <div class="p-3">
                            <a href="#servers" onclick="switchTab('tabOverview')" class="bg-[#12141f] hover:bg-[#181926] border border-white/5 rounded-2xl p-3 flex items-center justify-between shadow-lg transition group">
                                <div class="text-gray-400 text-xs">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/></svg>
                                </div>
                                <div class="flex items-center gap-2.5">
                                    <span class="font-bold text-white text-xs">إدارة سيرفر</span>
                                    <div class="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-sm border border-purple-500/30">
                                        🗂️
                                    </div>
                                </div>
                            </a>
                        </div>

                        <!-- Categorized Scrollable Nav Menu -->
                        <div class="flex-1 overflow-y-auto px-3 py-2 space-y-4 text-xs text-right custom-scrollbar">

                            <!-- عام -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('user_grp_general')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_user_grp_general" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>عام</span></span>
                                </button>
                                <div id="user_grp_general" class="space-y-1">
                                    <button onclick="switchTab('tabOverview', this)" class="nav-btn px-3 py-2 rounded-xl bg-purple-600 text-white font-bold flex items-center justify-between shadow-md w-full transition">
                                        <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
                                        <span class="flex items-center gap-2"><span>نظرة عامة</span><span class="text-purple-300">🎛️</span></span>
                                    </button>
                                </div>
                            </div>

                            <!-- متجر القولد (Shop) -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('user_grp_shop')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_user_grp_shop" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>متجر القولد</span></span>
                                </button>
                                <div id="user_grp_shop" class="space-y-1">
                                    <button onclick="switchTab('tabWallpapers', this)" class="nav-btn px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] font-medium flex items-center justify-between transition w-full">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>خلفيات الملف الشخصي</span><span class="text-gray-400">🖼️</span></span>
                                    </button>
                                    <button onclick="switchTab('tabIdentity', this)" class="nav-btn px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] font-medium flex items-center justify-between transition w-full">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>خلفيات بطاقة الهوية</span><span class="text-gray-400">🪪</span></span>
                                    </button>
                                    <button onclick="switchTab('tabBadges', this)" class="nav-btn px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] font-medium flex items-center justify-between transition w-full">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>شارات وأوسمة</span><span class="text-gray-400">🎖️</span></span>
                                    </button>
                                </div>
                            </div>

                            <!-- لوحة المتصدرين (Leaderboards) -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('user_grp_leaderboard')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_user_grp_leaderboard" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>لوحة المتصدرين</span></span>
                                </button>
                                <div id="user_grp_leaderboard" class="space-y-1">
                                    <button onclick="switchTab('tabCoinsLeaderboard', this)" class="nav-btn px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] font-medium flex items-center justify-between transition w-full">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>أغنى الأثرياء</span><span class="text-gray-400">🪙</span></span>
                                    </button>
                                    <button onclick="switchTab('tabLeaderboard', this)" class="nav-btn px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] font-medium flex items-center justify-between transition w-full">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>أعلى نقاط السمعة & XP</span><span class="text-gray-400">🏆</span></span>
                                    </button>
                                </div>
                            </div>

                            <!-- أخرى (Other) -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('user_grp_other')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_user_grp_other" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>أخرى</span></span>
                                </button>
                                <div id="user_grp_other" class="space-y-1">
                                    <button onclick="switchTab('tabDaily', this)" class="nav-btn px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] font-medium flex items-center justify-between transition w-full">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>الراتب اليومي</span><span class="text-gray-400">🎁</span></span>
                                    </button>
                                    <a href="/logout" class="flex items-center justify-between px-3 py-2 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 font-medium transition w-full">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                                        <span class="flex items-center gap-2"><span>تسجيل الخروج</span><span>🚪</span></span>
                                    </a>
                                </div>
                            </div>

                        </div>

                        <!-- User Profile Bottom Bar (Novax Exact Style) -->
                        <div class="p-3 border-t border-white/5">
                            <div class="bg-gradient-to-r from-purple-700 to-indigo-700 rounded-2xl p-2.5 flex items-center justify-between shadow-lg shadow-purple-950/40">
                                <div class="text-white/80 hover:text-white cursor-pointer px-1">
                                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z"/></svg>
                                </div>
                                <div class="flex items-center gap-2.5">
                                    <div class="text-right">
                                        <span class="text-xs font-black text-white block leading-tight truncate max-w-[110px]">${user.username}</span>
                                    </div>
                                    <img src="${userAvatar}" class="w-8 h-8 rounded-xl object-cover ring-2 ring-white/20 shadow-md">
                                </div>
                            </div>
                        </div>

                    </aside>

                    <!-- Server Rail (Far Right Column - Novax Style) -->
                    <div class="w-18 bg-[#05060a] border-l border-white/5 py-4 px-2 flex flex-col items-center gap-3 shrink-0 overflow-y-auto select-none">
                        <!-- Home Icon Button -->
                        <a href="/dashboard" title="الصفحة الرئيسية" class="w-12 h-12 rounded-2xl bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-300 hover:text-white transition shadow-lg mb-1 group">
                            <svg class="w-6 h-6 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                        </a>
                        <div class="w-8 h-[1px] bg-white/5"></div>
                        ${serverRailHtml}
                    </div>

                </div>

                <script>
                function toggleNavGroup(groupId) {
                    const el = document.getElementById(groupId);
                    const arrow = document.getElementById('arrow_' + groupId);
                    if (!el) return;
                    el.classList.toggle('hidden');
                    if (arrow) arrow.classList.toggle('rotate-180');
                }
                </script>

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
                            b.className = 'nav-btn px-3 py-2 rounded-xl text-gray-400 hover:text-gray-200 hover:bg-[#151722] font-medium flex items-center justify-between transition w-full';
                        });

                        if (btn) {
                            btn.className = 'nav-btn px-3 py-2 rounded-xl bg-gradient-to-r from-purple-700 to-indigo-700 text-white font-bold flex items-center justify-between shadow-md w-full transition';
                        }
                    }

                    let dailyUnlockTime = ${canClaimDaily ? 0 : unlockTimestamp};

                    function renderDailyBox(canClaim) {
                        const box = document.getElementById('dailyActionBox');
                        if (!box) return;
                        if (canClaim) {
                            box.innerHTML = '<button id="claimDailyBtn" onclick="claimDaily()" class="w-full py-4 bg-gradient-to-r from-[#5865f2] via-indigo-600 to-[#5865f2] hover:from-[#4752c4] hover:to-indigo-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-purple-900/40 transition transform active:scale-95 flex items-center justify-center gap-2"><span>🎁</span><span>استلام المكافأة اليومية الآن (+500 ⭐)</span></button>';
                        } else {
                            box.innerHTML = '<div class="bg-[#0b0d14] border border-purple-950/60 rounded-2xl p-5 space-y-4">'
                                + '<div class="flex items-center justify-between text-xs font-bold text-gray-300"><span class="flex items-center gap-1 text-[#5865f2]"><span>⏰</span><span>المكافأة القادمة</span></span><span class="text-gray-400">الوقت المتبقي بالضبط</span></div>'
                                + '<div class="grid grid-cols-3 gap-3">'
                                + '<div class="bg-[#1c1f2e] border border-purple-900/40 rounded-xl p-3 text-center shadow-inner"><span id="cdHours" class="text-2xl font-black text-white font-mono block">00</span><span class="text-[10px] text-gray-400 font-bold mt-0.5 block">ساعة</span></div>'
                                + '<div class="bg-[#1c1f2e] border border-purple-900/40 rounded-xl p-3 text-center shadow-inner"><span id="cdMins" class="text-2xl font-black text-white font-mono block">00</span><span class="text-[10px] text-gray-400 font-bold mt-0.5 block">دقيقة</span></div>'
                                + '<div class="bg-[#1c1f2e] border border-purple-900/40 rounded-xl p-3 text-center shadow-inner"><span id="cdSecs" class="text-2xl font-black text-[#5865f2] font-mono block">00</span><span class="text-[10px] text-gray-400 font-bold mt-0.5 block">ثانية</span></div>'
                                + '</div>'
                                + '<button disabled class="w-full py-3 bg-[#151722] border border-white/5 text-gray-400 font-bold text-xs rounded-xl cursor-not-allowed flex items-center justify-center gap-2"><span>⌛</span><span>تم استلام مكافأة اليوم! عد بعد انتهاء الوقت أعلاه</span></button>'
                                + '</div>';
                        }
                    }

                    function updateDailyCountdown() {
                        if (!dailyUnlockTime || dailyUnlockTime <= Date.now()) {
                            if (!document.getElementById('claimDailyBtn')) {
                                renderDailyBox(true);
                            }
                            return;
                        }
                        
                        if (!document.getElementById('cdHours')) {
                            renderDailyBox(false);
                        }

                        const diff = Math.max(0, dailyUnlockTime - Date.now());
                        const h = Math.floor(diff / (1000 * 60 * 60));
                        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                        const s = Math.floor((diff % (1000 * 60)) / 1000);

                        const hEl = document.getElementById('cdHours');
                        const mEl = document.getElementById('cdMins');
                        const sEl = document.getElementById('cdSecs');

                        if (hEl) hEl.innerText = String(h).padStart(2, '0');
                        if (mEl) mEl.innerText = String(m).padStart(2, '0');
                        if (sEl) sEl.innerText = String(s).padStart(2, '0');
                    }
                    setInterval(updateDailyCountdown, 1000);
                    updateDailyCountdown();

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
                                dailyUnlockTime = Date.now() + 24 * 60 * 60 * 1000;
                                renderDailyBox(false);
                                updateDailyCountdown();
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
            let guild = guilds.find(g => g.id === guildId);
            const user = req.session.user;

            const botGuild = client?.guilds?.cache?.get(guildId);
            if (!guild && botGuild) {
                guild = { id: botGuild.id, name: botGuild.name, icon: botGuild.icon, memberCount: botGuild.memberCount };
            }

            if (!guild) return res.redirect('/dashboard');

            const userAvatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
            const guildIcon = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

            // الشريط الرأسي الأيمن للسيرفرات
            const serverRailHtml = guilds.map(g => `
                <a href="/dashboard/${g.id}" title="${g.name}" class="group relative flex items-center justify-center">
                    <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                         class="w-12 h-12 rounded-2xl ${g.id === guildId ? 'border-2 border-purple-500 shadow-lg shadow-purple-900/50 p-0.5 ring-2 ring-purple-600/30' : 'border border-transparent hover:border-purple-500/40'} hover:rounded-xl object-cover transition-all">
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
                    :root {
                        --bg-main: #0b0d14;
                        --bg-sidebar: #10121b;
                        --bg-card: #151722;
                        --bg-card-hover: #1c1f2e;
                        --primary: #5865f2;
                        --primary-hover: #4752c4;
                        --border: rgba(255, 255, 255, 0.05);
                        --text-muted: #a3a6aa;
                    }
                    body { background-color: var(--bg-main) !important; color: #ffffff !important; font-family: 'Cairo', sans-serif !important; }
                    /* Scrollbar */
                    ::-webkit-scrollbar { width: 8px; height: 8px; }
                    ::-webkit-scrollbar-track { background: var(--bg-main); }
                    ::-webkit-scrollbar-thumb { background: #2f3146; border-radius: 10px; }
                    ::-webkit-scrollbar-thumb:hover { background: #40445f; }
                    
                    /* Glassmorphism & Cards */
                    .probot-card {
                        background: var(--bg-card) !important;
                        border: 1px solid var(--border) !important;
                        border-radius: 16px !important;
                        transition: all 0.3s ease !important;
                        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2) !important;
                    }
                    .probot-card:hover {
                        background: var(--bg-card-hover) !important;
                        border-color: rgba(88, 101, 242, 0.4) !important;
                        transform: translateY(-3px) !important;
                        box-shadow: 0 6px 25px rgba(0, 0, 0, 0.3) !important;
                    }
                    
                    /* Toggles */
                    .toggle { position: relative; display: inline-block; width: 44px; height: 24px; }
                    .toggle input { opacity: 0; width: 0; height: 0; }
                    .slider { position: absolute; cursor: pointer; inset: 0; background: #2f3146; border-radius: 24px; transition: .3s; }
                    .slider:before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .3s; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                    input:checked + .slider { background: var(--primary); }
                    input:checked + .slider:before { transform: translateX(20px); }
                    
                    /* Buttons */
                    .btn-primary {
                        background-color: var(--primary);
                        color: white;
                        transition: all 0.2s;
                    }
                    .btn-primary:hover {
                        background-color: var(--primary-hover);
                        box-shadow: 0 4px 15px rgba(88, 101, 242, 0.4);
                    }
                </style>

            </head>
            <body class="min-h-screen flex flex-col bg-[#0b0d14] text-gray-200">

                <!-- Header -->
                <header class="h-16 bg-[#10121b]/95 backdrop-blur-md border-b border-white/5 px-6 flex items-center justify-between sticky top-0 z-50">
                    <div class="flex items-center gap-4">
                        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="text-xs text-gray-400 hover:text-gray-200 transition">الدعم الفني</a>
                        <span class="text-gray-700">|</span>
                        <a href="/dashboard" class="text-xs text-[#5865f2] hover:text-gray-200 font-bold transition">الخوادم</a>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-black text-sm text-white tracking-wide">ZENO</span>
                        <img src="/logo.png" class="w-8 h-8 rounded-xl object-cover border border-purple-500/40 shadow-lg shadow-black/40" alt="ZENO">
                    </div>
                </header>

                <div class="flex-1 flex overflow-hidden">
                    
                    <!-- Main Content (Modules & Fast Access) -->
                    <main class="flex-1 p-8 overflow-y-auto">
                        
                        <!-- Search Box -->
                        <div class="flex items-center justify-between mb-8">
                            <div class="relative w-72">
                                <input type="text" placeholder="...Search plugins" class="w-full bg-[#1c1f2e] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2 text-xs text-white outline-none">
                            </div>
                            <h2 class="text-xl font-black text-white">Fast Access</h2>
                        </div>

                        <!-- General (Plugins 4) -->
                        <div class="mb-10">
                            <div class="flex items-center justify-between mb-4">
                                <span class="text-xs font-bold text-[#5865f2]/70">plugins 4</span>
                                <h3 class="text-sm font-bold text-gray-400">General</h3>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                
                                <!-- نظرة عامة -->
                                <div class="probot-card border border-white/5 hover:border-[#5865f2]/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-2">
                                        <div class="w-8 h-8 rounded-xl bg-[#151722] flex items-center justify-center text-gray-200">👁️</div>
                                        <h4 class="font-bold text-white text-xs">نظرة عامة</h4>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Get main information about your server settings</p>
                                    <a href="/dashboard/${guildId}/overview" class="w-full py-2 bg-[#151722] hover:bg-[#5865f2] hover:text-white text-gray-200 border border-white/5 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- إعدادات السيرفر -->
                                <div class="probot-card border border-white/5 hover:border-[#5865f2]/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-2">
                                        <div class="w-8 h-8 rounded-xl bg-[#151722] flex items-center justify-center text-gray-200">⚙️</div>
                                        <h4 class="font-bold text-white text-xs">إعدادات السيرفر</h4>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Manage your server settings</p>
                                    <a href="/dashboard/${guildId}/settings" class="w-full py-2 bg-[#151722] hover:bg-[#5865f2] hover:text-white text-gray-200 border border-white/5 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- رسائل الإيمبد -->
                                <div class="probot-card border border-white/5 hover:border-[#5865f2]/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-2">
                                        <div class="w-8 h-8 rounded-xl bg-[#151722] flex items-center justify-center text-gray-200">📄</div>
                                        <h4 class="font-bold text-white text-xs">رسائل الإيمبد</h4>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Create and manage embed messages</p>
                                    <a href="/dashboard/${guildId}/embed" class="w-full py-2 bg-[#151722] hover:bg-[#5865f2] hover:text-white text-gray-200 border border-white/5 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- حماية السيرفر -->
                                <div class="probot-card border border-white/5 hover:border-[#5865f2]/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-2">
                                        <div class="w-8 h-8 rounded-xl bg-[#151722] flex items-center justify-center text-gray-200">🛡️</div>
                                        <h4 class="font-bold text-white text-xs">حماية السيرفر</h4>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Anti-Nuke, Anti-Spam & Protection</p>
                                    <a href="/dashboard/${guildId}/protection" class="w-full py-2 bg-[#151722] hover:bg-[#5865f2] hover:text-white text-gray-200 border border-white/5 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                            </div>
                        </div>

                        <!-- Modules (Plugins 12) -->
                        <div>
                            <div class="flex items-center justify-between mb-4">
                                <span class="text-xs font-bold text-[#5865f2]/70">plugins 14</span>
                                <h3 class="text-sm font-bold text-gray-400">Modules</h3>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <!-- 👮 نشاط طاقم الإدارة (Staff Activity) -->
                                <div class="probot-card border border-amber-950/40 hover:border-amber-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'staff_activity_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">نشاط طاقم الإدارة</h4>
                                            <span class="text-lg">👮</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">إحصائيات وترتيب وإنجازات طاقم الإدارة وسجل إجراءاتهم</p>
                                    <a href="/dashboard/${guildId}/staff-activity" class="w-full py-2 bg-amber-950/30 hover:bg-gradient-to-r hover:from-amber-600 hover:to-orange-600 hover:text-white text-amber-300 border border-amber-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- سجل النشاطات والأحداث (Logs) -->
                                <div class="probot-card border border-blue-950/40 hover:border-blue-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'logs_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">سجل الأحداث (Logs)</h4>
                                            <span class="text-lg">📋</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">تتبع وتوثيق جميع تحركات وتغييرات السيرفر والرومات</p>
                                    <a href="/dashboard/${guildId}/logs" class="w-full py-2 bg-blue-950/30 hover:bg-gradient-to-r hover:from-blue-600 hover:to-indigo-600 hover:text-white text-blue-300 border border-blue-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>


                                <!-- التسلية والألعاب -->
                                <div class="probot-card border border-white/5 hover:border-[#5865f2]/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">التسلية والألعاب</h4>
                                            <span class="text-lg">🎮</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">روليت، مافيا، كراسي موسيقية، غميضة</p>
                                    <a href="/dashboard/${guildId}/fun" class="w-full py-2 bg-[#151722] hover:bg-gradient-to-r hover:from-[#5865f2] hover:to-indigo-600 hover:text-white text-gray-200 border border-white/5 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- الأوامر العامة -->
                                <div class="probot-card border border-white/5 hover:border-[#5865f2]/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'general_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">الأوامر العامة</h4>
                                            <span class="text-lg">⚙️</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Utility commands and features</p>
                                    <a href="/dashboard/${guildId}/general" class="w-full py-2 bg-[#151722] hover:bg-gradient-to-r hover:from-[#5865f2] hover:to-indigo-600 hover:text-white text-gray-200 border border-white/5 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- الإشراف -->
                                <div class="probot-card border border-white/5 hover:border-[#5865f2]/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'moderation_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">الإشراف</h4>
                                            <span class="text-lg">🔨</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Moderation tools and commands</p>
                                    <a href="/dashboard/${guildId}/moderation" class="w-full py-2 bg-[#151722] hover:bg-gradient-to-r hover:from-[#5865f2] hover:to-indigo-600 hover:text-white text-gray-200 border border-white/5 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- الرقابة التلقائية -->
                                <div class="probot-card border border-white/5 hover:border-[#5865f2]/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'automod_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">الرقابة التلقائية</h4>
                                            <span class="text-lg">🤖</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Automatic moderation features</p>
                                    <a href="/dashboard/${guildId}/automod" class="w-full py-2 bg-[#151722] hover:bg-gradient-to-r hover:from-[#5865f2] hover:to-indigo-600 hover:text-white text-gray-200 border border-white/5 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- الترحيب والمغادرة -->
                                <div class="probot-card border border-white/5 hover:border-[#5865f2]/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'welcome_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">الترحيب & المغادرة</h4>
                                            <span class="text-lg">👋</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Welcome card canvas and messages</p>
                                    <a href="/dashboard/${guildId}/welcome" class="w-full py-2 bg-[#151722] hover:bg-gradient-to-r hover:from-[#5865f2] hover:to-indigo-600 hover:text-white text-gray-200 border border-white/5 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- الرد التلقائي -->
                                <div class="probot-card border border-white/5 hover:border-[#5865f2]/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'autoresponder_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">الرد التلقائي</h4>
                                            <span class="text-lg">💬</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">Custom automatic responders</p>
                                    <a href="/dashboard/${guildId}/autoresponder" class="w-full py-2 bg-[#151722] hover:bg-gradient-to-r hover:from-[#5865f2] hover:to-indigo-600 hover:text-white text-gray-200 border border-white/5 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- البوستات -->
                                <div class="probot-card border border-pink-950/40 hover:border-pink-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'boost_enabled', this.checked)" ${true ? 'checked' : ''}><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">البوستات</h4>
                                            <span class="text-lg">🚀</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">رسائل شكر تلقائية للداعمين بالبوست</p>
                                    <a href="/dashboard/${guildId}/boost" class="w-full py-2 bg-pink-950/30 hover:bg-gradient-to-r hover:from-pink-600 hover:to-[#5865f2] hover:text-white text-pink-300 border border-pink-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- التذاكر والدعم الفني -->
                                <div class="probot-card border border-white/5 hover:border-[#5865f2]/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'ticket_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">نظام التذاكر</h4>
                                            <span class="text-lg">🎫</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">لوحات دعم فني مخصصة وترانسكريبت</p>
                                    <a href="/dashboard/${guildId}/tickets" class="w-full py-2 bg-[#151722] hover:bg-gradient-to-r hover:from-[#5865f2] hover:to-indigo-600 hover:text-white text-gray-200 border border-white/5 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- المستويات واللفلات -->
                                <div class="probot-card border border-white/5 hover:border-[#5865f2]/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'leveling_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">المستويات & XP</h4>
                                            <span class="text-lg">📈</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">نظام الرتب ونقاط الخبرة وبطاقات الرانك</p>
                                    <a href="/dashboard/${guildId}/levels" class="w-full py-2 bg-[#151722] hover:bg-gradient-to-r hover:from-[#5865f2] hover:to-indigo-600 hover:text-white text-gray-200 border border-white/5 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- الرومات المؤقتة -->
                                <div class="probot-card border border-white/5 hover:border-[#5865f2]/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'temp_voice_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">رومات مؤقتة</h4>
                                            <span class="text-lg">🔊</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">إنشاء قنوات صوتية خاصة تلقائياً</p>
                                    <a href="/dashboard/${guildId}/tempvoice" class="w-full py-2 bg-[#151722] hover:bg-gradient-to-r hover:from-[#5865f2] hover:to-indigo-600 hover:text-white text-gray-200 border border-white/5 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- التحقق والتفعيل -->
                                <div class="probot-card border border-white/5 hover:border-[#5865f2]/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'verify_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">التحقق & التفعيل</h4>
                                            <span class="text-lg">🛡️</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">لوحة تفعيل الأعضاء بالأزرار التفاعلية</p>
                                    <a href="/dashboard/${guildId}/verification" class="w-full py-2 bg-[#151722] hover:bg-gradient-to-r hover:from-[#5865f2] hover:to-indigo-600 hover:text-white text-gray-200 border border-white/5 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- الاقتصاد والنجوم -->
                                <div class="probot-card border border-amber-950/40 hover:border-amber-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
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
                                <div class="probot-card border border-emerald-950/40 hover:border-emerald-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
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
                                <div class="probot-card border border-indigo-950/40 hover:border-indigo-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'applications_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">نظام التقديمات</h4>
                                            <span class="text-lg">📝</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">إنشاء وتخصيص استمارات التقديم مع لوحة أزرار تفاعلية ومراجعة الطلبات</p>
                                    <a href="/dashboard/${guildId}/applications" class="w-full py-2 bg-indigo-950/30 hover:bg-gradient-to-r hover:from-indigo-600 hover:to-[#5865f2] hover:text-white text-indigo-300 border border-indigo-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- الإحصائيات والتحليلات (Analytics) -->
                                <div class="probot-card border border-white/5 hover:border-[#5865f2]/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <span class="px-2 py-0.5 bg-purple-950/60 text-gray-200 rounded-lg text-[10px] font-bold">مباشر 📊</span>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">الإحصائيات & التحليلات</h4>
                                            <span class="text-lg">📊</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">تحليلات بيانية دقيقة لتفاعل الرسائل، دخول وخروج الأعضاء، والرومات الصوتية</p>
                                    <a href="/dashboard/${guildId}/analytics" class="w-full py-2 bg-[#151722] hover:bg-gradient-to-r hover:from-[#5865f2] hover:to-indigo-600 hover:text-white text-gray-200 border border-white/5 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- مظهر البوت (Bot Appearance) -->
                                <div class="probot-card border border-amber-950/40 hover:border-amber-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
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

                                <!-- Invite Tracker -->
                                <div class="probot-card border border-purple-950/40 hover:border-purple-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'invite_tracker_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">Invite Tracker</h4>
                                            <span class="text-lg">🔗</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">تتبع دعوات الأعضاء، من جاب مين، الليدربورد، ومكافأة الداعي</p>
                                    <a href="/dashboard/${guildId}/invites" class="w-full py-2 bg-purple-950/30 hover:bg-gradient-to-r hover:from-purple-600 hover:to-[#5865f2] hover:text-white text-purple-300 border border-purple-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- Giveaways -->
                                <div class="probot-card border border-yellow-950/40 hover:border-yellow-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'giveaway_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">Giveaways 🎁</h4>
                                            <span class="text-lg">🎉</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">سحوبات متقدمة: شروط رول/مستوى، فرصة مضاعفة، Reroll، إشعار DM</p>
                                    <a href="/dashboard/${guildId}/giveaways" class="w-full py-2 bg-yellow-950/30 hover:bg-gradient-to-r hover:from-yellow-500 hover:to-amber-600 hover:text-white text-yellow-300 border border-yellow-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
                                </div>

                                <!-- Broadcast / Announcements -->
                                <div class="probot-card border border-cyan-950/40 hover:border-cyan-600/40 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg">
                                    <div class="flex items-center justify-between mb-3">
                                        <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', 'broadcast_enabled', this.checked)" checked><span class="slider"></span></label>
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-white text-sm">الإعلانات 📢</h4>
                                            <span class="text-lg">📡</span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-4 text-right">جدولة إعلانات، تكرار تلقائي، عدة قنوات، Embed Designer</p>
                                    <a href="/dashboard/${guildId}/broadcast" class="w-full py-2 bg-cyan-950/30 hover:bg-gradient-to-r hover:from-cyan-600 hover:to-blue-600 hover:text-white text-cyan-300 border border-cyan-900/30 rounded-xl text-xs font-bold text-center transition">&gt; Visit</a>
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

                    <!-- Server Settings Navigation Sidebar (Novax Style Categorized & Collapsible) -->
                    <aside class="w-72 bg-[#090a10] border-l border-white/5 flex flex-col shrink-0 h-full select-none">
                        
                        <!-- Server Card Top (Novax Style) -->
                        <div class="p-3">
                            <div class="bg-[#12141f] border border-white/5 rounded-2xl p-3 flex items-center justify-between shadow-lg">
                                <div class="text-gray-400 text-xs">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/></svg>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <h3 class="font-bold text-white text-xs truncate max-w-[130px]">${guild.name}</h3>
                                        <span class="text-[10px] text-gray-400">الأعضاء: ${guild.memberCount || botGuild?.memberCount || 0}</span>
                                    </div>
                                    <div class="relative">
                                        <img src="${guildIcon}" class="w-10 h-10 rounded-xl bg-[#1c1f2e] object-cover ring-2 ring-purple-600/50 shadow-md">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Categorized Scrollable Nav Menu -->
                        <div class="flex-1 overflow-y-auto px-3 py-2 space-y-4 text-xs text-right custom-scrollbar">

                            <!-- الأخيرة (Recent / Fast Access) -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_recent')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_recent" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>الأخيرة</span><span>🕒</span></span>
                                </button>
                                <div id="grp_recent" class="space-y-1">
                                    <a href="/dashboard/${guildId}/welcome" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الترحيب & المغادرة</span><span class="text-gray-400 group-hover:text-purple-400">👋</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/autoresponder" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الرد التلقائي</span><span class="text-gray-400 group-hover:text-purple-400">💬</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/tickets" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>نظام التذاكر</span><span class="text-gray-400 group-hover:text-purple-400">🎫</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- عام (General) -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_general')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_general" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>عام</span></span>
                                </button>
                                <div id="grp_general" class="space-y-1">
                                    <a href="/dashboard/${guildId}" class="flex items-center justify-between px-3 py-2 rounded-xl bg-purple-600/20 text-purple-300 font-bold border border-purple-500/30 transition">
                                        <span class="w-1.5 h-1.5 rounded-full bg-purple-400 shadow-sm shadow-purple-400"></span>
                                        <span class="flex items-center gap-2"><span>نظرة عامة</span><span class="text-purple-400">🎛️</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/appearance" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>مظهر البوت</span><span class="text-gray-400 group-hover:text-purple-400">🎨</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/settings" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>الإعدادات</span><span class="text-gray-400 group-hover:text-purple-400">⚙️</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/analytics" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>الإحصائيات</span><span class="text-gray-400 group-hover:text-purple-400">📊</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/general" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="text-[9px] font-bold text-rose-400 bg-rose-950/60 px-1.5 py-0.2 rounded">جديد</span>
                                        <span class="flex items-center gap-2"><span>الأوامر</span><span class="text-gray-400 group-hover:text-purple-400">⌨️</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- الرسائل والإمبد (Messages & Embeds) -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_messages')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_messages" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>الرسائل والأمبد</span></span>
                                </button>
                                <div id="grp_messages" class="space-y-1">
                                    <a href="/dashboard/${guildId}/embed" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>رسائل الأمبد</span><span class="text-gray-400 group-hover:text-purple-400">📄</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/broadcast" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="text-[9px] font-bold text-cyan-400 bg-cyan-950/60 px-1.5 py-0.2 rounded">جديد</span>
                                        <span class="flex items-center gap-2"><span>نظام الإعلانات</span><span class="text-gray-400 group-hover:text-purple-400">📢</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- الميزات الأساسية (Core Features) -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_core')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_core" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>الميزات الأساسية</span></span>
                                </button>
                                <div id="grp_core" class="space-y-1">
                                    <a href="/dashboard/${guildId}/moderation" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="text-[9px] font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded">تحديث</span>
                                        <span class="flex items-center gap-2"><span>الإشراف</span><span class="text-gray-400 group-hover:text-purple-400">🔨</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/levels" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>المستويات & XP</span><span class="text-gray-400 group-hover:text-purple-400">🏆</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/welcome" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الترحيب & المغادرة</span><span class="text-gray-400 group-hover:text-purple-400">👋</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/autoroles" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الرتب التلقائية</span><span class="text-gray-400 group-hover:text-purple-400">🎖️</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/giveaways" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>قيف اواي</span><span class="text-gray-400 group-hover:text-purple-400">🎁</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/invites" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>Invite Tracker</span><span class="text-gray-400 group-hover:text-purple-400">🔗</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- الإجراءات الآلية والعامة (Automations) -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_automations')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_automations" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>الإجراءات الآلية والعامة</span></span>
                                </button>
                                <div id="grp_automations" class="space-y-1">
                                    <a href="/dashboard/${guildId}/autoresponder" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الرد التلقائي</span><span class="text-gray-400 group-hover:text-purple-400">💬</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/applications" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="text-[9px] font-bold text-rose-400 bg-rose-950/60 px-1.5 py-0.2 rounded">جديد</span>
                                        <span class="flex items-center gap-2"><span>التقديمات</span><span class="text-gray-400 group-hover:text-purple-400">📝</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- الإشراف والأمان (Security & Moderation) -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_security')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_security" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>الإشراف والأمان</span></span>
                                </button>
                                <div id="grp_security" class="space-y-1">
                                    <a href="/dashboard/${guildId}/automod" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الرقابة التلقائية</span><span class="text-gray-400 group-hover:text-purple-400">🤖</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/protection" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="flex items-center gap-1">
                                            <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                            <span class="text-amber-400 text-xs">👑</span>
                                        </span>
                                        <span class="flex items-center gap-2"><span>الحماية</span><span class="text-gray-400 group-hover:text-purple-400">🛡️</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/antiraid" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>مكافحة الغزو</span><span class="text-gray-400 group-hover:text-purple-400">🚨</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/staff-activity" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>نشاط الإدارة</span><span class="text-gray-400 group-hover:text-purple-400">👮</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- إدارة السيرفر (Server Management) -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_management')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_management" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>إدارة السيرفر</span></span>
                                </button>
                                <div id="grp_management" class="space-y-1">
                                    <a href="/dashboard/${guildId}/tempvoice" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الرومات المؤقتة</span><span class="text-gray-400 group-hover:text-purple-400">🕒</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/boost" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>البوستات</span><span class="text-gray-400 group-hover:text-purple-400">💎</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/colors" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الألوان</span><span class="text-gray-400 group-hover:text-purple-400">🎨</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/logs" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="text-[9px] font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded">تحديث</span>
                                        <span class="flex items-center gap-2"><span>السجلات</span><span class="text-gray-400 group-hover:text-purple-400">📜</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/tickets" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="flex items-center gap-1">
                                            <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                            <span class="text-amber-400 text-xs">👑</span>
                                        </span>
                                        <span class="flex items-center gap-2"><span>التذاكر</span><span class="text-gray-400 group-hover:text-purple-400">🎫</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- الترفيه والتفاعل (Entertainment) -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_fun')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_fun" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>الترفيه والتفاعل</span></span>
                                </button>
                                <div id="grp_fun" class="space-y-1">
                                    <a href="/dashboard/${guildId}/fun" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>تسلية</span><span class="text-gray-400 group-hover:text-purple-400">🎮</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/quran" class="flex items-center justify-between px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>القرآن & الراديو</span><span class="text-gray-400 group-hover:text-purple-400">📻</span></span>
                                    </a>
                                </div>
                            </div>

                        </div>

                        <!-- User Profile Bottom Bar (Novax Style) -->
                        <div class="p-3 border-t border-white/5">
                            <div class="bg-gradient-to-r from-purple-700 to-indigo-700 rounded-2xl p-2.5 flex items-center justify-between shadow-lg shadow-purple-950/40">
                                <div class="text-white/80 hover:text-white cursor-pointer px-1">
                                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z"/></svg>
                                </div>
                                <div class="flex items-center gap-2.5">
                                    <div class="text-right">
                                        <span class="text-xs font-black text-white block leading-tight truncate max-w-[110px]">${user.username}</span>
                                    </div>
                                    <img src="${userAvatar}" class="w-8 h-8 rounded-xl object-cover ring-2 ring-white/20 shadow-md">
                                </div>
                            </div>
                        </div>

                    </aside>

                    <!-- Server Rail Column (Far Right - Novax Style) -->
                    <div class="w-18 bg-[#05060a] border-l border-white/5 py-4 px-2 flex flex-col items-center gap-3 shrink-0 overflow-y-auto select-none">
                        <!-- Home Icon Button -->
                        <a href="/dashboard" title="الصفحة الرئيسية" class="w-12 h-12 rounded-2xl bg-[#12141f] hover:bg-purple-600/30 border border-white/5 hover:border-purple-500/50 flex items-center justify-center text-gray-300 hover:text-white transition shadow-lg mb-1 group">
                            <svg class="w-6 h-6 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                        </a>
                        <div class="w-8 h-[1px] bg-white/5"></div>
                        <!-- Active Server List Icons -->
                        ${serverRailHtml}
                    </div>

                </div>

                <script>
                function toggleNavGroup(groupId) {
                    const el = document.getElementById(groupId);
                    const arrow = document.getElementById('arrow_' + groupId);
                    if (!el) return;
                    el.classList.toggle('hidden');
                    if (arrow) arrow.classList.toggle('rotate-180');
                }
                </script>
            </body>
            </html>
            `);
        } catch (error) {
            console.error("Dashboard /dashboard/:guildId error:", error);
            res.status(500).send(`<pre style="color:red;background:#111;padding:20px;font-family:monospace">${error.stack || error.message || error}</pre>`);
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

    // 📢 إنشاء وحفظ الإعلانات والمذيع الآلي المجدول
    app.post('/api/guild/:guildId/broadcast/create', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { channel_ids, title, message, color, image_url, interval_minutes, scheduled_time, is_recurring } = req.body;

            if (!channel_ids || !message) {
                return res.status(400).json({ success: false, error: 'الرجاء تحديد قناة الإرسال ونص الإعلان' });
            }

            const created = database.createBroadcast({
                guild_id: guildId,
                channel_ids,
                title,
                message,
                color: color || '#9333ea',
                image_url,
                interval_minutes: parseInt(interval_minutes, 10) || 0,
                scheduled_time: scheduled_time ? new Date(scheduled_time).getTime() : 0,
                is_recurring: is_recurring ? 1 : 0,
                created_by: req.session.user.id,
                status: 'active'
            });

            // إرسال فوري مباشر إن لم تكن مجدولة لوقت لاحق
            if (!is_recurring && (!scheduled_time || new Date(scheduled_time).getTime() <= Date.now())) {
                const { sendBroadcastPayload } = require('../utils/broadcastScheduler');
                const guild = client.guilds.cache.get(guildId);
                if (guild) {
                    await sendBroadcastPayload(guild, created);
                    database.updateBroadcastLastSent(created.id, Date.now());
                }
            }

            res.json({ success: true, broadcast: created });
        } catch (e) {
            console.error('Broadcast create error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // حذف إعلان مجدول أو متكرر
    app.post('/api/guild/:guildId/broadcast/delete', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { id } = req.body;
            database.deleteBroadcast(id, guildId);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 🔗 إضافة بونص دعوات من لوحة التحكم
    app.post('/api/guild/:guildId/invites/add-bonus', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { userId, amount } = req.body;
            if (!userId || isNaN(amount)) return res.status(400).json({ success: false, error: 'User ID and Amount required' });
            database.addBonusInvites(guildId, userId, parseInt(amount, 10));
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // تصفير بيانات الدعوات
    app.post('/api/guild/:guildId/invites/reset', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { userId } = req.body;
            database.resetInvites(guildId, userId || null);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // صفحات فرعية لجميع الأزرار (Moderation, Automod, Welcome, Tickets, Protection)
    app.get('/dashboard/:guildId/:section', (req, res) => {
        try {
            if (!req.session?.user) return res.redirect('/auth/discord');
            const { guildId, section } = req.params;
            const guilds = req.session.guilds || [];

            // ─── Staff Activity Dashboard Page ───
            if (section === 'staff-activity') {
                const botGuild = client.guilds.cache.get(guildId);
                if (!botGuild) return res.redirect('/dashboard');

                const leaderboard = database.getStaffLeaderboard ? database.getStaffLeaderboard(guildId, 25) : [];
                const actionLogs  = database.getStaffActionLogs  ? database.getStaffActionLogs(guildId, 30) : [];
                const goals       = database.getStaffGoals        ? database.getStaffGoals(guildId) : [];
                const settings    = database.getGuildSettings(guildId);

                const guildRolesList = botGuild.roles.cache
                    .filter(r => r.name !== '@everyone')
                    .sort((a, b) => b.position - a.position)
                    .map(r => ({ id: r.id, name: r.name }));
                const roleOptionsHtml = '<option value="">-- بدون رتبة --</option>' + guildRolesList.map(r => '<option value="' + r.id + '"' + (settings.staff_role === r.id ? ' selected' : '') + '>@' + r.name + '</option>').join('');

                const textChannels = botGuild.channels.cache
                    .filter(c => c.isTextBased && c.isTextBased() && !c.isThread())
                    .sort((a, b) => a.rawPosition - b.rawPosition)
                    .map(c => ({ id: c.id, name: c.name }));
                const logChannelOptionsHtml = '<option value="">-- بدون روم --</option>' + textChannels.map(c => '<option value="' + c.id + '"' + (settings.staff_log_channel === c.id ? ' selected' : '') + '>#' + c.name + '</option>').join('');

                const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
                const actionIcons = { ticket_close: '🎫', ban: '🔨', kick: '👢', mute: '🔇', warn: '⚠️' };
                const actionNames = { ticket_close: 'إغلاق تذكرة', ban: 'حظر', kick: 'طرد', mute: 'كتم', warn: 'تحذير' };

                const leaderboardRows = leaderboard.length === 0
                    ? '<tr><td colspan="8" class="px-6 py-16 text-center text-gray-500"><div style="font-size:3rem;margin-bottom:12px">📭</div><div>لا توجد بيانات نشاط مسجلة للستاف بعد</div></td></tr>'
                    : leaderboard.map((s, i) => {
                        const score = Math.floor((s.tickets_closed * 25) + (s.mod_actions * 10) + (s.messages_count) + Math.floor(s.voice_seconds / 300));
                        const voiceH = (s.voice_seconds / 3600).toFixed(1);
                        const medal  = medals[i] || `#${i + 1}`;
                        const ach = [];
                        if (s.tickets_closed >= 100) ach.push('🏆');
                        else if (s.tickets_closed >= 25) ach.push('🎫');
                        if (s.streak_days >= 7) ach.push('🔥');
                        if (parseFloat(voiceH) >= 10) ach.push('🎙️');
                        return '<tr class="border-b border-purple-900/10 hover:bg-[#111322] transition">' +
                            '<td class="px-4 py-4 text-center text-xl">' + medal + '</td>' +
                            '<td class="px-4 py-4"><div class="flex items-center gap-3"><div class="w-9 h-9 rounded-full bg-purple-900/40 flex items-center justify-center text-gray-200 font-bold text-sm">' + (i + 1) + '</div><div><div class="font-bold text-white text-sm" id="name-' + s.user_id + '"><@' + s.user_id + '></div><div class="text-xs text-gray-500">' + ach.join(' ') + (ach.length ? ' ' : '') + s.user_id + '</div></div></div></td>' +
                            '<td class="px-4 py-4 text-center"><span class="font-bold text-amber-400">' + s.tickets_closed + '</span></td>' +
                            '<td class="px-4 py-4 text-center"><span class="font-bold text-rose-400">' + s.mod_actions + '</span></td>' +
                            '<td class="px-4 py-4 text-center text-gray-300">' + s.messages_count.toLocaleString() + '</td>' +
                            '<td class="px-4 py-4 text-center text-cyan-400">' + voiceH + 'h</td>' +
                            '<td class="px-4 py-4 text-center"><span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ' + (s.streak_days >= 7 ? 'bg-orange-500/20 text-orange-400' : 'bg-gray-700 text-gray-400') + '">🔥 ' + s.streak_days + 'd</span></td>' +
                            '<td class="px-4 py-4 text-center"><span class="font-black text-gray-200 text-sm">' + score + ' pts</span></td>' +
                            '</tr>';
                    }).join('');

                const logsHtml = actionLogs.length === 0
                    ? '<div class="text-center py-10 text-gray-500"><div style="font-size:2.5rem;margin-bottom:10px">📋</div><div>لا توجد سجلات إجراءات بعد</div></div>'
                    : actionLogs.map(l => {
                        const icon    = actionIcons[l.action_type]  || '⚡';
                        const aName   = actionNames[l.action_type]  || l.action_type;
                        const timeStr = new Date(l.created_at * 1000).toLocaleString('ar-SA');
                        const colMap  = { ticket_close: 'text-amber-400 bg-amber-500/10 border-amber-500/25', ban: 'text-rose-400 bg-rose-500/10 border-rose-500/25', kick: 'text-orange-400 bg-orange-500/10 border-orange-500/25', mute: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25', warn: 'text-blue-400 bg-blue-500/10 border-blue-500/25' };
                        const cls = colMap[l.action_type] || 'text-[#5865f2] bg-purple-500/10 border-purple-500/25';
                        return '<div class="flex items-start gap-4 p-4 border-b border-purple-900/10 hover:bg-[#11121c] transition">' +
                            '<div class="w-9 h-9 rounded-xl flex items-center justify-center text-lg border ' + cls + ' flex-shrink-0">' + icon + '</div>' +
                            '<div class="flex-1 min-w-0">' +
                                '<div class="flex items-center gap-2 flex-wrap">' +
                                    '<span class="font-bold text-white text-sm">' + aName + '</span>' +
                                    '<span class="text-xs px-2 py-0.5 rounded-full border ' + cls + '">' + icon + ' ' + aName + '</span>' +
                                '</div>' +
                                '<div class="text-xs text-gray-400 mt-1">الستاف: <span class="text-gray-200"><@' + l.staff_id + '></span>' + (l.target_id ? ' • ضد: <span class="text-gray-300"><@' + l.target_id + '></span>' : '') + '</div>' +
                                '<div class="text-xs text-gray-500 mt-0.5">السبب: ' + (l.reason || 'لم يُذكر') + (l.details ? ' • ' + l.details : '') + '</div>' +
                            '</div>' +
                            '<div class="text-xs text-gray-500 flex-shrink-0">' + timeStr + '</div>' +
                            '</div>';
                    }).join('');

                const defaultGoals = [
                    { title: 'إغلاق 20 تذكرة أسبوعياً', icon: '🎫', color: 'amber', target: 20, type: 'tickets_closed', reward: 150 },
                    { title: 'اتخاذ 15 إجراء إداري', icon: '🔨', color: 'rose', target: 15, type: 'mod_actions', reward: 100 },
                    { title: 'التواجد 10 ساعات صوتياً', icon: '🔊', color: 'cyan', target: 10, type: 'voice_hours', reward: 200 },
                    { title: 'نشاط متتالي لـ 7 أيام', icon: '🔥', color: 'orange', target: 7, type: 'streak_days', reward: 250 },
                    { title: 'إغلاق 100 تذكرة إجمالاً', icon: '🏆', color: 'yellow', target: 100, type: 'tickets_closed_total', reward: 500 },
                    { title: 'إرسال 500 رسالة في السيرفر', icon: '💬', color: 'blue', target: 500, type: 'messages_count', reward: 80 }
                ];

                const goalsHtml = defaultGoals.map(g => {
                    const topStaff = leaderboard[0];
                    let current = 0;
                    if (topStaff) {
                        if (g.type === 'tickets_closed' || g.type === 'tickets_closed_total') current = topStaff.tickets_closed;
                        else if (g.type === 'mod_actions') current = topStaff.mod_actions;
                        else if (g.type === 'voice_hours') current = parseFloat((topStaff.voice_seconds / 3600).toFixed(1));
                        else if (g.type === 'streak_days') current = topStaff.streak_days;
                        else if (g.type === 'messages_count') current = topStaff.messages_count;
                    }
                    const pct = Math.min(100, Math.floor((current / g.target) * 100));
                    const colorMap = { amber: '#f59e0b', rose: '#f43f5e', cyan: '#06b6d4', orange: '#f97316', yellow: '#eab308', blue: '#3b82f6' };
                    const col = colorMap[g.color] || '#7c3aed';
                    return '<div class="bg-[#0e0f1b] border border-white/5 rounded-2xl p-5">' +
                        '<div class="flex items-center justify-between mb-3">' +
                            '<div class="flex items-center gap-3">' +
                                '<div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style="background:' + col + '22;border:1px solid ' + col + '44">' + g.icon + '</div>' +
                                '<div><div class="font-bold text-white text-sm">' + g.title + '</div><div class="text-xs text-gray-500 mt-0.5">🏅 المكافأة: <span class="text-gray-200">' + g.reward + ' نقطة</span></div></div>' +
                            '</div>' +
                            '<span class="text-lg font-black" style="color:' + col + '">' + pct + '%</span>' +
                        '</div>' +
                        '<div class="w-full bg-[#1a1b2e] rounded-full h-2">' +
                            '<div class="h-2 rounded-full transition-all" style="width:' + pct + '%;background:' + col + '"></div>' +
                        '</div>' +
                        '<div class="flex justify-between text-xs text-gray-500 mt-1.5">' +
                            '<span>المتصدر: ' + current + '</span><span>الهدف: ' + g.target + '</span>' +
                        '</div>' +
                    '</div>';
                }).join('');

                return res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Staff Activity - ZENO Dashboard</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">

                <style>
                    :root {
                        --bg-main: #0b0d14;
                        --bg-sidebar: #10121b;
                        --bg-card: #151722;
                        --bg-card-hover: #1c1f2e;
                        --primary: #5865f2;
                        --primary-hover: #4752c4;
                        --border: rgba(255, 255, 255, 0.05);
                        --text-muted: #a3a6aa;
                    }
                    body { background-color: var(--bg-main) !important; color: #ffffff !important; font-family: 'Cairo', sans-serif !important; }
                    /* Scrollbar */
                    ::-webkit-scrollbar { width: 8px; height: 8px; }
                    ::-webkit-scrollbar-track { background: var(--bg-main); }
                    ::-webkit-scrollbar-thumb { background: #2f3146; border-radius: 10px; }
                    ::-webkit-scrollbar-thumb:hover { background: #40445f; }
                    
                    /* Glassmorphism & Cards */
                    .probot-card {
                        background: var(--bg-card) !important;
                        border: 1px solid var(--border) !important;
                        border-radius: 16px !important;
                        transition: all 0.3s ease !important;
                        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2) !important;
                    }
                    .probot-card:hover {
                        background: var(--bg-card-hover) !important;
                        border-color: rgba(88, 101, 242, 0.4) !important;
                        transform: translateY(-3px) !important;
                        box-shadow: 0 6px 25px rgba(0, 0, 0, 0.3) !important;
                    }
                    
                    /* Toggles */
                    .toggle { position: relative; display: inline-block; width: 44px; height: 24px; }
                    .toggle input { opacity: 0; width: 0; height: 0; }
                    .slider { position: absolute; cursor: pointer; inset: 0; background: #2f3146; border-radius: 24px; transition: .3s; }
                    .slider:before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .3s; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                    input:checked + .slider { background: var(--primary); }
                    input:checked + .slider:before { transform: translateX(20px); }
                    
                    /* Buttons */
                    .btn-primary {
                        background-color: var(--primary);
                        color: white;
                        transition: all 0.2s;
                    }
                    .btn-primary:hover {
                        background-color: var(--primary-hover);
                        box-shadow: 0 4px 15px rgba(88, 101, 242, 0.4);
                    }
                </style>

</head>
<body class="min-h-screen">

<!-- Header -->
<header style="height:60px;background:#0c0d14;border-bottom:1px solid rgba(139,92,246,0.15);padding:0 2rem;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50">
  <div style="display:flex;align-items:center;gap:16px">
    <a href="/dashboard/${guildId}" style="color:#94a3b8;font-size:0.82rem;text-decoration:none;display:flex;align-items:center;gap:6px">
      <span style="font-size:1.1rem">←</span> العودة للداشبورد
    </a>
    <span style="color:#2d2e40">|</span>
    <span style="font-size:0.75rem;color:#64748b">نشاط طاقم الإدارة</span>
  </div>
  <div style="display:flex;align-items:center;gap:10px">
    <span style="font-weight:900;color:white;font-size:0.9rem">ZENO</span>
  </div>
</header>

<div style="max-width:1200px;margin:0 auto;padding:2rem 1.5rem">

  <!-- Page Title -->
  <div style="margin-bottom:2rem">
    <h1 style="font-size:1.6rem;font-weight:900;color:white;margin:0 0 6px">👮 نشاط طاقم الإدارة</h1>
    <p style="font-size:0.85rem;color:#64748b;margin:0">إحصائيات شاملة، لوحة الشرف، سجل الإجراءات، الأهداف والإنجازات</p>
  </div>

  <!-- Quick Stats Row -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:2rem">
    <div class="stat-card" style="text-align:center">
      <div style="font-size:1.8rem;font-weight:900;color:#f59e0b">${leaderboard.reduce((s, m) => s + m.tickets_closed, 0)}</div>
      <div style="font-size:0.78rem;color:#94a3b8;margin-top:4px">🎫 إجمالي التذاكر المغلقة</div>
    </div>
    <div class="stat-card" style="text-align:center">
      <div style="font-size:1.8rem;font-weight:900;color:#f43f5e">${leaderboard.reduce((s, m) => s + m.mod_actions, 0)}</div>
      <div style="font-size:0.78rem;color:#94a3b8;margin-top:4px">🔨 إجمالي الإجراءات الإدارية</div>
    </div>
    <div class="stat-card" style="text-align:center">
      <div style="font-size:1.8rem;font-weight:900;color:#8b5cf6">${leaderboard.length}</div>
      <div style="font-size:0.78rem;color:#94a3b8;margin-top:4px">👮 أعضاء ستاف نشطون</div>
    </div>
    <div class="stat-card" style="text-align:center">
      <div style="font-size:1.8rem;font-weight:900;color:#06b6d4">${(leaderboard.reduce((s, m) => s + m.voice_seconds, 0) / 3600).toFixed(0)}</div>
      <div style="font-size:0.78rem;color:#94a3b8;margin-top:4px">🔊 ساعات التواجد الصوتي</div>
    </div>
  </div>

  <!-- Tab Navigation -->
  <div style="display:flex;gap:6px;margin-bottom:1.5rem;background:#0c0d14;border:1px solid rgba(139,92,246,0.12);border-radius:14px;padding:6px;width:fit-content">
    <button class="tab-btn active" onclick="switchTab('leaderboard', this)">🏆 لوحة الشرف</button>
    <button class="tab-btn" onclick="switchTab('logs', this)">📝 سجل الإجراءات</button>
    <button class="tab-btn" onclick="switchTab('goals', this)">🎯 الأهداف والإنجازات</button>
    <button class="tab-btn" onclick="switchTab('settings', this)">⚙️ الإعدادات</button>
  </div>

  <!-- Leaderboard Tab -->
  <div id="tab-leaderboard">
    <div style="background:#0e0f1b;border:1px solid rgba(139,92,246,0.15);border-radius:18px;overflow:hidden">
      <div style="padding:1.25rem 1.5rem;border-bottom:1px solid rgba(139,92,246,0.1);display:flex;align-items:center;justify-content:space-between">
        <div>
          <h2 style="font-size:1rem;font-weight:800;color:white;margin:0">🏆 ترتيب طاقم الإدارة حسب النشاط</h2>
          <p style="font-size:0.75rem;color:#64748b;margin:4px 0 0">يُحتسب الترتيب بناءً على التذاكر (×25) + الإجراءات (×10) + الرسائل (×1) + الصوت (×1/5دق)</p>
        </div>
        <button onclick="location.reload()" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.25);border-radius:10px;padding:0.5rem 1rem;color:#a78bfa;font-family:'Cairo',sans-serif;font-size:0.8rem;font-weight:700;cursor:pointer">🔄 تحديث</button>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
          <thead>
            <tr style="background:#0c0d16;color:#64748b;font-size:0.75rem">
              <th style="padding:12px 16px;text-align:center">#</th>
              <th style="padding:12px 16px;text-align:right">عضو الستاف</th>
              <th style="padding:12px 16px;text-align:center">🎫 تذاكر</th>
              <th style="padding:12px 16px;text-align:center">🔨 إجراءات</th>
              <th style="padding:12px 16px;text-align:center">💬 رسائل</th>
              <th style="padding:12px 16px;text-align:center">🔊 صوت</th>
              <th style="padding:12px 16px;text-align:center">🔥 Streak</th>
              <th style="padding:12px 16px;text-align:center">📈 تقييم</th>
            </tr>
          </thead>
          <tbody id="lb-body">${leaderboardRows}</tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Logs Tab -->
  <div id="tab-logs" style="display:none">
    <div style="background:#0e0f1b;border:1px solid rgba(139,92,246,0.15);border-radius:18px;overflow:hidden">
      <div style="padding:1.25rem 1.5rem;border-bottom:1px solid rgba(139,92,246,0.1)">
        <h2 style="font-size:1rem;font-weight:800;color:white;margin:0">📝 سجل الإجراءات الإدارية (آخر 30 إجراء)</h2>
        <p style="font-size:0.75rem;color:#64748b;margin:4px 0 0">يتم التسجيل تلقائياً عند كل باند، طرد، كتم، تحذير، أو إغلاق تذكرة</p>
      </div>
      <div id="logs-container">${logsHtml}</div>
    </div>
  </div>

  <!-- Goals Tab -->
  <div id="tab-goals" style="display:none">
    <div style="margin-bottom:1.25rem;display:flex;align-items:center;justify-content:space-between">
      <div>
        <h2 style="font-size:1rem;font-weight:800;color:white;margin:0">🎯 أهداف الستاف وإنجازاتهم</h2>
        <p style="font-size:0.78rem;color:#64748b;margin:4px 0 0">البار يعكس أفضل نشاط لعضو واحد مقارنةً بالهدف المطلوب</p>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem">${goalsHtml}</div>
    
    <!-- Achievements Legend -->
    <div style="margin-top:2rem;background:#0e0f1b;border:1px solid rgba(139,92,246,0.15);border-radius:18px;padding:1.5rem">
      <h3 style="font-size:0.95rem;font-weight:800;color:white;margin:0 0 1rem">🏅 الإنجازات والألقاب</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0.75rem">
        ${[
          { icon: '🏆', title: 'بطل التذاكر', desc: 'أغلق 100+ تذكرة', color: '#f59e0b' },
          { icon: '🎫', title: 'خبير الدعم', desc: 'أغلق 25+ تذكرة', color: '#f97316' },
          { icon: '🛡️', title: 'حارس السيرفر', desc: '50+ إجراء إداري', color: '#ef4444' },
          { icon: '🔥', title: 'وحش الاستمرارية', desc: '7+ أيام Streak', color: '#f97316' },
          { icon: '🎙️', title: 'عملاق الرومات', desc: '10+ ساعات صوتية', color: '#06b6d4' },
          { icon: '⭐', title: 'ستاف مميز', desc: '500+ نقطة مكافأة', color: '#8b5cf6' }
        ].map(a => '<div style="background:#11121e;border:1px solid rgba(139,92,246,0.12);border-radius:12px;padding:0.9rem;display:flex;align-items:center;gap:10px"><div style="font-size:1.5rem;width:36px;text-align:center">' + a.icon + '</div><div><div style="font-weight:800;color:white;font-size:0.82rem">' + a.title + '</div><div style="font-size:0.73rem;color:#64748b;margin-top:2px">' + a.desc + '</div></div></div>').join('')}
      </div>
    </div>
  </div>

  <!-- Settings Tab -->
  <div id="tab-settings" style="display:none">
    <div style="background:#0e0f1b;border:1px solid rgba(139,92,246,0.15);border-radius:18px;padding:1.75rem">
      <h2 style="font-size:1rem;font-weight:800;color:white;margin:0 0 1.5rem">⚙️ إعدادات نظام متابعة الستاف</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem">
        <div>
          <label>👮 رتبة الستاف (لتتبع نشاطهم تلقائياً)</label>
          <select id="staff-role" onchange="saveSetting('staff_role', this.value)">${roleOptionsHtml}</select>
          <p style="font-size:0.73rem;color:#64748b;margin-top:6px">سيتم تتبع رسائل وصوت أصحاب هذه الرتبة تلقائياً</p>
        </div>
        <div>
          <label>📢 روم سجل إجراءات الستاف</label>
          <select id="staff-log-ch" onchange="saveSetting('staff_log_channel', this.value)">${logChannelOptionsHtml}</select>
          <p style="font-size:0.73rem;color:#64748b;margin-top:6px">سيُرسل إشعار في هذا الروم عند اتخاذ أي إجراء إداري</p>
        </div>
        <div>
          <label>🚨 تنبيه عدم النشاط (بعد كم يوم؟)</label>
          <input type="number" id="inactive-days" placeholder="مثال: 7 (0 = مطفئ)" min="0" max="30" value="${settings.staff_inactive_days || 7}" onchange="saveSetting('staff_inactive_days', this.value)">
        </div>
        <div>
          <label>💰 تفعيل نظام نقاط المكافآت للستاف</label>
          <div style="display:flex;align-items:center;gap:12px;margin-top:10px">
            <label class="toggle" style="position:relative;width:44px;height:24px;display:inline-block"><input type="checkbox" ${settings.staff_rewards_enabled != 0 ? 'checked' : ''} onchange="saveSetting('staff_rewards_enabled', this.checked ? 1 : 0)"><span class="slider" style="position:absolute;cursor:pointer;inset:0;background:#232433;border-radius:24px;transition:.3s"></span></label>
            <span style="font-size:0.82rem;color:#94a3b8">تفعيل نقاط المكافآت</span>
          </div>
        </div>
      </div>

      <div style="margin-top:1.5rem;padding:1rem;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.2);border-radius:14px">
        <div style="font-weight:800;color:#f87171;font-size:0.85rem;margin-bottom:8px">🗑️ منطقة الخطر (Danger Zone)</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button onclick="if(confirm('سيتم تصفير إحصائيات جميع الستاف. هل أنت متأكد؟')) resetAll()" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:0.5rem 1.1rem;color:#f87171;font-family:'Cairo',sans-serif;font-size:0.8rem;font-weight:700;cursor:pointer">🔄 تصفير إحصائيات الكل</button>
        </div>
      </div>
    </div>
  </div>

</div>


                <style>
                    :root {
                        --bg-main: #0b0d14;
                        --bg-sidebar: #10121b;
                        --bg-card: #151722;
                        --bg-card-hover: #1c1f2e;
                        --primary: #5865f2;
                        --primary-hover: #4752c4;
                        --border: rgba(255, 255, 255, 0.05);
                        --text-muted: #a3a6aa;
                    }
                    body { background-color: var(--bg-main) !important; color: #ffffff !important; font-family: 'Cairo', sans-serif !important; }
                    /* Scrollbar */
                    ::-webkit-scrollbar { width: 8px; height: 8px; }
                    ::-webkit-scrollbar-track { background: var(--bg-main); }
                    ::-webkit-scrollbar-thumb { background: #2f3146; border-radius: 10px; }
                    ::-webkit-scrollbar-thumb:hover { background: #40445f; }
                    
                    /* Glassmorphism & Cards */
                    .probot-card {
                        background: var(--bg-card) !important;
                        border: 1px solid var(--border) !important;
                        border-radius: 16px !important;
                        transition: all 0.3s ease !important;
                        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2) !important;
                    }
                    .probot-card:hover {
                        background: var(--bg-card-hover) !important;
                        border-color: rgba(88, 101, 242, 0.4) !important;
                        transform: translateY(-3px) !important;
                        box-shadow: 0 6px 25px rgba(0, 0, 0, 0.3) !important;
                    }
                    
                    /* Toggles */
                    .toggle { position: relative; display: inline-block; width: 44px; height: 24px; }
                    .toggle input { opacity: 0; width: 0; height: 0; }
                    .slider { position: absolute; cursor: pointer; inset: 0; background: #2f3146; border-radius: 24px; transition: .3s; }
                    .slider:before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .3s; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                    input:checked + .slider { background: var(--primary); }
                    input:checked + .slider:before { transform: translateX(20px); }
                    
                    /* Buttons */
                    .btn-primary {
                        background-color: var(--primary);
                        color: white;
                        transition: all 0.2s;
                    }
                    .btn-primary:hover {
                        background-color: var(--primary-hover);
                        box-shadow: 0 4px 15px rgba(88, 101, 242, 0.4);
                    }
                </style>


<script>
function switchTab(tabName, btn) {
  document.querySelectorAll('[id^="tab-"]').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tabName).style.display = 'block';
  btn.classList.add('active');
}

async function saveSetting(key, value) {
  try {
    const res = await fetch('/api/guild/${guildId}/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) });
    const data = await res.json();
    if (data.success) showToast('✅ تم حفظ الإعداد بنجاح');
    else showToast('❌ فشل في الحفظ: ' + data.error, true);
  } catch (e) { showToast('❌ خطأ في الاتصال', true); }
}

async function resetAll() {
  try {
    const res = await fetch('/api/guild/${guildId}/staff/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();
    if (data.success) { showToast('✅ تم تصفير جميع الإحصائيات'); setTimeout(() => location.reload(), 1500); }
    else showToast('❌ فشل: ' + data.error, true);
  } catch (e) { showToast('❌ خطأ في الاتصال', true); }
}

function showToast(msg, isErr = false) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:' + (isErr ? '#7f1d1d' : '#14532d') + ';color:' + (isErr ? '#fca5a5' : '#86efac') + ';padding:10px 20px;border-radius:12px;font-weight:700;font-family:Cairo,sans-serif;font-size:0.85rem;z-index:9999;border:1px solid ' + (isErr ? '#ef4444' : '#22c55e') + '40;box-shadow:0 4px 20px rgba(0,0,0,0.4)';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
</script>
</body>
</html>`);
            }

            // ─── Social Notifier (removed) ─── keep fallthrough for section handler
            if (section === 'social' || section === 'notifier') {
                return res.redirect('/dashboard/' + guildId);
            }

            // ─── Social Notifier: صفحة NotifyMe Style ───
            if (section === '__old_social__') {
                const botGuild = client.guilds.cache.get(guildId);
                if (!botGuild) return res.redirect('/dashboard');
                const allFeeds = database.getGuildSocialFeeds ? (database.getGuildSocialFeeds(guildId) || []) : [];
                const textChannels = botGuild.channels.cache
                    .filter(c => c.isTextBased && c.isTextBased() && !c.isThread())
                    .sort((a, b) => a.rawPosition - b.rawPosition)
                    .map(c => ({ id: c.id, name: c.name }));
                const guildRolesList = botGuild.roles.cache
                    .filter(r => r.name !== '@everyone')
                    .sort((a, b) => b.position - a.position)
                    .map(r => ({ id: r.id, name: r.name }));

                const channelOptionsHtml = textChannels.map(c => '<option value="' + c.id + '">#' + c.name + '</option>').join('');
                const roleOptionsHtml = '<option value="">-- بدون منشن --</option>' + guildRolesList.map(r => '<option value="' + r.id + '">@' + r.name + '</option>').join('');

                const platforms = [
                    { id: 'youtube', name: 'YouTube', icon: '▶', color: '#FF0000', bg: '#1a0000' },
                    { id: 'twitch',  name: 'Twitch',  icon: '◉', color: '#9146FF', bg: '#0d0019' },
                    { id: 'tiktok',  name: 'TikTok',  icon: '♪', color: '#00F2FE', bg: '#001a1c' }
                ];

                const feedsJson = JSON.stringify(allFeeds);
                const channelsJson = JSON.stringify(textChannels);
                const rolesJson = JSON.stringify(guildRolesList);
                const botIcon = botGuild.iconURL ? (botGuild.iconURL() || 'https://cdn.discordapp.com/embed/avatars/0.png') : 'https://cdn.discordapp.com/embed/avatars/0.png';

                const platformsHtml = platforms.map(p => 
                    '<div>' +
                        '<button class="platform-btn" id="plat-' + p.id + '" onclick="selectPlatform(\'' + p.id + '\')">' +
                            '<span class="platform-icon" style="background:' + p.bg + ';color:' + p.color + ';">' + p.icon + '</span>' +
                            '<span>' + p.name + '</span>' +
                            '<span id="count-' + p.id + '" style="margin-right:auto;background:rgba(139,92,246,0.2);color:#c4b5fd;border-radius:20px;padding:2px 8px;font-size:0.7rem;font-weight:bold;" class="hidden">0</span>' +
                        '</button>' +
                        '<div id="sub-' + p.id + '" class="hidden">' +
                            '<button class="sub-btn active" id="sub-' + p.id + '-accounts" onclick="selectSubPage(\'' + p.id + '\',\'accounts\')">' +
                                '<span style="margin-left:8px;">👥</span> الحسابات' +
                            '</button>' +
                            '<button class="sub-btn" id="sub-' + p.id + '-settings" onclick="selectSubPage(\'' + p.id + '\',\'settings\')">' +
                                '<span style="margin-left:8px;">✨</span> تخصيص الإشعارات' +
                            '</button>' +
                        '</div>' +
                    '</div>'
                ).join('');

                return res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Social Notifier - ZENO Dashboard</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">

                <style>
                    :root {
                        --bg-main: #0b0d14;
                        --bg-sidebar: #10121b;
                        --bg-card: #151722;
                        --bg-card-hover: #1c1f2e;
                        --primary: #5865f2;
                        --primary-hover: #4752c4;
                        --border: rgba(255, 255, 255, 0.05);
                        --text-muted: #a3a6aa;
                    }
                    body { background-color: var(--bg-main) !important; color: #ffffff !important; font-family: 'Cairo', sans-serif !important; }
                    /* Scrollbar */
                    ::-webkit-scrollbar { width: 8px; height: 8px; }
                    ::-webkit-scrollbar-track { background: var(--bg-main); }
                    ::-webkit-scrollbar-thumb { background: #2f3146; border-radius: 10px; }
                    ::-webkit-scrollbar-thumb:hover { background: #40445f; }
                    
                    /* Glassmorphism & Cards */
                    .probot-card {
                        background: var(--bg-card) !important;
                        border: 1px solid var(--border) !important;
                        border-radius: 16px !important;
                        transition: all 0.3s ease !important;
                        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2) !important;
                    }
                    .probot-card:hover {
                        background: var(--bg-card-hover) !important;
                        border-color: rgba(88, 101, 242, 0.4) !important;
                        transform: translateY(-3px) !important;
                        box-shadow: 0 6px 25px rgba(0, 0, 0, 0.3) !important;
                    }
                    
                    /* Toggles */
                    .toggle { position: relative; display: inline-block; width: 44px; height: 24px; }
                    .toggle input { opacity: 0; width: 0; height: 0; }
                    .slider { position: absolute; cursor: pointer; inset: 0; background: #2f3146; border-radius: 24px; transition: .3s; }
                    .slider:before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .3s; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                    input:checked + .slider { background: var(--primary); }
                    input:checked + .slider:before { transform: translateX(20px); }
                    
                    /* Buttons */
                    .btn-primary {
                        background-color: var(--primary);
                        color: white;
                        transition: all 0.2s;
                    }
                    .btn-primary:hover {
                        background-color: var(--primary-hover);
                        box-shadow: 0 4px 15px rgba(88, 101, 242, 0.4);
                    }
                </style>

</head>
<body>
<div style="display:flex; min-height:100vh;">

<!-- ═══ SIDEBAR ═══ -->
<div class="sidebar">
    <!-- Guild Header -->
    <div style="padding: 0 16px 14px; display:flex; align-items:center; justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:10px;">
            <img src="${botIcon}" style="width:36px;height:36px;border-radius:10px;object-fit:cover;" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
            <div>
                <div style="font-size:0.85rem;font-weight:800;color:#f1f5f9;max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${botGuild.name}</div>
                <div style="font-size:0.7rem;color:#64748b;">Social Notifier</div>
            </div>
        </div>
        <a href="/dashboard/${guildId}" title="العودة للداشبورد" style="color:#64748b;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,0.05);transition:all 0.2s;">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        </a>
    </div>
    <div class="divider"></div>

    <!-- Platforms -->
    <div style="padding: 4px 0;">
        <div style="padding:4px 20px 8px;font-size:0.7rem;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">المنصات التفاعلية</div>
        ${platformsHtml}
    </div>

    <div class="divider"></div>

    <div style="padding: 0 14px;">
        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="sub-btn" style="width:100%;margin:0;">
            <span style="margin-left:8px;">🎧</span> الدعم الفني
        </a>
        <a href="/dashboard/${guildId}" class="sub-btn" style="width:100%;margin:4px 0 0;">
            <span style="margin-left:8px;">🔙</span> لوحة التحكم
        </a>
    </div>
</div>

<!-- ═══ CONTENT ═══ -->
<div class="content">

    <!-- Premium / Features Bar Style NotifyMe -->
    <div class="banner-promo">
        <div style="display:flex; align-items:center; gap:12px;">
            <button class="btn-primary" style="background:#2563eb;" onclick="openAddModal()">
                🚀 إضافة تنبيه الآن
            </button>
        </div>
        <div style="display:flex; align-items:center; gap:20px; flex-wrap:wrap;">
            <div class="banner-badge"><svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg> إشعارات فورية</div>
            <div class="banner-badge"><svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg> حسابات غير محدودة</div>
            <div class="banner-badge"><svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg> تخصيص الرسائل والإيمبد</div>
            <div class="banner-badge"><svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg> منع التكرار الذكي</div>
        </div>
    </div>

    <!-- Header Section -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:16px;">
        <div style="display:flex;align-items:center;gap:14px;">
            <h1 id="hdr-breadcrumb" style="font-size:1.4rem;font-weight:900;color:white;margin:0;display:flex;align-items:center;gap:8px;">
                <span id="hdr-plat-name">YouTube</span>
                <span style="color:#64748b;">›</span>
                <span id="hdr-sub-name" style="color:#94a3b8;">Accounts</span>
                <span id="hdr-count-badge" style="background:rgba(59,130,246,0.15);color:#60a5fa;border-radius:20px;padding:2px 10px;font-size:0.75rem;font-weight:800;">0/10</span>
            </h1>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
            <button onclick="location.reload()" class="btn-secondary" style="display:inline-flex;align-items:center;gap:6px;font-size:0.8rem;padding:0.6rem 1rem;">
                🔄 تحديث البيانات
            </button>
            <button id="btn-add-account" onclick="openAddModal()" class="btn-primary">
                + Add Account
            </button>
        </div>
    </div>

    <!-- Search Bar -->
    <div style="margin-bottom: 20px;">
        <div style="position:relative;">
            <svg style="position:absolute;right:14px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:#64748b;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/></svg>
            <input id="searchInput" type="text" placeholder="Search accounts..." class="search-box" oninput="filterFeeds()">
        </div>
    </div>

    <!-- Accounts View -->
    <div id="view-accounts">
        <div id="empty-state" style="text-align:center;padding:60px 20px;background:#11121c;border:1px dashed rgba(139,92,246,0.2);border-radius:16px;">
            <div style="font-size:3.5rem;margin-bottom:12px;">📭</div>
            <div style="font-size:1.1rem;font-weight:800;color:#e2e8f0;margin-bottom:6px;">لا توجد حسابات مضافة لهذه المنصة</div>
            <div style="font-size:0.82rem;color:#64748b;margin-bottom:18px;">أضف حسابك لتصلك إشعارات فورية بمجرد نشر أي فيديو أو بدء بث!</div>
            <button onclick="openAddModal()" class="btn-primary">+ إضافة حساب الآن</button>
        </div>
        <div id="accounts-container" class="card" style="display:none;overflow:hidden;">
            <div id="accounts-list"></div>
        </div>
    </div>

    <!-- Settings / Customization View -->
    <div id="view-settings" style="display:none;">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Messages Template -->
            <div class="card" style="padding:24px;">
                <h2 style="font-size:1.05rem;font-weight:800;margin:0 0 16px;color:white;display:flex;align-items:center;gap:8px;">
                    📝 تخصيص نصوص الإشعار
                </h2>
                <div style="display:grid;gap:16px;">
                    <div>
                        <label>رسالة الفيديو الجديد (Video Message)</label>
                        <input type="text" id="setting-video-msg" value="**{channel}** just posted a new video! 🔥">
                    </div>
                    <div>
                        <label>رسالة البث المباشر (Live Message)</label>
                        <input type="text" id="setting-live-msg" value="**{channel}** is live now! 🔴">
                    </div>
                </div>
                <div style="background:rgba(139,92,246,0.08);border-radius:12px;padding:12px;margin-top:16px;font-size:0.75rem;color:#94a3b8;">
                    <span style="color:#c4b5fd;font-weight:bold;">المتغيرات المتاحة:</span><br>
                    • <code>{channel}</code> : اسم الحساب/القناة<br>
                    • <code>{title}</code> : عنوان المقطع أو البث<br>
                    • <code>{url}</code> : رابط المشاهدة المباشر
                </div>
            </div>

            <!-- Embed Preview Style -->
            <div class="card" style="padding:24px;">
                <h2 style="font-size:1.05rem;font-weight:800;margin:0 0 16px;color:white;display:flex;align-items:center;gap:8px;">
                    🎨 معاينة الإيمبد (Embed Preview)
                </h2>
                <div style="background:#1a1c26;border-right:4px solid #3b82f6;border-radius:12px;padding:16px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <span style="font-size:1.1rem;">📺</span>
                        <span style="font-weight:800;font-size:0.85rem;color:#60a5fa;">ZENO Social Notifier</span>
                    </div>
                    <div style="font-weight:800;font-size:0.95rem;color:white;margin-bottom:6px;">🎉 فيديو جديد نزل على القناة!</div>
                    <div style="font-size:0.78rem;color:#94a3b8;margin-bottom:12px;">اضغط على الرابط بالأسفل للمشاهدة الآن والتفاعل.</div>
                    <div style="background:#0f1017;height:120px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#475569;font-size:0.8rem;border:1px dashed rgba(255,255,255,0.1);">
                        صورة الفيديو (Thumbnail) 🖼️
                    </div>
                </div>
            </div>
        </div>
    </div>

</div>
</div>

<!-- ═══ ADD ACCOUNT MODAL ═══ -->
<div class="modal-bg" id="addModal">
<div class="modal">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <h2 id="modal-title" style="font-size:1.15rem;font-weight:900;color:white;margin:0;">Add YouTube Account</h2>
        <button onclick="closeAddModal()" style="background:rgba(255,255,255,0.08);color:#94a3b8;border:none;width:32px;height:32px;border-radius:10px;cursor:pointer;font-size:1.1rem;display:flex;align-items:center;justify-content:center;">✕</button>
    </div>

    <div style="display:grid;gap:16px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
                <label>Account URL أو المعرف *</label>
                <input id="acc-url" type="text" placeholder="https://youtube.com/@...">
            </div>
            <div>
                <label>Account Status *</label>
                <select id="acc-status">
                    <option value="running">🟢 Running (مفعل)</option>
                    <option value="paused">⏸ Paused (موقوف)</option>
                </select>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
                <label>Discord Channel *</label>
                <select id="acc-channel">${channelOptionsHtml}</select>
            </div>
            <div>
                <label>Ping Role (منشن رول)</label>
                <select id="acc-role">${roleOptionsHtml}</select>
            </div>
        </div>
        <div>
            <label>Video Message (رسالة مخصصة)</label>
            <input id="acc-message" type="text" placeholder="**{channel}** just posted a new video! 🔥">
        </div>
    </div>

    <div id="add-status" style="display:none;margin-top:14px;font-size:0.85rem;padding:12px 16px;border-radius:12px;"></div>

    <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:24px;">
        <button onclick="closeAddModal()" class="btn-secondary">Cancel</button>
        <button onclick="submitAddFeed()" class="btn-primary" id="btn-submit-add">Add Account</button>
    </div>
</div>
</div>

<script>
const GID = '${guildId}';
let allFeeds = ${feedsJson};
let textChannels = ${channelsJson};
let guildRoles = ${rolesJson};
let currentPlatform = 'youtube';
let currentSubPage = 'accounts';

const platformMeta = {
    youtube: { name: 'YouTube', icon: '▶', color: '#FF0000', badge: 'badge-yt', placeholder: 'https://youtube.com/@Channel أو معرف القناة' },
    twitch:  { name: 'Twitch',  icon: '◉', color: '#9146FF', badge: 'badge-tw', placeholder: 'https://twitch.tv/username' },
    tiktok:  { name: 'TikTok',  icon: '♪', color: '#00F2FE', badge: 'badge-tt', placeholder: 'https://tiktok.com/@username' }
};

function updateCounts() {
    ['youtube','twitch','tiktok'].forEach(p => {
        const cnt = allFeeds.filter(f => f.platform === p).length;
        const el = document.getElementById('count-' + p);
        if (cnt > 0) { el.textContent = cnt; el.classList.remove('hidden'); }
        else el.classList.add('hidden');
    });
}

function selectPlatform(p) {
    currentPlatform = p;
    ['youtube','twitch','tiktok'].forEach(id => {
        const btn = document.getElementById('plat-' + id);
        if (btn) btn.classList.remove('active');
        const sub = document.getElementById('sub-' + id);
        if (sub) sub.classList.add('hidden');
    });
    const platBtn = document.getElementById('plat-' + p);
    if (platBtn) platBtn.classList.add('active');
    const subContainer = document.getElementById('sub-' + p);
    if (subContainer) subContainer.classList.remove('hidden');

    const meta = platformMeta[p] || platformMeta.youtube;
    document.getElementById('hdr-plat-name').textContent = meta.name;
    document.getElementById('modal-title').textContent = 'Add ' + meta.name + ' Account';
    document.getElementById('acc-url').placeholder = meta.placeholder;

    selectSubPage(p, 'accounts');
}

function selectSubPage(p, sub) {
    currentSubPage = sub;
    ['accounts','settings'].forEach(s => {
        const el = document.getElementById('sub-' + p + '-' + s);
        if (el) el.classList.remove('active');
    });
    const activeEl = document.getElementById('sub-' + p + '-' + sub);
    if (activeEl) activeEl.classList.add('active');

    document.getElementById('hdr-sub-name').textContent = sub === 'accounts' ? 'Accounts' : 'Customize Notifications';

    if (sub === 'accounts') {
        document.getElementById('view-accounts').style.display = '';
        document.getElementById('view-settings').style.display = 'none';
        renderFeeds();
    } else {
        document.getElementById('view-accounts').style.display = 'none';
        document.getElementById('view-settings').style.display = '';
    }
}

function renderFeeds(query = '') {
    if (!currentPlatform) return;
    const filtered = allFeeds.filter(f =>
        f.platform === currentPlatform &&
        (f.account_id.toLowerCase().includes(query.toLowerCase()) || !query)
    );
    const container = document.getElementById('accounts-container');
    const empty = document.getElementById('empty-state');
    const list = document.getElementById('accounts-list');
    const badgeEl = document.getElementById('hdr-count-badge');

    const platformFeedsCount = allFeeds.filter(f => f.platform === currentPlatform).length;
    badgeEl.textContent = platformFeedsCount + '/10';

    if (filtered.length === 0) {
        container.style.display = 'none';
        empty.style.display = '';
    } else {
        empty.style.display = 'none';
        container.style.display = '';
        const channelMap = Object.fromEntries(textChannels.map(c => [c.id, c.name]));
        list.innerHTML = filtered.map(f => {
            const chName = channelMap[f.channel_id] ? '#' + channelMap[f.channel_id] : f.channel_id;
            const meta = platformMeta[f.platform] || {};
            return '<div class="account-row" id="row-' + f.id + '">' +
                '<div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0;">' +
                    '<div class="status-dot ' + (f.enabled ? 'active' : 'paused') + '" title="' + (f.enabled ? 'Running' : 'Paused') + '"></div>' +
                    '<div style="font-size:1.5rem;">' + (meta.icon || '🔔') + '</div>' +
                    '<div style="min-width:0;">' +
                        '<div style="font-weight:800;color:white;font-size:0.92rem;display:flex;align-items:center;gap:8px;">' +
                            '<span>@' + f.account_id + '</span>' +
                            '<span class="badge ' + (meta.badge || '') + '">' + (meta.name || f.platform) + '</span>' +
                        '</div>' +
                        '<div style="font-size:0.78rem;color:#64748b;margin-top:2px;">' +
                            '<span style="color:#a78bfa;">' + chName + '</span>' + (f.custom_message ? ' • "' + f.custom_message + '"' : '') +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">' +
                    '<label class="toggle" title="' + (f.enabled ? 'إيقاف' : 'تشغيل') + '">' +
                        '<input type="checkbox" ' + (f.enabled ? 'checked' : '') + ' onchange="toggleFeed(' + f.id + ', this.checked)">' +
                        '<span class="slider"></span>' +
                    '</label>' +
                    '<button onclick="testFeedBtn(' + f.id + ')" class="btn-test">🧪 Test</button>' +
                    '<button onclick="deleteFeedBtn(' + f.id + ')" class="btn-danger">🗑️ Delete</button>' +
                '</div>' +
            '</div>';
        }).join('');
    }
}

function filterFeeds() {
    const q = document.getElementById('searchInput').value;
    renderFeeds(q);
}

function openAddModal() {
    document.getElementById('addModal').classList.add('show');
    document.getElementById('acc-url').value = '';
    document.getElementById('acc-message').value = '';
    document.getElementById('acc-status').value = 'running';
    document.getElementById('add-status').style.display = 'none';
}

function closeAddModal() {
    document.getElementById('addModal').classList.remove('show');
}

async function submitAddFeed() {
    const url = document.getElementById('acc-url').value.trim();
    const channelId = document.getElementById('acc-channel').value;
    const roleId = document.getElementById('acc-role').value;
    const message = document.getElementById('acc-message').value.trim();
    const statusVal = document.getElementById('acc-status').value;
    const statusEl = document.getElementById('add-status');

    if (!url) {
        statusEl.textContent = '❌ أدخل رابط الحساب أو المعرف!';
        statusEl.style.cssText = 'display:block;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#f87171;border-radius:12px;padding:12px 16px;';
        return;
    }

    const btn = document.getElementById('btn-submit-add');
    btn.disabled = true; btn.textContent = 'Adding...';

    try {
        const r = await fetch('/api/guild/' + GID + '/social/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform: currentPlatform, account: url, channelId, roleId, message, enabled: statusVal === 'running' ? 1 : 0 })
        });
        const d = await r.json();
        if (d.success) {
            statusEl.textContent = '✅ تمت إضافة الحساب بنجاح!';
            statusEl.style.cssText = 'display:block;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);color:#4ade80;border-radius:12px;padding:12px 16px;';
            if (d.feed) { allFeeds.push(d.feed); updateCounts(); renderFeeds(); }
            setTimeout(() => closeAddModal(), 1200);
        } else {
            statusEl.textContent = '❌ خطأ: ' + d.error;
            statusEl.style.cssText = 'display:block;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#f87171;border-radius:12px;padding:12px 16px;';
        }
    } catch(e) {
        statusEl.textContent = '❌ خطأ في الاتصال: ' + e.message;
        statusEl.style.cssText = 'display:block;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#f87171;border-radius:12px;padding:12px 16px;';
    }
    btn.disabled = false; btn.textContent = 'Add Account';
}

async function deleteFeedBtn(id) {
    if (!confirm('هل أنت متأكد من حذف هذا الحساب؟')) return;
    const r = await fetch('/api/guild/' + GID + '/social/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    const d = await r.json();
    if (d.success) {
        allFeeds = allFeeds.filter(f => f.id !== id);
        updateCounts();
        renderFeeds();
    } else alert('❌ خطأ: ' + d.error);
}

async function toggleFeed(id, enable) {
    const r = await fetch('/api/guild/' + GID + '/social/toggle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enable: enable ? 1 : 0 })
    });
    const d = await r.json();
    if (d.success) {
        const feed = allFeeds.find(f => f.id === id);
        if (feed) feed.enabled = enable ? 1 : 0;
        renderFeeds();
    } else alert('❌ خطأ: ' + d.error);
}

async function testFeedBtn(id) {
    const btn = event.target;
    btn.disabled = true; btn.textContent = '⏳ Testing...';
    const r = await fetch('/api/guild/' + GID + '/social/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    const d = await r.json();
    btn.disabled = false; btn.textContent = '🧪 Test';
    if (d.success) {
        btn.textContent = '✅ Sent!';
        btn.style.background = 'rgba(34,197,94,0.15)';
        btn.style.color = '#4ade80';
        setTimeout(() => { btn.textContent = '🧪 Test'; btn.style.background = ''; btn.style.color = ''; }, 2500);
    } else alert('❌ ' + (d.error || 'فشل الاختبار'));
}

// Initial selection
selectPlatform('youtube');
updateCounts();

document.getElementById('addModal').addEventListener('click', function(e) {
    if (e.target === this) closeAddModal();
});
</script>
</body>
</html>`);
            }
            // ─── End Social Section ───


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
                         class="w-12 h-12 rounded-2xl ${g.id === guildId ? 'border-2 border-purple-500 shadow-lg shadow-purple-900/50 p-0.5 ring-2 ring-purple-600/30' : 'border border-transparent hover:border-purple-500/40'} hover:rounded-xl object-cover transition-all">
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
                'social': 'تنبيهات YouTube / Twitch / TikTok 📺',
                'notifier': 'تنبيهات YouTube / Twitch / TikTok 📺',
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
                        <select name="${inputName}" id="${inputName}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer appearance-none">
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
                        <select name="${inputName}" id="${inputName}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer appearance-none">
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
                        <select name="${inputName}" id="${inputName}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer appearance-none">
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
                        <select name="${inputName}" id="${inputName}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer appearance-none">
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
                        <div class="bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl space-y-5 text-right">
                            <div class="flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="boost_enabled" ${settings.boost_enabled !== 0 ? 'checked' : ''} onchange="saveSetting('boost_enabled', this.checked ? 1 : 0)"><span class="slider"></span></label>
                                <div>
                                    <h4 class="font-bold text-white text-sm">رسائل البوست (Server Boost Messages)</h4>
                                    <p class="text-gray-400 text-[11px]">إرسال رسالة تلقائية عندما يقوم أحد الأعضاء بعمل بوست للسيرفر 🚀</p>
                                </div>
                            </div>

                            <!-- قناة البوست -->
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2">قناة إعلانات البوست (Boost Channel) <span class="text-[#5865f2]">*</span></label>
                                ${renderChannelSelect('boost_channel', settings.boost_channel)}
                            </div>

                            <!-- رسالة البوست مع التاغات -->
                            <div>
                                <div class="flex items-center justify-between mb-2">
                                    <div class="flex items-center gap-1.5 flex-wrap">
                                        <button type="button" onclick="insertBoostTag('[user]')" class="px-2 py-1 bg-purple-950/50 hover:bg-purple-800/60 text-gray-200 border border-purple-900/40 rounded-lg text-[10px] font-mono transition">+ [user]</button>
                                        <button type="button" onclick="insertBoostTag('[globalName]')" class="px-2 py-1 bg-purple-950/50 hover:bg-purple-800/60 text-gray-200 border border-purple-900/40 rounded-lg text-[10px] font-mono transition">+ [globalName]</button>
                                        <button type="button" onclick="insertBoostTag('[totalBoosts]')" class="px-2 py-1 bg-purple-950/50 hover:bg-purple-800/60 text-gray-200 border border-purple-900/40 rounded-lg text-[10px] font-mono transition">+ [totalBoosts]</button>
                                        <button type="button" onclick="insertBoostTag('[serverName]')" class="px-2 py-1 bg-purple-950/50 hover:bg-purple-800/60 text-gray-200 border border-purple-900/40 rounded-lg text-[10px] font-mono transition">+ [serverName]</button>
                                    </div>
                                    <label class="text-xs font-bold text-gray-300">رسالة البوست في القناة</label>
                                </div>
                                <textarea id="boostTextarea" name="boost_message" rows="4" placeholder="🎉 شكراً [user] لدعمك السيرفر بالبوست! أصبح عدد البوستات الآن [totalBoosts] بوست!" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right leading-relaxed">${settings.boost_message || ''}</textarea>
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
                        <div class="bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl space-y-4 text-right">
                            <div class="flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="boost_dm_enabled" ${settings.boost_dm_enabled ? 'checked' : ''} onchange="saveSetting('boost_dm_enabled', this.checked ? 1 : 0)"><span class="slider"></span></label>
                                <div>
                                    <h4 class="font-bold text-white text-sm">إرسال رسالة شكر في الخاص (DM Thank You)</h4>
                                    <p class="text-gray-400 text-[11px]">إرسال رسالة شخصية في الخاص لكل عضو يقوم بعمل بوست</p>
                                </div>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2">رسالة الخاص (DM Message)</label>
                                <textarea name="boost_dm_message" rows="3" placeholder="شكراً جزيلاً لدعمك سيرفر [serverName] بالبوست! 🚀" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right leading-relaxed">${settings.boost_dm_message || ''}</textarea>
                            </div>
                        </div>

                        <!-- إرسال كـ Embed -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl text-right">
                            <div class="flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="boost_embed_enabled" ${settings.boost_embed_enabled ? 'checked' : ''} onchange="saveSetting('boost_embed_enabled', this.checked ? 1 : 0)"><span class="slider"></span></label>
                                <div>
                                    <h4 class="font-bold text-white text-sm">إرسال كرسالة Embed ملوّنة بالوردي</h4>
                                    <p class="text-gray-400 text-[11px]">رسالة منسقة بلون Nitro الوردي مع معلومات العضو وعدد البوستات</p>
                                </div>
                            </div>
                        </div>

                        <!-- متغيرات البوست -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl text-right">
                            <h4 class="font-bold text-white text-sm mb-3">المتغيرات المدعومة 🏷️</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                <div class="flex justify-between items-center py-2 border-b border-purple-950/30">
                                    <span class="text-gray-400">منشن العضو الداعم</span>
                                    <code class="text-[#5865f2] bg-[#151722] px-2 py-0.5 rounded">[user]</code>
                                </div>
                                <div class="flex justify-between items-center py-2 border-b border-purple-950/30">
                                    <span class="text-gray-400">الاسم العام للعضو</span>
                                    <code class="text-[#5865f2] bg-[#151722] px-2 py-0.5 rounded">[globalName]</code>
                                </div>
                                <div class="flex justify-between items-center py-2 border-b border-purple-950/30">
                                    <span class="text-gray-400">اسم المستخدم</span>
                                    <code class="text-[#5865f2] bg-[#151722] px-2 py-0.5 rounded">[userName]</code>
                                </div>
                                <div class="flex justify-between items-center py-2 border-b border-purple-950/30">
                                    <span class="text-gray-400">إجمالي البوستات في السيرفر</span>
                                    <code class="text-[#5865f2] bg-[#151722] px-2 py-0.5 rounded">[totalBoosts]</code>
                                </div>
                                <div class="flex justify-between items-center py-2">
                                    <span class="text-gray-400">اسم السيرفر</span>
                                    <code class="text-[#5865f2] bg-[#151722] px-2 py-0.5 rounded">[serverName]</code>
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
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl flex items-center justify-between">
                            <label class="toggle"><input type="checkbox" name="anti_nuke_enabled" value="1" ${settings.anti_nuke_enabled ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="text-right">
                                <h4 class="font-bold text-white text-sm">جدار الحماية الشامل ومكافحة التخريب 🛡️</h4>
                                <p class="text-gray-400 text-xs mt-0.5">تفعيل وتأمين السيرفر ضد الهجمات والتخريب والسبام وحماية القنوات والرتب فوراً</p>
                            </div>
                        </div>

                        <!-- 6 Cards Grid matching Image 5 -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <!-- 1. منع الروابط -->
                            <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="anti_link" value="1" ${settings.anti_link ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="text-right">
                                    <h4 class="font-bold text-white text-xs">منع الروابط (Anti-Link)</h4>
                                    <p class="text-gray-400 text-[11px] mt-0.5">حذف روابط الديسكورد والمواقع غير المصرح بها فوراً</p>
                                </div>
                            </div>

                            <!-- 2. مكافحة السبام -->
                            <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="anti_spam" value="1" ${settings.anti_spam ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="text-right">
                                    <h4 class="font-bold text-white text-xs">مكافحة السبام (Anti-Spam)</h4>
                                    <p class="text-gray-400 text-[11px] mt-0.5">منع تكرار الرسائل السريعة تلقائياً لحماية الشات</p>
                                </div>
                            </div>

                            <!-- 3. مكافحة التخريب والنظام -->
                            <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl space-y-3">
                                <div class="flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" name="anti_nuke_enabled" value="1" ${settings.anti_nuke_enabled ? 'checked' : ''}><span class="slider"></span></label>
                                    <div class="text-right">
                                        <h4 class="font-bold text-white text-xs">مكافحة التخريب (Anti-Nuke)</h4>
                                        <p class="text-gray-400 text-[11px] mt-0.5">حماية السيرفر من طرد أو حظر الرتب وتدمير القنوات</p>
                                    </div>
                                </div>
                                <div>
                                    <label class="block text-[11px] font-bold text-gray-400 mb-1 text-right">إجراء العقوبة عند التخريب</label>
                                    <select name="anti_nuke_action" class="w-full bg-[#0b0d14] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none">
                                        <option value="ban" ${settings.anti_nuke_action === 'ban' ? 'selected' : ''}>حظر فوري (Ban)</option>
                                        <option value="kick" ${settings.anti_nuke_action === 'kick' ? 'selected' : ''}>طرد من السيرفر (Kick)</option>
                                        <option value="strip_roles" ${settings.anti_nuke_action === 'strip_roles' ? 'selected' : ''}>سحب جميع الرتب (Strip Roles)</option>
                                    </select>
                                </div>
                            </div>

                            <!-- 4. الحد الأدنى لعمر الحساب -->
                            <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl text-right space-y-2">
                                <h4 class="font-bold text-white text-xs">الحد الأدنى لعمر الحساب (Anti-Alt)</h4>
                                <p class="text-gray-400 text-[11px]">طرد الحسابات الوهمية والجديدة التي عمرها أقل من عدد الأيام المحدد</p>
                                <input type="number" name="anti_alt_days" value="${settings.anti_alt_days || 0}" min="0" max="365" class="w-full bg-[#0b0d14] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right" placeholder="0 لتعطيل الفحص">
                            </div>

                            <!-- 5. أقصى عدد منشن -->
                            <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl text-right space-y-2">
                                <h4 class="font-bold text-white text-xs">أقصى عدد منشن مسموح به في الرسالة (Max Mentions)</h4>
                                <p class="text-gray-400 text-[11px]">معاقبة الأعضاء الذين يرسلون رسائل بمنشن جماعي مفرط</p>
                                <input type="number" name="max_mentions" value="${settings.max_mentions || 4}" min="1" max="50" class="w-full bg-[#0b0d14] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                            </div>

                            <!-- 6. قناة سجلات الحماية -->
                            <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl text-right space-y-2">
                                <h4 class="font-bold text-white text-xs">قناة سجلات الحماية (Protection Log Channel ID)</h4>
                                <p class="text-gray-400 text-[11px]">إرسال تقارير محاولات التخريب والسبام والروابط المحذوفة</p>
                                <input type="text" name="log_channel" value="${settings.log_channel || ''}" placeholder="ضع ID القناة..." class="w-full bg-[#0b0d14] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                            </div>
                        </div>

                        <!-- Advanced Automod & Badwords Filter -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl space-y-4">
                            <h4 class="font-bold text-white text-sm text-right">فلاتر الرقابة التلقائية الإضافية (Automod Filters) 🛡️</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" name="anti_caps" value="1" ${settings.anti_caps ? 'checked' : ''}><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">منع الحروف الكبيرة (Anti-Caps)</p>
                                        <p class="text-gray-400 text-[10px]">حذف الرسائل المكتوبة بحروف كبيرة مفرطة (CAPS)</p>
                                    </div>
                                </div>
                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
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
                                <textarea name="bad_words_list" rows="3" placeholder="اكتب الكلمات المحظورة مفصولة بفواصل (مثال: كلمة1, كلمة2, كلمة3)..." class="w-full bg-[#0b0d14] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-mono">${settings.bad_words_list || ''}</textarea>
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'welcome') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- Welcome Header & Live Card -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl">
                            <div class="flex items-center justify-between mb-4">
                                <label class="toggle"><input type="checkbox" name="welcome_image" value="1" ${settings.welcome_image ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="text-right">
                                    <h4 class="font-bold text-white text-sm">توليد بطاقة ترحيب مصممة بالاسم والافتار (Canvas Card)</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">إرسال صورة ترحيبية احترافية تلقائياً لكل عضو ينضم للسيرفر</p>
                                </div>
                            </div>
                            <!-- Live Preview Visual -->
                            <div class="mt-4 p-4 rounded-xl bg-gradient-to-r from-purple-950/40 via-[#0d0e15] to-indigo-950/40 border border-white/5 flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <div class="w-12 h-12 rounded-full border-2 border-purple-500 bg-[#1f212d] flex items-center justify-center text-lg">👤</div>
                                    <div class="text-right">
                                        <p class="text-xs font-bold text-white">WELCOME TO THE SERVER</p>
                                        <p class="text-[11px] text-gray-200 font-mono">Member #124</p>
                                    </div>
                                </div>
                                <span class="text-[10px] bg-purple-900/50 text-purple-200 px-2.5 py-1 rounded-lg border border-purple-700/40">معاينة مباشرة</span>
                            </div>
                        </div>

                        <!-- Welcome Channel & Message -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl space-y-4 text-right">
                            <h4 class="font-bold text-white text-sm">إعدادات رسالة الترحيب في القناة 📢</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة الترحيب (Welcome Channel) <span class="text-[#5865f2]">*</span></label>
                                    ${renderChannelSelect('welcome_channel', settings.welcome_channel)}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الرتبة التلقائية للأعضاء (Auto-Role)</label>
                                    ${renderRoleSelect('auto_role', settings.auto_role)}
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2">نص رسالة الترحيب</label>
                                <textarea id="welcomeMsgInput" name="welcome_message" rows="3" placeholder="مرحباً بك [user] في سيرفر [server]! أنت العضو رقم [memberCount] 🎉" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none leading-relaxed text-right">${settings.welcome_message || ''}</textarea>
                                
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
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl space-y-4 text-right">
                            <div class="flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="welcome_dm_enabled" value="1" ${settings.welcome_dm_enabled ? 'checked' : ''}><span class="slider"></span></label>
                                <div>
                                    <h4 class="font-bold text-white text-sm">رسائل الترحيب في الخاص (Direct Message) 📩</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">إرسال رسالة ترحيب خاصة للعضو الجديد فور انضمامه</p>
                                </div>
                            </div>
                            <textarea name="welcome_dm_message" rows="3" placeholder="أهلاً بك يا [user] في سيرفرنا [server]! نتمنى لك وقتاً ممتعاً 🌟" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none leading-relaxed text-right">${settings.welcome_dm_message || ''}</textarea>
                        </div>

                        <!-- Leave / Goodbye System -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl space-y-4 text-right">
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
                                    <input type="text" name="leave_message" value="${settings.leave_message || 'وداعاً [userName]، نتمنى رؤيتك قريباً 👋'}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'tickets') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- Master Toggle Card -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl flex items-center justify-between">
                            <label class="toggle"><input type="checkbox" name="ticket_enabled" value="1" ${settings.ticket_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="text-right">
                                <h4 class="font-bold text-white text-sm">نظام التذاكر والدعم الفني المتقدم (Pro Tickets) 🎫</h4>
                                <p class="text-gray-400 text-xs mt-0.5">فتح وإدارة تذاكر الدعم الفني للأعضاء مع أقسام متعددة وأزرار سريعة وحفظ السجلات (Transcripts)</p>
                            </div>
                        </div>

                        <!-- Core Setup Grid -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl space-y-4">
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
                                    <input type="number" name="ticket_max_open" value="${settings.ticket_max_open || 1}" min="1" max="5" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none font-mono text-right">
                                </div>
                            </div>
                        </div>

                        <!-- Ticket Message & Greeting -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl space-y-3 text-right">
                            <div class="flex items-center justify-between">
                                <span class="text-[11px] text-gray-400 font-mono">[user] [userName] [server]</span>
                                <h4 class="font-bold text-white text-sm">رسالة الترحيب داخل التذكرة الجديدة 📩</h4>
                            </div>
                            <textarea name="ticket_welcome_msg" rows="3" placeholder="مرحباً بك [user] في تذكرتك الخاصة! يرجى توضيح استفسارك أو مشكلتك بالتفصيل وسيقوم فريق الدعم بالرد عليك قريباً." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right leading-relaxed">${settings.ticket_welcome_msg || ''}</textarea>
                        </div>

                        <!-- Interactive Ticket Panel Deployer -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl space-y-4 text-right">
                            <div class="flex items-center justify-between">
                                <span class="px-2.5 py-1 bg-purple-950/60 text-gray-200 border border-purple-800/40 rounded-lg text-xs font-bold">🚀 إرسال فوري</span>
                                <h4 class="font-bold text-white text-sm">إنشاء وإرسال لوحة التذاكر التفاعلية إلى الديسكورد 🔘</h4>
                            </div>
                            <p class="text-gray-400 text-xs">قم بتحديد روم الدعم الفني بالأسفل واضغط زر الإرسال لينشر البوت لوحة التذاكر التفاعلية بالأزرار فوراً في السيرفر:</p>
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">روم إرسال اللوحة (Channel) <span class="text-[#5865f2]">*</span></label>
                                    ${renderChannelSelect('ticket_panel_channel', settings.ticket_panel_channel)}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">عنوان لوحة التذاكر</label>
                                    <input type="text" id="panelTitleInput" value="${settings.ticket_panel_title || '🎫 نظام الدعم الفني والمساعدة'}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">
                                </div>
                            </div>

                            <div class="mt-2">
                                <label class="block text-xs font-bold text-gray-300 mb-2">وصف لوحة التذاكر</label>
                                <textarea id="panelDescInput" rows="2" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">${settings.ticket_panel_desc || 'لفتح تذكرة جديدة والتواصل مع فريق الإدارة والدعم الفني، يرجى الضغط على الزر بالأسفل.'}</textarea>
                            </div>

                            <div class="pt-2 flex justify-end">
                                <button type="button" onclick="sendTicketPanelDirect()" id="sendPanelBtn" class="px-6 py-3 bg-gradient-to-r from-[#5865f2] to-indigo-600 hover:from-[#4752c4] hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2">
                                    <span>🚀 إرسال لوحة التذاكر إلى الروم المحدد</span>
                                </button>
                            </div>
                            <div id="panelSendStatus" class="text-xs font-bold text-center hidden mt-2"></div>
                        </div>
                    </div>

                    <script>
                    async function sendTicketPanelDirect() {
                        const channelSel = document.getElementById('ticket_panel_channel') || document.querySelector('select[name="ticket_panel_channel"]');
                        const channelId = channelSel ? channelSel.value.trim() : '';
                        const title = (document.getElementById('panelTitleInput')?.value || '').trim();
                        const desc = (document.getElementById('panelDescInput')?.value || '').trim();
                        const statusEl = document.getElementById('panelSendStatus');
                        const btn = document.getElementById('sendPanelBtn');

                        if (!channelId) {
                            alert('يرجى اختيار روم إرسال لوحة التذاكر من القائمة أولاً!');
                            return;
                        }

                        btn.disabled = true;
                        btn.innerHTML = '⏳ جارٍ الإرسال...';
                        statusEl.className = 'text-xs font-bold text-center text-[#5865f2] mt-2 block';
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
                            statusEl.innerText = '❌ حدث خطأ أثناء الاتصال بالخادم: ' + err.message;
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
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl flex items-center justify-between">
                            <label class="toggle"><input type="checkbox" name="leveling_enabled" value="1" ${settings.leveling_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="text-right">
                                <h4 class="font-bold text-white text-sm">نظام المستويات واللفلات التفاعلي (Leveling & XP) 📈</h4>
                                <p class="text-gray-400 text-xs mt-0.5">منح نقاط خبرة XP للأعضاء عند التفاعل في الشات وإرسال إشعارات الترقية وبطاقات الرانك</p>
                            </div>
                        </div>

                        <!-- Core Leveling Configuration -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl space-y-4 text-right">
                            <h4 class="font-bold text-white text-sm">إعدادات الخبرة XP والإعلانات ⚙️</h4>
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">مضاعف نقاط الـ XP (XP Multiplier)</label>
                                    <input type="number" step="0.1" name="level_multiplier" value="${settings.level_multiplier || 1.0}" min="0.1" max="10.0" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none font-mono text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة إرسال رسائل الترقية (Level Up Channel)</label>
                                    <input type="text" name="level_channel" value="${settings.level_channel || 'current'}" placeholder="current (نفس الروم) أو ضع ID الروم..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none font-mono text-right">
                                    <p class="text-[10px] text-gray-400 mt-1">اكتب <code class="text-[#5865f2]">current</code> للإرسال بنفس الروم، أو <code class="text-[#5865f2]">dm</code> للخاص، أو <code class="text-[#5865f2]">disabled</code> لتعطيل الرسائل، أو ID روم مخصص.</p>
                                </div>
                            </div>
                        </div>

                        <!-- Level Up Message Customizer -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl space-y-3 text-right">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-1.5 flex-wrap">
                                    <button type="button" onclick="insertLevelTag('[user]')" class="px-2 py-1 bg-purple-950/50 hover:bg-purple-800/60 text-gray-200 border border-purple-900/40 rounded-lg text-[10px] font-mono transition">+ [user]</button>
                                    <button type="button" onclick="insertLevelTag('[level]')" class="px-2 py-1 bg-purple-950/50 hover:bg-purple-800/60 text-gray-200 border border-purple-900/40 rounded-lg text-[10px] font-mono transition">+ [level]</button>
                                    <button type="button" onclick="insertLevelTag('[userName]')" class="px-2 py-1 bg-purple-950/50 hover:bg-purple-800/60 text-gray-200 border border-purple-900/40 rounded-lg text-[10px] font-mono transition">+ [userName]</button>
                                    <button type="button" onclick="insertLevelTag('[server]')" class="px-2 py-1 bg-purple-950/50 hover:bg-purple-800/60 text-gray-200 border border-purple-900/40 rounded-lg text-[10px] font-mono transition">+ [server]</button>
                                </div>
                                <h4 class="font-bold text-white text-sm">نص رسالة الترقية (Level Up Message) 🎉</h4>
                            </div>
                            <textarea id="levelMsgTextarea" name="level_message" rows="3" placeholder="🎉 مبروك يا [user]! لقد وصلت إلى المستوى [level]! 🚀" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none leading-relaxed text-right">${settings.level_message || '🎉 مبروك يا [user]! لقد وصلت إلى المستوى [level]! 🚀'}</textarea>
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
                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Master Toggle -->
                        <div class="flex items-center justify-between bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl">
                            <label class="toggle">
                                <input type="checkbox" name="automod_enabled" value="1" ${settings.automod_enabled !== 0 ? 'checked' : ''} onchange="saveAutomodSetting('automod_enabled', this.checked)">
                                <span class="slider"></span>
                            </label>
                            <div>
                                <h4 class="font-black text-white text-lg">الرقابة التلقائية 🤖</h4>
                                <p class="text-gray-400 text-[11px] mt-0.5">قم بتفعيل كل الفلترات وضبطها مناسبةً لسيرفرك، وضعها أمامك في لوحة الاعدادات لخفية الأذى</p>
                            </div>
                        </div>

                        <!-- Cards Grid 3 columns -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">

                            <!-- إزعاج بالرسائل / Spam -->
                            <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-5 flex flex-col gap-3 hover:border-purple-800/40 transition">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="text-gray-400 text-xs">≡</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="font-bold text-white text-sm">إزعاج بالرسائل (5 رسائل \\ 5 ثواني)</span>
                                        <label class="toggle">
                                            <input type="checkbox" name="anti_spam" value="1" ${settings.anti_spam ? 'checked' : ''} onchange="saveAutomodSetting('anti_spam', this.checked)">
                                            <span class="slider"></span>
                                        </label>
                                    </div>
                                </div>
                                <button type="button" onclick="openAutomodModal('spam')" class="w-full py-2 bg-[#0b0d14] hover:bg-[#0d0f18] border border-white/5 rounded-xl text-gray-400 hover:text-white text-xs font-bold transition">بحاجة إلى الإعداد</button>
                            </div>

                            <!-- الكلمات المسيئة / Bad Words -->
                            <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-5 flex flex-col gap-3 hover:border-purple-800/40 transition">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="text-gray-400 text-xs">🔇</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="font-bold text-white text-sm">الكلمات المسيئة</span>
                                        <label class="toggle">
                                            <input type="checkbox" name="bad_words_enabled" value="1" ${settings.bad_words_enabled ? 'checked' : ''} onchange="saveAutomodSetting('bad_words_enabled', this.checked)">
                                            <span class="slider"></span>
                                        </label>
                                    </div>
                                </div>
                                <button type="button" onclick="openAutomodModal('badwords')" class="w-full py-2 bg-[#0b0d14] hover:bg-[#0d0f18] border border-white/5 rounded-xl text-gray-400 hover:text-white text-xs font-bold transition">بحاجة إلى الإعداد</button>
                            </div>

                            <!-- تكرار النص / Repeated Text -->
                            <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-5 flex flex-col gap-3 hover:border-purple-800/40 transition">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="text-gray-400 text-xs">🔁</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="font-bold text-white text-sm">تكرار النص</span>
                                        <label class="toggle">
                                            <input type="checkbox" name="anti_line_spam" value="1" ${settings.anti_line_spam ? 'checked' : ''} onchange="saveAutomodSetting('anti_line_spam', this.checked)">
                                            <span class="slider"></span>
                                        </label>
                                    </div>
                                </div>
                                <button type="button" class="w-full py-2 bg-[#0b0d14] hover:bg-[#0d0f18] border border-white/5 rounded-xl text-gray-400 hover:text-white text-xs font-bold transition">بحاجة إلى الإعداد</button>
                            </div>

                            <!-- الروابط / Links -->
                            <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-5 flex flex-col gap-3 hover:border-purple-800/40 transition">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="text-gray-400 text-xs">🔗</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="font-bold text-white text-sm">الروابط</span>
                                        <label class="toggle">
                                            <input type="checkbox" name="anti_links" value="1" ${settings.anti_links ? 'checked' : ''} onchange="saveAutomodSetting('anti_links', this.checked)">
                                            <span class="slider"></span>
                                        </label>
                                    </div>
                                </div>
                                <button type="button" onclick="openAutomodModal('links')" class="w-full py-2 bg-[#0b0d14] hover:bg-[#0d0f18] border border-white/5 rounded-xl text-gray-400 hover:text-white text-xs font-bold transition">بحاجة إلى الإعداد</button>
                            </div>

                            <!-- روابط السيرفرات / Invite Links -->
                            <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-5 flex flex-col gap-3 hover:border-purple-800/40 transition">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="text-gray-400 text-xs">🔀</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="font-bold text-white text-sm">روابط السيرفرات</span>
                                        <label class="toggle">
                                            <input type="checkbox" name="anti_invites" value="1" ${settings.anti_invites ? 'checked' : ''} onchange="saveAutomodSetting('anti_invites', this.checked)">
                                            <span class="slider"></span>
                                        </label>
                                    </div>
                                </div>
                                <button type="button" class="w-full py-2 bg-[#0b0d14] hover:bg-[#0d0f18] border border-white/5 rounded-xl text-gray-400 hover:text-white text-xs font-bold transition">بحاجة إلى الإعداد</button>
                            </div>

                            <!-- الرسائل المكررة / Duplicate Messages -->
                            <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-5 flex flex-col gap-3 hover:border-purple-800/40 transition">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="text-gray-400 text-xs">📋</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="font-bold text-white text-sm">الرسائل المكررة</span>
                                        <label class="toggle">
                                            <input type="checkbox" name="anti_duplicate" value="1" ${settings.anti_duplicate ? 'checked' : ''} onchange="saveAutomodSetting('anti_duplicate', this.checked)">
                                            <span class="slider"></span>
                                        </label>
                                    </div>
                                </div>
                                <button type="button" class="w-full py-2 bg-[#0b0d14] hover:bg-[#0d0f18] border border-white/5 rounded-xl text-gray-400 hover:text-white text-xs font-bold transition">بحاجة إلى الإعداد</button>
                            </div>

                            <!-- إزعاج منشن / Mention Spam -->
                            <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-5 flex flex-col gap-3 hover:border-purple-800/40 transition">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="text-gray-400 text-xs">📢</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="font-bold text-white text-sm">إزعاج منشن</span>
                                        <label class="toggle">
                                            <input type="checkbox" name="anti_mention_spam" value="1" ${settings.anti_mention_spam ? 'checked' : ''} onchange="saveAutomodSetting('anti_mention_spam', this.checked)">
                                            <span class="slider"></span>
                                        </label>
                                    </div>
                                </div>
                                <button type="button" onclick="openAutomodModal('mention')" class="w-full py-2 bg-[#0b0d14] hover:bg-[#0d0f18] border border-white/5 rounded-xl text-gray-400 hover:text-white text-xs font-bold transition">بحاجة إلى الإعداد</button>
                            </div>

                            <!-- إزعاج EMOJI / Emoji Spam -->
                            <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-5 flex flex-col gap-3 hover:border-purple-800/40 transition">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="text-gray-400 text-xs">😂</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="font-bold text-white text-sm">إزعاج EMOJI</span>
                                        <label class="toggle">
                                            <input type="checkbox" name="anti_emoji_spam" value="1" ${settings.anti_emoji_spam ? 'checked' : ''} onchange="saveAutomodSetting('anti_emoji_spam', this.checked)">
                                            <span class="slider"></span>
                                        </label>
                                    </div>
                                </div>
                                <button type="button" onclick="openAutomodModal('emoji')" class="w-full py-2 bg-[#0b0d14] hover:bg-[#0d0f18] border border-white/5 rounded-xl text-gray-400 hover:text-white text-xs font-bold transition">بحاجة إلى الإعداد</button>
                            </div>

                            <!-- سبام الأحرف الكبيرة / Anti Caps -->
                            <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-5 flex flex-col gap-3 hover:border-purple-800/40 transition">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="text-gray-400 text-xs font-black">B</span>
                                    </div>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <span class="font-bold text-white text-sm block">سبام الأحرف الكبيرة</span>
                                            <span class="text-[10px] text-gray-400">(70% < احرف مكبرة)</span>
                                        </div>
                                        <label class="toggle">
                                            <input type="checkbox" name="anti_caps" value="1" ${settings.anti_caps ? 'checked' : ''} onchange="saveAutomodSetting('anti_caps', this.checked)">
                                            <span class="slider"></span>
                                        </label>
                                    </div>
                                </div>
                                <button type="button" onclick="openAutomodModal('caps')" class="w-full py-2 bg-[#0b0d14] hover:bg-[#0d0f18] border border-white/5 rounded-xl text-gray-400 hover:text-white text-xs font-bold transition">بحاجة إلى الإعداد</button>
                            </div>

                        </div>

                        <!-- Exemptions / Bypass -->
                        <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-5 space-y-4 text-right">
                            <h4 class="font-bold text-white text-sm">⚙️ الاستثناءات (Exemptions)</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <!-- تخطي الرومات -->
                                <div>
                                    <label class="block text-xs font-bold text-gray-400 mb-2">تخطي الرومات (Ignored Channels)</label>
                                    ${renderChannelSelect('automod_ignore_channels', settings.automod_ignore_channels || '', 'اختر روم للاستثناء...')}
                                </div>
                                <!-- تخطي الرولات -->
                                <div>
                                    <label class="block text-xs font-bold text-gray-400 mb-2">تخطي الرولات (Ignored Roles)</label>
                                    ${renderRoleSelect('automod_ignore_roles', settings.automod_ignore_roles || '')}
                                </div>
                                <!-- رومات صور فقط -->
                                <div>
                                    <label class="block text-xs font-bold text-gray-400 mb-2">رومات صور فقط (Images Only Channels)</label>
                                    ${renderChannelSelect('automod_images_only', settings.automod_images_only || '', 'اختر روم...')}
                                </div>
                                <!-- رومات يوتيوب فقط -->
                                <div>
                                    <label class="block text-xs font-bold text-gray-400 mb-2">رومات يوتيوب فقط (YouTube Only)</label>
                                    ${renderChannelSelect('automod_youtube_only', settings.automod_youtube_only || '', 'اختر روم...')}
                                </div>
                            </div>
                        </div>

                        <!-- Bad Words List -->
                        <div id="badwordsSection" class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-5 space-y-3 text-right ${settings.bad_words_enabled ? '' : 'hidden'}">
                            <h4 class="font-bold text-white text-sm">📝 قائمة الكلمات المحظورة</h4>
                            <p class="text-gray-400 text-[11px]">أضف الكلمات المحظورة مفصولة بفواصل. البوت سيقوم بحذف الرسائل التي تحتوي عليها تلقائياً.</p>
                            <textarea name="bad_words_list" rows="4" placeholder="كلمة1, كلمة2, كلمة3..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono leading-relaxed">${settings.bad_words_list || ''}</textarea>
                        </div>

                        <!-- Action on Violation -->
                        <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-5 space-y-4 text-right">
                            <h4 class="font-bold text-white text-sm">⚡ الإجراء عند المخالفة (Action on Violation)</h4>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الإجراء الافتراضي</label>
                                    <select name="automod_action" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right cursor-pointer">
                                        <option value="delete" ${(settings.automod_action || 'delete') === 'delete' ? 'selected' : ''}>🗑️ حذف الرسالة فقط</option>
                                        <option value="warn" ${settings.automod_action === 'warn' ? 'selected' : ''}>⚠️ حذف + إنذار</option>
                                        <option value="mute" ${settings.automod_action === 'mute' ? 'selected' : ''}>🔇 حذف + كتم مؤقت</option>
                                        <option value="kick" ${settings.automod_action === 'kick' ? 'selected' : ''}>👢 حذف + طرد</option>
                                        <option value="ban" ${settings.automod_action === 'ban' ? 'selected' : ''}>🔨 حذف + حظر</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">مدة الكتم (إذا كان الإجراء كتم)</label>
                                    <select name="automod_mute_duration" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right cursor-pointer">
                                        <option value="1" ${settings.automod_mute_duration == 1 ? 'selected' : ''}>1 دقيقة</option>
                                        <option value="5" ${(settings.automod_mute_duration || 5) == 5 ? 'selected' : ''}>5 دقائق</option>
                                        <option value="10" ${settings.automod_mute_duration == 10 ? 'selected' : ''}>10 دقائق</option>
                                        <option value="30" ${settings.automod_mute_duration == 30 ? 'selected' : ''}>30 دقيقة</option>
                                        <option value="60" ${settings.automod_mute_duration == 60 ? 'selected' : ''}>ساعة</option>
                                        <option value="1440" ${settings.automod_mute_duration == 1440 ? 'selected' : ''}>يوم</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة سجل الرقابة (Automod Log)</label>
                                    ${renderChannelSelect('automod_log_channel', settings.automod_log_channel)}
                                </div>
                            </div>
                        </div>

                    </div>

                    <script>
                    // Toggle bad words section visibility
                    document.addEventListener('change', function(e) {
                        if (e.target && e.target.name === 'bad_words_enabled') {
                            const section = document.getElementById('badwordsSection');
                            if (section) section.classList.toggle('hidden', !e.target.checked);
                        }
                    });

                    async function saveAutomodSetting(key, value) {
                        try {
                            await fetch('/api/guild/${guildId}/settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ key, value: value ? 1 : 0 })
                            });
                        } catch(e) {}
                    }

                    function openAutomodModal(type) {
                        const labels = {
                            spam: 'إعداد فلتر الإزعاج بالرسائل',
                            badwords: 'إعداد فلتر الكلمات المسيئة',
                            links: 'إعداد فلتر الروابط',
                            mention: 'إعداد فلتر إزعاج المنشن',
                            emoji: 'إعداد فلتر إزعاج الإيموجي',
                            caps: 'إعداد فلتر الأحرف الكبيرة'
                        };
                        alert('⚙️ ' + (labels[type] || 'الإعداد') + '\\nاستخدم قسم "حفظ الإعدادات" في الأسفل لتطبيق التغييرات.');
                    }
                    </script>
                `;
            } else if (section === 'tempvoice') {
                formFieldsHtml = `
                    <div class="space-y-5">
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl">
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
                        <div class="bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
                            <div class="flex items-center gap-3 justify-end w-full md:w-auto">
                                <label class="text-xs font-bold text-gray-400">المدة</label>
                                <select id="statsDurationSelect" onchange="changeStatsDuration(this.value)" class="bg-[#0b0d14] border border-white/5 text-white rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-purple-600 cursor-pointer">
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
                            <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl text-right">
                                <span class="text-gray-400 text-[11px] block">إجمالي الأعضاء</span>
                                <h4 class="text-xl font-black text-white mt-1">${totalMembers.toLocaleString()}</h4>
                                <span class="text-[10px] text-[#5865f2]">👤 أعضاء السيرفر</span>
                            </div>
                            <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl text-right">
                                <span class="text-gray-400 text-[11px] block">البوتات المساعدة</span>
                                <h4 class="text-xl font-black text-indigo-300 mt-1">${totalBots}</h4>
                                <span class="text-[10px] text-indigo-400">🤖 حسابات بوتات</span>
                            </div>
                            <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl text-right">
                                <span class="text-gray-400 text-[11px] block">القنوات والرومات</span>
                                <h4 class="text-xl font-black text-gray-200 mt-1">${totalChannels}</h4>
                                <span class="text-[10px] text-[#5865f2]">💬 صوتية وكتابية</span>
                            </div>
                            <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl text-right">
                                <span class="text-gray-400 text-[11px] block">مستوى البوست</span>
                                <h4 class="text-xl font-black text-pink-400 mt-1">Level ${boostTier}</h4>
                                <span class="text-[10px] text-pink-400">🚀 ${boostCount} Boosts</span>
                            </div>
                        </div>

                        <!-- Chart 1: الرسائل (Messages Chart) -->
                        <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-6 shadow-xl space-y-4 text-right">
                            <div class="flex items-center justify-between">
                                <button type="button" class="text-gray-500 hover:text-[#5865f2] text-sm">☰</button>
                                <h4 class="font-bold text-white text-sm">الرسائل</h4>
                            </div>
                            <div id="messagesChartContainer" class="w-full h-72"></div>
                        </div>

                        <!-- Chart 2: دخول/خروج (Joins & Leaves Chart) -->
                        <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-6 shadow-xl space-y-4 text-right">
                            <div class="flex items-center justify-between">
                                <button type="button" class="text-gray-500 hover:text-[#5865f2] text-sm">☰</button>
                                <h4 class="font-bold text-white text-sm">دخول/خروج</h4>
                            </div>
                            <div id="joinsLeavesChartContainer" class="w-full h-80"></div>
                        </div>

                        <!-- Chart 3: المتصلين بالرومات الصوتية (Voice Active Members Chart) -->
                        <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-6 shadow-xl space-y-4 text-right">
                            <div class="flex items-center justify-between">
                                <button type="button" class="text-gray-500 hover:text-[#5865f2] text-sm">☰</button>
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
                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                        <button type="button" onclick="deleteResponder('${guildId}', '${r.id || r.trigger_word}')" class="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-900/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                        <div class="text-right">
                            <p class="font-bold text-white text-xs">إذا كتب العضو: <span class="text-gray-200 font-mono bg-[#151722] px-2 py-0.5 rounded">"${r.trigger_word}"</span></p>
                            <p class="text-gray-300 text-xs mt-1">يرد البوت: <span class="text-gray-200">"${r.reply_text}"</span></p>
                        </div>
                    </div>
                `).join('') : '<p class="text-gray-500 text-xs text-center py-4">لا توجد ردود تلقائية مضافة حالياً. أضف ردك الأول بالأسفل!</p>';

                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- Current Responders List -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl">
                            <h4 class="font-bold text-white text-sm mb-3 text-right">قائمة الردود التلقائية النشطة (${autoRespondersList.length})</h4>
                            <div class="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                                ${respondersHtml}
                            </div>
                        </div>

                        <!-- Add New Responder Form -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl text-right">
                            <h4 class="font-bold text-white text-sm mb-1">إضافة رد تلقائي جديد 💬</h4>
                            <p class="text-gray-400 text-xs mb-4">يقوم البوت بالرد التلقائي فوراً في الشات بمجرد كتابة الكلمة المحددة (يمكنك إضافة أكثر من رد لنفس الكلمة أو لكلمات متعددة).</p>
                            
                            <div class="space-y-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-1 text-right">الكلمة المفتاحية (Trigger Word)</label>
                                    <input type="text" id="triggerWordInput" placeholder="مثال: السلام عليكم أو رابط السيرفر" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-1 text-right">الرد التلقائي للبوت (Response Message)</label>
                                    <textarea id="replyTextInput" rows="3" placeholder="مثال: وعليكم السلام ورحمة الله وبركاته، أهلاً وسهلاً بك في سيرفرنا!" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right"></textarea>
                                </div>
                                <div class="pt-2">
                                    <button type="button" onclick="addAutoResponder('${guildId}')" class="w-full py-2.5 bg-gradient-to-r from-[#5865f2] to-indigo-600 hover:from-[#4752c4] hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-black/20">
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
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-bold text-white text-sm">${guild.name}</h4>
                                    <p class="text-gray-400 text-xs font-mono">ID: ${guildId}</p>
                                </div>
                                <img src="${guildIcon}" class="w-12 h-12 rounded-2xl border border-purple-900/40 object-cover">
                            </div>
                            <span class="px-3 py-1 bg-purple-950/60 text-gray-200 border border-purple-800/40 rounded-xl text-xs font-bold">إعدادات السيرفر ⚙️</span>
                        </div>

                        <!-- Core Server Settings Form -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl space-y-4">
                            <h4 class="font-bold text-white text-sm text-right">الإعدادات الأساسية للنظام ⚙️</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">برفكس البوت الافتراضي (Default Prefix)</label>
                                    <input type="text" name="prefix" value="${settings.prefix || '#'}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">لغة البوت في السيرفر (Bot Language)</label>
                                    <select name="bot_language" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">
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
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl flex items-center justify-between">
                            <span class="px-3 py-1 bg-purple-950/60 text-gray-200 border border-purple-800/40 rounded-xl text-xs font-bold">12 أمراً متاحاً</span>
                            <div class="text-right">
                                <h4 class="font-bold text-white text-sm">الأوامر العامة والخدمية للأعضاء ⚙️</h4>
                                <p class="text-gray-400 text-xs mt-0.5">أوامر التفاعل والمعلومات والخدمات المتاحة لجميع أعضاء السيرفر</p>
                            </div>
                        </div>

                        <!-- 12 General Member Commands Only matching Image 3 -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl">
                            <h4 class="font-bold text-white text-sm mb-4 text-right">قائمة الأوامر الخدمية والعامة</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                
                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">help & #help</p>
                                        <p class="text-gray-400 text-[10px]">قائمة المساعدة التفاعلية المنسدلة لجميع الأوامر</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">profile & /id</p>
                                        <p class="text-gray-400 text-[10px]">بطاقة البروفايل التفاعلية مع الرصيد والمستوى والسمعة</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">avatar & #avatar</p>
                                        <p class="text-gray-400 text-[10px]">عرض وتحميل الصورة الرمزية للعضو أو السيرفر</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">banner & #banner</p>
                                        <p class="text-gray-400 text-[10px]">عرض بنر الملف الشخصي أو بنر السيرفر بجودة عالية</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">server & #server</p>
                                        <p class="text-gray-400 text-[10px]">عرض معلومات السيرفر والأونر وتاريخ الإنشاء والإحصائيات</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">user & #user</p>
                                        <p class="text-gray-400 text-[10px]">عرض بطاقة معلومات العضو ورتبه وتاريخ الانضمام</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">ping & #ping</p>
                                        <p class="text-gray-400 text-[10px]">فحص سرعة استجابة البوت وسيرفرات ديسكورد</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">tax & #tax</p>
                                        <p class="text-gray-400 text-[10px]">حاسبة ضريبة بروبوت والتحويلات الذكية</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">stars & #stars</p>
                                        <p class="text-gray-400 text-[10px]">استعراض رصيد النجوم والسمعة وإعطاء النجوم للأعضاء</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">roles & #roles</p>
                                        <p class="text-gray-400 text-[10px]">عرض قائمة جميع رتب السيرفر وأعداد أعضائها</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">channels & #channels</p>
                                        <p class="text-gray-400 text-[10px]">إحصائيات القنوات الصوتية والنصية والكاتيجوري</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">emojis & #emojis</p>
                                        <p class="text-gray-400 text-[10px]">استعراض وإحصاء جميع إيموجيات وستيكرات السيرفر</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">giveaway & #giveaway</p>
                                        <p class="text-gray-400 text-[10px]">إنشاء وإدارة مسابقات الجيف أواي وتحديد الفائزين</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">poll & #poll</p>
                                        <p class="text-gray-400 text-[10px]">إنشاء استطلاعات وتصويت تفاعلي للأعضاء</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">quran & #quran</p>
                                        <p class="text-gray-400 text-[10px]">الاستماع لآيات وسور القرآن الكريم والتفاسير</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
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
                                <input type="text" name="prefix" value="${settings.prefix || '#'}" class="w-full bg-[#1c1f2e] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">قناة سجلات الإشراف (Moderation Logs)</label>
                                ${renderChannelSelect('log_channel', settings.log_channel)}
                            </div>
                        </div>

                        <!-- أوامر الإشراف الكاملة -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl">
                            <h4 class="font-bold text-white text-sm mb-4 text-right">أوامر الإشراف المتاحة 🔨</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/ban & #ban</p>
                                        <p class="text-gray-400 text-[10px]">حظر الأعضاء المؤقت والنهائي مع إرسال رسالة خاصة قبل الحظر</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/unban</p>
                                        <p class="text-gray-400 text-[10px]">رفع الحظر عن عضو محظور مع البحث باليوزرنيم</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/kick & #kick</p>
                                        <p class="text-gray-400 text-[10px]">طرد الأعضاء المخالفين مع إرسال رسالة خاصة قبل الطرد</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/warn & /warnings & #warn</p>
                                        <p class="text-gray-400 text-[10px]">نظام تحذيرات متقدم مع عقوبات تلقائية تراكمية</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/timeout & /mute & /untimeout</p>
                                        <p class="text-gray-400 text-[10px]">تايم اوت مؤقت وكتم صوتي وكتابي برسالة خاصة</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/clear & #clear</p>
                                        <p class="text-gray-400 text-[10px]">مسح الرسائل مع فلاتر (بوتات، صور، روابط)</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/lock & /unlock</p>
                                        <p class="text-gray-400 text-[10px]">قفل وفتح القنوات للسيرفر بالكامل أو قناة معينة</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/role & /temprole</p>
                                        <p class="text-gray-400 text-[10px]">إعطاء وسحب الرتب المؤقتة والدائمة حتى 5 أعضاء</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/slowmode & #slowmode</p>
                                        <p class="text-gray-400 text-[10px]">تفعيل وإيقاف الوضع البطيء لقناة أو كل القنوات</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">/unban & /bans</p>
                                        <p class="text-gray-400 text-[10px]">عرض قائمة المحظورين ورفع الحظر بالاسم أو الـ ID</p>
                                    </div>
                                </div>

                            </div>
                        </div>

                        <!-- نظام العقوبات التلقائي -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl text-right">
                            <h4 class="font-bold text-white text-sm mb-3">نظام العقوبات التلقائي للتحذيرات ⚠️</h4>
                            <p class="text-gray-400 text-xs mb-4">عند تراكم التحذيرات يتم تطبيق العقوبات تلقائياً على العضو</p>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                <div class="bg-[#0b0d14] p-4 rounded-xl border border-yellow-900/40 text-center">
                                    <span class="text-2xl mb-2 block">⏳</span>
                                    <p class="font-bold text-yellow-300 text-sm">3 تحذيرات</p>
                                    <p class="text-gray-400 text-[11px] mt-1">تايم اوت تلقائي لمدة 1 ساعة</p>
                                </div>
                                <div class="bg-[#0b0d14] p-4 rounded-xl border border-orange-900/40 text-center">
                                    <span class="text-2xl mb-2 block">👢</span>
                                    <p class="font-bold text-orange-400 text-sm">5 تحذيرات</p>
                                    <p class="text-gray-400 text-[11px] mt-1">طرد تلقائي من السيرفر (Kick)</p>
                                </div>
                                <div class="bg-[#0b0d14] p-4 rounded-xl border border-red-900/40 text-center">
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
                        <div class="bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                            <div class="flex items-center gap-3">
                                <span class="px-3.5 py-1.5 bg-purple-950/60 text-gray-200 border border-purple-800/40 rounded-xl text-xs font-mono font-bold">30 / 00</span>
                            </div>
                            <div class="text-right">
                                <h3 class="font-black text-white text-base">رسائل الأمبد</h3>
                                <p class="text-gray-400 text-xs mt-1">إرسال أمبد مع محتوى، تعديل الرسائل، والتعامل مع الردود الديناميكية بسلاسة.</p>
                            </div>
                        </div>

                        <!-- Dashed Create Button matching Image 4 -->
                        <div onclick="document.getElementById('embedBuilderBox').classList.toggle('hidden'); document.getElementById('embedBuilderBox').scrollIntoView({behavior: 'smooth'})" class="border-2 border-dashed border-purple-800/40 hover:border-purple-500 bg-[#1c1f2e]/50 hover:bg-[#1c1f2e] p-8 rounded-2xl text-center cursor-pointer transition group">
                            <div class="w-12 h-12 rounded-2xl bg-purple-950/60 group-hover:bg-[#5865f2]/30 text-[#5865f2] group-hover:text-purple-200 border border-purple-800/40 flex items-center justify-center text-xl mx-auto mb-3 transition">
                                +
                            </div>
                            <h4 class="font-bold text-white text-sm group-hover:text-gray-200 transition">+ إنشاء رسالة أمبد</h4>
                            <p class="text-gray-500 text-xs mt-1">اضغط هنا لفتح المحرر التفاعلي وتصميم وإرسال رسالة إيمبد جديدة</p>
                        </div>

                        <!-- Interactive Embed Builder -->
                        <div id="embedBuilderBox" class="bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl space-y-5">
                            <h4 class="font-bold text-white text-sm text-right">محرر رسائل الإيمبد التفاعلي (Interactive Embed Builder) 📄</h4>
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">القناة المستهدفة (Channel ID) <span class="text-[#5865f2]">*</span></label>
                                    <input type="text" id="embedChannelInput" placeholder="ضع ID الروم هنا..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-mono">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">لون الإيمبد (Hex Color)</label>
                                    <div class="flex items-center gap-2">
                                        <input type="color" id="embedColorPicker" value="#9333ea" onchange="document.getElementById('embedColorInput').value = this.value; updateEmbedPreview()" class="w-10 h-9 rounded-xl bg-transparent border-0 cursor-pointer">
                                        <input type="text" id="embedColorInput" value="#9333ea" oninput="updateEmbedPreview()" placeholder="#9333ea" class="flex-1 bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2 text-xs text-white outline-none text-right font-mono">
                                    </div>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">اسم الكاتب (Author Name)</label>
                                    <input type="text" id="embedAuthorInput" oninput="updateEmbedPreview()" placeholder="اسم الكاتب أو الإدارة..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">عنوان الرسالة (Embed Title)</label>
                                    <input type="text" id="embedTitleInput" oninput="updateEmbedPreview()" placeholder="اكتب العنوان الرئيسي هنا..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">محتوى الرسالة (Description) <span class="text-[#5865f2]">*</span></label>
                                <textarea id="embedDescInput" oninput="updateEmbedPreview()" rows="4" placeholder="اكتب تفاصيل الرسالة والإعلان والتنسيق هنا..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right leading-relaxed"></textarea>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">رابط صورة البنر الكبيرة (Banner Image URL)</label>
                                    <input type="text" id="embedImageInput" oninput="updateEmbedPreview()" placeholder="https://..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-left font-mono">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">النص السفلي (Footer Text)</label>
                                    <input type="text" id="embedFooterInput" oninput="updateEmbedPreview()" placeholder="حقوق السيرفر أو نص التذييل..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                            </div>

                            <!-- Live Interactive Preview Box -->
                            <div class="pt-4 border-t border-white/5">
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
                                <button type="button" onclick="sendEmbedToDiscord('${guildId}')" class="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-[#5865f2] to-indigo-600 hover:from-[#4752c4] hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-purple-900/40 flex items-center justify-center gap-2">
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
                        <div class="bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl flex items-center justify-between">
                            <label class="toggle"><input type="checkbox" name="fun_enabled" value="1" ${settings.fun_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="text-right">
                                <h3 class="font-black text-white text-base">التسلية 🎮</h3>
                                <p class="text-gray-400 text-xs mt-1">يضيف متعة إلى سيرفرك بميزات مثل الروليت، الكراسي، المافيا، الغميضة مع المزيد من الألعاب.</p>
                            </div>
                        </div>

                        <!-- Games Grid matching Image 4 -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl">
                            <h4 class="font-bold text-white text-sm mb-4 text-right">الألعاب</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                
                                <!-- روليت -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">روليت</p>
                                            <p class="text-gray-400 text-[10px]">روليت الكازينو الأوروبي ومضاعفة أرباح النجوم</p>
                                        </div>
                                        <div class="w-10 h-10 bg-[#151722] rounded-xl flex items-center justify-center text-xl">🎲</div>
                                    </div>
                                </div>

                                <!-- الكراسي -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">الكراسي</p>
                                            <p class="text-gray-400 text-[10px]">لعبة الكراسي الموسيقية التفاعلية في الشات</p>
                                        </div>
                                        <div class="w-10 h-10 bg-[#151722] rounded-xl flex items-center justify-center text-xl">🪑</div>
                                    </div>
                                </div>

                                <!-- مافيا -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">مافيا</p>
                                            <p class="text-gray-400 text-[10px]">لعبة المافيا والغموض بين الأعضاء</p>
                                        </div>
                                        <div class="w-10 h-10 bg-[#151722] rounded-xl flex items-center justify-center text-xl">🎭</div>
                                    </div>
                                </div>

                                <!-- الغميضة -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">الغميضة</p>
                                            <p class="text-gray-400 text-[10px]">لعبة الغميضة والبحث عن المختبئين</p>
                                        </div>
                                        <div class="w-10 h-10 bg-[#151722] rounded-xl flex items-center justify-center text-xl">🙈</div>
                                    </div>
                                </div>

                                <!-- رمي العملة -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">رمي العملة (Coinflip)</p>
                                            <p class="text-gray-400 text-[10px]">ملك أو كتابة مع رهانات حماسية</p>
                                        </div>
                                        <div class="w-10 h-10 bg-[#151722] rounded-xl flex items-center justify-center text-xl">🪙</div>
                                    </div>
                                </div>

                                <!-- قتال ومبارزات -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">قتال ومبارزة (Fight)</p>
                                            <p class="text-gray-400 text-[10px]">تحديات PvP حماسية بين الأعضاء بنظام النقاط</p>
                                        </div>
                                        <div class="w-10 h-10 bg-[#151722] rounded-xl flex items-center justify-center text-xl">⚔️</div>
                                    </div>
                                </div>

                                <!-- مسابقات وسين جيم -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">مسابقات وأسئلة (Trivia)</p>
                                            <p class="text-gray-400 text-[10px]">أسئلة إسلامية وثقافية وجوائز نجوم</p>
                                        </div>
                                        <div class="w-10 h-10 bg-[#151722] rounded-xl flex items-center justify-center text-xl">❓</div>
                                    </div>
                                </div>

                                <!-- بلاك جاك -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">بلاك جاك (Blackjack)</p>
                                            <p class="text-gray-400 text-[10px]">لعبة 21 والورق والتحديات المالية السريعة</p>
                                        </div>
                                        <div class="w-10 h-10 bg-[#151722] rounded-xl flex items-center justify-center text-xl">🃏</div>
                                    </div>
                                </div>

                                <!-- ميمز -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">ميمز (Meme)</p>
                                            <p class="text-gray-400 text-[10px]">جلب صور ونكت مضحكة عشوائية من ريديت</p>
                                        </div>
                                        <div class="w-10 h-10 bg-[#151722] rounded-xl flex items-center justify-center text-xl">🐸</div>
                                    </div>
                                </div>

                                <!-- الكرة السحرية -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">الكرة السحرية (8Ball)</p>
                                            <p class="text-gray-400 text-[10px]">الإجابة على التساؤلات والتوقعات الغامضة</p>
                                        </div>
                                        <div class="w-10 h-10 bg-[#151722] rounded-xl flex items-center justify-center text-xl">🎱</div>
                                    </div>
                                </div>

                                <!-- حجر ورقة مقص -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">حجر ورقة مقص (RPS)</p>
                                            <p class="text-gray-400 text-[10px]">لعبة حجر ورقة مقص ضد البوت أو الأعضاء</p>
                                        </div>
                                        <div class="w-10 h-10 bg-[#151722] rounded-xl flex items-center justify-center text-xl">✂️</div>
                                    </div>
                                </div>

                                <!-- رمي النرد -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">رمي النرد (Dice)</p>
                                            <p class="text-gray-400 text-[10px]">لعبة رمي النرد والمراهنة على الأرقام</p>
                                        </div>
                                        <div class="w-10 h-10 bg-[#151722] rounded-xl flex items-center justify-center text-xl">🎲</div>
                                    </div>
                                </div>

                            </div>
                        </div>

                        <!-- Commands Section matching Image 4 -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl space-y-4">
                            <h4 class="font-bold text-white text-sm text-right">الأوامر</h4>
                            <div class="space-y-3">
                                
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-[#5865f2]">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">points</p>
                                            <p class="text-gray-400 text-xs">نظام نقاط وتصنيف اللاعبين على مستوى السيرفر</p>
                                        </div>
                                        <div class="w-8 h-8 bg-[#151722] rounded-lg flex items-center justify-center text-[#5865f2] font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-[#5865f2]">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">game stop</p>
                                            <p class="text-gray-400 text-xs">إيقاف وإنهاء أي لعبة جارية في القناة الحالية فوراً</p>
                                        </div>
                                        <div class="w-8 h-8 bg-[#151722] rounded-lg flex items-center justify-center text-[#5865f2] font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-[#5865f2]">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">dice</p>
                                            <p class="text-gray-400 text-xs">رمي النرد والمراهنة على الأرقام والنتائج</p>
                                        </div>
                                        <div class="w-8 h-8 bg-[#151722] rounded-lg flex items-center justify-center text-[#5865f2] font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-[#5865f2]">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">coinflip</p>
                                            <p class="text-gray-400 text-xs">رمي العملة ملك أو كتابة مع رهانات حماسية</p>
                                        </div>
                                        <div class="w-8 h-8 bg-[#151722] rounded-lg flex items-center justify-center text-[#5865f2] font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-[#5865f2]">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">fight</p>
                                            <p class="text-gray-400 text-xs">تحديات وقتال PvP حماسي بين الأعضاء بنقاط صحة HP</p>
                                        </div>
                                        <div class="w-8 h-8 bg-[#151722] rounded-lg flex items-center justify-center text-[#5865f2] font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-[#5865f2]">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">trivia</p>
                                            <p class="text-gray-400 text-xs">مسابقات وسين جيم إسلامية وثقافية مع جوائز نجوم</p>
                                        </div>
                                        <div class="w-8 h-8 bg-[#151722] rounded-lg flex items-center justify-center text-[#5865f2] font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-[#5865f2]">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">roulette</p>
                                            <p class="text-gray-400 text-xs">روليت الكازينو الأوروبي ومضاعفة أرباح النجوم</p>
                                        </div>
                                        <div class="w-8 h-8 bg-[#151722] rounded-lg flex items-center justify-center text-[#5865f2] font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-[#5865f2]">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">blackjack</p>
                                            <p class="text-gray-400 text-xs">لعبة 21 والورق والتحديات المالية السريعة</p>
                                        </div>
                                        <div class="w-8 h-8 bg-[#151722] rounded-lg flex items-center justify-center text-[#5865f2] font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-[#5865f2]">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">meme</p>
                                            <p class="text-gray-400 text-xs">جلب صور ونكت وميمز مضحكة عشوائية من ريديت</p>
                                        </div>
                                        <div class="w-8 h-8 bg-[#151722] rounded-lg flex items-center justify-center text-[#5865f2] font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-[#5865f2]">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">8ball</p>
                                            <p class="text-gray-400 text-xs">الكرة السحرية للإجابة على جميع الأسئلة والتوقعات</p>
                                        </div>
                                        <div class="w-8 h-8 bg-[#151722] rounded-lg flex items-center justify-center text-[#5865f2] font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-[#5865f2]">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">rps</p>
                                            <p class="text-gray-400 text-xs">لعبة حجر ورقة مقص ضد البوت أو الأعضاء</p>
                                        </div>
                                        <div class="w-8 h-8 bg-[#151722] rounded-lg flex items-center justify-center text-[#5865f2] font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-[#5865f2]">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">chairs</p>
                                            <p class="text-gray-400 text-xs">لعبة الكراسي الموسيقية التفاعلية في الشات</p>
                                        </div>
                                        <div class="w-8 h-8 bg-[#151722] rounded-lg flex items-center justify-center text-[#5865f2] font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-[#5865f2]">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">mafia</p>
                                            <p class="text-gray-400 text-xs">لعبة المافيا والغموض بين الأعضاء في الشات</p>
                                        </div>
                                        <div class="w-8 h-8 bg-[#151722] rounded-lg flex items-center justify-center text-[#5865f2] font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        <button type="button" class="text-gray-500 hover:text-[#5865f2]">✏️</button>
                                    </div>
                                    <div class="flex items-center gap-3 text-right">
                                        <div>
                                            <p class="font-bold text-white text-sm">hideseek</p>
                                            <p class="text-gray-400 text-xs">لعبة الغميضة والبحث عن الأعضاء المختبئين</p>
                                        </div>
                                        <div class="w-8 h-8 bg-[#151722] rounded-lg flex items-center justify-center text-[#5865f2] font-mono text-xs">&gt;_</div>
                                    </div>
                                </div>

                            </div>
                        </div>

                        <!-- Economy Betting Settings -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl space-y-4 text-right">
                            <h4 class="font-bold text-white text-sm">إعدادات الرهانات ومضاعف الجوائز 💰</h4>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الحد الأدنى للرهان (Min Bet)</label>
                                    <input type="number" name="min_bet" value="${settings.min_bet || 10}" min="1" class="w-full bg-[#0b0d14] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الحد الأقصى للرهان (Max Bet)</label>
                                    <input type="number" name="max_bet" value="${settings.max_bet || 50000}" min="100" class="w-full bg-[#0b0d14] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">مضاعف المكافآت (Multiplier)</label>
                                    <input type="number" step="0.1" name="game_rewards_multiplier" value="${settings.game_rewards_multiplier || 1.0}" min="0.5" max="5.0" class="w-full bg-[#0b0d14] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'autoroles') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl">
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
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl">
                            <h4 class="font-bold text-white text-sm mb-2 text-right">نظام ستاربورد (Starboard) ⭐</h4>
                            <p class="text-gray-400 text-xs mb-4 text-right">نشر الرسائل المميزة تلقائياً في روم المشاهير عند تفاعل الأعضاء عليها بإيموجي النجمة ⭐.</p>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">قناة الستاربورد (Starboard Channel)</label>
                                    ${renderChannelSelect('starboard_channel', settings.starboard_channel)}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">الحد الأدنى للنجوم (Star Threshold)</label>
                                    <input type="number" name="starboard_count" value="${settings.starboard_count || 3}" min="1" max="50" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'colors') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl text-right">
                            <h4 class="font-bold text-white text-sm mb-2">نظام ألوان الرتب التفاعلي (Color Roles) 🎨</h4>
                            <p class="text-gray-400 text-xs mb-4">يتيح للأعضاء اختيار لون اسمهم في السيرفر عبر القائمة أو الأزرار التفاعلية.</p>
                            
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div class="p-3 bg-[#0b0d14] border border-white/5 rounded-xl text-center">
                                    <span class="w-6 h-6 rounded-full bg-purple-500 inline-block mb-1 shadow-lg shadow-purple-500/50"></span>
                                    <p class="text-xs font-bold text-white">أرجواني الملكي</p>
                                </div>
                                <div class="p-3 bg-[#0b0d14] border border-white/5 rounded-xl text-center">
                                    <span class="w-6 h-6 rounded-full bg-blue-500 inline-block mb-1 shadow-lg shadow-blue-500/50"></span>
                                    <p class="text-xs font-bold text-white">أزرق سماوي</p>
                                </div>
                                <div class="p-3 bg-[#0b0d14] border border-white/5 rounded-xl text-center">
                                    <span class="w-6 h-6 rounded-full bg-emerald-500 inline-block mb-1 shadow-lg shadow-emerald-500/50"></span>
                                    <p class="text-xs font-bold text-white">أخضر زمردي</p>
                                </div>
                                <div class="p-3 bg-[#0b0d14] border border-white/5 rounded-xl text-center">
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
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl">
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
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl">
                            <h4 class="font-bold text-white text-sm mb-4 text-right">مكافحة الغزو والهجمات (Anti-Raid Protection) 🚨</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">الحد الأقصى لدخول الأعضاء في 10 ثوانٍ</label>
                                    <input type="number" value="5" min="2" max="50" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2 text-right">الإجراء الفوري عند كشف هجوم</label>
                                    <select class="w-full bg-[#0b0d14] border border-white/5 rounded-xl px-4 py-3 text-xs text-white outline-none">
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
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl flex items-center justify-between">
                            <label class="toggle"><input type="checkbox" name="verify_enabled" value="1" ${settings.verify_enabled ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="text-right">
                                <h4 class="font-bold text-white text-sm">نظام التحقق والتفعيل التفاعلي (Verification System) 🛡️</h4>
                                <p class="text-gray-400 text-xs mt-0.5">إعطاء رتبة معينة للأعضاء تلقائياً بعد ضغطهم على زر التحقق "تحقق الآن"</p>
                            </div>
                        </div>

                        <!-- Core Verification Settings -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl space-y-4 text-right">
                            <h4 class="font-bold text-white text-sm">إعدادات الرتبة والروم ⚙️</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">روم التحقق (Verification Channel) <span class="text-[#5865f2]">*</span></label>
                                    ${renderChannelSelect('verify_channel', settings.verify_channel)}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الرتبة الممنوحة عند التفعيل (Verified Role) <span class="text-[#5865f2]">*</span></label>
                                    ${renderRoleSelect('verify_role', settings.verify_role)}
                                </div>
                            </div>
                        </div>

                        <!-- Verification Message Customizer -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl space-y-3 text-right">
                            <h4 class="font-bold text-white text-sm">رسالة لوحة التحقق (Verification Message) 📌</h4>
                            <textarea id="verifyMsgInput" name="verify_message" rows="3" placeholder="📌 إثبات نفسك&#10;&#10;عشان تثبت نفسك، اضغط على الزر الموجود تحت الرسالة، وبكذا يتم تفعيلك وسترى جميع الرومات." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right leading-relaxed">${settings.verify_message || '📌 إثبات نفسك\n\nعشان تثبت نفسك، اضغط على الزر الموجود تحت الرسالة، وبكذا يتم تفعيلك وسترى جميع الرومات.'}</textarea>
                        </div>

                        <!-- Interactive Verification Panel Deployer -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl space-y-4 text-right">
                            <div class="flex items-center justify-between">
                                <span class="px-2.5 py-1 bg-purple-950/60 text-gray-200 border border-purple-800/40 rounded-lg text-xs font-bold">🚀 نشر مباشر</span>
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
                        const channelSel = document.querySelector('select[name="verify_channel"]');
                        const roleSel = document.querySelector('select[name="verify_role"]');
                        const messageEl = document.getElementById('verifyMsgInput');

                        const channelId = channelSel ? channelSel.value.trim() : '';
                        const roleId = roleSel ? roleSel.value.trim() : '';
                        const message = messageEl ? messageEl.value.trim() : '';

                        const statusEl = document.getElementById('verifySendStatus');
                        const btn = document.getElementById('sendVerifyBtn');

                        if (!channelId || channelId === '') {
                            alert('يرجى اختيار روم التحقق أولاً!');
                            return;
                        }
                        if (!roleId || roleId === '') {
                            alert('يرجى اختيار الرتبة الممنوحة عند التفعيل أولاً!');
                            return;
                        }

                        btn.disabled = true;
                        btn.innerHTML = '⏳ جارٍ النشر...';
                        statusEl.className = 'text-xs font-bold text-center text-[#5865f2] mt-2 block';
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
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl text-right">
                            <h4 class="font-bold text-white text-sm mb-1">الرتب التفاعلية بالأزرار (Reaction & Button Roles) 🔘</h4>
                            <p class="text-gray-400 text-xs mb-4">إنشاء رسالة بأزرار تفاعلية تمكن الأعضاء من إعطاء أو إزالة الرتب عن أنفسهم بنقرة واحدة.</p>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">روم إرسال الرسالة (Channel ID) <span class="text-[#5865f2]">*</span></label>
                                    <input type="text" id="rrChannel" placeholder="ضع ID القناة..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الرتبة المراد إعطاؤها (Role ID) <span class="text-[#5865f2]">*</span></label>
                                    <input type="text" id="rrRole" placeholder="ضع ID الرتبة..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-right">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">نص الزر (Button Label)</label>
                                    <input type="text" id="rrLabel" placeholder="مثال: الإشعارات 🔔 أو الأخبار" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">عنوان رسالة الإيمبد (Embed Title)</label>
                                    <input type="text" id="rrTitle" placeholder="مثال: اختر رتبتك من هنا" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                            </div>

                            <div class="mt-4">
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">وصف الرسالة (Description)</label>
                                <textarea id="rrDesc" rows="3" placeholder="اضغط على الزر بالأسفل للحصول على الرتبة أو إزالتها..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right"></textarea>
                            </div>
                        </div>
                    </div>
                `;
            } else if (section === 'economy') {
                formFieldsHtml = `
                    <div class="space-y-6">
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl flex items-center justify-between">
                            <label class="toggle"><input type="checkbox" name="economy_enabled" value="1" ${settings.economy_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="text-right">
                                <h4 class="font-bold text-white text-sm">نظام اقتصاد وعملة السيرفر (Economy & Star System) 💰</h4>
                                <p class="text-gray-400 text-xs mt-0.5">تفعيل نظام النجوم، البنك، التحويلات، العمل والوظائف، وسوق الرتب والمراهنات</p>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">المكافأة اليومية الأساسية (/daily)</label>
                                <input type="number" name="daily_amount" value="${settings.daily_amount || 500}" min="50" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">مدة انتظار أمر العمل (/work بالساعات)</label>
                                <input type="number" name="work_cooldown" value="${settings.work_cooldown || 4}" min="1" max="24" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">نسبة ضريبة التحويل (/pay %)</label>
                                <input type="number" step="0.5" name="transfer_tax" value="${settings.transfer_tax || 5}" min="0" max="20" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                            </div>
                        </div>

                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl text-right">
                            <h4 class="font-bold text-white text-sm mb-3">أوامر الاقتصاد المتوفرة بالأعضاء 💳</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3 rounded-xl flex items-center justify-between">
                                    <span class="text-xs text-emerald-400 font-bold">نشط ✅</span>
                                    <div>
                                        <p class="font-bold text-white text-xs">/bank (deposit & withdraw)</p>
                                        <p class="text-gray-400 text-[10px]">إيداع وسحب وحماية النجوم في الحساب البنكي</p>
                                    </div>
                                </div>
                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3 rounded-xl flex items-center justify-between">
                                    <span class="text-xs text-emerald-400 font-bold">نشط ✅</span>
                                    <div>
                                        <p class="font-bold text-white text-xs">/work</p>
                                        <p class="text-gray-400 text-[10px]">العمل في وظائف عشوائية وكسب المكافآت</p>
                                    </div>
                                </div>
                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3 rounded-xl flex items-center justify-between">
                                    <span class="text-xs text-emerald-400 font-bold">نشط ✅</span>
                                    <div>
                                        <p class="font-bold text-white text-xs">/gamble & /casino</p>
                                        <p class="text-gray-400 text-[10px]">المراهنة ومضاعفة النجوم في ألعاب الكازينو</p>
                                    </div>
                                </div>
                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3 rounded-xl flex items-center justify-between">
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
                                    <span class="text-gray-200 font-bold text-[10px] bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/40">بدون ديفن (Non-Deafened) 🔊</span>
                                </div>
                            </div>
                        </div>

                        <!-- إعدادات الروم الصوتي والمحطة -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl space-y-4 text-right">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span class="text-xs text-gray-400 font-bold">اختر الروم الصوتي أو ضع الـ ID يدوياً</span>
                                <h4 class="font-bold text-white text-sm">إعدادات الروم والمحطة ⚙️</h4>
                            </div>
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">اختر الروم الصوتي من السيرفر <span class="text-emerald-400">*</span></label>
                                    ${voiceChannels.length > 0 ? `
                                        <select id="voiceChannelSelect" onchange="document.getElementById('quranChannelInput').value = this.value" class="w-full bg-[#0b0d14] border border-white/5 focus:border-emerald-500 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer mb-2">
                                            <option value="">-- اختر من قائمة الرومات --</option>
                                            ${voiceChannelOptions}
                                        </select>
                                    ` : ''}
                                    <input type="text" id="quranChannelInput" name="quran_channel" value="${settings.quran_channel || ''}" placeholder="أو اكتب ID الروم الصوتي هنا..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>

                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">المحطة أو القارئ المفضل <span class="text-emerald-400">*</span></label>
                                    <select id="quranStationSelect" name="quran_station" class="w-full bg-[#0b0d14] border border-white/5 focus:border-emerald-500 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer">
                                        ${stationOptions}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- إعدادات التشغيل المستمر 24/7 والديفن -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl space-y-4 text-right">
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
                        statusMsg.className = 'text-xs font-bold text-center text-[#5865f2] mt-2 block bg-[#151722] border border-purple-800/40 py-2.5 px-4 rounded-xl';
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
                        <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <button type="button" onclick="deleteAppForm('${a.id}')" class="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-900/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                                <span class="px-2.5 py-1 bg-purple-950/60 text-gray-200 rounded-lg text-[10px] font-bold">${qList.length} أسئلة</span>
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
                        <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-6 shadow-xl space-y-4 text-right">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-1 bg-[#0b0d14] border border-white/5 px-3 py-1 rounded-xl text-xs font-mono font-bold text-gray-300">
                                    <span class="text-[#5865f2]">${appsCountFormatted}</span>
                                    <span>/</span>
                                    <span class="text-gray-500">00</span>
                                </div>
                                <h4 class="font-bold text-white text-base">التقديمات</h4>
                            </div>

                            <!-- Dashed Create Button -->
                            <div onclick="toggleCreateAppForm()" class="border-2 border-dashed border-purple-950/70 hover:border-purple-600/70 bg-[#0b0d14]/40 hover:bg-purple-950/20 rounded-2xl p-6 flex items-center justify-center gap-2 cursor-pointer transition text-gray-300 hover:text-white">
                                <span class="text-xs font-bold">إنشاء تقديم</span>
                                <span class="w-5 h-5 rounded-full bg-purple-900/60 flex items-center justify-center text-xs font-bold text-gray-200">➕</span>
                            </div>

                            <!-- Inline Form for Creating an Application (Hidden by default) -->
                            <div id="createAppModal" class="hidden bg-[#0b0d14] border border-purple-900/40 rounded-2xl p-5 space-y-4 mt-4">
                                <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                    <button type="button" onclick="toggleCreateAppForm()" class="text-gray-500 hover:text-white text-xs font-bold">✕ إلغاء</button>
                                    <h5 class="font-bold text-gray-200 text-xs">✨ إضافة استمارة تقديم جديدة</h5>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1.5">عنوان التقديم <span class="text-rose-400">*</span></label>
                                        <input type="text" id="newAppTitle" placeholder="مثال: تقديم إدارة السيرفر / دعم فني" class="w-full bg-[#1c1f2e] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1.5">وصف التقديم (اختياري)</label>
                                        <input type="text" id="newAppDesc" placeholder="شروط أو توضيح بسيط للتقديم..." class="w-full bg-[#1c1f2e] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none">
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
                                    <textarea id="newAppQuestions" rows="4" placeholder="1. كم عمرك؟&#10;2. ما هي خبراتك السابقة في الإدارة؟&#10;3. كم ساعة تتواجد يومياً في الديسكورد؟" class="w-full bg-[#1c1f2e] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none"></textarea>
                                </div>
                                <div class="flex justify-end pt-2">
                                    <button type="button" onclick="submitCreateApp()" class="px-6 py-2.5 bg-gradient-to-r from-[#5865f2] to-indigo-600 hover:from-[#4752c4] hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-1.5">
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
                        <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-6 shadow-xl space-y-3 text-right">
                            <h4 class="font-bold text-white text-base mb-3">الأوامر</h4>

                            <!-- Command 1: applications pending -->
                            <div class="bg-[#0b0d14] border border-purple-950/30 p-4 rounded-xl flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <button type="button" class="w-7 h-7 rounded-lg bg-[#151722] text-gray-400 hover:text-white flex items-center justify-center text-xs">✏️</button>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <div class="font-mono font-bold text-white text-xs">applications pending</div>
                                        <p class="text-gray-400 text-[11px] mt-0.5">عرض التقديمات قيد الانتظار</p>
                                    </div>
                                    <div class="w-6 h-6 rounded-md bg-purple-950/60 text-gray-200 flex items-center justify-center text-xs font-mono font-bold">&gt;_</div>
                                </div>
                            </div>

                            <!-- Command 2: applications points list -->
                            <div class="bg-[#0b0d14] border border-purple-950/30 p-4 rounded-xl flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <button type="button" class="w-7 h-7 rounded-lg bg-[#151722] text-gray-400 hover:text-white flex items-center justify-center text-xs">✏️</button>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <div class="font-mono font-bold text-white text-xs">applications points list</div>
                                        <p class="text-gray-400 text-[11px] mt-0.5">عرض نقاط التقديمات الخاصة بك أو الخاصة بعضو آخر</p>
                                    </div>
                                    <div class="w-6 h-6 rounded-md bg-purple-950/60 text-gray-200 flex items-center justify-center text-xs font-mono font-bold">&gt;_</div>
                                </div>
                            </div>

                            <!-- Command 3: applications points reset -->
                            <div class="bg-[#0b0d14] border border-purple-950/30 p-4 rounded-xl flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <button type="button" class="w-7 h-7 rounded-lg bg-[#151722] text-gray-400 hover:text-white flex items-center justify-center text-xs">✏️</button>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <div class="font-mono font-bold text-white text-xs">applications points reset_user|reset_server</div>
                                        <p class="text-gray-400 text-[11px] mt-0.5">إعادة تعيين نقاط التقديمات لسيرفر أو لعضو</p>
                                    </div>
                                    <div class="w-6 h-6 rounded-md bg-purple-950/60 text-gray-200 flex items-center justify-center text-xs font-mono font-bold">&gt;_</div>
                                </div>
                            </div>

                            <!-- Command 4: applications points set -->
                            <div class="bg-[#0b0d14] border border-purple-950/30 p-4 rounded-xl flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <button type="button" class="w-7 h-7 rounded-lg bg-[#151722] text-gray-400 hover:text-white flex items-center justify-center text-xs">✏️</button>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <div class="font-mono font-bold text-white text-xs">applications points set</div>
                                        <p class="text-gray-400 text-[11px] mt-0.5">تعيين نقاط التقديمات لعضو</p>
                                    </div>
                                    <div class="w-6 h-6 rounded-md bg-purple-950/60 text-gray-200 flex items-center justify-center text-xs font-mono font-bold">&gt;_</div>
                                </div>
                            </div>
                        </div>

                        <!-- Section 3: منشئ الرسالة الواحدة (Single Message Panel Deployer) -->
                        <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-6 shadow-xl space-y-5 text-right">
                            <div>
                                <h4 class="font-bold text-white text-base">منشئ الرسالة الواحدة</h4>
                                <p class="text-gray-400 text-xs mt-0.5">أنشئ وأرسل رسالة واحدة تتضمن جميع التقديمات لسهولة عرضها.</p>
                            </div>

                            <!-- Discord Message Preview Box -->
                            <div class="bg-[#0b0d14] border border-white/5 rounded-2xl p-4 space-y-3">
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
                                        <div class="flex items-center bg-[#0b0d14] border border-white/5 p-1 rounded-xl gap-1">
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
                                    <button type="button" onclick="sendApplicationPanelDirect()" id="sendAppPanelBtn" class="px-8 py-3 bg-gradient-to-r from-[#5865f2] to-indigo-600 hover:from-[#4752c4] hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2">
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
                        statusEl.className = 'text-xs font-bold text-center text-[#5865f2] mt-2 block bg-[#151722] border border-purple-800/40 py-2 px-4 rounded-xl';
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
                        <div class="bg-[#1c1f2e] border border-white/5 rounded-3xl p-7 shadow-2xl space-y-6 text-right relative overflow-hidden">
                            <!-- Header with Golden Crown -->
                            <div class="flex items-center justify-between border-b border-white/5 pb-4">
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
                                    <div class="h-32 rounded-2xl bg-[#0b0d14] border-2 border-dashed border-purple-950/60 hover:border-[#5865f2]/40 flex flex-col items-center justify-center relative overflow-hidden transition group">
                                        <div id="bannerPreview" class="absolute inset-0 bg-cover bg-center ${botBannerVal ? '' : 'hidden'}" style="background-image: url('${botBannerVal}');"></div>
                                        <div class="flex flex-col items-center gap-1 z-10 text-gray-500 group-hover:text-gray-200">
                                            <span class="text-2xl">🖼️</span>
                                            <span class="text-[10px] font-bold">ضع رابط الخلفية بالأسفل</span>
                                        </div>
                                    </div>
                                    <input type="text" id="botBannerInput" oninput="updateBannerPreview(this.value)" value="${botBannerVal}" placeholder="رابط صورة الخلفية (URL)..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>

                                <!-- Avatar Box -->
                                <div class="space-y-2 flex flex-col items-end">
                                    <label class="block text-xs font-bold text-gray-400">الصورة الرمزية (Avatar)</label>
                                    <div class="w-28 h-28 rounded-full bg-[#0b0d14] border-2 border-purple-600/60 shadow-xl shadow-black/20 overflow-hidden flex items-center justify-center relative group">
                                        <img id="avatarPreview" src="${botAvatarVal}" class="w-full h-full object-cover">
                                    </div>
                                    <input type="text" id="botAvatarInput" oninput="updateAvatarPreview(this.value)" value="${botAvatarVal}" placeholder="رابط الصورة الرمزية (URL)..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right mt-1">
                                </div>
                            </div>

                            <!-- Bot Name with 0/32 character counter -->
                            <div class="space-y-1.5 pt-2">
                                <div class="flex items-center justify-between text-xs">
                                    <span id="botNameCharCount" class="font-mono text-gray-500">${botNameVal.length}/32</span>
                                    <label class="font-bold text-gray-300">أسم البوت في السيرفر (Bot Nickname)</label>
                                </div>
                                <input type="text" id="botNameInput" maxlength="32" oninput="updateBotNameCount(this)" value="${botNameVal}" placeholder="Nova Bot / ZENO" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-bold">
                            </div>

                            <!-- Bot Status Dropdown -->
                            <div class="space-y-1.5">
                                <label class="block text-xs font-bold text-gray-300">الحالة (Presence Status)</label>
                                <select id="botStatusSelect" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer">
                                    <option value="online" ${botStatusVal === 'online' ? 'selected' : ''}>🟢 متصل (Online)</option>
                                    <option value="idle" ${botStatusVal === 'idle' ? 'selected' : ''}>🟡 خامل (Idle)</option>
                                    <option value="dnd" ${botStatusVal === 'dnd' ? 'selected' : ''}>🔴 عدم الإزعاج (Do Not Disturb)</option>
                                    <option value="invisible" ${botStatusVal === 'invisible' ? 'selected' : ''}>⚪ غير متصل (Invisible)</option>
                                </select>
                            </div>

                            <!-- Activity Type Dropdown -->
                            <div class="space-y-1.5">
                                <label class="block text-xs font-bold text-gray-300">نوع النشاط (Activity Type)</label>
                                <select id="botActTypeSelect" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer">
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
                                <input type="text" id="botActTextInput" value="${botActTextVal}" placeholder="ZENO Bot | #help | حماية وسيرفرات" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">
                            </div>

                            <!-- Save Button (Green Button matching image) -->
                            <div class="pt-4 border-t border-white/5 flex items-center justify-between">
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
            } else if (section === 'social' || section === 'notifier') {
                const feeds = database.getGuildSocialFeeds(guildId) || [];
                const feedsListHtml = feeds.length > 0 ? feeds.map(f => {
                    const icon = f.platform === 'youtube' ? '📺 YouTube' : f.platform === 'twitch' ? '🔴 Twitch' : '🎵 TikTok';
                    const color = f.platform === 'youtube' ? 'border-red-500/30 bg-red-950/20' : f.platform === 'twitch' ? 'border-purple-500/30 bg-purple-950/20' : 'border-cyan-500/30 bg-cyan-950/20';
                    const mention = f.role_id ? (f.role_id === 'everyone' ? '@everyone' : ('<@&' + f.role_id + '>')) : 'بدون منشن';
                    return `
                    <div class="bg-[#0b0d14] border ` + color + ` p-4 rounded-xl flex items-center justify-between gap-4">
                        <div class="flex items-center gap-2">
                            <button type="button" onclick="deleteSocialFeed('` + f.id + `')" class="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-600 text-rose-300 hover:text-white rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                            <button type="button" onclick="toggleSocialFeedItem('` + f.id + `', ` + (f.enabled ? 'false' : 'true') + `)" class="px-3 py-1.5 ` + (f.enabled ? 'bg-amber-950/60 hover:bg-amber-600 text-amber-300' : 'bg-emerald-950/60 hover:bg-emerald-600 text-emerald-300') + ` hover:text-white rounded-lg text-xs font-bold transition">` + (f.enabled ? 'إيقاف مؤقت ⏸️' : 'تفعيل ▶️') + `</button>
                            <button type="button" onclick="testSocialFeed('` + f.id + `')" class="px-3 py-1.5 bg-purple-950/60 hover:bg-[#5865f2] text-gray-200 hover:text-white rounded-lg text-xs font-bold transition">تجربة 🚀</button>
                        </div>
                        <div class="text-right">
                            <div class="flex items-center justify-end gap-2">
                                <span class="px-2 py-0.5 rounded text-[10px] font-bold ` + (f.enabled ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300') + `">` + (f.enabled ? 'مفعّل' : 'متوقف') + `</span>
                                <p class="font-bold text-white text-sm">` + f.account_id + `</p>
                                <span class="text-xs font-bold">` + icon + `</span>
                            </div>
                            <p class="text-gray-400 text-xs mt-1">الروم: <span class="text-gray-200">#` + (channels.find(c => c.id === f.channel_id)?.name || f.channel_id) + `</span> | المنشن: <span class="text-amber-300">` + mention + `</span></p>
                        </div>
                    </div>
                    `;
                }).join('') : '<div class="p-8 text-center text-gray-500 text-xs bg-[#0b0d14] border border-purple-950/30 rounded-xl">لا توجد أي قنوات أو حسابات مضافة حالياً. أضف أول حساب من النموذج بالأسفل!</div>';

                formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- Master Notifier Toggle -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl flex items-center justify-between">
                            <label class="toggle"><input type="checkbox" name="social_alerts_enabled" value="1" ${settings.social_alerts_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="text-right">
                                <h4 class="font-bold text-white text-sm">نظام تنبيهات السوشيال ميديا 📺</h4>
                                <p class="text-gray-400 text-xs mt-0.5">إرسال إشعارات فورية وتلقائية عند نشر فيديو جديد أو بدء بث مباشر</p>
                            </div>
                        </div>

                        <!-- Current Feeds List -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl text-right space-y-3">
                            <div class="flex items-center justify-between mb-2">
                                <span class="px-2.5 py-1 bg-purple-950/60 text-gray-200 border border-purple-800/40 rounded-lg text-xs font-bold">الحسابات المراقبة (${feeds.length})</span>
                                <h4 class="font-bold text-white text-sm">القنوات والحسابات النشطة 📋</h4>
                            </div>
                            <div class="space-y-2.5">
                                ${feedsListHtml}
                            </div>
                        </div>

                        <!-- Add New Feed Form -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl text-right space-y-4">
                            <h4 class="font-bold text-white text-sm">إضافة قناة أو حساب جديد ➕</h4>
                            <p class="text-gray-400 text-xs">حدد المنصة والحساب والروم المخصص وسيتم النشر التلقائي فور نزول المحتوى:</p>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">المنصة المستهدفة <span class="text-[#5865f2]">*</span></label>
                                    <select id="feedPlatform" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none">
                                        <option value="youtube">📺 YouTube (قناة يوتيوب)</option>
                                        <option value="twitch">🔴 Twitch (ستريمر تويتش)</option>
                                        <option value="tiktok">🎵 TikTok (حساب تيك توك)</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">اسم الحساب / الرابط / ID القناة <span class="text-[#5865f2]">*</span></label>
                                    <input type="text" id="feedAccount" placeholder="مثال: @MrBeast أو رابط القناة" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-mono">
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">روم إرسال التنبيهات <span class="text-[#5865f2]">*</span></label>
                                    <select id="feedChannel" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none">
                                        <option value="">-- اختر الروم --</option>
                                        ${channels.map(c => '<option value="' + c.id + '">#' + c.name + '</option>').join('')}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الرتبة المراد منشنها (اختياري)</label>
                                    <select id="feedRole" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none">
                                        <option value="">بدون منشن</option>
                                        <option value="everyone">@everyone</option>
                                        ${roles.map(r => '<option value="' + r.id + '">@' + r.name + '</option>').join('')}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2">رسالة التنبيه المخصصة (اختياري)</label>
                                <input type="text" id="feedMessage" placeholder="مثال: 🔔 نزل فيديو جديد على قناة {channel}! شاهد الآن: {url}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                <span class="text-[10px] text-gray-500 mt-1 block">المتغيرات المتاحة: {channel} (اسم القناة) ، {title} (عنوان الفيديو/البث) ، {url} (الرابط)</span>
                            </div>

                            <div class="pt-2 flex justify-end">
                                <button type="button" onclick="addNewSocialFeed()" id="addFeedBtn" class="px-6 py-3 bg-gradient-to-r from-red-600 to-[#5865f2] hover:from-red-500 hover:to-[#4752c4] text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2">
                                    <span>➕ إضافة وتفعيل التنبيه الآن</span>
                                </button>
                            </div>
                            <div id="feedStatus" class="text-xs font-bold text-center hidden mt-2"></div>
                        </div>
                    </div>

                    <script>
                    async function addNewSocialFeed() {
                        const platform = document.getElementById('feedPlatform').value;
                        const account = document.getElementById('feedAccount').value.trim();
                        const channelId = document.getElementById('feedChannel').value;
                        const roleId = document.getElementById('feedRole').value;
                        const message = document.getElementById('feedMessage').value.trim();
                        const status = document.getElementById('feedStatus');
                        const btn = document.getElementById('addFeedBtn');

                        if (!account || !channelId) {
                            alert('الرجاء إدخال اسم الحساب واختيار روم التنبيهات!');
                            return;
                        }

                        btn.disabled = true;
                        btn.innerHTML = '⏳ جارٍ الإضافة...';

                        try {
                            const res = await fetch('/api/guild/' + '${guildId}' + '/social/add', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ platform, account, channelId, roleId, message })
                            });
                            const data = await res.json();
                            if (data.success) {
                                location.reload();
                            } else {
                                alert('خطأ: ' + (data.error || 'فشل إضافة التنبيه'));
                            }
                        } catch(e) {
                            alert('حدث خطأ أثناء الاتصال بالسيرفر');
                        } finally {
                            btn.disabled = false;
                            btn.innerHTML = '<span>➕ إضافة وتفعيل التنبيه الآن</span>';
                        }
                    }

                    async function deleteSocialFeed(id) {
                        if (!confirm('هل أنت متأكد من رغبتك في حذف هذا التنبيه؟')) return;
                        const res = await fetch('/api/guild/' + '${guildId}' + '/social/delete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id })
                        });
                        if (res.ok) location.reload();
                    }

                    async function toggleSocialFeedItem(id, enable) {
                        const res = await fetch('/api/guild/' + '${guildId}' + '/social/toggle', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id, enable })
                        });
                        if (res.ok) location.reload();
                    }

                    async function testSocialFeed(id) {
                        alert('جاري إرسال إشعار تجريبي في الروم...');
                        const res = await fetch('/api/guild/' + '${guildId}' + '/social/test', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id })
                        });
                        const data = await res.json();
                        if (data.success) alert('✅ تم إرسال الإشعار التجريبي بنجاح!');
                        else alert('❌ خطأ: ' + (data.error || 'فشل إرسال الإشعار'));
                    }
                    </script>
                `;
            } else if (section === 'invites') {
                const leaderboard = database.getInvitesLeaderboard ? database.getInvitesLeaderboard(guildId, 20) : [];
                const totalInvitesCount = leaderboard.reduce((acc, r) => acc + (r.total || 0), 0);
                const topInviter = leaderboard.length > 0 ? leaderboard[0] : null;

                const lbRowsHtml = leaderboard.length > 0 ? leaderboard.map((item, index) => {
                    const memberObj = botGuild?.members?.cache?.get(item.user_id);
                    const name = memberObj ? memberObj.user.username : `User (${item.user_id})`;
                    const avatar = memberObj ? memberObj.user.displayAvatarURL({ dynamic: true }) : 'https://cdn.discordapp.com/embed/avatars/0.png';
                    const medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : `#${index + 1}`));
                    return `
                        <tr class="border-b border-white/5 hover:bg-white/[0.02] transition text-right">
                            <td class="py-3 px-4 font-bold text-center text-amber-400 font-mono">${medal}</td>
                            <td class="py-3 px-4 flex items-center gap-3 justify-end">
                                <div>
                                    <div class="font-bold text-white text-xs">${name}</div>
                                    <div class="text-[10px] text-gray-500 font-mono">${item.user_id}</div>
                                </div>
                                <img src="${avatar}" class="w-7 h-7 rounded-full object-cover">
                            </td>
                            <td class="py-3 px-4 font-bold text-emerald-400 font-mono text-center">${item.regular}</td>
                            <td class="py-3 px-4 font-bold text-rose-400 font-mono text-center">${item.leaves}</td>
                            <td class="py-3 px-4 font-bold text-orange-400 font-mono text-center">${item.fake}</td>
                            <td class="py-3 px-4 font-bold text-purple-400 font-mono text-center">${item.bonus}</td>
                            <td class="py-3 px-4 font-black text-yellow-400 font-mono text-center text-sm">${item.total}</td>
                        </tr>
                    `;
                }).join('') : `<tr><td colspan="7" class="text-center py-8 text-gray-500 text-xs">لا توجد بيانات دعوات مسجلة حتى الآن</td></tr>`;

                formFieldsHtml = `
                    <div class="space-y-6 text-right">
                        <!-- Top Header -->
                        <div class="flex flex-col md:flex-row items-center justify-between gap-4 bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl">
                            <div class="flex items-center gap-3">
                                <button type="button" onclick="resetAllInvitesDirect()" class="px-4 py-2 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 rounded-xl text-xs font-bold transition">
                                    🗑️ تصفير كل الدعوات
                                </button>
                            </div>
                            <div>
                                <h3 class="font-black text-white text-xl">متتبع الدعوات المتقدم (Invite Tracker) 🔗</h3>
                                <p class="text-gray-400 text-xs mt-1">تتبع دقيق لمن قام بدعوة الأعضاء وحساب الدعوات الحقيقية والمغادرين والوهمية والبونص</p>
                            </div>
                        </div>

                        <!-- 3 Stat Cards -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl">
                                <span class="text-gray-400 text-[11px]">إجمالي الدعوات الصالحة</span>
                                <h4 class="text-2xl font-black text-yellow-400 mt-1 font-mono">${totalInvitesCount.toLocaleString()}</h4>
                                <span class="text-[10px] text-emerald-400">✨ دعوة نشطة في السيرفر</span>
                            </div>
                            <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl">
                                <span class="text-gray-400 text-[11px]">متصدر الدعوات (Top Inviter)</span>
                                <h4 class="text-base font-black text-white mt-1 truncate">${topInviter ? (botGuild?.members?.cache?.get(topInviter.user_id)?.user.username || topInviter.user_id) : 'لا يوجد'}</h4>
                                <span class="text-[10px] text-amber-400 font-mono font-bold">${topInviter ? topInviter.total : 0} دعوة مسجلة</span>
                            </div>
                            <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl">
                                <span class="text-gray-400 text-[11px]">الأعضاء المشاركون بالدعوة</span>
                                <h4 class="text-2xl font-black text-purple-400 mt-1 font-mono">${leaderboard.length}</h4>
                                <span class="text-[10px] text-indigo-400">👥 داعين مسجلين</span>
                            </div>
                        </div>

                        <!-- Add Bonus Invites Box -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl space-y-4">
                            <h4 class="font-bold text-white text-sm">🎁 إضافة أو خصم دعوات إضافية (Bonus Invites)</h4>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">أيدي أو منشن العضو (User ID)</label>
                                    <input type="text" id="bonusUserId" placeholder="مثال: 123456789012345678" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">عدد الدعوات (موجب للإضافة / سالب للخصم)</label>
                                    <input type="number" id="bonusAmount" value="5" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                                <div>
                                    <button type="button" onclick="submitBonusInvites()" class="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition shadow-lg">
                                        تطبيق الرصيد ✅
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Leaderboard Table -->
                        <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-5 overflow-x-auto">
                            <h4 class="font-bold text-white text-sm mb-4">🏆 قائمة متصدري الدعوات (Top Invites Leaderboard)</h4>
                            <table class="w-full text-xs">
                                <thead>
                                    <tr class="border-b border-white/10 text-gray-400 font-bold text-center">
                                        <th class="py-2.5 px-4">#</th>
                                        <th class="py-2.5 px-4 text-right">العضو</th>
                                        <th class="py-2.5 px-4">حقيقية (Regular)</th>
                                        <th class="py-2.5 px-4">مغادرين (Leaves)</th>
                                        <th class="py-2.5 px-4">وهمية (Fake)</th>
                                        <th class="py-2.5 px-4">بونص (Bonus)</th>
                                        <th class="py-2.5 px-4">الصافي (Total)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${lbRowsHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <script>
                    async function submitBonusInvites() {
                        const userId = document.getElementById('bonusUserId').value.trim();
                        const amount = parseInt(document.getElementById('bonusAmount').value, 10);
                        if (!userId || isNaN(amount)) return alert('يرجى كتابة أيدي العضو وتحديد عدد الدعوات!');
                        const res = await fetch('/api/guild/${guildId}/invites/add-bonus', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId, amount })
                        });
                        const data = await res.json();
                        if (data.success) { alert('✅ تم تحديث رصيد دعوات العضو بنجاح!'); location.reload(); }
                        else alert('❌ خطأ: ' + (data.error || 'فشل التحديث'));
                    }

                    async function resetAllInvitesDirect() {
                        if (!confirm('⚠️ تحذير: هل أنت متأكد من تصفير كافة بيانات الدعوات في السيرفر؟ لا يمكن التراجع عن هذا الإجراء!')) return;
                        const res = await fetch('/api/guild/${guildId}/invites/reset', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({})
                        });
                        const data = await res.json();
                        if (data.success) { alert('✅ تم تصفير الدعوات بنجاح!'); location.reload(); }
                    }
                    </script>
                `;
            } else if (section === 'broadcast' || section === 'announcements') {
                const broadcasts = database.getGuildBroadcasts ? database.getGuildBroadcasts(guildId) : [];

                const broadcastRowsHtml = broadcasts.length > 0 ? broadcasts.map(b => {
                    const statusBadge = b.status === 'active' ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">🟢 نشط</span>' : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-800 text-gray-400">⚪ منتهي</span>';
                    const typeText = b.is_recurring ? `🔁 متكرر كل ${b.interval_minutes}د` : (b.scheduled_time ? `⏰ مجدول لـ ${new Date(b.scheduled_time).toLocaleString('ar-SA')}` : '⚡ فوري');
                    const chans = b.channel_ids.split(',').map(cid => {
                        const ch = botGuild?.channels?.cache?.get(cid);
                        return ch ? `#${ch.name}` : cid;
                    }).join(', ');

                    return `
                        <div class="bg-[#0b0d14] border border-white/5 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 text-right">
                            <div class="flex items-center gap-2">
                                <button type="button" onclick="deleteBroadcastDirect(${b.id})" class="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 rounded-lg text-xs font-bold transition">🗑️ حذف</button>
                            </div>
                            <div class="flex-1">
                                <div class="flex items-center gap-2 justify-end">
                                    ${statusBadge}
                                    <span class="text-xs font-bold text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/40">${typeText}</span>
                                    <h5 class="font-bold text-white text-sm">${b.title || 'إعلان بدون عنوان'}</h5>
                                </div>
                                <p class="text-gray-300 text-xs mt-1 truncate">${b.message}</p>
                                <span class="text-[10px] text-gray-500 block mt-0.5">القنوات: ${chans}</span>
                            </div>
                        </div>
                    `;
                }).join('') : `<div class="text-center py-8 text-gray-500 text-xs">لا توجد أي إعلانات مجدولة أو متكررة حالياً</div>`;

                formFieldsHtml = `
                    <div class="space-y-6 text-right">
                        <!-- Top Header -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl">
                            <h3 class="font-black text-white text-xl">نظام الإعلانات والمذيع الآلي المتقدم 📢</h3>
                            <p class="text-gray-400 text-xs mt-1">إرسال إعلانات فورية، جدولة إعلانات لأوقات لاحقة، وتفعيل مذيع آلي دوري متكرر في عدة قنوات مع تصميم إيمبد احترافي</p>
                        </div>

                        <!-- Create Broadcast Card -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl space-y-4">
                            <h4 class="font-bold text-white text-sm border-b border-white/5 pb-3">✨ إنشاء إعلان جديد / جدولة / مذيع آلي</h4>
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة أو قنوات الإرسال <span class="text-[#5865f2]">*</span></label>
                                    ${renderChannelSelect('broadcastChannel', '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">عنوان الإعلان (اختياري)</label>
                                    <input type="text" id="bcTitle" placeholder="مثال: 📢 إعلان هام وتحديث جديد!" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2">نص الإعلان <span class="text-[#5865f2]">*</span></label>
                                <textarea id="bcMessage" rows="3" placeholder="اكتب محتوى الإعلان هنا..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right leading-relaxed"></textarea>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">نوع الإرسال</label>
                                    <select id="bcTypeSelect" onchange="toggleBcType(this.value)" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right cursor-pointer">
                                        <option value="instant">⚡ إرسال فوري الآن</option>
                                        <option value="recurring">🔁 مذيع آلي متكرر دورياً</option>
                                        <option value="scheduled">⏰ جدولة لوقت محدد</option>
                                    </select>
                                </div>
                                <div id="recurringBox" class="hidden">
                                    <label class="block text-xs font-bold text-gray-300 mb-2">التكرار كل (دقائق)</label>
                                    <input type="number" id="bcInterval" value="60" min="5" placeholder="60 دقيقة" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                                <div id="scheduledBox" class="hidden">
                                    <label class="block text-xs font-bold text-gray-300 mb-2">وقت وتاريخ النشر</label>
                                    <input type="datetime-local" id="bcScheduleTime" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2 text-xs text-white outline-none text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">لون الإيمبد</label>
                                    <input type="color" id="bcColor" value="#9333ea" class="w-full h-10 bg-[#0b0d14] border border-white/5 rounded-xl cursor-pointer p-1">
                                </div>
                            </div>

                            <div class="pt-2 flex justify-end">
                                <button type="button" onclick="submitNewBroadcast()" id="btnSaveBc" class="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2">
                                    <span>🚀 إرسال / حفظ الإعلان</span>
                                </button>
                            </div>
                        </div>

                        <!-- Active Broadcasts List -->
                        <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-6 space-y-4">
                            <h4 class="font-bold text-white text-sm">📋 قائمة الإعلانات والمذيع الآلي النشط</h4>
                            <div class="space-y-3">
                                ${broadcastRowsHtml}
                            </div>
                        </div>
                    </div>

                    <script>
                    function toggleBcType(val) {
                        document.getElementById('recurringBox').classList.toggle('hidden', val !== 'recurring');
                        document.getElementById('scheduledBox').classList.toggle('hidden', val !== 'scheduled');
                    }

                    async function submitNewBroadcast() {
                        const channelSel = document.getElementById('broadcastChannel');
                        const channel_ids = channelSel ? channelSel.value : '';
                        const title = document.getElementById('bcTitle').value.trim();
                        const message = document.getElementById('bcMessage').value.trim();
                        const type = document.getElementById('bcTypeSelect').value;
                        const interval_minutes = type === 'recurring' ? parseInt(document.getElementById('bcInterval').value, 10) : 0;
                        const scheduled_time = type === 'scheduled' ? document.getElementById('bcScheduleTime').value : null;
                        const is_recurring = type === 'recurring' ? 1 : 0;
                        const color = document.getElementById('bcColor').value;

                        if (!channel_ids) return alert('يرجى اختيار القناة المستهدفة أولاً!');
                        if (!message) return alert('يرجى كتابة نص الإعلان!');

                        const btn = document.getElementById('btnSaveBc');
                        btn.disabled = true;
                        btn.innerHTML = '⏳ جارٍ المعالجة...';

                        try {
                            const res = await fetch('/api/guild/${guildId}/broadcast/create', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ channel_ids, title, message, color, interval_minutes, scheduled_time, is_recurring })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم إرسال / حفظ الإعلان بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (data.error || 'فشل الحفظ'));
                            }
                        } catch(e) {
                            alert('حدث خطأ أثناء الاتصال بالخادم');
                        } finally {
                            btn.disabled = false;
                            btn.innerHTML = '<span>🚀 إرسال / حفظ الإعلان</span>';
                        }
                    }

                    async function deleteBroadcastDirect(id) {
                        if (!confirm('هل أنت متأكد من رغبتك في حذف هذا الإعلان؟')) return;
                        const res = await fetch('/api/guild/${guildId}/broadcast/delete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id })
                        });
                        const data = await res.json();
                        if (data.success) location.reload();
                    }
                    </script>
                `;
            } else if (section === 'giveaways') {
                const guildGiveaways = database.getGuildGiveaways ? database.getGuildGiveaways(guildId) : [];
                const activeGiveaways = guildGiveaways.filter(g => g.status === 'active');
                const endedGiveaways = guildGiveaways.filter(g => g.status !== 'active').slice(0, 10);

                function renderGiveawayCard(g, botGuild) {
                    const ch = botGuild?.channels?.cache?.get(g.channel_id);
                    const channelName = ch ? `#${ch.name}` : g.channel_id;
                    const endsAt = new Date(g.end_time);
                    const endsStr = endsAt.toLocaleString('ar-SA');
                    const entries = (() => { try { return JSON.parse(g.entries || '[]').length; } catch { return 0; } })();
                    const isActive = g.status === 'active';
                    const statusBadge = isActive
                        ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">🟢 نشط</span>`
                        : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-800 text-gray-400">⚪ منتهي</span>`;

                    const reqList = [];
                    if (g.required_role) reqList.push(`<span class="text-[10px] bg-indigo-950/60 text-indigo-300 px-1.5 py-0.5 rounded">🛡️ رتبة مطلوبة</span>`);
                    if (g.min_level > 0) reqList.push(`<span class="text-[10px] bg-purple-950/60 text-purple-300 px-1.5 py-0.5 rounded">⭐ مستوى ${g.min_level}+</span>`);
                    if (g.min_account_age > 0) reqList.push(`<span class="text-[10px] bg-orange-950/60 text-orange-300 px-1.5 py-0.5 rounded">📅 ${g.min_account_age} يوم</span>`);
                    if (g.extra_role) reqList.push(`<span class="text-[10px] bg-yellow-950/60 text-yellow-300 px-1.5 py-0.5 rounded">🔥 فرصة x2</span>`);

                    return `
                        <div class="bg-[#0b0d14] border border-white/5 rounded-xl p-4 text-right hover:border-yellow-900/40 transition">
                            <div class="flex items-start justify-between gap-3">
                                <div class="flex flex-col gap-1.5 items-start">
                                    ${isActive ? `
                                    <button onclick="endGiveawayNow('${g.message_id}', '${g.channel_id}')"
                                        class="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/40 rounded-lg text-[10px] font-bold transition">
                                        ⏹️ إنهاء
                                    </button>
                                    <button onclick="rerollGiveaway('${g.message_id}', '${g.channel_id}')"
                                        class="px-3 py-1.5 bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 border border-purple-800/40 rounded-lg text-[10px] font-bold transition">
                                        🎲 Reroll
                                    </button>` : `
                                    <button onclick="rerollGiveaway('${g.message_id}', '${g.channel_id}')"
                                        class="px-3 py-1.5 bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 border border-purple-800/40 rounded-lg text-[10px] font-bold transition">
                                        🎲 Reroll
                                    </button>`}
                                </div>
                                <div class="flex-1">
                                    <div class="flex items-center gap-2 justify-end flex-wrap mb-1">
                                        ${statusBadge}
                                        <span class="text-[10px] bg-[#1c1f2e] text-gray-300 px-2 py-0.5 rounded">👥 ${entries} مشترك</span>
                                        <span class="text-[10px] bg-[#1c1f2e] text-gray-300 px-2 py-0.5 rounded">🏆 ${g.winners_count || 1} فائز</span>
                                    </div>
                                    <h5 class="font-black text-white text-sm">🎁 ${g.prize || 'جائزة'}</h5>
                                    <div class="flex items-center gap-1 flex-wrap mt-1">
                                        ${reqList.join('')}
                                    </div>
                                    <div class="flex items-center justify-end gap-3 mt-2">
                                        <span class="text-[10px] text-gray-500">📍 ${channelName}</span>
                                        <span class="text-[10px] text-gray-500">⏰ ${endsStr}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }

                const activeHtml = activeGiveaways.length > 0
                    ? activeGiveaways.map(g => renderGiveawayCard(g, botGuild)).join('')
                    : `<div class="text-center py-8 text-gray-500 text-xs">لا توجد سحوبات نشطة حالياً</div>`;

                const endedHtml = endedGiveaways.length > 0
                    ? endedGiveaways.map(g => renderGiveawayCard(g, botGuild)).join('')
                    : `<div class="text-center py-8 text-gray-500 text-xs">لا توجد سحوبات منتهية</div>`;

                const channelOptions = guildTextChannels.map(c =>
                    `<option value="${c.id}">#${c.name}</option>`
                ).join('');

                const roleOptions = (botGuild?.roles?.cache ? Array.from(botGuild.roles.cache.values()).filter(r => r.name !== '@everyone') : [])
                    .map(r => `<option value="${r.id}">@${r.name}</option>`).join('');

                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- إنشاء سحب جديد -->
                        <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-5 space-y-4">
                            <h4 class="font-black text-white text-base">🎁 إنشاء سحب قيف أواي جديد</h4>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-400 mb-2">القناة</label>
                                    <div class="relative">
                                        <select id="gw_channel" class="w-full bg-[#0b0d14] border border-white/5 focus:border-yellow-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer appearance-none">
                                            ${channelOptions}
                                        </select>
                                        <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center px-3 text-gray-400">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/></svg>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-400 mb-2">الجائزة 🎁</label>
                                    <input id="gw_prize" type="text" placeholder="مثال: نيترو / رتبة VIP..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-yellow-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-400 mb-2">المدة</label>
                                    <input id="gw_duration" type="text" placeholder="مثال: 10m / 2h / 1d" value="1h" class="w-full bg-[#0b0d14] border border-white/5 focus:border-yellow-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-400 mb-2">عدد الفائزين 🏆</label>
                                    <input id="gw_winners" type="number" min="1" max="20" value="1" class="w-full bg-[#0b0d14] border border-white/5 focus:border-yellow-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">
                                </div>
                            </div>

                            <!-- الشروط المتقدمة -->
                            <div class="border-t border-white/5 pt-4">
                                <h5 class="font-bold text-gray-300 text-xs mb-3">⚙️ شروط ومميزات متقدمة (اختياري)</h5>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-400 mb-2">🛡️ رتبة إجبارية للاشتراك</label>
                                        <div class="relative">
                                            <select id="gw_required_role" class="w-full bg-[#0b0d14] border border-white/5 focus:border-yellow-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer appearance-none">
                                                <option value="">لا يوجد شرط رتبة</option>
                                                ${roleOptions}
                                            </select>
                                            <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center px-3 text-gray-400">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/></svg>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-400 mb-2">🔥 رتبة الفرصة المضاعفة (x2)</label>
                                        <div class="relative">
                                            <select id="gw_extra_role" class="w-full bg-[#0b0d14] border border-white/5 focus:border-yellow-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer appearance-none">
                                                <option value="">لا يوجد</option>
                                                ${roleOptions}
                                            </select>
                                            <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center px-3 text-gray-400">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/></svg>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-400 mb-2">⭐ أدنى مستوى مطلوب (Levels)</label>
                                        <input id="gw_min_level" type="number" min="0" value="0" placeholder="0 = لا يوجد شرط" class="w-full bg-[#0b0d14] border border-white/5 focus:border-yellow-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-400 mb-2">📅 الحد الأدنى لعمر الحساب (بالأيام)</label>
                                        <input id="gw_min_age" type="number" min="0" value="0" placeholder="0 = لا يوجد شرط" class="w-full bg-[#0b0d14] border border-white/5 focus:border-yellow-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">
                                    </div>
                                </div>
                            </div>

                            <div class="flex items-center gap-3 pt-2 flex-row-reverse">
                                <button type="button" onclick="createGiveawayFromDashboard()"
                                    class="px-8 py-3 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black text-xs font-black rounded-xl transition shadow-lg">
                                    🚀 إطلاق السحب الآن
                                </button>
                                <span id="gwStatus" class="text-xs font-bold hidden"></span>
                            </div>
                        </div>

                        <!-- السحوبات النشطة -->
                        <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-5 space-y-3">
                            <div class="flex items-center justify-between">
                                <span class="text-xs text-emerald-400 font-bold bg-emerald-950/40 px-2 py-0.5 rounded">${activeGiveaways.length} نشط</span>
                                <h4 class="font-black text-white text-base">🟢 السحوبات النشطة</h4>
                            </div>
                            <div class="space-y-3">
                                ${activeHtml}
                            </div>
                        </div>

                        <!-- السحوبات المنتهية -->
                        <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-5 space-y-3">
                            <div class="flex items-center justify-between">
                                <span class="text-xs text-gray-400 font-bold bg-gray-800/40 px-2 py-0.5 rounded">${endedGiveaways.length} منتهية</span>
                                <h4 class="font-black text-white text-base">📋 السحوبات الأخيرة</h4>
                            </div>
                            <div class="space-y-3">
                                ${endedHtml}
                            </div>
                        </div>

                    </div>

                    <script>
                    async function createGiveawayFromDashboard() {
                        const channelId = document.getElementById('gw_channel')?.value;
                        const prize = document.getElementById('gw_prize')?.value?.trim();
                        const duration = document.getElementById('gw_duration')?.value?.trim();
                        const winners = parseInt(document.getElementById('gw_winners')?.value) || 1;
                        const requiredRole = document.getElementById('gw_required_role')?.value;
                        const extraRole = document.getElementById('gw_extra_role')?.value;
                        const minLevel = parseInt(document.getElementById('gw_min_level')?.value) || 0;
                        const minAge = parseInt(document.getElementById('gw_min_age')?.value) || 0;

                        const statusEl = document.getElementById('gwStatus');

                        if (!channelId || !prize || !duration) {
                            statusEl.className = 'text-xs font-bold text-rose-400';
                            statusEl.innerText = '❌ يرجى تعبئة القناة، الجائزة، والمدة';
                            statusEl.classList.remove('hidden');
                            return;
                        }

                        statusEl.className = 'text-xs font-bold text-yellow-400';
                        statusEl.innerText = '⏳ جارٍ إطلاق السحب...';
                        statusEl.classList.remove('hidden');

                        try {
                            const res = await fetch('/api/guild/${guildId}/giveaway/create', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ channelId, prize, duration, winners, requiredRole: requiredRole || null, extraRole: extraRole || null, minLevel, minAccountAge: minAge })
                            });
                            const data = await res.json();
                            if (data.success) {
                                statusEl.className = 'text-xs font-bold text-emerald-400';
                                statusEl.innerText = '✅ تم إطلاق السحب بنجاح!';
                                setTimeout(() => location.reload(), 1500);
                            } else {
                                statusEl.className = 'text-xs font-bold text-rose-400';
                                statusEl.innerText = '❌ ' + (data.error || 'حدث خطأ');
                            }
                        } catch (e) {
                            statusEl.className = 'text-xs font-bold text-rose-400';
                            statusEl.innerText = '❌ خطأ في الاتصال: ' + e.message;
                        }
                    }

                    async function endGiveawayNow(messageId, channelId) {
                        if (!confirm('هل أنت متأكد من إنهاء هذا السحب الآن؟')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/giveaway/end', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ messageId, channelId })
                            });
                            const data = await res.json();
                            if (data.success) { alert('✅ تم إنهاء السحب واختيار الفائزين!'); location.reload(); }
                            else alert('❌ ' + (data.error || 'حدث خطأ'));
                        } catch(e) { alert('❌ خطأ: ' + e.message); }
                    }

                    async function rerollGiveaway(messageId, channelId) {
                        const count = prompt('كم فائز تريد في إعادة السحب؟', '1');
                        if (!count) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/giveaway/reroll', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ messageId, channelId, winners: parseInt(count) || 1 })
                            });
                            const data = await res.json();
                            if (data.success) { alert('✅ تم إعادة السحب! الفائزون: ' + (data.winners || []).join(', ')); }
                            else alert('❌ ' + (data.error || 'حدث خطأ'));
                        } catch(e) { alert('❌ خطأ: ' + e.message); }
                    }
                    </script>
                `;
            } else {
                formFieldsHtml = `
                    <div class="space-y-5">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">برفكس الأوامر (Prefix)</label>
                                <input type="text" name="prefix" value="${settings.prefix || '#'}" class="w-full bg-[#1c1f2e] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2 text-right">قناة السجلات (Log Channel ID)</label>
                                <input type="text" name="log_channel" value="${settings.log_channel || ''}" placeholder="ضع ID القناة..." class="w-full bg-[#1c1f2e] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
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
                    :root {
                        --bg-main: #0b0d14;
                        --bg-sidebar: #10121b;
                        --bg-card: #151722;
                        --bg-card-hover: #1c1f2e;
                        --primary: #5865f2;
                        --primary-hover: #4752c4;
                        --border: rgba(255, 255, 255, 0.05);
                        --text-muted: #a3a6aa;
                    }
                    body { background-color: var(--bg-main) !important; color: #ffffff !important; font-family: 'Cairo', sans-serif !important; }
                    /* Scrollbar */
                    ::-webkit-scrollbar { width: 8px; height: 8px; }
                    ::-webkit-scrollbar-track { background: var(--bg-main); }
                    ::-webkit-scrollbar-thumb { background: #2f3146; border-radius: 10px; }
                    ::-webkit-scrollbar-thumb:hover { background: #40445f; }
                    
                    /* Glassmorphism & Cards */
                    .probot-card {
                        background: var(--bg-card) !important;
                        border: 1px solid var(--border) !important;
                        border-radius: 16px !important;
                        transition: all 0.3s ease !important;
                        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2) !important;
                    }
                    .probot-card:hover {
                        background: var(--bg-card-hover) !important;
                        border-color: rgba(88, 101, 242, 0.4) !important;
                        transform: translateY(-3px) !important;
                        box-shadow: 0 6px 25px rgba(0, 0, 0, 0.3) !important;
                    }
                    
                    /* Toggles */
                    .toggle { position: relative; display: inline-block; width: 44px; height: 24px; }
                    .toggle input { opacity: 0; width: 0; height: 0; }
                    .slider { position: absolute; cursor: pointer; inset: 0; background: #2f3146; border-radius: 24px; transition: .3s; }
                    .slider:before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .3s; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                    input:checked + .slider { background: var(--primary); }
                    input:checked + .slider:before { transform: translateX(20px); }
                    
                    /* Buttons */
                    .btn-primary {
                        background-color: var(--primary);
                        color: white;
                        transition: all 0.2s;
                    }
                    .btn-primary:hover {
                        background-color: var(--primary-hover);
                        box-shadow: 0 4px 15px rgba(88, 101, 242, 0.4);
                    }
                </style>

            </head>
            <body class="min-h-screen flex flex-col bg-[#0b0d14] text-gray-200">
                
                <!-- Header -->
                <header class="h-16 bg-[#10121b]/95 backdrop-blur-md border-b border-white/5 px-6 flex items-center justify-between sticky top-0 z-50">
                    <div class="flex items-center gap-4">
                        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="text-xs text-gray-400 hover:text-gray-200 transition">الدعم الفني</a>
                        <span class="text-gray-700">|</span>
                        <a href="/dashboard/${guildId}" class="text-xs text-[#5865f2] hover:text-gray-200 font-bold transition">الرجوع للوحة التحكم</a>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-black text-sm text-white tracking-wide">ZENO</span>
                        <img src="/logo.png" class="w-8 h-8 rounded-xl object-cover border border-purple-500/40 shadow-lg shadow-black/40" alt="ZENO">
                    </div>
                </header>

                <div class="flex-1 flex overflow-hidden">
                    
                    <!-- Main Content Form Area -->
                    <main class="flex-1 p-8 overflow-y-auto max-w-4xl mx-auto">
                        <div class="probot-card border border-white/5 rounded-3xl p-8 shadow-2xl mb-8">
                            <div class="flex items-center justify-between pb-6 mb-6 border-b border-white/5">
                                <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', '${section}_enabled', this.checked)" checked><span class="slider"></span></label>
                                <div class="text-right">
                                    <h2 class="text-2xl font-black text-white">${title}</h2>
                                    <p class="text-gray-400 text-xs mt-1">يتم تطبيق كل التعديلات وحفظها مباشرة في سيرفر الديسكورد لحظياً بدون إعادة تشغيل.</p>
                                </div>
                            </div>

                            <form id="settingsForm" class="space-y-6">
                                ${formFieldsHtml}

                                <div class="pt-6 border-t border-white/5 flex items-center justify-between flex-row-reverse">
                                    <button type="submit" class="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-black/20 flex items-center gap-2">
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

                    <!-- Server Settings Navigation Sidebar (Novax Style) -->
                    <aside class="w-72 bg-[#090a10] border-l border-white/5 flex flex-col shrink-0 h-full select-none">
                        
                        <!-- Server Card Top -->
                        <div class="p-3">
                            <div class="bg-[#12141f] border border-white/5 rounded-2xl p-3 flex items-center justify-between shadow-lg">
                                <div class="text-gray-400 text-xs">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/></svg>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <h3 class="font-bold text-white text-xs truncate max-w-[130px]">${guild.name}</h3>
                                        <span class="text-[10px] text-gray-400">الأعضاء: ${guild.memberCount || botGuild?.memberCount || 0}</span>
                                    </div>
                                    <div class="relative">
                                        <img src="${guildIcon}" class="w-10 h-10 rounded-xl bg-[#1c1f2e] object-cover ring-2 ring-purple-600/50 shadow-md">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Categorized Scrollable Nav Menu -->
                        <div class="flex-1 overflow-y-auto px-3 py-2 space-y-4 text-xs text-right custom-scrollbar">

                            <!-- الأخيرة -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_recent')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_recent" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>الأخيرة</span><span>🕒</span></span>
                                </button>
                                <div id="grp_sub_recent" class="space-y-1">
                                    <a href="/dashboard/${guildId}/welcome" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'welcome' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الترحيب & المغادرة</span><span class="text-gray-400 group-hover:text-purple-400">👋</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/autoresponder" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'autoresponder' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الرد التلقائي</span><span class="text-gray-400 group-hover:text-purple-400">💬</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/tickets" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'tickets' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>نظام التذاكر</span><span class="text-gray-400 group-hover:text-purple-400">🎫</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- عام -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_general')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_general" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>عام</span></span>
                                </button>
                                <div id="grp_sub_general" class="space-y-1">
                                    <a href="/dashboard/${guildId}" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'overview' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>نظرة عامة</span><span class="text-gray-400 group-hover:text-purple-400">🎛️</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/appearance" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'appearance' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>مظهر البوت</span><span class="text-gray-400 group-hover:text-purple-400">🎨</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/settings" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'settings' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>الإعدادات</span><span class="text-gray-400 group-hover:text-purple-400">⚙️</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/analytics" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'analytics' || section === 'stats' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>الإحصائيات</span><span class="text-gray-400 group-hover:text-purple-400">📊</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/general" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'general' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-rose-400 bg-rose-950/60 px-1.5 py-0.2 rounded">جديد</span>
                                        <span class="flex items-center gap-2"><span>الأوامر</span><span class="text-gray-400 group-hover:text-purple-400">⌨️</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- الرسائل والإمبد -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_messages')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_messages" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>الرسائل والأمبد</span></span>
                                </button>
                                <div id="grp_sub_messages" class="space-y-1">
                                    <a href="/dashboard/${guildId}/embed" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'embed' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>رسائل الأمبد</span><span class="text-gray-400 group-hover:text-purple-400">📄</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/broadcast" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'broadcast' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-cyan-400 bg-cyan-950/60 px-1.5 py-0.2 rounded">جديد</span>
                                        <span class="flex items-center gap-2"><span>نظام الإعلانات</span><span class="text-gray-400 group-hover:text-purple-400">📢</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- الميزات الأساسية -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_core')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_core" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>الميزات الأساسية</span></span>
                                </button>
                                <div id="grp_sub_core" class="space-y-1">
                                    <a href="/dashboard/${guildId}/moderation" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'moderation' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded">تحديث</span>
                                        <span class="flex items-center gap-2"><span>الإشراف</span><span class="text-gray-400 group-hover:text-purple-400">🔨</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/levels" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'levels' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>المستويات & XP</span><span class="text-gray-400 group-hover:text-purple-400">🏆</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/welcome" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'welcome' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الترحيب & المغادرة</span><span class="text-gray-400 group-hover:text-purple-400">👋</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/autoroles" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'autoroles' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الرتب التلقائية</span><span class="text-gray-400 group-hover:text-purple-400">🎖️</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/giveaways" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'giveaways' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>قيف اواي</span><span class="text-gray-400 group-hover:text-purple-400">🎁</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/invites" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'invites' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>Invite Tracker</span><span class="text-gray-400 group-hover:text-purple-400">🔗</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- الإجراءات الآلية -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_automations')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_automations" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>الإجراءات الآلية</span></span>
                                </button>
                                <div id="grp_sub_automations" class="space-y-1">
                                    <a href="/dashboard/${guildId}/autoresponder" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'autoresponder' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الرد التلقائي</span><span class="text-gray-400 group-hover:text-purple-400">💬</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/applications" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'applications' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-rose-400 bg-rose-950/60 px-1.5 py-0.2 rounded">جديد</span>
                                        <span class="flex items-center gap-2"><span>التقديمات</span><span class="text-gray-400 group-hover:text-purple-400">📝</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- الإشراف والأمان -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_security')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_security" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>الإشراف والأمان</span></span>
                                </button>
                                <div id="grp_sub_security" class="space-y-1">
                                    <a href="/dashboard/${guildId}/automod" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'automod' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الرقابة التلقائية</span><span class="text-gray-400 group-hover:text-purple-400">🤖</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/protection" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'protection' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="flex items-center gap-1">
                                            <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                            <span class="text-amber-400 text-xs">👑</span>
                                        </span>
                                        <span class="flex items-center gap-2"><span>الحماية</span><span class="text-gray-400 group-hover:text-purple-400">🛡️</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/antiraid" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'antiraid' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>مكافحة الغزو</span><span class="text-gray-400 group-hover:text-purple-400">🚨</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/staff-activity" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'staff-activity' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>نشاط الإدارة</span><span class="text-gray-400 group-hover:text-purple-400">👮</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- إدارة السيرفر -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_management')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_management" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>إدارة السيرفر</span></span>
                                </button>
                                <div id="grp_sub_management" class="space-y-1">
                                    <a href="/dashboard/${guildId}/tempvoice" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'tempvoice' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الرومات المؤقتة</span><span class="text-gray-400 group-hover:text-purple-400">🕒</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/boost" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'boost' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>البوستات</span><span class="text-gray-400 group-hover:text-purple-400">💎</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/colors" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'colors' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الألوان</span><span class="text-gray-400 group-hover:text-purple-400">🎨</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/logs" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'logs' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded">تحديث</span>
                                        <span class="flex items-center gap-2"><span>السجلات</span><span class="text-gray-400 group-hover:text-purple-400">📜</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/tickets" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'tickets' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="flex items-center gap-1">
                                            <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                            <span class="text-amber-400 text-xs">👑</span>
                                        </span>
                                        <span class="flex items-center gap-2"><span>التذاكر</span><span class="text-gray-400 group-hover:text-purple-400">🎫</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- الترفيه والتفاعل -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_fun')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_fun" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>الترفيه والتفاعل</span></span>
                                </button>
                                <div id="grp_sub_fun" class="space-y-1">
                                    <a href="/dashboard/${guildId}/fun" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'fun' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>تسلية</span><span class="text-gray-400 group-hover:text-purple-400">🎮</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/quran" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'quran' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>القرآن & الراديو</span><span class="text-gray-400 group-hover:text-purple-400">📻</span></span>
                                    </a>
                                </div>
                            </div>

                        </div>

                        <!-- User Profile Bottom Bar -->
                        <div class="p-3 border-t border-white/5">
                            <div class="bg-gradient-to-r from-purple-700 to-indigo-700 rounded-2xl p-2.5 flex items-center justify-between shadow-lg shadow-purple-950/40">
                                <div class="text-white/80 hover:text-white cursor-pointer px-1">
                                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z"/></svg>
                                </div>
                                <div class="flex items-center gap-2.5">
                                    <div class="text-right">
                                        <span class="text-xs font-black text-white block leading-tight truncate max-w-[110px]">${user.username}</span>
                                    </div>
                                    <img src="${userAvatar}" class="w-8 h-8 rounded-xl object-cover ring-2 ring-white/20 shadow-md">
                                </div>
                            </div>
                        </div>

                    </aside>

                    <!-- Server Rail (Far Right - Novax Style) -->
                    <div class="w-18 bg-[#05060a] border-l border-white/5 py-4 px-2 flex flex-col items-center gap-3 shrink-0 overflow-y-auto select-none">
                        <!-- Home Icon Button -->
                        <a href="/dashboard" title="الصفحة الرئيسية" class="w-12 h-12 rounded-2xl bg-[#12141f] hover:bg-purple-600/30 border border-white/5 hover:border-purple-500/50 flex items-center justify-center text-gray-300 hover:text-white transition shadow-lg mb-1 group">
                            <svg class="w-6 h-6 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                        </a>
                        <div class="w-8 h-[1px] bg-white/5"></div>
                        <!-- Active Server List Icons -->
                        ${serverRailHtml}
                    </div>

                </div>

                <script>
                function toggleNavGroup(groupId) {
                    const el = document.getElementById(groupId);
                    const arrow = document.getElementById('arrow_' + groupId);
                    if (!el) return;
                    el.classList.toggle('hidden');
                    if (arrow) arrow.classList.toggle('rotate-180');
                }
                </script>

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

    // ========================================================
    // Social Notifier API Routes
    // ========================================================
    app.get('/api/guild/:guildId/social/list', (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const feeds = database.getGuildSocialFeeds(guildId);
            res.json({ success: true, feeds });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/social/add', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { platform, account, channelId, roleId, message } = req.body;
            if (!platform || !account || !channelId) {
                return res.status(400).json({ success: false, error: 'Missing required fields' });
            }
            const cleanAcc = account.replace(/^@/, '');
            const feed = database.addSocialFeed(guildId, platform, cleanAcc, channelId, roleId || null, message || null);
            res.json({ success: true, feed });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/social/delete', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { id } = req.body;
            database.deleteSocialFeed(id, guildId);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/social/toggle', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { id, enable } = req.body;
            database.toggleSocialFeed(id, enable ? 1 : 0);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/social/test', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { id } = req.body;
            const feed = database.getSocialFeed(id);
            if (!feed || feed.guild_id !== guildId) {
                return res.status(404).json({ success: false, error: 'Feed not found' });
            }
            const { testFeed } = require('../utils/socialNotifier');
            const result = await testFeed(client, feed);
            if (result.success) {
                res.json({ success: true });
            } else {
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });


    // Social Notifier Dashboard Page
    app.get('/dashboard/:guildId/social', async (req, res) => {
        if (!req.session?.user) return res.redirect('/auth/discord');
        const { guildId } = req.params;
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.redirect('/dashboard');
        const feeds = database.getGuildSocialFeeds(guildId) || [];
        const channels = guild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }));
        const roles = guild.roles.cache.filter(r => r.id !== guild.id).map(r => ({ id: r.id, name: r.name }));
        const platformIcon = { youtube: '📺', twitch: '🔴', tiktok: '🎵' };
        const feedsHTML = feeds.length === 0
            ? `<div class="text-center py-16 text-gray-500"><div class="text-5xl mb-3">📭</div><p>لا توجد حسابات مضافة بعد</p></div>`
            : feeds.map(f => `
                <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-5 flex items-center justify-between gap-4">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">${platformIcon[f.platform] || '🔔'}</span>
                        <div>
                            <div class="font-bold text-white">@${f.account_id}</div>
                            <div class="text-xs text-gray-400 capitalize">${f.platform} • <#${f.channel_id}></div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="toggleFeed(${f.id}, ${f.enabled ? 0 : 1})" class="px-3 py-1.5 rounded-lg text-xs font-bold ${f.enabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}">${f.enabled ? '✅ مفعل' : '⏸ موقوف'}</button>
                        <button onclick="testFeed(${f.id})" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-500/20 text-blue-400">🧪 اختبار</button>
                        <button onclick="deleteFeed(${f.id})" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/20 text-red-400">🗑️ حذف</button>
                    </div>
                </div>`).join('');
        const channelOptions = channels.map(c => `<option value="${c.id}">#${c.name}</option>`).join('');
        const roleOptions = `<option value="">-- بدون منشن --</option>` + roles.map(r => `<option value="${r.id}">@${r.name}</option>`).join('');
        res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl" class="dark">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>تنبيهات السوشيال ميديا - ZENO</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">

                <style>
                    :root {
                        --bg-main: #0b0d14;
                        --bg-sidebar: #10121b;
                        --bg-card: #151722;
                        --bg-card-hover: #1c1f2e;
                        --primary: #5865f2;
                        --primary-hover: #4752c4;
                        --border: rgba(255, 255, 255, 0.05);
                        --text-muted: #a3a6aa;
                    }
                    body { background-color: var(--bg-main) !important; color: #ffffff !important; font-family: 'Cairo', sans-serif !important; }
                    /* Scrollbar */
                    ::-webkit-scrollbar { width: 8px; height: 8px; }
                    ::-webkit-scrollbar-track { background: var(--bg-main); }
                    ::-webkit-scrollbar-thumb { background: #2f3146; border-radius: 10px; }
                    ::-webkit-scrollbar-thumb:hover { background: #40445f; }
                    
                    /* Glassmorphism & Cards */
                    .probot-card {
                        background: var(--bg-card) !important;
                        border: 1px solid var(--border) !important;
                        border-radius: 16px !important;
                        transition: all 0.3s ease !important;
                        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2) !important;
                    }
                    .probot-card:hover {
                        background: var(--bg-card-hover) !important;
                        border-color: rgba(88, 101, 242, 0.4) !important;
                        transform: translateY(-3px) !important;
                        box-shadow: 0 6px 25px rgba(0, 0, 0, 0.3) !important;
                    }
                    
                    /* Toggles */
                    .toggle { position: relative; display: inline-block; width: 44px; height: 24px; }
                    .toggle input { opacity: 0; width: 0; height: 0; }
                    .slider { position: absolute; cursor: pointer; inset: 0; background: #2f3146; border-radius: 24px; transition: .3s; }
                    .slider:before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .3s; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                    input:checked + .slider { background: var(--primary); }
                    input:checked + .slider:before { transform: translateX(20px); }
                    
                    /* Buttons */
                    .btn-primary {
                        background-color: var(--primary);
                        color: white;
                        transition: all 0.2s;
                    }
                    .btn-primary:hover {
                        background-color: var(--primary-hover);
                        box-shadow: 0 4px 15px rgba(88, 101, 242, 0.4);
                    }
                </style>

</head>
<body class="min-h-screen bg-[#0b0d14]">
<div class="max-w-4xl mx-auto px-4 py-10">
    <a href="/dashboard/${guildId}" class="text-[#5865f2] text-sm mb-6 inline-block">← العودة للداشبورد</a>
    <h1 class="text-3xl font-black mb-2">📡 تنبيهات السوشيال ميديا</h1>
    <p class="text-gray-400 mb-8">أضف حسابات YouTube / Twitch / TikTok وسيرسل البوت تنبيه تلقائي عند نزول محتوى جديد</p>

    <!-- Add Form -->
    <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-6 mb-8">
        <h2 class="text-lg font-bold mb-4">➕ إضافة حساب جديد</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="text-xs text-gray-400 mb-1 block">المنصة</label>
                <select id="platform" class="w-full bg-[#0b0d14] border border-purple-900/40 rounded-xl px-4 py-2.5 text-sm">
                    <option value="youtube">📺 YouTube</option>
                    <option value="twitch">🔴 Twitch</option>
                    <option value="tiktok">🎵 TikTok</option>
                </select>
            </div>
            <div>
                <label class="text-xs text-gray-400 mb-1 block">اسم الحساب أو الـ ID</label>
                <input id="account" type="text" placeholder="مثال: @MrBeast أو UCX6OQ3DkcsbYNE6H8uQQuVA" class="w-full bg-[#0b0d14] border border-purple-900/40 rounded-xl px-4 py-2.5 text-sm">
            </div>
            <div>
                <label class="text-xs text-gray-400 mb-1 block">روم الإشعارات</label>
                <select id="channelId" class="w-full bg-[#0b0d14] border border-purple-900/40 rounded-xl px-4 py-2.5 text-sm">${channelOptions}</select>
            </div>
            <div>
                <label class="text-xs text-gray-400 mb-1 block">منشن رول (اختياري)</label>
                <select id="roleId" class="w-full bg-[#0b0d14] border border-purple-900/40 rounded-xl px-4 py-2.5 text-sm">${roleOptions}</select>
            </div>
            <div class="md:col-span-2">
                <label class="text-xs text-gray-400 mb-1 block">رسالة مخصصة (اختياري)</label>
                <input id="message" type="text" placeholder="مثال: 🔥 محتوى جديد نزل! اذهب شوف!" class="w-full bg-[#0b0d14] border border-purple-900/40 rounded-xl px-4 py-2.5 text-sm">
            </div>
        </div>
        <button onclick="addFeed()" class="mt-4 px-6 py-2.5 bg-gradient-to-r from-[#5865f2] to-indigo-600 hover:from-[#4752c4] hover:to-indigo-500 text-white font-bold rounded-xl transition text-sm">إضافة ✅</button>
    </div>

    <!-- Feeds List -->
    <div id="feedsList" class="space-y-3">${feedsHTML}</div>
</div>
<script>
const guildId = '${guildId}';
async function addFeed() {
    const platform = document.getElementById('platform').value;
    const account = document.getElementById('account').value.trim();
    const channelId = document.getElementById('channelId').value;
    const roleId = document.getElementById('roleId').value;
    const message = document.getElementById('message').value.trim();
    if (!account) return alert('أدخل اسم الحساب!');
    const r = await fetch('/api/guild/' + guildId + '/social/add', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ platform, account, channelId, roleId, message })
    });
    const d = await r.json();
    if (d.success) { alert('✅ تمت الإضافة بنجاح!'); location.reload(); }
    else alert('❌ خطأ: ' + d.error);
}
async function deleteFeed(id) {
    if (!confirm('هل أنت متأكد من الحذف؟')) return;
    const r = await fetch('/api/guild/' + guildId + '/social/delete', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ id })
    });
    const d = await r.json();
    if (d.success) location.reload();
    else alert('❌ خطأ: ' + d.error);
}
async function toggleFeed(id, enable) {
    const r = await fetch('/api/guild/' + guildId + '/social/toggle', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ id, enable })
    });
    const d = await r.json();
    if (d.success) location.reload();
    else alert('❌ خطأ: ' + d.error);
}
async function testFeed(id) {
    const r = await fetch('/api/guild/' + guildId + '/social/test', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ id })
    });
    const d = await r.json();
    alert(d.success ? '✅ تم إرسال رسالة اختبار!' : '❌ خطأ: ' + d.error);
}
</script>
</body>
</html>`);
    });

    // ─── 👮 Staff Activity Reset API ───
    app.post('/api/guild/:guildId/staff/reset', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { userId } = req.body;
            if (database.resetStaffStats) {
                database.resetStaffStats(guildId, userId || null);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

};