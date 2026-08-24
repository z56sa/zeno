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

    // =======================================================
    // 1. الصفحة الرئيسية (Redirect to Dashboard)
    // =======================================================
    app.get('/', (req, res) => {
        res.redirect('/dashboard');
    });

    // =======================================================
    // 2. OAuth2 (Authentication)
    // =======================================================
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

    // =======================================================
    // 3. لوحة تحكم المستخدم الكاملة (User Dashboard - 100% Exact to Image)
    // =======================================================
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
            const dailyCooldown = 24 * 60 * 60 * 1000;
            const timePassed = now - userLastDaily;
            const canClaimDaily = timePassed >= dailyCooldown;
            const unlockTimestamp = userLastDaily + dailyCooldown;
            const timeLeftMs = Math.max(0, dailyCooldown - timePassed);
            const hoursLeft = Math.floor(timeLeftMs / (1000 * 60 * 60));
            const minsLeft = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));

            const xpLeaderboardHtml = xpLeaderboard.map((r, i) => {
                const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : `#${i + 1}`));
                return `
                    <div class="bg-[#151724] border border-white/5 p-3 rounded-2xl flex items-center justify-between shadow-sm">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-mono font-bold text-purple-400">${(r.total_xp || 0).toLocaleString()} XP</span>
                            <span class="text-[10px] text-gray-500 font-mono">Lv.${r.max_level || 1}</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <div class="text-right">
                                <span class="text-xs font-bold text-white block">User (${r.user_id})</span>
                            </div>
                            <span class="text-sm font-bold w-6 text-center">${medal}</span>
                        </div>
                    </div>
                `;
            }).join('');

            const coinsLeaderboardHtml = coinsLeaderboard.map((r, i) => {
                const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : `#${i + 1}`));
                return `
                    <div class="bg-[#151724] border border-white/5 p-3 rounded-2xl flex items-center justify-between shadow-sm">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-mono font-bold text-amber-400">${(r.total_coins || 0).toLocaleString()} 🪙</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <div class="text-right">
                                <span class="text-xs font-bold text-white block">User (${r.user_id})</span>
                            </div>
                            <span class="text-sm font-bold w-6 text-center">${medal}</span>
                        </div>
                    </div>
                `;
            }).join('');

            const userDashboardGuildsHtml = guilds.map(g => `
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
            `).join('');

            const serverRailHtml = guilds.map(g => `
                <a href="/dashboard/${g.id}" title="${g.name}" class="group relative flex items-center justify-center">
                    <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                         class="w-11 h-11 rounded-2xl border border-white/5 hover:border-purple-500/50 hover:rounded-xl object-cover transition-all shadow-md">
                </a>
            `).join('');

            const dailyActionBoxHtml = canClaimDaily ? `
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
                        --primary: #9333ea;
                        --border: rgba(255, 255, 255, 0.05);
                    }
                    body { background-color: var(--bg-main) !important; color: #ffffff !important; font-family: 'Cairo', sans-serif !important; }
                    ::-webkit-scrollbar { width: 6px; height: 6px; }
                    ::-webkit-scrollbar-track { background: #0b0d14; }
                    ::-webkit-scrollbar-thumb { background: #2f3146; border-radius: 10px; }
                    .probot-card { background: var(--bg-card) !important; border: 1px solid var(--border) !important; border-radius: 16px !important; }
                </style>
            </head>
            <body class="min-h-screen flex flex-col bg-[#0b0d14] text-gray-200">
                <header class="h-16 bg-[#10121b]/95 backdrop-blur-md border-b border-white/5 px-6 flex items-center justify-between sticky top-0 z-40">
                    <div class="flex items-center gap-4">
                        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="text-xs text-gray-400 hover:text-gray-200 transition">الدعم الفني</a>
                        <span class="text-gray-700">|</span>
                        <a href="/#commands" class="text-xs text-gray-400 hover:text-gray-200 transition">الأوامر</a>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-black text-sm text-white tracking-wide">ZENO</span>
                        <div class="w-8 h-8 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center font-black text-xs text-purple-300">Z</div>
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

                <script>
                function toggleNavGroup(groupId) {
                    const el = document.getElementById(groupId);
                    const arrow = document.getElementById('arrow_' + groupId);
                    if (!el) return;
                    el.classList.toggle('hidden');
                    if (arrow) arrow.classList.toggle('rotate-180');
                }

                function switchTab(tabId, btn) {
                    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
                    const target = document.getElementById(tabId);
                    if (target) target.classList.remove('hidden');

                    if (btn) {
                        document.querySelectorAll('.nav-btn').forEach(b => {
                            b.classList.remove('bg-purple-600', 'text-white', 'font-bold', 'shadow-md');
                            b.classList.add('text-gray-300');
                        });
                        btn.classList.add('bg-purple-600', 'text-white', 'font-bold', 'shadow-md');
                        btn.classList.remove('text-gray-300');
                    }
                }

                async function claimDaily() {
                    const btn = document.getElementById('claimDailyBtn');
                    if (btn) { btn.disabled = true; btn.innerText = 'جارٍ الاستلام...'; }
                    try {
                        const res = await fetch('/api/user/daily', { method: 'POST' });
                        const data = await res.json();
                        if (data.success) {
                            alert('🎉 مبروك! استلمت الراتب اليومي (+500 🪙)!');
                            location.reload();
                        } else {
                            alert('❌ خطأ: ' + (data.error || 'فشل الاستلام'));
                            if (btn) btn.disabled = false;
                        }
                    } catch (e) {
                        alert('حدث خطأ في الاتصال بالسيرفر');
                        if (btn) btn.disabled = false;
                    }
                }

                async function buyItem(type, name, price, btn) {
                    if (!confirm('هل أنت متأكد من رغبتك في شراء هذا العنصر مقابل ' + price + ' 🪙؟')) return;
                    try {
                        const res = await fetch('/api/user/shop/buy', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ type, name, price })
                        });
                        const data = await res.json();
                        if (data.success) {
                            alert('✅ تم الشراء والتجهيز بنجاح!');
                            location.reload();
                        } else {
                            alert('❌ خطأ: ' + (data.error || 'فشل الشراء'));
                        }
                    } catch (e) {
                        alert('حدث خطأ في الاتصال');
                    }
                }
                </script>
            </body>
            </html>
            `);
        } catch (error) {
            console.error("Dashboard error:", error);
            res.status(500).send(`<pre style="color:red;background:#111;padding:20px;font-family:monospace">${error.stack || error.message || error}</pre>`);
        }
    });

    // =======================================================
    // 4. صفحة إدارة السيرفر (Guild Dashboard & Sub-pages)
    // =======================================================
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
                if (database.getGuildTickets) {
                    guildTicketsList = database.getGuildTickets(guildId, 50) || [];
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
                'invites': 'متتبع الدعوات المتقدم (Invite Tracker) 🔗',
                'broadcast': 'نظام الإعلانات والمذيع الآلي 📢',
                'embed': 'صانع رسائل الإيمبد التفاعلي 📄',
                'applications': 'نظام التقديمات والتوظيف 📝',
                'fun': 'الألعاب والتسلية والمسابقات 🎮',
                'quran': 'القرآن الكريم والراديو الإسلامي 📻',
                'social': 'تنبيهات منصات السوشيال ميديا 📺'
            };

            const title = sectionTitles[section] || 'لوحة تحكم السيرفر';

            const guildTextChannels = botGuild ? botGuild.channels.cache
                .filter(c => c.isTextBased() && !c.isVoiceBased() && !c.isThread())
                .sort((a, b) => a.rawPosition - b.rawPosition)
                .map(c => ({ id: c.id, name: c.name })) : [];

            const guildRoles = botGuild ? botGuild.roles.cache
                .filter(r => r.name !== '@everyone')
                .sort((a, b) => b.rawPosition - a.rawPosition)
                .map(r => ({ id: r.id, name: r.name, color: r.hexColor })) : [];

            function renderChannelSelect(inputName, selectedId, multiple = false) {
                return `
                    <select name="${inputName}" id="${inputName}" ${multiple ? 'multiple' : ''} class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer">
                        <option value="">...اختر الروم</option>
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

            if (section === 'general') {
formFieldsHtml = `
                    <div class="space-y-6">
                        <!-- General Commands Overview -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl flex items-center justify-between">
                            <span class="px-3 py-1 bg-purple-950/60 text-purple-300 border border-purple-800/40 rounded-xl text-xs font-bold font-mono">36+ أمراً متاحاً</span>
                            <div class="text-right">
                                <h4 class="font-bold text-white text-sm">جميع الأوامر العامة والخدمية للأعضاء ⚙️</h4>
                                <p class="text-gray-400 text-xs mt-0.5">أوامر التفاعل والمعلومات والاقتصاد والألعاب والخدمات المتاحة لجميع أعضاء السيرفر</p>
                            </div>
                        </div>

                        <!-- 1. أوامر المعلومات والبروفايل (General & Identity) -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl space-y-3">
                            <h4 class="font-bold text-white text-xs mb-3 text-right flex items-center justify-end gap-2"><span>أوامر المعلومات والهوية والبروفايل</span><span class="text-purple-400">👤</span></h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                
                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">help & #help</p>
                                        <p class="text-gray-400 text-[10px]">قائمة المساعدة التفاعلية المنسدلة لجميع أوامر البوت</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">profile & /profile & /id</p>
                                        <p class="text-gray-400 text-[10px]">بطاقة البروفايل التفاعلية مع الرصيد والمستوى والسمعة</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">avatar & #avatar</p>
                                        <p class="text-gray-400 text-[10px]">عرض وتحميل الصورة الرمزية للعضو أو أيقونة السيرفر</p>
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
                                        <p class="font-bold text-white text-xs">user & #user</p>
                                        <p class="text-gray-400 text-[10px]">عرض بطاقة معلومات العضو، ورتبه، وتاريخ انضمامه وديسكورد</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">server & #server</p>
                                        <p class="text-gray-400 text-[10px]">عرض معلومات وإحصائيات السيرفر، الأونر وتاريخ الإنشاء</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">invites & #invites</p>
                                        <p class="text-gray-400 text-[10px]">معرفة عدد دعواتك الحقيقية، الوهمية، ومن قام بدعوتك</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">ping & #ping</p>
                                        <p class="text-gray-400 text-[10px]">فحص سرعة استجابة البوت وبنج سيرفرات ديسكورد</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">roles & #roles</p>
                                        <p class="text-gray-400 text-[10px]">عرض قائمة جميع رتب السيرفر وأعداد أعضاء كل رتبة</p>
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
                                        <p class="font-bold text-white text-xs">apply & /apply</p>
                                        <p class="text-gray-400 text-[10px]">التقديم على رتب الإدارة والوظائف المتاحة في السيرفر</p>
                                    </div>
                                </div>

                            </div>
                        </div>

                        <!-- 2. أوامر الاقتصاد والعملات (Economy & Stars) -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl space-y-3">
                            <h4 class="font-bold text-white text-xs mb-3 text-right flex items-center justify-end gap-2"><span>أوامر الاقتصاد ورصيد الذهب & Star Coins</span><span class="text-amber-400">🪙</span></h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">star & #star & #stars & /stars</p>
                                        <p class="text-gray-400 text-[10px]">عرض رصيد Star Coin وإعطاء النجوم والسمعة للأعضاء</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">daily & #daily & /daily</p>
                                        <p class="text-gray-400 text-[10px]">استلام المكافأة اليومية المجانية كل 24 ساعة (+500 إلى 1,000 ⭐)</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">pay & #pay & #star &lt;user&gt; &lt;amount&gt;</p>
                                        <p class="text-gray-400 text-[10px]">تحويل العملات والنجوم لعضو آخر مع حساب الضريبة</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">work & #work & /work</p>
                                        <p class="text-gray-400 text-[10px]">العمل في وظائف عشوائية لكسب الذهب والعملات (كل 4 ساعات)</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">bank & #bank & /bank</p>
                                        <p class="text-gray-400 text-[10px]">إيداع وسحب الأموال والتحكم بحساب البنك لحماية الرصيد</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">rank & #rank & /rank & /level</p>
                                        <p class="text-gray-400 text-[10px]">بطاقة مستوى العضو ونقاط الخبرة والترتيب في السيرفر</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">leaderboard & #top & /top</p>
                                        <p class="text-gray-400 text-[10px]">قائمة المتصدرين في السيرفر (XP المستويات أو أغنى الأعضاء)</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">tax & #tax & /tax</p>
                                        <p class="text-gray-400 text-[10px]">حاسبة ضريبة بروبوت والتحويلات الذكية والمبالغ الصافية</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">setwallpaper & /setwallpaper</p>
                                        <p class="text-gray-400 text-[10px]">تغيير خلفية بروفايل العضو وتعيين رابط صورة مخصصة</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">gamble & #gamble & /gamble</p>
                                        <p class="text-gray-400 text-[10px]">المراهنة بالعملات في لعبة الكازينو لمضاعفة الأرباح</p>
                                    </div>
                                </div>

                            </div>
                        </div>

                        <!-- 3. أوامر الألعاب والتسلية والمسابقات (Fun & Games) -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl space-y-3">
                            <h4 class="font-bold text-white text-xs mb-3 text-right flex items-center justify-end gap-2"><span>أوامر الألعاب والتسلية والمسابقات</span><span class="text-pink-400">🎮</span></h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">trivia & #trivia & /trivia</p>
                                        <p class="text-gray-400 text-[10px]">مسابقة الأسئلة الثقافية التفاعلية مع جوائز Star Coins</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">fight & #fight & /fight</p>
                                        <p class="text-gray-400 text-[10px]">قتال ومبارزة تفاعلية بالدور بين عضوين بأزرار وأسلحة متنوعة</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">chairs & #chairs & /chairs</p>
                                        <p class="text-gray-400 text-[10px]">لعبة الكراسي الموسيقية الشهيرة للأعضاء داخل الروم</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">mafia & #mafia & /mafia</p>
                                        <p class="text-gray-400 text-[10px]">لعبة المافيا والغموض والتحقيق الجماعية</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">hideseek & #hideseek & /hideseek</p>
                                        <p class="text-gray-400 text-[10px]">لعبة الغميمة والاختباء التفاعلية</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">coinflip & #coinflip & /coinflip</p>
                                        <p class="text-gray-400 text-[10px]">رمي العملة (ملك/كتابة) والمراهنة بالنجوم</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">roulette & #roulette & /roulette</p>
                                        <p class="text-gray-400 text-[10px]">لعبة الروليت الكلاسيكية مع عجلة الحظ والأرقام</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">poll & #poll & /poll</p>
                                        <p class="text-gray-400 text-[10px]">إنشاء استطلاعات وتصويت تفاعلي للأعضاء مع خيارات متعددة</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">giveaway & #giveaway & /giveaway</p>
                                        <p class="text-gray-400 text-[10px]">إنشاء وإدارة مسابقات الجيف أواي وتحديد الفائزين تلقائياً</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">embed & /embed</p>
                                        <p class="text-gray-400 text-[10px]">إنشاء رسائل أمبد احترافية وتنسيق الألوان والحقول</p>
                                    </div>
                                </div>

                            </div>
                        </div>

                        <!-- 4. أوامر القرآن الكريم والراديو الإسلامي (Islamic & Audio) -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl space-y-3">
                            <h4 class="font-bold text-white text-xs mb-3 text-right flex items-center justify-end gap-2"><span>القرآن الكريم والإذاعة الإسلامية 24/7</span><span class="text-emerald-400">📻</span></h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">quran & #quran & /quran</p>
                                        <p class="text-gray-400 text-[10px]">الاستماع لآيات وسور القرآن الكريم بصوت أشهر القراء</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">radio & #radio & /radio</p>
                                        <p class="text-gray-400 text-[10px]">تشغيل إذاعة القرآن الكريم والتلاوات المباشرة على مدار 24 ساعة</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-purple-950/30 p-3.5 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    <div class="text-right">
                                        <p class="font-bold text-white text-xs">stop & #stop & /stop</p>
                                        <p class="text-gray-400 text-[10px]">إيقاف تشغيل الراديو أو الصوت وخروج البوت من الروم الصوتي</p>
                                    </div>
                                </div>

                            </div>
                        </div>

                    </div>
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

                        <!-- Card 1: Add new embed box (Exact to Image) -->
                        <div class="bg-[#1c1f2e] border border-dashed border-purple-500/30 hover:border-purple-500/60 p-8 rounded-2xl text-center cursor-pointer transition group" onclick="document.getElementById('embBuilderCard').scrollIntoView({ behavior: 'smooth' })">
                            <div class="w-12 h-12 rounded-2xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center text-xl mx-auto mb-2 group-hover:scale-110 transition">
                                ➕
                            </div>
                            <h4 class="font-bold text-white text-sm">+ إنشاء رسالة إمبد</h4>
                            <p class="text-gray-400 text-xs mt-1">اضغط هنا لفتح المحرر التفاعلي وتصميم وإرسال رسالة إمبد جديدة</p>
                        </div>

                        <!-- Card 2: Interactive Embed Builder Form (Exact to Image) -->
                        <div id="embBuilderCard" class="bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl space-y-4">
                            <h4 class="font-bold text-white text-sm border-b border-white/5 pb-3 flex items-center gap-2 justify-end">
                                <span>محرر رسائل الإيمبد التفاعلي (Interactive Embed Builder)</span>
                                <span>📄</span>
                            </h4>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">القناة المستهدفة (Channel ID) <span class="text-purple-400">*</span></label>
                                    ${renderChannelSelect('embedChannel', '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">لون الإيمبد (Hex Color)</label>
                                    <input type="color" id="embColor" value="#9333ea" oninput="updateEmbedPreview()" class="w-full h-11 bg-[#0b0d14] border border-white/5 rounded-xl cursor-pointer p-1">
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">عنوان الرسالة (Embed Title)</label>
                                    <input type="text" id="embTitle" oninput="updateEmbedPreview()" placeholder="اكتب العنوان الرئيسي هنا..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">اسم الكاتب (Author Name)</label>
                                    <input type="text" id="embAuthor" oninput="updateEmbedPreview()" placeholder="اسم الكاتب أو الإدارة..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2">محتوى الرسالة (Description) <span class="text-purple-400">*</span></label>
                                <textarea id="embDesc" rows="4" oninput="updateEmbedPreview()" placeholder="اكتب تفاصيل الرسالة والإعلان والتنسيق هنا..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right leading-relaxed"></textarea>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">النص السفلي (Footer Text)</label>
                                    <input type="text" id="embFooter" oninput="updateEmbedPreview()" placeholder="حقوق السيرفر أو نص التذييل..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">رابط صورة البنر الكبيرة (Banner Image URL)</label>
                                    <input type="text" id="embImage" placeholder="https://..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-left font-mono">
                                </div>
                            </div>

                            <!-- Live Discord Preview Box (Exact to Image) -->
                            <div class="pt-4 border-t border-white/5 space-y-2">
                                <span class="text-[11px] text-gray-400 font-bold block">المعاينة الحية لرسالة الإيمبد (Discord Live Preview):</span>
                                <div id="previewCard" class="bg-[#0b0d14] border-r-4 border-purple-600 rounded-xl p-4 text-right space-y-2 shadow-inner">
                                    <span id="pvAuthor" class="text-[11px] text-gray-400 font-bold block hidden"></span>
                                    <h4 id="pvTitle" class="text-sm font-bold text-white">عنوان الرسالة التجريبي</h4>
                                    <p id="pvDesc" class="text-xs text-gray-300 leading-relaxed">ستكون رسالة الإيمبد تظهر هنا كما سيبدو تماماً في الديسكورد...</p>
                                    <span id="pvFooter" class="text-[10px] text-gray-500 font-mono block pt-1 border-t border-white/5 hidden"></span>
                                </div>
                            </div>

                            <div class="pt-3 flex justify-end">
                                <button type="button" onclick="sendEmbedDirect()" id="btnSendEmbed" class="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2">
                                    <span>🚀 إرسال الإيمبد إلى ديسكورد الآن</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <script>
                    function updateEmbedPreview() {
                        const title = document.getElementById('embTitle').value.trim();
                        const desc = document.getElementById('embDesc').value.trim();
                        const author = document.getElementById('embAuthor').value.trim();
                        const footer = document.getElementById('embFooter').value.trim();
                        const color = document.getElementById('embColor').value;

                        const pvTitle = document.getElementById('pvTitle');
                        const pvDesc = document.getElementById('pvDesc');
                        const pvAuthor = document.getElementById('pvAuthor');
                        const pvFooter = document.getElementById('pvFooter');
                        const card = document.getElementById('previewCard');

                        if (card) card.style.borderRightColor = color;
                        if (pvTitle) pvTitle.innerText = title || 'عنوان الرسالة التجريبي';
                        if (pvDesc) pvDesc.innerText = desc || 'ستكون رسالة الإيمبد تظهر هنا كما سيبدو تماماً في الديسكورد...';
                        
                        if (pvAuthor) {
                            if (author) { pvAuthor.innerText = author; pvAuthor.classList.remove('hidden'); }
                            else { pvAuthor.classList.add('hidden'); }
                        }
                        if (pvFooter) {
                            if (footer) { pvFooter.innerText = footer; pvFooter.classList.remove('hidden'); }
                            else { pvFooter.classList.add('hidden'); }
                        }
                    }

                    async function sendEmbedDirect() {
                        const channelId = document.getElementById('embedChannel').value;
                        const title = document.getElementById('embTitle').value.trim();
                        const desc = document.getElementById('embDesc').value.trim();
                        const author = document.getElementById('embAuthor').value.trim();
                        const footer = document.getElementById('embFooter').value.trim();
                        const image = document.getElementById('embImage').value.trim();
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
                                body: JSON.stringify({ channelId, title, desc, author, footer, image, color })
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

    // =======================================================
    // 5. REST APIs (Settings, Daily, Shop, Embeds)
    // =======================================================
    app.post('/api/guild/:guildId/settings', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const settings = req.body;
            if (database.updateGuildSettings) {
                database.updateGuildSettings(guildId, settings);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/user/daily', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const userId = req.session.user.id;
            const userRow = rawDb.prepare('SELECT MAX(last_daily) as last_daily FROM users WHERE user_id = ?').get(userId);
            const now = Date.now();
            const cooldown = 24 * 60 * 60 * 1000;
            if (userRow?.last_daily && (now - userRow.last_daily) < cooldown) {
                return res.status(400).json({ success: false, error: 'لقد استلمت الراتب اليومي بالفعل!' });
            }
            rawDb.prepare('UPDATE users SET coins = COALESCE(coins, 0) + 500, last_daily = ? WHERE user_id = ?').run(now, userId);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/user/shop/buy', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const userId = req.session.user.id;
            const { type, name, price } = req.body;
            const userRow = rawDb.prepare('SELECT SUM(coins) as coins FROM users WHERE user_id = ?').get(userId);
            const currentCoins = userRow?.coins || 0;
            if (currentCoins < price) {
                return res.status(400).json({ success: false, error: 'رصيد الذهب (Gold) غير كافٍ!' });
            }
            rawDb.prepare('UPDATE users SET coins = coins - ? WHERE user_id = ?').run(price, userId);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/whitelist', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { userId, type } = req.body;
            if (!userId) return res.status(400).json({ success: false, error: 'User ID is required' });
            if (database.addProtectionWhitelist) {
                database.addProtectionWhitelist(guildId, userId, type || 'whitelist', req.session.user.id);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.delete('/api/guild/:guildId/whitelist', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { userId, type } = req.body;
            if (!userId) return res.status(400).json({ success: false, error: 'User ID is required' });
            if (database.removeProtectionWhitelist) {
                database.removeProtectionWhitelist(guildId, userId, type || 'whitelist');
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/warn-punishments', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { warnCount, actionType } = req.body;
            if (!warnCount || !actionType) return res.status(400).json({ success: false, error: 'Missing fields' });
            if (database.addWarnPunishment) {
                database.addWarnPunishment(guildId, warnCount, actionType);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.delete('/api/guild/:guildId/warn-punishments/:id', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, id } = req.params;
            if (database.deleteWarnPunishment) {
                database.deleteWarnPunishment(id, guildId);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/autoresponder', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const data = req.body;
            if (!data.trigger_word && !data.triggerWord) return res.status(400).json({ success: false, error: 'Missing trigger' });
            if (!data.reply_text && !data.replyText) return res.status(400).json({ success: false, error: 'Missing reply' });
            if (database.addAutoResponder) {
                database.addAutoResponder(guildId, data);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.delete('/api/guild/:guildId/autoresponder/:id', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, id } = req.params;
            if (database.deleteAutoResponder) {
                database.deleteAutoResponder(guildId, id);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/level-reward', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { level, roleId, rewardType, voiceLevel } = req.body;
            if (!level || !roleId) return res.status(400).json({ success: false, error: 'Missing fields' });
            if (database.addLevelReward) {
                database.addLevelReward(guildId, level, roleId, rewardType || 'text', voiceLevel || 0);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.delete('/api/guild/:guildId/level-reward/:level', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, level } = req.params;
            if (database.removeLevelReward) {
                database.removeLevelReward(guildId, parseInt(level));
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/send-embed', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { channelId, title, desc, author, footer, image, color } = req.body;
            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) {
                return res.status(404).json({ success: false, error: 'لم يتم العثور على القناة أو البوت ليس لديه صلاحيات فيها' });
            }
            const { EmbedBuilder } = require('discord.js');
            const emb = new EmbedBuilder().setColor(color || '#9333ea');
            if (title) emb.setTitle(title);
            if (desc) emb.setDescription(desc);
            if (author) emb.setAuthor({ name: author });
            if (footer) emb.setFooter({ text: footer });
            if (image) emb.setImage(image);
            emb.setTimestamp();
            await channel.send({ embeds: [emb] });
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });
};
