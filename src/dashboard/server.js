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
                            <div class="space-y-4">
                                <!-- تخطي الرومات -->
                                <div>
                                    <label class="block text-xs font-bold text-gray-400 mb-2">تخطي الرومات (Ignored Channels)</label>
                                    ${renderChannelSelect('automod_ignore_channels', settings.automod_ignore_channels || '', true)}
                                </div>
                                <!-- تخطي الرولات -->
                                <div>
                                    <label class="block text-xs font-bold text-gray-400 mb-2">تخطي الرولات (Ignored Roles)</label>
                                    ${renderRoleSelect('automod_ignore_roles', settings.automod_ignore_roles || '')}
                                </div>
                                <!-- رومات صور فقط -->
                                <div>
                                    <label class="block text-xs font-bold text-gray-400 mb-2">رومات صور فقط (Images Only Channels)</label>
                                    ${renderChannelSelect('automod_images_only', settings.automod_images_only || '', true)}
                                </div>
                                <!-- رومات يوتيوب فقط -->
                                <div>
                                    <label class="block text-xs font-bold text-gray-400 mb-2">رومات يوتيوب فقط (YouTube Only)</label>
                                    ${renderChannelSelect('automod_youtube_only', settings.automod_youtube_only || '', true)}
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
                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl flex items-center justify-between">
                            <label class="toggle"><input type="checkbox" name="anti_nuke_enabled" value="1" ${settings.anti_nuke_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div>
                                <h4 class="font-bold text-white text-base">جدار الحماية الشامل ومكافحة التخريب 🛡️</h4>
                                <p class="text-gray-400 text-xs mt-0.5">تفعيل وتأمين السيرفر ضد الهجمات والتخريب وحظر الأعضاء والقنوات وحماية الرتب فوراً</p>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="anti_link" value="1" ${settings.anti_link ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="text-right">
                                    <span class="font-bold text-white text-xs block">منع الروابط (Anti-Link)</span>
                                    <span class="text-[10px] text-gray-400">حذف روابط الديسكورد والمواقع غير المصرح بها فوراً</span>
                                </div>
                            </div>
                            <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="anti_spam" value="1" ${settings.anti_spam ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="text-right">
                                    <span class="font-bold text-white text-xs block">مكافحة السبام (Anti-Spam)</span>
                                    <span class="text-[10px] text-gray-400">منع تكرار الرسائل السريعة تلقائياً لحماية الشات</span>
                                </div>
                            </div>
                            <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="anti_nuke" value="1" ${settings.anti_nuke ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="text-right">
                                    <span class="font-bold text-white text-xs block">مكافحة التخريب (Anti-Nuke)</span>
                                    <span class="text-[10px] text-gray-400">حماية السيرفر من طرد أو حظر الرتب وتدمير القنوات</span>
                                </div>
                            </div>
                            <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                                <label class="toggle"><input type="checkbox" name="anti_alt" value="1" ${settings.anti_alt ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="text-right">
                                    <span class="font-bold text-white text-xs block">الحد الأدنى لعمر الحساب (Anti-Alt)</span>
                                    <span class="text-[10px] text-gray-400">طرد الحسابات الوهمية والحديثة التي عمرها أقل من المحدد</span>
                                </div>
                            </div>
                        </div>

                        <div class="bg-[#1c1f2e] border border-white/5 p-5 rounded-2xl space-y-4">
                            <h4 class="font-bold text-white text-xs flex items-center gap-2"><span>فلاتر الرقابة التلقائية الإضافية (Automod Filters)</span><span>🛡️</span></h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" name="anti_caps" value="1" ${settings.anti_caps ? 'checked' : ''}><span class="slider"></span></label>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-white block">منع الحروف الكبيرة (Anti-Caps)</span>
                                        <span class="text-[10px] text-gray-400">حذف الرسائل المكتوبة بحروف كبيرة مفرطة</span>
                                    </div>
                                </div>
                                <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between">
                                    <label class="toggle"><input type="checkbox" name="anti_emoji_spam" value="1" ${settings.anti_emoji_spam ? 'checked' : ''}><span class="slider"></span></label>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-white block">منع سبام الإيموجي (Anti-Emoji)</span>
                                        <span class="text-[10px] text-gray-400">منع إرسال الرسائل التي تحتوي على عدد كبير من الإيموجيات</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
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
