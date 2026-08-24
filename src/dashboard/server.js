/**
 * @module server
 * @description Handles the web server setup for the zeno dashboard, managing sessions and routing.
 */

const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const database = require('../database');
const rawDb = database.db;
const SecretManager = require('../utils/secretManager');

module.exports = function (app, client) {
    const sessionStore = new SqliteStore({ client: rawDb });
    let sessionSecret = '';
    try {
        const secrets = SecretManager.getMultipleSecrets(['SESSION_SECRET']);
        sessionSecret = secrets['SESSION_SECRET'] || 'ZENO_DEFAULT_SUPER_SAFE_FALLBACK';
        console.log('[SECURITY] ✅ Dashboard: Session secret retrieved successfully.');
    } catch (e) {
        sessionSecret = 'ZENO_TICKETS_SUPER_SECRET';
    }

    app.use(express.static('public'));
    app.use(session({
        store: sessionStore,
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 7 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            secure: false
        }
    }));

    // 1. الصفحة الرئيسية
    app.get('/', (req, res) => {
        res.redirect('/dashboard');
    });

    // 2. OAuth2
    app.get('/auth/discord', (req, res) => {
        const clientId = SecretManager.getSecret('DISCORD_CLIENT_ID') || process.env.DISCORD_CLIENT_ID;
        const redirectUri = encodeURIComponent(SecretManager.getSecret('DISCORD_REDIRECT_URI') || process.env.DISCORD_REDIRECT_URI || 'https://zeno-production-56c5.up.railway.app/auth/discord/callback');
        const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20guilds`;
        res.redirect(authUrl);
    });

    app.get('/auth/discord/callback', async (req, res) => {
        const code = req.query.code;
        if (!code) return res.redirect('/');

        try {
            const clientId = SecretManager.getSecret('DISCORD_CLIENT_ID') || process.env.DISCORD_CLIENT_ID;
            const clientSecret = SecretManager.getSecret('DISCORD_CLIENT_SECRET') || process.env.DISCORD_CLIENT_SECRET;
            const redirectUri = SecretManager.getSecret('DISCORD_REDIRECT_URI') || process.env.DISCORD_REDIRECT_URI || 'https://zeno-production-56c5.up.railway.app/auth/discord/callback';

            const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: redirectUri
                })
            });

            const tokenData = await tokenRes.json();
            if (!tokenData.access_token) return res.redirect('/');

            const userRes = await fetch('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` }
            });
            const userData = await userRes.json();

            const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` }
            });
            const allGuilds = await guildsRes.json();

            req.session.user = userData;
            req.session.guilds = Array.isArray(allGuilds) ? allGuilds.filter(g => (g.permissions & 0x8) === 0x8 || (g.permissions & 0x20) === 0x20) : [];

            req.session.save(() => res.redirect('/dashboard'));
        } catch (error) {
            console.error('OAuth error:', error);
            res.redirect('/');
        }
    });

    app.get('/logout', (req, res) => {
        req.session.destroy(() => res.redirect('/'));
    });

    // 3. User Dashboard
    app.get('/dashboard', (req, res) => {
        try {
            if (!req.session?.user) return res.redirect('/auth/discord');
            const user = req.session.user;
            const guilds = req.session.guilds || [];
            const userAvatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

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

            const now = Date.now();
            const canClaimDaily = (now - userLastDaily) >= 24 * 60 * 60 * 1000;
            const nextDailyIn = Math.max(0, 24 * 60 * 60 * 1000 - (now - userLastDaily));
            const nextDailyHours = Math.floor(nextDailyIn / (1000 * 60 * 60));
            const nextDailyMinutes = Math.floor((nextDailyIn % (1000 * 60 * 60)) / (1000 * 60));

            const xpNeeded = userLevel * 100;
            const xpProgress = Math.min(100, Math.floor((userXp % 100) / 100 * 100));

            const serverRailHtml = guilds.map(g => `
                <a href="/dashboard/${g.id}" title="${g.name}" class="group relative flex items-center justify-center">
                    <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                         class="w-11 h-11 rounded-2xl border border-transparent hover:border-purple-500/40 hover:rounded-xl object-cover transition-all shadow-md">
                </a>
            `).join('');

            const userDashboardGuildsHtml = guilds.map(g => `
                <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl flex items-center justify-between hover:border-yellow-500/30 transition group">
                    <a href="/dashboard/${g.id}" class="px-5 py-2.5 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black font-black text-xs rounded-xl transition shadow-lg shadow-yellow-950/40 flex items-center gap-2">
                        <span>⚙️ إدارة السيرفر</span>
                    </a>
                    <div class="flex items-center gap-3">
                        <div class="text-right">
                            <h4 class="font-bold text-white text-sm group-hover:text-yellow-400 transition truncate max-w-[160px]">${g.name}</h4>
                            <span class="text-[10px] text-gray-500 font-mono">${g.id}</span>
                        </div>
                        <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-12 h-12 rounded-2xl bg-[#0b0d14] object-cover ring-2 ring-white/5">
                    </div>
                </div>
            `).join('');

            const xpLeaderboardHtml = xpLeaderboard.slice(0, 100).map((r, i) => `
                <div class="bg-[#1c1f2e] border border-white/5 p-3 rounded-2xl flex items-center justify-between">
                    <span class="text-xs font-mono font-bold text-purple-400">⚡ ${Number(r.total_xp || 0).toLocaleString()} XP</span>
                    <div class="flex items-center gap-3">
                        <span class="text-xs text-white font-bold">${r.user_id}</span>
                        <span class="w-6 h-6 rounded-full bg-purple-950/60 text-purple-300 text-[10px] font-black flex items-center justify-center">#${i + 1}</span>
                    </div>
                </div>
            `).join('') || '<p class="text-xs text-gray-500 text-center py-4">لا توجد بيانات خبرة مسجلة بعد</p>';

            const coinsLeaderboardHtml = coinsLeaderboard.slice(0, 100).map((r, i) => `
                <div class="bg-[#1c1f2e] border border-white/5 p-3 rounded-2xl flex items-center justify-between">
                    <span class="text-xs font-mono font-bold text-amber-400">🪙 ${Number(r.total_coins || 0).toLocaleString()}</span>
                    <div class="flex items-center gap-3">
                        <span class="text-xs text-white font-bold">${r.user_id}</span>
                        <span class="w-6 h-6 rounded-full bg-amber-950/60 text-amber-300 text-[10px] font-black flex items-center justify-center">#${i + 1}</span>
                    </div>
                </div>
            `).join('') || '<p class="text-xs text-gray-500 text-center py-4">لا توجد بيانات ذهب مسجلة بعد</p>';

            const dailyActionBoxHtml = canClaimDaily ? `
                <button type="button" onclick="claimDailyReward()" id="claimDailyBtn" class="px-5 py-2 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black font-black text-xs rounded-xl shadow-lg shadow-yellow-950/40 transition">
                    استلام الرصيد 🎁
                </button>
            ` : `
                <span class="text-[10px] text-gray-400 font-bold bg-[#0b0d14] border border-white/5 px-3 py-1.5 rounded-xl font-mono">
                    ⏳ متاح بعد: ${nextDailyHours}س ${nextDailyMinutes}د
                </span>
            `;

            res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>لوحة التحكم | ZENO BOT</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                
                <style>
                    :root {
                        --bg-main: #0b0d14;
                        --bg-sidebar: #10121b;
                        --bg-card: #151722;
                        --bg-card-hover: #1c1f2e;
                        --primary: #9333ea;
                        --border: rgba(255, 255, 255, 0.05);
                    }
                    body { background-color: var(--bg-main) !important; color: #ffffff !important; font-family: 'Cairo', sans-serif !important; }
                    ::-webkit-scrollbar { width: 6px; height: 6px; }
                    ::-webkit-scrollbar-track { background: #0b0d14; }
                    ::-webkit-scrollbar-thumb { background: #2f3146; border-radius: 10px; }
                </style>
            </head>
            <body class="min-h-screen flex flex-col bg-[#0b0d14] text-gray-200">
                <header class="h-16 bg-[#10121b]/95 backdrop-blur-md border-b border-white/5 px-6 flex items-center justify-between sticky top-0 z-40">
                    <div class="flex items-center gap-4">
                        <a href="/logout" class="text-xs text-rose-400 hover:text-rose-300 font-bold transition">تسجيل الخروج</a>
                        <span class="text-gray-700">|</span>
                        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="text-xs text-gray-400 hover:text-gray-200 transition">الدعم الفني</a>
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="text-right">
                            <span class="text-xs font-bold text-white block">${user.username}</span>
                            <span class="text-[10px] text-yellow-400 font-mono">🪙 ${userCoins.toLocaleString()} Gold</span>
                        </div>
                        <img src="${userAvatar}" class="w-9 h-9 rounded-xl object-cover ring-2 ring-yellow-500/40">
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
                                
                                <!-- 1. الذهب (Golds / Gold) -->
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
                                    ${userDashboardGuildsHtml}
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
                                    ${dailyActionBoxHtml}
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
            </body>
            </html>
            `);
        } catch (e) {
            console.error("Dashboard render error:", e);
            res.status(500).send("Internal error: " + e.message);
        }
    });

    // 4. Guild Dashboard & Sub-pages
    app.get('/dashboard/:guildId/:section?', (req, res) => {
        try {
            if (!req.session?.user) return res.redirect('/auth/discord');
            const guildId = req.params.guildId;
            const section = req.params.section || 'overview';
            const guilds = req.session.guilds || [];
            const user = req.session.user;

            let guild = guilds.find(g => g.id === guildId);
            if (!guild && client?.guilds?.cache) {
                const botGuild = client.guilds.cache.get(guildId);
                if (botGuild) {
                    guild = { id: botGuild.id, name: botGuild.name, icon: botGuild.icon };
                }
            }
            if (!guild) guild = { id: guildId, name: 'Discord Server', icon: null };

            let settings = {};
            try {
                settings = database.getGuildSettings ? database.getGuildSettings(guildId) : {};
            } catch (err) {}
            if (!settings) settings = {};

            let whitelistUsers = [];
            let antimodUsers = [];
            let securityLogsList = [];
            let warnPunishmentsList = [];
            let autoRespondersList = [];
            let guildTicketsList = [];
            let guildGiveawaysList = [];
            let guildSuggestionsList = [];
            try {
                if (database.getGuildSuggestions) {
                    guildSuggestionsList = database.getGuildSuggestions(guildId, req.query?.status || null) || [];
                }
            } catch(e) {}
            try {
                if (database.getGuildGiveaways) {
                    guildGiveawaysList = database.getGuildGiveaways(guildId) || [];
                }
            } catch(e) {}
            let levelRewardsList = [];
            let guildLeaderboardUsers = [];
            const currentTab = req.query?.tab || 'settings';
            try {
                if (database.getLeaderboard) {
                    guildLeaderboardUsers = database.getLeaderboard(guildId, 20) || [];
                }
            } catch(e) {}
            try {
                if (database.getLevelRewards) {
                    levelRewardsList = database.getLevelRewards(guildId) || [];
                }
            } catch (err) {}
            try {
                if (database.getAutoResponders) {
                    autoRespondersList = database.getAutoResponders(guildId) || [];
                }
            } catch (err) {}
            try {
                if (database.getWarnPunishments) {
                    warnPunishmentsList = database.getWarnPunishments(guildId) || [];
                }
            } catch (err) {}
            try {
                if (database.getProtectionWhitelist) {
                    whitelistUsers = database.getProtectionWhitelist(guildId, 'whitelist') || [];
                    antimodUsers = database.getProtectionWhitelist(guildId, 'antimod') || [];
                }
                if (database.getSecurityLogs) {
                    securityLogsList = database.getSecurityLogs(guildId, null, 50) || [];
                }
            } catch (err) {}

            const botGuild = client?.guilds?.cache?.get(guildId);
            const userAvatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
            const guildIcon = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

            const serverRailHtml = guilds.map(g => `
                <a href="/dashboard/${g.id}" title="${g.name}" class="group relative flex items-center justify-center">
                    <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                         class="w-11 h-11 rounded-2xl ${g.id === guildId ? 'border-2 border-purple-500 shadow-lg shadow-purple-900/50 p-0.5 ring-2 ring-purple-600/30' : 'border border-transparent hover:border-purple-500/40'} hover:rounded-xl object-cover transition-all shadow-md">
                </a>
            `).join('');

            const sectionTitles = {
                'overview': 'نظرة عامة على السيرفر 📊',
                'analytics': 'الإحصائيات والتحليلات 📊',
                'stats': 'الإحصائيات والتحليلات 📊',
                'appearance': 'مظهر وتخصيص البوت 🎨',
                'settings': 'إعدادات السيرفر العامة ⚙️',
                'general': 'جميع الأوامر والخدمات ⌨️',
                'commands': 'مركز إدارة الأوامر الشامل ⌨️',
                'moderation': 'الإشراف وإدارة الأعضاء 🔨',
                'automod': 'الرقابة التلقائية وفلاتر السب والشات 🤖',
                'welcome': 'رسائل وبطاقات الترحيب والمغادرة 👋',
                'autoresponder': 'الرد التلقائي على الكلمات 💬',
                'tickets': 'نظام التذاكر والدعم الفني 🎫',
                'protection': 'جدار الحماية الشامل ومكافحة التخريب 🛡️',
                'whitelist': 'الحماية / القائمة البيضاء ⚪',
                'protection-logs': 'الحماية / السجلات 📋',
                'antiraid': 'نظام مكافحة الغزو والأعضاء الوهميين 🚨',
                'staff-activity': 'تتبع نشاط الإدارة والمشرفين 👮',
                'tempvoice': 'نظام الرومات الصوتية المؤقتة 🕒',
                'boost': 'نظام تنبيهات ومعلومات البوست 💎',
                'colors': 'نظام رتب الألوان المتقدم 🎨',
                'logs': 'سجلات السيرفر الشاملة 📜',
                'levels': 'نظام المستويات والخبرة XP 🏆',
                'autoroles': 'الرتب التلقائية عند الانضمام 🎖️',
                'giveaways': 'نظام مسابقات القيف اواي 🎁',
                'suggestions': 'نظام الاقتراحات والشكاوي 💡',
                'invites': 'متتبع الدعوات المتقدم (Invite Tracker) 🔗',
                'broadcast': 'نظام الإعلانات والمذيع الآلي 📢',
                'embed': 'صانع رسائل الإيمبد المتقدم 📄'
            };

            const title = sectionTitles[section] || 'لوحة الإعدادات ⚙️';

            const guildTextChannels = botGuild ? Array.from(botGuild.channels.cache.values()).filter(c => c.type === 0 || c.type === 5) : [];
            const guildVoiceChannels = botGuild ? Array.from(botGuild.channels.cache.values()).filter(c => c.type === 2) : [];
            const guildRoles = botGuild ? Array.from(botGuild.roles.cache.values()).filter(r => r.name !== '@everyone') : [];

            function renderChannelSelect(inputName, selectedId, isMulti = false) {
                return `
                    <select name="${inputName}" id="${inputName}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer">
                        <option value="">...اختر القناة</option>
                        ${guildTextChannels.map(c => `<option value="${c.id}" ${String(selectedId).includes(String(c.id)) ? 'selected' : ''}># ${c.name}</option>`).join('')}
                    </select>
                `;
            }

            function renderRoleSelect(inputName, selectedId) {
                return `
                    <select name="${inputName}" id="${inputName}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer">
                        <option value="">...اختر الرتبة</option>
                        ${guildRoles.map(r => `<option value="${r.id}" ${String(selectedId) === String(r.id) ? 'selected' : ''}>@ ${r.name}</option>`).join('')}
                    </select>
                `;
            }

            let formFieldsHtml = '';

            if (section === 'general' || section === 'commands') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Master Header Card (Exact to Image 1: إدارة الأوامر & Triple Badges) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <div class="flex items-center gap-6">
                                <div class="text-center">
                                    <span class="text-xl font-black text-purple-400 font-mono">0</span>
                                    <span class="text-[10px] text-gray-400 block font-bold">اختصارات مخصصة</span>
                                </div>
                                <div class="text-center">
                                    <span class="text-xl font-black text-emerald-400 font-mono">185</span>
                                    <span class="text-[10px] text-gray-400 block font-bold">الأوامر المفعلة</span>
                                </div>
                                <div class="text-center">
                                    <span class="text-xl font-black text-white font-mono">185</span>
                                    <span class="text-[10px] text-gray-400 block font-bold">إجمالي الأوامر</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">إدارة الأوامر</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">تخصيص وإدارة جميع أوامر البوت والصلاحيات</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-lg border border-indigo-500/30">
                                    🎛️
                                </div>
                            </div>
                        </div>

                        <!-- 2. Search & Filter Bar (Exact to Image 1) -->
                        <div class="flex items-center justify-between gap-4">
                            <div class="flex items-center gap-1.5 bg-[#12141f] border border-white/5 p-1 rounded-xl">
                                <button type="button" onclick="filterCmdStatus('disabled')" id="btnFilterDisabled" class="px-3 py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition">معطل</button>
                                <button type="button" onclick="filterCmdStatus('enabled')" id="btnFilterEnabled" class="px-3 py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition">مفعل</button>
                                <button type="button" onclick="filterCmdStatus('all')" id="btnFilterAll" class="px-3 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white transition shadow">الكل</button>
                            </div>

                            <div class="flex-1 relative">
                                <input type="text" id="cmdSearchInput" oninput="searchCommands()" placeholder="...ابحث عن أمر" class="w-full bg-[#12141f] border border-white/5 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right pr-10">
                                <span class="absolute right-3 top-2.5 text-gray-400">🔍</span>
                            </div>
                        </div>

                        <!-- 3. Layout: Left Commands List + Right Categories Sidebar (Exact to Images 1, 2, 3, 4) -->
                        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">

                            <!-- العمود الأيمن: قائمة الأقسام (Categories Sidebar) -->
                            <div class="lg:col-span-1 space-y-1.5 bg-[#12141f] border border-white/5 p-3 rounded-2xl shadow-xl h-fit">
                                <div class="flex items-center justify-end gap-1.5 text-xs font-black text-white px-2 py-1.5 border-b border-white/5 mb-1">
                                    <span>الأقسام</span>
                                    <span>📁</span>
                                </div>

                                <button type="button" onclick="switchCmdCategory('basic')" id="btnCatBasic" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition">
                                    <span class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">17/17</span>
                                    <span class="flex items-center gap-1.5"><span>الأوامر الأساسية</span><span>⚙️</span></span>
                                </button>

                                <button type="button" onclick="switchCmdCategory('punishments')" id="btnCatPunishments" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-lg transition">
                                    <span class="px-2 py-0.5 bg-white/20 text-white rounded-lg text-[10px] font-mono">22/22</span>
                                    <span class="flex items-center gap-1.5"><span>العقوبات</span><span>🔨</span></span>
                                </button>

                                <button type="button" onclick="switchCmdCategory('punishment_logs')" id="btnCatPunishmentLogs" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition">
                                    <span class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">17/17</span>
                                    <span class="flex items-center gap-1.5"><span>سجلات العقوبات</span><span>📜</span></span>
                                </button>

                                <button type="button" onclick="switchCmdCategory('channels')" id="btnCatChannels" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition">
                                    <span class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">9/9</span>
                                    <span class="flex items-center gap-1.5"><span>إدارة القنوات</span><span>📌</span></span>
                                </button>

                                <button type="button" onclick="switchCmdCategory('chat')" id="btnCatChat" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition">
                                    <span class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">12/12</span>
                                    <span class="flex items-center gap-1.5"><span>أدوات الشات</span><span>💬</span></span>
                                </button>

                                <button type="button" onclick="switchCmdCategory('voice')" id="btnCatVoice" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition">
                                    <span class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">19/19</span>
                                    <span class="flex items-center gap-1.5"><span>إدارة الصوت</span><span>🎙️</span></span>
                                </button>

                                <button type="button" onclick="switchCmdCategory('roles')" id="btnCatRoles" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition">
                                    <span class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">10/10</span>
                                    <span class="flex items-center gap-1.5"><span>إدارة الرتب</span><span>🎖️</span></span>
                                </button>

                                <button type="button" onclick="switchCmdCategory('custom_roles')" id="btnCatCustomRoles" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition">
                                    <span class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">9/9</span>
                                    <span class="flex items-center gap-1.5"><span>الرتب الخاصة</span><span>👑</span></span>
                                </button>

                                <button type="button" onclick="switchCmdCategory('server_info')" id="btnCatServerInfo" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition">
                                    <span class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">19/19</span>
                                    <span class="flex items-center gap-1.5"><span>معلومات السيرفر</span><span>📊</span></span>
                                </button>

                                <button type="button" onclick="switchCmdCategory('custom_bot')" id="btnCatCustomBot" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition">
                                    <span class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">5/5</span>
                                    <span class="flex items-center gap-1.5"><span>أدوات البوت الخاص</span><span>🤖</span></span>
                                </button>

                                <button type="button" onclick="switchCmdCategory('security')" id="btnCatSecurity" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition">
                                    <span class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">15/15</span>
                                    <span class="flex items-center gap-1.5"><span>الحماية</span><span>🛡️</span></span>
                                </button>

                                <button type="button" onclick="switchCmdCategory('levels_cat')" id="btnCatLevels" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition">
                                    <span class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">10/10</span>
                                    <span class="flex items-center gap-1.5"><span>المستويات والخبرة</span><span>⭐</span></span>
                                </button>

                                <button type="button" onclick="switchCmdCategory('server_stats')" id="btnCatServerStats" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition">
                                    <span class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">11/11</span>
                                    <span class="flex items-center gap-1.5"><span>إحصائيات السيرفر</span><span>📈</span></span>
                                </button>

                                <button type="button" onclick="switchCmdCategory('profile_cat')" id="btnCatProfile" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition">
                                    <span class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">10/10</span>
                                    <span class="flex items-center gap-1.5"><span>الملف الشخصي</span><span>👤</span></span>
                                </button>
                            </div>

                            <!-- العمود الأيسر: قائمة الأوامر المعروضة (Commands Container) -->
                            <div class="lg:col-span-3 space-y-4">

                                <!-- رأس القسم النشط والأزرار السريعة (تفعيل الكل / تعطيل الكل) -->
                                <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl flex items-center justify-between shadow-xl">
                                    <div class="flex items-center gap-2">
                                        <button type="button" onclick="toggleAllCategoryCmds(false)" class="px-3.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 rounded-xl text-xs font-bold transition flex items-center gap-1">
                                            <span>✕</span>
                                            <span>تعطيل الكل</span>
                                        </button>
                                        <button type="button" onclick="toggleAllCategoryCmds(true)" class="px-3.5 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/40 rounded-xl text-xs font-bold transition flex items-center gap-1">
                                            <span>✓</span>
                                            <span>تفعيل الكل</span>
                                        </button>
                                    </div>
                                    <div class="text-right flex items-center gap-2">
                                        <div>
                                            <h4 id="catTitle" class="text-sm font-black text-white">العقوبات</h4>
                                            <p id="catDesc" class="text-[10px] text-gray-400">أوامر تنفيذ العقوبات المباشرة على الأعضاء</p>
                                        </div>
                                        <span id="catIcon" class="text-xl">🔨</span>
                                    </div>
                                </div>

                                <!-- بطاقات الأوامر التفاعلية (Exact to Images 1, 2, 3, 4) -->
                                <div id="cmdsListContainer" class="space-y-3">
                                    <!-- يتم تعبئة الأوامر تفاعلياً بواسطة JavaScript بحسب القسم والبحث -->
                                </div>

                            </div>

                        </div>

                    </div>

                    <script>
                    const commandsDatabase = {
                        punishments: {
                            title: 'العقوبات',
                            desc: 'أوامر تنفيذ العقوبات المباشرة على الأعضاء',
                            icon: '🔨',
                            items: [
                                { name: '/ban', desc: 'حظر عضو', badge: 'صلاحيات ديسكورد', icon: '🪓' },
                                { name: '/unban', desc: 'فك حظر عضو', badge: 'صلاحيات ديسكورد', icon: '🛡️' },
                                { name: '/kick', desc: 'طرد عضو', badge: 'صلاحيات ديسكورد', icon: '🪓' },
                                { name: '/mute', desc: 'كتم عضو', badge: 'صلاحيات ديسكورد', icon: '🚨' },
                                { name: '/unmute', desc: 'فك كتم عضو', badge: 'صلاحيات ديسكورد', icon: '📢' },
                                { name: '/timeout', desc: 'عزل عضو', badge: 'صلاحيات ديسكورد', icon: '⏳' },
                                { name: '/untimeout', desc: 'فك عزل عضو', badge: 'صلاحيات ديسكورد', icon: '🛡️' },
                                { name: '/warn', desc: 'تحذير عضو', badge: 'صلاحيات ديسكورد', icon: '🚨' },
                                { name: '/delwarn', desc: 'حذف تحذير', badge: 'صلاحيات ديسكورد', icon: '🗑️' },
                                { name: '/clearwarns', desc: 'مسح جميع التحذيرات', badge: 'صلاحيات ديسكورد', icon: '🗑️' },
                                { name: '/clearallwarns', desc: 'مسح جميع التحذيرات لعضو', badge: 'صلاحيات ديسكورد', icon: '🗑️' },
                                { name: '/clearallpunishments', desc: 'حذف نهائي لكل سجلات العقوبات بالسيرفر — لا يمكن التراجع', badge: '', icon: '🗑️' },
                                { name: '/prison', desc: 'سجن عضو', badge: 'صلاحيات ديسكورد', icon: '🪓' },
                                { name: '/unprison', desc: 'إخراج من السجن', badge: 'صلاحيات ديسكورد', icon: '🛡️' },
                                { name: '/setnick', desc: 'تغيير الاسم المستعار', badge: 'صلاحيات ديسكورد', icon: '✏️' },
                                { name: '/blacklist', desc: 'بلاك لست عضو (دائم)', badge: 'صلاحيات ديسكورد', icon: '🪓' },
                                { name: '/unblacklist', desc: 'فك بلاك لست عضو', badge: 'صلاحيات ديسكورد', icon: '🛡️' },
                                { name: '/remove', desc: 'حذف عقوبة من عضو', badge: 'صلاحيات ديسكورد', icon: '🗑️' },
                                { name: '/down', desc: 'إزالة الرتب الإدارية لمدة محددة', badge: 'صلاحيات ديسكورد', icon: '🪓' },
                                { name: '/undown', desc: 'استعادة الرتب الإدارية المزالة', badge: '', icon: '🛡️' },
                                { name: '/block', desc: 'حظر عضو من رتبة', badge: 'صلاحيات ديسكورد', icon: '🛡️' },
                                { name: '/unblock', desc: 'فك حظر عضو من رتبة', badge: 'صلاحيات ديسكورد', icon: '🛡️' }
                            ]
                        },
                        punishment_logs: {
                            title: 'سجلات العقوبات',
                            desc: 'استعلام وعرض سجلات العقوبات السابقة',
                            icon: '📜',
                            items: [
                                { name: '/allwarns', desc: 'عرض كل التحذيرات النشطة بالسيرفر', badge: '', icon: '📋' },
                                { name: '/bans', desc: 'سجل باندات عضو', badge: '', icon: '📜' },
                                { name: '/blacklists', desc: 'سجل بلاك لست عضو', badge: '', icon: '📜' },
                                { name: '/blocks', desc: 'سجل بلوكات عضو', badge: '', icon: '📜' },
                                { name: '/case', desc: 'عرض تفاصيل عقوبة', badge: 'صلاحيات ديسكورد', icon: '📄' },
                                { name: '/crime', desc: 'سجل عقوبات العضو الكامل', badge: '', icon: '📜' },
                                { name: '/crimes', desc: 'عقوبات العضو النشطة حالياً', badge: '', icon: '📜' },
                                { name: '/downs', desc: 'سجل داونات عضو', badge: '', icon: '📜' },
                                { name: '/modlogs', desc: 'سجل إشراف المشرفين', badge: 'صلاحيات ديسكورد', icon: '📜' },
                                { name: '/kicks', desc: 'سجل طرد عضو', badge: '', icon: '📜' },
                                { name: '/mutes', desc: 'سجل كتم عضو', badge: '', icon: '📜' },
                                { name: '/prisons', desc: 'سجل سجن عضو', badge: '', icon: '📜' },
                                { name: '/timeouts', desc: 'سجل عزل عضو', badge: '', icon: '📜' },
                                { name: '/warns', desc: 'سجل تحذيرات عضو', badge: '', icon: '📜' },
                                { name: '/staffactivity', desc: 'تقرير نشاط الطاقم الإداري', badge: '', icon: '📊' },
                                { name: '/audit', desc: 'سجل تدقيق الإجراءات الحساسة', badge: 'صلاحيات ديسكورد', icon: '🔍' },
                                { name: '/punishments', desc: 'لوحة سجلات العقوبات الشاملة', badge: '', icon: '⚖️' }
                            ]
                        },
                        basic: {
                            title: 'الأوامر الأساسية',
                            desc: 'أوامر المساعدة والمعلومات الأساسية للأعضاء',
                            icon: '⚙️',
                            items: [
                                { name: '/help', desc: 'قائمة المساعدة الشاملة', badge: '', icon: '❓' },
                                { name: '/ping', desc: 'فحص سرعة استجابة البوت', badge: '', icon: '📶' },
                                { name: '/botinfo', desc: 'معلومات وإحصائيات البوت', badge: '', icon: '🤖' },
                                { name: '/serverinfo', desc: 'معلومات السيرفر وتاريخ إنشائه', badge: '', icon: '🏰' },
                                { name: '/userinfo', desc: 'معلومات العضو وتاريخ انضمامه', badge: '', icon: '👤' },
                                { name: '/avatar', desc: 'عرض الصورة الرمزية للعضو أو السيرفر', badge: '', icon: '🖼️' },
                                { name: '/banner', desc: 'عرض بنر الملف الشخصي أو السيرفر', badge: '', icon: '🎨' },
                                { name: '/invites', desc: 'معرفة عدد دعواتك الحقيقية والوهمية', badge: '', icon: '🔗' },
                                { name: '/roles', desc: 'قائمة رتب السيرفر وأعداد الأعضاء', badge: '', icon: '🎖️' },
                                { name: '/channels', desc: 'قائمة قنوات السيرفر وتوزيعها', badge: '', icon: '📁' },
                                { name: '/emojis', desc: 'استعراض إيموجيات وستيكرات السيرفر', badge: '', icon: '😃' },
                                { name: '/apply', desc: 'تقديم على الرتب والوظائف المتاحة', badge: '', icon: '📝' },
                                { name: '/ticket', desc: 'فتح تذكرة دعم فني جديدة', badge: '', icon: '🎫' },
                                { name: '/daily', desc: 'استلام الراتب اليومي المجاني (Gold)', badge: '', icon: '🪙' },
                                { name: '/profile', desc: 'بطاقة الملف الشخصي التفاعلية', badge: '', icon: '💳' },
                                { name: '/leaderboard', desc: 'لوحة المتصدرين في السيرفر', badge: '', icon: '🏆' },
                                { name: '/stars', desc: 'رصيد النجوم والسمعة والتقييم', badge: '', icon: '⭐' }
                            ]
                        }
                    };

                    let currentCat = 'punishments';
                    let currentFilter = 'all';

                    function renderCommands() {
                        const container = document.getElementById('cmdsListContainer');
                        const data = commandsDatabase[currentCat] || commandsDatabase.punishments;
                        
                        document.getElementById('catTitle').innerText = data.title;
                        document.getElementById('catDesc').innerText = data.desc;
                        document.getElementById('catIcon').innerText = data.icon;

                        const searchVal = document.getElementById('cmdSearchInput').value.toLowerCase().trim();

                        const filtered = data.items.filter(item => {
                            if (searchVal && !item.name.toLowerCase().includes(searchVal) && !item.desc.toLowerCase().includes(searchVal)) {
                                return false;
                            }
                            return true;
                        });

                        if (filtered.length === 0) {
                            container.innerHTML = '<div class="py-12 bg-[#12141f] border border-white/5 rounded-2xl text-center text-xs text-gray-500">لا توجد أوامر مطابقة لنتائج البحث 🔍</div>';
                            return;
                        }

                        container.innerHTML = filtered.map(item => {
                            const badgeHtml = item.badge ? '<span class="px-2.5 py-0.5 bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 rounded-lg text-[10px] font-bold flex items-center gap-1"><span>' + item.badge + '</span><span>🛡️</span></span>' : '';
                            return '<div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl flex items-center justify-between hover:border-indigo-500/40 transition">' +
                                '<div class="flex items-center gap-3">' +
                                    '<label class="toggle"><input type="checkbox" checked onchange="toggleSingleCmd(\\'' + item.name + '\\', this.checked)"><span class="slider"></span></label>' +
                                    '<button type="button" class="text-gray-500 hover:text-white text-xs">▼</button>' +
                                '</div>' +
                                '<div class="flex items-center gap-3">' +
                                    '<div class="text-right">' +
                                        '<div class="flex items-center justify-end gap-2">' + badgeHtml + '<span class="font-black text-white text-xs font-mono">' + item.name + '</span></div>' +
                                        '<p class="text-[11px] text-gray-400 mt-0.5">' + item.desc + '</p>' +
                                    '</div>' +
                                    '<div class="w-9 h-9 rounded-xl bg-[#0b0d14] border border-white/5 flex items-center justify-center text-sm shadow-inner">' + (item.icon || '⚙️') + '</div>' +
                                '</div>' +
                            '</div>';
                        }).join('');
                    }

                    function switchCmdCategory(catKey) {
                        currentCat = catKey;
                        const btns = document.querySelectorAll('[id^="btnCat"]');
                        btns.forEach(b => {
                            b.className = "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition";
                        });
                        const activeBtn = document.getElementById('btnCat' + catKey.charAt(0).toUpperCase() + catKey.slice(1));
                        if (activeBtn) {
                            activeBtn.className = "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-lg transition";
                        }
                        renderCommands();
                    }

                    function searchCommands() {
                        renderCommands();
                    }

                    function filterCmdStatus(status) {
                        currentFilter = status;
                        document.getElementById('btnFilterAll').className = status === 'all' ? "px-3 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white transition shadow" : "px-3 py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition";
                        document.getElementById('btnFilterEnabled').className = status === 'enabled' ? "px-3 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white transition shadow" : "px-3 py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition";
                        document.getElementById('btnFilterDisabled').className = status === 'disabled' ? "px-3 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white transition shadow" : "px-3 py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition";
                        renderCommands();
                    }

                    function toggleAllCategoryCmds(enable) {
                        document.querySelectorAll('#cmdsListContainer input[type="checkbox"]').forEach(cb => {
                            cb.checked = enable;
                        });
                    }

                    function toggleSingleCmd(cmdName, isEnabled) {
                        console.log('Command state changed:', cmdName, isEnabled);
                    }

                    // Initial render
                    renderCommands();
                    </script>
`;
            } else if (section === 'automod') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Master Toggle & Banner -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                            <label class="toggle">
                                <input type="checkbox" name="automod_enabled" value="1" ${settings.automod_enabled !== 0 ? 'checked' : ''} onchange="saveAutomodSetting('automod_enabled', this.checked)">
                                <span class="slider"></span>
                            </label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">الرقابة التلقائية</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">حماية سيرفرك من المحتوى غير المرغوب</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30">
                                    🛡️
                                </div>
                            </div>
                        </div>

                        <!-- 2. Discord AutoMod Header -->
                        <div class="space-y-4">
                            <div class="flex items-center justify-between">
                                <span class="text-[11px] text-gray-400 font-bold">فلاتر الكلمات</span>
                                <div class="flex items-center gap-2 text-indigo-400 font-bold text-xs">
                                    <span>Discord AutoMod — حماية مدعومة من Discord مباشرة - سريعة وموثوقة</span>
                                    <span>🤖</span>
                                </div>
                            </div>

                            <!-- فلترة الكلمات المحظورة -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="bad_words_enabled" value="1" ${settings.bad_words_enabled ? 'checked' : ''} onchange="saveAutomodSetting('bad_words_enabled', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="document.getElementById('sec_strict_words').scrollIntoView({behavior:'smooth'})" class="text-gray-400 hover:text-white p-1 text-xs">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">فلترة الكلمات المحظورة</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">فلترة الكلمات المسيئة والشتائم والمحتوى غير اللائق</p>
                                    </div>
                                    <span class="text-base">🛡️</span>
                                </div>
                            </div>

                            <!-- حظر دعوات السيرفرات -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_invites" value="1" ${settings.anti_invites ? 'checked' : ''} onchange="saveAutomodSetting('anti_invites', this.checked)"><span class="slider"></span></label>
                                    <button type="button" class="text-gray-400 hover:text-white p-1 text-xs">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">حظر دعوات السيرفرات</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">منع مشاركة روابط دعوات السيرفرات الأخرى</p>
                                    </div>
                                    <span class="text-base">🚨</span>
                                </div>
                            </div>
                        </div>

                        <!-- 3. فلاتر السبام (Spam Filters) -->
                        <div class="space-y-3 pt-2">
                            <span class="text-[11px] text-gray-400 font-bold block">فلاتر السبام</span>

                            <!-- مكافحة السبام -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_spam" value="1" ${settings.anti_spam ? 'checked' : ''} onchange="saveAutomodSetting('anti_spam', this.checked)"><span class="slider"></span></label>
                                    <button type="button" class="text-gray-400 hover:text-white p-1 text-xs">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">مكافحة السبام</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">كشف وحظر الرسائل المزعجة والمتكررة</p>
                                    </div>
                                    <span class="text-base">🛡️</span>
                                </div>
                            </div>

                            <!-- حظر الروابط -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_link" value="1" ${settings.anti_link ? 'checked' : ''} onchange="saveAutomodSetting('anti_link', this.checked)"><span class="slider"></span></label>
                                    <button type="button" class="text-gray-400 hover:text-white p-1 text-xs">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">حظر الروابط</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">حظر الروابط الغير مسموح بها</p>
                                    </div>
                                    <span class="text-base">🗑️</span>
                                </div>
                            </div>

                            <!-- حظر سبام المنشن -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_mass_mention" value="1" ${settings.anti_mass_mention ? 'checked' : ''} onchange="saveAutomodSetting('anti_mass_mention', this.checked)"><span class="slider"></span></label>
                                    <button type="button" class="text-gray-400 hover:text-white p-1 text-xs">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">حظر سبام المنشن</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">حدد عدد المنشنات المسموح بها في الرسالة الواحدة</p>
                                    </div>
                                    <span class="text-base">🔔</span>
                                </div>
                            </div>

                            <!-- حظر الحروف الكبيرة -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_caps" value="1" ${settings.anti_caps ? 'checked' : ''} onchange="saveAutomodSetting('anti_caps', this.checked)"><span class="slider"></span></label>
                                    <button type="button" class="text-gray-400 hover:text-white p-1 text-xs">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">حظر الحروف الكبيرة</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">منع الرسائل التي تحتوي على أحرف كبيرة بشكل مفرط (70% أو أكثر)</p>
                                    </div>
                                    <span class="text-base">✏️</span>
                                </div>
                            </div>

                            <!-- إزعاج Spoilers -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_spoilers" value="1" ${settings.anti_spoilers ? 'checked' : ''} onchange="saveAutomodSetting('anti_spoilers', this.checked)"><span class="slider"></span></label>
                                    <button type="button" class="text-gray-400 hover:text-white p-1 text-xs">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">إزعاج Spoilers</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">منع الاستخدام المفرط لعلامات السبويلر</p>
                                    </div>
                                    <span class="text-base">🧕</span>
                                </div>
                            </div>

                            <!-- نص Zalgo -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_zalgo" value="1" ${settings.anti_zalgo ? 'checked' : ''} onchange="saveAutomodSetting('anti_zalgo', this.checked)"><span class="slider"></span></label>
                                    <button type="button" class="text-gray-400 hover:text-white p-1 text-xs">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">نص Zalgo</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">منع النصوص المشوهة والرموز الغريبة (Zalgo text)</p>
                                    </div>
                                    <span class="text-base">🔎</span>
                                </div>
                            </div>
                        </div>

                        <!-- 4. حماية متقدمة - حماية البوت (Bot Shield Automod) -->
                        <div class="space-y-3 pt-4 border-t border-white/5">
                            <div class="flex items-center justify-between">
                                <span class="text-[11px] text-gray-400">مرونة أكثر في التخصيص</span>
                                <div class="flex items-center gap-2 text-amber-400 font-bold text-xs">
                                    <span>حماية البوت — حماية متقدمة يديرها البوت مباشرة</span>
                                    <span>🛡️</span>
                                </div>
                            </div>

                            <!-- مكافحة السبام المتقدم -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_spam_adv" value="1" checked onchange="saveAutomodSetting('anti_spam_adv', this.checked)"><span class="slider"></span></label>
                                    <button type="button" class="text-gray-400 hover:text-white p-1 text-xs">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">مكافحة السبام</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">كشف الرسائل المتكررة والفيضان السريع وحظرها تلقائياً</p>
                                    </div>
                                    <span class="text-base">🛡️</span>
                                </div>
                            </div>

                            <!-- إزعاج الإيموجي -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_emoji" value="1" ${settings.anti_emoji ? 'checked' : ''} onchange="saveAutomodSetting('anti_emoji', this.checked)"><span class="slider"></span></label>
                                    <button type="button" class="text-gray-400 hover:text-white p-1 text-xs">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">إزعاج الإيموجي</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">منع الاستخدام المفرط للرموز التعبيرية</p>
                                    </div>
                                    <span class="text-base">✨</span>
                                </div>
                            </div>

                            <!-- تكرار النص -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_text_repeat" value="1" ${settings.anti_text_repeat ? 'checked' : ''} onchange="saveAutomodSetting('anti_text_repeat', this.checked)"><span class="slider"></span></label>
                                    <button type="button" class="text-gray-400 hover:text-white p-1 text-xs">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">تكرار النص</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">منع تكرار نفس الحروف أو الكلمات بشكل مفرط</p>
                                    </div>
                                    <span class="text-base">⏳</span>
                                </div>
                            </div>

                            <!-- رسائل مكررة -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_repeat_messages" value="1" ${settings.anti_repeat_messages ? 'checked' : ''} onchange="saveAutomodSetting('anti_repeat_messages', this.checked)"><span class="slider"></span></label>
                                    <button type="button" class="text-gray-400 hover:text-white p-1 text-xs">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">رسائل مكررة</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">منع إرسال نفس الرسالة عدة مرات متتالية</p>
                                    </div>
                                    <span class="text-base">📜</span>
                                </div>
                            </div>

                            <!-- سبام الملصقات -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_stickers" value="1" ${settings.anti_stickers ? 'checked' : ''} onchange="saveAutomodSetting('anti_stickers', this.checked)"><span class="slider"></span></label>
                                    <button type="button" class="text-gray-400 hover:text-white p-1 text-xs">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">سبام الملصقات</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">منع إرسال الملصقات بشكل متكرر وسريع</p>
                                    </div>
                                    <span class="text-base">✨</span>
                                </div>
                            </div>

                            <!-- سبام الأسطر -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_line_spam" value="1" ${settings.anti_line_spam ? 'checked' : ''} onchange="saveAutomodSetting('anti_line_spam', this.checked)"><span class="slider"></span></label>
                                    <button type="button" class="text-gray-400 hover:text-white p-1 text-xs">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">سبام الأسطر</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">منع الرسائل التي تحتوي على أسطر فارغة كثيرة</p>
                                    </div>
                                    <span class="text-base">⏳</span>
                                </div>
                            </div>

                            <!-- الرسائل الطويلة -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_long_messages" value="1" ${settings.anti_long_messages ? 'checked' : ''} onchange="saveAutomodSetting('anti_long_messages', this.checked)"><span class="slider"></span></label>
                                    <button type="button" class="text-gray-400 hover:text-white p-1 text-xs">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">الرسائل الطويلة</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">منع الرسائل التي تتجاوز الحد الأقصى لعدد الأحرف</p>
                                    </div>
                                    <span class="text-base">💬</span>
                                </div>
                            </div>
                        </div>

                        <!-- 5. نظام العقوبات التلقائية للتحذيرات -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span class="px-2.5 py-1 bg-amber-950/60 text-amber-300 border border-amber-800/40 rounded-xl text-xs font-mono font-bold" id="warnRulesCount">${(warnPunishmentsList || []).length} قاعدة</span>
                                <div class="text-right">
                                    <div class="flex items-center justify-end gap-2 text-white font-black text-sm">
                                        <span>نظام العقوبات التلقائية للتحذيرات</span>
                                        <span class="text-amber-400">⚠️</span>
                                    </div>
                                    <p class="text-gray-400 text-[10px] mt-0.5">تطبيق عقوبات تلقائية عند تجاوز عدد التحذيرات من أمر warn!</p>
                                </div>
                            </div>

                            <div id="warnPunishmentsList" class="space-y-2">
                                ${(warnPunishmentsList && warnPunishmentsList.length > 0) ? warnPunishmentsList.map(rule => `
                                    <div class="bg-[#0b0d14] border border-white/5 p-3.5 rounded-xl flex items-center justify-between hover:border-amber-500/30 transition text-xs">
                                        <button type="button" onclick="deleteWarnRule(${rule.id})" class="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                                        <div class="flex items-center gap-3">
                                            <div class="text-right">
                                                <span class="font-bold text-white block">عند بلوغ ${rule.warn_count} تحذيرات</span>
                                                <span class="text-[10px] text-amber-400 font-mono">العقوبة: ${rule.action_type}</span>
                                            </div>
                                            <span class="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center font-bold">⚠️</span>
                                        </div>
                                    </div>
                                `).join('') : `
                                    <div class="py-8 text-center space-y-2">
                                        <div class="w-12 h-12 rounded-full bg-white/5 text-gray-400 flex items-center justify-center text-xl mx-auto">📋</div>
                                        <h5 class="text-xs font-bold text-gray-300">لا توجد قواعد بعد</h5>
                                        <p class="text-[10px] text-gray-500">أضف قاعدة عقوبة لتفعيل النظام</p>
                                    </div>
                                `}
                            </div>

                            <!-- زر إضافة قاعدة جديدة -->
                            <button type="button" onclick="openAddWarnModal()" class="w-full py-3 bg-[#171926] hover:bg-[#1f2233] border border-dashed border-amber-500/40 hover:border-amber-500/80 rounded-xl text-amber-300 font-bold text-xs transition flex items-center justify-center gap-2">
                                <span>➕</span>
                                <span>إضافة قاعدة جديدة</span>
                            </button>
                        </div>

                        <!-- 6. فلتر الكلمات المحظورة المشدد (Strict Bad Words Filter) -->
                        <div id="sec_strict_words" class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-5 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <label class="toggle">
                                    <input type="checkbox" name="strict_bad_words_enabled" value="1" ${settings.strict_bad_words_enabled ? 'checked' : ''} onchange="saveAutomodSetting('strict_bad_words_enabled', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <div class="text-right">
                                    <div class="flex items-center justify-end gap-2 text-rose-400 font-black text-sm">
                                        <span>فلتر الكلمات المحظورة المشدد</span>
                                        <span>🚫</span>
                                    </div>
                                    <p class="text-gray-400 text-[10px] mt-0.5">يعمل على جميع الأعضاء — يتخطى Discord AutoMod</p>
                                </div>
                            </div>

                            <!-- مربع الكلمات المحظورة -->
                            <div class="space-y-2">
                                <div class="flex items-center justify-between text-xs text-gray-300 font-bold">
                                    <div class="flex items-center gap-2 text-[10px] text-gray-400">
                                        <span>جزئي — يحتوي على الكلمة في أي مكان</span>
                                        <span>•</span>
                                        <span>كلمة كاملة — الكلمة وحدها فقط</span>
                                    </div>
                                    <div class="flex items-center gap-1 text-white">
                                        <span>الكلمات المحظورة</span>
                                        <span>💬</span>
                                    </div>
                                </div>

                                <div class="flex items-center gap-2">
                                    <button type="button" onclick="addStrictBadWord()" class="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-rose-950/40">إضافة</button>
                                    <select id="strictWordMatchMode" class="bg-[#0b0d14] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-gray-300 outline-none">
                                        <option value="partial">جزئي</option>
                                        <option value="exact">كلمة كاملة</option>
                                    </select>
                                    <input type="text" id="strictWordInput" placeholder="اكتب كلمة محظورة..." class="flex-1 bg-[#0b0d14] border border-white/5 focus:border-rose-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right" onkeydown="if(event.key==='Enter') addStrictBadWord()">
                                </div>

                                <div id="strictWordsContainer" class="flex flex-wrap gap-2 pt-2">
                                    ${(settings.bad_words_list ? settings.bad_words_list.split(/[\n,]+/).map(w => w.trim()).filter(Boolean) : []).map(w => `
                                        <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-950/60 text-rose-300 border border-rose-800/40 rounded-xl text-xs font-mono">
                                            <span>${w}</span>
                                            <button type="button" onclick="removeStrictBadWord('${w}')" class="text-rose-400 hover:text-white font-bold text-xs">×</button>
                                        </span>
                                    `).join('')}
                                </div>
                            </div>

                            <!-- كلمات مسموح بها (Whitelist) -->
                            <div class="space-y-2 pt-3 border-t border-white/5">
                                <div class="flex items-center justify-end gap-1 text-xs font-bold text-emerald-400">
                                    <span>كلمات مسموح بها (Whitelist)</span>
                                    <span>🛡️</span>
                                </div>
                                <p class="text-[10px] text-gray-400 text-right">أضف كلمات تحتوي على كلمة محظورة لكنها مقبولة</p>

                                <div class="flex items-center gap-2">
                                    <button type="button" onclick="addWhitelistedWord()" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-950/40">إضافة</button>
                                    <input type="text" id="whitelistWordInput" placeholder="اكتب كلمة مسموح بها..." class="flex-1 bg-[#0b0d14] border border-white/5 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right" onkeydown="if(event.key==='Enter') addWhitelistedWord()">
                                </div>

                                <div id="whitelistWordsContainer" class="flex flex-wrap gap-2 pt-2">
                                    ${(settings.whitelist_words_list ? settings.whitelist_words_list.split(/[\n,]+/).map(w => w.trim()).filter(Boolean) : []).map(w => `
                                        <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 rounded-xl text-xs font-mono">
                                            <span>${w}</span>
                                            <button type="button" onclick="removeWhitelistedWord('${w}')" class="text-emerald-400 hover:text-white font-bold text-xs">×</button>
                                        </span>
                                    `).join('')}
                                </div>
                            </div>

                            <!-- أعضاء معفيون من الفلتر -->
                            <div class="space-y-2 pt-3 border-t border-white/5">
                                <div class="flex items-center justify-end gap-1 text-xs font-bold text-white">
                                    <span>أعضاء معفيون من الفلتر</span>
                                    <span class="text-emerald-400">🛡️</span>
                                </div>
                                <input type="text" name="automod_exempt_users" value="${settings.automod_exempt_users || ''}" placeholder="ابحث عن عضو أو أدخل الـ ID..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-mono">
                                <p class="text-[10px] text-gray-500 text-right">الأدمنية غير معفيين تلقائياً — أضفهم هنا إذا أردت</p>
                            </div>

                            <!-- قناة السجل (اختياري) -->
                            <div class="space-y-2 pt-3 border-t border-white/5">
                                <div class="flex items-center justify-end gap-1 text-xs font-bold text-white">
                                    <span>قناة السجل ((اختياري))</span>
                                    <span>📜</span>
                                </div>
                                ${renderChannelSelect('automod_log_channel', settings.automod_log_channel || settings.log_channel || '')}
                            </div>
                        </div>

                    </div>

                    <script>
                    async function saveAutomodSetting(key, value) {
                        try {
                            const res = await fetch('/api/guild/${guildId}/settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ [key]: value ? 1 : 0 })
                            });
                            const data = await res.json();
                            const status = document.getElementById('saveStatus');
                            if (status) {
                                status.classList.remove('hidden');
                                setTimeout(() => status.classList.add('hidden'), 3000);
                            }
                        } catch(e) {
                            console.error('Failed to save automod setting', e);
                        }
                    }

                    async function addStrictBadWord() {
                        const input = document.getElementById('strictWordInput');
                        const word = input.value.trim();
                        if (!word) return;
                        
                        let current = "${(settings.bad_words_list || '').replace(/"/g, '\\"')}";
                        let words = current ? current.split(/[\n,]+/).map(w => w.trim()).filter(Boolean) : [];
                        if (!words.includes(word)) {
                            words.push(word);
                            await fetch('/api/guild/${guildId}/settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ bad_words_list: words.join(',') })
                            });
                            location.reload();
                        }
                    }

                    async function removeStrictBadWord(word) {
                        let current = "${(settings.bad_words_list || '').replace(/"/g, '\\"')}";
                        let words = current ? current.split(/[\n,]+/).map(w => w.trim()).filter(Boolean) : [];
                        words = words.filter(w => w !== word);
                        await fetch('/api/guild/${guildId}/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ bad_words_list: words.join(',') })
                        });
                        location.reload();
                    }

                    async function addWhitelistedWord() {
                        const input = document.getElementById('whitelistWordInput');
                        const word = input.value.trim();
                        if (!word) return;

                        let current = "${(settings.whitelist_words_list || '').replace(/"/g, '\\"')}";
                        let words = current ? current.split(/[\n,]+/).map(w => w.trim()).filter(Boolean) : [];
                        if (!words.includes(word)) {
                            words.push(word);
                            await fetch('/api/guild/${guildId}/settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ whitelist_words_list: words.join(',') })
                            });
                            location.reload();
                        }
                    }

                    async function removeWhitelistedWord(word) {
                        let current = "${(settings.whitelist_words_list || '').replace(/"/g, '\\"')}";
                        let words = current ? current.split(/[\n,]+/).map(w => w.trim()).filter(Boolean) : [];
                        words = words.filter(w => w !== word);
                        await fetch('/api/guild/${guildId}/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ whitelist_words_list: words.join(',') })
                        });
                        location.reload();
                    }

                    async function openAddWarnModal() {
                        const count = prompt('أدخل عدد التحذيرات المطلوب لتنفيذ العقوبة (مثلاً: 3):');
                        if (!count || isNaN(count)) return;
                        const action = prompt('اختر نوع العقوبة:\\n1 = timeout_5m (عزل 5 دقائق)\\n2 = timeout_1h (عزل ساعة)\\n3 = timeout_24h (عزل 24 ساعة)\\n4 = kick (طرد)\\n5 = ban (حظر نهائي)', '1');
                        
                        const actionMap = { '1': 'timeout_5m', '2': 'timeout_1h', '3': 'timeout_24h', '4': 'kick', '5': 'ban' };
                        const finalAction = actionMap[action] || 'timeout_5m';

                        try {
                            const res = await fetch('/api/guild/${guildId}/warn-punishments', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ warnCount: parseInt(count), actionType: finalAction })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تمت إضافة قاعدة العقوبة التلقائية بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (data.error || 'فشل الإضافة'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
                    }

                    async function deleteWarnRule(ruleId) {
                        if (!confirm('هل أنت متأكد من رغبتك في حذف قاعدة العقوبة هذه؟')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/warn-punishments/' + ruleId, {
                                method: 'DELETE'
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم الحذف بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ خطأ في الحذف');
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
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
            } else if (section === 'protection') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Banner Alert: البوت لا يملك صلاحيات حرجة الآن -->
                        <div class="bg-[#1e0e11] border border-rose-900/50 p-4 rounded-2xl flex items-center justify-between shadow-lg">
                            <div class="flex items-center gap-3">
                                <label class="toggle">
                                    <input type="checkbox" name="lock_dashboard" value="1" ${settings.lock_dashboard ? 'checked' : ''} onchange="saveProtectionSetting('lock_dashboard', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <span class="text-xs font-bold text-rose-300">قفل لوحة التحكم</span>
                            </div>
                            <div class="flex items-center gap-2 text-rose-400 font-bold text-xs">
                                <span>البوت لا يملك صلاحيات حرجة الآن</span>
                                <span class="text-base">⚠️</span>
                            </div>
                        </div>

                        <!-- 2. Master Toggle: تفعيل نظام الحماية -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                            <label class="toggle">
                                <input type="checkbox" name="anti_nuke_enabled" value="1" ${settings.anti_nuke_enabled !== 0 ? 'checked' : ''} onchange="saveProtectionSetting('anti_nuke_enabled', this.checked)">
                                <span class="slider"></span>
                            </label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-sm">تفعيل نظام الحماية</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">تفعيل أو تعطيل نظام الحماية الشامل</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30">
                                    🛡️
                                </div>
                            </div>
                        </div>

                        <!-- 3. حماية المتصفح (Browser Protection) -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl space-y-3 shadow-lg">
                            <div class="flex items-center justify-between">
                                <span class="text-xs text-gray-500 font-mono">PRO ONLY</span>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">حماية المتصفح</h4>
                                        <p class="text-gray-400 text-xs mt-0.5">يزيل رتب الأعضاء المحمية مؤقتاً عند الدخول من متصفح — بوتات خاصة فقط</p>
                                    </div>
                                    <div class="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-lg border border-indigo-500/30">
                                        🌐
                                    </div>
                                </div>
                            </div>
                            <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-end gap-2 text-gray-400 text-xs">
                                <span>هذه الميزة تعمل فقط مع البوتات الخاصة — يتطلب اشتراك بوت خاص نشط لهذا السيرفر.</span>
                                <span>🔒</span>
                            </div>
                        </div>

                        <!-- 4. تحديد وعقوبة (0/12 مفعل) -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl space-y-6 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span class="px-3 py-1 bg-amber-950/60 text-amber-300 border border-amber-800/40 rounded-xl text-xs font-bold font-mono">0/12 مفعل</span>
                                <div class="flex items-center gap-2">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">تحديد وعقوبة</h4>
                                        <p class="text-gray-400 text-[11px]">تعيين حد وعقوبة لكل إجراء</p>
                                    </div>
                                    <span class="text-base">🛡️</span>
                                </div>
                            </div>

                            <!-- مجموعة 1: حماية الرومات / الشاتات -->
                            <div class="space-y-3">
                                <div class="flex items-center justify-between text-xs text-gray-400 font-bold">
                                    <span>0/4 مفعل</span>
                                    <span class="text-white">حماية الرومات / الشاتات</span>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <!-- مكافحة حذف القنوات -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_channel_delete" value="1" ${settings.anti_channel_delete ? 'checked' : ''} onchange="saveProtectionSetting('anti_channel_delete', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة حذف القنوات</h5>
                                                <p class="text-[10px] text-gray-400">منع حذف قنوات جماعي</p>
                                            </div>
                                            <span class="text-sm">🗑️</span>
                                        </div>
                                    </div>

                                    <!-- مكافحة إنشاء القنوات -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_channel_create" value="1" ${settings.anti_channel_create ? 'checked' : ''} onchange="saveProtectionSetting('anti_channel_create', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة إنشاء القنوات</h5>
                                                <p class="text-[10px] text-gray-400">منع إنشاء قنوات جماعي</p>
                                            </div>
                                            <span class="text-sm">📢</span>
                                        </div>
                                    </div>

                                    <!-- مكافحة تعديل القنوات -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_channel_update" value="1" ${settings.anti_channel_update ? 'checked' : ''} onchange="saveProtectionSetting('anti_channel_update', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة تعديل القنوات</h5>
                                                <p class="text-[10px] text-gray-400">منع تعديل قنوات جماعي</p>
                                            </div>
                                            <span class="text-sm">#️⃣</span>
                                        </div>
                                    </div>

                                    <!-- حماية صلاحيات القنوات -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_channel_permissions" value="1" ${settings.anti_channel_permissions ? 'checked' : ''} onchange="saveProtectionSetting('anti_channel_permissions', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">حماية صلاحيات القنوات</h5>
                                                <p class="text-[10px] text-gray-400">منع أي تعديل على صلاحيات القنوات بأي شكل (Allow/Deny/Overwrites)</p>
                                            </div>
                                            <span class="text-sm">⚙️</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- مجموعة 2: حماية الرتب -->
                            <div class="space-y-3 pt-4 border-t border-white/5">
                                <div class="flex items-center justify-between text-xs text-gray-400 font-bold">
                                    <span>0/3 مفعل</span>
                                    <span class="text-white">حماية الرتب</span>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <!-- مكافحة حذف الرتب -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_role_delete" value="1" ${settings.anti_role_delete ? 'checked' : ''} onchange="saveProtectionSetting('anti_role_delete', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة حذف الرتب</h5>
                                                <p class="text-[10px] text-gray-400">منع حذف رتب جماعي</p>
                                            </div>
                                            <span class="text-sm">🗑️</span>
                                        </div>
                                    </div>

                                    <!-- مكافحة إنشاء الرتب -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_role_create" value="1" ${settings.anti_role_create ? 'checked' : ''} onchange="saveProtectionSetting('anti_role_create', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة إنشاء الرتب</h5>
                                                <p class="text-[10px] text-gray-400">منع إنشاء رتب جماعي</p>
                                            </div>
                                            <span class="text-sm">🎖️</span>
                                        </div>
                                    </div>

                                    <!-- مكافحة تعديل الرتب -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_role_update" value="1" ${settings.anti_role_update ? 'checked' : ''} onchange="saveProtectionSetting('anti_role_update', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة تعديل الرتب</h5>
                                                <p class="text-[10px] text-gray-400">منع تعديل رتب جماعي</p>
                                            </div>
                                            <span class="text-sm">🏅</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- مجموعة 3: حماية الويب هوك -->
                            <div class="space-y-3 pt-4 border-t border-white/5">
                                <div class="flex items-center justify-between text-xs text-gray-400 font-bold">
                                    <span>0/2 مفعل</span>
                                    <span class="text-white">حماية الويب هوك</span>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <!-- مكافحة إنشاء الويب هوك -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_webhook_create" value="1" ${settings.anti_webhook_create ? 'checked' : ''} onchange="saveProtectionSetting('anti_webhook_create', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة إنشاء الويب هوك</h5>
                                                <p class="text-[10px] text-gray-400">منع إنشاء الويب هوك وحذفه فوراً مع معاقبة المسؤول</p>
                                            </div>
                                            <span class="text-sm">⚙️</span>
                                        </div>
                                    </div>

                                    <!-- مكافحة تعديل الويب هوك -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_webhook_update" value="1" ${settings.anti_webhook_update ? 'checked' : ''} onchange="saveProtectionSetting('anti_webhook_update', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة تعديل الويب هوك</h5>
                                                <p class="text-[10px] text-gray-400">منع التعديل الجماعي على الويب هوكات الحالية مع معاقبة المسؤول</p>
                                            </div>
                                            <span class="text-sm">⚙️</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- مجموعة 4: حماية الأعضاء -->
                            <div class="space-y-3 pt-4 border-t border-white/5">
                                <div class="flex items-center justify-between text-xs text-gray-400 font-bold">
                                    <span>0/2 مفعل</span>
                                    <span class="text-white">حماية الأعضاء</span>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <!-- مكافحة الحظر -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_mass_ban" value="1" ${settings.anti_mass_ban ? 'checked' : ''} onchange="saveProtectionSetting('anti_mass_ban', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة الحظر</h5>
                                                <p class="text-[10px] text-gray-400">منع الحظر الجماعي</p>
                                            </div>
                                            <span class="text-sm">🔨</span>
                                        </div>
                                    </div>

                                    <!-- مكافحة الطرد -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_mass_kick" value="1" ${settings.anti_mass_kick ? 'checked' : ''} onchange="saveProtectionSetting('anti_mass_kick', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة الطرد</h5>
                                                <p class="text-[10px] text-gray-400">منع الطرد الجماعي</p>
                                            </div>
                                            <span class="text-sm">👢</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- مجموعة 5: حماية المحتوى -->
                            <div class="space-y-3 pt-4 border-t border-white/5">
                                <div class="flex items-center justify-between text-xs text-gray-400 font-bold">
                                    <span>0/1 مفعل</span>
                                    <span class="text-white">حماية المحتوى</span>
                                </div>
                                <div class="grid grid-cols-1 gap-3">
                                    <!-- مكافحة المنشنات -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_mass_mention" value="1" ${settings.anti_mass_mention ? 'checked' : ''} onchange="saveProtectionSetting('anti_mass_mention', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة المنشنات</h5>
                                                <p class="text-[10px] text-gray-400">منع المنشنات المفرطة</p>
                                            </div>
                                            <span class="text-sm">📢</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>

                        <!-- 5. عقوبة فورية (0/9 مفعل) -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span class="px-3 py-1 bg-rose-950/60 text-rose-300 border border-rose-800/40 rounded-xl text-xs font-bold font-mono">0/9 مفعل</span>
                                <div class="flex items-center gap-2">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">عقوبة فورية</h4>
                                        <p class="text-gray-400 text-[11px]">تطبيق العقوبة فوراً</p>
                                    </div>
                                    <span class="text-base">🏏</span>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <!-- رتب Onboarding الخطيرة -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_onboarding_danger" value="1" ${settings.anti_onboarding_danger ? 'checked' : ''} onchange="saveProtectionSetting('anti_onboarding_danger', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">رتب Onboarding الخطيرة</h5>
                                            <p class="text-[10px] text-gray-400">يمنع منح رتبة بصلاحيات خطيرة تلقائياً لأي عضو جديد عبر أسئلة الانضمام (Onboarding)</p>
                                        </div>
                                        <span class="text-sm">🚨</span>
                                    </div>
                                </div>

                                <!-- رتب خطيرة عند الانضمام (حماية الانفايت) -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_join_danger_roles" value="1" ${settings.anti_join_danger_roles ? 'checked' : ''} onchange="saveProtectionSetting('anti_join_danger_roles', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">رتب خطيرة عند الانضمام (حماية الانفايت)</h5>
                                            <p class="text-[10px] text-gray-400">يزيل تلقائياً أي رتبة استقرت على عضو جديد عبر رابط دعوة أو Onboarding ولم تكن الرتبة التلقائية الرسمية</p>
                                        </div>
                                        <span class="text-sm">🚨</span>
                                    </div>
                                </div>

                                <!-- مكافحة الريد -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_raid_fast" value="1" ${settings.anti_raid_fast ? 'checked' : ''} onchange="saveProtectionSetting('anti_raid_fast', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة الريد</h5>
                                            <p class="text-[10px] text-gray-400">حماية ضد الانضمام الجماعي</p>
                                        </div>
                                        <span class="text-sm">🛡️</span>
                                    </div>
                                </div>

                                <!-- مكافحة الصلاحيات الخطيرة -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_dangerous_perms" value="1" ${settings.anti_dangerous_perms ? 'checked' : ''} onchange="saveProtectionSetting('anti_dangerous_perms', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة الصلاحيات الخطيرة</h5>
                                            <p class="text-[10px] text-gray-400">منع منح صلاحيات خطيرة</p>
                                        </div>
                                        <span class="text-sm">🚨</span>
                                    </div>
                                </div>

                                <!-- مكافحة الرتب الخطيرة القابلة للربط -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_linked_roles" value="1" ${settings.anti_linked_roles ? 'checked' : ''} onchange="saveProtectionSetting('anti_linked_roles', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة الرتب الخطيرة القابلة للربط</h5>
                                            <p class="text-[10px] text-gray-400">يمنع أي رتبة تحمل صلاحية خطيرة من أن تصبح قابلة للحصول عليها ذاتياً عبر ربط حساب خارجي (Linked Roles)</p>
                                        </div>
                                        <span class="text-sm">🚨</span>
                                    </div>
                                </div>

                                <!-- مكافحة إضافة البوتات -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_bot_add" value="1" ${settings.anti_bot_add ? 'checked' : ''} onchange="saveProtectionSetting('anti_bot_add', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة إضافة البوتات</h5>
                                            <p class="text-[10px] text-gray-400">منع إضافة بوتات بدون إذن</p>
                                        </div>
                                        <span class="text-sm">🤖</span>
                                    </div>
                                </div>

                                <!-- مكافحة التطهير -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_prune" value="1" ${settings.anti_prune ? 'checked' : ''} onchange="saveProtectionSetting('anti_prune', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة التطهير</h5>
                                            <p class="text-[10px] text-gray-400">منع تطهير الأعضاء</p>
                                        </div>
                                        <span class="text-sm">🧹</span>
                                    </div>
                                </div>

                                <!-- مكافحة تغيير اسم السيرفر -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_server_name_change" value="1" ${settings.anti_server_name_change ? 'checked' : ''} onchange="saveProtectionSetting('anti_server_name_change', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة تغيير اسم السيرفر</h5>
                                            <p class="text-[10px] text-gray-400">منع تغيير اسم السيرفر</p>
                                        </div>
                                        <span class="text-sm">✏️</span>
                                    </div>
                                </div>

                                <!-- مكافحة تغيير أيقونة السيرفر -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_server_icon_change" value="1" ${settings.anti_server_icon_change ? 'checked' : ''} onchange="saveProtectionSetting('anti_server_icon_change', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة تغيير أيقونة السيرفر</h5>
                                            <p class="text-[10px] text-gray-400">منع تغيير أيقونة السيرفر</p>
                                        </div>
                                        <span class="text-sm">🖼️</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 6. كشف فقط (1/6 مفعل) -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span class="px-3 py-1 bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 rounded-xl text-xs font-bold font-mono">1/6 مفعل</span>
                                <div class="flex items-center gap-2">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">كشف فقط</h4>
                                        <p class="text-gray-400 text-[11px]">تسجيل فقط بدون عقوبة</p>
                                    </div>
                                    <span class="text-base">🔭</span>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <!-- مكافحة الاحتيال -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_scam" value="1" ${settings.anti_scam ? 'checked' : ''} onchange="saveProtectionSetting('anti_scam', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة الاحتيال</h5>
                                            <p class="text-[10px] text-gray-400">كشف وحذف روابط الاحتيال</p>
                                        </div>
                                        <span class="text-sm">🦅</span>
                                    </div>
                                </div>

                                <!-- مكافحة روابط الدعوة -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_invite_links" value="1" ${settings.anti_invite_links ? 'checked' : ''} onchange="saveProtectionSetting('anti_invite_links', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة روابط الدعوة</h5>
                                            <p class="text-[10px] text-gray-400">حذف روابط الدعوة</p>
                                        </div>
                                        <span class="text-sm">🪵</span>
                                    </div>
                                </div>

                                <!-- مكافحة المحتوى الغير لائق -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_nsfw_content" value="1" ${settings.anti_nsfw_content ? 'checked' : ''} onchange="saveProtectionSetting('anti_nsfw_content', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة المحتوى الغير لائق</h5>
                                            <p class="text-[10px] text-gray-400">حذف المحتوى الغير لائق</p>
                                        </div>
                                        <span class="text-sm">🛡️</span>
                                    </div>
                                </div>

                                <!-- مكافحة الغوست بينغ -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_ghost_ping" value="1" ${settings.anti_ghost_ping ? 'checked' : ''} onchange="saveProtectionSetting('anti_ghost_ping', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة الغوست بينغ</h5>
                                            <p class="text-[10px] text-gray-400">كشف حذف المنشنات</p>
                                        </div>
                                        <span class="text-sm">👻</span>
                                    </div>
                                </div>

                                <!-- كشف نقل القنوات -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_channel_move" value="1" ${settings.anti_channel_move ? 'checked' : ''} onchange="saveProtectionSetting('anti_channel_move', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">كشف نقل القنوات</h5>
                                            <p class="text-[10px] text-gray-400">كشف نقل القنوات إلى تصنيفات أخرى (تنبيه فقط)</p>
                                        </div>
                                        <span class="text-sm">📍</span>
                                    </div>
                                </div>

                                <!-- مكافحة سبام الويب هوك -->
                                <div class="bg-[#0b0d14] border border-purple-500/40 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/60 transition shadow-inner">
                                    <label class="toggle"><input type="checkbox" name="anti_webhook_spam" value="1" checked onchange="saveProtectionSetting('anti_webhook_spam', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة سبام الويب هوك</h5>
                                            <p class="text-[10px] text-gray-400">يحذف تلقائياً رسائل السبام المرسلة عبر أي ويبهوك ويزيل الويب هوك نفسه — يعمل باستمرار بالخلفية</p>
                                        </div>
                                        <span class="text-sm">⚙️</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 7. الدفاع الذاتي للبوت (Self Defense - مقفلة دائماً) -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span class="text-[11px] text-gray-400">مقفلة دائماً — تحمي البوت نفسه، لا يمكن إيقافها</span>
                                <div class="flex items-center gap-2">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">الدفاع الذاتي للبوت</h4>
                                    </div>
                                    <span class="text-base">🛡️</span>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <span class="px-2.5 py-1 bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 text-[10px] font-bold rounded-lg">مقفلة دائماً</span>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">مكافحة نزع صلاحيات البوت</h5>
                                        <p class="text-[10px] text-gray-400">ينبهك (عبر رسالة خاصة) لو فقدت رتبة البوت نفسها صلاحيات حرجة — مثلاً عند إعادة استخدام رابط دعوته وإلغاء تحديد الصلاحيات</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <span class="px-2.5 py-1 bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 text-[10px] font-bold rounded-lg">مقفلة دائماً</span>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">مكافحة إزالة رتبة البوت</h5>
                                        <p class="text-[10px] text-gray-400">ينبهك (عبر رسالة خاصة) لو أزيلت من البوت مباشرة رتبة تمنحه صلاحيات حرجة</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    <script>
                    async function saveProtectionSetting(key, value) {
                        try {
                            const res = await fetch('/api/guild/${guildId}/settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ [key]: value ? 1 : 0 })
                            });
                            const data = await res.json();
                            const status = document.getElementById('saveStatus');
                            if (status) {
                                status.classList.remove('hidden');
                                setTimeout(() => status.classList.add('hidden'), 3000);
                            }
                        } catch(e) {
                            console.error('Failed to save protection setting', e);
                        }
                    }
                    </script>
`;
            } else if (section === 'whitelist') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Banner Alert: البوت لا يملك صلاحيات حرجة الآن -->
                        <div class="bg-[#1e0e11] border border-rose-900/50 p-4 rounded-2xl flex items-center justify-between shadow-lg">
                            <div class="flex items-center gap-3">
                                <label class="toggle">
                                    <input type="checkbox" name="lock_dashboard" value="1" ${settings.lock_dashboard ? 'checked' : ''} onchange="saveProtectionSetting('lock_dashboard', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <span class="text-xs font-bold text-rose-300">قفل لوحة التحكم</span>
                            </div>
                            <div class="flex items-center gap-2 text-rose-400 font-bold text-xs">
                                <span>البوت لا يملك صلاحيات حرجة الآن</span>
                                <span class="text-base">⚠️</span>
                            </div>
                        </div>

                        <!-- 2. بطاقة إضافة عضو موثوق -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-end gap-2 text-emerald-400 font-black text-sm">
                                <span>إضافة عضو موثوق</span>
                                <span class="text-base">➕</span>
                            </div>

                            <div class="space-y-3">
                                <div>
                                    <input type="text" id="wlSearchUser" placeholder="ابحث عن عضو لإضافته..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right placeholder-gray-500">
                                </div>
                                <div class="flex items-center gap-3">
                                    <button type="button" onclick="addWhitelistUser('whitelist')" class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-emerald-950/40">
                                        <span>➕</span>
                                        <span>إضافة</span>
                                    </button>
                                    <input type="text" id="wlUserId" placeholder="أدخل معرف المستخدم (User ID) ثم اضغط إضافة أو Enter" class="flex-1 bg-[#0b0d14] border border-white/5 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-mono placeholder-gray-500" onkeydown="if(event.key==='Enter') addWhitelistUser('whitelist')">
                                </div>
                                <div class="text-[10px] text-gray-500 flex items-center justify-end gap-1">
                                    <span>اضغط Enter للإضافة السريعة</span>
                                    <span>ℹ️</span>
                                </div>
                            </div>
                        </div>

                        <!-- 3. قائمة الأعضاء الموثوقين -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span class="px-2.5 py-1 bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 rounded-xl text-xs font-mono font-bold" id="wlCountBadge">${(whitelistUsers || []).length} عضو</span>
                                <div class="flex items-center gap-2 text-white font-black text-sm">
                                    <span>الأعضاء الموثوقين</span>
                                    <span class="text-emerald-400">🛡️</span>
                                </div>
                            </div>

                            <div id="wlUsersList" class="space-y-2">
                                ${(whitelistUsers && whitelistUsers.length > 0) ? whitelistUsers.map(u => `
                                    <div class="bg-[#0b0d14] border border-white/5 p-3.5 rounded-xl flex items-center justify-between hover:border-emerald-500/30 transition">
                                        <button type="button" onclick="removeWhitelistUser('${u.user_id}', 'whitelist')" class="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                                        <div class="flex items-center gap-3">
                                            <div class="text-right">
                                                <span class="text-xs font-bold text-white block font-mono">${u.user_id}</span>
                                                <span class="text-[10px] text-gray-400">مستثنى من جميع فلاتر الحماية</span>
                                            </div>
                                            <div class="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold text-xs">👤</div>
                                        </div>
                                    </div>
                                `).join('') : `
                                    <div class="py-10 text-center space-y-2">
                                        <div class="w-12 h-12 rounded-full bg-white/5 text-gray-400 flex items-center justify-center text-xl mx-auto">👥</div>
                                        <h5 class="text-xs font-bold text-gray-300">لا يوجد أعضاء موثوقين</h5>
                                        <p class="text-[10px] text-gray-500">أضف أعضاء موثوقين أعلاه لاستثنائهم من قيود الحماية</p>
                                    </div>
                                `}
                            </div>
                        </div>

                        <!-- 4. نظام Anti Mod (محمي من العقوبات) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span class="px-2.5 py-1 bg-amber-950/60 text-amber-300 border border-amber-800/40 rounded-xl text-xs font-mono font-bold" id="antiModCountBadge">${(antimodUsers || []).length} عضو</span>
                                <div class="flex items-center gap-2 text-white font-black text-sm">
                                    <span>نظام Anti Mod (محمي من العقوبات)</span>
                                    <span class="text-amber-400">🛡️</span>
                                </div>
                            </div>

                            <div class="space-y-3">
                                <div>
                                    <input type="text" id="antiModSearchUser" placeholder="ابحث عن عضو لإضافته..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right placeholder-gray-500">
                                </div>
                                <div class="flex items-center gap-3">
                                    <button type="button" onclick="addWhitelistUser('antimod')" class="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-amber-950/40">
                                        <span>إضافة</span>
                                    </button>
                                    <input type="text" id="antiModUserId" placeholder="أدخل User ID لإضافته إلى Anti Mod" class="flex-1 bg-[#0b0d14] border border-white/5 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-mono placeholder-gray-500" onkeydown="if(event.key==='Enter') addWhitelistUser('antimod')">
                                </div>
                            </div>

                            <div id="antiModUsersList" class="space-y-2 pt-2">
                                ${(antimodUsers && antimodUsers.length > 0) ? antimodUsers.map(u => `
                                    <div class="bg-[#0b0d14] border border-white/5 p-3.5 rounded-xl flex items-center justify-between hover:border-amber-500/30 transition">
                                        <button type="button" onclick="removeWhitelistUser('${u.user_id}', 'antimod')" class="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                                        <div class="flex items-center gap-3">
                                            <div class="text-right">
                                                <span class="text-xs font-bold text-white block font-mono">${u.user_id}</span>
                                                <span class="text-[10px] text-amber-400/80">محمي من الطرد والحظر والعقوبات التلقائية</span>
                                            </div>
                                            <div class="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center font-bold text-xs">🛡️</div>
                                        </div>
                                    </div>
                                `).join('') : `
                                    <div class="py-6 text-center text-xs text-gray-500">
                                        لا يوجد أعضاء في Anti Mod حالياً.
                                    </div>
                                `}
                            </div>
                        </div>

                    </div>

                    <script>
                    async function addWhitelistUser(type) {
                        const inputId = type === 'antimod' ? 'antiModUserId' : 'wlUserId';
                        const input = document.getElementById(inputId);
                        const userId = input.value.trim();
                        if (!userId) return alert('يرجى إدخال معرف المستخدم (User ID)!');

                        try {
                            const res = await fetch('/api/guild/${guildId}/whitelist', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId, type })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم إضافة العضو بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (data.error || 'فشل الإضافة'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال بالخادم');
                        }
                    }

                    async function removeWhitelistUser(userId, type) {
                        if (!confirm('هل أنت متأكد من حذف هذا العضو؟')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/whitelist', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId, type })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم الحذف بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (data.error || 'فشل الحذف'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
                    }
                    </script>
`;
            } else if (section === 'protection-logs' || section === 'security-logs') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Banner Alert: البوت لا يملك صلاحيات حرجة الآن -->
                        <div class="bg-[#1e0e11] border border-rose-900/50 p-4 rounded-2xl flex items-center justify-between shadow-lg">
                            <div class="flex items-center gap-3">
                                <label class="toggle">
                                    <input type="checkbox" name="lock_dashboard" value="1" ${settings.lock_dashboard ? 'checked' : ''} onchange="saveProtectionSetting('lock_dashboard', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <span class="text-xs font-bold text-rose-300">قفل لوحة التحكم</span>
                            </div>
                            <div class="flex items-center gap-2 text-rose-400 font-bold text-xs">
                                <span>البوت لا يملك صلاحيات حرجة الآن</span>
                                <span class="text-base">⚠️</span>
                            </div>
                        </div>

                        <!-- 2. بطاقتي تفعيل سجلات الأمان وسجلات الإشراف جنباً إلى جنب -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <!-- سجلات الأمان -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                                <label class="toggle">
                                    <input type="checkbox" name="security_logs_enabled" value="1" ${settings.security_logs_enabled !== 0 ? 'checked' : ''} onchange="saveProtectionSetting('security_logs_enabled', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">سجلات الأمان</h4>
                                        <p class="text-gray-400 text-xs mt-0.5">تسجيل أحداث الأمان</p>
                                    </div>
                                    <div class="w-10 h-10 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center text-lg border border-amber-500/30">
                                        🛡️
                                    </div>
                                </div>
                            </div>

                            <!-- سجلات الإشراف -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_logs_enabled" value="1" ${settings.mod_logs_enabled !== 0 ? 'checked' : ''} onchange="saveProtectionSetting('mod_logs_enabled', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">سجلات الإشراف</h4>
                                        <p class="text-gray-400 text-xs mt-0.5">تسجيل إجراءات الإشراف</p>
                                    </div>
                                    <div class="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30">
                                        👥
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 3. بطاقة ماذا يتم تسجيله؟ -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-6 shadow-xl">
                            <div class="flex items-center justify-end gap-2 text-white font-black text-sm border-b border-white/5 pb-3">
                                <span>ماذا يتم تسجيله؟</span>
                                <span class="text-base">⚙️</span>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <!-- عمود سجلات الأمان -->
                                <div class="space-y-3">
                                    <div class="flex items-center justify-end gap-2 text-amber-400 font-bold text-xs">
                                        <span>سجلات الأمان</span>
                                        <span>🔒</span>
                                    </div>
                                    <div class="space-y-2">
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                                            <span class="text-gray-300 font-medium">محاولات التدمير</span>
                                        </div>
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                                            <span class="text-gray-300 font-medium">العقوبات التلقائية</span>
                                        </div>
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                                            <span class="text-gray-300 font-medium">تجاوز الحدود</span>
                                        </div>
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                                            <span class="text-gray-300 font-medium">أنشطة مشبوهة</span>
                                        </div>
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                                            <span class="text-gray-300 font-medium">روابط الاحتيال</span>
                                        </div>
                                    </div>
                                </div>

                                <!-- عمود سجلات الإشراف -->
                                <div class="space-y-3">
                                    <div class="flex items-center justify-end gap-2 text-purple-400 font-bold text-xs">
                                        <span>سجلات الإشراف</span>
                                        <span>🛡️</span>
                                    </div>
                                    <div class="space-y-2">
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                            <span class="text-gray-300 font-medium">أوامر الحظر والطرد</span>
                                        </div>
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                            <span class="text-gray-300 font-medium">أوامر العزل والكتم</span>
                                        </div>
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                            <span class="text-gray-300 font-medium">التحذيرات</span>
                                        </div>
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                            <span class="text-gray-300 font-medium">حذف الرسائل</span>
                                        </div>
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                            <span class="text-gray-300 font-medium">قفل/فتح القنوات</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 4. جدول الأحداث والسجلات الحية المسجلة -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span class="px-2.5 py-1 bg-purple-950/60 text-purple-300 border border-purple-800/40 rounded-xl text-xs font-mono font-bold">${(securityLogsList || []).length} سجل مسجل</span>
                                <h4 class="font-black text-white text-sm">أحدث سجلات الأمان والإشراف المسجلة لحظياً</h4>
                            </div>

                            <div class="space-y-2">
                                ${(securityLogsList && securityLogsList.length > 0) ? securityLogsList.map(log => `
                                    <div class="bg-[#0b0d14] border border-white/5 p-3.5 rounded-xl flex items-center justify-between text-xs hover:border-purple-500/30 transition">
                                        <span class="text-[10px] text-gray-500 font-mono">${new Date(log.created_at * 1000).toLocaleString('ar-SA')}</span>
                                        <div class="flex items-center gap-3">
                                            <div class="text-right">
                                                <span class="font-bold text-white block">${log.reason || log.action_type}</span>
                                                <span class="text-[10px] text-gray-400">${log.details || ''} ${log.executor_id ? `• المشرف: <span class="font-mono text-purple-300">${log.executor_id}</span>` : ''}</span>
                                            </div>
                                            <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold ${log.category === 'security' ? 'bg-amber-950/60 text-amber-400 border border-amber-800/30' : 'bg-purple-950/60 text-purple-400 border border-purple-800/30'}">${log.category === 'security' ? 'أمان' : 'إشراف'}</span>
                                        </div>
                                    </div>
                                `).join('') : `
                                    <div class="py-8 text-center text-xs text-gray-500">
                                        لا توجد سجلات أمان مسجلة حتى الآن. السيرفر آمن تماماً! 🛡️
                                    </div>
                                `}
                            </div>
                        </div>

                    </div>
`;
            } else if (section === 'welcome') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Top Tab Switcher (رسائل الترحيب / رسائل المغادرة) -->
                        <div class="flex items-center gap-3 bg-[#10121b] border border-white/5 p-2 rounded-2xl w-fit">
                            <button type="button" onclick="switchWelcomeTab('leave')" id="btnTabLeave" class="px-5 py-2 rounded-xl text-xs font-bold transition text-gray-400 hover:text-white">
                                <span>رسائل المغادرة</span>
                                <span class="text-rose-400">🚪</span>
                            </button>
                            <button type="button" onclick="switchWelcomeTab('welcome')" id="btnTabWelcome" class="px-5 py-2 rounded-xl text-xs font-bold transition bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-lg">
                                <span>رسائل الترحيب</span>
                                <span class="text-amber-300">👋</span>
                            </button>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 1. قسم رسائل الترحيب (Welcome Section - Exact to Image 2 & 3) -->
                        <!-- ========================================================= -->
                        <div id="sectionWelcomeBox" class="space-y-6">
                            <!-- Card 1: Master Header Card -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                                <label class="toggle">
                                    <input type="checkbox" name="welcome_enabled" value="1" ${settings.welcome_enabled !== 0 ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <div class="flex items-center justify-end gap-2 text-white font-black text-base">
                                            <span>مفعل</span>
                                            <span class="text-emerald-400">🎁</span>
                                        </div>
                                        <p class="text-gray-400 text-xs mt-0.5">إرسال رسالة أو إمبد ترحيبي عند انضمام عضو جديد للسيرفر</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Card 2: قناة الترحيب والرسالة -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة الترحيب <span class="text-orange-400">*</span></label>
                                    ${renderChannelSelect('welcome_channel', settings.welcome_channel || '')}
                                </div>

                                <div class="space-y-2">
                                    <div class="flex items-center justify-between text-xs text-gray-400 font-bold">
                                        <span>☺</span>
                                        <span>رسالة الترحيب (نص عادي)</span>
                                    </div>
                                    <textarea name="welcome_message" id="welcomeText" rows="3" oninput="updateWelcomePreview()" class="w-full bg-[#0b0d14] border border-white/5 focus:border-orange-500 rounded-xl p-4 text-xs text-white outline-none leading-relaxed text-right">${settings.welcome_message || 'مرحباً {user} في سيرفر **{server}**! 🎉 أنت العضو رقم **{memberCount}**'}</textarea>
                                    
                                    <!-- Variables Pill Badges -->
                                    <div class="flex items-center justify-between pt-1">
                                        <span class="text-[10px] text-gray-500">إذا تريد فقط Embed أو صورة بدون نص، اترك الرسالة فارغة.</span>
                                        <div class="flex flex-wrap gap-1.5 justify-end">
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{user}')">{user}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{username}')">{username}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{server}')">{server}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{memberCount}')">{memberCount}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{inviter}')">{inviter}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{joinDate}')">{joinDate}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Card 3: خيارات الترحيب الثلاثة (نص فقط / صورة ترحيب / رسالة Embed) -->
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <button type="button" onclick="setWelcomeType('text')" id="btnWlTypeText" class="p-4 rounded-2xl border ${settings.welcome_embed_enabled === 0 && !settings.welcome_image ? 'border-orange-500 bg-orange-950/20 text-white' : 'border-white/5 bg-[#12141f] text-gray-400'} text-center transition">
                                    <h5 class="font-bold text-xs">نص فقط</h5>
                                    <p class="text-[10px] text-gray-500 mt-1">رسالة نصية بسيطة</p>
                                </button>
                                <button type="button" onclick="setWelcomeType('image')" id="btnWlTypeImage" class="p-4 rounded-2xl border ${settings.welcome_image ? 'border-orange-500 bg-orange-950/20 text-white' : 'border-white/5 bg-[#12141f] text-gray-400'} text-center transition">
                                    <h5 class="font-bold text-xs">صورة ترحيب</h5>
                                    <p class="text-[10px] text-gray-500 mt-1">صورة مخصصة مع اسم العضو</p>
                                </button>
                                <button type="button" onclick="setWelcomeType('embed')" id="btnWlTypeEmbed" class="p-4 rounded-2xl border ${settings.welcome_embed_enabled !== 0 ? 'border-orange-500 bg-orange-950/20 text-white' : 'border-white/5 bg-[#12141f] text-gray-400'} text-center transition">
                                    <h5 class="font-bold text-xs">رسالة Embed</h5>
                                    <p class="text-[10px] text-gray-500 mt-1">رسالة منسقة مع ألوان</p>
                                </button>
                            </div>

                            <input type="hidden" name="welcome_embed_enabled" id="welcome_embed_enabled" value="${settings.welcome_embed_enabled !== 0 ? 1 : 0}">
                            <input type="hidden" name="welcome_image" id="welcome_image" value="${settings.welcome_image ? 1 : 0}">

                            <!-- Card 4: تخصيص رسالة الترحيب / الإيمبد (Live Preview & Embed Customizer - Exact to Image 2 & 3) -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                                <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                    <div class="flex flex-wrap gap-1.5">
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20">{user}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20">{username}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20">{server}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20">{memberCount}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20">{user.avatar}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20">{inviter}</span>
                                    </div>
                                    <h5 class="text-xs font-black text-white">تخصيص رسالة الترحيب</h5>
                                </div>

                                <!-- Color Pickers Palette -->
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs font-mono text-gray-400">#EF5700</span>
                                        <input type="color" name="welcome_embed_color" id="wlColorInput" value="${settings.welcome_embed_color || '#ef5700'}" class="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0">
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs font-bold text-gray-300">لون الإيمبد</span>
                                        <div class="flex items-center gap-1.5">
                                            <button type="button" onclick="setWlColor('#a855f7')" class="w-4 h-4 rounded-md bg-[#a855f7]"></button>
                                            <button type="button" onclick="setWlColor('#3b82f6')" class="w-4 h-4 rounded-md bg-[#3b82f6]"></button>
                                            <button type="button" onclick="setWlColor('#10b981')" class="w-4 h-4 rounded-md bg-[#10b981]"></button>
                                            <button type="button" onclick="setWlColor('#ec4899')" class="w-4 h-4 rounded-md bg-[#ec4899]"></button>
                                            <button type="button" onclick="setWlColor('#ef4444')" class="w-4 h-4 rounded-md bg-[#ef4444]"></button>
                                            <button type="button" onclick="setWlColor('#f97316')" class="w-4 h-4 rounded-md bg-[#f97316]"></button>
                                            <button type="button" onclick="setWlColor('#ef5700')" class="w-4 h-4 rounded-md bg-[#ef5700] ring-2 ring-white/50"></button>
                                        </div>
                                    </div>
                                </div>

                                <!-- Live Interactive Embed Card (Exact to Image 3) -->
                                <div id="wlPreviewEmbed" class="bg-[#0b0d14] border-r-4 border-orange-500 rounded-xl p-5 space-y-4 text-right shadow-inner">
                                    <div class="flex items-center justify-end gap-2 text-xs font-bold text-gray-400">
                                        <span>${guild.name}</span>
                                        <img src="${guildIcon}" class="w-5 h-5 rounded-full object-cover">
                                    </div>

                                    <div class="space-y-1">
                                        <h4 class="text-sm font-black text-white flex items-center justify-end gap-1.5">
                                            <span>مرحباً بك!</span>
                                            <span>🎉</span>
                                        </h4>
                                        <p id="pvWlMsg" class="text-xs text-gray-300">مرحباً {user} في سيرفر **{server}**! أنت العضو رقم **{memberCount}**</p>
                                    </div>

                                    <div class="border border-dashed border-white/10 rounded-xl p-6 text-center text-gray-600 text-xs">
                                        <span>🖼️ [صورة البنر أو بطاقة الترحيب]</span>
                                    </div>

                                    <div class="flex items-center justify-between text-[10px] text-gray-500 border-t border-white/5 pt-2 font-mono">
                                        <span>نتمنى لك وقتاً ممتعاً 🕒</span>
                                        <div class="flex items-center gap-1">
                                            <input type="checkbox" checked id="wlShowTime">
                                            <label for="wlShowTime">إظهار الوقت</label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 2. قسم رسائل المغادرة (Leave Section - Exact to Image 4 & 5) -->
                        <!-- ========================================================= -->
                        <div id="sectionLeaveBox" class="space-y-6 hidden">
                            <!-- Card 1: Master Header Card -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                                <label class="toggle">
                                    <input type="checkbox" name="leave_enabled" value="1" ${settings.leave_enabled ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <div class="flex items-center justify-end gap-2 text-white font-black text-base">
                                            <span>مفعل</span>
                                            <span class="text-rose-400">🚪</span>
                                        </div>
                                        <p class="text-gray-400 text-xs mt-0.5">إرسال رسالة عند مغادرة عضو من السيرفر</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Card 2: قناة المغادرة والرسالة -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة المغادرة <span class="text-rose-400">*</span></label>
                                    ${renderChannelSelect('leave_channel', settings.leave_channel || '')}
                                </div>

                                <div class="space-y-2">
                                    <div class="flex items-center justify-between text-xs text-gray-400 font-bold">
                                        <span>☺</span>
                                        <span>رسالة المغادرة (نص عادي)</span>
                                    </div>
                                    <textarea name="leave_message" id="leaveText" rows="3" oninput="updateLeavePreview()" class="w-full bg-[#0b0d14] border border-white/5 focus:border-rose-500 rounded-xl p-4 text-xs text-white outline-none leading-relaxed text-right">${settings.leave_message || 'وداعاً **{user}**، نتمنى لك التوفيق 👋'}</textarea>
                                    
                                    <!-- Variables Pill Badges -->
                                    <div class="flex items-center justify-end gap-1.5 pt-1">
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20 cursor-pointer" onclick="insertVar('leaveText', '{user}')">{user}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20 cursor-pointer" onclick="insertVar('leaveText', '{username}')">{username}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20 cursor-pointer" onclick="insertVar('leaveText', '{server}')">{server}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20 cursor-pointer" onclick="insertVar('leaveText', '{memberCount}')">{memberCount}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Card 3: خيارات المغادرة (رسالة نصية / رسالة Embed) -->
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <button type="button" onclick="setLeaveType('text')" id="btnLvTypeText" class="p-4 rounded-2xl border ${settings.leave_embed_enabled === 0 ? 'border-rose-500 bg-rose-950/20 text-white' : 'border-white/5 bg-[#12141f] text-gray-400'} text-center transition">
                                    <h5 class="font-bold text-xs">رسالة نصية</h5>
                                    <p class="text-[10px] text-gray-500 mt-1">رسالة بسيطة</p>
                                </button>
                                <button type="button" onclick="setLeaveType('embed')" id="btnLvTypeEmbed" class="p-4 rounded-2xl border ${settings.leave_embed_enabled !== 0 ? 'border-rose-500 bg-rose-950/20 text-white' : 'border-white/5 bg-[#12141f] text-gray-400'} text-center transition">
                                    <h5 class="font-bold text-xs">رسالة Embed</h5>
                                    <p class="text-[10px] text-gray-500 mt-1">رسالة منسقة مع ألوان</p>
                                </button>
                            </div>

                            <input type="hidden" name="leave_embed_enabled" id="leave_embed_enabled" value="${settings.leave_embed_enabled !== 0 ? 1 : 0}">

                            <!-- Card 4: تخصيص رسالة المغادرة (Live Preview & Colors) -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                                <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                    <div class="flex flex-wrap gap-1.5">
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20">{user}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20">{username}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20">{server}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20">{memberCount}</span>
                                    </div>
                                    <h5 class="text-xs font-black text-white">تخصيص رسالة المغادرة</h5>
                                </div>

                                <!-- Color Pickers Palette -->
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs font-mono text-gray-400">#EF4444</span>
                                        <input type="color" name="leave_embed_color" id="lvColorInput" value="${settings.leave_embed_color || '#ef4444'}" class="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0">
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs font-bold text-gray-300">لون الإيمبد</span>
                                        <div class="flex items-center gap-1.5">
                                            <button type="button" onclick="setLvColor('#ef4444')" class="w-4 h-4 rounded-md bg-[#ef4444] ring-2 ring-white/50"></button>
                                            <button type="button" onclick="setLvColor('#f97316')" class="w-4 h-4 rounded-md bg-[#f97316]"></button>
                                            <button type="button" onclick="setLvColor('#eab308')" class="w-4 h-4 rounded-md bg-[#eab308]"></button>
                                            <button type="button" onclick="setLvColor('#10b981')" class="w-4 h-4 rounded-md bg-[#10b981]"></button>
                                            <button type="button" onclick="setLvColor('#06b6d4')" class="w-4 h-4 rounded-md bg-[#06b6d4]"></button>
                                            <button type="button" onclick="setLvColor('#8b5cf6')" class="w-4 h-4 rounded-md bg-[#8b5cf6]"></button>
                                        </div>
                                    </div>
                                </div>

                                <!-- Live Interactive Leave Embed Card -->
                                <div id="lvPreviewEmbed" class="bg-[#0b0d14] border-r-4 border-rose-500 rounded-xl p-5 space-y-4 text-right shadow-inner">
                                    <div class="flex items-center justify-end gap-2 text-xs font-bold text-gray-400">
                                        <span>${guild.name}</span>
                                        <img src="${guildIcon}" class="w-5 h-5 rounded-full object-cover">
                                    </div>

                                    <div class="space-y-1">
                                        <h4 class="text-sm font-black text-white flex items-center justify-end gap-1.5">
                                            <span>وداعاً 👋</span>
                                        </h4>
                                        <p id="pvLvMsg" class="text-xs text-gray-300">وداعاً **{username}**، نتمنى لك التوفيق</p>
                                    </div>

                                    <div class="border border-dashed border-white/10 rounded-xl p-6 text-center text-gray-600 text-xs">
                                        <span>🖼️ [صورة البنر أو بطاقة المغادرة]</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    <script>
                    function switchWelcomeTab(tab) {
                        const secWl = document.getElementById('sectionWelcomeBox');
                        const secLv = document.getElementById('sectionLeaveBox');
                        const btnWl = document.getElementById('btnTabWelcome');
                        const btnLv = document.getElementById('btnTabLeave');

                        if (tab === 'welcome') {
                            secWl.classList.remove('hidden');
                            secLv.classList.add('hidden');
                            btnWl.className = "px-5 py-2 rounded-xl text-xs font-bold transition bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-lg";
                            btnLv.className = "px-5 py-2 rounded-xl text-xs font-bold transition text-gray-400 hover:text-white";
                        } else {
                            secWl.classList.add('hidden');
                            secLv.classList.remove('hidden');
                            btnLv.className = "px-5 py-2 rounded-xl text-xs font-bold transition bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-lg";
                            btnWl.className = "px-5 py-2 rounded-xl text-xs font-bold transition text-gray-400 hover:text-white";
                        }
                    }

                    function insertVar(targetId, varName) {
                        const el = document.getElementById(targetId);
                        if (!el) return;
                        el.value += ' ' + varName;
                        if (targetId === 'welcomeText') updateWelcomePreview();
                        if (targetId === 'leaveText') updateLeavePreview();
                    }

                    function updateWelcomePreview() {
                        const msg = document.getElementById('welcomeText').value;
                        const pv = document.getElementById('pvWlMsg');
                        if (pv) pv.innerText = msg || 'مرحباً {user} في سيرفر **{server}**!';
                    }

                    function updateLeavePreview() {
                        const msg = document.getElementById('leaveText').value;
                        const pv = document.getElementById('pvLvMsg');
                        if (pv) pv.innerText = msg || 'وداعاً **{user}**، نتمنى لك التوفيق';
                    }

                    function setWelcomeType(type) {
                        document.getElementById('welcome_embed_enabled').value = type === 'embed' ? 1 : 0;
                        document.getElementById('welcome_image').value = type === 'image' ? 1 : 0;
                        
                        document.getElementById('btnWlTypeText').className = type === 'text' ? 'p-4 rounded-2xl border border-orange-500 bg-orange-950/20 text-white text-center transition' : 'p-4 rounded-2xl border border-white/5 bg-[#12141f] text-gray-400 text-center transition';
                        document.getElementById('btnWlTypeImage').className = type === 'image' ? 'p-4 rounded-2xl border border-orange-500 bg-orange-950/20 text-white text-center transition' : 'p-4 rounded-2xl border border-white/5 bg-[#12141f] text-gray-400 text-center transition';
                        document.getElementById('btnWlTypeEmbed').className = type === 'embed' ? 'p-4 rounded-2xl border border-orange-500 bg-orange-950/20 text-white text-center transition' : 'p-4 rounded-2xl border border-white/5 bg-[#12141f] text-gray-400 text-center transition';
                    }

                    function setLeaveType(type) {
                        document.getElementById('leave_embed_enabled').value = type === 'embed' ? 1 : 0;
                        document.getElementById('btnLvTypeText').className = type === 'text' ? 'p-4 rounded-2xl border border-rose-500 bg-rose-950/20 text-white text-center transition' : 'p-4 rounded-2xl border border-white/5 bg-[#12141f] text-gray-400 text-center transition';
                        document.getElementById('btnLvTypeEmbed').className = type === 'embed' ? 'p-4 rounded-2xl border border-rose-500 bg-rose-950/20 text-white text-center transition' : 'p-4 rounded-2xl border border-white/5 bg-[#12141f] text-gray-400 text-center transition';
                    }

                    function setWlColor(c) {
                        document.getElementById('wlColorInput').value = c;
                        document.getElementById('wlPreviewEmbed').style.borderRightColor = c;
                    }

                    function setLvColor(c) {
                        document.getElementById('lvColorInput').value = c;
                        document.getElementById('lvPreviewEmbed').style.borderRightColor = c;
                    }
                    </script>
`;
            } else if (section === 'autoresponder') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Master Header Card (Exact to Image 1) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <button type="button" onclick="openAddAutoresponderModal()" class="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-orange-950/40">
                                <span>➕</span>
                                <span>إضافة رد تلقائي</span>
                            </button>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">الرد التلقائي</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">إعداد ردود تلقائية على كلمات أو عبارات معينة</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-orange-600/20 text-orange-400 flex items-center justify-center text-lg border border-orange-500/30">
                                    💬
                                </div>
                            </div>
                        </div>

                        <!-- 2. Triple Stats Badges (Exact to Image 1) -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <!-- إجمالي الردود -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(autoRespondersList || []).length}</span>
                                <span class="text-xs font-bold text-gray-400 block">إجمالي الردود</span>
                            </div>
                            <!-- ردود نشطة -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-emerald-400 font-mono">${(autoRespondersList || []).filter(r => r.is_active !== 0).length}</span>
                                <span class="text-xs font-bold text-gray-400 block">ردود نشطة</span>
                            </div>
                            <!-- إجمالي الاستخدام -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(autoRespondersList || []).reduce((acc, r) => acc + (r.uses_count || 0), 0)}</span>
                                <span class="text-xs font-bold text-gray-400 block">إجمالي الاستخدام</span>
                            </div>
                        </div>

                        <!-- 3. Main List / Empty State Card (Exact to Image 1) -->
                        <div class="bg-[#12141f] border border-white/5 p-8 rounded-2xl space-y-6 shadow-xl">
                            ${(autoRespondersList && autoRespondersList.length > 0) ? `
                                <div class="space-y-3">
                                    <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                        <span class="text-xs font-mono text-gray-400 font-bold">${autoRespondersList.length} رد مسجل</span>
                                        <h5 class="text-xs font-black text-white">الردود التلقائية النشطة</h5>
                                    </div>
                                    ${autoRespondersList.map(r => `
                                        <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-orange-500/40 transition">
                                            <button type="button" onclick="deleteAutoresponderItem(${r.id})" class="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                                            <div class="text-right space-y-1">
                                                <div class="flex items-center justify-end gap-2">
                                                    <span class="px-2 py-0.5 bg-white/5 text-gray-400 rounded text-[10px] font-mono">${r.match_mode || 'يحتوي على'}</span>
                                                    <span class="px-2.5 py-0.5 bg-orange-950/60 text-orange-300 border border-orange-800/40 rounded-lg text-xs font-bold font-mono">${r.trigger_word}</span>
                                                    <span class="text-gray-400 text-xs font-bold">الكلمة:</span>
                                                </div>
                                                <p class="text-xs text-gray-300">${r.reply_text}</p>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : `
                                <div class="py-12 text-center space-y-4">
                                    <div class="w-14 h-14 rounded-2xl bg-white/5 text-gray-400 flex items-center justify-center text-2xl mx-auto border border-white/5">
                                        💬
                                    </div>
                                    <div class="space-y-1">
                                        <h5 class="text-sm font-black text-white">لا توجد ردود تلقائية</h5>
                                        <p class="text-xs text-gray-400">أضف ردود تلقائية للرد على كلمات أو عبارات محددة</p>
                                    </div>
                                    <button type="button" onclick="openAddAutoresponderModal()" class="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-2 shadow-lg shadow-orange-950/40">
                                        <span>إضافة أول رد تلقائي</span>
                                    </button>
                                </div>
                            `}
                        </div>

                        <!-- ========================================================= -->
                        <!-- 4. نافذة الإضافة التفاعلية الكاملة (Exact to Image 2 Modal) -->
                        <!-- ========================================================= -->
                        <div id="addAutoresponderModal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
                            <div class="bg-[#12141f] border border-white/10 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6 text-right shadow-2xl" dir="rtl">
                                
                                <!-- Modal Header -->
                                <div class="flex items-center justify-between border-b border-white/5 pb-4">
                                    <button type="button" onclick="closeAddAutoresponderModal()" class="text-gray-400 hover:text-white text-lg font-bold">✕</button>
                                    <h3 class="text-base font-black text-white">إضافة رد جديد</h3>
                                </div>

                                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    
                                    <!-- العمود الأيمن: المحفز ونوع المطابقة والرد -->
                                    <div class="space-y-4">
                                        <!-- حقل المحفز -->
                                        <div class="space-y-1.5">
                                            <label class="block text-xs font-bold text-gray-300">حقل المحفز</label>
                                            <input type="text" id="arTrigger" placeholder="اكتب الكلمة أو العبارة..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-orange-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                        </div>

                                        <!-- نوع المطابقة (Buttons: يحتوي على / مطابقة تامة / يبدأ بـ / ينتهي بـ / Regex) -->
                                        <div class="space-y-1.5">
                                            <label class="block text-xs font-bold text-gray-300">نوع المطابقة</label>
                                            <div class="grid grid-cols-5 gap-1 bg-[#0b0d14] p-1 rounded-xl border border-white/5 text-[10px] text-center">
                                                <button type="button" onclick="setArMatchMode('regex')" id="btnArRegex" class="py-1.5 rounded-lg text-gray-400 hover:text-white transition">Regex</button>
                                                <button type="button" onclick="setArMatchMode('ends')" id="btnArEnds" class="py-1.5 rounded-lg text-gray-400 hover:text-white transition">ينتهي بـ</button>
                                                <button type="button" onclick="setArMatchMode('starts')" id="btnArStarts" class="py-1.5 rounded-lg text-gray-400 hover:text-white transition">يبدأ بـ</button>
                                                <button type="button" onclick="setArMatchMode('exact')" id="btnArExact" class="py-1.5 rounded-lg text-gray-400 hover:text-white transition">مطابقة تامة</button>
                                                <button type="button" onclick="setArMatchMode('contains')" id="btnArContains" class="py-1.5 rounded-lg bg-orange-600 text-white font-bold transition">يحتوي على</button>
                                            </div>
                                        </div>

                                        <!-- نوع الرد (Buttons: رد نصي / رد إيمبد / تفاعل) -->
                                        <div class="space-y-1.5">
                                            <label class="block text-xs font-bold text-gray-300">نوع الرد</label>
                                            <div class="grid grid-cols-3 gap-1.5">
                                                <button type="button" onclick="setArReplyType('reaction')" id="btnArReaction" class="py-2 bg-[#0b0d14] border border-white/5 rounded-xl text-[11px] text-gray-400 hover:text-white flex items-center justify-center gap-1 transition">
                                                    <span>تفاعل</span>
                                                    <span>😊</span>
                                                </button>
                                                <button type="button" onclick="setArReplyType('embed')" id="btnArEmbed" class="py-2 bg-[#0b0d14] border border-white/5 rounded-xl text-[11px] text-gray-400 hover:text-white flex items-center justify-center gap-1 transition">
                                                    <span>رد إيمبد</span>
                                                    <span>📄</span>
                                                </button>
                                                <button type="button" onclick="setArReplyType('text')" id="btnArText" class="py-2 bg-orange-600 border border-orange-500 rounded-xl text-[11px] text-white font-bold flex items-center justify-center gap-1 transition">
                                                    <span>رد نصي</span>
                                                    <span>💬</span>
                                                </button>
                                            </div>
                                        </div>

                                        <!-- الرد والبادجات -->
                                        <div class="space-y-2">
                                            <label class="block text-xs font-bold text-gray-300">الرد</label>
                                            <textarea id="arReply" rows="3" placeholder="اكتب الرد..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-orange-500 rounded-xl p-3 text-xs text-white outline-none leading-relaxed text-right"></textarea>
                                            <div class="flex flex-wrap gap-1 justify-end">
                                                <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20 cursor-pointer" onclick="insertArVar('{user}')">{user}</span>
                                                <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20 cursor-pointer" onclick="insertArVar('{server}')">{server}</span>
                                                <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20 cursor-pointer" onclick="insertArVar('{channel}')">{channel}</span>
                                                <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20 cursor-pointer" onclick="insertArVar('{memberCount}')">{memberCount}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- العمود الأيسر: الحساسية والمؤقت والاستثناءات -->
                                    <div class="space-y-4">
                                        <!-- حساس لحالة الأحرف -->
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between">
                                            <label class="toggle"><input type="checkbox" id="arCase"><span class="slider"></span></label>
                                            <div class="text-right">
                                                <h5 class="text-xs font-bold text-white">حساس لحالة الأحرف</h5>
                                                <p class="text-[10px] text-gray-500">التمييز بين الأحرف الكبيرة والصغيرة</p>
                                            </div>
                                        </div>

                                        <!-- حذف رسالة المحفز -->
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between">
                                            <label class="toggle"><input type="checkbox" id="arDeleteTrigger"><span class="slider"></span></label>
                                            <div class="text-right">
                                                <h5 class="text-xs font-bold text-white">حذف رسالة المحفز</h5>
                                                <p class="text-[10px] text-gray-500">حذف الرسالة التي أطلقت الرد التلقائي</p>
                                            </div>
                                        </div>

                                        <!-- فترة الانتظار (ثانية) -->
                                        <div class="space-y-1">
                                            <label class="block text-xs font-bold text-gray-300">فترة الانتظار (ثانية)</label>
                                            <input type="number" id="arCooldown" placeholder="0" class="w-full bg-[#0b0d14] border border-white/5 rounded-xl px-4 py-2 text-xs text-white outline-none text-right font-mono">
                                        </div>

                                        <!-- القنوات المسموحة -->
                                        <div class="space-y-1">
                                            <label class="block text-xs font-bold text-gray-300">القنوات المسموحة (فارغ = جميع القنوات)</label>
                                            ${renderChannelSelect('arAllowedChan', '', true)}
                                        </div>

                                        <!-- الرتب المسموحة -->
                                        <div class="space-y-1">
                                            <label class="block text-xs font-bold text-gray-300">الرتب المسموحة (فارغ = جميع الرتب)</label>
                                            ${renderRoleSelect('arAllowedRole', '')}
                                        </div>

                                        <!-- قنوات مستثناة -->
                                        <div class="space-y-1">
                                            <label class="block text-xs font-bold text-gray-300">قنوات مستثناة</label>
                                            ${renderChannelSelect('arExemptChan', '', true)}
                                        </div>

                                        <!-- رتب مستثناة -->
                                        <div class="space-y-1">
                                            <label class="block text-xs font-bold text-gray-300">رتب مستثناة</label>
                                            ${renderRoleSelect('arExemptRole', '')}
                                        </div>
                                    </div>

                                </div>

                                <!-- Modal Footer Buttons -->
                                <div class="flex items-center justify-between pt-4 border-t border-white/5 flex-row-reverse">
                                    <button type="button" onclick="submitNewAutoresponder()" class="px-8 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-orange-950/40">
                                        إضافة رد تلقائي
                                    </button>
                                    <button type="button" onclick="closeAddAutoresponderModal()" class="px-6 py-2.5 bg-[#0b0d14] hover:bg-white/5 border border-white/5 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition">
                                        إلغاء
                                    </button>
                                </div>

                            </div>
                        </div>

                    </div>

                    <script>
                    let currentArMatchMode = 'contains';
                    let currentArReplyType = 'text';

                    function openAddAutoresponderModal() {
                        document.getElementById('addAutoresponderModal').classList.remove('hidden');
                    }

                    function closeAddAutoresponderModal() {
                        document.getElementById('addAutoresponderModal').classList.add('hidden');
                    }

                    function setArMatchMode(mode) {
                        currentArMatchMode = mode;
                        const modes = ['contains', 'exact', 'starts', 'ends', 'regex'];
                        modes.forEach(m => {
                            const btn = document.getElementById('btnAr' + m.charAt(0).toUpperCase() + m.slice(1));
                            if (btn) {
                                btn.className = m === mode
                                    ? "py-1.5 rounded-lg bg-orange-600 text-white font-bold transition"
                                    : "py-1.5 rounded-lg text-gray-400 hover:text-white transition";
                            }
                        });
                    }

                    function setArReplyType(type) {
                        currentArReplyType = type;
                        const types = ['text', 'embed', 'reaction'];
                        types.forEach(t => {
                            const btn = document.getElementById('btnAr' + t.charAt(0).toUpperCase() + t.slice(1));
                            if (btn) {
                                btn.className = t === type
                                    ? "py-2 bg-orange-600 border border-orange-500 rounded-xl text-[11px] text-white font-bold flex items-center justify-center gap-1 transition"
                                    : "py-2 bg-[#0b0d14] border border-white/5 rounded-xl text-[11px] text-gray-400 hover:text-white flex items-center justify-center gap-1 transition";
                            }
                        });
                    }

                    function insertArVar(varName) {
                        const el = document.getElementById('arReply');
                        if (el) el.value += ' ' + varName;
                    }

                    async function submitNewAutoresponder() {
                        const trigger = document.getElementById('arTrigger').value.trim();
                        const reply = document.getElementById('arReply').value.trim();
                        if (!trigger) { alert('يرجى كتابة كلمة أو عبارة المحفز'); return; }
                        if (!reply) { alert('يرجى كتابة الرد التلقائي'); return; }

                        const payload = {
                            trigger_word: trigger,
                            reply_text: reply,
                            match_mode: currentArMatchMode,
                            reply_type: currentArReplyType,
                            case_sensitive: document.getElementById('arCase').checked ? 1 : 0,
                            delete_trigger: document.getElementById('arDeleteTrigger').checked ? 1 : 0,
                            cooldown_seconds: parseInt(document.getElementById('arCooldown').value) || 0,
                            allowed_channels: document.getElementById('arAllowedChan')?.value || '',
                            allowed_roles: document.getElementById('arAllowedRole')?.value || '',
                            exempt_channels: document.getElementById('arExemptChan')?.value || '',
                            exempt_roles: document.getElementById('arExemptRole')?.value || ''
                        };

                        try {
                            const res = await fetch('/api/guild/${guildId}/autoresponder', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تمت إضافة الرد التلقائي بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (data.error || 'فشل الإضافة'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال بالخادم');
                        }
                    }

                    async function deleteAutoresponderItem(id) {
                        if (!confirm('هل أنت متأكد من حذف هذا الرد التلقائي؟')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/autoresponder/' + id, {
                                method: 'DELETE'
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم الحذف بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ فشل الحذف');
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
                    }
                    </script>
`;
            } else if (section === 'tickets') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Master Header Card (Tickets) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <label class="toggle">
                                <input type="checkbox" name="tickets_enabled" value="1" ${settings.tickets_enabled !== 0 ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">نظام التذاكر والدعم الفني 🎫</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">لوحات تذاكر تفاعلية، تصنيفات مخصصة، وتقييمات خدمة العملاء</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30">
                                    🎫
                                </div>
                            </div>
                        </div>

                        <!-- 2. إحصائيات التذاكر الحية (Live Ticket Stats) -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-purple-400 font-mono">${(guildTicketsList || []).length}</span>
                                <span class="text-xs font-bold text-gray-400 block">إجمالي التذاكر المسجلة</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-emerald-400 font-mono">${(guildTicketsList || []).filter(t => t.status === 'open').length}</span>
                                <span class="text-xs font-bold text-gray-400 block">التذاكر المفتوحة حالياً</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-amber-400 font-mono">${(guildTicketsList || []).filter(t => t.status === 'closed').length}</span>
                                <span class="text-xs font-bold text-gray-400 block">التذاكر المغلقة</span>
                            </div>
                        </div>

                        <!-- 3. إعدادات لوحة ورتب التذاكر الأساسية -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <h4 class="text-xs font-black text-white border-b border-white/5 pb-3">إعدادات لوحة الدعم الفني</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">رتبة طاقم الدعم الفني (Support Role)</label>
                                    ${renderRoleSelect('ticket_role', settings.ticket_role || '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">روم إرسال لوحة التذاكر (Panel Channel)</label>
                                    ${renderChannelSelect('ticket_panel_channel', settings.ticket_panel_channel || '')}
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">عنوان لوحة التذاكر (Panel Title)</label>
                                    <input type="text" name="ticket_panel_title" value="${settings.ticket_panel_title || '🎫 الدعم الفني والمساعدة'}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة سجلات التذاكر (Transcripts Channel)</label>
                                    ${renderChannelSelect('ticket_log_channel', settings.ticket_log_channel || settings.log_channel || '')}
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2">رسالة الترحيب التلقائية داخل التذكرة (Ticket Welcome Message)</label>
                                <textarea name="ticket_welcome_msg" rows="3" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl p-4 text-xs text-white outline-none leading-relaxed text-right">${settings.ticket_welcome_msg || 'مرحباً بك {user}! يرجى كتابة استفسارك أو مشكلتك وسيقوم فريق الدعم بالرد عليك في أقرب وقت 🌟'}</textarea>
                            </div>
                        </div>

                        <!-- 4. جدول التذاكر الحية (Live Active Tickets) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span class="text-xs font-mono text-gray-400 font-bold">${(guildTicketsList || []).length} تذكرة</span>
                                <h4 class="text-xs font-black text-white">سجل التذاكر الأخيرة</h4>
                            </div>

                            <div class="space-y-2">
                                ${(guildTicketsList && guildTicketsList.length > 0) ? guildTicketsList.slice(0, 10).map(t => `
                                    <div class="bg-[#0b0d14] border border-white/5 p-3.5 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition text-xs">
                                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${t.status === 'open' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/30' : 'bg-rose-950/60 text-rose-400 border border-rose-800/30'}">${t.status === 'open' ? 'مفتوحة 🟢' : 'مغلقة 🔴'}</span>
                                        <div class="text-right">
                                            <span class="font-bold text-white block">صاحب التذكرة: <span class="font-mono text-purple-300">${t.user_id}</span></span>
                                            <span class="text-[10px] text-gray-400">${t.category || 'عام'} • <span class="font-mono">${new Date(t.created_at * 1000).toLocaleDateString('ar-SA')}</span></span>
                                        </div>
                                    </div>
                                `).join('') : `
                                    <div class="py-8 text-center text-xs text-gray-500">
                                        لا توجد تذاكر مسجلة حالياً في السيرفر 🎫
                                    </div>
                                `}
                            </div>
                        </div>

                    </div>
`;
            } else if (section === 'autoroles') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Master Header Card (Exact to Image 1) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <label class="toggle">
                                <input type="checkbox" name="autoroles_enabled" value="1" ${settings.autoroles_enabled !== 0 ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                            <div class="flex items-center gap-3">
                                <span class="text-xs font-black text-white">مفعل</span>
                                <div class="w-10 h-10 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center text-lg border border-amber-500/30">
                                    🛡️
                                </div>
                            </div>
                        </div>

                        <!-- Card: رتب الأعضاء الجدد & رتبة البوتات الجديدة (Exact to Image 1) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-6 shadow-xl">
                            <!-- رتب الأعضاء الجدد -->
                            <div class="space-y-2">
                                <div class="flex items-center justify-end gap-1 text-xs font-bold text-gray-300">
                                    <span>رتب الأعضاء الجدد</span>
                                </div>
                                ${renderRoleSelect('autorole_id', settings.autorole_id || settings.auto_role || '')}
                                <p class="text-[10px] text-gray-500 text-right">الرتب التي تُعطى للأعضاء الجدد عند الانضمام</p>
                            </div>

                            <!-- رتبة البوتات الجديدة -->
                            <div class="space-y-2 pt-4 border-t border-white/5">
                                <div class="flex items-center justify-end gap-1 text-xs font-bold text-gray-300">
                                    <span>رتبة البوتات الجديدة</span>
                                </div>
                                ${renderRoleSelect('autorole_bot_id', settings.autorole_bot_id || '')}
                                <p class="text-[10px] text-gray-500 text-right">الرتبة التي تُعطى للبوتات عند إضافتها للسيرفر</p>
                            </div>
                        </div>

                    </div>
`;
            } else if (section === 'levels') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Top Tab Switcher & Master Toggle (Exact to Images 1, 2, 3) -->
                        <div class="flex items-center justify-between">
                            <label class="toggle">
                                <input type="checkbox" name="leveling_enabled" value="1" ${settings.leveling_enabled !== 0 ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>

                            <!-- Navigation Tabs (Exact to Versa Tab Bar) -->
                            <div class="flex items-center gap-2 bg-[#10121b] border border-white/5 p-1.5 rounded-2xl">
                                <button type="button" onclick="switchLevelTab('settings')" id="btnTabLvlSettings" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(!currentTab || currentTab === 'settings') ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md' : 'text-gray-400 hover:text-white'} flex items-center gap-1">
                                    <span>الإعدادات</span>
                                    <span>⚙️</span>
                                </button>
                                <button type="button" onclick="switchLevelTab('text_roles')" id="btnTabLvlText" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(currentTab === 'text_roles') ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md' : 'text-gray-400 hover:text-white'} flex items-center gap-1">
                                    <span>رتب كتابية</span>
                                    <span>📜</span>
                                </button>
                                <button type="button" onclick="switchLevelTab('voice_roles')" id="btnTabLvlVoice" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(currentTab === 'voice_roles') ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md' : 'text-gray-400 hover:text-white'} flex items-center gap-1">
                                    <span>رتب صوتية</span>
                                    <span>🎵</span>
                                </button>
                                <button type="button" onclick="switchLevelTab('shared_roles')" id="btnTabLvlShared" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(currentTab === 'shared_roles') ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md' : 'text-gray-400 hover:text-white'} flex items-center gap-1">
                                    <span>رتب مشتركة</span>
                                    <span>✨</span>
                                </button>
                                <button type="button" onclick="switchLevelTab('leaderboard')" id="btnTabLvlLeaderboard" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(currentTab === 'leaderboard') ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md' : 'text-gray-400 hover:text-white'} flex items-center gap-1">
                                    <span>المتصدرين</span>
                                    <span>🏆</span>
                                </button>
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 1. تبويب الإعدادات العامة (Settings Tab) -->
                        <!-- ========================================================= -->
                        <div id="tabLvlSettings" class="space-y-6 ${(!currentTab || currentTab === 'settings') ? '' : 'hidden'}">
                            <!-- بطاقة نظام XP -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-end gap-2 text-white font-black text-sm border-b border-white/5 pb-3">
                                    <span>نظام XP</span>
                                    <span class="text-amber-400">✨</span>
                                </div>

                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <!-- مستويات كتابية -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                        <label class="toggle">
                                            <input type="checkbox" name="level_text_xp_enabled" value="1" ${settings.level_text_xp_enabled !== 0 ? 'checked' : ''}>
                                            <span class="slider"></span>
                                        </label>
                                        <div class="flex items-center gap-2 text-xs font-bold text-white">
                                            <span>مستويات كتابية</span>
                                            <span>💬</span>
                                        </div>
                                    </div>

                                    <!-- مستويات صوتية -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                        <label class="toggle">
                                            <input type="checkbox" name="level_voice_xp_enabled" value="1" ${settings.level_voice_xp_enabled !== 0 ? 'checked' : ''}>
                                            <span class="slider"></span>
                                        </label>
                                        <div class="flex items-center gap-2 text-xs font-bold text-white">
                                            <span>مستويات صوتية</span>
                                            <span>🎵</span>
                                        </div>
                                    </div>
                                </div>

                                <!-- فترة انتظار XP -->
                                <div class="space-y-2">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <span class="text-xs text-gray-400">ثانية</span>
                                            <input type="number" name="level_cooldown_seconds" value="${settings.level_cooldown_seconds || 120}" class="w-20 bg-[#0b0d14] border border-white/5 rounded-xl px-3 py-1.5 text-xs text-white font-mono text-center outline-none">
                                        </div>
                                        <div class="text-right">
                                            <h5 class="text-xs font-bold text-white">فترة انتظار XP</h5>
                                            <p class="text-[10px] text-gray-500">الثواني بين كل رسالة تكسب XP</p>
                                        </div>
                                    </div>
                                </div>

                                <!-- XP الصوت في الدقيقة -->
                                <div class="space-y-2 pt-3 border-t border-white/5">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <span class="text-xs text-gray-400">XP/دقيقة</span>
                                            <input type="number" name="level_voice_xp_rate" value="${settings.level_voice_xp_rate || 3}" class="w-20 bg-[#0b0d14] border border-white/5 rounded-xl px-3 py-1.5 text-xs text-white font-mono text-center outline-none">
                                        </div>
                                        <div class="text-right">
                                            <h5 class="text-xs font-bold text-white">XP الصوت في الدقيقة</h5>
                                            <p class="text-[10px] text-gray-500">كمية XP الممنوحة لكل دقيقة في الصوت</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- بطاقة إعدادات صوتية -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-end gap-2 text-white font-black text-sm border-b border-white/5 pb-3">
                                    <span>إعدادات صوتية</span>
                                    <span class="text-pink-400">🎵</span>
                                </div>

                                <div class="space-y-2">
                                    <div class="flex items-center justify-between text-xs font-bold">
                                        <span class="px-3 py-1 bg-orange-950/60 text-orange-400 border border-orange-800/40 rounded-xl font-mono text-sm" id="voiceMinMembersVal">${settings.level_voice_min_members || 2}</span>
                                        <span class="text-white">الحد الأدنى للأعضاء في القناة</span>
                                    </div>
                                    <input type="range" name="level_voice_min_members" min="1" max="10" value="${settings.level_voice_min_members || 2}" oninput="document.getElementById('voiceMinMembersVal').innerText = this.value" class="w-full accent-orange-500 cursor-pointer">
                                    <p class="text-[10px] text-gray-500 text-right">عدد الأعضاء المطلوب في القناة لبدء حساب XP</p>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <label class="toggle">
                                        <input type="checkbox" name="level_ignore_deafened" value="1" ${settings.level_ignore_deafened !== 0 ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">تجاهل الأعضاء المكتومين</h5>
                                        <p class="text-[10px] text-gray-500">لن يحصل الأعضاء المكتومون على XP صوتي</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <label class="toggle">
                                        <input type="checkbox" name="level_ignore_muted" value="1" ${settings.level_ignore_muted !== 0 ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">تجاهل الأعضاء الصامتين</h5>
                                        <p class="text-[10px] text-gray-500">لن يحصل الأعضاء الصامتون على XP صوتي</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <label class="toggle">
                                        <input type="checkbox" name="level_ignore_afk" value="1" ${settings.level_ignore_afk !== 0 ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">تجاهل قناة AFK</h5>
                                        <p class="text-[10px] text-gray-500">لن يحصل الأعضاء في قناة AFK على XP</p>
                                    </div>
                                </div>
                            </div>

                            <!-- بطاقة إعدادات رفع المستوى -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-end gap-2 text-white font-black text-sm border-b border-white/5 pb-3">
                                    <span>إعدادات رفع المستوى</span>
                                    <span class="text-indigo-400">🎉</span>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <label class="toggle">
                                        <input type="checkbox" name="level_up_msg_enabled" value="1" ${settings.level_up_msg_enabled !== 0 ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">رسائل رفع المستوى</h5>
                                        <p class="text-[10px] text-gray-500">إرسال رسالة عند رفع المستوى</p>
                                    </div>
                                </div>

                                <div class="space-y-2">
                                    <label class="block text-xs font-bold text-gray-300">قناة إشعارات المستوى</label>
                                    ${renderChannelSelect('level_channel', settings.level_channel || '')}
                                </div>

                                <div class="space-y-2">
                                    <div class="flex items-center justify-between text-xs text-gray-400">
                                        <div class="flex items-center gap-1">
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20">{server}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20">{xp}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20">{level}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-orange-400 px-2 py-0.5 rounded-lg border border-orange-500/20">{user}</span>
                                        </div>
                                        <span class="font-bold text-white">رسالة رفع المستوى (كتابي)</span>
                                    </div>
                                    <input type="text" name="level_message" value="${settings.level_message || '🎉 مبروك {user}! وصلت للمستوى **{level}**!'}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-orange-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>

                                <div class="space-y-2">
                                    <label class="block text-xs font-bold text-white text-right">رسالة رفع المستوى (صوتي)</label>
                                    <input type="text" name="level_voice_msg" value="${settings.level_voice_msg || '🎤 مبروك {user}! وصلت للمستوى الصوتي **{level}**!'}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-orange-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <label class="toggle">
                                        <input type="checkbox" name="level_dm_msg_enabled" value="1" ${settings.level_dm_msg_enabled ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">إرسال رسالة خاصة</h5>
                                        <p class="text-[10px] text-gray-500">إرسال إشعار رفع المستوى برسالة خاصة في DM</p>
                                    </div>
                                </div>
                            </div>

                            <!-- بطاقة تكديس الرتب & الاستثناءات -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-end gap-2 text-white font-black text-sm border-b border-white/5 pb-3">
                                    <span>إعدادات الرتب والاستثناءات</span>
                                    <span class="text-amber-400">👑</span>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <label class="toggle">
                                        <input type="checkbox" name="level_stack_roles" value="1" ${settings.level_stack_roles ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">تكديس الرتب</h5>
                                        <p class="text-[10px] text-gray-500">الاحتفاظ بجميع رتب المستويات السابقة عند الترقية</p>
                                    </div>
                                </div>

                                <div class="space-y-2 pt-3 border-t border-white/5">
                                    <label class="block text-xs font-bold text-white">قنوات مستثناة</label>
                                    ${renderChannelSelect('level_exempt_channels', settings.level_exempt_channels || '', true)}
                                </div>

                                <div class="space-y-2 pt-3 border-t border-white/5">
                                    <label class="block text-xs font-bold text-white">رتب مستثناة</label>
                                    ${renderRoleSelect('level_exempt_roles', settings.level_exempt_roles || '')}
                                </div>
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 2. تبويب رتب المستويات الكتابية (Text Roles Tab) -->
                        <!-- ========================================================= -->
                        <div id="tabLvlText" class="space-y-6 ${(currentTab === 'text_roles') ? '' : 'hidden'}">
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                    <div class="flex items-center gap-2">
                                        <button type="button" onclick="openAddLevelRoleModal('text')" class="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-orange-950/40">
                                            <span>➕</span>
                                            <span>إضافة رتبة</span>
                                        </button>
                                        <button type="button" onclick="location.reload()" class="px-3.5 py-2 bg-[#0b0d14] hover:bg-white/5 border border-white/5 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1">
                                            <span>🔄</span>
                                            <span>مزامنة</span>
                                        </button>
                                    </div>
                                    <div class="text-right">
                                        <h4 class="text-sm font-black text-white">رتب المستويات الكتابية</h4>
                                        <p class="text-[10px] text-gray-500 mt-0.5">أضف رتب يحصل عليها الأعضاء عند الوصول لمستوى كتابي معين</p>
                                    </div>
                                </div>

                                <div class="space-y-2">
                                    ${(levelRewardsList && levelRewardsList.filter(r => r.reward_type === 'text' || !r.reward_type).length > 0) ? levelRewardsList.filter(r => r.reward_type === 'text' || !r.reward_type).map(r => `
                                        <div class="bg-[#0b0d14] border border-white/5 p-3.5 rounded-xl flex items-center justify-between hover:border-orange-500/40 transition text-xs">
                                            <button type="button" onclick="deleteLevelRole(${r.id || r.level})" class="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                                            <div class="flex items-center gap-3">
                                                <div class="text-right">
                                                    <span class="font-bold text-white block">مستوى كتابي ${r.level}</span>
                                                    <span class="text-[10px] text-orange-400 font-mono">الرتبة: @${(guildRoles.find(role => role.id === r.role_id)?.name) || r.role_id}</span>
                                                </div>
                                                <span class="w-8 h-8 rounded-lg bg-orange-600/20 text-orange-400 flex items-center justify-center font-bold">📜</span>
                                            </div>
                                        </div>
                                    `).join('') : `
                                        <div class="py-12 text-center space-y-3">
                                            <div class="w-12 h-12 rounded-full bg-white/5 text-gray-400 flex items-center justify-center text-xl mx-auto">📜</div>
                                            <h5 class="text-xs font-bold text-gray-300">لا توجد رتب مستويات</h5>
                                            <p class="text-[10px] text-gray-500">أضف رتب لمكافأة الأعضاء النشطين</p>
                                            <button type="button" onclick="openAddLevelRoleModal('text')" class="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-1.5 shadow-lg shadow-orange-950/40">
                                                <span>إضافة أول رتبة</span>
                                            </button>
                                        </div>
                                    `}
                                </div>

                                <!-- بطاقة معادلة حساب XP -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl space-y-3">
                                    <div class="flex items-center justify-end gap-1.5 text-xs font-bold text-gray-300">
                                        <span>معادلة حساب XP</span>
                                        <span class="text-orange-400">ℹ️</span>
                                    </div>
                                    <p class="text-[11px] text-gray-400 text-right font-mono">XP المطلوب للمستوى = (المستوى × 25)²</p>
                                    <div class="flex items-center justify-center gap-2 pt-1">
                                        <span class="px-3 py-1 bg-white/5 border border-white/5 rounded-lg text-[10px] font-mono text-gray-300">مستوى 20 = 250,000 XP</span>
                                        <span class="px-3 py-1 bg-white/5 border border-white/5 rounded-lg text-[10px] font-mono text-gray-300">مستوى 10 = 62,500 XP</span>
                                        <span class="px-3 py-1 bg-white/5 border border-white/5 rounded-lg text-[10px] font-mono text-gray-300">مستوى 5 = 15,625 XP</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 3. تبويب رتب المستويات الصوتية (Voice Roles Tab - Image 1) -->
                        <!-- ========================================================= -->
                        <div id="tabLvlVoice" class="space-y-6 ${(currentTab === 'voice_roles') ? '' : 'hidden'}">
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                    <div class="flex items-center gap-2">
                                        <button type="button" onclick="openAddLevelRoleModal('voice')" class="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-orange-950/40">
                                            <span>➕</span>
                                            <span>إضافة رتبة</span>
                                        </button>
                                        <button type="button" onclick="location.reload()" class="px-3.5 py-2 bg-[#0b0d14] hover:bg-white/5 border border-white/5 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1">
                                            <span>🔄</span>
                                            <span>مزامنة</span>
                                        </button>
                                    </div>
                                    <div class="text-right">
                                        <h4 class="text-sm font-black text-white">رتب المستويات الصوتية</h4>
                                        <p class="text-[10px] text-gray-500 mt-0.5">أضف رتب يحصل عليها الأعضاء عند الوصول لمستوى صوتي معين</p>
                                    </div>
                                </div>

                                <div class="space-y-2">
                                    ${(levelRewardsList && levelRewardsList.filter(r => r.reward_type === 'voice').length > 0) ? levelRewardsList.filter(r => r.reward_type === 'voice').map(r => `
                                        <div class="bg-[#0b0d14] border border-white/5 p-3.5 rounded-xl flex items-center justify-between hover:border-pink-500/40 transition text-xs">
                                            <button type="button" onclick="deleteLevelRole(${r.id || r.level})" class="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                                            <div class="flex items-center gap-3">
                                                <div class="text-right">
                                                    <span class="font-bold text-white block">مستوى صوتي ${r.level}</span>
                                                    <span class="text-[10px] text-pink-400 font-mono">الرتبة: @${(guildRoles.find(role => role.id === r.role_id)?.name) || r.role_id}</span>
                                                </div>
                                                <span class="w-8 h-8 rounded-lg bg-pink-600/20 text-pink-400 flex items-center justify-center font-bold">🎵</span>
                                            </div>
                                        </div>
                                    `).join('') : `
                                        <div class="py-12 text-center space-y-3">
                                            <div class="w-12 h-12 rounded-full bg-pink-950/40 text-pink-400 flex items-center justify-center text-xl mx-auto border border-pink-500/20">🎵</div>
                                            <h5 class="text-xs font-bold text-gray-300">لا توجد رتب مستويات</h5>
                                            <p class="text-[10px] text-gray-500">أضف رتب لمكافأة الأعضاء النشطين</p>
                                            <button type="button" onclick="openAddLevelRoleModal('voice')" class="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-1.5 shadow-lg shadow-orange-950/40">
                                                <span>إضافة أول رتبة</span>
                                            </button>
                                        </div>
                                    `}
                                </div>

                                <!-- بطاقة معادلة حساب XP -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl space-y-3">
                                    <div class="flex items-center justify-end gap-1.5 text-xs font-bold text-gray-300">
                                        <span>معادلة حساب XP</span>
                                        <span class="text-orange-400">ℹ️</span>
                                    </div>
                                    <p class="text-[11px] text-gray-400 text-right font-mono">XP المطلوب للمستوى = (المستوى × 25)²</p>
                                    <div class="flex items-center justify-center gap-2 pt-1">
                                        <span class="px-3 py-1 bg-white/5 border border-white/5 rounded-lg text-[10px] font-mono text-gray-300">مستوى 20 = 250,000 XP</span>
                                        <span class="px-3 py-1 bg-white/5 border border-white/5 rounded-lg text-[10px] font-mono text-gray-300">مستوى 10 = 62,500 XP</span>
                                        <span class="px-3 py-1 bg-white/5 border border-white/5 rounded-lg text-[10px] font-mono text-gray-300">مستوى 5 = 15,625 XP</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 4. تبويب رتب مشتركة / الشرط المزدوج (Shared Dual Roles - Image 2) -->
                        <!-- ========================================================= -->
                        <div id="tabLvlShared" class="space-y-6 ${(currentTab === 'shared_roles') ? '' : 'hidden'}">
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                    <div class="flex items-center gap-2">
                                        <button type="button" onclick="openAddSharedRoleModal()" class="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-orange-950/40">
                                            <span>➕</span>
                                            <span>إضافة شرط</span>
                                        </button>
                                        <button type="button" onclick="location.reload()" class="px-3.5 py-2 bg-[#0b0d14] hover:bg-white/5 border border-white/5 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1">
                                            <span>🔄</span>
                                            <span>مزامنة</span>
                                        </button>
                                    </div>
                                    <div class="text-right">
                                        <h4 class="text-sm font-black text-white">رتب الشرط المزدوج</h4>
                                        <p class="text-[10px] text-gray-500 mt-0.5">الرتبة تُمنح فقط عند تحقق شرطي الكتابة والصوت معاً</p>
                                    </div>
                                </div>

                                <!-- بطاقة كيف تعمل الرتب المشتركة؟ (Exact to Image 2) -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl space-y-2 text-right">
                                    <div class="flex items-center justify-end gap-1.5 text-xs font-bold text-amber-400">
                                        <span>كيف تعمل الرتب المشتركة؟</span>
                                        <span>ℹ️</span>
                                    </div>
                                    <p class="text-[11px] text-gray-300 leading-relaxed">
                                        تُمنح الرتبة فقط عندما يحقق العضو كلا الشرطين في نفس الوقت — مستوى كتابي وصوتي يبلغان الحد المطلوب. إذا نقص أي شرط، تُسحب الرتبة تلقائياً.
                                    </p>
                                </div>

                                <!-- مثال توضيحي (Exact to Image 2) -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl space-y-2">
                                    <span class="text-[10px] text-gray-500 block text-right">مثال توضيحي:</span>
                                    <div class="flex items-center justify-center gap-3">
                                        <span class="px-3 py-1 bg-amber-950/60 text-amber-400 border border-amber-800/40 rounded-xl text-xs font-bold flex items-center gap-1.5">
                                            <span>عضو نشيط</span>
                                            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                                        </span>
                                        <span class="text-gray-500 font-bold">&gt;</span>
                                        <span class="px-3 py-1 bg-pink-950/60 text-pink-400 border border-pink-500/20 rounded-xl text-xs font-bold flex items-center gap-1">
                                            <span>صوتي ≥ 5</span>
                                            <span>🎵</span>
                                        </span>
                                        <span class="text-gray-500 font-bold">+</span>
                                        <span class="px-3 py-1 bg-indigo-950/60 text-indigo-400 border border-indigo-500/20 rounded-xl text-xs font-bold flex items-center gap-1">
                                            <span>كتابي ≥ 10</span>
                                            <span>💬</span>
                                        </span>
                                    </div>
                                </div>

                                <div class="space-y-2">
                                    ${(levelRewardsList && levelRewardsList.filter(r => r.reward_type === 'shared').length > 0) ? levelRewardsList.filter(r => r.reward_type === 'shared').map(r => `
                                        <div class="bg-[#0b0d14] border border-white/5 p-3.5 rounded-xl flex items-center justify-between hover:border-amber-500/40 transition text-xs">
                                            <button type="button" onclick="deleteLevelRole(${r.id || r.level})" class="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                                            <div class="flex items-center gap-3">
                                                <div class="text-right">
                                                    <span class="font-bold text-white block">كتابي ≥ ${r.level} + صوتي ≥ ${r.voice_level || 0}</span>
                                                    <span class="text-[10px] text-amber-400 font-mono">الرتبة: @${(guildRoles.find(role => role.id === r.role_id)?.name) || r.role_id}</span>
                                                </div>
                                                <span class="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center font-bold">✨</span>
                                            </div>
                                        </div>
                                    `).join('') : `
                                        <div class="py-12 text-center space-y-3">
                                            <div class="w-12 h-12 rounded-full bg-amber-950/40 text-amber-400 flex items-center justify-center text-xl mx-auto border border-amber-500/20">✨</div>
                                            <h5 class="text-xs font-bold text-gray-300">لا توجد رتب مشتركة</h5>
                                            <p class="text-[10px] text-gray-500">أضف شرطاً مزدوجاً يمنح رتبة عند تحقق مستوى صوتي وكتابي معاً</p>
                                            <button type="button" onclick="openAddSharedRoleModal()" class="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-1.5 shadow-lg shadow-orange-950/40">
                                                <span>إضافة أول شرط</span>
                                            </button>
                                        </div>
                                    `}
                                </div>
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 5. تبويب المتصدرين (Leaderboard Tab - Image 3) -->
                        <!-- ========================================================= -->
                        <div id="tabLvlLeaderboard" class="space-y-6 ${(currentTab === 'leaderboard') ? '' : 'hidden'}">
                            <div class="flex items-center justify-between">
                                <button type="button" onclick="location.reload()" class="px-4 py-2 bg-[#12141f] hover:bg-white/5 border border-white/5 text-gray-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5">
                                    <span>🔄</span>
                                    <span>تحديث</span>
                                </button>
                                <div class="text-right">
                                    <h4 class="text-sm font-black text-white">لوحة المتصدرين</h4>
                                    <p class="text-[10px] text-gray-500 mt-0.5">أكثر الأعضاء نشاطاً في السيرفر</p>
                                </div>
                            </div>

                            <!-- Triple Stats Cards (Exact to Image 3: عضو نشط | إجمالي XP | أعلى مستوى) -->
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                    <span class="text-2xl font-black text-white font-mono">${(guildLeaderboardUsers || []).length}</span>
                                    <span class="text-xs font-bold text-gray-400 block">عضو نشط</span>
                                </div>
                                <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                    <span class="text-2xl font-black text-white font-mono">${(guildLeaderboardUsers || []).reduce((acc, u) => acc + (u.xp || 0), 0)}</span>
                                    <span class="text-xs font-bold text-gray-400 block">إجمالي XP</span>
                                </div>
                                <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                    <span class="text-2xl font-black text-white font-mono">${(guildLeaderboardUsers && guildLeaderboardUsers[0]) ? guildLeaderboardUsers[0].level : 1}</span>
                                    <span class="text-xs font-bold text-gray-400 block">أعلى مستوى</span>
                                </div>
                            </div>

                            <!-- Leaderboard User Cards with Progress Bar (Exact to Image 3) -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                                ${(guildLeaderboardUsers && guildLeaderboardUsers.length > 0) ? guildLeaderboardUsers.map((u, idx) => `
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-2xl flex items-center justify-between shadow-md">
                                        <div class="flex items-center gap-3">
                                            <span class="text-xs font-bold text-purple-400 font-mono">${u.xp || 0} <span class="text-[10px] text-gray-500">إجمالي XP</span></span>
                                        </div>
                                        
                                        <div class="flex-1 max-w-md mx-6 hidden sm:block">
                                            <div class="w-full bg-[#1c1f2e] h-1.5 rounded-full overflow-hidden">
                                                <div class="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full" style="width: ${Math.min(100, Math.max(10, ((u.xp || 0) % 1875) / 18.75))}%"></div>
                                            </div>
                                        </div>

                                        <div class="flex items-center gap-3">
                                            <span class="px-2 py-0.5 bg-indigo-950/60 text-indigo-300 border border-indigo-500/30 rounded-lg text-[10px] font-mono font-bold">Lv.${u.level || 1}</span>
                                            <span class="font-bold text-white text-xs">${u.user_id}</span>
                                            <div class="w-7 h-7 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center font-bold text-xs border border-amber-500/30 font-mono">
                                                ${idx + 1}
                                            </div>
                                        </div>
                                    </div>
                                `).join('') : `
                                    <div class="py-8 text-center text-xs text-gray-500">
                                        لا توجد بيانات مسجلة في لوحة المتصدرين بعد.
                                    </div>
                                `}
                            </div>
                        </div>

                    </div>

                    <script>
                    function switchLevelTab(tab) {
                        const tabs = ['settings', 'text_roles', 'voice_roles', 'shared_roles', 'leaderboard'];
                        tabs.forEach(t => {
                            const el = document.getElementById(t === 'settings' ? 'tabLvlSettings' : (t === 'text_roles' ? 'tabLvlText' : (t === 'voice_roles' ? 'tabLvlVoice' : (t === 'shared_roles' ? 'tabLvlShared' : 'tabLvlLeaderboard'))));
                            const btn = document.getElementById(t === 'settings' ? 'btnTabLvlSettings' : (t === 'text_roles' ? 'btnTabLvlText' : (t === 'voice_roles' ? 'btnTabLvlVoice' : (t === 'shared_roles' ? 'btnTabLvlShared' : 'btnTabLvlLeaderboard'))));
                            if (el) el.classList.toggle('hidden', t !== tab);
                            if (btn) {
                                btn.className = t === tab 
                                    ? "px-4 py-1.5 rounded-xl text-xs font-bold transition bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md flex items-center gap-1"
                                    : "px-4 py-1.5 rounded-xl text-xs font-bold transition text-gray-400 hover:text-white flex items-center gap-1";
                            }
                        });
                    }

                    async function openAddLevelRoleModal(rewardType = 'text') {
                        const typeLabel = rewardType === 'voice' ? 'الصوتي' : 'الكتابي';
                        const level = prompt('أدخل رقم المستوى ' + typeLabel + ' المطلوب (مثال: 5 أو 10 أو 20):');
                        if (!level || isNaN(level)) return;
                        const roleId = prompt('أدخل ID الرتبة الممنوحة:');
                        if (!roleId || !roleId.trim()) return;

                        try {
                            const res = await fetch('/api/guild/${guildId}/level-reward', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ level: parseInt(level), roleId: roleId.trim(), rewardType })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تمت إضافة رتبة المستوى بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (data.error || 'فشل الإضافة'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال بالخادم');
                        }
                    }

                    async function openAddSharedRoleModal() {
                        const textLevel = prompt('أدخل الحد الأدنى للمستوى الكتابي (مثال: 10):');
                        if (!textLevel || isNaN(textLevel)) return;
                        const voiceLevel = prompt('أدخل الحد الأدنى للمستوى الصوتي (مثال: 5):');
                        if (!voiceLevel || isNaN(voiceLevel)) return;
                        const roleId = prompt('أدخل ID الرتبة الممنوحة عند تحقق الشرطين:');
                        if (!roleId || !roleId.trim()) return;

                        try {
                            const res = await fetch('/api/guild/${guildId}/level-reward', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ level: parseInt(textLevel), voiceLevel: parseInt(voiceLevel), roleId: roleId.trim(), rewardType: 'shared' })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تمت إضافة رتبة الشرط المزدوج بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (data.error || 'فشل الإضافة'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال بالخادم');
                        }
                    }

                    async function deleteLevelRole(idOrLevel) {
                        if (!confirm('هل أنت متأكد من حذف هذه الرتبة؟')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/level-reward/' + idOrLevel, {
                                method: 'DELETE'
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم الحذف بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ فشل الحذف');
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
                    }
                    </script>
`;
            } else if (section === 'moderation') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Master Header Card (Exact to Image 1: الإشراف & Action Buttons) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <div class="flex items-center gap-3">
                                <button type="submit" class="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-orange-950/40">
                                    <span>💾</span>
                                    <span>حفظ الإعدادات</span>
                                </button>
                                <button type="button" onclick="clearAllServerWarnings()" class="px-4 py-2.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow">
                                    <span>🗑️</span>
                                    <span>مسح كل التحذيرات</span>
                                </button>
                            </div>

                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">الإشراف</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">إعدادات الإشراف والعقوبات</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-orange-600/20 text-orange-400 flex items-center justify-center text-lg border border-orange-500/30">
                                    🛡️
                                </div>
                            </div>
                        </div>

                        <!-- 2. Triple Stats Badges (Exact to Image 1: رتب الإشراف / رتب مستثناة / كلمات محظورة) -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <!-- رتب الإشراف -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(settings.mod_staff_roles ? settings.mod_staff_roles.split(',').filter(Boolean).length : 0)}</span>
                                <span class="text-xs font-bold text-gray-400 block">رتب الإشراف</span>
                            </div>
                            <!-- رتب مستثناة -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-emerald-400 font-mono">${(settings.mod_exempt_roles ? settings.mod_exempt_roles.split(',').filter(Boolean).length : 0)}</span>
                                <span class="text-xs font-bold text-gray-400 block">رتب مستثناة</span>
                            </div>
                            <!-- كلمات محظورة -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(settings.bad_words_list ? settings.bad_words_list.split(/[\n,]+/).filter(Boolean).length : 0)}</span>
                                <span class="text-xs font-bold text-gray-400 block">كلمات محظورة</span>
                            </div>
                        </div>

                        <!-- 3. Grid of 6 Moderation Feature Cards (Exact to Image 1) -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            
                            <!-- 1. نظام التحذيرات -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_warn_enabled" value="1" ${settings.mod_warn_enabled !== 0 ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-2 text-right">
                                    <h5 class="text-xs font-bold text-white">نظام التحذيرات</h5>
                                    <span class="text-amber-400">🛡️</span>
                                </div>
                            </div>

                            <!-- 2. نظام الكتم -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_mute_enabled" value="1" ${settings.mod_mute_enabled !== 0 ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-2 text-right">
                                    <h5 class="text-xs font-bold text-white">نظام الكتم</h5>
                                    <span class="text-indigo-400">⏳</span>
                                </div>
                            </div>

                            <!-- 3. الكلمات المحظورة -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_badwords_enabled" value="1" ${settings.mod_badwords_enabled !== 0 ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-2 text-right">
                                    <h5 class="text-xs font-bold text-white">الكلمات المحظورة</h5>
                                    <span class="text-rose-400">💬</span>
                                </div>
                            </div>

                            <!-- 4. سبام المنشنات -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_mention_spam_enabled" value="1" ${settings.mod_mention_spam_enabled !== 0 ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-2 text-right">
                                    <h5 class="text-xs font-bold text-white">سبام المنشنات</h5>
                                    <span class="text-pink-400">📢</span>
                                </div>
                            </div>

                            <!-- 5. فلتر الحروف الكبيرة -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_caps_enabled" value="1" ${settings.mod_caps_enabled ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-2 text-right">
                                    <h5 class="text-xs font-bold text-white">فلتر الحروف الكبيرة</h5>
                                    <span class="text-blue-400">🔠</span>
                                </div>
                            </div>

                            <!-- 6. سبام الإيموجيات -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_emoji_spam_enabled" value="1" ${settings.mod_emoji_spam_enabled ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-2 text-right">
                                    <h5 class="text-xs font-bold text-white">سبام الإيموجيات</h5>
                                    <span class="text-amber-300">😜</span>
                                </div>
                            </div>

                        </div>

                        <!-- 4. بطاقة رتب الإشراف والرتب المستثناة (Exact to Image 1) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-5 shadow-xl">
                            <div class="flex items-center justify-end gap-2 text-white font-black text-sm border-b border-white/5 pb-3">
                                <span>رتب الإشراف</span>
                                <span class="text-blue-400">👮</span>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <!-- رتب المشرفين -->
                                <div class="space-y-1.5">
                                    <label class="block text-xs font-bold text-gray-300">رتب المشرفين</label>
                                    ${renderRoleSelect('mod_staff_roles', settings.mod_staff_roles || '')}
                                </div>

                                <!-- رتب مستثناة -->
                                <div class="space-y-1.5">
                                    <label class="block text-xs font-bold text-gray-300">رتب مستثناة</label>
                                    ${renderRoleSelect('mod_exempt_roles', settings.mod_exempt_roles || '')}
                                </div>
                            </div>
                        </div>

                    </div>

                    <script>
                    async function clearAllServerWarnings() {
                        if (!confirm('هل أنت متأكد من مسح جميع التحذيرات المسجلة لجميع الأعضاء في هذا السيرفر؟')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/clear-all-warnings', {
                                method: 'POST'
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم مسح جميع التحذيرات بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ فشل مسح التحذيرات');
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
                    }
                    </script>
`;
            } else if (section === 'giveaways') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Master Header Card (Exact to Image 1: نظام القيف اواي & Action Button) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <button type="button" onclick="openCreateGiveawayModal()" class="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-orange-950/40">
                                <span>➕</span>
                                <span>إنشاء قيف اواي</span>
                            </button>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">نظام القيف اواي</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">إنشاء وإدارة مسابقات القيف اواي في سيرفرك</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-orange-600/20 text-orange-400 flex items-center justify-center text-lg border border-orange-500/30">
                                    🎁
                                </div>
                            </div>
                        </div>

                        <!-- 2. Quad Stats Badges (Exact to Image 1: إجمالي القيف اواي / نشطة الآن / منتهية / إجمالي المشاركين) -->
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <!-- إجمالي القيف اواي -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(guildGiveawaysList || []).length}</span>
                                <span class="text-xs font-bold text-gray-400 block">إجمالي القيف اواي</span>
                            </div>
                            <!-- نشطة الآن -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-emerald-400 font-mono">${(guildGiveawaysList || []).filter(g => g.status === 'active').length}</span>
                                <span class="text-xs font-bold text-gray-400 block">نشطة الآن</span>
                            </div>
                            <!-- منتهية -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(guildGiveawaysList || []).filter(g => g.status === 'ended').length}</span>
                                <span class="text-xs font-bold text-gray-400 block">منتهية</span>
                            </div>
                            <!-- إجمالي المشاركين -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-amber-400 font-mono">${(guildGiveawaysList || []).reduce((acc, g) => acc + ((g.entries ? (typeof g.entries === 'string' ? JSON.parse(g.entries || '[]').length : g.entries.length) : 0)), 0)}</span>
                                <span class="text-xs font-bold text-gray-400 block">إجمالي المشاركين</span>
                            </div>
                        </div>

                        <!-- 3. Filter Bar & List / Empty State (Exact to Image 1) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-6 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-4">
                                <button type="button" onclick="location.reload()" class="p-2 bg-[#0b0d14] hover:bg-white/5 border border-white/5 text-gray-400 hover:text-white rounded-xl transition">
                                    🔄
                                </button>
                                <div class="flex items-center gap-1.5 bg-[#0b0d14] p-1 rounded-xl border border-white/5 text-xs font-bold">
                                    <button type="button" onclick="filterGiveawayTab('ended')" id="btnGwEnded" class="px-3 py-1 rounded-lg text-gray-400 hover:text-white transition">المنتهية ${(guildGiveawaysList || []).filter(g => g.status === 'ended').length}</button>
                                    <button type="button" onclick="filterGiveawayTab('active')" id="btnGwActive" class="px-3 py-1 rounded-lg text-gray-400 hover:text-white transition">النشطة ${(guildGiveawaysList || []).filter(g => g.status === 'active').length}</button>
                                    <button type="button" onclick="filterGiveawayTab('all')" id="btnGwAll" class="px-3 py-1 rounded-lg bg-orange-600 text-white transition shadow">الكل ${(guildGiveawaysList || []).length}</button>
                                </div>
                            </div>

                            <div id="giveawaysListContainer">
                                ${(guildGiveawaysList && guildGiveawaysList.length > 0) ? `
                                    <div class="space-y-3">
                                        ${guildGiveawaysList.map(g => {
                                            const entriesCount = g.entries ? (typeof g.entries === 'string' ? JSON.parse(g.entries || '[]').length : g.entries.length) : 0;
                                            return '<div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-orange-500/40 transition text-xs">' +
                                                '<div class="flex items-center gap-3">' +
                                                    '<span class="px-2 py-0.5 rounded text-[10px] font-bold ' + (g.status === 'active' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/30' : 'bg-white/5 text-gray-400') + '">' + (g.status === 'active' ? 'نشط 🟢' : 'منتهي 🔴') + '</span>' +
                                                    '<span class="text-gray-400 font-mono">' + entriesCount + ' مشارك 👥</span>' +
                                                '</div>' +
                                                '<div class="text-right">' +
                                                    '<h5 class="font-bold text-white text-sm">' + g.prize + '</h5>' +
                                                    '<p class="text-[10px] text-gray-400">الفائزين: ' + (g.winners_count || 1) + ' • القناة: <#' + g.channel_id + '></p>' +
                                                '</div>' +
                                            '</div>';
                                        }).join('')}
                                    </div>
                                ` : `
                                    <div class="py-14 text-center space-y-4">
                                        <div class="w-16 h-16 rounded-2xl bg-orange-950/30 text-orange-400 flex items-center justify-center text-3xl mx-auto border border-orange-500/20 shadow-inner">
                                            🎁
                                        </div>
                                        <div class="space-y-1">
                                            <h5 class="text-sm font-black text-white">لا توجد قيف اواي بعد</h5>
                                            <p class="text-xs text-gray-400">ابدأ بإنشاء أول قيف اواي لسيرفرك!</p>
                                        </div>
                                        <button type="button" onclick="openCreateGiveawayModal()" class="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-2 shadow-lg shadow-orange-950/40">
                                            <span>إنشاء قيف اواي</span>
                                        </button>
                                    </div>
                                `}
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 4. نافذة إنشاء قيف اواي التفاعلية الكاملة (Exact to Images 2 & 3 Modal) -->
                        <!-- ========================================================= -->
                        <div id="createGiveawayModal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
                            <div class="bg-[#12141f] border border-white/10 rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-5 text-right shadow-2xl" dir="rtl">
                                
                                <!-- Modal Header -->
                                <div class="flex items-center justify-between border-b border-white/5 pb-4">
                                    <button type="button" onclick="closeCreateGiveawayModal()" class="text-gray-400 hover:text-white text-lg font-bold">✕</button>
                                    <div class="flex items-center gap-2.5">
                                        <div class="text-right">
                                            <h3 class="text-base font-black text-white">إنشاء قيف اواي جديد</h3>
                                            <p class="text-[10px] text-gray-400">أعلن عن جائزتك الآن</p>
                                        </div>
                                        <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-sm shadow">
                                            🎉
                                        </div>
                                    </div>
                                </div>

                                <!-- حقل الجائزة -->
                                <div class="space-y-1.5">
                                    <label class="block text-xs font-bold text-gray-300">الجائزة <span class="text-orange-400">*</span></label>
                                    <input type="text" id="gwPrize" placeholder="مثال: Discord Nitro لمدة شهر" class="w-full bg-[#0b0d14] border border-white/5 focus:border-orange-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>

                                <!-- الوصف (اختياري) -->
                                <div class="space-y-1.5">
                                    <label class="block text-xs font-bold text-gray-300">الوصف (اختياري)</label>
                                    <textarea id="gwDesc" rows="2" placeholder="...أضف تفاصيل إضافية" class="w-full bg-[#0b0d14] border border-white/5 focus:border-orange-500 rounded-xl p-3 text-xs text-white outline-none text-right leading-relaxed"></textarea>
                                </div>

                                <!-- القناة المستهدفة -->
                                <div class="space-y-1.5">
                                    <label class="block text-xs font-bold text-gray-300">القناة <span class="text-orange-400">*</span></label>
                                    ${renderChannelSelect('gwChannel', '')}
                                </div>

                                <!-- المدة & عدد الفائزين -->
                                <div class="grid grid-cols-2 gap-4">
                                    <div class="space-y-1.5">
                                        <label class="block text-xs font-bold text-gray-300">عدد الفائزين</label>
                                        <input type="number" id="gwWinners" value="1" min="1" max="50" class="w-full bg-[#0b0d14] border border-white/5 focus:border-orange-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-center font-mono">
                                    </div>
                                    <div class="space-y-1.5">
                                        <label class="block text-xs font-bold text-gray-300">المدة</label>
                                        <select id="gwDuration" class="w-full bg-[#0b0d14] border border-white/5 focus:border-orange-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right cursor-pointer">
                                            <option value="10m">10 دقائق</option>
                                            <option value="1h">ساعة واحدة</option>
                                            <option value="6h">6 ساعات</option>
                                            <option value="12h">12 ساعة</option>
                                            <option value="24h" selected>يوم كامل (24 ساعة)</option>
                                            <option value="3d">3 أيام</option>
                                            <option value="7d">أسبوع كامل</option>
                                        </select>
                                    </div>
                                </div>

                                <!-- المظهر (المجسم والإيموجي ولون الإطار) -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-2xl space-y-4">
                                    <span class="text-xs font-bold text-white block border-b border-white/5 pb-2">المظهر</span>

                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <span class="text-lg">🎉</span>
                                            <input type="text" id="gwEmoji" value="🎉" class="w-16 bg-[#12141f] border border-white/5 rounded-xl px-2 py-1 text-xs text-center text-white font-mono outline-none">
                                        </div>
                                        <label class="text-xs font-bold text-gray-300">الإيموجي</label>
                                    </div>

                                    <!-- ألوان الإطار -->
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <input type="color" id="gwColorInput" value="#ef5700" class="w-6 h-6 rounded-md cursor-pointer bg-transparent border-0">
                                            <div class="flex items-center gap-1.5">
                                                <button type="button" onclick="setGwColor('#ef5700')" class="w-4 h-4 rounded-md bg-[#ef5700] ring-2 ring-white/50"></button>
                                                <button type="button" onclick="setGwColor('#f97316')" class="w-4 h-4 rounded-md bg-[#f97316]"></button>
                                                <button type="button" onclick="setGwColor('#10b981')" class="w-4 h-4 rounded-md bg-[#10b981]"></button>
                                                <button type="button" onclick="setGwColor('#3b82f6')" class="w-4 h-4 rounded-md bg-[#3b82f6]"></button>
                                                <button type="button" onclick="setGwColor('#8b5cf6')" class="w-4 h-4 rounded-md bg-[#8b5cf6]"></button>
                                                <button type="button" onclick="setGwColor('#ec4899')" class="w-4 h-4 rounded-md bg-[#ec4899]"></button>
                                                <button type="button" onclick="setGwColor('#ef4444')" class="w-4 h-4 rounded-md bg-[#ef4444]"></button>
                                                <button type="button" onclick="setGwColor('#ffffff')" class="w-4 h-4 rounded-md bg-[#ffffff]"></button>
                                                <button type="button" onclick="setGwColor('#000000')" class="w-4 h-4 rounded-md bg-[#000000]"></button>
                                            </div>
                                        </div>
                                        <label class="text-xs font-bold text-gray-300">لون الإطار</label>
                                    </div>

                                    <!-- صورة القيف اواي -->
                                    <div class="space-y-1.5 pt-2 border-t border-white/5">
                                        <label class="block text-xs font-bold text-gray-300">صورة القيف اواي (اختياري)</label>
                                        <input type="text" id="gwImage" placeholder="https://..." class="w-full bg-[#12141f] border border-white/5 focus:border-orange-500 rounded-xl px-4 py-2 text-xs text-white outline-none text-left font-mono">
                                    </div>
                                </div>

                                <!-- المتطلبات والدخول -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-2xl space-y-4">
                                    <span class="text-xs font-bold text-white block border-b border-white/5 pb-2">المتطلبات والدخول</span>

                                    <!-- الرتب المطلوبة -->
                                    <div class="space-y-1.5">
                                        <label class="block text-xs font-bold text-gray-300">الرتب المطلوبة (اختياري)</label>
                                        ${renderRoleSelect('gwReqRole', '')}
                                    </div>

                                    <!-- طريقة المشاركة & لون الزر -->
                                    <div class="grid grid-cols-2 gap-3">
                                        <div class="space-y-1.5">
                                            <label class="block text-xs font-bold text-gray-300">لون الزر</label>
                                            <select id="gwBtnStyle" class="w-full bg-[#12141f] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none text-right">
                                                <option value="Primary">🔵 أزرق (Primary)</option>
                                                <option value="Success">🟢 أخضر (Success)</option>
                                                <option value="Danger">🔴 أحمر (Danger)</option>
                                                <option value="Secondary">⚪ رمادي (Secondary)</option>
                                            </select>
                                        </div>
                                        <div class="space-y-1.5">
                                            <label class="block text-xs font-bold text-gray-300">طريقة المشاركة</label>
                                            <select id="gwEntryMode" class="w-full bg-[#12141f] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none text-right">
                                                <option value="button">🔘 زر (Button)</option>
                                                <option value="reaction">😊 تفاعل (Reaction)</option>
                                            </select>
                                        </div>
                                    </div>

                                    <!-- إعلان الفائزين -->
                                    <div class="flex items-center justify-between pt-2 border-t border-white/5">
                                        <label class="toggle"><input type="checkbox" id="gwNotifyWinners" checked><span class="slider"></span></label>
                                        <div class="text-right">
                                            <h5 class="text-xs font-bold text-white">إعلان الفائزين</h5>
                                            <p class="text-[10px] text-gray-500">إرسال رسالة عند اختيار الفائزين</p>
                                        </div>
                                    </div>
                                </div>

                                <!-- Modal Footer Buttons -->
                                <div class="flex items-center justify-between pt-4 border-t border-white/5 flex-row-reverse">
                                    <button type="button" onclick="submitCreateGiveaway()" class="px-8 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-orange-950/40">
                                        + إنشاء قيف اواي
                                    </button>
                                    <button type="button" onclick="closeCreateGiveawayModal()" class="px-6 py-2.5 bg-[#0b0d14] hover:bg-white/5 border border-white/5 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition">
                                        إلغاء
                                    </button>
                                </div>

                            </div>
                        </div>

                    </div>

                    <script>
                    function openCreateGiveawayModal() {
                        document.getElementById('createGiveawayModal').classList.remove('hidden');
                    }

                    function closeCreateGiveawayModal() {
                        document.getElementById('createGiveawayModal').classList.add('hidden');
                    }

                    function setGwColor(c) {
                        document.getElementById('gwColorInput').value = c;
                    }

                    function filterGiveawayTab(status) {
                        document.getElementById('btnGwAll').className = status === 'all' ? "px-3 py-1 rounded-lg bg-orange-600 text-white transition shadow" : "px-3 py-1 rounded-lg text-gray-400 hover:text-white transition";
                        document.getElementById('btnGwActive').className = status === 'active' ? "px-3 py-1 rounded-lg bg-orange-600 text-white transition shadow" : "px-3 py-1 rounded-lg text-gray-400 hover:text-white transition";
                        document.getElementById('btnGwEnded').className = status === 'ended' ? "px-3 py-1 rounded-lg bg-orange-600 text-white transition shadow" : "px-3 py-1 rounded-lg text-gray-400 hover:text-white transition";
                    }

                    async function submitCreateGiveaway() {
                        const prize = document.getElementById('gwPrize').value.trim();
                        const channelId = document.getElementById('gwChannel')?.value;
                        const duration = document.getElementById('gwDuration').value;
                        const winners = parseInt(document.getElementById('gwWinners').value) || 1;
                        const desc = document.getElementById('gwDesc').value.trim();
                        const color = document.getElementById('gwColorInput').value;
                        const image = document.getElementById('gwImage').value.trim();
                        const emoji = document.getElementById('gwEmoji').value.trim() || '🎉';
                        const reqRole = document.getElementById('gwReqRole')?.value;

                        if (!prize) { alert('يرجى كتابة اسم الجائزة'); return; }
                        if (!channelId) { alert('يرجى اختيار القناة التي سيتم نشر القيف اواي فيها'); return; }

                        try {
                            const res = await fetch('/api/guild/${guildId}/giveaways', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ prize, channelId, duration, winners, desc, color, image, emoji, reqRole })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم إنشاء ونشر القيف اواي في السيرفر بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (data.error || 'فشل إنشاء القيف اواي'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال بالخادم');
                        }
                    }
                    </script>
`;
            } else if (section === 'suggestions') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Master Header Card (Suggestions & Feedback) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <button type="button" onclick="openCreateSuggestionModal()" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
                                <span>➕</span>
                                <span>إضافة اقتراح جديد</span>
                            </button>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">نظام الاقتراحات والشكاوي</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">جمع آراء وتصويتات الأعضاء ومراجعة وتحديث حالات الاقتراحات</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30">
                                    💡
                                </div>
                            </div>
                        </div>

                        <!-- 2. Quad Stats Badges (إجمالي الاقتراحات / قيد الانتظار / مقبولة / مرفوضة) -->
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(guildSuggestionsList || []).length}</span>
                                <span class="text-xs font-bold text-gray-400 block">إجمالي الاقتراحات</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-amber-400 font-mono">${(guildSuggestionsList || []).filter(s => s.status === 'pending').length}</span>
                                <span class="text-xs font-bold text-gray-400 block">قيد المراجعة</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-emerald-400 font-mono">${(guildSuggestionsList || []).filter(s => s.status === 'accepted' || s.status === 'implemented').length}</span>
                                <span class="text-xs font-bold text-gray-400 block">مقبولة / منفذة</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-rose-400 font-mono">${(guildSuggestionsList || []).filter(s => s.status === 'rejected').length}</span>
                                <span class="text-xs font-bold text-gray-400 block">مرفوضة</span>
                            </div>
                        </div>

                        <!-- 3. إعدادات نظام الاقتراحات الأساسية (قناة الاقتراحات، رتب المراجعة، الخيوط التلقائية) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <h4 class="text-xs font-black text-white border-b border-white/5 pb-3">إعدادات قناة وصلاحيات الاقتراحات</h4>
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة نشر الاقتراحات (Suggestions Channel)</label>
                                    ${renderChannelSelect('suggestions_channel', settings.suggestions_channel || '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة سجلات الإدارة (Log Channel)</label>
                                    ${renderChannelSelect('suggestions_log_channel', settings.suggestions_log_channel || settings.log_channel || '')}
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">رتب الإدارة المسؤولة عن المراجعة (Staff Roles)</label>
                                    ${renderRoleSelect('suggestions_staff_roles', settings.suggestions_staff_roles || '')}
                                </div>
                                <div class="flex items-center justify-between p-3.5 bg-[#0b0d14] border border-white/5 rounded-xl mt-6">
                                    <label class="toggle"><input type="checkbox" name="suggestions_auto_thread" value="1" ${settings.suggestions_auto_thread !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">إنشاء خيط نقاش تلقائي (Thread)</h5>
                                        <p class="text-[10px] text-gray-500">فتح ثريد تحت كل اقتراح لتمكين الأعضاء من النقاش</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 4. قائمة وجدول الاقتراحات الحية والتفاعل (Live Suggestions List) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-6 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-4">
                                <button type="button" onclick="location.reload()" class="p-2 bg-[#0b0d14] hover:bg-white/5 border border-white/5 text-gray-400 hover:text-white rounded-xl transition">
                                    🔄
                                </button>
                                <div class="flex items-center gap-1.5 bg-[#0b0d14] p-1 rounded-xl border border-white/5 text-xs font-bold">
                                    <button type="button" onclick="filterSuggTab('rejected')" id="btnSgRejected" class="px-3 py-1 rounded-lg text-gray-400 hover:text-white transition">المرفوضة</button>
                                    <button type="button" onclick="filterSuggTab('accepted')" id="btnSgAccepted" class="px-3 py-1 rounded-lg text-gray-400 hover:text-white transition">المقبولة</button>
                                    <button type="button" onclick="filterSuggTab('pending')" id="btnSgPending" class="px-3 py-1 rounded-lg text-gray-400 hover:text-white transition">قيد المراجعة</button>
                                    <button type="button" onclick="filterSuggTab('all')" id="btnSgAll" class="px-3 py-1 rounded-lg bg-purple-600 text-white transition shadow">الكل</button>
                                </div>
                            </div>

                            <div id="suggestionsListContainer" class="space-y-4">
                                ${(guildSuggestionsList && guildSuggestionsList.length > 0) ? guildSuggestionsList.map(s => {
                                    let upCount = 0;
                                    let downCount = 0;
                                    try { upCount = JSON.parse(s.upvotes || '[]').length; } catch(e) {}
                                    try { downCount = JSON.parse(s.downvotes || '[]').length; } catch(e) {}

                                    let statusBadge = '<span class="px-2.5 py-0.5 bg-amber-950/60 text-amber-400 border border-amber-800/30 rounded-lg text-[10px] font-bold">⏳ قيد المراجعة</span>';
                                    if (s.status === 'accepted') statusBadge = '<span class="px-2.5 py-0.5 bg-emerald-950/60 text-emerald-400 border border-emerald-800/30 rounded-lg text-[10px] font-bold">✅ مقبول</span>';
                                    if (s.status === 'implemented') statusBadge = '<span class="px-2.5 py-0.5 bg-indigo-950/60 text-indigo-400 border border-indigo-800/30 rounded-lg text-[10px] font-bold">🚀 تم التنفيذ</span>';
                                    if (s.status === 'rejected') statusBadge = '<span class="px-2.5 py-0.5 bg-rose-950/60 text-rose-400 border border-rose-800/30 rounded-lg text-[10px] font-bold">❌ مرفوض</span>';

                                    return '<div class="bg-[#0b0d14] border border-white/5 p-5 rounded-2xl space-y-3 hover:border-purple-500/40 transition text-right">' +
                                        '<div class="flex items-center justify-between border-b border-white/5 pb-2">' +
                                            '<div class="flex items-center gap-2">' +
                                                '<button type="button" onclick="updateSuggestionStatus(' + s.id + ', &quot;accepted&quot;)" class="px-2.5 py-1 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/40 rounded-lg text-[10px] font-bold transition">قبول ✅</button>' +
                                                '<button type="button" onclick="updateSuggestionStatus(' + s.id + ', &quot;rejected&quot;)" class="px-2.5 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 rounded-lg text-[10px] font-bold transition">رفض ❌</button>' +
                                                '<button type="button" onclick="updateSuggestionStatus(' + s.id + ', &quot;implemented&quot;)" class="px-2.5 py-1 bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-400 border border-indigo-800/40 rounded-lg text-[10px] font-bold transition">تنفيذ 🚀</button>' +
                                            '</div>' +
                                            '<div class="flex items-center gap-2">' +
                                                statusBadge +
                                                '<span class="text-xs font-bold text-white font-mono">#' + s.id + '</span>' +
                                            '</div>' +
                                        '</div>' +
                                        '<div>' +
                                            (s.title ? '<h5 class="text-sm font-bold text-white mb-1">' + s.title + '</h5>' : '') +
                                            '<p class="text-xs text-gray-300 leading-relaxed">' + s.content + '</p>' +
                                        '</div>' +
                                        (s.status_reason ? '<div class="bg-[#12141f] p-3 rounded-xl border border-white/5 text-[11px] text-gray-400"><span class="text-white font-bold">رد الإدارة: </span>' + s.status_reason + '</div>' : '') +
                                        '<div class="flex items-center justify-between text-[11px] text-gray-500 pt-2 border-t border-white/5">' +
                                            '<div class="flex items-center gap-3">' +
                                                '<span class="text-emerald-400 font-mono font-bold">👍 ' + upCount + '</span>' +
                                                '<span class="text-rose-400 font-mono font-bold">👎 ' + downCount + '</span>' +
                                            '</div>' +
                                            '<div class="flex items-center gap-2">' +
                                                '<span>صاحب الاقتراح: <span class="font-mono text-purple-300">' + s.user_id + '</span></span>' +
                                                '<span>•</span>' +
                                                '<span>' + (s.category || 'عام') + '</span>' +
                                            '</div>' +
                                        '</div>' +
                                    '</div>';
                                }).join('') : `
                                    <div class="py-14 text-center space-y-4">
                                        <div class="w-16 h-16 rounded-2xl bg-purple-950/30 text-purple-400 flex items-center justify-center text-3xl mx-auto border border-purple-500/20 shadow-inner">
                                            💡
                                        </div>
                                        <div class="space-y-1">
                                            <h5 class="text-sm font-black text-white">لا توجد اقتراحات بعد</h5>
                                            <p class="text-xs text-gray-400">كن أول من يقترح فكرة لتطوير وتحسين السيرفر!</p>
                                        </div>
                                        <button type="button" onclick="openCreateSuggestionModal()" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-2 shadow-lg shadow-purple-950/40">
                                            <span>إضافة اقتراح</span>
                                        </button>
                                    </div>
                                `}
                            </div>
                        </div>

                        <!-- 5. نافذة إضافة اقتراح منبثقة (Create Suggestion Modal) -->
                        <div id="createSuggestionModal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
                            <div class="bg-[#12141f] border border-white/10 rounded-3xl w-full max-w-lg p-6 space-y-5 text-right shadow-2xl" dir="rtl">
                                <div class="flex items-center justify-between border-b border-white/5 pb-4">
                                    <button type="button" onclick="closeCreateSuggestionModal()" class="text-gray-400 hover:text-white text-lg font-bold">✕</button>
                                    <h3 class="text-base font-black text-white">تقديم اقتراح جديد 💡</h3>
                                </div>

                                <div class="space-y-3">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1.5">عنوان الفكرة (اختياري)</label>
                                        <input type="text" id="sgTitle" placeholder="اكتب عنواناً مختصراً..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                    </div>

                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1.5">تصنيف الاقتراح</label>
                                        <select id="sgCategory" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right cursor-pointer">
                                            <option value="عام">💡 اقتراح عام</option>
                                            <option value="فعاليات">🎉 فعاليات ومسابقات</option>
                                            <option value="رتب">🎖️ رتب وأدوار</option>
                                            <option value="رومات">💬 قنوات ورومات صوتية</option>
                                            <option value="بوت">🤖 ميزات البوت</option>
                                            <option value="شكوى">⚠️ شكوى أو بلاغ</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1.5">تفاصيل الاقتراح <span class="text-purple-400">*</span></label>
                                        <textarea id="sgContent" rows="4" placeholder="اشرح فكرتك بالتفصيل وكيف ستفيد السيرفر..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl p-3 text-xs text-white outline-none text-right leading-relaxed"></textarea>
                                    </div>
                                </div>

                                <div class="flex items-center justify-between pt-4 border-t border-white/5 flex-row-reverse">
                                    <button type="button" onclick="submitCreateSuggestion()" class="px-8 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-purple-950/40">
                                        إرسال الاقتراح
                                    </button>
                                    <button type="button" onclick="closeCreateSuggestionModal()" class="px-6 py-2.5 bg-[#0b0d14] hover:bg-white/5 border border-white/5 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition">
                                        إلغاء
                                    </button>
                                </div>
                            </div>
                        </div>

                    </div>

                    <script>
                    function openCreateSuggestionModal() {
                        document.getElementById('createSuggestionModal').classList.remove('hidden');
                    }

                    function closeCreateSuggestionModal() {
                        document.getElementById('createSuggestionModal').classList.add('hidden');
                    }

                    async function submitCreateSuggestion() {
                        const title = document.getElementById('sgTitle').value.trim();
                        const category = document.getElementById('sgCategory').value;
                        const content = document.getElementById('sgContent').value.trim();

                        if (!content) { alert('يرجى كتابة تفاصيل الاقتراح'); return; }

                        try {
                            const res = await fetch('/api/guild/${guildId}/suggestions', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ title, category, content })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم إرسال الاقتراح بنجاح ونشره في السيرفر!');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (data.error || 'فشل إرسال الاقتراح'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
                    }

                    async function updateSuggestionStatus(id, status) {
                        const reason = prompt('أدخل سبب أو رد الإدارة على هذا القرار (اختياري):');
                        try {
                            const res = await fetch('/api/guild/${guildId}/suggestions/' + id + '/status', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status, reason })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم تحديث حالة الاقتراح بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ فشل تحديث الحالة');
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
                    }

                    function filterSuggTab(status) {
                        // Switch active class
                        ['all', 'pending', 'accepted', 'rejected'].forEach(s => {
                            const btn = document.getElementById('btnSg' + s.charAt(0).toUpperCase() + s.slice(1));
                            if (btn) {
                                btn.className = s === status 
                                    ? "px-3 py-1 rounded-lg bg-purple-600 text-white transition shadow"
                                    : "px-3 py-1 rounded-lg text-gray-400 hover:text-white transition";
                            }
                        });
                        location.href = '/dashboard/${guildId}/suggestions?status=' + (status === 'all' ? '' : status);
                    }
                    </script>
`;
            } else if (section === 'antiraid') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <label class="toggle"><input type="checkbox" name="antiraid_enabled" value="1" ${settings.antiraid_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">مكافحة الغزو والأعضاء الوهميين (Anti-Raid)</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">حماية السيرفر من هجمات الدخول الجماعي والحسابات الجديدة الوهمية</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-red-600/20 text-red-400 flex items-center justify-center text-lg border border-red-500/30">🚨</div>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${settings.anti_alt_days || 3}</span>
                                <span class="text-xs font-bold text-gray-400 block">أيام عمر الحساب الأدنى</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-emerald-400 font-mono">${settings.raid_threshold || 5}</span>
                                <span class="text-xs font-bold text-gray-400 block">حد الدخول في 10 ثوانٍ</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-amber-400 font-mono">${settings.anti_bot ? 'مفعل 🟢' : 'معطل 🔴'}</span>
                                <span class="text-xs font-bold text-gray-400 block">حظر البوتات غير الموثقة</span>
                            </div>
                        </div>

                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <h4 class="text-xs font-black text-white border-b border-white/5 pb-3">إعدادات الحماية المتقدمة</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الحد الأدنى لعمر الحساب لدخول السيرفر (بالأيام)</label>
                                    <input type="number" name="anti_alt_days" value="${settings.anti_alt_days || 3}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">حد الدخول الجماعي المشبوه (أعضاء / 10 ثوانٍ)</label>
                                    <input type="number" name="raid_threshold" value="${settings.raid_threshold || 5}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                <div class="flex items-center justify-between p-3.5 bg-[#0b0d14] border border-white/5 rounded-xl">
                                    <label class="toggle"><input type="checkbox" name="anti_bot" value="1" ${settings.anti_bot ? 'checked' : ''}><span class="slider"></span></label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">طرد البوتات التلقائي (Anti-Bot)</h5>
                                        <p class="text-[10px] text-gray-500">منع إضافة أي بوتات إلا من قبل الأونر</p>
                                    </div>
                                </div>
                                <div class="flex items-center justify-between p-3.5 bg-[#0b0d14] border border-white/5 rounded-xl">
                                    <label class="toggle"><input type="checkbox" name="antiraid_dm_notify" value="1" ${settings.antiraid_dm_notify !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">إرسال سبب الطرد في الخاص</h5>
                                        <p class="text-[10px] text-gray-500">إشعار الحسابات المطرودة بسبب صغر السن بالخاص</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>`;
            } else if (section === 'tempvoice') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <label class="toggle"><input type="checkbox" name="temp_voice_enabled" value="1" ${settings.temp_voice_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">نظام الرومات الصوتية المؤقتة (Temporary Voice)</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">إنشاء غرف صوتية خاصة تلقائياً وحذفها عند خروج الأعضاء</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30">🕒</div>
                            </div>
                        </div>

                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <h4 class="text-xs font-black text-white border-b border-white/5 pb-3">إعدادات الروم الرئيسي والكاتيجوري</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">روم الدخول الرئيسي (Join-to-Create Channel)</label>
                                    <input type="text" name="temp_voice_channel" value="${settings.temp_voice_channel || ''}" placeholder="أيدي الروم الصوتي الرئيسي..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قسم الرومات (Category ID)</label>
                                    <input type="text" name="temp_voice_category" value="${settings.temp_voice_category || ''}" placeholder="أيدي الكاتيجوري الذي ستنشأ تحته..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الاسم الافتراضي للروم المنشأ</label>
                                    <input type="text" name="temp_voice_name_template" value="${settings.temp_voice_name_template || '🔊 | {username}'}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-mono">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الحد الأقصى للمستخدمين الافتراضي</label>
                                    <input type="number" name="temp_voice_user_limit" value="${settings.temp_voice_user_limit || 0}" placeholder="0 = غير محدود" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                            </div>
                        </div>
                    </div>`;
            } else if (section === 'colors') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <label class="toggle"><input type="checkbox" name="colors_enabled" value="1" ${settings.colors_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">نظام رتب الألوان المتقدم (Color Roles)</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">لوحة وقوائم تفاعلية لتمكين الأعضاء من اختيار ألوانهم المفضلة</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-pink-600/20 text-pink-400 flex items-center justify-center text-lg border border-pink-500/30">🎨</div>
                            </div>
                        </div>

                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <h4 class="text-xs font-black text-white border-b border-white/5 pb-3">إعدادات نشر لوحة الألوان</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة لوحة الألوان</label>
                                    ${renderChannelSelect('color_picker_channel', settings.color_picker_channel || '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الرتبة المطلوبة لاختيار الألوان (اختياري)</label>
                                    ${renderRoleSelect('colors_required_role', settings.colors_required_role || '')}
                                </div>
                            </div>
                            <div class="pt-2">
                                <label class="block text-xs font-bold text-gray-300 mb-2">رتب الألوان المتاحة (Role IDs مفصولة بفواصل)</label>
                                <textarea name="color_role_ids" rows="3" placeholder="أيدي_رتبة_1, أيدي_رتبة_2, أيدي_رتبة_3..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl p-3 text-xs text-white outline-none font-mono text-right leading-relaxed">${settings.color_role_ids || ''}</textarea>
                            </div>
                        </div>
                    </div>`;
            } else if (section === 'boost') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <label class="toggle"><input type="checkbox" name="boost_msg_enabled" value="1" ${settings.boost_msg_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">نظام تنبيهات ومعلومات البوست (Server Boost)</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">تنبيهات تلقائية في الشات وشكر البوسترز وتوزيع الرتب والمميزات</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-pink-600/20 text-pink-400 flex items-center justify-center text-lg border border-pink-500/30">💎</div>
                            </div>
                        </div>

                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <h4 class="text-xs font-black text-white border-b border-white/5 pb-3">إعدادات رسالة البوست</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة تنبيهات البوست</label>
                                    ${renderChannelSelect('boost_channel', settings.boost_channel || '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">رتبة مكافأة البوستر التلقائية</label>
                                    ${renderRoleSelect('booster_reward_role', settings.booster_reward_role || '')}
                                </div>
                            </div>
                            <div class="pt-2">
                                <label class="block text-xs font-bold text-gray-300 mb-2">نص رسالة البوست (يدعم {user} و {count})</label>
                                <textarea name="boost_message" rows="3" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl p-3 text-xs text-white outline-none text-right leading-relaxed">${settings.boost_message || 'شكراً لك {user} على تعزيز السيرفر 💎! أصبح عدد البوستات الآن {count} بوست!'}</textarea>
                            </div>
                        </div>
                    </div>`;
            } else if (section === 'logs') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <label class="toggle"><input type="checkbox" name="logs_enabled" value="1" ${settings.logs_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">سجلات السيرفر الشاملة (Server Audit Logs)</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">تسجيل فوري ودقيق لجميع الأحداث مع الفاعل والتفاصيل</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center text-lg border border-amber-500/30">📜</div>
                            </div>
                        </div>

                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <h4 class="text-xs font-black text-white border-b border-white/5 pb-3">قنوات السجلات المتخصصة</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">سجلات الرسائل (حذف وتعديل)</label>
                                    ${renderChannelSelect('log_channel_messages', settings.log_channel_messages || settings.log_channel || '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">سجلات الأعضاء (انضمام ومغادرة)</label>
                                    ${renderChannelSelect('log_channel_members', settings.log_channel_members || settings.log_channel || '')}
                                </div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">سجلات الرومات الصوتية (دخول وخروج)</label>
                                    ${renderChannelSelect('log_channel_voice', settings.log_channel_voice || settings.log_channel || '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">سجلات الإدارة والعقوبات (Mod Logs)</label>
                                    ${renderChannelSelect('log_channel_moderation', settings.log_channel_moderation || settings.log_channel || '')}
                                </div>
                            </div>
                        </div>
                    </div>`;
            } else if (section === 'analytics' || section === 'stats') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">الإحصائيات والتحليلات وعدادات الرومات</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">متابعة نمو السيرفر وربط عدادات الأعضاء الديناميكية في القنوات الصوتية</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center text-lg border border-blue-500/30">📊</div>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${guild.memberCount || 0}</span>
                                <span class="text-xs font-bold text-gray-400 block">إجمالي الأعضاء</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-emerald-400 font-mono">${(guildTextChannels || []).length}</span>
                                <span class="text-xs font-bold text-gray-400 block">قناة نصية</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-purple-400 font-mono">${(guildRoles || []).length}</span>
                                <span class="text-xs font-bold text-gray-400 block">رتبة مسجلة</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-amber-400 font-mono">${(guildSuggestionsList || []).length}</span>
                                <span class="text-xs font-bold text-gray-400 block">اقتراح مسجل</span>
                            </div>
                        </div>

                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <h4 class="text-xs font-black text-white border-b border-white/5 pb-3">ربط عدادات الأعضاء في القنوات الصوتية (Voice Counters)</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">أيدي روم عداد الأعضاء (Members Voice ID)</label>
                                    <input type="text" name="stat_members_channel" value="${settings.stat_members_channel || ''}" placeholder="أيدي الروم الصوتي..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">أيدي روم عداد البوتات (Bots Voice ID)</label>
                                    <input type="text" name="stat_bots_channel" value="${settings.stat_bots_channel || ''}" placeholder="أيدي الروم الصوتي..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                            </div>
                        </div>
                    </div>`;
            } else if (section === 'appearance') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">
                        
                        <!-- Header Banner -->
                        <div class="bg-gradient-to-r from-[#141724] via-[#1c1f2e] to-[#141724] border border-white/5 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-2xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center text-xl shadow-lg">⭐</div>
                                <div class="text-right">
                                    <h3 class="font-black text-white text-lg">تخصيص البوت</h3>
                                    <p class="text-gray-400 text-xs mt-0.5">غير اسم البوت وصورته وبنره لكل سيرفر</p>
                                </div>
                            </div>
                            <!-- Server selector pill (Exact to image) -->
                            <div class="bg-[#0b0d14] border border-white/5 px-4 py-2 rounded-2xl flex items-center gap-2.5 shadow-inner">
                                <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                                <span class="text-xs font-bold text-white">${guild.name || "ZENO'BOT"}</span>
                                <div class="w-6 h-6 rounded-lg bg-purple-950/60 text-purple-300 text-xs font-black flex items-center justify-center border border-purple-500/30">Z</div>
                            </div>
                        </div>

                        <!-- Live Preview Card (Exact to Image 1 & 2) -->
                        <div class="bg-[#12141f] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                            <!-- Banner area -->
                            <div id="prevBannerBox" class="h-32 bg-cover bg-center relative transition-all flex items-center justify-center" style="background-image: url('${settings.bot_banner || ''}'); background-color: #1c1f2e;">
                                ${!settings.bot_banner ? `
                                    <div class="text-center">
                                        <h2 class="text-2xl font-black text-amber-100 tracking-wider shadow-sm">Best System Bot</h2>
                                        <p class="text-xs text-amber-200/80 font-mono mt-0.5">discord.gg/zeno</p>
                                    </div>
                                ` : ''}
                                <!-- Avatar Overlap -->
                                <div class="absolute -bottom-6 right-8 flex items-center gap-3">
                                    <div class="relative group">
                                        <img id="prevAvatarImg" src="${settings.bot_avatar || (botGuild?.members?.me?.user?.displayAvatarURL() || userAvatar)}" class="w-16 h-16 rounded-2xl bg-[#0b0d14] object-cover ring-4 ring-[#12141f] shadow-xl">
                                        <span class="w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-[#12141f] absolute -bottom-0.5 -right-0.5"></span>
                                    </div>
                                </div>
                            </div>
                            <div class="pt-8 pb-5 px-8 flex items-center justify-between">
                                <div class="text-left">
                                    <span class="text-[10px] text-gray-500 font-mono">ID: ${client?.user?.id || 'BOT_ID'}</span>
                                </div>
                                <div class="text-right">
                                    <h4 id="prevNickText" class="font-black text-white text-base">${settings.bot_nickname || client?.user?.username || 'ZENO'}</h4>
                                    <span class="text-[11px] text-gray-400 font-mono">@${client?.user?.username || 'zeno'}</span>
                                </div>
                            </div>
                        </div>

                        <!-- 1. اسم البوت في السيرفر (Bot Nickname) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-3 shadow-xl">
                            <div class="flex items-center justify-between">
                                <div class="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-sm border border-purple-500/30">✏️</div>
                                <div class="text-right">
                                    <h4 class="font-black text-white text-sm">اسم البوت في السيرفر</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">تغيير اسم البوت المعروض في هذا السيرفر فقط</p>
                                </div>
                            </div>
                            <input type="text" name="bot_nickname" id="inpBotNick" value="${settings.bot_nickname || ''}" placeholder="${client?.user?.username || 'ZENO'}" oninput="document.getElementById('prevNickText').innerText = this.value || '${client?.user?.username || 'ZENO'}'" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-2xl px-5 py-3.5 text-xs text-white outline-none text-right font-bold transition">
                        </div>

                        <!-- 2. وصف البوت في السيرفر (About Me) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-3 shadow-xl">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <span id="aboutCount" class="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-lg">${(settings.bot_about || '').length}/190</span>
                                    <div class="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-sm border border-purple-500/30">💬</div>
                                </div>
                                <div class="text-right">
                                    <h4 class="font-black text-white text-sm">وصف البوت في السيرفر</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">تغيير وصف البوت (About Me) المعروض في هذا السيرفر فقط</p>
                                </div>
                            </div>
                            <textarea name="bot_about" id="inpBotAbout" rows="3" maxlength="190" placeholder="اكتب وصفاً للبوت في هذا السيرفر..." oninput="document.getElementById('aboutCount').innerText = this.value.length + '/190'" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-2xl px-5 py-3.5 text-xs text-white outline-none text-right leading-relaxed transition">${settings.bot_about || ''}</textarea>
                        </div>

                        <!-- 3. صورة وبنر البوت في السيرفر (Avatar & Banner 2-Grid) -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            
                            <!-- صورة البوت في السيرفر -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl text-right">
                                <div class="flex items-center justify-between">
                                    <div class="w-8 h-8 rounded-xl bg-rose-600/20 text-rose-400 flex items-center justify-center text-sm border border-rose-500/30">🎯</div>
                                    <div>
                                        <h4 class="font-black text-white text-sm">صورة البوت في السيرفر</h4>
                                        <p class="text-gray-400 text-[11px] mt-0.5">تغيير صورة البوت المعروضة في هذا السيرفر فقط (Per-Server Avatar)</p>
                                    </div>
                                </div>

                                <div class="flex items-center justify-between p-4 bg-[#0b0d14] border border-white/5 rounded-2xl">
                                    <button type="button" onclick="document.getElementById('inpAvatarUrl').focus()" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5">
                                        <span>🖼️</span>
                                        <span>اختر صورة</span>
                                    </button>
                                    <div class="flex items-center gap-3">
                                        <span class="text-[11px] text-gray-400">اضغط أو الصق رابط صورة جديدة</span>
                                        <img id="cardAvatarPreview" src="${settings.bot_avatar || (botGuild?.members?.me?.user?.displayAvatarURL() || userAvatar)}" class="w-10 h-10 rounded-xl object-cover ring-2 ring-purple-600/50">
                                    </div>
                                </div>
                                <input type="url" name="bot_avatar" id="inpAvatarUrl" value="${settings.bot_avatar || ''}" placeholder="https://i.imgur.com/... (رابط الصورة المباشر)" oninput="updateAvatarPreview(this.value)" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-left font-mono">
                            </div>

                            <!-- بنر البوت في السيرفر -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl text-right">
                                <div class="flex items-center justify-between">
                                    <div class="w-8 h-8 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center text-sm border border-amber-500/30">🖼️</div>
                                    <div>
                                        <h4 class="font-black text-white text-sm">بنر البوت في السيرفر</h4>
                                        <p class="text-gray-400 text-[11px] mt-0.5">تغيير بنر البوت المعروض في هذا السيرفر فقط (Per-Server Banner)</p>
                                    </div>
                                </div>

                                <div class="flex items-center justify-between p-4 bg-[#0b0d14] border border-white/5 rounded-2xl">
                                    <button type="button" onclick="document.getElementById('inpBannerUrl').focus()" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5">
                                        <span>🖼️</span>
                                        <span>اختر بنر</span>
                                    </button>
                                    <span class="text-[11px] text-gray-400">الصق رابط صورة البنر المباشر</span>
                                </div>
                                <input type="url" name="bot_banner" id="inpBannerUrl" value="${settings.bot_banner || ''}" placeholder="https://i.imgur.com/... (رابط البنر المباشر)" oninput="updateBannerPreview(this.value)" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-left font-mono">
                            </div>

                        </div>

                        <!-- Important Notes Alert (Exact to Image 2) -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-3xl space-y-2 text-right shadow-lg">
                            <div class="flex items-center justify-end gap-2 text-amber-400 font-bold text-xs">
                                <span>ملاحظات مهمة</span>
                                <span>💬</span>
                            </div>
                            <ul class="text-[11px] text-gray-400 space-y-1 pr-2 list-none">
                                <li>• تغيير الاسم والصورة والبنر يؤثر فقط على السيرفر المحدد.</li>
                                <li>• قد يستغرق ظهور التغييرات بضع ثوانٍ في ديسكورد فور الضغط على حفظ.</li>
                                <li>• الصور يجب أن تكون بروابط مباشرة بصيغة PNG أو JPG أو WEBP أو GIF.</li>
                            </ul>
                        </div>

                    </div>

                    <script>
                    function updateAvatarPreview(url) {
                        if (url) {
                            document.getElementById('prevAvatarImg').src = url;
                            document.getElementById('cardAvatarPreview').src = url;
                        }
                    }
                    function updateBannerPreview(url) {
                        const box = document.getElementById('prevBannerBox');
                        if (url) {
                            box.style.backgroundImage = 'url(' + url + ')';
                        }
                    }
                    </script>`;
            } else if (section === 'settings') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">
                        
                        <!-- Top Header Title -->
                        <div class="bg-gradient-to-r from-[#141724] via-[#1c1f2e] to-[#141724] border border-white/5 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-2xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center text-xl shadow-lg">⚙️</div>
                                <div class="text-right">
                                    <h3 class="font-black text-white text-lg">الإعدادات العامة</h3>
                                    <p class="text-gray-400 text-xs mt-0.5">إعدادات البوت لسيرفر ${guild.name || "ZENO'BOT"}</p>
                                </div>
                            </div>
                            <div class="bg-[#0b0d14] border border-white/5 px-4 py-2 rounded-2xl flex items-center gap-2.5 shadow-inner">
                                <span class="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
                                <span class="text-xs font-bold text-white">${guild.name || "ZENO'BOT"}</span>
                                <div class="w-6 h-6 rounded-lg bg-purple-950/60 text-purple-300 text-xs font-black flex items-center justify-center border border-purple-500/30">Z</div>
                            </div>
                        </div>

                        <!-- Top 2-Grid: البادئة (Prefix) & لغة البوت (Bot Language) - Exact to Image -->
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            
                            <!-- 1. البادئة (Prefix) Card -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl flex flex-col justify-between shadow-xl">
                                <div>
                                    <div class="flex items-center justify-between mb-4">
                                        <span class="text-[10px] text-gray-500">Command Prefix</span>
                                        <h4 class="font-black text-white text-sm">البادئة (Prefix)</h4>
                                    </div>
                                    <input type="text" name="prefix" id="inpPrefix" value="${settings.prefix || '!'}" placeholder="!" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-2xl px-6 py-4 text-center text-xl text-white font-mono font-black outline-none shadow-inner transition">
                                </div>
                                <p class="text-[11px] text-gray-500 text-right mt-4">الرمز المستخدم قبل الأوامر النصية</p>
                            </div>

                            <!-- 2. لغة البوت (Bot Language) Card with Flag Grid - Exact to Image -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl shadow-xl space-y-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-[10px] text-purple-400 font-bold bg-purple-950/60 px-2 py-0.5 rounded-lg font-mono">LANG</span>
                                    <h4 class="font-black text-white text-sm">لغة البوت</h4>
                                </div>

                                <input type="hidden" name="bot_language" id="inpHiddenLang" value="${settings.bot_language || 'AR'}">

                                <div class="grid grid-cols-3 gap-2.5 text-center">
                                    <!-- IQ / AR -->
                                    <button type="button" onclick="selectBotLanguage('AR', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${(settings.bot_language || 'AR') === 'AR' ? 'bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10'}">
                                        <span class="text-xs font-black">IQ</span>
                                        <span class="text-[10px] font-bold text-gray-400">AR</span>
                                    </button>

                                    <!-- US / EN -->
                                    <button type="button" onclick="selectBotLanguage('EN', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'EN' ? 'bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10'}">
                                        <span class="text-xs font-black">US</span>
                                        <span class="text-[10px] font-bold text-gray-400">EN</span>
                                    </button>

                                    <!-- TR -->
                                    <button type="button" onclick="selectBotLanguage('TR', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'TR' ? 'bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10'}">
                                        <span class="text-xs font-black">TR</span>
                                        <span class="text-[10px] font-bold text-gray-400">TR</span>
                                    </button>

                                    <!-- RU -->
                                    <button type="button" onclick="selectBotLanguage('RU', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'RU' ? 'bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10'}">
                                        <span class="text-xs font-black">RU</span>
                                        <span class="text-[10px] font-bold text-gray-400">RU</span>
                                    </button>

                                    <!-- ES -->
                                    <button type="button" onclick="selectBotLanguage('ES', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'ES' ? 'bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10'}">
                                        <span class="text-xs font-black">ES</span>
                                        <span class="text-[10px] font-bold text-gray-400">ES</span>
                                    </button>

                                    <!-- FR -->
                                    <button type="button" onclick="selectBotLanguage('FR', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'FR' ? 'bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10'}">
                                        <span class="text-xs font-black">FR</span>
                                        <span class="text-[10px] font-bold text-gray-400">FR</span>
                                    </button>

                                    <!-- DE -->
                                    <button type="button" onclick="selectBotLanguage('DE', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'DE' ? 'bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10'}">
                                        <span class="text-xs font-black">DE</span>
                                        <span class="text-[10px] font-bold text-gray-400">DE</span>
                                    </button>

                                    <!-- BR / PT -->
                                    <button type="button" onclick="selectBotLanguage('PT', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'PT' ? 'bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10'}">
                                        <span class="text-xs font-black">BR</span>
                                        <span class="text-[10px] font-bold text-gray-400">PT</span>
                                    </button>

                                    <!-- JP / JA -->
                                    <button type="button" onclick="selectBotLanguage('JA', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'JA' ? 'bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10'}">
                                        <span class="text-xs font-black">JP</span>
                                        <span class="text-[10px] font-bold text-gray-400">JA</span>
                                    </button>
                                </div>
                            </div>

                        </div>

                        <!-- 3. تصفير سجلات العقوبات التلقائي (Auto-Clear Infractions) - Exact to Image -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-5 shadow-xl">
                            
                            <!-- Master Header & Switch -->
                            <div class="flex items-center justify-between border-b border-white/5 pb-4">
                                <label class="toggle">
                                    <input type="checkbox" name="auto_clear_punishments" value="1" ${settings.auto_clear_punishments ? 'checked' : ''} onchange="document.getElementById('autoClearContent').classList.toggle('opacity-40', !this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">تصفير سجلات العقوبات التلقائي</h4>
                                        <p class="text-gray-400 text-xs mt-0.5">حذف دوري لسجلات العقوبات المنتهية / المزالة – العقوبات النشطة لا تتأثر إطلاقاً.</p>
                                    </div>
                                    <div class="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-sm border border-purple-500/30">⏱️</div>
                                </div>
                            </div>

                            <div id="autoClearContent" class="space-y-4 ${settings.auto_clear_punishments ? '' : 'opacity-40'} transition-opacity">
                                <!-- فترة التصفير (Clear Period Buttons) -->
                                <div>
                                    <span class="block text-xs font-bold text-gray-400 mb-2.5 text-right">فترة التصفير</span>
                                    <input type="hidden" name="auto_clear_period" id="inpClearPeriod" value="${settings.auto_clear_period || 'week'}">
                                    
                                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <button type="button" onclick="selectClearPeriod('week', this)" class="period-btn py-3 px-4 rounded-2xl border text-xs font-bold transition ${(settings.auto_clear_period || 'week') === 'week' ? 'bg-purple-900/40 border-purple-500 text-white shadow-md' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white'}">
                                            كل أسبوع
                                        </button>
                                        <button type="button" onclick="selectClearPeriod('2weeks', this)" class="period-btn py-3 px-4 rounded-2xl border text-xs font-bold transition ${settings.auto_clear_period === '2weeks' ? 'bg-purple-900/40 border-purple-500 text-white shadow-md' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white'}">
                                            كل أسبوعين
                                        </button>
                                        <button type="button" onclick="selectClearPeriod('3weeks', this)" class="period-btn py-3 px-4 rounded-2xl border text-xs font-bold transition ${settings.auto_clear_period === '3weeks' ? 'bg-purple-900/40 border-purple-500 text-white shadow-md' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white'}">
                                            كل 3 أسابيع
                                        </button>
                                        <button type="button" onclick="selectClearPeriod('month', this)" class="period-btn py-3 px-4 rounded-2xl border text-xs font-bold transition ${settings.auto_clear_period === 'month' ? 'bg-purple-900/40 border-purple-500 text-white shadow-md' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white'}">
                                            كل شهر
                                        </button>
                                    </div>
                                </div>

                                <!-- أنواع العقوبات المشمولة (Punishment Types Pills) -->
                                <div>
                                    <span class="block text-xs font-bold text-gray-400 mb-2.5 text-right">أنواع العقوبات المشمولة</span>
                                    <div class="flex flex-wrap items-center gap-2 justify-end">
                                        <span class="px-3 py-1.5 rounded-xl bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-bold">كل الأنواع</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">حظر</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">حظر مؤقت</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">ميوت</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">ميوت صوتي</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">سجن</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">تحذير</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">طرد</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">داون</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">بلوك</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">بلاك لست</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">تايم اوت</span>
                                    </div>
                                </div>
                            </div>

                        </div>

                        <!-- 4. منطقة الخطر (Danger Zone) - Exact to Image -->
                        <div class="bg-rose-950/20 border border-rose-500/30 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
                            <button type="button" onclick="confirmResetGuildData()" class="px-6 py-3 bg-gradient-to-r from-rose-700 to-red-600 hover:from-rose-600 hover:to-red-500 text-white rounded-2xl text-xs font-black transition shadow-lg flex items-center gap-2 shrink-0">
                                <span>⚠️</span>
                                <span>تصفير قاعدة بيانات السيرفر</span>
                            </button>
                            <div class="text-right space-y-1">
                                <div class="flex items-center justify-end gap-2 text-rose-400 font-black text-sm">
                                    <span>منطقة الخطر</span>
                                    <span>🚫</span>
                                </div>
                                <p class="text-[11px] text-rose-300/80 leading-relaxed">
                                    أونر السيرفر حصراً. يمسح كل بيانات البوت لهذا السيرفر نهائياً – الإعدادات، الحماية، سجل العقوبات، كل شيء (عدا التوب الكتابي/الصوتي والدعوات، تُدار منفصلة عبر أمر reset).
                                </p>
                            </div>
                        </div>

                    </div>

                    <script>
                    function selectBotLanguage(lang, btn) {
                        document.getElementById('inpHiddenLang').value = lang;
                        document.querySelectorAll('.lang-btn').forEach(b => {
                            b.className = 'lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10';
                        });
                        btn.className = 'lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50';
                    }

                    function selectClearPeriod(period, btn) {
                        document.getElementById('inpClearPeriod').value = period;
                        document.querySelectorAll('.period-btn').forEach(b => {
                            b.className = 'period-btn py-3 px-4 rounded-2xl border text-xs font-bold transition bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white';
                        });
                        btn.className = 'period-btn py-3 px-4 rounded-2xl border text-xs font-bold transition bg-purple-900/40 border-purple-500 text-white shadow-md';
                    }

                    async function confirmResetGuildData() {
                        if (!confirm('⚠️ تحذير شديد الخطورة:\\nهل أنت متأكد تماماً من تصفير كافة إعدادات وسجلات وحماية هذا السيرفر؟\\nلا يمكن التراجع عن هذا الإجراء!')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/reset-data', { method: 'POST' });
                            const d = await res.json();
                            if (d.success) {
                                alert('✅ تم تصفير بيانات وإعدادات السيرفر بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ فشل التصفير: ' + (d.error || 'حدث خطأ'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
                    }
                    </script>`;
            } else if (section === 'embed') {
                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <div class="bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl flex items-center justify-between">
                            <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                            <div>
                                <h3 class="font-black text-white text-xl flex items-center gap-2 justify-end"><span>صانع رسائل الإيمبد المتقدم</span><span>📄</span></h3>
                                <p class="text-gray-400 text-xs mt-1">صمم وأرسل رسائل إيمبد منسقة واحترافية مباشرة إلى أي قناة في سيرفرك</p>
                            </div>
                        </div>

                        <div id="embBuilderCard" class="bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl space-y-4">
                            <h4 class="font-bold text-white text-sm border-b border-white/5 pb-3 flex items-center gap-2 justify-end">
                                <span>محرر رسائل الإيمبد التفاعلي (Interactive Embed Builder)</span>
                                <span>📄</span>
                            </h4>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">القناة المستهدفة <span class="text-purple-400">*</span></label>
                                    ${renderChannelSelect('embedChannel', '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">لون الإيمبد</label>
                                    <input type="color" id="embColor" value="#9333ea" oninput="updateEmbedPreview()" class="w-full h-11 bg-[#0b0d14] border border-white/5 rounded-xl cursor-pointer p-1">
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">اسم الكاتب (Author Name)</label>
                                    <input type="text" id="embAuthor" placeholder="مثال: ZENO Announcement" oninput="updateEmbedPreview()" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">عنوان الإيمبد (Title)</label>
                                    <input type="text" id="embTitle" placeholder="عنوان الرسالة الرئيسي..." oninput="updateEmbedPreview()" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-bold">
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2">محتوى ونص الإيمبد (Description) <span class="text-purple-400">*</span></label>
                                <textarea id="embDesc" rows="4" placeholder="اكتب محتوى الرسالة وتنسيقها هنا..." oninput="updateEmbedPreview()" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right leading-relaxed"></textarea>
                            </div>

                            <div class="pt-4 flex justify-end">
                                <button type="button" onclick="sendEmbedDirect()" id="btnSendEmbed" class="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2">
                                    <span>🚀 إرسال الإيمبد إلى ديسكورد الآن</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <script>
                    async function sendEmbedDirect() {
                        const channelId = document.getElementById('embedChannel').value;
                        const title = document.getElementById('embTitle').value.trim();
                        const desc = document.getElementById('embDesc').value.trim();
                        const author = document.getElementById('embAuthor').value.trim();
                        const color = document.getElementById('embColor').value;

                        if (!channelId) return alert('يرجى اختيار القناة المستهدفة أولاً!');
                        if (!desc && !title) return alert('يرجى كتابة عنوان أو محتوى للرسالة!');

                        const btn = document.getElementById('btnSendEmbed');
                        btn.disabled = true;
                        btn.innerHTML = '⏳ جارٍ الإرسال...';

                        try {
                            const res = await fetch('/api/guild/${guildId}/send-embed', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ channelId, title, desc, author, color })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم إرسال الإيمبد بنجاح في القناة!');
                            } else {
                                alert('❌ خطأ: ' + (data.error || 'فشل الإرسال'));
                            }
                        } catch(e) {
                            alert('حدث خطأ أثناء الاتصال بالخادم');
                        } finally {
                            btn.disabled = false;
                            btn.innerHTML = '<span>🚀 إرسال الإيمبد إلى ديسكورد الآن</span>';
                        }
                    }
                    </script>
                `;
            } else {
                formFieldsHtml = `
                    <div class="space-y-5 text-right" dir="rtl">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2">برفكس الأوامر (Prefix)</label>
                                <input type="text" name="prefix" value="${settings.prefix || '#'}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2">قناة السجلات (Log Channel)</label>
                                ${renderChannelSelect('log_channel', settings.log_channel || '')}
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
                <title>${guild.name} | ZENO Dashboard</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                
                <style>
                    :root {
                        --bg-main: #0b0d14;
                        --bg-sidebar: #10121b;
                        --bg-card: #151722;
                        --bg-card-hover: #1c1f2e;
                        --primary: #9333ea;
                        --border: rgba(255, 255, 255, 0.05);
                    }
                    body { background-color: var(--bg-main) !important; color: #ffffff !important; font-family: 'Cairo', sans-serif !important; }
                    ::-webkit-scrollbar { width: 6px; height: 6px; }
                    ::-webkit-scrollbar-track { background: #0b0d14; }
                    ::-webkit-scrollbar-thumb { background: #2f3146; border-radius: 10px; }
                    .probot-card { background: var(--bg-card) !important; border: 1px solid var(--border) !important; border-radius: 16px !important; }
                    .toggle { position: relative; display: inline-block; width: 44px; height: 24px; }
                    .toggle input { opacity: 0; width: 0; height: 0; }
                    .slider { position: absolute; cursor: pointer; inset: 0; background: #2f3146; border-radius: 24px; transition: .3s; }
                    .slider:before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .3s; }
                    input:checked + .slider { background: #9333ea; }
                    input:checked + .slider:before { transform: translateX(20px); }
                </style>
            </head>
            <body class="min-h-screen flex flex-col bg-[#0b0d14] text-gray-200">
                <header class="h-16 bg-[#10121b]/95 backdrop-blur-md border-b border-white/5 px-6 flex items-center justify-between sticky top-0 z-40">
                    <div class="flex items-center gap-4">
                        <a href="/dashboard" class="text-xs text-purple-400 font-bold hover:text-purple-300 transition">الرجوع للوحة التحكم</a>
                        <span class="text-gray-700">|</span>
                        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="text-xs text-gray-400 hover:text-gray-200 transition">الدعم الفني</a>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-black text-sm text-white tracking-wide">ZENO</span>
                        <div class="w-8 h-8 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center font-black text-xs text-purple-300">Z</div>
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
                                    <a href="/dashboard/${guildId}/suggestions" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'suggestions' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded">جديد</span>
                                        <span class="flex items-center gap-2"><span>الاقتراحات والشكاوي</span><span class="text-gray-400 group-hover:text-purple-400">💡</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- الأمان والحماية -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_security')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_security" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>الحماية والأمان</span><span class="text-purple-400">🛡️</span></span>
                                </button>
                                <div id="grp_sub_security" class="space-y-1">
                                    <a href="/dashboard/${guildId}/protection" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'protection' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="flex items-center gap-1">
                                            <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                            <span class="text-amber-400 text-xs">👑</span>
                                        </span>
                                        <span class="flex items-center gap-2"><span>Anti Nuke (الحماية)</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/whitelist" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'whitelist' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>القائمة البيضاء</span><span class="text-gray-400 group-hover:text-purple-400">⚪</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/protection-logs" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'protection-logs' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded">سجلات</span>
                                        <span class="flex items-center gap-2"><span>سجلات الأمان والإشراف</span><span class="text-gray-400 group-hover:text-purple-400">📋</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/backup" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'backup' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-cyan-400 bg-cyan-950/60 px-1.5 py-0.2 rounded">نسخ</span>
                                        <span class="flex items-center gap-2"><span>النسخ الاحتياطية</span><span class="text-gray-400 group-hover:text-purple-400">📦</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/automod" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'automod' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الرقابة التلقائية</span><span class="text-gray-400 group-hover:text-purple-400">🤖</span></span>
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
                                    <a href="/dashboard/${guildId}/social" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'social' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-red-400 bg-red-950/60 px-1.5 py-0.2 rounded">بث</span>
                                        <span class="flex items-center gap-2"><span>تنبيهات السوشيال</span><span class="text-gray-400 group-hover:text-purple-400">📺</span></span>
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

                async function toggleModule(gId, key, isEnabled) {
                    try {
                        await fetch('/api/guild/' + gId + '/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ [key]: isEnabled ? 1 : 0 })
                        });
                        showSaveStatus();
                    } catch (e) {
                        console.error('Error updating module toggle:', e);
                    }
                }

                function showSaveStatus() {
                    const status = document.getElementById('saveStatus');
                    if (status) {
                        status.classList.remove('hidden');
                        setTimeout(() => status.classList.add('hidden'), 4000);
                    }
                }

                document.getElementById('settingsForm')?.addEventListener('submit', async function(e) {
                    e.preventDefault();
                    const formData = new FormData(this);
                    const payload = {};
                    
                    for (let [k, v] of formData.entries()) {
                        if (payload[k]) {
                            if (Array.isArray(payload[k])) {
                                payload[k].push(v);
                            } else {
                                payload[k] = [payload[k], v];
                            }
                        } else {
                            payload[k] = v;
                        }
                    }

                    this.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                        if (cb.name) {
                            payload[cb.name] = cb.checked ? 1 : 0;
                        }
                    });

                    try {
                        const btn = this.querySelector('button[type="submit"]');
                        if (btn) {
                            btn.disabled = true;
                            btn.innerHTML = '<span>⏳</span><span>جاري الحفظ...</span>';
                        }

                        const targetGuildId = window.location.pathname.split('/')[2];
                        const res = await fetch('/api/guild/' + targetGuildId + '/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        const data = await res.json();
                        if (data.success) {
                            showSaveStatus();
                        } else {
                            alert('❌ خطأ أثناء الحفظ: ' + (data.error || 'حدث خطأ غير متوقع'));
                        }

                        if (btn) {
                            btn.disabled = false;
                            btn.innerHTML = '<span>💾</span><span>حفظ التغييرات</span>';
                        }
                    } catch (err) {
                        alert('حدث خطأ في الاتصال بالخادم');
                    }
                });
                </script>
            </body>
            </html>
            `);
        } catch (error) {
            console.error("Guild dashboard error:", error);
            res.status(500).send(`<pre style="color:red;background:#111;padding:20px;font-family:monospace">${error.stack || error.message || error}</pre>`);
        }
    });

    // 5. REST APIs
    app.post('/api/guild/:guildId/settings', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const settings = req.body;
            if (database.updateGuildSettings) {
                database.updateGuildSettings(guildId, settings);
            }
            // تطبيق اسم البوت في السيرفر في ديسكورد فوراً
            if (settings.bot_nickname !== undefined && client?.guilds?.cache) {
                const targetGuild = client.guilds.cache.get(guildId);
                if (targetGuild?.members?.me) {
                    targetGuild.members.me.setNickname(settings.bot_nickname || null).catch(() => {});
                }
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/clear-all-warnings', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            rawDb.prepare('DELETE FROM warnings WHERE guild_id = ?').run(guildId);
            rawDb.prepare('UPDATE users SET warnings = 0 WHERE guild_id = ?').run(guildId);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/reset-data', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            rawDb.prepare('DELETE FROM guild_settings WHERE guild_id = ?').run(guildId);
            rawDb.prepare('DELETE FROM warnings WHERE guild_id = ?').run(guildId);
            rawDb.prepare('DELETE FROM autoresponders WHERE guild_id = ?').run(guildId);
            rawDb.prepare('DELETE FROM tickets WHERE guild_id = ?').run(guildId);
            rawDb.prepare('DELETE FROM giveaways WHERE guild_id = ?').run(guildId);
            rawDb.prepare('DELETE FROM suggestions WHERE guild_id = ?').run(guildId);
            rawDb.prepare('DELETE FROM security_logs WHERE guild_id = ?').run(guildId);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/giveaways', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { prize, channelId, duration, winners, desc, color, image, emoji, reqRole } = req.body;
            if (!prize || !channelId) return res.status(400).json({ success: false, error: 'Missing prize or channel' });

            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return res.status(404).json({ success: false, error: 'Channel not found' });

            let durationMs = 24 * 60 * 60 * 1000;
            if (duration === '10m') durationMs = 10 * 60 * 1000;
            else if (duration === '1h') durationMs = 60 * 60 * 1000;
            else if (duration === '6h') durationMs = 6 * 60 * 60 * 1000;
            else if (duration === '12h') durationMs = 12 * 60 * 60 * 1000;
            else if (duration === '3d') durationMs = 3 * 24 * 60 * 60 * 1000;
            else if (duration === '7d') durationMs = 7 * 24 * 60 * 60 * 1000;

            const endTime = Date.now() + durationMs;
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

            const gwEmbed = new EmbedBuilder()
                .setTitle('🎉 سحب قيف اواي جديد!')
                .setDescription('**الجائزة:** ' + prize + (desc ? ('\n\n' + desc) : '') + '\n\n**عدد الفائزين:** ' + (winners || 1) + '\n**ينتهي في:** <t:' + Math.floor(endTime / 1000) + ':R>')
                .setColor(color || '#ef5700')
                .setFooter({ text: 'اضغط على الزر أدناه للمشاركة!' })
                .setTimestamp(endTime);

            if (image) gwEmbed.setImage(image);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('gw_enter_btn')
                    .setLabel('مشاركة في القيف اواي')
                    .setEmoji(emoji || '🎉')
                    .setStyle(ButtonStyle.Primary)
            );

            const msg = await channel.send({ embeds: [gwEmbed], components: [row] });

            if (database.createGiveaway) {
                database.createGiveaway(msg.id, channel.id, guildId, prize, winners || 1, req.session.user.id, endTime, reqRole);
            }

            res.json({ success: true, messageId: msg.id });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/suggestions', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { title, category, content } = req.body;
            if (!content) return res.status(400).json({ success: false, error: 'Content is required' });

            const settings = database.getGuildSettings(guildId);
            const channelId = settings.suggestions_channel;
            let msgId = null;

            if (channelId) {
                const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
                if (channel && channel.isTextBased()) {
                    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                    const suggEmbed = new EmbedBuilder()
                        .setColor('#9333ea')
                        .setAuthor({ name: req.session.user.username, iconURL: req.session.user.avatar ? 'https://cdn.discordapp.com/avatars/' + req.session.user.id + '/' + req.session.user.avatar + '.png' : undefined })
                        .setTitle(title ? ('💡 ' + title) : '💡 اقتراح جديد')
                        .setDescription(content)
                        .addFields(
                            { name: '📂 التصنيف', value: category || 'عام', inline: true },
                            { name: '⏳ الحالة', value: 'قيد المراجعة', inline: true }
                        )
                        .setFooter({ text: 'صاحب الاقتراح: ' + req.session.user.username })
                        .setTimestamp();

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('sugg_upvote').setLabel('0').setEmoji('👍').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('sugg_downvote').setLabel('0').setEmoji('👎').setStyle(ButtonStyle.Danger)
                    );

                    const sentMsg = await channel.send({ embeds: [suggEmbed], components: [row] });
                    msgId = sentMsg.id;

                    if (settings.suggestions_auto_thread !== 0) {
                        sentMsg.startThread({
                            name: title ? ('مناقشة: ' + title).slice(0, 95) : 'مناقشة الاقتراح',
                            autoArchiveDuration: 1440
                        }).catch(() => {});
                    }
                }
            }

            const newSugg = database.createSuggestion({
                guild_id: guildId,
                channel_id: channelId,
                message_id: msgId,
                user_id: req.session.user.id,
                title: title,
                content: content,
                category: category || 'عام'
            });

            res.json({ success: true, suggestion: newSugg });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.patch('/api/guild/:guildId/suggestions/:id/status', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, id } = req.params;
            const { status, reason } = req.body;

            const updated = database.updateSuggestionStatus(id, status, reason, req.session.user.id);
            res.json({ success: true, updated });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/send-embed', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { channelId, title, desc, author, color } = req.body;
            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) {
                return res.status(404).json({ success: false, error: 'لم يتم العثور على القناة أو البوت ليس لديه صلاحيات فيها' });
            }
            const { EmbedBuilder } = require('discord.js');
            const emb = new EmbedBuilder().setColor(color || '#9333ea');
            if (title) emb.setTitle(title);
            if (desc) emb.setDescription(desc);
            if (author) emb.setAuthor({ name: author });
            emb.setTimestamp();
            await channel.send({ embeds: [emb] });
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });
};
