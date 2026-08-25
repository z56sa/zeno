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
                <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl flex items-center justify-between hover:border-purple-500/40 transition group">
                    <a href="/dashboard/${g.id}" class="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-purple-950/40 flex items-center gap-2">
                        <span>⚙️ إدارة السيرفر</span>
                    </a>
                    <div class="flex items-center gap-3">
                        <div class="text-right">
                            <h4 class="font-bold text-white text-sm group-hover:text-purple-400 transition truncate max-w-[160px]">${g.name}</h4>
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
                <button type="button" onclick="window.claimDailyReward()" id="claimDailyBtn" class="px-10 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-purple-950/60 hover:scale-105 transition-all cursor-pointer flex items-center gap-2 mx-auto">
                    <span class="text-lg">🎁</span>
                    <span>استلام الرصيد اليومي</span>
                </button>
            ` : `
                <div class="inline-flex items-center gap-2.5 text-xs font-black text-purple-300 bg-purple-950/50 border border-purple-800/40 px-6 py-3 rounded-2xl shadow-xl shadow-purple-950/40">
                    <span class="text-sm">⏳</span>
                    <span>متاح بعد: </span>
                    <span id="liveDailyTimer" class="font-mono text-purple-200 tracking-wider text-sm font-black" data-target="${now + nextDailyIn}">${nextDailyHours}س ${nextDailyMinutes}د</span>
                </div>
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
            
    <script>
    window.toggleNavGroup = function(groupId) {
        const el = document.getElementById(groupId);
        const arrow = document.getElementById('arrow_' + groupId);
        if (!el) return;
        el.classList.toggle('hidden');
        if (arrow) arrow.classList.toggle('rotate-180');
    };

    window.switchTab = function(tabId, btn) {
        const tabs = document.querySelectorAll('.tab-content');
        tabs.forEach(t => t.classList.add('hidden'));

        const target = document.getElementById(tabId);
        if (target) {
            target.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        if (btn) {
            const allNavBtns = document.querySelectorAll('.nav-btn');
            allNavBtns.forEach(b => {
                b.classList.remove('bg-purple-600', 'text-white', 'font-bold', 'shadow-md');
                b.classList.add('text-gray-300', 'hover:text-white', 'hover:bg-[#151724]', 'font-medium');
            });
            btn.classList.add('bg-purple-600', 'text-white', 'font-bold', 'shadow-md');
            btn.classList.remove('text-gray-300', 'hover:text-white', 'hover:bg-[#151724]', 'font-medium');
        }
    };

    window.claimDailyReward = async function() {
        const btn = document.getElementById('claimDailyBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'جارٍ الاستلام... ⏳';
        }
        try {
            const res = await fetch('/api/user/daily', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                alert('🎉 تم استلام ' + data.amount + ' من الذهب بنجاح! رصيدك الجديد: ' + data.newBalance.toLocaleString() + ' 🪙');
                location.reload();
            } else {
                alert('❌ ' + (data.error || 'فشل استلام الراتب اليومي'));
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'استلام الرصيد 🎁';
                }
            }
        } catch(e) {
            alert('حدث خطأ في الاتصال بالسيرفر');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'استلام الرصيد 🎁';
            }
        }
    };

    
    // Live ticking countdown for daily reward
    setInterval(function() {
        var timerEl = document.getElementById('liveDailyTimer');
        if (!timerEl) return;
        var target = parseInt(timerEl.getAttribute('data-target'), 10);
        if (!target) return;
        var diff = target - Date.now();
        if (diff <= 0) {
            var box = document.getElementById('dailyActionBox');
            if (box) {
                box.innerHTML = '<button type="button" onclick="window.claimDailyReward()" id="claimDailyBtn" class="px-10 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-purple-950/60 hover:scale-105 transition-all cursor-pointer flex items-center gap-2 mx-auto"><span class="text-lg">🎁</span><span>استلام الرصيد اليومي</span></button>';
            }
            return;
        }
        var h = Math.floor(diff / (1000 * 60 * 60));
        var m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        var sec = Math.floor((diff % (1000 * 60)) / 1000);
        timerEl.textContent = (h < 10 ? '0' + h : h) + 'س ' + (m < 10 ? '0' + m : m) + 'د ' + (sec < 10 ? '0' + sec : sec) + 'ث';
    }, 1000);
    
    window.buyItem = async function(type, name, price, btn) {
        if (!confirm('هل أنت متأكد من شراء وتفعيل "' + name + '" مقابل ' + price.toLocaleString() + ' 🪙؟')) return;
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'جارٍ الشراء... ⏳';
        }
        try {
            const res = await fetch('/api/user/buy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: type, name: name, price: price })
            });
            const data = await res.json();
            if (data.success) {
                alert('✅ تم الشراء والتفعيل بنجاح!');
                location.reload();
            } else {
                alert('❌ ' + (data.error || 'رصيدك لا يكفي لإتمام الشراء'));
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'شراء وتجهيز';
                }
            }
        } catch(e) {
            alert('حدث خطأ أثناء الشراء');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'شراء وتجهيز';
            }
        }
    };
    </script>


    <script>
    // Live countdown timer for daily reward
    setInterval(function() {
        var timerEl = document.getElementById('liveDailyTimer');
        if (!timerEl) return;
        var nextTime = parseInt(timerEl.getAttribute('data-next'), 10);
        if (!nextTime) return;
        var diff = nextTime - Date.now();
        if (diff <= 0) {
            var box = document.getElementById('dailyActionBox');
            if (box) {
                box.innerHTML = '<button type="button" onclick="claimDailyReward()" id="claimDailyBtn" class="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm rounded-2xl shadow-xl shadow-purple-950/50 hover:scale-105 transition-all cursor-pointer flex items-center gap-2 mx-auto"><span>🎁</span><span>استلام الرصيد</span></button>';
            }
            return;
        }
        var hours = Math.floor(diff / (1000 * 60 * 60));
        var mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        var secs = Math.floor((diff % (1000 * 60)) / 1000);
        timerEl.textContent = (hours < 10 ? '0' + hours : hours) + 'س ' + (mins < 10 ? '0' + mins : mins) + 'د ' + (secs < 10 ? '0' + secs : secs) + 'ث';
    }, 1000);
    </script>

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
                                    <div class="w-10 h-10 rounded-xl bg-purple-600/10 text-amber-400 flex items-center justify-center text-xl font-bold shadow-inner">🪙</div>
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
                'embed': 'صانع رسائل الإيمبد المتقدم 📄',
                'fun': 'نظام التسلية والألعاب التفاعلية 🎮',
                'quran': 'القرآن الكريم والإذاعات الإسلامية 🕌',
                'applications': 'نظام التقديمات والتوظيف 📝'
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

            if (section === 'overview') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Server Overview Hero Banner -->
                        <div class="bg-gradient-to-br from-[#1a0a2e] via-[#12141f] to-[#0b0d14] border border-purple-500/20 p-6 rounded-3xl shadow-2xl relative overflow-hidden">
                            <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(147,51,234,0.12),transparent_70%)]"></div>
                            <div class="relative flex items-center justify-between">
                                <div class="flex items-center gap-4">
                                    <div class="text-right">
                                        <h2 class="text-2xl font-black text-white">${guild.name || "ZENO'BOT"}</h2>
                                        <p class="text-purple-300/80 text-xs font-mono mt-0.5">ID: ${guildId}</p>
                                        <div class="flex items-center gap-1.5 mt-2 justify-end">
                                            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                            <span class="text-xs text-emerald-300 font-bold">البوت متصل ويعمل</span>
                                        </div>
                                    </div>
                                    <img src="${guild.icon ? `https://cdn.discordapp.com/icons/${guildId}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-20 h-20 rounded-3xl ring-4 ring-purple-500/40 shadow-xl object-cover">
                                </div>
                                <div class="text-left">
                                    <div class="text-5xl font-black text-white/10 select-none">🏰</div>
                                </div>
                            </div>
                        </div>

                        <!-- Real-Time Stats Grid (4 Counters) -->
                        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div class="bg-[#12141f] border border-purple-500/20 p-5 rounded-2xl shadow-xl text-right hover:border-purple-500/40 transition group">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400 flex items-center justify-center text-sm">👥</div>
                                    <span class="text-[10px] text-gray-500 font-mono">MEMBERS</span>
                                </div>
                                <div class="text-2xl font-black text-white">${(botGuild?.memberCount || 0).toLocaleString()}</div>
                                <p class="text-xs text-gray-400 mt-1 font-bold">إجمالي الأعضاء</p>
                            </div>
                            <div class="bg-[#12141f] border border-emerald-500/20 p-5 rounded-2xl shadow-xl text-right hover:border-emerald-500/40 transition group">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-sm">🟢</div>
                                    <span class="text-[10px] text-gray-500 font-mono">ONLINE</span>
                                </div>
                                <div class="text-2xl font-black text-white">${(botGuild?.members?.cache?.filter(m => m.presence?.status === 'online' || m.presence?.status === 'idle' || m.presence?.status === 'dnd').size || 0).toLocaleString()}</div>
                                <p class="text-xs text-gray-400 mt-1 font-bold">الأعضاء المتصلون</p>
                            </div>
                            <div class="bg-[#12141f] border border-indigo-500/20 p-5 rounded-2xl shadow-xl text-right hover:border-indigo-500/40 transition group">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center text-sm">📁</div>
                                    <span class="text-[10px] text-gray-500 font-mono">CHANNELS</span>
                                </div>
                                <div class="text-2xl font-black text-white">${(botGuild?.channels?.cache?.size || 0)}</div>
                                <p class="text-xs text-gray-400 mt-1 font-bold">إجمالي القنوات</p>
                            </div>
                            <div class="bg-[#12141f] border border-amber-500/20 p-5 rounded-2xl shadow-xl text-right hover:border-amber-500/40 transition group">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-amber-600/20 border border-amber-500/30 text-amber-400 flex items-center justify-center text-sm">💎</div>
                                    <span class="text-[10px] text-gray-500 font-mono">BOOSTS</span>
                                </div>
                                <div class="text-2xl font-black text-white">${(botGuild?.premiumSubscriptionCount || 0)}</div>
                                <p class="text-xs text-gray-400 mt-1 font-bold">بوستات السيرفر</p>
                            </div>
                        </div>

                        <!-- Second Row Stats -->
                        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl shadow-xl text-right hover:border-purple-500/20 transition">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-pink-600/20 border border-pink-500/30 text-pink-400 flex items-center justify-center text-sm">🎖️</div>
                                    <span class="text-[10px] text-gray-500 font-mono">ROLES</span>
                                </div>
                                <div class="text-2xl font-black text-white">${(botGuild?.roles?.cache?.size || 0)}</div>
                                <p class="text-xs text-gray-400 mt-1 font-bold">إجمالي الرتب</p>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl shadow-xl text-right hover:border-purple-500/20 transition">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-purple-700/20 border border-purple-500/30 text-purple-400 flex items-center justify-center text-sm">😃</div>
                                    <span class="text-[10px] text-gray-500 font-mono">EMOJIS</span>
                                </div>
                                <div class="text-2xl font-black text-white">${(botGuild?.emojis?.cache?.size || 0)}</div>
                                <p class="text-xs text-gray-400 mt-1 font-bold">الإيموجيات المخصصة</p>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl shadow-xl text-right hover:border-purple-500/20 transition">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 flex items-center justify-center text-sm">🤖</div>
                                    <span class="text-[10px] text-gray-500 font-mono">BOTS</span>
                                </div>
                                <div class="text-2xl font-black text-white">${(botGuild?.members?.cache?.filter(m => m.user.bot).size || 0)}</div>
                                <p class="text-xs text-gray-400 mt-1 font-bold">عدد البوتات</p>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl shadow-xl text-right hover:border-purple-500/20 transition">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-400 flex items-center justify-center text-sm">🎁</div>
                                    <span class="text-[10px] text-gray-500 font-mono">GIVEAWAYS</span>
                                </div>
                                <div class="text-2xl font-black text-white">${guildGiveawaysList?.length || 0}</div>
                                <p class="text-xs text-gray-400 mt-1 font-bold">إجمالي القيف اوايز</p>
                            </div>
                        </div>

                        <!-- Server Info & Boost Level -->
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <!-- Server Details -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl shadow-xl space-y-3 text-right">
                                <h4 class="font-black text-white text-sm flex items-center justify-end gap-2"><span>معلومات السيرفر</span><span>🏰</span></h4>
                                <div class="space-y-2.5 text-xs text-gray-400">
                                    <div class="flex items-center justify-between bg-[#0b0d14] p-3 rounded-xl border border-white/5">
                                        <span class="text-white font-bold font-mono">${new Date((parseInt(guildId) / 4194304 + 1420070400000)).toLocaleDateString('ar-IQ', {year:'numeric',month:'long',day:'numeric'})}</span>
                                        <span>تاريخ إنشاء السيرفر</span>
                                    </div>
                                    <div class="flex items-center justify-between bg-[#0b0d14] p-3 rounded-xl border border-white/5">
                                        <span class="text-purple-300 font-bold">مستوى ${botGuild?.premiumTier || 0}</span>
                                        <span>مستوى البوست</span>
                                    </div>
                                    <div class="flex items-center justify-between bg-[#0b0d14] p-3 rounded-xl border border-white/5">
                                        <span class="text-white font-bold font-mono">${botGuild?.vanityURLCode ? `discord.gg/${botGuild.vanityURLCode}` : '—'}</span>
                                        <span>رابط السيرفر المخصص</span>
                                    </div>
                                    <div class="flex items-center justify-between bg-[#0b0d14] p-3 rounded-xl border border-white/5">
                                        <span class="text-white font-bold">${botGuild?.verificationLevel === 0 ? 'لا يوجد' : botGuild?.verificationLevel === 1 ? 'منخفض' : botGuild?.verificationLevel === 2 ? 'متوسط' : botGuild?.verificationLevel === 3 ? 'عالي' : 'عالي جداً'}</span>
                                        <span>مستوى التحقق</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Quick Actions -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl shadow-xl space-y-3 text-right">
                                <h4 class="font-black text-white text-sm flex items-center justify-end gap-2"><span>الإجراءات السريعة</span><span>⚡</span></h4>
                                <div class="space-y-2">
                                    <a href="/dashboard/${guildId}/commands" class="flex items-center justify-between bg-[#0b0d14] hover:bg-purple-900/20 border border-white/5 hover:border-purple-500/30 p-3 rounded-xl transition group">
                                        <span class="text-purple-400 text-xs group-hover:text-purple-300">←</span>
                                        <div class="flex items-center gap-2 text-right">
                                            <span class="text-xs font-bold text-white">إدارة الأوامر</span>
                                            <span class="text-sm">🎛️</span>
                                        </div>
                                    </a>
                                    <a href="/dashboard/${guildId}/moderation" class="flex items-center justify-between bg-[#0b0d14] hover:bg-purple-900/20 border border-white/5 hover:border-purple-500/30 p-3 rounded-xl transition group">
                                        <span class="text-purple-400 text-xs group-hover:text-purple-300">←</span>
                                        <div class="flex items-center gap-2 text-right">
                                            <span class="text-xs font-bold text-white">إعدادات الإشراف</span>
                                            <span class="text-sm">🔨</span>
                                        </div>
                                    </a>
                                    <a href="/dashboard/${guildId}/protection" class="flex items-center justify-between bg-[#0b0d14] hover:bg-purple-900/20 border border-white/5 hover:border-purple-500/30 p-3 rounded-xl transition group">
                                        <span class="text-purple-400 text-xs group-hover:text-purple-300">←</span>
                                        <div class="flex items-center gap-2 text-right">
                                            <span class="text-xs font-bold text-white">نظام الحماية</span>
                                            <span class="text-sm">🛡️</span>
                                        </div>
                                    </a>
                                    <a href="/dashboard/${guildId}/analytics" class="flex items-center justify-between bg-[#0b0d14] hover:bg-purple-900/20 border border-white/5 hover:border-purple-500/30 p-3 rounded-xl transition group">
                                        <span class="text-purple-400 text-xs group-hover:text-purple-300">←</span>
                                        <div class="flex items-center gap-2 text-right">
                                            <span class="text-xs font-bold text-white">الإحصائيات والتحليلات</span>
                                            <span class="text-sm">📊</span>
                                        </div>
                                    </a>
                                    <a href="/dashboard/${guildId}/stat-channels" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'stat-channels' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded">جديد</span>
                                        <span class="flex items-center gap-2"><span>قنوات الإحصائيات</span><span class="text-gray-400 group-hover:text-purple-400">📈</span></span>
                                    </a>
                                </div>
                            </div>
                        </div>

                        <!-- Top Members & Leaderboard Preview -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl shadow-xl text-right">
                            <div class="flex items-center justify-between mb-4">
                                <a href="/dashboard/${guildId}/analytics" class="text-xs text-purple-400 hover:text-purple-300 font-bold transition">عرض الكل ←</a>
                                <h4 class="font-black text-white text-sm flex items-center gap-2"><span>أكثر الأعضاء نشاطاً</span><span>🏆</span></h4>
                            </div>
                            <div class="space-y-2">
                                ${guildLeaderboardUsers.slice(0, 5).map((u, i) => `
                                <div class="flex items-center justify-between bg-[#0b0d14] border border-white/5 p-3 rounded-xl hover:border-purple-500/20 transition">
                                    <div class="flex items-center gap-3">
                                        <span class="text-xs font-mono font-black text-purple-400">⚡ ${Number(u.total_xp || 0).toLocaleString()} XP</span>
                                        <span class="text-xs text-gray-300 font-mono truncate max-w-[120px]">${u.user_id}</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="w-6 h-6 rounded-lg ${i === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : i === 1 ? 'bg-gray-400/20 text-gray-300 border border-gray-400/30' : i === 2 ? 'bg-purple-700/20 text-purple-400 border border-purple-500/30' : 'bg-purple-600/20 text-purple-400 border border-purple-500/30'} text-[10px] font-black flex items-center justify-center">#${i+1}</span>
                                    </div>
                                </div>
                                `).join('')}
                                ${guildLeaderboardUsers.length === 0 ? '<p class="text-xs text-gray-500 text-center py-4">لا توجد بيانات نشاط حتى الآن</p>' : ''}
                            </div>
                        </div>

                    </div>
`;
            } else if (section === 'general' || section === 'commands') {
formFieldsHtml = "<div id=\"cmdsMgmtRoot\" class=\"space-y-6 text-right\" dir=\"rtl\" style=\"margin-top:0\">\n\n    <!-- Header Card -->\n    <div class=\"bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl\">\n        <div class=\"flex items-center gap-6\">\n            <div class=\"text-center\">\n                <span id=\"customAliasesCount\" class=\"text-xl font-black text-purple-400 font-mono\">0</span>\n                <span class=\"text-[10px] text-gray-400 block font-bold\">اختصارات مخصصة</span>\n            </div>\n            <div class=\"text-center\">\n                <span id=\"enabledCmdsCount\" class=\"text-xl font-black text-emerald-400 font-mono\">185</span>\n                <span class=\"text-[10px] text-gray-400 block font-bold\">الأوامر المفعلة</span>\n            </div>\n            <div class=\"text-center\">\n                <span id=\"totalCmdsCount\" class=\"text-xl font-black text-white font-mono\">185</span>\n                <span class=\"text-[10px] text-gray-400 block font-bold\">إجمالي الأوامر</span>\n            </div>\n        </div>\n        <div class=\"flex items-center gap-3\">\n            <div class=\"text-right\">\n                <h4 class=\"font-black text-white text-base\">إدارة الأوامر</h4>\n                <p class=\"text-gray-400 text-xs mt-0.5\">تخصيص وإدارة جميع أوامر البوت والصلاحيات</p>\n            </div>\n            <div class=\"w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30\">🎛️</div>\n        </div>\n    </div>\n\n    <!-- Search & Filter Bar -->\n    <div class=\"flex items-center justify-between gap-4\">\n        <div class=\"flex items-center gap-1.5 bg-[#12141f] border border-white/5 p-1 rounded-xl\">\n            <button type=\"button\" id=\"btnFilterDisabled\" onclick=\"window.filterCmdStatus('disabled')\" class=\"px-3 py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer\">معطل</button>\n            <button type=\"button\" id=\"btnFilterEnabled\" onclick=\"window.filterCmdStatus('enabled')\" class=\"px-3 py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer\">مفعل</button>\n            <button type=\"button\" id=\"btnFilterAll\" onclick=\"window.filterCmdStatus('all')\" class=\"px-3 py-1 rounded-lg text-xs font-bold bg-purple-600 text-white transition shadow cursor-pointer\">الكل</button>\n        </div>\n        <div class=\"flex-1 relative\">\n            <input type=\"text\" id=\"cmdSearchInput\" placeholder=\"...ابحث عن أمر\" oninput=\"window.searchCommands()\" class=\"w-full bg-[#12141f] border border-white/5 focus:border-purple-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right pr-10\">\n            <span class=\"absolute right-3 top-2.5 text-gray-400\">🔍</span>\n        </div>\n    </div>\n\n    <!-- Main Grid -->\n    <div class=\"grid grid-cols-1 lg:grid-cols-4 gap-6\">\n\n        <!-- Sidebar: Categories -->\n        <div class=\"lg:col-span-1 space-y-1.5 bg-[#12141f] border border-white/5 p-3 rounded-2xl shadow-xl h-fit\">\n            <div class=\"flex items-center justify-end gap-1.5 text-xs font-black text-white px-2 py-1.5 border-b border-white/5 mb-1\">\n                <span>الأقسام</span><span>📁</span>\n            </div>\n            <button type=\"button\" id=\"btnCatBasic\" onclick=\"window.switchCmdCategory('basic')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatBasic\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">17/17</span>\n                <span class=\"flex items-center gap-1.5\"><span>الأوامر الأساسية</span><span>⚙️</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatPunishments\" onclick=\"window.switchCmdCategory('punishments')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold bg-purple-600 text-white shadow-lg transition cursor-pointer\">\n                <span id=\"badgeCatPunishments\" class=\"px-2 py-0.5 bg-white/20 text-white rounded-lg text-[10px] font-mono\">22/22</span>\n                <span class=\"flex items-center gap-1.5\"><span>العقوبات</span><span>🔨</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatPunishmentLogs\" onclick=\"window.switchCmdCategory('punishment_logs')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatPunishmentLogs\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">17/17</span>\n                <span class=\"flex items-center gap-1.5\"><span>سجلات العقوبات</span><span>📜</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatChannels\" onclick=\"window.switchCmdCategory('channels')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatChannels\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">9/9</span>\n                <span class=\"flex items-center gap-1.5\"><span>إدارة القنوات</span><span>📌</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatChat\" onclick=\"window.switchCmdCategory('chat')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatChat\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">12/12</span>\n                <span class=\"flex items-center gap-1.5\"><span>أدوات الشات</span><span>💬</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatVoice\" onclick=\"window.switchCmdCategory('voice')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatVoice\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">19/19</span>\n                <span class=\"flex items-center gap-1.5\"><span>إدارة الصوت</span><span>🎙️</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatRoles\" onclick=\"window.switchCmdCategory('roles')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatRoles\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">10/10</span>\n                <span class=\"flex items-center gap-1.5\"><span>إدارة الرتب</span><span>🎖️</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatCustomRoles\" onclick=\"window.switchCmdCategory('custom_roles')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatCustomRoles\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">9/9</span>\n                <span class=\"flex items-center gap-1.5\"><span>الرتب الخاصة</span><span>👑</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatServerInfo\" onclick=\"window.switchCmdCategory('server_info')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatServerInfo\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">19/19</span>\n                <span class=\"flex items-center gap-1.5\"><span>معلومات السيرفر</span><span>📊</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatCustomBot\" onclick=\"window.switchCmdCategory('custom_bot')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatCustomBot\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">5/5</span>\n                <span class=\"flex items-center gap-1.5\"><span>أدوات البوت الخاص</span><span>🤖</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatSecurity\" onclick=\"window.switchCmdCategory('security')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatSecurity\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">15/15</span>\n                <span class=\"flex items-center gap-1.5\"><span>الحماية</span><span>🛡️</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatLevels\" onclick=\"window.switchCmdCategory('levels_cat')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatLevels\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">10/10</span>\n                <span class=\"flex items-center gap-1.5\"><span>المستويات والخبرة</span><span>⭐</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatServerStats\" onclick=\"window.switchCmdCategory('server_stats')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatServerStats\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">11/11</span>\n                <span class=\"flex items-center gap-1.5\"><span>إحصائيات السيرفر</span><span>📈</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatProfile\" onclick=\"window.switchCmdCategory('profile_cat')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatProfile\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">10/10</span>\n                <span class=\"flex items-center gap-1.5\"><span>الملف الشخصي</span><span>👤</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatFunGames\" onclick=\"window.switchCmdCategory('fun_games')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatFunGames\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">8/8</span>\n                <span class=\"flex items-center gap-1.5\"><span>التسلية والألعاب</span><span>🎮</span></span>\n            </button>\n        </div>\n\n        <!-- Commands Display Area -->\n        <div class=\"lg:col-span-3 space-y-4\">\n            <!-- Active Category Header -->\n            <div class=\"bg-[#12141f] border border-white/5 p-4 rounded-2xl flex items-center justify-between shadow-xl\">\n                <div class=\"flex items-center gap-2\">\n                    <span id=\"cmdSaveIndicator\" class=\"text-xs font-bold text-emerald-400 bg-emerald-950/60 px-2 py-1 rounded-lg opacity-0 transition-opacity duration-300\">✓ حُفظ</span>\n                    <button type=\"button\" onclick=\"window.toggleAllCategoryCmds(false)\" class=\"px-3.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 rounded-xl text-xs font-bold transition flex items-center gap-1\">\n                        <span>✕</span><span>تعطيل الكل</span>\n                    </button>\n                    <button type=\"button\" onclick=\"window.toggleAllCategoryCmds(true)\" class=\"px-3.5 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/40 rounded-xl text-xs font-bold transition flex items-center gap-1\">\n                        <span>✓</span><span>تفعيل الكل</span>\n                    </button>\n                </div>\n                <div class=\"flex items-center gap-3\">\n                    <div class=\"text-right\">\n                        <h5 id=\"catTitle\" class=\"font-black text-white text-sm\">العقوبات</h5>\n                        <p id=\"catDesc\" class=\"text-gray-400 text-[11px] mt-0.5\">أوامر تنفيذ العقوبات المباشرة على الأعضاء</p>\n                    </div>\n                    <span id=\"catIcon\" class=\"text-xl\">🔨</span>\n                </div>\n            </div>\n            <!-- Commands List -->\n            <div id=\"cmdsListContainer\" class=\"space-y-3\"></div>\n        </div>\n    </div>\n</div>\n\n<script>\n(function() {\n    var DB = {\n        basic: { title: 'الأوامر الأساسية', desc: 'الأوامر الرئيسية للبوت والاستخدام اليومي', icon: '⚙️', items: [\n            { name: '/help', desc: 'قائمة جميع الأوامر المتاحة', badge: '', icon: '📖' },\n            { name: '/ping', desc: 'سرعة استجابة البوت', badge: '', icon: '📶' },\n            { name: '/botinfo', desc: 'معلومات البوت الكاملة', badge: '', icon: '🤖' },\n            { name: '/serverinfo', desc: 'معلومات السيرفر الشاملة', badge: '', icon: '🏠' },\n            { name: '/userinfo', desc: 'معلومات عضو في السيرفر', badge: '', icon: '👤' },\n            { name: '/avatar', desc: 'عرض صورة عضو بدقة عالية', badge: '', icon: '🖼️' },\n            { name: '/banner', desc: 'عرض بنر عضو', badge: '', icon: '🎨' },\n            { name: '/invites', desc: 'عدد دعوات عضو في السيرفر', badge: '', icon: '🔗' },\n            { name: '/roles', desc: 'قائمة رتب السيرفر الكاملة', badge: '', icon: '🎖️' },\n            { name: '/channels', desc: 'قائمة قنوات السيرفر', badge: '', icon: '📁' },\n            { name: '/emojis', desc: 'قائمة إيموجيات السيرفر المخصصة', badge: '', icon: '😃' },\n            { name: '/apply', desc: 'تقديم طلب وظيفي بالسيرفر', badge: '', icon: '📝' },\n            { name: '/ticket', desc: 'فتح تذكرة دعم', badge: '', icon: '🎫' },\n            { name: '/daily', desc: 'استلام الراتب اليومي', badge: '', icon: '🪙' },\n            { name: '/profile', desc: 'عرض بطاقة البروفايل', badge: '', icon: '💳' },\n            { name: '/leaderboard', desc: 'قائمة المتصدرين', badge: '', icon: '🏆' },\n            { name: '/stars', desc: 'رصيد النجوم والتقييمات', badge: '', icon: '⭐' }\n        ]},\n        punishments: { title: 'العقوبات', desc: 'أوامر تنفيذ العقوبات المباشرة على الأعضاء', icon: '🔨', items: [\n            { name: '/ban', desc: 'حظر عضو', badge: 'صلاحيات ديسكورد', icon: '🪓' },\n            { name: '/unban', desc: 'فك حظر عضو', badge: 'صلاحيات ديسكورد', icon: '🛡️' },\n            { name: '/kick', desc: 'طرد عضو', badge: 'صلاحيات ديسكورد', icon: '🪓' },\n            { name: '/mute', desc: 'كتم عضو', badge: 'صلاحيات ديسكورد', icon: '🚨' },\n            { name: '/unmute', desc: 'فك كتم عضو', badge: 'صلاحيات ديسكورد', icon: '📢' },\n            { name: '/timeout', desc: 'عزل عضو', badge: 'صلاحيات ديسكورد', icon: '⏳' },\n            { name: '/untimeout', desc: 'فك عزل عضو', badge: 'صلاحيات ديسكورد', icon: '🛡️' },\n            { name: '/warn', desc: 'تحذير عضو', badge: 'صلاحيات ديسكورد', icon: '🚨' },\n            { name: '/delwarn', desc: 'حذف تحذير', badge: 'صلاحيات ديسكورد', icon: '🗑️' },\n            { name: '/clearwarns', desc: 'مسح جميع التحذيرات', badge: 'صلاحيات ديسكورد', icon: '🗑️' },\n            { name: '/clearallwarns', desc: 'مسح تحذيرات عضو كاملة', badge: 'صلاحيات ديسكورد', icon: '🗑️' },\n            { name: '/clearallpunishments', desc: 'حذف نهائي لكل سجلات العقوبات', badge: '', icon: '🗑️' },\n            { name: '/prison', desc: 'سجن عضو', badge: 'صلاحيات ديسكورد', icon: '🪓' },\n            { name: '/unprison', desc: 'إخراج من السجن', badge: 'صلاحيات ديسكورد', icon: '🛡️' },\n            { name: '/setnick', desc: 'تغيير الاسم المستعار', badge: 'صلاحيات ديسكورد', icon: '✏️' },\n            { name: '/blacklist', desc: 'بلاك لست عضو (دائم)', badge: 'صلاحيات ديسكورد', icon: '🪓' },\n            { name: '/unblacklist', desc: 'فك بلاك لست عضو', badge: 'صلاحيات ديسكورد', icon: '🛡️' },\n            { name: '/remove', desc: 'حذف عقوبة من عضو', badge: 'صلاحيات ديسكورد', icon: '🗑️' },\n            { name: '/down', desc: 'إزالة الرتب الإدارية لمدة محددة', badge: 'صلاحيات ديسكورد', icon: '🪓' },\n            { name: '/undown', desc: 'استعادة الرتب الإدارية المزالة', badge: '', icon: '🛡️' },\n            { name: '/block', desc: 'حظر عضو من رتبة', badge: 'صلاحيات ديسكورد', icon: '🛡️' },\n            { name: '/unblock', desc: 'فك حظر عضو من رتبة', badge: 'صلاحيات ديسكورد', icon: '🛡️' }\n        ]},\n        punishment_logs: { title: 'سجلات العقوبات', desc: 'استعلام وعرض سجلات العقوبات السابقة', icon: '📜', items: [\n            { name: '/allwarns', desc: 'عرض كل التحذيرات النشطة', badge: '', icon: '📋' },\n            { name: '/bans', desc: 'سجل باندات عضو', badge: '', icon: '📜' },\n            { name: '/blacklists', desc: 'سجل بلاك لست عضو', badge: '', icon: '📜' },\n            { name: '/blocks', desc: 'سجل بلوكات عضو', badge: '', icon: '📜' },\n            { name: '/case', desc: 'عرض تفاصيل عقوبة', badge: 'صلاحيات ديسكورد', icon: '📄' },\n            { name: '/crime', desc: 'سجل عقوبات العضو الكامل', badge: '', icon: '📜' },\n            { name: '/crimes', desc: 'عقوبات العضو النشطة حالياً', badge: '', icon: '📜' },\n            { name: '/downs', desc: 'سجل داونات عضو', badge: '', icon: '📜' },\n            { name: '/modlogs', desc: 'سجل إشراف المشرفين', badge: 'صلاحيات ديسكورد', icon: '📜' },\n            { name: '/kicks', desc: 'سجل طرديات عضو', badge: '', icon: '📜' },\n            { name: '/mutes', desc: 'سجل كتمات عضو', badge: '', icon: '📜' },\n            { name: '/prisons', desc: 'سجل سجنات عضو', badge: '', icon: '📜' },\n            { name: '/timeouts', desc: 'سجل عزلات عضو', badge: '', icon: '📜' },\n            { name: '/warns', desc: 'سجل تحذيرات عضو', badge: '', icon: '📜' },\n            { name: '/staffactivity', desc: 'تقرير نشاط فريق الإدارة', badge: 'صلاحيات ديسكورد', icon: '📊' },\n            { name: '/audit', desc: 'سجل التدقيق والعمليات', badge: 'صلاحيات ديسكورد', icon: '🔍' },\n            { name: '/punishments', desc: 'ملخص جميع العقوبات النشطة', badge: '', icon: '📋' }\n        ]},\n        channels: { title: 'إدارة القنوات', desc: 'أوامر قفل وإخفاء وإدارة القنوات', icon: '📌', items: [\n            { name: '/lock', desc: 'قفل قناة', badge: 'صلاحيات ديسكورد', icon: '🔒' },\n            { name: '/unlock', desc: 'فتح قناة مقفولة', badge: 'صلاحيات ديسكورد', icon: '🔓' },\n            { name: '/hide', desc: 'إخفاء قناة عن الأعضاء', badge: 'صلاحيات ديسكورد', icon: '👁️' },\n            { name: '/unhide', desc: 'إظهار قناة مخفية', badge: 'صلاحيات ديسكورد', icon: '👁️' },\n            { name: '/slowmode', desc: 'تفعيل السلو مود في القناة', badge: 'صلاحيات ديسكورد', icon: '🐌' },\n            { name: '/clone', desc: 'نسخ قناة بكامل إعداداتها', badge: 'صلاحيات ديسكورد', icon: '📋' },\n            { name: '/rename', desc: 'تغيير اسم القناة', badge: 'صلاحيات ديسكورد', icon: '✏️' },\n            { name: '/settopic', desc: 'تغيير وصف القناة', badge: 'صلاحيات ديسكورد', icon: '📝' },\n            { name: '/setnsfw', desc: 'تفعيل/تعطيل وضع NSFW', badge: 'صلاحيات ديسكورد', icon: '🔞' }\n        ]},\n        chat: { title: 'أدوات الشات', desc: 'أوامر حذف الرسائل والإعلانات والتفاعل', icon: '💬', items: [\n            { name: '/clear', desc: 'حذف عدد محدد من الرسائل', badge: 'صلاحيات ديسكورد', icon: '🗑️' },\n            { name: '/clearpinned', desc: 'حذف الرسائل المثبتة', badge: 'صلاحيات ديسكورد', icon: '🗑️' },\n            { name: '/clearbots', desc: 'حذف رسائل البوتات', badge: 'صلاحيات ديسكورد', icon: '🗑️' },\n            { name: '/clearuser', desc: 'حذف رسائل عضو معين', badge: 'صلاحيات ديسكورد', icon: '🗑️' },\n            { name: '/say', desc: 'إرسال رسالة عبر البوت', badge: 'صلاحيات ديسكورد', icon: '💬' },\n            { name: '/embed', desc: 'إنشاء Embed مخصص', badge: 'صلاحيات ديسكورد', icon: '📦' },\n            { name: '/poll', desc: 'إنشاء استطلاع رأي', badge: 'صلاحيات ديسكورد', icon: '📊' },\n            { name: '/remind', desc: 'تعيين تذكير مؤقت', badge: '', icon: '⏰' },\n            { name: '/announce', desc: 'إرسال إعلان رسمي', badge: 'صلاحيات ديسكورد', icon: '📢' },\n            { name: '/broadcast', desc: 'بث رسالة في جميع القنوات', badge: 'صلاحيات ديسكورد', icon: '📡' },\n            { name: '/translate', desc: 'ترجمة نص إلى لغة أخرى', badge: '', icon: '🌐' },\n            { name: '/quote', desc: 'اقتباس رسالة قديمة', badge: '', icon: '💬' }\n        ]},\n        voice: { title: 'إدارة الصوت', desc: 'أوامر التحكم في قنوات الصوت والأعضاء', icon: '🎙️', items: [\n            { name: '/vcmute', desc: 'كتم عضو في الصوت', badge: 'صلاحيات ديسكورد', icon: '🔇' },\n            { name: '/vcunmute', desc: 'فك كتم عضو في الصوت', badge: 'صلاحيات ديسكورد', icon: '🔊' },\n            { name: '/vcdeafen', desc: 'صمم عضو في الصوت', badge: 'صلاحيات ديسكورد', icon: '🔕' },\n            { name: '/vcundeafen', desc: 'فك تصميم عضو في الصوت', badge: 'صلاحيات ديسكورد', icon: '🔔' },\n            { name: '/vckick', desc: 'طرد عضو من قناة الصوت', badge: 'صلاحيات ديسكورد', icon: '👢' },\n            { name: '/vcmove', desc: 'نقل عضو بين قنوات الصوت', badge: 'صلاحيات ديسكورد', icon: '🔀' },\n            { name: '/vcmoveall', desc: 'نقل جميع الأعضاء لقناة أخرى', badge: 'صلاحيات ديسكورد', icon: '🔀' },\n            { name: '/vclimit', desc: 'تحديد الحد الأقصى للمستخدمين', badge: 'صلاحيات ديسكورد', icon: '🔢' },\n            { name: '/vclock', desc: 'قفل قناة الصوت', badge: 'صلاحيات ديسكورد', icon: '🔒' },\n            { name: '/vcunlock', desc: 'فتح قناة الصوت', badge: 'صلاحيات ديسكورد', icon: '🔓' },\n            { name: '/vchide', desc: 'إخفاء قناة الصوت', badge: 'صلاحيات ديسكورد', icon: '👁️' },\n            { name: '/vcunhide', desc: 'إظهار قناة الصوت', badge: 'صلاحيات ديسكورد', icon: '👁️' },\n            { name: '/vcbitrate', desc: 'تغيير جودة الصوت (Bitrate)', badge: 'صلاحيات ديسكورد', icon: '🎵' },\n            { name: '/tempvoice', desc: 'إنشاء قناة صوتية مؤقتة', badge: '', icon: '⏳' },\n            { name: '/vcinfo', desc: 'معلومات قناة الصوت الحالية', badge: '', icon: '📊' },\n            { name: '/vcactivity', desc: 'تشغيل نشاط جماعي بالصوت', badge: '', icon: '🎮' },\n            { name: '/vcrename', desc: 'تغيير اسم قناة الصوت', badge: 'صلاحيات ديسكورد', icon: '✏️' },\n            { name: '/vcpermit', desc: 'السماح لعضو بالدخول', badge: 'صلاحيات ديسكورد', icon: '✅' },\n            { name: '/vcreject', desc: 'منع عضو من الدخول', badge: 'صلاحيات ديسكورد', icon: '🚫' }\n        ]},\n        roles: { title: 'إدارة الرتب', desc: 'أوامر إعطاء وإزالة وإنشاء الرتب', icon: '🎖️', items: [\n            { name: '/giverole', desc: 'إعطاء رتبة لعضو', badge: 'صلاحيات ديسكورد', icon: '🎁' },\n            { name: '/removerole', desc: 'إزالة رتبة من عضو', badge: 'صلاحيات ديسكورد', icon: '❌' },\n            { name: '/roleall', desc: 'إعطاء رتبة لجميع الأعضاء', badge: 'صلاحيات ديسكورد', icon: '👥' },\n            { name: '/rolebots', desc: 'إعطاء رتبة لجميع البوتات', badge: 'صلاحيات ديسكورد', icon: '🤖' },\n            { name: '/rolehumans', desc: 'إعطاء رتبة لجميع البشر', badge: 'صلاحيات ديسكورد', icon: '👤' },\n            { name: '/createrole', desc: 'إنشاء رتبة جديدة', badge: 'صلاحيات ديسكورد', icon: '✨' },\n            { name: '/deleterole', desc: 'حذف رتبة من السيرفر', badge: 'صلاحيات ديسكورد', icon: '🗑️' },\n            { name: '/rolecolor', desc: 'تغيير لون رتبة', badge: 'صلاحيات ديسكورد', icon: '🎨' },\n            { name: '/roleinfo', desc: 'معلومات رتبة مفصلة', badge: '', icon: '📋' },\n            { name: '/inrole', desc: 'قائمة أعضاء رتبة معينة', badge: '', icon: '👥' }\n        ]},\n        custom_roles: { title: 'الرتب الخاصة', desc: 'أوامر الرتب الشخصية المخصصة لكل عضو', icon: '👑', items: [\n            { name: '/customrole', desc: 'إنشاء رتبة خاصة بك', badge: '', icon: '👑' },\n            { name: '/myrole', desc: 'عرض معلومات رتبتك الخاصة', badge: '', icon: '👤' },\n            { name: '/myrole-color', desc: 'تغيير لون رتبتك الخاصة', badge: '', icon: '🎨' },\n            { name: '/myrole-name', desc: 'تغيير اسم رتبتك الخاصة', badge: '', icon: '✏️' },\n            { name: '/myrole-icon', desc: 'تغيير أيقونة رتبتك الخاصة', badge: '', icon: '🖼️' },\n            { name: '/myrole-give', desc: 'مشاركة رتبتك الخاصة مع عضو', badge: '', icon: '🎁' },\n            { name: '/myrole-remove', desc: 'إلغاء مشاركة الرتبة مع عضو', badge: '', icon: '❌' },\n            { name: '/myrole-delete', desc: 'حذف رتبتك الخاصة نهائياً', badge: '', icon: '🗑️' },\n            { name: '/customroles-list', desc: 'قائمة جميع الرتب الخاصة', badge: 'صلاحيات ديسكورد', icon: '📋' }\n        ]},\n        server_info: { title: 'معلومات السيرفر', desc: 'أوامر عرض إحصائيات ومعلومات السيرفر', icon: '📊', items: [\n            { name: '/serverinfo', desc: 'معلومات السيرفر الشاملة', badge: '', icon: '🏠' },\n            { name: '/serverbanner', desc: 'بنر السيرفر الرسمي', badge: '', icon: '🎨' },\n            { name: '/servericon', desc: 'أيقونة السيرفر بدقة عالية', badge: '', icon: '🖼️' },\n            { name: '/serverstats', desc: 'إحصائيات السيرفر المفصلة', badge: '', icon: '📊' },\n            { name: '/boosts', desc: 'قائمة المبوستين وعدد البوستات', badge: '', icon: '💎' },\n            { name: '/invites-top', desc: 'أكثر الأعضاء دعوةً', badge: '', icon: '🔗' },\n            { name: '/channels-list', desc: 'قائمة كاملة بالقنوات', badge: '', icon: '📁' },\n            { name: '/roles-list', desc: 'قائمة وتوزيع الرتب', badge: '', icon: '🎖️' },\n            { name: '/emojis-list', desc: 'قائمة الإيموجيات المخصصة', badge: '', icon: '😃' },\n            { name: '/stickers-list', desc: 'قائمة الستيكرات', badge: '', icon: '🏷️' },\n            { name: '/bans-list', desc: 'قائمة المحظورين', badge: 'صلاحيات ديسكورد', icon: '🔨' },\n            { name: '/admins', desc: 'قائمة الإدارة والمشرفين', badge: '', icon: '👮' },\n            { name: '/bots', desc: 'قائمة بوتات السيرفر', badge: '', icon: '🤖' },\n            { name: '/vanity', desc: 'رابط السيرفر المخصص', badge: '', icon: '🌐' },\n            { name: '/features', desc: 'ميزات السيرفر المفعلة', badge: '', icon: '✨' },\n            { name: '/created', desc: 'تاريخ إنشاء السيرفر', badge: '', icon: '📅' },\n            { name: '/uptime', desc: 'مدة تشغيل البوت', badge: '', icon: '⏱️' },\n            { name: '/ping', desc: 'سرعة الاستجابة', badge: '', icon: '📶' },\n            { name: '/shards', desc: 'معلومات الشاردات', badge: '', icon: '🖧' }\n        ]},\n        custom_bot: { title: 'أدوات البوت الخاص', desc: 'أوامر تخصيص مظهر وحالة البوت الخاص', icon: '🤖', items: [\n            { name: '/bot-setnick', desc: 'تغيير اسم البوت في السيرفر', badge: 'صلاحيات ديسكورد', icon: '✏️' },\n            { name: '/bot-setavatar', desc: 'تغيير صورة البوت', badge: 'صلاحيات ديسكورد', icon: '🖼️' },\n            { name: '/bot-setbanner', desc: 'تغيير بنر البوت', badge: 'صلاحيات ديسكورد', icon: '🎨' },\n            { name: '/bot-setactivity', desc: 'تغيير نشاط وحالة البوت', badge: 'صلاحيات ديسكورد', icon: '🎮' },\n            { name: '/bot-setstatus', desc: 'تغيير حالة التواجد Online/DND/Idle', badge: 'صلاحيات ديسكورد', icon: '🟢' }\n        ]},\n        security: { title: 'الحماية', desc: 'أوامر الحماية من التخريب ومكافحة السبام', icon: '🛡️', items: [\n            { name: '/antiraid', desc: 'تفعيل/تعطيل مكافحة الغزو', badge: 'صلاحيات ديسكورد', icon: '🚨' },\n            { name: '/antinuke', desc: 'إعدادات جدار الحماية Anti-Nuke', badge: 'صلاحيات ديسكورد', icon: '🛡️' },\n            { name: '/whitelist-add', desc: 'إضافة عضو للقائمة البيضاء', badge: 'صلاحيات ديسكورد', icon: '⚪' },\n            { name: '/whitelist-remove', desc: 'إزالة عضو من القائمة البيضاء', badge: 'صلاحيات ديسكورد', icon: '⚫' },\n            { name: '/whitelist-list', desc: 'عرض القائمة البيضاء', badge: 'صلاحيات ديسكورد', icon: '📋' },\n            { name: '/antibot', desc: 'منع دخول البوتات غير الموثقة', badge: 'صلاحيات ديسكورد', icon: '🤖' },\n            { name: '/antispam', desc: 'مكافحة السبام والرسائل المتكررة', badge: 'صلاحيات ديسكورد', icon: '⚡' },\n            { name: '/antilink', desc: 'منع نشر الروابط', badge: 'صلاحيات ديسكورد', icon: '🔗' },\n            { name: '/backup-create', desc: 'إنشاء نسخة احتياطية للسيرفر', badge: 'صلاحيات ديسكورد', icon: '📦' },\n            { name: '/backup-load', desc: 'استعادة نسخة احتياطية', badge: 'صلاحيات ديسكورد', icon: '🔄' },\n            { name: '/backup-list', desc: 'قائمة النسخ الاحتياطية', badge: 'صلاحيات ديسكورد', icon: '📜' },\n            { name: '/lockdown', desc: 'إغلاق كامل قنوات السيرفر فوراً', badge: 'صلاحيات ديسكورد', icon: '🔒' },\n            { name: '/unlockdown', desc: 'إعادة فتح جميع القنوات المغلقة', badge: 'صلاحيات ديسكورد', icon: '🔓' },\n            { name: '/security-status', desc: 'تقرير حالة الحماية', badge: '', icon: '📊' },\n            { name: '/security-audit', desc: 'فحص ثغرات وصلاحيات السيرفر', badge: 'صلاحيات ديسكورد', icon: '🔍' }\n        ]},\n        levels_cat: { title: 'المستويات والخبرة', desc: 'أوامر المستويات وبطاقات الرانك', icon: '⭐', items: [\n            { name: '/rank', desc: 'عرض بطاقة مستواك الحالية', badge: '', icon: '💳' },\n            { name: '/levels-leaderboard', desc: 'المتصدرين في المستويات', badge: '', icon: '🏆' },\n            { name: '/setxp', desc: 'تعديل نقاط الخبرة لعضو', badge: 'صلاحيات ديسكورد', icon: '⚡' },\n            { name: '/setlevel', desc: 'تعديل مستوى عضو', badge: 'صلاحيات ديسكورد', icon: '🎖️' },\n            { name: '/resetlevels', desc: 'تصفير نظام المستويات', badge: 'صلاحيات ديسكورد', icon: '🗑️' },\n            { name: '/level-reward-add', desc: 'إضافة رتبة مكافأة عند مستوى', badge: 'صلاحيات ديسكورد', icon: '🎁' },\n            { name: '/level-reward-remove', desc: 'إزالة رتبة مكافأة', badge: 'صلاحيات ديسكورد', icon: '❌' },\n            { name: '/level-rewards-list', desc: 'قائمة جميع رتب المكافآت', badge: '', icon: '📜' },\n            { name: '/levelcard-bg', desc: 'تغيير خلفية بطاقة الرانك', badge: '', icon: '🎨' },\n            { name: '/doublexp', desc: 'تفعيل مضاعفة الخبرة 2x', badge: 'صلاحيات ديسكورد', icon: '🚀' }\n        ]},\n        server_stats: { title: 'إحصائيات السيرفر', desc: 'أوامر قنوات العدادات التلقائية', icon: '📈', items: [\n            { name: '/stats-setup', desc: 'إنشاء قنوات عدادات السيرفر', badge: 'صلاحيات ديسكورد', icon: '📊' },\n            { name: '/stats-members', desc: 'تفعيل عداد الأعضاء', badge: 'صلاحيات ديسكورد', icon: '👥' },\n            { name: '/stats-bots', desc: 'تفعيل عداد البوتات', badge: 'صلاحيات ديسكورد', icon: '🤖' },\n            { name: '/stats-channels', desc: 'تفعيل عداد القنوات', badge: 'صلاحيات ديسكورد', icon: '📁' },\n            { name: '/stats-roles', desc: 'تفعيل عداد الرتب', badge: 'صلاحيات ديسكورد', icon: '🎖️' },\n            { name: '/stats-boosts', desc: 'تفعيل عداد البوستات', badge: 'صلاحيات ديسكورد', icon: '💎' },\n            { name: '/stats-online', desc: 'تفعيل عداد المتواجدين أونلاين', badge: 'صلاحيات ديسكورد', icon: '🟢' },\n            { name: '/stats-voice', desc: 'تفعيل عداد المتواجدين في الصوت', badge: 'صلاحيات ديسكورد', icon: '🎙️' },\n            { name: '/stats-delete', desc: 'حذف جميع قنوات العدادات', badge: 'صلاحيات ديسكورد', icon: '🗑️' },\n            { name: '/stats-refresh', desc: 'تحديث فوري لأرقام العدادات', badge: 'صلاحيات ديسكورد', icon: '🔄' },\n            { name: '/stats-format', desc: 'تعديل شكل قنوات العدادات', badge: 'صلاحيات ديسكورد', icon: '✏️' }\n        ]},\n        profile_cat: { title: 'الملف الشخصي', desc: 'أوامر البروفايل والسمعة والعملات', icon: '👤', items: [\n            { name: '/profile', desc: 'عرض بطاقة بروفايلك الشاملة', badge: '', icon: '💳' },\n            { name: '/rep', desc: 'إعطاء نقطة سمعة لعضو (+rep)', badge: '', icon: '⭐' },\n            { name: '/daily', desc: 'استلام الراتب اليومي (Gold)', badge: '', icon: '🪙' },\n            { name: '/coins', desc: 'رصيدك من عملات Gold', badge: '', icon: '💰' },\n            { name: '/pay', desc: 'تحويل عملات Gold لعضو آخر', badge: '', icon: '💸' },\n            { name: '/setbio', desc: 'تعديل النبذة الشخصية', badge: '', icon: '📝' },\n            { name: '/settitle', desc: 'تعديل اللقب الشخصي', badge: '', icon: '🏷️' },\n            { name: '/setbadge', desc: 'تعديل الشارة المفضلة', badge: '', icon: '🎖️' },\n            { name: '/profile-bg', desc: 'تغيير خلفية بطاقة البروفايل', badge: '', icon: '🎨' },\n            { name: '/marry', desc: 'الزواج التفاعلي في السيرفر', badge: '', icon: '💍' }\n        ]},\n        fun_games: { title: 'التسلية والألعاب', desc: 'ألعاب ديسكورد التفاعلية والتسلية مع الأعضاء', icon: '🎮', items: [\n            { name: '/games', desc: 'لوحة الألعاب التفاعلية الرئيسية مع أزرار', badge: '', icon: '🎮' },\n            { name: '/trivia', desc: 'لعبة سؤال وجواب بأسئلة متنوعة', badge: '', icon: '❓' },\n            { name: '/chairs', desc: 'لعبة الكراسي الموسيقية التفاعلية', badge: '', icon: '🪑' },\n            { name: '/coinflip', desc: 'لعبة رمي العملة وتوقع النتيجة', badge: '', icon: '🪙' },\n            { name: '/fight', desc: 'تحدي معركة مع عضو آخر', badge: '', icon: '⚔️' },\n            { name: '/hideseek', desc: 'لعبة الغميضة والاختباء', badge: '', icon: '🙈' },\n            { name: '/mafia', desc: 'لعبة المافيا الجماعية الاستراتيجية', badge: '', icon: '🎭' },\n            { name: '/roulette', desc: 'لعبة الروليت والمخاطرة', badge: '', icon: '🎰' }\n        ]}\n    };\n\n    var catBtnMap = {\n        basic:'btnCatBasic', punishments:'btnCatPunishments', punishment_logs:'btnCatPunishmentLogs',\n        channels:'btnCatChannels', chat:'btnCatChat', voice:'btnCatVoice',\n        roles:'btnCatRoles', custom_roles:'btnCatCustomRoles', server_info:'btnCatServerInfo',\n        custom_bot:'btnCatCustomBot', security:'btnCatSecurity', levels_cat:'btnCatLevels',\n        server_stats:'btnCatServerStats', profile_cat:'btnCatProfile', fun_games:'btnCatFunGames'\n    };\n    var catBadgeMap = {\n        basic:'badgeCatBasic', punishments:'badgeCatPunishments', punishment_logs:'badgeCatPunishmentLogs',\n        channels:'badgeCatChannels', chat:'badgeCatChat', voice:'badgeCatVoice',\n        roles:'badgeCatRoles', custom_roles:'badgeCatCustomRoles', server_info:'badgeCatServerInfo',\n        custom_bot:'badgeCatCustomBot', security:'badgeCatSecurity', levels_cat:'badgeCatLevels',\n        server_stats:'badgeCatServerStats', profile_cat:'badgeCatProfile', fun_games:'badgeCatFunGames'\n    };\n\n    var currentCat = 'punishments';\n    var currentFilter = 'all';\n    var disabledCmds = {};\n\n    function isEn(name) { return !disabledCmds[name]; }\n\n    function render() {\n        var container = document.getElementById('cmdsListContainer');\n        if (!container) return;\n        var data = DB[currentCat] || DB.punishments;\n        var t = document.getElementById('catTitle');\n        var d = document.getElementById('catDesc');\n        var ic = document.getElementById('catIcon');\n        if (t) t.innerText = data.title;\n        if (d) d.innerText = data.desc;\n        if (ic) ic.innerText = data.icon;\n        var searchEl = document.getElementById('cmdSearchInput');\n        var sv = searchEl ? searchEl.value.toLowerCase().trim() : '';\n        var filtered = data.items.filter(function(item) {\n            if (currentFilter === 'enabled' && !isEn(item.name)) return false;\n            if (currentFilter === 'disabled' && isEn(item.name)) return false;\n            if (sv && item.name.toLowerCase().indexOf(sv) === -1 && item.desc.toLowerCase().indexOf(sv) === -1) return false;\n            return true;\n        });\n        if (!filtered.length) {\n            container.innerHTML = '<div class=\"py-12 bg-[#12141f] border border-white/5 rounded-2xl text-center text-xs text-gray-500\">لا توجد أوامر مطابقة 🔍</div>';\n            updateCounters(); return;\n        }\n        var html = '';\n        for (var i = 0; i < filtered.length; i++) {\n            var item = filtered[i];\n            var en = isEn(item.name);\n            var bh = item.badge ? '<span class=\"px-2.5 py-0.5 bg-purple-950/60 text-purple-300 border border-purple-800/40 rounded-lg text-[10px] font-bold flex items-center gap-1\"><span>' + item.badge + '</span><span>&#128737;</span></span>' : '';\n            html += '<div class=\"bg-[#12141f] border border-white/5 p-4 rounded-2xl flex items-center justify-between hover:border-purple-500/40 transition' + (en ? '' : ' opacity-50') + '\" data-cmd=\"' + item.name + '\">';\n            html += '<div class=\"flex items-center gap-3\">';\n            html += '<label class=\"toggle\"><input type=\"checkbox\" data-cmd=\"' + item.name + '\"' + (en ? ' checked' : '') + '><span class=\"slider\"></span></label>';\n            html += '<button type=\"button\" class=\"text-gray-500 hover:text-white text-xs\">&#9660;</button>';\n            html += '</div>';\n            html += '<div class=\"flex items-center gap-3\">';\n            html += '<div class=\"text-right\">';\n            html += '<div class=\"flex items-center justify-end gap-2\">' + bh + '<span class=\"font-black text-white text-xs font-mono\">' + item.name + '</span></div>';\n            html += '<p class=\"text-[11px] text-gray-400 mt-0.5\">' + item.desc + '</p>';\n            html += '</div>';\n            html += '<div class=\"w-9 h-9 rounded-xl bg-[#0b0d14] border border-white/5 flex items-center justify-center text-sm shadow-inner\">' + (item.icon || '&#9881;') + '</div>';\n            html += '</div></div>';\n        }\n        container.innerHTML = html;\n        // Attach events to checkboxes (event delegation-safe)\n        var checks = container.querySelectorAll('input[type=\"checkbox\"][data-cmd]');\n        for (var j = 0; j < checks.length; j++) {\n            (function(cb) {\n                cb.addEventListener('change', function() {\n                    window.toggleSingleCmd(cb.getAttribute('data-cmd'), cb.checked);\n                    var card = cb.closest('div[data-cmd]');\n                    if (card) { if (cb.checked) card.classList.remove('opacity-50'); else card.classList.add('opacity-50'); }\n                });\n            })(checks[j]);\n        }\n        updateCounters();\n    }\n\n    function updateCounters() {\n        var total = 0, enabled = 0;\n        var keys = Object.keys(DB);\n        for (var i = 0; i < keys.length; i++) {\n            var cat = keys[i];\n            var items = DB[cat].items;\n            total += items.length;\n            var catEn = 0;\n            for (var j = 0; j < items.length; j++) { if (isEn(items[j].name)) catEn++; }\n            enabled += catEn;\n            var bId = catBadgeMap[cat];\n            if (bId) {\n                var badge = document.getElementById(bId);\n                if (badge) {\n                    badge.textContent = catEn + '/' + items.length;\n                    badge.className = catEn === 0\n                        ? 'px-2 py-0.5 bg-rose-950/60 text-rose-400 rounded-lg text-[10px] font-mono'\n                        : catEn < items.length\n                            ? 'px-2 py-0.5 bg-amber-950/60 text-amber-400 rounded-lg text-[10px] font-mono'\n                            : 'px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono';\n                }\n            }\n        }\n        var te = document.getElementById('totalCmdsCount');\n        var ee = document.getElementById('enabledCmdsCount');\n        if (te) te.textContent = total;\n        if (ee) ee.textContent = enabled;\n    }\n\n    function showSaved() {\n        var el = document.getElementById('cmdSaveIndicator');\n        if (el) { el.classList.remove('opacity-0'); setTimeout(function() { el.classList.add('opacity-0'); }, 2000); }\n    }\n\n    function saveStates() {\n        try {\n            var gId = window.location.pathname.split('/')[2];\n            if (!gId) return;\n            var disArr = Object.keys(disabledCmds).filter(function(k) { return disabledCmds[k]; });\n            var xhr = new XMLHttpRequest();\n            xhr.open('POST', '/api/guild/' + gId + '/settings', true);\n            xhr.setRequestHeader('Content-Type', 'application/json');\n            xhr.onload = function() { try { if (JSON.parse(xhr.responseText).success) showSaved(); } catch(e) {} };\n            xhr.send(JSON.stringify({ disabled_commands: JSON.stringify(disArr) }));\n        } catch(e) {}\n    }\n\n    window.switchCmdCategory = function(catKey) {\n        currentCat = catKey;\n        var bKeys = Object.keys(catBtnMap);\n        for (var i = 0; i < bKeys.length; i++) {\n            var btn = document.getElementById(catBtnMap[bKeys[i]]);\n            if (!btn) continue;\n            btn.className = bKeys[i] === catKey\n                ? 'w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold bg-purple-600 text-white shadow-lg transition cursor-pointer'\n                : 'w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer';\n        }\n        render();\n    };\n\n    window.searchCommands = function() { render(); };\n\n    window.filterCmdStatus = function(status) {\n        currentFilter = status;\n        var statusList = ['all','enabled','disabled'];\n        for (var i = 0; i < statusList.length; i++) {\n            var s = statusList[i];\n            var label = s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1);\n            var btn = document.getElementById('btnFilter' + label);\n            if (btn) btn.className = s === status\n                ? 'px-3 py-1 rounded-lg text-xs font-bold bg-purple-600 text-white transition shadow cursor-pointer'\n                : 'px-3 py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer';\n        }\n        render();\n    };\n\n    window.toggleAllCategoryCmds = function(enable) {\n        var items = (DB[currentCat] || DB.punishments).items;\n        for (var i = 0; i < items.length; i++) { disabledCmds[items[i].name] = !enable; }\n        saveStates(); render();\n    };\n\n    window.toggleSingleCmd = function(cmdName, enabled) {\n        disabledCmds[cmdName] = !enabled;\n        saveStates(); updateCounters();\n    };\n\n    // Run render immediately\n    render();\n})();\n</script>\n";
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
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Header -->
                        <div class="bg-gradient-to-r from-[#0a1a10] via-[#12141f] to-[#141724] border border-emerald-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-2xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-xl shadow-lg">📢</div>
                                <div class="text-right">
                                    <h3 class="font-black text-white text-lg">نظام الإعلانات والمذيع الآلي</h3>
                                    <p class="text-gray-400 text-xs mt-0.5">جدولة وإرسال إعلانات دورية تلقائية بتضمينات جذابة وتحديثات آلية</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-xs font-bold ${settings.broadcast_enabled ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-500/30' : 'text-red-400 bg-red-950/60 border border-red-500/30'} px-3 py-1 rounded-xl">${settings.broadcast_enabled ? '🟢 مفعل' : '🔴 معطل'}</span>
                            </div>
                        </div>

                        <!-- Master Toggle & Channel -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-3xl flex items-center justify-between shadow-xl">
                                <label class="toggle">
                                    <input type="checkbox" name="broadcast_enabled" value="1" id="broadcastToggle" onchange="document.getElementById('broadcastContent').classList.toggle('opacity-40', !this.checked)" ${settings.broadcast_enabled ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">تفعيل المذيع الآلي</h4>
                                        <p class="text-gray-400 text-xs mt-0.5">إرسال رسائل إعلانية دورية تلقائياً في القناة المحددة</p>
                                    </div>
                                    <div class="w-8 h-8 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center text-sm border border-emerald-500/30">📡</div>
                                </div>
                            </div>

                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-3xl space-y-2 shadow-xl text-right">
                                <h4 class="font-black text-white text-sm flex items-center justify-end gap-2"><span>قناة البث</span><span>📻</span></h4>
                                ${renderChannelSelect('broadcast_channel', settings.broadcast_channel)}
                            </div>
                        </div>

                        <!-- Broadcast Content Area -->
                        <div id="broadcastContent" class="${settings.broadcast_enabled ? '' : 'opacity-40'} transition-opacity space-y-6">

                            <!-- Interval & Mention Role -->
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

                                <!-- Interval Selector -->
                                <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl text-right">
                                    <h4 class="font-black text-white text-sm flex items-center justify-end gap-2"><span>فترة التكرار</span><span>⏱️</span></h4>
                                    <input type="hidden" name="broadcast_interval" id="inpBroadcastInterval" value="${settings.broadcast_interval || 60}">
                                    <div class="grid grid-cols-2 gap-2">
                                        ${[15, 30, 60, 120, 360, 720, 1440, 2880].map(m => `
                                        <button type="button" onclick="selectBroadcastInterval(${m}, this)" class="bc-interval-btn py-2.5 px-3 rounded-xl border text-xs font-bold transition ${(settings.broadcast_interval || 60) == m ? 'bg-purple-900/40 border-purple-500 text-white' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white'}">
                                            ${m < 60 ? m + ' دقيقة' : m === 60 ? 'ساعة' : m < 1440 ? (m/60) + ' ساعات' : (m/1440) + ' يوم'}
                                        </button>`).join('')}
                                    </div>
                                </div>

                                <!-- Mention Role -->
                                <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-3 shadow-xl text-right">
                                    <h4 class="font-black text-white text-sm flex items-center justify-end gap-2"><span>رتبة الإشارة (اختياري)</span><span>📣</span></h4>
                                    <p class="text-gray-400 text-[11px]">رتبة يتم ذكرها تلقائياً مع كل إعلان للتنبيه</p>
                                    ${renderRoleSelect('broadcast_mention_role', settings.broadcast_mention_role)}
                                </div>
                            </div>

                            <!-- Messages List & Add New -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl">
                                <div class="flex items-center justify-between border-b border-white/5 pb-4">
                                    <button type="button" onclick="addBroadcastMessage()" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5">
                                        <span>➕</span><span>إضافة رسالة جديدة</span>
                                    </button>
                                    <h4 class="font-black text-white text-sm flex items-center gap-2"><span>قائمة رسائل البث</span><span>📋</span></h4>
                                </div>

                                <div id="broadcastMsgList" class="space-y-3">
                                    ${(() => {
                                        let msgs = [];
                                        try { msgs = JSON.parse(settings.broadcast_messages || '[]'); } catch(e) {}
                                        if (msgs.length === 0) return `<div class="text-center py-8 text-xs text-gray-500">لا توجد رسائل مضافة بعد — أضف رسالتك الأولى أعلاه 📢</div>`;
                                        return msgs.map((m, i) => `
                                        <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-2xl flex items-start justify-between gap-3 hover:border-purple-500/20 transition" id="bcMsg${i}">
                                            <div class="flex items-center gap-2 shrink-0 mt-1">
                                                <button type="button" onclick="deleteBroadcastMessage(${i})" class="text-rose-400 hover:text-rose-300 text-sm transition">🗑️</button>
                                                <span class="w-6 h-6 rounded-lg bg-purple-950/60 text-purple-300 text-[10px] font-black flex items-center justify-center border border-purple-500/20">${i+1}</span>
                                            </div>
                                            <p class="text-xs text-gray-300 text-right leading-relaxed flex-1 truncate">${m}</p>
                                        </div>`).join('');
                                    })()}
                                </div>

                                <!-- Add Message Input Area (hidden by default) -->
                                <div id="addMsgArea" class="hidden space-y-3 border-t border-white/5 pt-4">
                                    <textarea id="newBcMsgInput" rows="3" placeholder="اكتب نص الإعلان هنا... (يدعم markdown ومتغيرات مثل {server} و {members})" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right leading-relaxed transition"></textarea>
                                    <div class="flex items-center gap-2 justify-end">
                                        <button type="button" onclick="cancelAddMessage()" class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold transition">إلغاء</button>
                                        <button type="button" onclick="confirmAddMessage()" class="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition">✓ إضافة</button>
                                    </div>
                                </div>
                            </div>

                            <!-- Send Now (Manual Broadcast) -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-3xl flex items-center justify-between shadow-xl">
                                <button type="button" onclick="sendBroadcastNow()" id="btnBroadcastNow" class="px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-xl text-xs font-black transition shadow-lg flex items-center gap-2">
                                    <span>📤</span>
                                    <span>إرسال الآن يدوياً</span>
                                </button>
                                <div class="text-right">
                                    <h4 class="font-black text-white text-sm">إرسال فوري</h4>
                                    <p class="text-gray-400 text-[11px] mt-0.5">إرسال رسالة عشوائية من القائمة فوراً إلى القناة المحددة</p>
                                </div>
                            </div>

                        </div>

                    </div>

                    <script>
                    let broadcastMsgs = [];
                    try { broadcastMsgs = JSON.parse('${(settings.broadcast_messages || '[]').replace(/'/g, "\\'")}'); } catch(e) {}

                    function selectBroadcastInterval(interval, btn) {
                        document.getElementById('inpBroadcastInterval').value = interval;
                        document.querySelectorAll('.bc-interval-btn').forEach(b => {
                            b.className = 'bc-interval-btn py-2.5 px-3 rounded-xl border text-xs font-bold transition bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white';
                        });
                        btn.className = 'bc-interval-btn py-2.5 px-3 rounded-xl border text-xs font-bold transition bg-purple-900/40 border-purple-500 text-white';
                    }

                    function addBroadcastMessage() {
                        document.getElementById('addMsgArea').classList.remove('hidden');
                        document.getElementById('newBcMsgInput').focus();
                    }

                    function cancelAddMessage() {
                        document.getElementById('addMsgArea').classList.add('hidden');
                        document.getElementById('newBcMsgInput').value = '';
                    }

                    async function confirmAddMessage() {
                        const txt = document.getElementById('newBcMsgInput').value.trim();
                        if (!txt) return alert('يرجى كتابة نص الرسالة أولاً!');
                        broadcastMsgs.push(txt);
                        await saveBroadcastMessages();
                        cancelAddMessage();
                        location.reload();
                    }

                    async function deleteBroadcastMessage(idx) {
                        if (!confirm('هل تريد حذف هذه الرسالة؟')) return;
                        broadcastMsgs.splice(idx, 1);
                        await saveBroadcastMessages();
                        location.reload();
                    }

                    async function saveBroadcastMessages() {
                        await fetch('/api/guild/${guildId}/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ broadcast_messages: JSON.stringify(broadcastMsgs) })
                        });
                    }

                    async function sendBroadcastNow() {
                        const btn = document.getElementById('btnBroadcastNow');
                        btn.disabled = true;
                        btn.innerHTML = '⏳ جارٍ الإرسال...';
                        try {
                            const res = await fetch('/api/guild/${guildId}/broadcast-now', { method: 'POST' });
                            const d = await res.json();
                            if (d.success) {
                                btn.innerHTML = '✅ تم الإرسال!';
                                setTimeout(() => { btn.disabled = false; btn.innerHTML = '📤 إرسال الآن يدوياً'; }, 3000);
                            } else {
                                alert('❌ ' + (d.error || 'فشل الإرسال. تأكد من ضبط القناة وإضافة رسائل في القائمة.'));
                                btn.disabled = false;
                                btn.innerHTML = '📤 إرسال الآن يدوياً';
                            }
                        } catch(e) {
                            btn.disabled = false;
                            btn.innerHTML = '📤 إرسال الآن يدوياً';
                        }
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
                                    <button type="button" onclick="addWhitelistUser('antimod')" class="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
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
                            <button type="button" onclick="switchWelcomeTab('welcome')" id="btnTabWelcome" class="px-5 py-2 rounded-xl text-xs font-bold transition bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-lg">
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
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة الترحيب <span class="text-purple-400">*</span></label>
                                    ${renderChannelSelect('welcome_channel', settings.welcome_channel || '')}
                                </div>

                                <div class="space-y-2">
                                    <div class="flex items-center justify-between text-xs text-gray-400 font-bold">
                                        <span>☺</span>
                                        <span>رسالة الترحيب (نص عادي)</span>
                                    </div>
                                    <textarea name="welcome_message" id="welcomeText" rows="3" oninput="updateWelcomePreview()" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-500 rounded-xl p-4 text-xs text-white outline-none leading-relaxed text-right">${settings.welcome_message || 'مرحباً {user} في سيرفر **{server}**! 🎉 أنت العضو رقم **{memberCount}**'}</textarea>
                                    
                                    <!-- Variables Pill Badges -->
                                    <div class="flex items-center justify-between pt-1">
                                        <span class="text-[10px] text-gray-500">إذا تريد فقط Embed أو صورة بدون نص، اترك الرسالة فارغة.</span>
                                        <div class="flex flex-wrap gap-1.5 justify-end">
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{user}')">{user}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{username}')">{username}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{server}')">{server}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{memberCount}')">{memberCount}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{inviter}')">{inviter}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{joinDate}')">{joinDate}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Card 3: خيارات الترحيب الثلاثة (نص فقط / صورة ترحيب / رسالة Embed) -->
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <button type="button" onclick="setWelcomeType('text')" id="btnWlTypeText" class="p-4 rounded-2xl border ${settings.welcome_embed_enabled === 0 && !settings.welcome_image ? 'border-purple-500 bg-orange-950/20 text-white' : 'border-white/5 bg-[#12141f] text-gray-400'} text-center transition">
                                    <h5 class="font-bold text-xs">نص فقط</h5>
                                    <p class="text-[10px] text-gray-500 mt-1">رسالة نصية بسيطة</p>
                                </button>
                                <button type="button" onclick="setWelcomeType('image')" id="btnWlTypeImage" class="p-4 rounded-2xl border ${settings.welcome_image ? 'border-purple-500 bg-orange-950/20 text-white' : 'border-white/5 bg-[#12141f] text-gray-400'} text-center transition">
                                    <h5 class="font-bold text-xs">صورة ترحيب</h5>
                                    <p class="text-[10px] text-gray-500 mt-1">صورة مخصصة مع اسم العضو</p>
                                </button>
                                <button type="button" onclick="setWelcomeType('embed')" id="btnWlTypeEmbed" class="p-4 rounded-2xl border ${settings.welcome_embed_enabled !== 0 ? 'border-purple-500 bg-orange-950/20 text-white' : 'border-white/5 bg-[#12141f] text-gray-400'} text-center transition">
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
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{user}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{username}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{server}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{memberCount}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{user.avatar}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{inviter}</span>
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
                                            <button type="button" onclick="setWlColor('#9333ea')" class="w-4 h-4 rounded-md bg-[#9333ea]"></button>
                                            <button type="button" onclick="setWlColor('#ef5700')" class="w-4 h-4 rounded-md bg-[#ef5700] ring-2 ring-white/50"></button>
                                        </div>
                                    </div>
                                </div>

                                <!-- Live Interactive Embed Card (Exact to Image 3) -->
                                <div id="wlPreviewEmbed" class="bg-[#0b0d14] border-r-4 border-purple-500 rounded-xl p-5 space-y-4 text-right shadow-inner">
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
                                            <button type="button" onclick="setLvColor('#9333ea')" class="w-4 h-4 rounded-md bg-[#9333ea]"></button>
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
                            btnWl.className = "px-5 py-2 rounded-xl text-xs font-bold transition bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-lg";
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
                        
                        document.getElementById('btnWlTypeText').className = type === 'text' ? 'p-4 rounded-2xl border border-purple-500 bg-orange-950/20 text-white text-center transition' : 'p-4 rounded-2xl border border-white/5 bg-[#12141f] text-gray-400 text-center transition';
                        document.getElementById('btnWlTypeImage').className = type === 'image' ? 'p-4 rounded-2xl border border-purple-500 bg-orange-950/20 text-white text-center transition' : 'p-4 rounded-2xl border border-white/5 bg-[#12141f] text-gray-400 text-center transition';
                        document.getElementById('btnWlTypeEmbed').className = type === 'embed' ? 'p-4 rounded-2xl border border-purple-500 bg-orange-950/20 text-white text-center transition' : 'p-4 rounded-2xl border border-white/5 bg-[#12141f] text-gray-400 text-center transition';
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
                            <button type="button" onclick="openAddAutoresponderModal()" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
                                <span>➕</span>
                                <span>إضافة رد تلقائي</span>
                            </button>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">الرد التلقائي</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">إعداد ردود تلقائية على كلمات أو عبارات معينة</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-purple-700/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30">
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
                                        <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/40 transition">
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
                                    <button type="button" onclick="openAddAutoresponderModal()" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-2 shadow-lg shadow-purple-950/40">
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
                                            <input type="text" id="arTrigger" placeholder="اكتب الكلمة أو العبارة..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                        </div>

                                        <!-- نوع المطابقة (Buttons: يحتوي على / مطابقة تامة / يبدأ بـ / ينتهي بـ / Regex) -->
                                        <div class="space-y-1.5">
                                            <label class="block text-xs font-bold text-gray-300">نوع المطابقة</label>
                                            <div class="grid grid-cols-5 gap-1 bg-[#0b0d14] p-1 rounded-xl border border-white/5 text-[10px] text-center">
                                                <button type="button" onclick="setArMatchMode('regex')" id="btnArRegex" class="py-1.5 rounded-lg text-gray-400 hover:text-white transition">Regex</button>
                                                <button type="button" onclick="setArMatchMode('ends')" id="btnArEnds" class="py-1.5 rounded-lg text-gray-400 hover:text-white transition">ينتهي بـ</button>
                                                <button type="button" onclick="setArMatchMode('starts')" id="btnArStarts" class="py-1.5 rounded-lg text-gray-400 hover:text-white transition">يبدأ بـ</button>
                                                <button type="button" onclick="setArMatchMode('exact')" id="btnArExact" class="py-1.5 rounded-lg text-gray-400 hover:text-white transition">مطابقة تامة</button>
                                                <button type="button" onclick="setArMatchMode('contains')" id="btnArContains" class="py-1.5 rounded-lg bg-purple-700 text-white font-bold transition">يحتوي على</button>
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
                                                <button type="button" onclick="setArReplyType('text')" id="btnArText" class="py-2 bg-purple-700 border border-purple-500 rounded-xl text-[11px] text-white font-bold flex items-center justify-center gap-1 transition">
                                                    <span>رد نصي</span>
                                                    <span>💬</span>
                                                </button>
                                            </div>
                                        </div>

                                        <!-- الرد والبادجات -->
                                        <div class="space-y-2">
                                            <label class="block text-xs font-bold text-gray-300">الرد</label>
                                            <textarea id="arReply" rows="3" placeholder="اكتب الرد..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-500 rounded-xl p-3 text-xs text-white outline-none leading-relaxed text-right"></textarea>
                                            <div class="flex flex-wrap gap-1 justify-end">
                                                <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertArVar('{user}')">{user}</span>
                                                <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertArVar('{server}')">{server}</span>
                                                <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertArVar('{channel}')">{channel}</span>
                                                <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertArVar('{memberCount}')">{memberCount}</span>
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
                                    <button type="button" onclick="submitNewAutoresponder()" class="px-8 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-purple-950/40">
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
                                    ? "py-1.5 rounded-lg bg-purple-700 text-white font-bold transition"
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
                                    ? "py-2 bg-purple-700 border border-purple-500 rounded-xl text-[11px] text-white font-bold flex items-center justify-center gap-1 transition"
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
                                <button type="button" onclick="switchLevelTab('settings')" id="btnTabLvlSettings" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(!currentTab || currentTab === 'settings') ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white'} flex items-center gap-1">
                                    <span>الإعدادات</span>
                                    <span>⚙️</span>
                                </button>
                                <button type="button" onclick="switchLevelTab('text_roles')" id="btnTabLvlText" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(currentTab === 'text_roles') ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white'} flex items-center gap-1">
                                    <span>رتب كتابية</span>
                                    <span>📜</span>
                                </button>
                                <button type="button" onclick="switchLevelTab('voice_roles')" id="btnTabLvlVoice" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(currentTab === 'voice_roles') ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white'} flex items-center gap-1">
                                    <span>رتب صوتية</span>
                                    <span>🎵</span>
                                </button>
                                <button type="button" onclick="switchLevelTab('shared_roles')" id="btnTabLvlShared" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(currentTab === 'shared_roles') ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white'} flex items-center gap-1">
                                    <span>رتب مشتركة</span>
                                    <span>✨</span>
                                </button>
                                <button type="button" onclick="switchLevelTab('leaderboard')" id="btnTabLvlLeaderboard" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(currentTab === 'leaderboard') ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white'} flex items-center gap-1">
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
                                        <span class="px-3 py-1 bg-orange-950/60 text-purple-400 border border-orange-800/40 rounded-xl font-mono text-sm" id="voiceMinMembersVal">${settings.level_voice_min_members || 2}</span>
                                        <span class="text-white">الحد الأدنى للأعضاء في القناة</span>
                                    </div>
                                    <input type="range" name="level_voice_min_members" min="1" max="10" value="${settings.level_voice_min_members || 2}" oninput="document.getElementById('voiceMinMembersVal').innerText = this.value" class="w-full accent-purple-600 cursor-pointer">
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
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{server}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{xp}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{level}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{user}</span>
                                        </div>
                                        <span class="font-bold text-white">رسالة رفع المستوى (كتابي)</span>
                                    </div>
                                    <input type="text" name="level_message" value="${settings.level_message || '🎉 مبروك {user}! وصلت للمستوى **{level}**!'}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>

                                <div class="space-y-2">
                                    <label class="block text-xs font-bold text-white text-right">رسالة رفع المستوى (صوتي)</label>
                                    <input type="text" name="level_voice_msg" value="${settings.level_voice_msg || '🎤 مبروك {user}! وصلت للمستوى الصوتي **{level}**!'}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
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
                                        <button type="button" onclick="openAddLevelRoleModal('text')" class="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
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
                                        <div class="bg-[#0b0d14] border border-white/5 p-3.5 rounded-xl flex items-center justify-between hover:border-purple-500/40 transition text-xs">
                                            <button type="button" onclick="deleteLevelRole(${r.id || r.level})" class="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                                            <div class="flex items-center gap-3">
                                                <div class="text-right">
                                                    <span class="font-bold text-white block">مستوى كتابي ${r.level}</span>
                                                    <span class="text-[10px] text-purple-400 font-mono">الرتبة: @${(guildRoles.find(role => role.id === r.role_id)?.name) || r.role_id}</span>
                                                </div>
                                                <span class="w-8 h-8 rounded-lg bg-purple-700/20 text-purple-400 flex items-center justify-center font-bold">📜</span>
                                            </div>
                                        </div>
                                    `).join('') : `
                                        <div class="py-12 text-center space-y-3">
                                            <div class="w-12 h-12 rounded-full bg-white/5 text-gray-400 flex items-center justify-center text-xl mx-auto">📜</div>
                                            <h5 class="text-xs font-bold text-gray-300">لا توجد رتب مستويات</h5>
                                            <p class="text-[10px] text-gray-500">أضف رتب لمكافأة الأعضاء النشطين</p>
                                            <button type="button" onclick="openAddLevelRoleModal('text')" class="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
                                                <span>إضافة أول رتبة</span>
                                            </button>
                                        </div>
                                    `}
                                </div>

                                <!-- بطاقة معادلة حساب XP -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl space-y-3">
                                    <div class="flex items-center justify-end gap-1.5 text-xs font-bold text-gray-300">
                                        <span>معادلة حساب XP</span>
                                        <span class="text-purple-400">ℹ️</span>
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
                                        <button type="button" onclick="openAddLevelRoleModal('voice')" class="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
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
                                            <button type="button" onclick="openAddLevelRoleModal('voice')" class="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
                                                <span>إضافة أول رتبة</span>
                                            </button>
                                        </div>
                                    `}
                                </div>

                                <!-- بطاقة معادلة حساب XP -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl space-y-3">
                                    <div class="flex items-center justify-end gap-1.5 text-xs font-bold text-gray-300">
                                        <span>معادلة حساب XP</span>
                                        <span class="text-purple-400">ℹ️</span>
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
                                        <button type="button" onclick="openAddSharedRoleModal()" class="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
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
                                            <button type="button" onclick="openAddSharedRoleModal()" class="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
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
                                    ? "px-4 py-1.5 rounded-xl text-xs font-bold transition bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md flex items-center gap-1"
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
                                <div class="w-10 h-10 rounded-xl bg-purple-700/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30">
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
                            <button type="button" onclick="openCreateGiveawayModal()" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
                                <span>➕</span>
                                <span>إنشاء قيف اواي</span>
                            </button>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">نظام القيف اواي</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">إنشاء وإدارة مسابقات القيف اواي في سيرفرك</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-purple-700/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30">
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
                                    <button type="button" onclick="filterGiveawayTab('all')" id="btnGwAll" class="px-3 py-1 rounded-lg bg-purple-700 text-white transition shadow">الكل ${(guildGiveawaysList || []).length}</button>
                                </div>
                            </div>

                            <div id="giveawaysListContainer">
                                ${(guildGiveawaysList && guildGiveawaysList.length > 0) ? `
                                    <div class="space-y-3">
                                        ${guildGiveawaysList.map(g => {
                                            const entriesCount = g.entries ? (typeof g.entries === 'string' ? JSON.parse(g.entries || '[]').length : g.entries.length) : 0;
                                            return '<div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/40 transition text-xs">' +
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
                                        <div class="w-16 h-16 rounded-2xl bg-orange-950/30 text-purple-400 flex items-center justify-center text-3xl mx-auto border border-purple-500/20 shadow-inner">
                                            🎁
                                        </div>
                                        <div class="space-y-1">
                                            <h5 class="text-sm font-black text-white">لا توجد قيف اواي بعد</h5>
                                            <p class="text-xs text-gray-400">ابدأ بإنشاء أول قيف اواي لسيرفرك!</p>
                                        </div>
                                        <button type="button" onclick="openCreateGiveawayModal()" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-2 shadow-lg shadow-purple-950/40">
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
                                        <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-sm shadow">
                                            🎉
                                        </div>
                                    </div>
                                </div>

                                <!-- حقل الجائزة -->
                                <div class="space-y-1.5">
                                    <label class="block text-xs font-bold text-gray-300">الجائزة <span class="text-purple-400">*</span></label>
                                    <input type="text" id="gwPrize" placeholder="مثال: Discord Nitro لمدة شهر" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>

                                <!-- الوصف (اختياري) -->
                                <div class="space-y-1.5">
                                    <label class="block text-xs font-bold text-gray-300">الوصف (اختياري)</label>
                                    <textarea id="gwDesc" rows="2" placeholder="...أضف تفاصيل إضافية" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-500 rounded-xl p-3 text-xs text-white outline-none text-right leading-relaxed"></textarea>
                                </div>

                                <!-- القناة المستهدفة -->
                                <div class="space-y-1.5">
                                    <label class="block text-xs font-bold text-gray-300">القناة <span class="text-purple-400">*</span></label>
                                    ${renderChannelSelect('gwChannel', '')}
                                </div>

                                <!-- المدة & عدد الفائزين -->
                                <div class="grid grid-cols-2 gap-4">
                                    <div class="space-y-1.5">
                                        <label class="block text-xs font-bold text-gray-300">عدد الفائزين</label>
                                        <input type="number" id="gwWinners" value="1" min="1" max="50" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-center font-mono">
                                    </div>
                                    <div class="space-y-1.5">
                                        <label class="block text-xs font-bold text-gray-300">المدة</label>
                                        <select id="gwDuration" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right cursor-pointer">
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
                                                <button type="button" onclick="setGwColor('#9333ea')" class="w-4 h-4 rounded-md bg-[#9333ea]"></button>
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
                                        <input type="text" id="gwImage" placeholder="https://..." class="w-full bg-[#12141f] border border-white/5 focus:border-purple-500 rounded-xl px-4 py-2 text-xs text-white outline-none text-left font-mono">
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
                                    <button type="button" onclick="submitCreateGiveaway()" class="px-8 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-purple-950/40">
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
                        document.getElementById('btnGwAll').className = status === 'all' ? "px-3 py-1 rounded-lg bg-purple-700 text-white transition shadow" : "px-3 py-1 rounded-lg text-gray-400 hover:text-white transition";
                        document.getElementById('btnGwActive').className = status === 'active' ? "px-3 py-1 rounded-lg bg-purple-700 text-white transition shadow" : "px-3 py-1 rounded-lg text-gray-400 hover:text-white transition";
                        document.getElementById('btnGwEnded').className = status === 'ended' ? "px-3 py-1 rounded-lg bg-purple-700 text-white transition shadow" : "px-3 py-1 rounded-lg text-gray-400 hover:text-white transition";
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

                        <!-- Header -->
                        <div class="bg-gradient-to-r from-[#1a0a0a] via-[#12141f] to-[#141724] border border-red-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-2xl bg-red-600/20 text-red-400 border border-red-500/30 flex items-center justify-center text-xl shadow-lg">🚨</div>
                                <div class="text-right">
                                    <h3 class="font-black text-white text-lg">مكافحة الغزو والأعضاء الوهميين</h3>
                                    <p class="text-gray-400 text-xs mt-0.5">كشف الغزو الجماعي وحظر الحسابات الوهمية والجديدة تلقائياً</p>
                                </div>
                            </div>
                            <div class="grid grid-cols-3 gap-3">
                                <div class="bg-[#0b0d14] border border-white/5 px-4 py-2 rounded-2xl text-center">
                                    <div class="text-xl font-black text-white">${settings.anti_alt_days || 3}</div>
                                    <div class="text-[10px] text-gray-400 font-bold mt-0.5">أيام الحساب</div>
                                </div>
                                <div class="bg-[#0b0d14] border border-white/5 px-4 py-2 rounded-2xl text-center">
                                    <div class="text-xl font-black text-emerald-400">${settings.raid_threshold || 5}</div>
                                    <div class="text-[10px] text-gray-400 font-bold mt-0.5">حد الغزو</div>
                                </div>
                                <div class="bg-[#0b0d14] border border-white/5 px-4 py-2 rounded-2xl text-center">
                                    <div class="text-xl font-black ${settings.antiraid_enabled ? 'text-emerald-400' : 'text-red-400'}">${settings.antiraid_enabled ? '🟢' : '🔴'}</div>
                                    <div class="text-[10px] text-gray-400 font-bold mt-0.5">الحالة</div>
                                </div>
                            </div>
                        </div>

                        <!-- Master Toggle -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-3xl flex items-center justify-between shadow-xl">
                            <label class="toggle">
                                <input type="checkbox" name="antiraid_enabled" value="1" ${settings.antiraid_enabled !== 0 ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-sm">تفعيل نظام مكافحة الغزو (Anti-Raid)</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">رصد ومنع هجمات الدخول الجماعي والحسابات الوهمية أو الجديدة تلقائياً</p>
                                </div>
                                <div class="w-8 h-8 rounded-xl bg-red-600/20 text-red-400 flex items-center justify-center text-sm border border-red-500/30">🛡️</div>
                            </div>
                        </div>

                        <!-- Account Age & Raid Threshold Settings -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

                            <!-- Account Age Filter -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl">
                                <div class="flex items-center justify-between">
                                    <div class="w-8 h-8 rounded-xl bg-purple-700/20 text-purple-400 flex items-center justify-center text-sm border border-purple-500/30">🗓️</div>
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">الحد الأدنى لعمر الحساب</h4>
                                        <p class="text-gray-400 text-[11px] mt-0.5">الحسابات الجديدة الأقل من هذا العمر لن تتمكن من الدخول</p>
                                    </div>
                                </div>
                                <div class="grid grid-cols-4 gap-2">
                                    ${[0, 1, 3, 7, 14, 30, 60, 90].map(d => `
                                    <button type="button" onclick="selectAltDays(${d}, this)" class="alt-days-btn py-2 px-3 rounded-xl border text-xs font-bold transition ${(settings.anti_alt_days || 3) == d ? 'bg-purple-900/40 border-purple-500 text-white' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white'}">
                                        ${d === 0 ? 'بدون' : d + ' يوم'}
                                    </button>`).join('')}
                                </div>
                                <input type="hidden" name="anti_alt_days" id="inpAltDays" value="${settings.anti_alt_days || 3}">
                            </div>

                            <!-- Raid Threshold (Members / 10s) -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl">
                                <div class="flex items-center justify-between">
                                    <div class="w-8 h-8 rounded-xl bg-red-600/20 text-red-400 flex items-center justify-center text-sm border border-red-500/30">⚡</div>
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">حد رصد الغزو الجماعي</h4>
                                        <p class="text-gray-400 text-[11px] mt-0.5">عدد الأعضاء الذين ينضمون في 10 ثوانٍ لتفعيل درع الغزو</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-4">
                                    <div class="flex-1">
                                        <input type="range" name="raid_threshold" id="raidSlider" min="3" max="30" step="1" value="${settings.raid_threshold || 5}" oninput="document.getElementById('raidThresholdNum').innerText = this.value" class="w-full accent-purple-600">
                                    </div>
                                    <div class="bg-[#0b0d14] border border-purple-500/40 text-purple-300 font-black text-lg font-mono px-4 py-2 rounded-xl min-w-[52px] text-center">
                                        <span id="raidThresholdNum">${settings.raid_threshold || 5}</span>
                                    </div>
                                </div>
                                <p class="text-[11px] text-gray-500 text-right">كلما كان العدد أصغر، كلما كان النظام أكثر حساسية للغزو</p>
                            </div>
                        </div>

                        <!-- Action & Options Row -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

                            <!-- Raid Action -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-3 shadow-xl">
                                <div class="flex items-center justify-between mb-2">
                                    <div class="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-sm border border-purple-500/30">⚖️</div>
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">إجراء مكافحة الغزو</h4>
                                        <p class="text-gray-400 text-[11px] mt-0.5">الإجراء التلقائي عند رصد غزو أو دخول مشبوه</p>
                                    </div>
                                </div>
                                <input type="hidden" name="antiraid_action" id="inpAntiraidAction" value="${settings.antiraid_action || 'kick'}">
                                <div class="grid grid-cols-3 gap-2">
                                    <button type="button" onclick="selectRaidAction('kick', this)" class="raid-action-btn py-3 rounded-2xl border text-xs font-bold transition ${(settings.antiraid_action || 'kick') === 'kick' ? 'bg-purple-900/40 border-purple-500 text-white' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white'}">
                                        🪓 طرد
                                    </button>
                                    <button type="button" onclick="selectRaidAction('ban', this)" class="raid-action-btn py-3 rounded-2xl border text-xs font-bold transition ${settings.antiraid_action === 'ban' ? 'bg-purple-900/40 border-purple-500 text-white' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white'}">
                                        🔨 حظر
                                    </button>
                                    <button type="button" onclick="selectRaidAction('timeout', this)" class="raid-action-btn py-3 rounded-2xl border text-xs font-bold transition ${settings.antiraid_action === 'timeout' ? 'bg-purple-900/40 border-purple-500 text-white' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white'}">
                                        ⏳ عزل
                                    </button>
                                </div>
                            </div>

                            <!-- Toggles: Anti-Bot & DM Notify & Log Channel -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-3 shadow-xl">
                                <h4 class="font-black text-white text-sm text-right border-b border-white/5 pb-3">خيارات إضافية</h4>
                                <div class="space-y-2.5">
                                    <div class="flex items-center justify-between p-3 bg-[#0b0d14] border border-white/5 rounded-xl">
                                        <label class="toggle"><input type="checkbox" name="anti_bot" value="1" ${settings.anti_bot ? 'checked' : ''}><span class="slider"></span></label>
                                        <div class="text-right">
                                            <h5 class="text-xs font-bold text-white">منع إضافة بوتات جديدة (Anti-Bot)</h5>
                                            <p class="text-[10px] text-gray-500">تقييد إضافة أي بوتات إلا من قِبل الأونر أو الأدمن فقط</p>
                                        </div>
                                    </div>
                                    <div class="flex items-center justify-between p-3 bg-[#0b0d14] border border-white/5 rounded-xl">
                                        <label class="toggle"><input type="checkbox" name="antiraid_dm_notify" value="1" ${settings.antiraid_dm_notify !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                                        <div class="text-right">
                                            <h5 class="text-xs font-bold text-white">إشعار الأونر عبر DM</h5>
                                            <p class="text-[10px] text-gray-500">إرسال تنبيه خاص لأونر السيرفر عند رصد أي غزو</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Log Channel & Whitelist Roles -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-3 shadow-xl text-right">
                                <h4 class="font-black text-white text-sm">قناة سجلات مكافحة الغزو</h4>
                                <p class="text-gray-400 text-[11px]">تسجيل جميع الأحداث المشبوهة والإجراءات المتخذة</p>
                                ${renderChannelSelect('antiraid_log_channel', settings.antiraid_log_channel)}
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-3 shadow-xl text-right">
                                <h4 class="font-black text-white text-sm">رتبة مستثناة من الحماية (Whitelist)</h4>
                                <p class="text-gray-400 text-[11px]">هذه الرتبة لن تخضع لفلتر عمر الحساب أو حد الغزو</p>
                                ${renderRoleSelect('antiraid_whitelist_roles', settings.antiraid_whitelist_roles)}
                            </div>
                        </div>

                    </div>

                    <script>
                    function selectAltDays(days, btn) {
                        document.getElementById('inpAltDays').value = days;
                        document.querySelectorAll('.alt-days-btn').forEach(b => {
                            b.className = 'alt-days-btn py-2 px-3 rounded-xl border text-xs font-bold transition bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white';
                        });
                        btn.className = 'alt-days-btn py-2 px-3 rounded-xl border text-xs font-bold transition bg-purple-900/40 border-purple-500 text-white';
                    }
                    function selectRaidAction(action, btn) {
                        document.getElementById('inpAntiraidAction').value = action;
                        document.querySelectorAll('.raid-action-btn').forEach(b => {
                            b.className = 'raid-action-btn py-3 rounded-2xl border text-xs font-bold transition bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white';
                        });
                        btn.className = 'raid-action-btn py-3 rounded-2xl border text-xs font-bold transition bg-purple-900/40 border-purple-500 text-white';
                    }
                    </script>`;
            } else if (section === 'tempvoice') {
                const activeTempVoices = (rawDb ? rawDb.prepare('SELECT * FROM temp_voices WHERE guild_id = ?').all(guildId) : []) || [];

                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <!-- Header Banner -->
                        <div class="bg-gradient-to-r from-[#1a132e] via-[#12141f] to-[#1a132e] border border-purple-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
                            <label class="toggle"><input type="checkbox" name="temp_voice_enabled" value="1" ${settings.temp_voice_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-xl flex items-center gap-2 justify-end"><span>الرومات الصوتية المؤقتة (Temp Voice)</span><span>🎙️</span></h4>
                                    <p class="text-gray-400 text-xs mt-0.5">إنشاء غرف صوتية خاصة تلقائياً عند دخول الأعضاء وحذفها فور خروجهم</p>
                                </div>
                                <div class="w-10 h-10 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-xl border border-purple-500/30">🕒</div>
                            </div>
                        </div>

                        <!-- Quick Stats -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
                                <div class="text-2xl font-black text-purple-400 font-mono">${activeTempVoices.length}</div>
                                <div class="text-xs text-gray-400 font-bold mt-1">الرومات المؤقتة النشطة حالياً</div>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
                                <div class="text-2xl font-black text-emerald-400 font-mono">${settings.temp_voice_channel ? 'مفعل ✓' : 'غير معطى'}</div>
                                <div class="text-xs text-gray-400 font-bold mt-1">حالة روم الإنشاء (Join-to-Create)</div>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
                                <div class="text-2xl font-black text-white font-mono">${settings.temp_voice_user_limit || 'غير محدود'}</div>
                                <div class="text-xs text-gray-400 font-bold mt-1">الحد الأقصى الافتراضي</div>
                            </div>
                        </div>

                        <!-- Settings Form -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl">
                            <h4 class="text-sm font-black text-white border-b border-white/5 pb-3 flex items-center gap-2 justify-end">
                                <span>إعدادات الروم الرئيسي والكاتيجوري</span>
                                <span>⚙️</span>
                            </h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">روم الدخول الرئيسي (Join-to-Create Channel)</label>
                                    ${renderChannelSelect('temp_voice_channel', settings.temp_voice_channel || '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قسم الرومات المنشأة (Category ID)</label>
                                    <input type="text" name="temp_voice_category" value="${settings.temp_voice_category || ''}" placeholder="آيدي الكاتيجوري الذي ستنشأ تحته الرومات..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
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

                        <!-- Active Temp Channels Table -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-3 shadow-xl">
                            <h4 class="text-sm font-black text-white flex items-center justify-between pb-3 border-b border-white/5">
                                <span class="text-xs text-purple-400 font-bold">${activeTempVoices.length} روم نشط</span>
                                <span class="flex items-center gap-2"><span>الرومات المؤقتة الفعالة الآن</span><span>🎙️</span></span>
                            </h4>
                            ${activeTempVoices.length === 0 ? `
                                <p class="text-center py-6 text-gray-500 text-xs font-bold">لا توجد أي رومات صوتية مؤقتة مفتوحة حالياً بالسيرفر</p>
                            ` : activeTempVoices.map(tv => `
                                <div class="bg-[#0b0d14] p-3 rounded-2xl border border-white/5 flex items-center justify-between">
                                    <span class="text-xs text-gray-500 font-mono">ID: ${tv.channel_id}</span>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-white block">صاحب الروم: <@${tv.owner_id}></span>
                                    </div>
                                </div>
                            `).join('')}
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
                const logsConfig = (function() {
                    try {
                        return settings.logs_config ? (typeof settings.logs_config === 'string' ? JSON.parse(settings.logs_config) : settings.logs_config) : {};
                    } catch(e) { return {}; }
                })();

                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Header Bar -->
                        <div class="bg-gradient-to-r from-[#1a132e] via-[#12141f] to-[#1a132e] border border-purple-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl flex-wrap gap-4">
                            <div class="flex items-center gap-3">
                                <span id="logsSaveIndicator" class="text-xs font-bold text-emerald-400 bg-emerald-950/60 px-3 py-1.5 rounded-xl opacity-0 transition-opacity duration-300">✓ حُفظت الإعدادات</span>
                                <label class="toggle">
                                    <input type="checkbox" id="logsMasterToggle" name="logs_enabled" value="1" ${settings.logs_enabled !== 0 ? 'checked' : ''} onchange="saveLogsSetting('logs_enabled', this.checked)">
                                    <span class="slider"></span>
                                </label>
                            </div>
                            <div class="flex items-center gap-4">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-xl flex items-center gap-2 justify-end">
                                        <span>السجلات</span>
                                        <span>📜</span>
                                    </h4>
                                    <p class="text-gray-400 text-xs mt-0.5">تتبع جميع الأحداث في السيرفر مع الفاعل والتفاصيل فورياً</p>
                                </div>
                                <div class="w-12 h-12 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-2xl border border-purple-500/30 shadow-inner">
                                    🛡️
                                </div>
                            </div>
                        </div>

                        <!-- Top Stats Badges -->
                        <div class="flex items-center justify-between gap-3 flex-wrap">
                            <div class="flex items-center gap-2">
                                <span class="px-3 py-1.5 bg-[#12141f] border border-white/5 text-gray-300 rounded-xl text-xs font-bold flex items-center gap-1.5">
                                    <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                    <span id="statChannelsUsed">0</span>
                                    <span>القنوات المستخدمة</span>
                                </span>
                                <span class="px-3 py-1.5 bg-[#12141f] border border-white/5 text-gray-300 rounded-xl text-xs font-bold flex items-center gap-1.5">
                                    <span>⚡</span>
                                    <span>13 الأقسام</span>
                                </span>
                                <span class="px-3 py-1.5 bg-emerald-950/40 text-emerald-400 border border-emerald-800/30 rounded-xl text-xs font-bold flex items-center gap-1.5">
                                    <span>✓</span>
                                    <span id="statEnabledLogs">0</span>
                                    <span>السجلات المفعلة</span>
                                </span>
                                <span class="px-3 py-1.5 bg-purple-950/40 text-purple-300 border border-purple-800/30 rounded-xl text-xs font-bold flex items-center gap-1.5 font-mono">
                                    <span>🎯</span>
                                    <span>105 إجمالي السجلات</span>
                                </span>
                            </div>
                        </div>

                        <!-- 2. Auto Channel Setup Wizard Cards -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span class="text-xs text-gray-400">إنشاء قنوات السجلات تلقائياً لجميع الأقسام بضغطة واحدة</span>
                                <h4 class="text-sm font-black text-white flex items-center gap-2">
                                    <span>إعداد تلقائي للقنوات</span>
                                    <span>⚙️</span>
                                </h4>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                                <!-- إنشـاء قنوات عادية -->
                                <button type="button" onclick="autoSetupLogsChannels('grouped')" class="bg-[#0b0d14] border border-white/5 hover:border-purple-500/50 p-4 rounded-2xl text-right transition group cursor-pointer space-y-2">
                                    <div class="flex items-center justify-between">
                                        <div class="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-sm border border-purple-500/30">📌</div>
                                        <span class="text-xs font-black text-white group-hover:text-purple-300 transition">إنشاء قنوات عادية</span>
                                    </div>
                                    <p class="text-[11px] text-gray-400 leading-relaxed">قناة واحدة لكل قسم (أعضاء، رسائل، أدوار...) — مناسب لأغلب السيرفرات</p>
                                </button>

                                <!-- إنشـاء قنوات مفصلة -->
                                <button type="button" onclick="autoSetupLogsChannels('detailed')" class="bg-[#0b0d14] border border-white/5 hover:border-indigo-500/50 p-4 rounded-2xl text-right transition group cursor-pointer space-y-2">
                                    <div class="flex items-center justify-between">
                                        <div class="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-sm border border-indigo-500/30">📑</div>
                                        <span class="text-xs font-black text-white group-hover:text-indigo-300 transition">إنشاء قنوات مفصلة</span>
                                    </div>
                                    <p class="text-[11px] text-gray-400 leading-relaxed">قناة منفصلة لكل نوع سجل — للسيرفرات الكبيرة التي تحتاج تنظيم دقيق</p>
                                </button>

                                <!-- حذف قنوات السجلات -->
                                <button type="button" onclick="deleteLogsChannels()" class="bg-[#0b0d14] border border-white/5 hover:border-rose-500/50 p-4 rounded-2xl text-right transition group cursor-pointer space-y-2">
                                    <div class="flex items-center justify-between">
                                        <div class="w-8 h-8 rounded-xl bg-rose-600/20 text-rose-400 flex items-center justify-center text-sm border border-rose-500/30">🗑️</div>
                                        <span class="text-xs font-black text-white group-hover:text-rose-300 transition">حذف قنوات السجلات</span>
                                    </div>
                                    <p class="text-[11px] text-gray-400 leading-relaxed">حذف كاتيجوري ZENO Server Logs وجميع القنوات بداخله وتعطيل السجلات</p>
                                </button>
                            </div>
                        </div>



                        <!-- 3. Search & Filter Bar -->
                        <div class="flex items-center justify-between gap-4">
                            <div class="flex items-center gap-1.5 bg-[#12141f] border border-white/5 p-1 rounded-2xl">
                                <button type="button" id="btnLogFilterDisabled" onclick="filterLogsByStatus('disabled')" class="px-3.5 py-1.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer">المعطلة</button>
                                <button type="button" id="btnLogFilterEnabled" onclick="filterLogsByStatus('enabled')" class="px-3.5 py-1.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer">المفعلة</button>
                                <button type="button" id="btnLogFilterAll" onclick="filterLogsByStatus('all')" class="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-purple-600 text-white transition shadow cursor-pointer">الكل</button>
                            </div>
                            <div class="flex-1 relative">
                                <input type="text" id="logSearchInput" placeholder="...ابحث عن سجل" oninput="searchLogsItems()" class="w-full bg-[#12141f] border border-white/5 focus:border-purple-500 rounded-2xl px-4 py-2.5 text-xs text-white outline-none text-right pr-10">
                                <span class="absolute right-3.5 top-2.5 text-gray-400 text-sm">🔍</span>
                            </div>
                        </div>

                        <!-- 4. Main Two-Column View: Categories Sidebar + Active Category Content -->
                        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">

                            <!-- Sidebar: 13 Categories -->
                            <div class="lg:col-span-1 space-y-1 bg-[#12141f] border border-white/5 p-3 rounded-3xl shadow-xl h-fit">
                                <div class="flex items-center justify-end gap-1.5 text-xs font-black text-white px-2 py-2 border-b border-white/5 mb-1">
                                    <span>الأقسام</span>
                                    <span>📁</span>
                                </div>
                                <div id="logsCategoriesList" class="space-y-1"></div>
                            </div>

                            <!-- Right Display Area: Active Category Header + Section Default Channel/Color + Logs Grid -->
                            <div class="lg:col-span-3 space-y-4">

                                <!-- Active Category Title & Global Toggles -->
                                <div class="bg-[#12141f] border border-white/5 p-5 rounded-3xl flex items-center justify-between shadow-xl flex-wrap gap-3">
                                    <div class="flex items-center gap-2">
                                        <button type="button" onclick="toggleActiveCategoryLogs(false)" class="px-3.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer">
                                            <span>✕</span><span>تعطيل الكل</span>
                                        </button>
                                        <button type="button" onclick="toggleActiveCategoryLogs(true)" class="px-3.5 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/40 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer">
                                            <span>✓</span><span>تفعيل الكل</span>
                                        </button>
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <div class="text-right">
                                            <h4 id="activeCatTitle" class="font-black text-white text-base">الأعضاء</h4>
                                            <p id="activeCatCount" class="text-gray-400 text-xs mt-0.5">17 سجل</p>
                                        </div>
                                        <div id="activeCatIcon" class="w-10 h-10 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-xl border border-purple-500/30">
                                            🎯
                                        </div>
                                    </div>
                                </div>

                                <!-- Active Category Fast Preset: Channel + Color + Apply to all -->
                                <div class="bg-[#12141f] border border-white/5 p-5 rounded-3xl space-y-4 shadow-xl">
                                    <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                        <span class="text-[11px] text-gray-400">طبق نفس الإعدادات على جميع السجلات المفعلة بالقسم</span>
                                        <h5 class="text-xs font-black text-white flex items-center gap-1.5">
                                            <span>إعدادات القسم</span>
                                            <span>⚙️</span>
                                        </h5>
                                    </div>

                                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                                        <!-- Color Picker -->
                                        <div>
                                            <label class="block text-[11px] font-bold text-gray-300 mb-1.5 text-right">اللون الافتراضي 🎨</label>
                                            <div class="flex items-center gap-2 bg-[#0b0d14] border border-white/5 p-1.5 rounded-xl">
                                                <input type="text" id="catColorHex" value="#5865F2" class="w-full bg-transparent text-xs text-white font-mono outline-none text-center" dir="ltr" onchange="updateCatColorPreview(this.value)">
                                                <input type="color" id="catColorPicker" value="#5865F2" class="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0" onchange="document.getElementById('catColorHex').value = this.value">
                                            </div>
                                        </div>

                                        <!-- Channel Select -->
                                        <div class="sm:col-span-2">
                                            <label class="block text-[11px] font-bold text-gray-300 mb-1.5 text-right">القناة الافتراضية 📢</label>
                                            ${renderChannelSelect('catDefaultChannel', '')}
                                        </div>
                                    </div>

                                    <button type="button" onclick="applyCatSettingsToAll()" class="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-black rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer">
                                        <span>✨ تطبيق على جميع السجلات المفعلة</span>
                                    </button>
                                </div>

                                <!-- Logs Cards 2-Column Grid -->
                                <div id="logsCardsGrid" class="grid grid-cols-1 md:grid-cols-2 gap-3"></div>

                            </div>
                        </div>

                    </div>

                    <!-- Individual Log Edit Modal -->
                    <div id="editLogModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
                        <div class="bg-[#12141f] border border-purple-500/30 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-right" dir="rtl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <button type="button" onclick="closeEditLogModal()" class="text-gray-400 hover:text-white text-lg font-bold">✕</button>
                                <div class="flex items-center gap-2">
                                    <h5 class="text-white font-black text-sm" id="modalLogTitle">تخصيص السجل</h5>
                                    <span id="modalLogIcon" class="text-base">📜</span>
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-1">القناة المخصصة لهذا السجل</label>
                                ${renderChannelSelect('modalLogChannel', '')}
                                <p class="text-[10px] text-gray-400 mt-1">اتركها فارغة لاستخدام القناة الافتراضية للقسم</p>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-1">لون الإيمبد (Hex Color)</label>
                                <div class="flex items-center gap-2 bg-[#0b0d14] border border-white/5 p-2 rounded-xl">
                                    <input type="text" id="modalLogColorHex" value="#5865F2" class="w-full bg-transparent text-xs text-white font-mono outline-none text-center" dir="ltr" onchange="document.getElementById('modalLogColorPicker').value = this.value">
                                    <input type="color" id="modalLogColorPicker" value="#5865F2" class="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0" onchange="document.getElementById('modalLogColorHex').value = this.value">
                                </div>
                            </div>

                            <div class="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
                                <button type="button" onclick="closeEditLogModal()" class="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-xs font-bold transition">إلغاء</button>
                                <button type="button" onclick="saveModalLogConfig()" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition shadow-lg">حفظ التغييرات</button>
                            </div>
                        </div>
                    </div>

                    <script>
                    (function() {
                                                                        // 105 Comprehensive Log Events across 13 Categories (100% Exact to Screenshots)
                        var LOG_CATEGORIES = {
                            members: {
                                title: 'الأعضاء', icon: '🎯', desc: 'أحداث دخول وخروج وحظر وعقوبات الأعضاء', defaultColor: '#5865F2',
                                items: [
                                    { id: 'member_join', title: 'دخول عضو', desc: 'عند دخول عضو جديد للسيرفر', icon: '📥', isSpecial: false },
                                    { id: 'member_leave', title: 'خروج عضو', desc: 'عند خروج عضو من السيرفر', icon: '📤', isSpecial: false },
                                    { id: 'member_ban', title: 'حظر عضو', desc: 'عند حظر عضو من السيرفر', icon: '🪓', isSpecial: false },
                                    { id: 'member_unban', title: 'فك حظر عضو', desc: 'عند فك حظر عضو', icon: '🔓', isSpecial: false },
                                    { id: 'member_kick', title: 'طرد عضو', desc: 'عند طرد عضو من السيرفر', icon: '👢', isSpecial: false },
                                    { id: 'member_prison', title: 'سجن عضو', desc: 'عند سجن عضو', icon: '🔒', isSpecial: false },
                                    { id: 'member_unprison', title: 'إخراج من السجن', desc: 'عند إخراج عضو من السجن', icon: '🔓', isSpecial: false },
                                    { id: 'member_timeout', title: 'عزل عضو', desc: 'عند عزل عضو (تايم أوت)', icon: '⏳', isSpecial: false },
                                    { id: 'member_untimeout', title: 'إزالة العزل', desc: 'عند إزالة العزل عن عضو', icon: '➕', isSpecial: false },
                                    { id: 'member_mute', title: 'إسكات كتابي', desc: 'عند إسكات عضو كتابياً', icon: '🔇', isSpecial: false },
                                    { id: 'member_unmute', title: 'إلغاء إسكات كتابي', desc: 'عند إلغاء الإسكات الكتابي', icon: '🔊', isSpecial: false },
                                    { id: 'member_nick_change', title: 'تغيير الاسم المستعار', desc: 'عند تغيير الاسم المستعار للعضو', icon: '✏️', isSpecial: false },
                                    { id: 'member_avatar_change', title: 'تغيير الصورة', desc: 'عند تغيير صورة العضو', icon: '🖼️', isSpecial: true },
                                    { id: 'member_username_change', title: 'تغيير اسم المستخدم', desc: 'عند تغيير اسم المستخدم للعضو', icon: '👤', isSpecial: true },
                                    { id: 'member_boost_add', title: 'بوست السيرفر', desc: 'عند بوست السيرفر من قبل عضو', icon: '💎', isSpecial: false },
                                    { id: 'member_boost_remove', title: 'إزالة البوست', desc: 'عند إزالة البوست من السيرفر', icon: '🗑️', isSpecial: false },
                                    { id: 'member_suspicious', title: 'حساب مشبوه', desc: 'عند إسناد رتبة لحساب جديد بسبب عمر الحساب', icon: '🚨', isSpecial: false }
                                ]
                            },
                            roles: {
                                title: 'الرتب', icon: '🎖️', desc: 'أحداث إنشاء وتعديل وحذف وإعطاء الرتب', defaultColor: '#5865F2',
                                items: [
                                    { id: 'role_create', title: 'إنشاء رتبة', desc: 'عند إنشاء رتبة جديدة', icon: '➕', isSpecial: false },
                                    { id: 'role_delete', title: 'حذف رتبة', desc: 'عند حذف رتبة', icon: '🗑️', isSpecial: false },
                                    { id: 'role_update', title: 'تعديل رتبة', desc: 'عند تعديل رتبة', icon: '✏️', isSpecial: false },
                                    { id: 'role_give_member', title: 'إضافة رتبة لعضو', desc: 'عند إعطاء رتبة لعضو', icon: '🎁', isSpecial: false },
                                    { id: 'role_remove_member', title: 'إزالة رتبة من عضو', desc: 'عند إزالة رتبة من عضو', icon: '❌', isSpecial: false },
                                    { id: 'role_custom_manage', title: 'رتبة خاصة', desc: 'تعديل/حذف رتبة خاصة (نفس أمر rlog)', icon: '👑', isSpecial: false }
                                ]
                            },
                            channels: {
                                title: 'القنوات', icon: '📌', desc: 'أحداث إنشاء وتعديل وحذف القنوات والثريدات', defaultColor: '#5865F2',
                                items: [
                                    { id: 'channel_create', title: 'إنشاء قناة', desc: 'عند إنشاء قناة جديدة', icon: '➕', isSpecial: false },
                                    { id: 'channel_delete', title: 'حذف قناة', desc: 'عند حذف قناة', icon: '🗑️', isSpecial: false },
                                    { id: 'channel_update', title: 'تعديل قناة', desc: 'عند تعديل قناة', icon: '✏️', isSpecial: false },
                                    { id: 'channel_perms_update', title: 'تعديل صلاحيات قناة', desc: 'عند تعديل صلاحيات قناة', icon: '🔒', isSpecial: false },
                                    { id: 'thread_create', title: 'إنشاء ثريد', desc: 'عند إنشاء ثريد جديد', icon: '💬', isSpecial: false },
                                    { id: 'thread_delete', title: 'حذف ثريد', desc: 'عند حذف ثريد', icon: '🗑️', isSpecial: false },
                                    { id: 'thread_update', title: 'تعديل ثريد', desc: 'عند تعديل ثريد', icon: '✏️', isSpecial: false }
                                ]
                            },
                            messages: {
                                title: 'الرسائل', icon: '💬', desc: 'أحداث حذف وتعديل وتثبيت ومسح الرسائل', defaultColor: '#5865F2',
                                items: [
                                    { id: 'msg_delete', title: 'حذف رسالة', desc: 'عند حذف رسالة', icon: '🗑️', isSpecial: false },
                                    { id: 'msg_image_delete', title: 'حذف صورة', desc: 'عند حذف رسالة تحتوي على صورة', icon: '🖼️', isSpecial: false },
                                    { id: 'msg_update', title: 'تعديل رسالة', desc: 'عند تعديل رسالة', icon: '✏️', isSpecial: false },
                                    { id: 'msg_purge', title: 'حذف رسائل جماعي', desc: 'عند حذف عدة رسائل', icon: 'ℹ️', isSpecial: false },
                                    { id: 'msg_pin', title: 'تثبيت رسالة', desc: 'عند تثبيت رسالة', icon: 'ℹ️', isSpecial: false },
                                    { id: 'msg_unpin', title: 'إلغاء تثبيت رسالة', desc: 'عند إلغاء تثبيت رسالة', icon: 'ℹ️', isSpecial: false },
                                    { id: 'msg_reaction_add', title: 'إضافة تفاعل', desc: 'عند إضافة تفاعل على رسالة', icon: 'ℹ️', isSpecial: false },
                                    { id: 'msg_reaction_remove', title: 'إزالة تفاعل', desc: 'عند إزالة تفاعل من رسالة', icon: 'ℹ️', isSpecial: false },
                                    { id: 'msg_reaction_remove_all', title: 'مسح جميع التفاعلات', desc: 'عند مسح جميع التفاعلات', icon: 'ℹ️', isSpecial: false }
                                ]
                            },
                            voice: {
                                title: 'الصوت', icon: '🎙️', desc: 'أحداث الرومات الصوتية والكتم والبث والكاميرا', defaultColor: '#5865F2',
                                items: [
                                    { id: 'vc_join', title: 'دخول روم صوتي', desc: 'عند دخول عضو لروم صوتي', icon: '⬇️', isSpecial: true },
                                    { id: 'vc_leave', title: 'خروج من روم صوتي', desc: 'عند خروج عضو من روم صوتي', icon: '⬆️', isSpecial: true },
                                    { id: 'vc_switch', title: 'نقل بين الرومات', desc: 'عند نقل عضو بين الرومات', icon: '🔀', isSpecial: true },
                                    { id: 'vc_mute_server', title: 'كتم عضو', desc: 'عند كتم عضو في الصوتي', icon: '⬆️', isSpecial: true },
                                    { id: 'vc_unmute_server', title: 'إلغاء كتم عضو', desc: 'عند إلغاء كتم عضو', icon: '🔓', isSpecial: true },
                                    { id: 'vc_deafen_server', title: 'إصمات عضو', desc: 'عند إصمات عضو', icon: '🔒', isSpecial: true },
                                    { id: 'vc_undeafen_server', title: 'إلغاء إصمات', desc: 'عند إلغاء إصمات عضو', icon: '🔓', isSpecial: true },
                                    { id: 'vc_self_mute', title: 'سيلف ميوت', desc: 'عند تفعيل العضو سيلف ميوت', icon: 'ℹ️', isSpecial: true },
                                    { id: 'vc_self_unmute', title: 'إلغاء السيلف ميوت', desc: 'عند إلغاء العضو السيلف ميوت', icon: 'ℹ️', isSpecial: true },
                                    { id: 'vc_self_deaf', title: 'سيلف ديفن', desc: 'عند تفعيل العضو سيلف ديفن', icon: 'ℹ️', isSpecial: true },
                                    { id: 'vc_self_undeaf', title: 'إلغاء السيلف ديفن', desc: 'عند إلغاء العضو السيلف ديفن', icon: '🔓', isSpecial: true },
                                    { id: 'vc_stream_start', title: 'بدء بث', desc: 'عند بدء عضو بث مباشر', icon: '🖼️', isSpecial: true },
                                    { id: 'vc_stream_stop', title: 'إنهاء بث', desc: 'عند إنهاء البث', icon: '🖼️', isSpecial: true },
                                    { id: 'vc_video_start', title: 'تشغيل الكاميرا', desc: 'عند تشغيل الكاميرا', icon: '🖼️', isSpecial: true },
                                    { id: 'vc_video_stop', title: 'إيقاف الكاميرا', desc: 'عند إيقاف الكاميرا', icon: '⬆️', isSpecial: true },
                                    { id: 'vc_disconnect', title: 'فصل من الصوتية', desc: 'عند فصل عضو من قناة صوتية (بواسطة مشرف)', icon: 'ℹ️', isSpecial: true }
                                ]
                            },
                            moderation: {
                                title: 'الإشراف', icon: '🛡️', desc: 'أحداث التحذيرات والبلوك والبلاك لست', defaultColor: '#5865F2',
                                items: [
                                    { id: 'mod_warn_add', title: 'إعطاء تحذير', desc: 'عند إعطاء عضو تحذير', icon: 'ℹ️', isSpecial: false },
                                    { id: 'mod_warn_remove', title: 'إزالة تحذير', desc: 'عند إزالة تحذير واحد من عضو', icon: 'ℹ️', isSpecial: false },
                                    { id: 'mod_warn_clear', title: 'مسح التحذيرات', desc: 'عند مسح جميع تحذيرات عضو أو السيرفر', icon: 'ℹ️', isSpecial: false },
                                    { id: 'mod_block_add', title: 'إعطاء بلوك', desc: 'عند إعطاء عضو بلوك على رتبة', icon: '🗑️', isSpecial: false },
                                    { id: 'mod_blacklist_add', title: 'إضافة بلاك لست', desc: 'عند إضافة عضو إلى البلاك لست', icon: 'ℹ️', isSpecial: false },
                                    { id: 'mod_blacklist_remove', title: 'إزالة بلاك لست', desc: 'عند إزالة عضو من البلاك لست', icon: '➕', isSpecial: false }
                                ]
                            },
                            server: {
                                title: 'السيرفر', icon: '⚙️', desc: 'أحداث تعديل إعدادات وبنر وبوستات السيرفر', defaultColor: '#5865F2',
                                items: [
                                    { id: 'server_update', title: 'تعديل السيرفر', desc: 'عند تعديل إعدادات السيرفر', icon: '✏️', isSpecial: true },
                                    { id: 'server_name_change', title: 'تغيير اسم السيرفر', desc: 'عند تغيير اسم السيرفر', icon: '✏️', isSpecial: true },
                                    { id: 'server_icon_change', title: 'تغيير أيقونة السيرفر', desc: 'عند تغيير أيقونة السيرفر', icon: '🖼️', isSpecial: true },
                                    { id: 'server_banner_change', title: 'تغيير بانر السيرفر', desc: 'عند تغيير بانر السيرفر', icon: '✏️', isSpecial: true },
                                    { id: 'server_vanity_change', title: 'تغيير رابط الفانيتي', desc: 'عند تغيير رابط الدعوة المخصص', icon: '✏️', isSpecial: true },
                                    { id: 'server_boost_level_up', title: 'رفع مستوى البوست', desc: 'عند رفع مستوى بوست السيرفر', icon: '✏️', isSpecial: true },
                                    { id: 'server_boost_level_down', title: 'انخفاض مستوى البوست', desc: 'عند انخفاض مستوى البوست', icon: '✏️', isSpecial: true }
                                ]
                            },
                            invites: {
                                title: 'الدعوات', icon: '🔗', desc: 'أحداث إنشاء وحذف واستخدام روابط الدعوة', defaultColor: '#5865F2',
                                items: [
                                    { id: 'invite_create', title: 'إنشاء دعوة', desc: 'عند إنشاء رابط دعوة', icon: '➕', isSpecial: false },
                                    { id: 'invite_delete', title: 'حذف دعوة', desc: 'عند حذف رابط دعوة', icon: '🗑️', isSpecial: false },
                                    { id: 'invite_used', title: 'استخدام دعوة', desc: 'عند استخدام رابط دعوة', icon: '🖼️', isSpecial: false }
                                ]
                            },
                            emojis: {
                                title: 'الإيموجي والستيكرز', icon: '😃', desc: 'أحداث إضافة وتعديل وحذف الإيموجيات والستيكرات', defaultColor: '#5865F2',
                                items: [
                                    { id: 'emoji_create', title: 'إضافة إيموجي', desc: 'عند إضافة إيموجي جديد', icon: '➕', isSpecial: true },
                                    { id: 'emoji_delete', title: 'حذف إيموجي', desc: 'عند حذف إيموجي', icon: '🗑️', isSpecial: true },
                                    { id: 'emoji_update', title: 'تعديل إيموجي', desc: 'عند تعديل إيموجي', icon: '✏️', isSpecial: true },
                                    { id: 'sticker_create', title: 'إضافة ستيكر', desc: 'عند إضافة ستيكر جديد', icon: '🖼️', isSpecial: true },
                                    { id: 'sticker_delete', title: 'حذف ستيكر', desc: 'عند حذف ستيكر', icon: '🗑️', isSpecial: true },
                                    { id: 'sticker_update', title: 'تعديل ستيكر', desc: 'عند تعديل ستيكر', icon: '✏️', isSpecial: true }
                                ]
                            },
                            events: {
                                title: 'الأحداث', icon: '📅', desc: 'أحداث إنشاء ومجدولة وبدء الأحداث المباشرة بالسيرفر', defaultColor: '#5865F2',
                                items: [
                                    { id: 'event_create', title: 'إنشاء حدث', desc: 'عند إنشاء حدث مجدول', icon: '➕', isSpecial: true },
                                    { id: 'event_delete', title: 'حذف حدث', desc: 'عند حذف حدث', icon: '🗑️', isSpecial: true },
                                    { id: 'event_update', title: 'تعديل حدث', desc: 'عند تعديل حدث', icon: '✏️', isSpecial: true },
                                    { id: 'event_start', title: 'بدء حدث', desc: 'عند بدء حدث', icon: '⬇️', isSpecial: true },
                                    { id: 'event_end', title: 'انتهاء حدث', desc: 'عند انتهاء حدث', icon: '⬆️', isSpecial: true },
                                    { id: 'event_user_interested', title: 'اشتراك في حدث', desc: 'عند اشتراك عضو في حدث', icon: '⬇️', isSpecial: true }
                                ]
                            },
                            integrations: {
                                title: 'التكاملات', icon: '🔌', desc: 'أحداث التكاملات والويب هوك والبوتات', defaultColor: '#5865F2',
                                items: [
                                    { id: 'integration_create', title: 'إضافة تكامل', desc: 'عند إضافة تكامل جديد', icon: '➕', isSpecial: false },
                                    { id: 'integration_delete', title: 'حذف تكامل', desc: 'عند حذف تكامل', icon: '🗑️', isSpecial: false },
                                    { id: 'integration_update', title: 'تعديل تكامل', desc: 'عند تعديل تكامل', icon: '✏️', isSpecial: false },
                                    { id: 'webhook_create', title: 'إنشاء ويب هوك', desc: 'عند إنشاء ويب هوك', icon: 'ℹ️', isSpecial: false },
                                    { id: 'webhook_delete', title: 'حذف ويب هوك', desc: 'عند حذف ويب هوك', icon: '🗑️', isSpecial: false },
                                    { id: 'webhook_update', title: 'تعديل ويب هوك', desc: 'عند تعديل ويب هوك', icon: '✏️', isSpecial: false },
                                    { id: 'bot_add', title: 'إضافة بوت', desc: 'عند إضافة بوت للسيرفر', icon: 'ℹ️', isSpecial: false },
                                    { id: 'bot_remove', title: 'إزالة بوت', desc: 'عند إزالة بوت من السيرفر', icon: '🗑️', isSpecial: false }
                                ]
                            },
                            automod: {
                                title: 'الأوتو مود', icon: '🤖', desc: 'أحداث وقواعد الأوتو مود وحظر المحتوى والسبام', defaultColor: '#5865F2',
                                items: [
                                    { id: 'automod_rule_create', title: 'إنشاء قاعدة', desc: 'عند إنشاء قاعدة أوتو مود', icon: '➕', isSpecial: false },
                                    { id: 'automod_rule_delete', title: 'حذف قاعدة', desc: 'عند حذف قاعدة أوتو مود', icon: '🗑️', isSpecial: false },
                                    { id: 'automod_rule_update', title: 'تعديل قاعدة', desc: 'عند تعديل قاعدة أوتو مود', icon: '✏️', isSpecial: false },
                                    { id: 'automod_action_trigger', title: 'إجراء أوتو مود', desc: 'عند تنفيذ إجراء أوتو مود', icon: 'ℹ️', isSpecial: false },
                                    { id: 'automod_content_block', title: 'حظر محتوى', desc: 'عند حظر محتوى تلقائياً', icon: '🗑️', isSpecial: false },
                                    { id: 'automod_timeout', title: 'عزل تلقائي', desc: 'عند عزل عضو تلقائياً', icon: '🔒', isSpecial: false },
                                    { id: 'automod_spam_detect', title: 'رقابة السبام', desc: 'عند اكتشاف سبام أو رسائل مكررة أو نص متكرر', icon: 'ℹ️', isSpecial: false }
                                ]
                            },
                            stage: {
                                title: 'المنصة', icon: '📢', desc: 'أحداث الرومات التفاعلية والمنصة والمتحدثين', defaultColor: '#5865F2',
                                items: [
                                    { id: 'stage_create', title: 'إنشاء منصة', desc: 'عند إنشاء منصة صوتية', icon: '➕', isSpecial: true },
                                    { id: 'stage_delete', title: 'حذف منصة', desc: 'عند حذف منصة', icon: '🗑️', isSpecial: true },
                                    { id: 'stage_update', title: 'تعديل منصة', desc: 'عند تعديل منصة', icon: '✏️', isSpecial: true },
                                    { id: 'stage_speaker_add', title: 'إضافة متحدث', desc: 'عند إضافة متحدث للمنصة', icon: 'ℹ️', isSpecial: true },
                                    { id: 'stage_speaker_remove', title: 'إزالة متحدث', desc: 'عند إزالة متحدث', icon: '⬆️', isSpecial: true },
                                    { id: 'stage_hand_raise', title: 'طلب التحدث', desc: 'عند طلب عضو التحدث', icon: '⬇️', isSpecial: true }
                                ]
                            }
                        };

                        var currentCategory = 'members';
                        var currentFilter = 'all';
                        var currentEditModalLogId = null;

                        // State loaded from DB
                        var logsState = (function() {
                            try {
                                var s = ${JSON.stringify(settings.logs_config ? (typeof settings.logs_config === 'string' ? JSON.parse(settings.logs_config) : settings.logs_config) : {})};
                                return (s && typeof s === 'object') ? s : {};
                            } catch(e) { return {}; }
                        })();

                        function isLogEnabled(logId) {
                            if (logsState[logId] && logsState[logId].enabled !== undefined) {
                                return logsState[logId].enabled === true || logsState[logId].enabled === 1 || logsState[logId].enabled === '1';
                            }
                            return false;
                        }

                        function renderCategoriesSidebar() {
                            var container = document.getElementById('logsCategoriesList');
                            if (!container) return;
                            var html = '';
                            var catKeys = Object.keys(LOG_CATEGORIES);

                            for (var i = 0; i < catKeys.length; i++) {
                                var k = catKeys[i];
                                var cat = LOG_CATEGORIES[k];
                                var isSel = k === currentCategory;

                                var totalItems = cat.items.length;
                                var enabledItems = 0;
                                for (var j = 0; j < cat.items.length; j++) {
                                    if (isLogEnabled(cat.items[j].id)) enabledItems++;
                                }

                                var badgeClass = enabledItems === 0
                                    ? 'px-2 py-0.5 bg-rose-950/60 text-rose-400 rounded-lg text-[10px] font-mono'
                                    : (enabledItems === totalItems
                                        ? 'px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono'
                                        : 'px-2 py-0.5 bg-purple-950/60 text-purple-300 rounded-lg text-[10px] font-mono');

                                html += '<button type="button" onclick="switchLogsCategory(\'' + k + '\')" class="w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ' + (isSel ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5') + '">';
                                html += '<span class="' + badgeClass + '">' + enabledItems + '/' + totalItems + '</span>';
                                html += '<span class="flex items-center gap-2"><span>' + cat.title + '</span><span>' + cat.icon + '</span></span>';
                                html += '</button>';
                            }
                            container.innerHTML = html;
                            updateGlobalStats();
                        }

                        function renderLogsGrid() {
                            var container = document.getElementById('logsCardsGrid');
                            if (!container) return;

                            var cat = LOG_CATEGORIES[currentCategory] || LOG_CATEGORIES.members;
                            document.getElementById('activeCatTitle').textContent = cat.title;
                            document.getElementById('activeCatIcon').textContent = cat.icon;
                            document.getElementById('activeCatCount').textContent = cat.items.length + ' سجل';

                            var searchVal = (document.getElementById('logSearchInput')?.value || '').toLowerCase().trim();

                            var filtered = cat.items.filter(function(item) {
                                var en = isLogEnabled(item.id);
                                if (currentFilter === 'enabled' && !en) return false;
                                if (currentFilter === 'disabled' && en) return false;
                                if (searchVal && item.title.toLowerCase().indexOf(searchVal) === -1 && item.desc.toLowerCase().indexOf(searchVal) === -1) return false;
                                return true;
                            });

                            if (!filtered.length) {
                                container.innerHTML = '<div class="col-span-full py-12 bg-[#0b0d14] border border-white/5 rounded-3xl text-center text-xs text-gray-500 font-bold">لا توجد سجلات مطابقة للبحث أو الفلتر 🔍</div>';
                                return;
                            }

                            var html = '';
                            for (var i = 0; i < filtered.length; i++) {
                                var item = filtered[i];
                                var en = isLogEnabled(item.id);
                                var customCfg = logsState[item.id] || {};
                                var customChan = customCfg.channel_id || '';
                                var customColor = customCfg.color || cat.defaultColor || '#5865F2';

                                html += '<div class="bg-[#0b0d14] border border-white/5 hover:border-purple-500/40 p-4 rounded-2xl flex items-center justify-between transition ' + (en ? '' : 'opacity-40') + '" data-log-id="' + item.id + '">';

                                // Left: Toggle + Edit Options Button
                                html += '<div class="flex items-center gap-2.5">';
                                html += '<label class="toggle"><input type="checkbox" data-log-checkbox="' + item.id + '" ' + (en ? 'checked' : '') + ' onchange="toggleSingleLogEvent(\'' + item.id + '\', this.checked)"><span class="slider"></span></label>';
                                html += '<button type="button" onclick="openEditLogModal(\'' + item.id + '\', \'' + item.title + '\', \'' + item.icon + '\')" title="تخصيص القناة واللون" class="w-8 h-8 rounded-xl bg-[#1a1d2d] hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 flex items-center justify-center text-xs font-bold transition shadow cursor-pointer">⚙️</button>';
                                html += '</div>';

                                // Right: Title + description + Icon & Badges
                                html += '<div class="flex items-center gap-3">';
                                html += '<div class="text-right">';
                                html += '<div class="flex items-center justify-end gap-2">';
                                if (customChan) html += '<span class="px-2 py-0.5 bg-blue-950/60 text-blue-300 border border-blue-800/40 rounded-lg text-[9px] font-bold">قناة مخصصة</span>';
                                html += '<span class="font-black text-white text-xs">' + item.title + '</span>';
                                html += '<span class="w-2.5 h-2.5 rounded-full" style="background-color:' + customColor + '" title="لون الإيمبد"></span>';
                                html += '</div>';
                                html += '<p class="text-[10px] text-gray-400 mt-0.5">' + item.desc + '</p>';
                                html += '</div>';
                                html += '<div class="w-9 h-9 rounded-xl bg-white/5 text-gray-300 flex items-center justify-center text-base border border-white/5 shadow-inner flex-shrink-0">' + item.icon + '</div>';
                                html += '</div>';
                            }
                            container.innerHTML = html;
                        }

                        function updateGlobalStats() {
                            var total = 0, enabled = 0, channelsSet = new Set();
                            var catKeys = Object.keys(LOG_CATEGORIES);
                            for (var i = 0; i < catKeys.length; i++) {
                                var items = LOG_CATEGORIES[catKeys[i]].items;
                                total += items.length;
                                for (var j = 0; j < items.length; j++) {
                                    var id = items[j].id;
                                    if (isLogEnabled(id)) enabled++;
                                    if (logsState[id] && logsState[id].channel_id) channelsSet.add(logsState[id].channel_id);
                                }
                            }
                            var e1 = document.getElementById('statEnabledLogs');
                            var e2 = document.getElementById('statChannelsUsed');
                            if (e1) e1.textContent = enabled;
                            if (e2) e2.textContent = channelsSet.size;
                        }

                        function showSavedBanner() {
                            var el = document.getElementById('logsSaveIndicator');
                            if (el) {
                                el.classList.remove('opacity-0');
                                setTimeout(function() { el.classList.add('opacity-0'); }, 2000);
                            }
                        }

                        function saveLogsConfigToServer() {
                            try {
                                var gId = window.location.pathname.split('/')[2];
                                if (!gId) return;
                                var xhr = new XMLHttpRequest();
                                xhr.open('POST', '/api/guild/' + gId + '/settings', true);
                                xhr.setRequestHeader('Content-Type', 'application/json');
                                xhr.onload = function() {
                                    try { if (JSON.parse(xhr.responseText).success) showSavedBanner(); } catch(e) {}
                                };
                                xhr.send(JSON.stringify({
                                    logs_config: JSON.stringify(logsState)
                                }));
                            } catch(e) {}
                        }

                        window.saveLogsSetting = function(key, val) {
                            try {
                                var gId = window.location.pathname.split('/')[2];
                                if (!gId) return;
                                var body = {};
                                body[key] = val ? 1 : 0;
                                var xhr = new XMLHttpRequest();
                                xhr.open('POST', '/api/guild/' + gId + '/settings', true);
                                xhr.setRequestHeader('Content-Type', 'application/json');
                                xhr.onload = function() {
                                    try { if (JSON.parse(xhr.responseText).success) showSavedBanner(); } catch(e) {}
                                };
                                xhr.send(JSON.stringify(body));
                            } catch(e) {}
                        };

                        window.switchLogsCategory = function(catKey) {
                            currentCategory = catKey;
                            renderCategoriesSidebar();
                            renderLogsGrid();
                        };

                        window.filterLogsByStatus = function(status) {
                            currentFilter = status;
                            document.getElementById('btnLogFilterAll').className = status === 'all' ? "px-3.5 py-1.5 rounded-xl text-xs font-bold bg-purple-600 text-white transition shadow cursor-pointer" : "px-3.5 py-1.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer";
                            document.getElementById('btnLogFilterEnabled').className = status === 'enabled' ? "px-3.5 py-1.5 rounded-xl text-xs font-bold bg-purple-600 text-white transition shadow cursor-pointer" : "px-3.5 py-1.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer";
                            document.getElementById('btnLogFilterDisabled').className = status === 'disabled' ? "px-3.5 py-1.5 rounded-xl text-xs font-bold bg-purple-600 text-white transition shadow cursor-pointer" : "px-3.5 py-1.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer";
                            renderLogsGrid();
                        };

                        window.searchLogsItems = function() {
                            renderLogsGrid();
                        };

                        window.toggleSingleLogEvent = function(logId, enable) {
                            if (!logsState[logId]) logsState[logId] = {};
                            logsState[logId].enabled = enable;
                            var card = document.querySelector('div[data-log-id="' + logId + '"]');
                            if (card) {
                                if (enable) card.classList.remove('opacity-40');
                                else card.classList.add('opacity-40');
                            }
                            renderCategoriesSidebar();
                            saveLogsConfigToServer();
                        };

                        window.toggleActiveCategoryLogs = function(enable) {
                            var cat = LOG_CATEGORIES[currentCategory];
                            if (!cat) return;
                            for (var i = 0; i < cat.items.length; i++) {
                                var id = cat.items[i].id;
                                if (!logsState[id]) logsState[id] = {};
                                logsState[id].enabled = enable;
                            }
                            renderCategoriesSidebar();
                            renderLogsGrid();
                            saveLogsConfigToServer();
                        };

                        window.applyCatSettingsToAll = function() {
                            var cat = LOG_CATEGORIES[currentCategory];
                            if (!cat) return;
                            var color = document.getElementById('catColorHex')?.value || '#5865F2';
                            var chan = document.getElementById('catDefaultChannel')?.value || '';

                            for (var i = 0; i < cat.items.length; i++) {
                                var id = cat.items[i].id;
                                if (!logsState[id]) logsState[id] = {};
                                if (color) logsState[id].color = color;
                                if (chan) logsState[id].channel_id = chan;
                            }
                            alert('✅ تم تطبيق القناة واللون الافتراضي على جميع سجلات قسم (' + cat.title + ') بنجاح!');
                            renderCategoriesSidebar();
                            renderLogsGrid();
                            saveLogsConfigToServer();
                        };

                        window.openEditLogModal = function(logId, title, icon) {
                            currentEditModalLogId = logId;
                            var modal = document.getElementById('editLogModal');
                            var titleEl = document.getElementById('modalLogTitle');
                            var iconEl = document.getElementById('modalLogIcon');
                            var chanEl = document.getElementById('modalLogChannel');
                            var colorHex = document.getElementById('modalLogColorHex');
                            var colorPicker = document.getElementById('modalLogColorPicker');

                            if (titleEl) titleEl.textContent = title || 'تخصيص السجل';
                            if (iconEl) iconEl.textContent = icon || '📜';

                            var cfg = logsState[logId] || {};
                            if (chanEl) chanEl.value = cfg.channel_id || '';
                            var col = cfg.color || '#5865F2';
                            if (colorHex) colorHex.value = col;
                            if (colorPicker) colorPicker.value = col;

                            if (modal) modal.classList.remove('hidden');
                        };

                        window.closeEditLogModal = function() {
                            var modal = document.getElementById('editLogModal');
                            if (modal) modal.classList.add('hidden');
                            currentEditModalLogId = null;
                        };

                        window.saveModalLogConfig = function() {
                            if (!currentEditModalLogId) return;
                            var chanEl = document.getElementById('modalLogChannel');
                            var colorHex = document.getElementById('modalLogColorHex');

                            if (!logsState[currentEditModalLogId]) logsState[currentEditModalLogId] = { enabled: true };
                            logsState[currentEditModalLogId].channel_id = chanEl ? chanEl.value : '';
                            logsState[currentEditModalLogId].color = colorHex ? colorHex.value : '#5865F2';

                            saveLogsConfigToServer();
                            closeEditLogModal();
                            renderCategoriesSidebar();
                            renderLogsGrid();
                        };

                        window.autoSetupLogsChannels = async function(mode) {
                            const modeTitle = mode === 'grouped' ? 'القنوات العادية (قسم لكل قناة)' : 'القنوات المفصلة (قناة لكل نوع سجل)';
                            if (!confirm('هل تريد إنشاء قنوات السجلات تلقائياً بالسيرفر بنظام: ' + modeTitle + '؟')) return;

                            try {
                                const gId = window.location.pathname.split('/')[2];
                                const res = await fetch('/api/guild/' + gId + '/logs/auto-setup', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ mode })
                                });
                                const d = await res.json();
                                if (d.success) {
                                    alert('✅ تم إنشاء وتوزيع قنوات السجلات بنجاح في السيرفر!');
                                    location.reload();
                                } else {
                                    alert('❌ ' + (d.error || 'فشل إنشاء القنوات'));
                                }
                            } catch(e) {
                                alert('حدث خطأ في الاتصال بالخادم');
                            }
                        };

                        window.deleteLogsChannels = async function() {
                            if (!confirm('⚠️ تحذير: هل أنت متأكد من حذف كاتيجوري سجلات ZENO وجميع القنوات بداخله نهائياً؟')) return;

                            try {
                                const gId = window.location.pathname.split('/')[2];
                                const res = await fetch('/api/guild/' + gId + '/logs/delete-channels', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' }
                                });
                                const d = await res.json();
                                if (d.success) {
                                    alert('✅ تم حذف قنوات السجلات بنجاح');
                                    location.reload();
                                } else {
                                    alert('❌ ' + (d.error || 'فشل الحذف'));
                                }
                            } catch(e) {
                                alert('حدث خطأ في الاتصال');
                            }
                        };

                        // Initial render
                        renderCategoriesSidebar();
                        renderLogsGrid();
                    })();
                    </script>
                `;
            } else if (section === 'analytics' || section === 'stats') {
                const totalMembers = guild.memberCount || 0;
                const textChCount = (guildTextChannels || []).length;
                const voiceChCount = (guildVoiceChannels || []).length;
                const rolesCount = (guildRoles || []).length;
                const suggestionsCount = (guildSuggestionsList || []).length;

                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <!-- Header -->
                        <div class="bg-gradient-to-r from-[#1a132e] via-[#12141f] to-[#1a132e] border border-purple-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
                            <div class="flex items-center gap-2">
                                <a href="/dashboard/${guildId}/stat-channels" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition shadow">
                                    إدارة قنوات العدادات 📡
                                </a>
                            </div>
                            <div class="text-right">
                                <h4 class="font-black text-white text-xl flex items-center gap-2 justify-end"><span>لوحة الإحصائيات والتحليلات المتقدمة</span><span>📊</span></h4>
                                <p class="text-gray-400 text-xs mt-0.5">تحليل شامل لحركة السيرفر ونموه وتوزيع الأعضاء والقنوات</p>
                            </div>
                        </div>

                        <!-- Top Metric Cards -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div class="bg-[#12141f] border border-white/5 hover:border-purple-500/30 p-5 rounded-3xl text-center space-y-1 shadow-xl transition">
                                <div class="w-10 h-10 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg mx-auto mb-2">👥</div>
                                <span class="text-3xl font-black text-white font-mono">${totalMembers}</span>
                                <span class="text-xs font-bold text-gray-400 block">إجمالي الأعضاء</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 hover:border-purple-500/30 p-5 rounded-3xl text-center space-y-1 shadow-xl transition">
                                <div class="w-10 h-10 rounded-2xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center text-lg mx-auto mb-2">💬</div>
                                <span class="text-3xl font-black text-emerald-400 font-mono">${textChCount}</span>
                                <span class="text-xs font-bold text-gray-400 block">القنوات النصية</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 hover:border-purple-500/30 p-5 rounded-3xl text-center space-y-1 shadow-xl transition">
                                <div class="w-10 h-10 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center text-lg mx-auto mb-2">🔊</div>
                                <span class="text-3xl font-black text-blue-400 font-mono">${voiceChCount}</span>
                                <span class="text-xs font-bold text-gray-400 block">القنوات الصوتية</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 hover:border-purple-500/30 p-5 rounded-3xl text-center space-y-1 shadow-xl transition">
                                <div class="w-10 h-10 rounded-2xl bg-amber-600/20 text-amber-400 flex items-center justify-center text-lg mx-auto mb-2">🎖️</div>
                                <span class="text-3xl font-black text-amber-400 font-mono">${rolesCount}</span>
                                <span class="text-xs font-bold text-gray-400 block">الرتب المسجلة</span>
                            </div>
                        </div>

                        <!-- Server Health and Activity Indicators -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl">
                                <h4 class="text-sm font-black text-white border-b border-white/5 pb-3 flex items-center gap-2 justify-end">
                                    <span>مؤشرات تفاعل السيرفر</span>
                                    <span>⚡</span>
                                </h4>
                                <div class="space-y-3">
                                    <div>
                                        <div class="flex items-center justify-between text-xs mb-1">
                                            <span class="text-purple-400 font-bold">${suggestionsCount} اقتراح</span>
                                            <span class="text-gray-300 font-bold">الاقتراحات والشكاوى</span>
                                        </div>
                                        <div class="w-full bg-[#0b0d14] h-2 rounded-full overflow-hidden">
                                            <div class="bg-purple-600 h-full rounded-full" style="width: ${Math.min(100, (suggestionsCount / 20) * 100)}%"></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div class="flex items-center justify-between text-xs mb-1">
                                            <span class="text-emerald-400 font-bold">${textChCount + voiceChCount} قناة</span>
                                            <span class="text-gray-300 font-bold">إجمالي قنوات السيرفر</span>
                                        </div>
                                        <div class="w-full bg-[#0b0d14] h-2 rounded-full overflow-hidden">
                                            <div class="bg-emerald-500 h-full rounded-full" style="width: ${Math.min(100, ((textChCount + voiceChCount) / 50) * 100)}%"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl">
                                <h4 class="text-sm font-black text-white border-b border-white/5 pb-3 flex items-center gap-2 justify-end">
                                    <span>الربط السريع للعدادات</span>
                                    <span>📡</span>
                                </h4>
                                <p class="text-xs text-gray-400 leading-relaxed">
                                    يمكنك الآن تفعيل **9 أنواع مختلفة** من قنوات الإحصائيات (أعضاء، بشر، بوتات، متصلين، صوتية، رتب...) تتحدث تلقائياً كل 10 دقائق من قسم قنوات الإحصائيات.
                                </p>
                                <a href="/dashboard/${guildId}/stat-channels" class="block text-center py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg">
                                    فتح مدير قنوات الإحصائيات (9 أنواع) 🚀
                                </a>
                            </div>
                        </div>
                    </div>`;
            } else if (section === 'stat-channels') {
                // Load current stat channels for this guild
                let statChannelsRows = [];
                try {
                    rawDb.exec(`CREATE TABLE IF NOT EXISTS stat_channels (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        guild_id TEXT NOT NULL,
                        channel_id TEXT NOT NULL,
                        stat_type TEXT NOT NULL,
                        custom_prefix TEXT DEFAULT '',
                        enabled INTEGER DEFAULT 1,
                        UNIQUE(guild_id, channel_id)
                    )`);
                    statChannelsRows = rawDb.prepare('SELECT * FROM stat_channels WHERE guild_id = ?').all(guildId);
                } catch(e) {}

                const STAT_TYPES_DEF = {
                    total_members:  { label: 'إجمالي الأعضاء', icon: '👥', desc: 'عدد جميع الأعضاء في السيرفر' },
                    humans:         { label: 'البشر', icon: '👤', desc: 'عدد الأعضاء البشريين فقط' },
                    bots:           { label: 'البوتات', icon: '🤖', desc: 'عدد البوتات في السيرفر' },
                    online:         { label: 'الأعضاء الأونلاين', icon: '🟢', desc: 'عدد الأعضاء المتصلين حالياً' },
                    voice:          { label: 'المتصلين صوتياً', icon: '🎙️', desc: 'عدد الأعضاء في القنوات الصوتية' },
                    text_channels:  { label: 'القنوات النصية', icon: '#️⃣', desc: 'عدد القنوات النصية' },
                    voice_channels: { label: 'القنوات الصوتية', icon: '🔊', desc: 'عدد القنوات الصوتية' },
                    total_channels: { label: 'عدد القنوات الكلي', icon: '📂', desc: 'إجمالي عدد جميع القنوات' },
                    roles:          { label: 'الرتب الكلية', icon: '🏷️', desc: 'عدد الرتب في السيرفر' },
                };

                const configuredMap = {};
                for (const row of statChannelsRows) {
                    configuredMap[row.stat_type] = row;
                }

                const statRowsHtml = Object.entries(STAT_TYPES_DEF).map(([type, def]) => {
                    const configured = configuredMap[type];
                    const hasChannel = !!configured;
                    return `
                    <div class="bg-[#12141f] border ${hasChannel ? 'border-purple-500/40' : 'border-white/5'} rounded-2xl p-4 flex items-center justify-between gap-4 hover:border-purple-500/30 transition" id="stat-row-${type}">
                        <div class="flex items-center gap-3">
                            ${hasChannel ? `
                            <form method="POST" action="/api/guild/${guildId}/stat-channels/${configured.id}/delete" class="inline">
                                <button type="submit" class="px-3 py-2 bg-rose-900/40 hover:bg-rose-700/50 text-rose-300 rounded-xl text-xs font-bold border border-rose-800/30 transition" title="حذف هذه القناة">🗑️</button>
                            </form>
                            ` : `
                            <button onclick="openAddStatChannel('${type}', '${def.label}')" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow transition">إنشاء</button>
                            `}
                        </div>
                        <div class="flex-1 text-right">
                            <div class="flex items-center justify-end gap-2">
                                <span class="text-sm font-black text-white">${def.label}</span>
                                <div class="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/30 text-base flex items-center justify-center">${def.icon}</div>
                            </div>
                            <p class="text-[11px] text-gray-400 mt-0.5">${def.desc}</p>
                            ${hasChannel ? `<p class="text-[10px] text-purple-400 font-mono mt-1">📡 مربوطة بـ: <code class="bg-purple-950/40 px-1.5 py-0.5 rounded">${configured.channel_id}</code></p>` : ''}
                        </div>
                    </div>
                    `;
                }).join('');

formFieldsHtml = `<div class="space-y-6 text-right" dir="rtl">

    <!-- Header -->
    <div class="bg-gradient-to-r from-[#1a132e] via-[#12141f] to-[#1a132e] border border-purple-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
        <div class="flex items-center gap-3">
            <div class="text-left">
                <div class="text-xs text-purple-400 font-bold font-mono">يتحدث كل 10 دقائق</div>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center text-2xl shadow-lg">📈</div>
        </div>
        <div class="text-right">
            <h3 class="font-black text-white text-xl">قنوات الإحصائيات</h3>
            <p class="text-gray-400 text-xs mt-0.5">اعرض إحصائيات سيرفرك في قنوات صوتية مقفلة في الشريط الجانبي.</p>
            <p class="text-gray-500 text-[10px] mt-0.5">⚠️ تأكد أن البوت لديه صلاحية إدارة القنوات (Manage Channels)</p>
        </div>
    </div>

    <!-- Stats Counter -->
    <div class="grid grid-cols-3 gap-3">
        <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
            <div class="text-2xl font-black text-white">${statChannelsRows.length}</div>
            <div class="text-xs text-gray-400 font-bold mt-1">قناة مُفعّلة</div>
        </div>
        <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
            <div class="text-2xl font-black text-purple-400">${Object.keys(STAT_TYPES_DEF).length}</div>
            <div class="text-xs text-gray-400 font-bold mt-1">نوع متاح</div>
        </div>
        <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
            <div class="text-2xl font-black text-emerald-400">10</div>
            <div class="text-xs text-gray-400 font-bold mt-1">دقيقة للتحديث</div>
        </div>
    </div>

    <!-- Stat Channels List -->
    <div class="bg-[#12141f] border border-white/5 rounded-3xl p-6 shadow-xl space-y-3">
        <div class="flex items-center justify-between pb-3 border-b border-white/5">
            <span class="text-xs text-purple-400 font-bold">${statChannelsRows.length}/9 قنوات</span>
            <h4 class="text-sm font-black text-white">العدادات الأساسية</h4>
        </div>
        ${statRowsHtml}
    </div>

    <!-- Add Modal -->
    <div id="addStatChannelModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div class="bg-[#10121b] border border-purple-500/30 rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl space-y-5">
            <div class="text-center">
                <h3 class="text-lg font-black text-white" id="addStatModalTitle">إنشاء قناة إحصائية</h3>
                <p class="text-gray-400 text-xs mt-1">سيقوم البوت بتحديث اسم هذه القناة تلقائياً كل 10 دقائق</p>
            </div>
            <form id="addStatChannelForm" class="space-y-4 text-right">
                <input type="hidden" id="addStatType" name="stat_type">
                <div>
                    <label class="text-xs font-bold text-gray-300 block mb-1.5">أيدي (ID) القناة الصوتية</label>
                    <input type="text" name="channel_id" id="addStatChannelId" placeholder="مثال: 123456789012345678" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none font-mono text-right" required>
                    <p class="text-[10px] text-gray-500 mt-1">انسخ ID القناة الصوتية من ديسكورد (كليك يمين → نسخ المعرف)</p>
                </div>
                <div>
                    <label class="text-xs font-bold text-gray-300 block mb-1.5">نص مخصص للبادئة (اختياري)</label>
                    <input type="text" name="custom_prefix" id="addStatPrefix" placeholder="مثال: 👥 الأعضاء" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">
                    <p class="text-[10px] text-gray-500 mt-1">إذا تركته فارغاً سيستخدم البوت النص الافتراضي</p>
                </div>
                <div class="flex gap-3 pt-2">
                    <button type="button" onclick="closeAddStatChannel()" class="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-xs font-bold transition">إلغاء</button>
                    <button type="submit" class="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow transition">حفظ وإنشاء</button>
                </div>
            </form>
        </div>
    </div>

    <script>
    function openAddStatChannel(type, label) {
        document.getElementById('addStatType').value = type;
        document.getElementById('addStatModalTitle').textContent = 'إنشاء قناة: ' + label;
        document.getElementById('addStatChannelModal').classList.remove('hidden');
    }
    function closeAddStatChannel() {
        document.getElementById('addStatChannelModal').classList.add('hidden');
    }
    document.getElementById('addStatChannelForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const data = {
            stat_type: document.getElementById('addStatType').value,
            channel_id: document.getElementById('addStatChannelId').value.trim(),
            custom_prefix: document.getElementById('addStatPrefix').value.trim()
        };
        if (!data.channel_id) return alert('أدخل أيدي القناة أولاً');
        try {
            const res = await fetch('/api/guild/${guildId}/stat-channels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const json = await res.json();
            if (json.success) {
                alert('✅ تم إضافة قناة الإحصائيات! سيتم تحديثها خلال دقائق.');
                location.reload();
            } else {
                alert('❌ ' + (json.error || 'حدث خطأ'));
            }
        } catch(err) {
            alert('❌ خطأ في الاتصال');
        }
    });
    </script>

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

            } else if (section === 'backup') {
                // Load backups from DB
                let backupsList = [];
                try {
                    rawDb.exec(`CREATE TABLE IF NOT EXISTS guild_backups (
                        id TEXT PRIMARY KEY,
                        guild_id TEXT NOT NULL,
                        created_by TEXT NOT NULL,
                        label TEXT DEFAULT '',
                        channels_count INTEGER DEFAULT 0,
                        roles_count INTEGER DEFAULT 0,
                        settings_snapshot TEXT,
                        channels_snapshot TEXT,
                        roles_snapshot TEXT,
                        created_at INTEGER DEFAULT (strftime('%s','now'))
                    )`);
                    backupsList = rawDb.prepare('SELECT id, guild_id, created_by, label, channels_count, roles_count, created_at FROM guild_backups WHERE guild_id = ? ORDER BY created_at DESC LIMIT 10').all(guildId);
                } catch(e) {}

                const backupRowsHtml = backupsList.length === 0 ? `
                    <div class="py-16 text-center space-y-3">
                        <div class="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center text-3xl mx-auto opacity-40">💾</div>
                        <p class="text-gray-400 text-sm font-bold">لا توجد نسخ احتياطية بعد</p>
                        <p class="text-gray-600 text-xs">سيتم إنشاء نسخة للقائمة عند تفعيل الحماية</p>
                    </div>
                ` : backupsList.map(b => {
                    const date = new Date(b.created_at * 1000);
                    const dateStr = date.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    return `
                    <div class="bg-[#12141f] border border-white/5 hover:border-purple-500/30 rounded-2xl p-4 flex items-center justify-between gap-4 transition">
                        <div class="flex items-center gap-2">
                            <button onclick="if(confirm('هل أنت متأكد من استعادة هذه النسخة الاحتياطية؟ سيتم إضافة العناصر المفقودة فقط.')) restoreBackup('${b.id}')" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow transition">استعادة</button>
                            <button onclick="if(confirm('حذف هذه النسخة الاحتياطية؟')) deleteBackup('${b.id}')" class="px-3 py-2 bg-rose-900/40 hover:bg-rose-700/50 text-rose-300 rounded-xl text-xs font-bold border border-rose-800/30 transition">🗑️</button>
                        </div>
                        <div class="flex-1 text-right">
                            <div class="font-bold text-white text-sm">${b.label || ('نسخة ' + dateStr)}</div>
                            <div class="text-[11px] text-gray-400 mt-0.5 flex items-center justify-end gap-3">
                                <span>📝 ${b.channels_count} قناة</span>
                                <span>🏷️ ${b.roles_count} رتبة</span>
                                <span class="text-gray-600 font-mono">${dateStr}</span>
                            </div>
                        </div>
                        <div class="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400 flex items-center justify-center text-lg">💾</div>
                    </div>
                    `;
                }).join('');

formFieldsHtml = `<div class="space-y-6 text-right" dir="rtl">

    <!-- Header -->
    <div class="bg-gradient-to-r from-[#1a132e] via-[#12141f] to-[#1a132e] border border-purple-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
        <div class="flex items-center gap-3">
            <button onclick="createBackupNow()" class="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-lg transition">
                إنشاء نسخة الآن 💾
            </button>
        </div>
        <div class="text-right">
            <h3 class="font-black text-white text-xl">الحماية / النسخ الاحتياطية</h3>
            <p class="text-gray-400 text-xs mt-0.5">احتفظ بنسخة من قنوات ورتب سيرفرك وأعدها بضغطة زر</p>
        </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-3 gap-3">
        <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
            <div class="text-2xl font-black text-white">${backupsList.length}</div>
            <div class="text-xs text-gray-400 font-bold mt-1">النسخ المتاحة</div>
        </div>
        <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
            <div class="text-2xl font-black text-purple-400">30</div>
            <div class="text-xs text-gray-400 font-bold mt-1">يوم احتفاظ</div>
        </div>
        <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
            <div class="text-2xl font-black text-emerald-400">10</div>
            <div class="text-xs text-gray-400 font-bold mt-1">أقصى نسخة</div>
        </div>
    </div>

    <!-- Backups List -->
    <div class="bg-[#12141f] border border-white/5 rounded-3xl p-6 shadow-xl space-y-3">
        <div class="flex items-center justify-between pb-3 border-b border-white/5">
            <span class="text-xs text-purple-400 font-bold">${backupsList.length} نسخة</span>
            <h4 class="text-sm font-black text-white">📋 النسخ المتاحة</h4>
        </div>
        ${backupRowsHtml}
    </div>

    <!-- Info Box -->
    <div class="bg-indigo-950/30 border border-indigo-800/30 rounded-2xl p-4 space-y-2">
        <div class="flex items-center justify-end gap-2">
            <h5 class="text-sm font-black text-indigo-300">معلومات مهمة</h5>
            <span class="text-indigo-400">ℹ️</span>
        </div>
        <ul class="space-y-1.5 text-right">
            <li class="text-xs text-gray-400 flex items-center justify-end gap-2"><span>يتم الاحتفاظ بالنسخ لمدة 30 يوم ثم تحذف تلقائياً</span><span class="text-indigo-400">•</span></li>
            <li class="text-xs text-gray-400 flex items-center justify-end gap-2"><span>الاستعادة لا تحذف القنوات/الرتب الحالية، بل تضيف المفقودة فقط</span><span class="text-indigo-400">•</span></li>
            <li class="text-xs text-gray-400 flex items-center justify-end gap-2"><span>فقط مالك السيرفر والأعضاء الموثوقين يمكنهم استخدام أمر الاستعادة</span><span class="text-indigo-400">•</span></li>
        </ul>
    </div>

    <script>
    async function createBackupNow() {
        const label = prompt('أدخل اسماً للنسخة (اختياري):', '');
        if (label === null) return;
        const btn = event.target;
        const orig = btn.textContent;
        btn.disabled = true; btn.textContent = 'جارٍ الإنشاء... ⏳';
        try {
            const r = await fetch('/api/guild/${guildId}/backup/create', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ label })
            });
            const d = await r.json();
            if (d.success) { alert('✅ تم إنشاء النسخة الاحتياطية بنجاح!\n📝 ' + d.channels_count + ' قناة، 🏷️ ' + d.roles_count + ' رتبة'); location.reload(); }
            else alert('❌ ' + (d.error || 'فشل الإنشاء'));
        } catch(e) { alert('❌ خطأ في الاتصال'); }
        btn.disabled = false; btn.textContent = orig;
    }
    async function restoreBackup(id) {
        const btn = event.target;
        btn.disabled = true; btn.textContent = 'جارٍ الاستعادة... ⏳';
        try {
            const r = await fetch('/api/guild/${guildId}/backup/' + id + '/restore', { method: 'POST' });
            const d = await r.json();
            if (d.success) alert('✅ تمت الاستعادة بنجاح!\n' + (d.message || ''));
            else alert('❌ ' + (d.error || 'فشل'));
        } catch(e) { alert('❌ خطأ'); }
        btn.disabled = false; btn.textContent = 'استعادة';
    }
    async function deleteBackup(id) {
        try {
            const r = await fetch('/api/guild/${guildId}/backup/' + id + '/delete', { method: 'POST' });
            const d = await r.json();
            if (d.success) location.reload();
            else alert('❌ ' + (d.error || 'فشل الحذف'));
        } catch(e) { alert('❌ خطأ'); }
    }
    </script>

</div>`;
            } else if (section === 'quran') {
                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <!-- Header Banner -->
                        <div class="bg-gradient-to-r from-[#1a132e] via-[#12141f] to-[#1a132e] border border-purple-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
                            <label class="toggle"><input type="checkbox" name="quran_enabled" value="1" checked><span class="slider"></span></label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-xl flex items-center gap-2 justify-end"><span>القرآن الكريم والإذاعات الإسلامية</span><span>🕌</span></h4>
                                    <p class="text-gray-400 text-xs mt-0.5">تشغيل القرآن الكريم وإذاعات كبار القراء على مدار الساعة 24/7 في قنوات السيرفر الصوتية</p>
                                </div>
                                <div class="w-10 h-10 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-xl border border-purple-500/30">📖</div>
                            </div>
                        </div>

                        <!-- Direct Play Control Card -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl">
                            <h4 class="text-sm font-black text-white border-b border-white/5 pb-3 flex items-center gap-2 justify-end">
                                <span>تشغيل مباشر في القناة الصوتية</span>
                                <span>▶️</span>
                            </h4>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">القناة الصوتية المستهدفة <span class="text-purple-400">*</span></label>
                                    ${renderChannelSelect('quranVoiceChannel', '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">اختر القارئ أو الإذاعة <span class="text-purple-400">*</span></label>
                                    <select id="quranStationSelect" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                        <option value="cairo_radio">📻 إذاعة القرآن الكريم من القاهرة (مباشر 24/7)</option>
                                        <option value="makkah_radio">📻 إذاعة القرآن الكريم من مكة المكرمة (مباشر 24/7)</option>
                                        <option value="afasy">📖 الشيخ مشاري راشد العفاسي</option>
                                        <option value="abdulbasit">📖 الشيخ عبدالباسط عبدالصمد (المجود)</option>
                                        <option value="muaiqly">📖 الشيخ ماهر المعيقلي</option>
                                        <option value="dosari">📖 الشيخ ياسر الدوسري</option>
                                        <option value="ghamdi">📖 الشيخ سعد الغامدي</option>
                                        <option value="sudais">📖 الشيخ عبدالرحمن السديس</option>
                                        <option value="shuraim">📖 الشيخ سعود الشريم</option>
                                        <option value="ajmy">📖 الشيخ أحمد العجمي</option>
                                        <option value="shatri">📖 الشيخ أبو بكر الشاطري</option>
                                    </select>
                                </div>
                            </div>

                            <div class="flex items-center justify-end gap-3 pt-2">
                                <button type="button" onclick="stopQuranStream()" id="btnStopQuran" class="px-5 py-2.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 rounded-xl text-xs font-bold transition flex items-center gap-1.5">
                                    <span>⏹️ إيقاف البث</span>
                                </button>
                                <button type="button" onclick="playQuranStream()" id="btnPlayQuran" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2">
                                    <span>▶️ تشغيل الآن في الروم الصوتي</span>
                                </button>
                            </div>
                        </div>

                        <!-- Available Stations Grid -->
                        <div class="space-y-3">
                            <h4 class="text-sm font-black text-white">قائمة المحطات والتلاوات المتاحة (11 محطة):</h4>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-right">
                                    <span class="text-xs font-black text-white block">إذاعة القاهرة 🇪🇬</span>
                                    <span class="text-[10px] text-gray-400">بث مباشر متواصل على مدار الساعة</span>
                                </div>
                                <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-right">
                                    <span class="text-xs font-black text-white block">إذاعة مكة المكرمة 🇸🇦</span>
                                    <span class="text-[10px] text-gray-400">تلاوات الحرم المكي الشريف</span>
                                </div>
                                <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-right">
                                    <span class="text-xs font-black text-white block">مشاري العفاسي 📖</span>
                                    <span class="text-[10px] text-gray-400">المصحف المرتل كاملاً</span>
                                </div>
                                <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-right">
                                    <span class="text-xs font-black text-white block">عبدالباسط عبدالصمد 📖</span>
                                    <span class="text-[10px] text-gray-400">تلاوات نادرة ومجودة</span>
                                </div>
                                <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-right">
                                    <span class="text-xs font-black text-white block">ماهر المعيقلي 📖</span>
                                    <span class="text-[10px] text-gray-400">تلاوات عذبة وخاشعة</span>
                                </div>
                                <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-right">
                                    <span class="text-xs font-black text-white block">ياسر الدوسري 📖</span>
                                    <span class="text-[10px] text-gray-400">تلاوة ترتيل مؤثرة</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <script>
                    async function playQuranStream() {
                        const channelId = document.getElementById('quranVoiceChannel').value;
                        const stationKey = document.getElementById('quranStationSelect').value;
                        if (!channelId) return alert('يرجى اختيار القناة الصوتية أولاً');

                        const btn = document.getElementById('btnPlayQuran');
                        btn.disabled = true; btn.textContent = 'جارٍ الاتصال والتشغيل... ⏳';

                        try {
                            const r = await fetch('/api/guild/${guildId}/quran/play', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ channelId, stationKey })
                            });
                            const d = await r.json();
                            if (d.success) alert('✅ تم بدء تشغيل إذاعة القرآن الكريم في القناة الصوتية بنجاح!');
                            else alert('❌ خطأ: ' + (d.error || 'فشل التشغيل'));
                        } catch(e) { alert('خطأ في الاتصال بالخادم'); }
                        finally { btn.disabled = false; btn.textContent = '▶️ تشغيل الآن في الروم الصوتي'; }
                    }

                    async function stopQuranStream() {
                        try {
                            const r = await fetch('/api/guild/${guildId}/quran/stop', { method: 'POST' });
                            const d = await r.json();
                            if (d.success) alert('⏹️ تم إيقاف البث ومغادرة الروم الصوتي.');
                            else alert('❌ خطأ: ' + (d.error || 'فشل'));
                        } catch(e) { alert('خطأ في الاتصال'); }
                    }
                    </script>
                `;
            } else if (section === 'fun') {
                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <!-- Header Banner -->
                        <div class="bg-gradient-to-r from-[#1a132e] via-[#12141f] to-[#1a132e] border border-purple-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
                            <label class="toggle"><input type="checkbox" name="fun_enabled" value="1" checked><span class="slider"></span></label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-xl flex items-center gap-2 justify-end"><span>نظام التسلية والألعاب التفاعلية</span><span>🎮</span></h4>
                                    <p class="text-gray-400 text-xs mt-0.5">ألعاب ديسكورد تفاعلية مع أزرار ومسابقات ذكاء وتحديات سرعة بين الأعضاء</p>
                                </div>
                                <div class="w-10 h-10 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-xl border border-purple-500/30">🕹️</div>
                            </div>
                        </div>

                        <!-- Direct Game Launcher Card -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl">
                            <h4 class="text-sm font-black text-white border-b border-white/5 pb-3 flex items-center gap-2 justify-end">
                                <span>إرسال لوحة الألعاب في قناة</span>
                                <span>🚀</span>
                            </h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">القناة المستهدفة <span class="text-purple-400">*</span></label>
                                    ${renderChannelSelect('funTargetChannel', '')}
                                </div>
                                <div class="flex items-end">
                                    <button type="button" onclick="sendGamesPanelDirect()" id="btnSendGamesPanel" class="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2">
                                        <span>🚀 إرسال لوحة الألعاب التفاعلية الآن</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Interactive Game Commands Management List -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-4">
                                <div class="flex items-center gap-2">
                                    <span id="funSaveIndicator" class="text-xs font-bold text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-lg opacity-0 transition-opacity duration-300">✓ حُفظت الإعدادات</span>
                                    <button type="button" onclick="toggleAllFunCmds(false)" class="px-3.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer">
                                        <span>✕</span><span>تعطيل الكل</span>
                                    </button>
                                    <button type="button" onclick="toggleAllFunCmds(true)" class="px-3.5 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/40 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer">
                                        <span>✓</span><span>تفعيل الكل</span>
                                    </button>
                                </div>
                                <div class="text-right">
                                    <h4 class="text-sm font-black text-white flex items-center gap-2 justify-end">
                                        <span>إدارة وتخصيص أوامر الألعاب والتسلية</span>
                                        <span>🎮</span>
                                    </h4>
                                    <p class="text-gray-400 text-xs mt-0.5">تحكم في تشغيل/إيقاف وتعديل اختصارات وصلاحيات كل لعبة على حدة</p>
                                </div>
                            </div>

                            <!-- List of Fun Commands -->
                            <div id="funCmdsContainer" class="space-y-3 pt-2">
                                ${(() => {
                                    const funGamesList = [
                                        { name: '/trivia', desc: 'مسابقة سؤال وجواب بمعلومات عامة وإسلامية', icon: '❓' },
                                        { name: '/games fast', desc: 'تحدي أسرع كتابة كلمات عربية في الشات', icon: '⚡' },
                                        { name: '/games rps', desc: 'حجر ورقة مقص ضد البوت بنظام النقاط', icon: '✂️' },
                                        { name: '/chairs', desc: 'لعبة الكراسي الموسيقية الجماعية', icon: '🪑' },
                                        { name: '/coinflip', desc: 'رمي العملة وتوقع صورة أو كتابة', icon: '🪙' },
                                        { name: '/fight', desc: 'تحدي معركة وقتال ضد عضو آخر', icon: '⚔️' },
                                        { name: '/hideseek', desc: 'لعبة الغميضة والاختباء الجماعية', icon: '🙈' },
                                        { name: '/mafia', desc: 'لعبة المافيا والأدوار السرية والتصويت', icon: '🎭' },
                                        { name: '/roulette', desc: 'لعبة الروليت الروسي والمخاطرة', icon: '🎰' },
                                        { name: '/gamble', desc: 'مراهنات الكازينو وعملات Star Coins', icon: '🎲' }
                                    ];

                                    let disabledCmds = [];
                                    try {
                                        disabledCmds = settings.disabled_commands ? (typeof settings.disabled_commands === 'string' ? JSON.parse(settings.disabled_commands) : settings.disabled_commands) : [];
                                    } catch(e) { disabledCmds = []; }
                                    if (!Array.isArray(disabledCmds)) disabledCmds = [];

                                    let customAliases = {};
                                    try {
                                        customAliases = settings.custom_aliases ? (typeof settings.custom_aliases === 'string' ? JSON.parse(settings.custom_aliases) : settings.custom_aliases) : {};
                                    } catch(e) { customAliases = {}; }
                                    if (!customAliases || typeof customAliases !== 'object') customAliases = {};

                                    return funGamesList.map(item => {
                                        const isEn = !disabledCmds.includes(item.name);
                                        const alias = customAliases[item.name] || '';
                                        return `
                                        <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-2xl flex items-center justify-between hover:border-purple-500/40 transition ${isEn ? '' : 'opacity-50'}" data-cmd="${item.name}">
                                            <div class="flex items-center gap-3">
                                                <label class="toggle"><input type="checkbox" data-fun-cmd="${item.name}" ${isEn ? 'checked' : ''} onchange="toggleSingleFunCmd('${item.name}', this.checked)"><span class="slider"></span></label>
                                                <button type="button" onclick="openFunAliasModal('${item.name}', '${item.icon}')" class="px-3 py-1.5 bg-[#1a1d2d] hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow cursor-pointer">
                                                    <span>⚙️</span><span id="aliasBadge_${item.name.replace(/[^a-zA-Z0-9]/g, '_')}">${alias ? 'اختصار: ' + alias : 'تخصيص الاختصار'}</span>
                                                </button>
                                            </div>
                                            <div class="flex items-center gap-3">
                                                <div class="text-right">
                                                    <div class="flex items-center justify-end gap-2">
                                                        <span id="aliasTag_${item.name.replace(/[^a-zA-Z0-9]/g, '_')}" class="${alias ? '' : 'hidden '}px-2 py-0.5 bg-purple-950/60 text-purple-300 border border-purple-800/40 rounded-lg text-[10px] font-bold">بديل: ${alias}</span>
                                                        <span class="font-black text-white text-xs font-mono" dir="ltr">${item.name}</span>
                                                    </div>
                                                    <p class="text-[11px] text-gray-400 mt-0.5">${item.desc}</p>
                                                </div>
                                                <div class="w-10 h-10 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30 shadow-inner">${item.icon}</div>
                                            </div>
                                        </div>
                                        `;
                                    }).join('');
                                })()}
                            </div>
                        </div>
                    </div>

                    <!-- Custom Aliases Modal -->
                    <div id="funAliasModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
                        <div class="bg-[#12141f] border border-purple-500/30 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-right" dir="rtl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <button type="button" onclick="closeFunAliasModal()" class="text-gray-400 hover:text-white text-lg font-bold">✕</button>
                                <div class="flex items-center gap-2">
                                    <h5 class="text-white font-black text-sm">تخصيص واختصار الأمر</h5>
                                    <span id="modalFunCmdIcon" class="text-base">🎮</span>
                                </div>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-1">الأمر الأصلي</label>
                                <input type="text" id="modalFunCmdName" readonly class="w-full bg-[#0b0d14] border border-white/5 rounded-xl px-3 py-2 text-xs text-purple-400 font-mono" dir="ltr">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-1">الاسم أو الاختصار المخصص (Alias)</label>
                                <input type="text" id="modalFunCmdAlias" placeholder="مثال: مسابقة, لعبة, قتال..." class="w-full bg-[#0b0d14] border border-white/10 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white outline-none">
                                <p class="text-[10px] text-gray-400 mt-1">يمكنك استخدام هذا الاختصار في الشات لاستدعاء اللعبة مباشرة</p>
                            </div>
                            <div class="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
                                <button type="button" onclick="closeFunAliasModal()" class="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-xs font-bold transition">إلغاء</button>
                                <button type="button" onclick="saveFunAlias()" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition shadow-lg">حفظ التغييرات</button>
                            </div>
                        </div>
                    </div>

                    <script>
                    var funDisabledCmds = {};
                    var funCustomAliases = {};
                    var currentModalCmd = null;

                    try {
                        var dArr = ${JSON.stringify(settings.disabled_commands ? (typeof settings.disabled_commands === 'string' ? JSON.parse(settings.disabled_commands) : settings.disabled_commands) : [])};
                        if (Array.isArray(dArr)) { for (var i = 0; i < dArr.length; i++) funDisabledCmds[dArr[i]] = true; }
                        var aObj = ${JSON.stringify(settings.custom_aliases ? (typeof settings.custom_aliases === 'string' ? JSON.parse(settings.custom_aliases) : settings.custom_aliases) : {})};
                        if (aObj && typeof aObj === 'object') funCustomAliases = aObj;
                    } catch(e) {}

                    function showFunSaved() {
                        var el = document.getElementById('funSaveIndicator');
                        if (el) {
                            el.classList.remove('opacity-0');
                            setTimeout(function() { el.classList.add('opacity-0'); }, 2000);
                        }
                    }

                    function saveFunSettingsState() {
                        try {
                            var gId = window.location.pathname.split('/')[2];
                            if (!gId) return;
                            var disArr = Object.keys(funDisabledCmds).filter(function(k) { return funDisabledCmds[k]; });
                            var xhr = new XMLHttpRequest();
                            xhr.open('POST', '/api/guild/' + gId + '/settings', true);
                            xhr.setRequestHeader('Content-Type', 'application/json');
                            xhr.onload = function() {
                                try { if (JSON.parse(xhr.responseText).success) showFunSaved(); } catch(e) {}
                            };
                            xhr.send(JSON.stringify({
                                disabled_commands: JSON.stringify(disArr),
                                custom_aliases: JSON.stringify(funCustomAliases)
                            }));
                        } catch(e) {}
                    }

                    window.toggleSingleFunCmd = function(cmdName, enabled) {
                        funDisabledCmds[cmdName] = !enabled;
                        var card = document.querySelector('div[data-cmd="' + cmdName + '"]');
                        if (card) {
                            if (enabled) card.classList.remove('opacity-50');
                            else card.classList.add('opacity-50');
                        }
                        saveFunSettingsState();
                    };

                    window.toggleAllFunCmds = function(enable) {
                        var cards = document.querySelectorAll('div[data-cmd]');
                        for (var i = 0; i < cards.length; i++) {
                            var c = cards[i];
                            var name = c.getAttribute('data-cmd');
                            if (!name) continue;
                            funDisabledCmds[name] = !enable;
                            var input = c.querySelector('input[type="checkbox"]');
                            if (input) input.checked = enable;
                            if (enable) c.classList.remove('opacity-50');
                            else c.classList.add('opacity-50');
                        }
                        saveFunSettingsState();
                    };

                    window.openFunAliasModal = function(cmdName, icon) {
                        currentModalCmd = cmdName;
                        var modal = document.getElementById('funAliasModal');
                        var nameEl = document.getElementById('modalFunCmdName');
                        var aliasEl = document.getElementById('modalFunCmdAlias');
                        var iconEl = document.getElementById('modalFunCmdIcon');
                        if (nameEl) nameEl.value = cmdName;
                        if (aliasEl) aliasEl.value = funCustomAliases[cmdName] || '';
                        if (iconEl) iconEl.textContent = icon || '🎮';
                        if (modal) modal.classList.remove('hidden');
                    };

                    window.closeFunAliasModal = function() {
                        var modal = document.getElementById('funAliasModal');
                        if (modal) modal.classList.add('hidden');
                        currentModalCmd = null;
                    };

                    window.saveFunAlias = function() {
                        if (!currentModalCmd) return;
                        var aliasEl = document.getElementById('modalFunCmdAlias');
                        var val = aliasEl ? aliasEl.value.trim() : '';
                        if (val) funCustomAliases[currentModalCmd] = val;
                        else delete funCustomAliases[currentModalCmd];

                        var safeKey = currentModalCmd.replace(/[^a-zA-Z0-9]/g, '_');
                        var badgeEl = document.getElementById('aliasBadge_' + safeKey);
                        var tagEl = document.getElementById('aliasTag_' + safeKey);
                        if (badgeEl) badgeEl.textContent = val ? 'اختصار: ' + val : 'تخصيص الاختصار';
                        if (tagEl) {
                            if (val) {
                                tagEl.textContent = 'بديل: ' + val;
                                tagEl.classList.remove('hidden');
                            } else {
                                tagEl.classList.add('hidden');
                            }
                        }

                        saveFunSettingsState();
                        closeFunAliasModal();
                    };

                    async function sendGamesPanelDirect() {
                        const channelId = document.getElementById('funTargetChannel').value;
                        if (!channelId) return alert('يرجى اختيار القناة أولاً');

                        const btn = document.getElementById('btnSendGamesPanel');
                        btn.disabled = true; btn.textContent = 'جارٍ الإرسال...';

                        try {
                            const r = await fetch('/api/guild/${guildId}/games/send-panel', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ channelId })
                            });
                            const d = await r.json();
                            if (d.success) alert('✅ تم إرسال لوحة الألعاب التفاعلية في القناة بنجاح!');
                            else alert('❌ ' + (d.error || 'فشل الإرسال'));
                        } catch(e) { alert('خطأ في الاتصال'); }
                        finally { btn.disabled = false; btn.textContent = '🚀 إرسال لوحة الألعاب التفاعلية الآن'; }
                    }
                    </script>
                `;
            } else if (section === 'staff-activity') {
                const staffLeaderboard = (database.getStaffLeaderboard ? database.getStaffLeaderboard(guildId) : []) || [];
                const staffGoals = (database.getStaffGoals ? database.getStaffGoals(guildId) : []) || [];

                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <!-- Header Banner -->
                        <div class="bg-gradient-to-r from-[#1a132e] via-[#12141f] to-[#1a132e] border border-purple-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl flex-wrap gap-3">
                            <div class="flex items-center gap-2">
                                <button type="button" onclick="resetAllStaffStats()" class="px-4 py-2 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 rounded-xl text-xs font-bold transition">
                                    🔄 تصفير إحصائيات الأسبوع
                                </button>
                            </div>
                            <div class="text-right">
                                <h4 class="font-black text-white text-xl flex items-center gap-2 justify-end"><span>تتبع نشاط الإدارة والمشرفين (Staff Activity)</span><span>👮</span></h4>
                                <p class="text-gray-400 text-xs mt-0.5">مراقبة دقيقة لرسائل المشرفين، ساعات تواجدهم في الرومات الصوتية، والإجراءات الإدارية المتخذة</p>
                            </div>
                        </div>

                        <!-- Top Staff Leaderboard -->
                        <div class="bg-[#12141f] border border-white/5 rounded-3xl p-6 shadow-xl space-y-4">
                            <div class="flex items-center justify-between pb-3 border-b border-white/5">
                                <span class="text-xs text-purple-400 font-bold">${staffLeaderboard.length} إداري مسجل</span>
                                <h4 class="text-sm font-black text-white flex items-center gap-2"><span>لوحة صدارة المشرفين</span><span>🏆</span></h4>
                            </div>

                            ${staffLeaderboard.length === 0 ? `
                                <p class="text-center py-8 text-gray-500 text-xs font-bold">لا يوجد نشاط مسجل للمشرفين حتى الآن</p>
                            ` : `
                                <div class="overflow-x-auto">
                                    <table class="w-full text-right text-xs">
                                        <thead>
                                            <tr class="text-gray-400 border-b border-white/5">
                                                <th class="pb-3 pr-2 font-bold">المشرف</th>
                                                <th class="pb-3 text-center font-bold">الرسائل</th>
                                                <th class="pb-3 text-center font-bold">الوقت الصوتي</th>
                                                <th class="pb-3 text-center font-bold">إجراءات المود</th>
                                                <th class="pb-3 text-center font-bold">نقاط التقييم</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-white/5">
                                            ${staffLeaderboard.map((st, i) => {
                                                const voiceHours = (st.voice_time / 3600).toFixed(1);
                                                return `
                                                <tr class="hover:bg-white/5 transition">
                                                    <td class="py-3.5 pr-2 font-bold text-white flex items-center gap-2">
                                                        <span class="w-6 h-6 rounded-lg bg-purple-600/20 text-purple-300 flex items-center justify-center font-mono text-[11px] font-black">${i + 1}</span>
                                                        <span class="text-white"><@${st.user_id}></span>
                                                    </td>
                                                    <td class="py-3.5 text-center font-mono font-bold text-emerald-400">${st.messages_count || 0}</td>
                                                    <td class="py-3.5 text-center font-mono font-bold text-blue-400">${voiceHours} ساعة</td>
                                                    <td class="py-3.5 text-center font-mono font-bold text-amber-400">${st.actions_count || 0}</td>
                                                    <td class="py-3.5 text-center font-mono font-black text-purple-400">${(st.messages_count || 0) + ((st.actions_count || 0) * 5) + Math.floor((st.voice_time || 0) / 60)}</td>
                                                </tr>
                                                `;
                                            }).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            `}
                        </div>
                    </div>

                    <script>
                    async function resetAllStaffStats() {
                        if (!confirm('هل أنت متأكد من تصفير جميع إحصائيات ونشاطات طاقم الإدارة؟')) return;
                        try {
                            const r = await fetch('/api/guild/${guildId}/staff/reset', { method: 'POST' });
                            const d = await r.json();
                            if (d.success) { alert('✅ تم تصفير إحصائيات النشاط بنجاح'); location.reload(); }
                            else alert('❌ ' + (d.error || 'فشل'));
                        } catch(e) { alert('خطأ في الاتصال'); }
                    }
                    </script>
                `;
            } else if (section === 'applications') {
                const appsList = database.getApplications(guildId) || [];
                const pendingSubmissions = database.getPendingSubmissions(guildId) || [];

                const appsCardsHtml = appsList.length === 0 ? `
                    <div class="py-12 text-center space-y-3 bg-[#12141f] border border-white/5 rounded-3xl">
                        <div class="w-16 h-16 rounded-2xl bg-purple-600/10 text-purple-400 flex items-center justify-center text-3xl mx-auto border border-purple-500/20">📝</div>
                        <h4 class="text-white font-bold text-sm">لا توجد نماذج تقديم حالياً</h4>
                        <p class="text-gray-400 text-xs">اضغط على زر "إنشاء نموذج جديد" بالأعلى لإنشاء أول استمارة تقديم</p>
                    </div>
                ` : appsList.map(a => {
                    let questions = [];
                    try { questions = typeof a.questions === 'string' ? JSON.parse(a.questions) : a.questions; } catch(e) { questions = []; }
                    const logChanName = botGuild?.channels?.cache?.get(a.log_channel)?.name || 'غير محددة';
                    const roleName = botGuild?.roles?.cache?.get(a.accepted_role)?.name || 'بدون رتبة تلقائية';
                    const reviewerRoleName = botGuild?.roles?.cache?.get(a.reviewer_role)?.name || 'الإدارة (Manage Server)';

                    return `
                    <div class="bg-[#12141f] border border-white/5 hover:border-purple-500/30 rounded-3xl p-6 transition space-y-4 shadow-xl">
                        <div class="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-white/5">
                            <div class="flex items-center gap-2">
                                <button type="button" onclick="sendAppPanel('${a.id}')" class="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow">
                                    <span>🚀 إرسال البانل في قناة</span>
                                </button>
                                <button type="button" onclick="editAppForm('${a.id}')" class="px-3 py-1.5 bg-[#1a1d2d] hover:bg-[#23273c] text-purple-300 border border-purple-500/30 rounded-xl text-xs font-bold transition">
                                    ✏️ تعديل
                                </button>
                                <button type="button" onclick="deleteAppForm('${a.id}')" class="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 rounded-xl text-xs font-bold transition">
                                    🗑️ حذف
                                </button>
                            </div>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">${a.title}</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">${a.description || 'بدون وصف'}</p>
                                </div>
                                <div class="w-10 h-10 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-xl border border-purple-500/30">📝</div>
                            </div>
                        </div>

                        <!-- Meta Info Grid -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-right">
                            <div class="bg-[#0b0d14] p-3 rounded-2xl border border-white/5">
                                <span class="text-[10px] text-gray-500 block font-bold">قناة استقبال الطلبات</span>
                                <span class="text-xs font-black text-purple-300">#${logChanName}</span>
                            </div>
                            <div class="bg-[#0b0d14] p-3 rounded-2xl border border-white/5">
                                <span class="text-[10px] text-gray-500 block font-bold">رتبة المقبولين التلقائية</span>
                                <span class="text-xs font-black text-emerald-400">@${roleName}</span>
                            </div>
                            <div class="bg-[#0b0d14] p-3 rounded-2xl border border-white/5">
                                <span class="text-[10px] text-gray-500 block font-bold">رتبة مسؤولي المراجعة</span>
                                <span class="text-xs font-black text-amber-400">@${reviewerRoleName}</span>
                            </div>
                        </div>

                        <!-- Questions List preview -->
                        <div class="space-y-1.5 pt-1">
                            <span class="text-[11px] font-bold text-gray-400 block text-right">الأسئلة المعينة (${questions.length}/5):</span>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                                ${questions.map((q, idx) => {
                                    const qText = typeof q === 'object' ? q.text : q;
                                    const qType = typeof q === 'object' && q.type === 'short' ? 'إجابة قصيرة' : 'فقرة';
                                    return `
                                    <div class="bg-[#0b0d14]/70 p-2.5 rounded-xl border border-white/5 text-right flex items-center justify-between">
                                        <span class="text-[10px] bg-purple-950/60 text-purple-300 px-2 py-0.5 rounded-lg border border-purple-800/30">${qType}</span>
                                        <span class="text-xs text-gray-300 font-bold truncate max-w-[200px]">${idx + 1}. ${qText}</span>
                                    </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                    `;
                }).join('');

                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <!-- Top Header Banner -->
                        <div class="bg-gradient-to-r from-[#1a132e] via-[#12141f] to-[#1a132e] border border-purple-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl flex-wrap gap-4">
                            <div class="flex items-center gap-3">
                                <button type="button" onclick="openCreateAppModal()" class="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-2">
                                    <span>+ إنشاء نموذج جديد</span>
                                </button>
                            </div>
                            <div class="text-right">
                                <h3 class="font-black text-white text-xl flex items-center gap-2 justify-end"><span>نظام التقديمات والتوظيف</span><span>📝</span></h3>
                                <p class="text-gray-400 text-xs mt-0.5">أنشئ نماذج تقديم مخصصة، حدد الأسئلة، واستقبل الطلبات في قناة مخصصة مع إمكانية القبول والرفض التفاعلية</p>
                            </div>
                        </div>

                        <!-- Quick Stats -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
                                <div class="text-2xl font-black text-white">${appsList.length}</div>
                                <div class="text-xs text-gray-400 font-bold mt-1">إجمالي النماذج</div>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
                                <div class="text-2xl font-black text-purple-400">${pendingSubmissions.length}</div>
                                <div class="text-xs text-gray-400 font-bold mt-1">طلبات بانتظار المراجعة</div>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
                                <div class="text-2xl font-black text-emerald-400">${appsList.filter(a => a.status === 'open').length}</div>
                                <div class="text-xs text-gray-400 font-bold mt-1">النماذج المفتوحة</div>
                            </div>
                        </div>

                        <!-- Application Forms List -->
                        <div class="space-y-4">
                            <div class="flex items-center justify-between">
                                <span class="text-xs text-purple-400 font-bold">${appsList.length} نموذج نشط</span>
                                <h4 class="text-sm font-black text-white">📋 نماذج التقديم الحالية</h4>
                            </div>
                            ${appsCardsHtml}
                        </div>

                        <!-- Create/Edit Form Modal Overlay -->
                        <div id="appModalOverlay" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
                            <div class="bg-[#12141f] border border-purple-500/30 rounded-3xl w-full max-w-2xl p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto text-right" dir="rtl">
                                <div class="flex items-center justify-between pb-3 border-b border-white/5">
                                    <button type="button" onclick="closeAppModal()" class="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center text-sm font-bold">✕</button>
                                    <h4 id="appModalTitle" class="text-base font-black text-white">إنشاء نموذج تقديم جديد 📝</h4>
                                </div>

                                <input type="hidden" id="modalAppId" value="">

                                <div class="space-y-3">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1">اسم النموذج (العنوان) <span class="text-purple-400">*</span></label>
                                        <input type="text" id="appTitleInput" placeholder="مثال: تقديم الإدارة / تقديم الدعم الفني" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-bold">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1">وصف النموذج (اختياري)</label>
                                        <input type="text" id="appDescInput" placeholder="شرح مختصر عن المنصب أو الشروط المطلوبة..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                    </div>
                                </div>

                                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1">قناة استقبال الطلبات <span class="text-purple-400">*</span></label>
                                        ${renderChannelSelect('appLogChannel', '')}
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1">رتبة القبول التلقائي</label>
                                        ${renderRoleSelect('appAcceptedRole', '')}
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1">رتبة مسؤولي المراجعة</label>
                                        ${renderRoleSelect('appReviewerRole', '')}
                                    </div>
                                </div>

                                <!-- Questions Builder (Up to 5) -->
                                <div class="space-y-3 pt-2">
                                    <div class="flex items-center justify-between">
                                        <button type="button" onclick="addQuestionField()" id="btnAddQ" class="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 rounded-xl text-xs font-bold transition">
                                            + إضافة سؤال (حتى 5)
                                        </button>
                                        <span class="text-xs font-bold text-white">أسئلة نموذج التقديم (Discord Modal)</span>
                                    </div>
                                    <div id="modalQuestionsContainer" class="space-y-2.5"></div>
                                </div>

                                <div class="flex items-center justify-end gap-3 pt-3 border-t border-white/5">
                                    <button type="button" onclick="closeAppModal()" class="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl text-xs font-bold transition">إلغاء</button>
                                    <button type="button" onclick="saveAppForm()" id="btnSaveApp" class="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition shadow-lg">حفظ النموذج 💾</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <script>
                    let currentQuestions = [];
                    const allAppsData = ${JSON.stringify(appsList)};

                    function openCreateAppModal() {
                        document.getElementById('modalAppId').value = '';
                        document.getElementById('appModalTitle').textContent = 'إنشاء نموذج تقديم جديد 📝';
                        document.getElementById('appTitleInput').value = '';
                        document.getElementById('appDescInput').value = '';
                        document.getElementById('appLogChannel').value = '';
                        document.getElementById('appAcceptedRole').value = '';
                        document.getElementById('appReviewerRole').value = '';
                        currentQuestions = [
                            { text: 'ما هو عمرك وتواجدك اليومي؟', type: 'short' },
                            { text: 'ما هي خبراتك السابقة في الإدارة أو المجال؟', type: 'paragraph' },
                            { text: 'لماذا ترغب بالانضمام إلى طاقم العمل؟', type: 'paragraph' }
                        ];
                        renderModalQuestions();
                        document.getElementById('appModalOverlay').classList.remove('hidden');
                    }

                    function editAppForm(id) {
                        const app = allAppsData.find(a => String(a.id) === String(id));
                        if (!app) return alert('النموذج غير موجود');

                        document.getElementById('modalAppId').value = app.id;
                        document.getElementById('appModalTitle').textContent = 'تعديل نموذج: ' + app.title;
                        document.getElementById('appTitleInput').value = app.title;
                        document.getElementById('appDescInput').value = app.description || '';
                        document.getElementById('appLogChannel').value = app.log_channel || '';
                        document.getElementById('appAcceptedRole').value = app.accepted_role || '';
                        document.getElementById('appReviewerRole').value = app.reviewer_role || '';

                        try {
                            const parsed = typeof app.questions === 'string' ? JSON.parse(app.questions) : app.questions;
                            currentQuestions = parsed.map(q => typeof q === 'object' ? q : { text: String(q), type: 'paragraph' });
                        } catch(e) {
                            currentQuestions = [{ text: 'السؤال الأول', type: 'paragraph' }];
                        }

                        renderModalQuestions();
                        document.getElementById('appModalOverlay').classList.remove('hidden');
                    }

                    function closeAppModal() {
                        document.getElementById('appModalOverlay').classList.add('hidden');
                    }

                    function addQuestionField() {
                        if (currentQuestions.length >= 5) return alert('أقصى حد لأسئلة النافذة في ديسكورد هو 5 أسئلة');
                        currentQuestions.push({ text: '', type: 'paragraph' });
                        renderModalQuestions();
                    }

                    function removeQuestionField(idx) {
                        currentQuestions.splice(idx, 1);
                        renderModalQuestions();
                    }

                    function updateQuestionText(idx, val) {
                        if (currentQuestions[idx]) currentQuestions[idx].text = val;
                    }

                    function updateQuestionType(idx, val) {
                        if (currentQuestions[idx]) currentQuestions[idx].type = val;
                    }

                    function renderModalQuestions() {
                        const container = document.getElementById('modalQuestionsContainer');
                        if (currentQuestions.length === 0) {
                            container.innerHTML = '<p class="text-xs text-gray-500 text-center py-2">لا توجد أسئلة مضافة. اضغط على "+ إضافة سؤال"</p>';
                            return;
                        }

                        let html = '';
                        for (let i = 0; i < currentQuestions.length; i++) {
                            const q = currentQuestions[i];
                            html += '<div class="bg-[#0b0d14] border border-white/5 p-3 rounded-2xl space-y-2">' +
                                '<div class="flex items-center justify-between">' +
                                '<div class="flex items-center gap-2">' +
                                '<select onchange="updateQuestionType(' + i + ', this.value)" class="bg-[#12141f] border border-white/5 text-purple-300 text-[11px] font-bold rounded-xl px-2.5 py-1 outline-none">' +
                                '<option value="paragraph" ' + (q.type === 'paragraph' ? 'selected' : '') + '>فقرة طويلة (Paragraph)</option>' +
                                '<option value="short" ' + (q.type === 'short' ? 'selected' : '') + '>إجابة قصيرة (Short Answer)</option>' +
                                '</select>' +
                                '<button type="button" onclick="removeQuestionField(' + i + ')" class="text-rose-400 hover:text-rose-300 text-xs px-2 py-0.5 rounded bg-rose-950/40">✕ حذف</button>' +
                                '</div>' +
                                '<span class="text-xs font-bold text-gray-300">السؤال #' + (i + 1) + '</span>' +
                                '</div>' +
                                '<input type="text" placeholder="اكتب نص السؤال هنا..." value="' + (q.text || '') + '" oninput="updateQuestionText(' + i + ', this.value)" class="w-full bg-[#12141f] border border-white/5 focus:border-purple-600 rounded-xl px-3 py-2 text-xs text-white text-right outline-none">' +
                                '</div>';
                        }
                        container.innerHTML = html;
                    }

                    async function saveAppForm() {
                        const id = document.getElementById('modalAppId').value;
                        const title = document.getElementById('appTitleInput').value.trim();
                        const desc = document.getElementById('appDescInput').value.trim();
                        const logChannel = document.getElementById('appLogChannel').value;
                        const acceptedRole = document.getElementById('appAcceptedRole').value;
                        const reviewerRole = document.getElementById('appReviewerRole').value;

                        if (!title) return alert('يرجى إدخال عنوان النموذج');
                        if (!logChannel) return alert('يرجى اختيار قناة استقبال الطلبات');
                        const validQuestions = currentQuestions.filter(q => q.text.trim());
                        if (validQuestions.length === 0) return alert('يرجى كتابة سؤال واحد على الأقل للنموذج');

                        const btn = document.getElementById('btnSaveApp');
                        btn.disabled = true; btn.textContent = 'جارٍ الحفظ...';

                        try {
                            const endpoint = id ? ('/api/guild/${guildId}/applications/' + id + '/update') : '/api/guild/${guildId}/applications/create';
                            const r = await fetch(endpoint, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    title, description: desc,
                                    log_channel: logChannel,
                                    accepted_role: acceptedRole,
                                    reviewer_role: reviewerRole,
                                    questions: validQuestions
                                })
                            });
                            const d = await r.json();
                            if (d.success) {
                                alert('✅ تم حفظ نموذج التقديم بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (d.error || 'فشل الحفظ'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال بالخادم');
                        } finally {
                            btn.disabled = false; btn.textContent = 'حفظ النموذج 💾';
                        }
                    }

                    async function deleteAppForm(id) {
                        if (!confirm('هل أنت متأكد من حذف نموذج التقديم هذا؟ سيتم حذف جميع الأسئلة المرتبطة به.')) return;
                        try {
                            const r = await fetch('/api/guild/${guildId}/applications/' + id + '/delete', { method: 'POST' });
                            const d = await r.json();
                            if (d.success) {
                                alert('✅ تم حذف النموذج بنجاح');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (d.error || 'فشل الحذف'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
                    }

                    async function sendAppPanel(id) {
                        const channelId = prompt('أدخل آيدي أو اسم القناة لإرسال رسالة التقديم فيها (اتركه فارغاً للإرسال في قناة الاستقبال):', '');
                        if (channelId === null) return;

                        try {
                            const r = await fetch('/api/guild/${guildId}/applications/' + id + '/send-panel', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ channelId })
                            });
                            const d = await r.json();
                            if (d.success) alert('✅ تم إرسال رسالة وزر التقديم في القناة بنجاح!');
                            else alert('❌ ' + (d.error || 'فشل الإرسال'));
                        } catch(e) {
                            alert('خطأ في الاتصال');
                        }
                    }
                    </script>
                `;
            } else if (section === 'embed') {
                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <!-- Top Action Bar -->
                        <div class="flex items-center justify-between gap-3 flex-wrap">
                            <div class="flex items-center gap-2">
                                <button type="button" onclick="sendEmbedDirect()" id="btnSendEmbed" class="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2">
                                    <span>🚀 إرسال</span>
                                </button>
                                <button type="button" onclick="saveEmbedDraft()" class="px-4 py-2.5 bg-[#151724] hover:bg-[#1c1f2e] border border-white/10 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5">
                                    <span>💾 حفظ</span>
                                </button>
                                <button type="button" onclick="clearEmbedFields()" class="px-4 py-2.5 bg-rose-900/30 hover:bg-rose-800/40 border border-rose-800/30 text-rose-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5">
                                    <span>🗑️ مسح</span>
                                </button>
                            </div>

                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h3 class="font-black text-white text-xl flex items-center gap-2 justify-end"><span>رسائل الإيمبد</span><span>📄</span></h3>
                                    <p class="text-gray-400 text-xs">صمم وأرسل رسائل إيمبد منسقة واحترافية لقنواتك</p>
                                </div>
                                <div class="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/30 text-purple-400 flex items-center justify-center text-xl">📄</div>
                            </div>
                        </div>

                        <!-- Mode tabs -->
                        <div class="flex items-center justify-end gap-2 bg-[#12141f] p-1.5 rounded-2xl border border-white/5 w-fit ml-auto">
                            <button type="button" class="px-4 py-1.5 bg-purple-600 text-white font-bold text-xs rounded-xl shadow">محرر</button>
                            <button type="button" onclick="alert('المحرر المرئي مفعل')" class="px-4 py-1.5 text-gray-400 hover:text-white font-bold text-xs rounded-xl transition">مستند</button>
                            <button type="button" onclick="document.getElementById('livePreviewCard').scrollIntoView({behavior:'smooth'})" class="px-4 py-1.5 text-gray-400 hover:text-white font-bold text-xs rounded-xl transition">معاينة</button>
                        </div>

                        <!-- Target Channel -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl space-y-2">
                            <label class="block text-xs font-bold text-gray-300">أرسل إلى القناة <span class="text-purple-400">*</span></label>
                            ${renderChannelSelect('embedChannel', '')}
                        </div>

                        <!-- Embed Color Palette -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl space-y-3">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <input type="text" id="embHexInput" value="#9333ea" oninput="setCustomHex(this.value)" class="w-24 bg-[#0b0d14] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white text-center font-mono focus:border-purple-500 outline-none uppercase">
                                    <input type="color" id="embColor" value="#9333ea" oninput="onColorPickerChange(this.value)" class="w-9 h-9 rounded-xl border border-white/10 bg-[#0b0d14] cursor-pointer p-0.5">
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-xs font-bold text-white">لون الإيمبد</span>
                                    <span class="text-purple-400 text-sm">🎨</span>
                                </div>
                            </div>

                            <!-- Color Swatches -->
                            <div class="flex items-center justify-end gap-2 flex-wrap pt-2 border-t border-white/5">
                                <button type="button" onclick="selectColor('#10b981')" class="w-7 h-7 rounded-full bg-[#10b981] hover:scale-110 transition border border-white/20 shadow"></button>
                                <button type="button" onclick="selectColor('#06b6d4')" class="w-7 h-7 rounded-full bg-[#06b6d4] hover:scale-110 transition border border-white/20 shadow"></button>
                                <button type="button" onclick="selectColor('#3b82f6')" class="w-7 h-7 rounded-full bg-[#3b82f6] hover:scale-110 transition border border-white/20 shadow"></button>
                                <button type="button" onclick="selectColor('#8b5cf6')" class="w-7 h-7 rounded-full bg-[#8b5cf6] hover:scale-110 transition border border-white/20 shadow"></button>
                                <button type="button" onclick="selectColor('#9333ea')" class="w-7 h-7 rounded-full bg-[#9333ea] hover:scale-110 transition border-2 border-white shadow-lg ring-2 ring-purple-500/50"></button>
                                <button type="button" onclick="selectColor('#f97316')" class="w-7 h-7 rounded-full bg-[#f97316] hover:scale-110 transition border border-white/20 shadow"></button>
                                <button type="button" onclick="selectColor('#ef4444')" class="w-7 h-7 rounded-full bg-[#ef4444] hover:scale-110 transition border border-white/20 shadow"></button>
                                <button type="button" onclick="selectColor('#ec4899')" class="w-7 h-7 rounded-full bg-[#ec4899] hover:scale-110 transition border border-white/20 shadow"></button>
                                <button type="button" onclick="selectColor('#eab308')" class="w-7 h-7 rounded-full bg-[#eab308] hover:scale-110 transition border border-white/20 shadow"></button>
                                <button type="button" onclick="selectColor('#14b8a6')" class="w-7 h-7 rounded-full bg-[#14b8a6] hover:scale-110 transition border border-white/20 shadow"></button>
                                <button type="button" onclick="selectColor('#5865F2')" class="w-7 h-7 rounded-full bg-[#5865F2] hover:scale-110 transition border border-white/20 shadow"></button>
                            </div>
                        </div>

                        <!-- Main Visual Editor Form -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4">
                            <div class="flex items-center justify-between pb-3 border-b border-white/5">
                                <span class="text-[11px] text-gray-500 font-mono">Embed Builder</span>
                                <h4 class="text-sm font-black text-white flex items-center gap-2"><span>محتوى الإيمبد</span><span>📝</span></h4>
                            </div>

                            <!-- Author row -->
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-[11px] font-bold text-gray-400 mb-1">أيقونة الكاتب (Author Icon URL)</label>
                                    <input type="url" id="embAuthorIcon" placeholder="https://..." oninput="updateEmbedPreview()" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-3 py-2.5 text-xs text-white outline-none text-left font-mono">
                                </div>
                                <div>
                                    <label class="block text-[11px] font-bold text-gray-400 mb-1">اسم الكاتب (Author Name)</label>
                                    <input type="text" id="embAuthor" placeholder="مثال: ZENO Announcement" oninput="updateEmbedPreview()" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-3 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                            </div>

                            <!-- Title & Title URL -->
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-[11px] font-bold text-gray-400 mb-1">رابط العنوان (Title URL - اختياري)</label>
                                    <input type="url" id="embTitleUrl" placeholder="https://..." oninput="updateEmbedPreview()" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-3 py-2.5 text-xs text-white outline-none text-left font-mono">
                                </div>
                                <div>
                                    <label class="block text-[11px] font-bold text-gray-400 mb-1">عنوان الإيمبد (Title)</label>
                                    <input type="text" id="embTitle" placeholder="عنوان الرسالة الرئيسي..." oninput="updateEmbedPreview()" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-3 py-2.5 text-xs text-white outline-none text-right font-bold">
                                </div>
                            </div>

                            <!-- Description -->
                            <div>
                                <label class="block text-[11px] font-bold text-gray-400 mb-1">الوصف والمحتوى (Description) <span class="text-purple-400">*</span></label>
                                <textarea id="embDesc" rows="4" placeholder="اكتب محتوى الرسالة هنا... يدعم Markdown مثل **عريض** و *مائل*" oninput="updateEmbedPreview()" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-3 py-2.5 text-xs text-white outline-none text-right leading-relaxed"></textarea>
                            </div>

                            <!-- Image & Thumbnail URLs -->
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-[11px] font-bold text-gray-400 mb-1">الصورة المصغرة (Thumbnail URL)</label>
                                    <input type="url" id="embThumbnail" placeholder="https://... (أعلى اليمين)" oninput="updateEmbedPreview()" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-3 py-2.5 text-xs text-white outline-none text-left font-mono">
                                </div>
                                <div>
                                    <label class="block text-[11px] font-bold text-gray-400 mb-1">الصورة الكبيرة (Main Image URL)</label>
                                    <input type="url" id="embImage" placeholder="https://... (أسفل الإيمبد)" oninput="updateEmbedPreview()" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-3 py-2.5 text-xs text-white outline-none text-left font-mono">
                                </div>
                            </div>

                            <!-- Custom Fields list -->
                            <div class="space-y-3 pt-2">
                                <div class="flex items-center justify-between">
                                    <button type="button" onclick="addEmbedField()" class="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 rounded-xl text-xs font-bold transition flex items-center gap-1">
                                        <span>+ إضافة حقل (Field)</span>
                                    </button>
                                    <span class="text-xs font-bold text-gray-300">الحقول الإضافية (Fields)</span>
                                </div>
                                <div id="fieldsContainer" class="space-y-2.5"></div>
                            </div>
                        </div>

                        <!-- Footer & Timestamp -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4">
                            <div class="flex items-center justify-between pb-3 border-b border-white/5">
                                <div class="flex items-center gap-3">
                                    <label class="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" id="embTimestampToggle" checked onchange="updateEmbedPreview()" class="sr-only peer">
                                        <div class="w-11 h-6 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                    </label>
                                    <span class="text-xs font-bold text-gray-300">إظهار الوقت (Timestamp)</span>
                                </div>
                                <h4 class="text-sm font-black text-white flex items-center gap-2"><span>التذييل والوقت (Footer)</span><span>⏰</span></h4>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-[11px] font-bold text-gray-400 mb-1">أيقونة التذييل (Footer Icon URL)</label>
                                    <input type="url" id="embFooterIcon" placeholder="https://..." oninput="updateEmbedPreview()" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-3 py-2.5 text-xs text-white outline-none text-left font-mono">
                                </div>
                                <div>
                                    <label class="block text-[11px] font-bold text-gray-400 mb-1">نص التذييل (Footer Text)</label>
                                    <input type="text" id="embFooter" placeholder="مثال: ZENO Bot • اليوم" oninput="updateEmbedPreview()" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-3 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                            </div>
                        </div>

                        <!-- Live Discord Preview Box -->
                        <div id="livePreviewCard" class="bg-[#12141f] border border-purple-500/20 p-6 rounded-3xl space-y-3 shadow-2xl">
                            <div class="flex items-center justify-between pb-3 border-b border-white/5">
                                <span class="text-[10px] bg-purple-600/20 text-purple-300 px-2 py-0.5 rounded-full font-bold border border-purple-500/30">معاينة مباشرة</span>
                                <h4 class="text-sm font-black text-white flex items-center gap-2"><span>شكل الرسالة في ديسكورد</span><span>👁️</span></h4>
                            </div>

                            <div class="bg-[#2b2d31] p-4 rounded-xl max-w-2xl ml-auto border-r-4 shadow-md transition-all" id="previewEmbedBox" style="border-right-color: #9333ea;">
                                <div id="prevAuthorRow" class="hidden items-center justify-end gap-2 mb-2">
                                    <span id="prevAuthorText" class="text-xs font-bold text-white"></span>
                                    <img id="prevAuthorImg" class="w-5 h-5 rounded-full object-cover hidden" src="" alt="">
                                </div>
                                <div id="prevTitle" class="text-sm font-black text-white mb-1.5 hover:underline cursor-pointer"></div>
                                <div id="prevDesc" class="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed"></div>
                                <div id="prevFieldsGrid" class="grid grid-cols-2 gap-2 mt-3 hidden"></div>
                                <div id="prevImageRow" class="mt-3 hidden">
                                    <img id="prevMainImg" class="rounded-lg max-h-60 w-full object-cover" src="" alt="">
                                </div>
                                <div id="prevFooterRow" class="mt-3 pt-2 border-t border-white/5 flex items-center justify-end gap-2 text-[10px] text-gray-400">
                                    <span id="prevTimestamp" class="text-gray-500"></span>
                                    <span id="prevFooterDot" class="hidden">•</span>
                                    <span id="prevFooterText"></span>
                                    <img id="prevFooterImg" class="w-4 h-4 rounded-full object-cover hidden" src="" alt="">
                                </div>
                            </div>
                        </div>
                    </div>

                    <script>
                    let embedFields = [];

                    function selectColor(hex) {
                        document.getElementById('embColor').value = hex;
                        document.getElementById('embHexInput').value = hex.toUpperCase();
                        updateEmbedPreview();
                    }

                    function onColorPickerChange(hex) {
                        document.getElementById('embHexInput').value = hex.toUpperCase();
                        updateEmbedPreview();
                    }

                    function setCustomHex(hex) {
                        if (/^#[0-9A-F]{6}$/i.test(hex)) {
                            document.getElementById('embColor').value = hex;
                            updateEmbedPreview();
                        }
                    }

                    function addEmbedField() {
                        const id = 'f_' + Date.now();
                        embedFields.push({ id: id, name: '', value: '', inline: false });
                        renderFieldsEditor();
                        updateEmbedPreview();
                    }

                    function removeEmbedField(id) {
                        embedFields = embedFields.filter(f => f.id !== id);
                        renderFieldsEditor();
                        updateEmbedPreview();
                    }

                    function updateFieldData(id, key, val) {
                        const field = embedFields.find(f => f.id === id);
                        if (field) {
                            field[key] = val;
                            updateEmbedPreview();
                        }
                    }

                    function renderFieldsEditor() {
                        const c = document.getElementById('fieldsContainer');
                        if (embedFields.length === 0) {
                            c.innerHTML = '<p class="text-[11px] text-gray-500 text-center py-2">لا توجد حقول إضافية حالياً</p>';
                            return;
                        }
                        let html = '';
                        for (let i = 0; i < embedFields.length; i++) {
                            const f = embedFields[i];
                            html += '<div class="bg-[#0b0d14] border border-white/5 p-3 rounded-2xl space-y-2">' +
                                '<div class="flex items-center justify-between">' +
                                '<div class="flex items-center gap-2">' +
                                '<label class="text-[10px] text-gray-400 flex items-center gap-1 cursor-pointer">' +
                                '<input type="checkbox" ' + (f.inline ? 'checked' : '') + ' onchange="updateFieldData(\'' + f.id + '\', \'inline\', this.checked)" class="rounded bg-[#151724] border-white/10 text-purple-600 focus:ring-0">' +
                                '<span>جنباً لجنب (Inline)</span>' +
                                '</label>' +
                                '<button type="button" onclick="removeEmbedField(\'' + f.id + '\')" class="text-rose-400 hover:text-rose-300 text-xs px-2 py-0.5 rounded bg-rose-950/40">✕ حذف</button>' +
                                '</div>' +
                                '<span class="text-xs font-bold text-gray-300">الحقل #' + (i + 1) + '</span>' +
                                '</div>' +
                                '<div class="grid grid-cols-1 md:grid-cols-2 gap-2">' +
                                '<input type="text" placeholder="عنوان الحقل..." value="' + (f.name || '') + '" oninput="updateFieldData(\'' + f.id + '\', \'name\', this.value)" class="w-full bg-[#12141f] border border-white/5 rounded-xl px-3 py-1.5 text-xs text-white text-right outline-none font-bold">' +
                                '<input type="text" placeholder="قيمة ومحتوى الحقل..." value="' + (f.value || '') + '" oninput="updateFieldData(\'' + f.id + '\', \'value\', this.value)" class="w-full bg-[#12141f] border border-white/5 rounded-xl px-3 py-1.5 text-xs text-white text-right outline-none">' +
                                '</div>' +
                                '</div>';
                        }
                        c.innerHTML = html;
                    }

                    function updateEmbedPreview() {
                        const color = document.getElementById('embColor').value || '#9333ea';
                        const author = document.getElementById('embAuthor').value.trim();
                        const authorIcon = document.getElementById('embAuthorIcon').value.trim();
                        const title = document.getElementById('embTitle').value.trim();
                        const desc = document.getElementById('embDesc').value.trim();
                        const image = document.getElementById('embImage').value.trim();
                        const thumbnail = document.getElementById('embThumbnail').value.trim();
                        const footer = document.getElementById('embFooter').value.trim();
                        const footerIcon = document.getElementById('embFooterIcon').value.trim();
                        const showTimestamp = document.getElementById('embTimestampToggle').checked;

                        document.getElementById('previewEmbedBox').style.borderRightColor = color;

                        const prevAuthorRow = document.getElementById('prevAuthorRow');
                        const prevAuthorText = document.getElementById('prevAuthorText');
                        const prevAuthorImg = document.getElementById('prevAuthorImg');
                        if (author) {
                            prevAuthorRow.classList.remove('hidden');
                            prevAuthorRow.classList.add('flex');
                            prevAuthorText.textContent = author;
                            if (authorIcon) {
                                prevAuthorImg.src = authorIcon;
                                prevAuthorImg.classList.remove('hidden');
                            } else {
                                prevAuthorImg.classList.add('hidden');
                            }
                        } else {
                            prevAuthorRow.classList.add('hidden');
                            prevAuthorRow.classList.remove('flex');
                        }

                        const prevTitle = document.getElementById('prevTitle');
                        prevTitle.textContent = title || '';
                        prevTitle.style.display = title ? 'block' : 'none';

                        const prevDesc = document.getElementById('prevDesc');
                        prevDesc.textContent = desc || 'محتوى الإيمبد سيظهر هنا بالمعاينة المباشرة...';

                        const prevFieldsGrid = document.getElementById('prevFieldsGrid');
                        const validFields = embedFields.filter(f => f.name || f.value);
                        if (validFields.length > 0) {
                            prevFieldsGrid.classList.remove('hidden');
                            let fieldsHtml = '';
                            for (let f of validFields) {
                                fieldsHtml += '<div class="' + (f.inline ? 'col-span-1' : 'col-span-2') + ' bg-black/20 p-2 rounded-lg text-right">' +
                                    '<div class="text-[11px] font-bold text-gray-300">' + (f.name || 'حقل') + '</div>' +
                                    '<div class="text-[11px] text-gray-400">' + (f.value || '...') + '</div>' +
                                    '</div>';
                            }
                            prevFieldsGrid.innerHTML = fieldsHtml;
                        } else {
                            prevFieldsGrid.classList.add('hidden');
                        }

                        const prevImageRow = document.getElementById('prevImageRow');
                        const prevMainImg = document.getElementById('prevMainImg');
                        if (image) {
                            prevMainImg.src = image;
                            prevImageRow.classList.remove('hidden');
                        } else {
                            prevImageRow.classList.add('hidden');
                        }

                        const prevFooterText = document.getElementById('prevFooterText');
                        const prevFooterImg = document.getElementById('prevFooterImg');
                        const prevTimestamp = document.getElementById('prevTimestamp');
                        const prevFooterDot = document.getElementById('prevFooterDot');

                        prevFooterText.textContent = footer || '';
                        if (footerIcon && footer) {
                            prevFooterImg.src = footerIcon;
                            prevFooterImg.classList.remove('hidden');
                        } else {
                            prevFooterImg.classList.add('hidden');
                        }

                        if (showTimestamp) {
                            prevTimestamp.textContent = 'اليوم في ' + new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
                            prevFooterDot.classList.toggle('hidden', !footer);
                        } else {
                            prevTimestamp.textContent = '';
                            prevFooterDot.classList.add('hidden');
                        }
                    }

                    function clearEmbedFields() {
                        if (!confirm('هل تريد مسح جميع الحقول وإعادة الضبط؟')) return;
                        document.getElementById('embTitle').value = '';
                        document.getElementById('embDesc').value = '';
                        document.getElementById('embAuthor').value = '';
                        document.getElementById('embAuthorIcon').value = '';
                        document.getElementById('embTitleUrl').value = '';
                        document.getElementById('embImage').value = '';
                        document.getElementById('embThumbnail').value = '';
                        document.getElementById('embFooter').value = '';
                        document.getElementById('embFooterIcon').value = '';
                        embedFields = [];
                        renderFieldsEditor();
                        selectColor('#9333ea');
                    }

                    function saveEmbedDraft() {
                        const payload = getEmbedPayload();
                        localStorage.setItem('zeno_embed_draft_' + '${guildId}', JSON.stringify(payload));
                        alert('💾 تم حفظ المسودة محلياً في المتصفح!');
                    }

                    function getEmbedPayload() {
                        return {
                            channelId: document.getElementById('embedChannel').value,
                            color: document.getElementById('embColor').value,
                            title: document.getElementById('embTitle').value.trim(),
                            titleUrl: document.getElementById('embTitleUrl').value.trim(),
                            desc: document.getElementById('embDesc').value.trim(),
                            author: document.getElementById('embAuthor').value.trim(),
                            authorIcon: document.getElementById('embAuthorIcon').value.trim(),
                            image: document.getElementById('embImage').value.trim(),
                            thumbnail: document.getElementById('embThumbnail').value.trim(),
                            footer: document.getElementById('embFooter').value.trim(),
                            footerIcon: document.getElementById('embFooterIcon').value.trim(),
                            timestamp: document.getElementById('embTimestampToggle').checked,
                            fields: embedFields.filter(f => f.name || f.value)
                        };
                    }

                    async function sendEmbedDirect() {
                        const payload = getEmbedPayload();
                        if (!payload.channelId) return alert('يرجى اختيار القناة المستهدفة أولاً!');
                        if (!payload.desc && !payload.title) return alert('يرجى كتابة عنوان أو محتوى للرسالة!');

                        const btn = document.getElementById('btnSendEmbed');
                        btn.disabled = true;
                        btn.innerHTML = '⏳ جارٍ الإرسال...';

                        try {
                            const res = await fetch('/api/guild/${guildId}/send-embed', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
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
                            btn.innerHTML = '<span>🚀 إرسال</span>';
                        }
                    }

                    window.addEventListener('DOMContentLoaded', () => {
                        renderFieldsEditor();
                        try {
                            const saved = localStorage.getItem('zeno_embed_draft_' + '${guildId}');
                            if (saved) {
                                const d = JSON.parse(saved);
                                if (d.title) document.getElementById('embTitle').value = d.title;
                                if (d.desc) document.getElementById('embDesc').value = d.desc;
                                if (d.author) document.getElementById('embAuthor').value = d.author;
                                if (d.authorIcon) document.getElementById('embAuthorIcon').value = d.authorIcon;
                                if (d.titleUrl) document.getElementById('embTitleUrl').value = d.titleUrl;
                                if (d.image) document.getElementById('embImage').value = d.image;
                                if (d.thumbnail) document.getElementById('embThumbnail').value = d.thumbnail;
                                if (d.footer) document.getElementById('embFooter').value = d.footer;
                                if (d.footerIcon) document.getElementById('embFooterIcon').value = d.footerIcon;
                                if (d.color) selectColor(d.color);
                                if (Array.isArray(d.fields)) {
                                    embedFields = d.fields;
                                    renderFieldsEditor();
                                }
                            }
                        } catch(e) {}
                        updateEmbedPreview();
                    });
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

                // ✅ FIX: منع أي زر ليس submit من إطلاق الـ form
                document.addEventListener('DOMContentLoaded', () => {
                    const form = document.getElementById('settingsForm');
                    if (form) {
                        form.querySelectorAll('button:not([type="submit"])').forEach(btn => {
                            if (!btn.hasAttribute('type')) {
                                btn.setAttribute('type', 'button');
                            }
                        });
                    }
                });

                // تشغيل الإصلاح فوراً أيضاً (للـ buttons الموجودة بالفعل)
                setTimeout(() => {
                    const form = document.getElementById('settingsForm');
                    if (form) {
                        form.querySelectorAll('button:not([type="submit"])').forEach(btn => {
                            if (!btn.getAttribute('type') || btn.getAttribute('type') !== 'submit') {
                                btn.type = 'button';
                            }
                        });
                    }
                }, 100);
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

    app.post('/api/guild/:guildId/broadcast-now', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const settings = database.getGuildSettings(guildId);
            const channelId = settings.broadcast_channel;
            if (!channelId) return res.status(400).json({ success: false, error: 'لم يتم تحديد قناة البث' });

            let msgs = [];
            try { msgs = JSON.parse(settings.broadcast_messages || '[]'); } catch(e) {}
            if (msgs.length === 0) return res.status(400).json({ success: false, error: 'لا توجد رسائل مضافة في القائمة' });

            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return res.status(404).json({ success: false, error: 'القناة غير متاحة' });

            const randomMsg = msgs[Math.floor(Math.random() * msgs.length)];
            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setColor('#9333ea')
                .setDescription(randomMsg)
                .setTimestamp()
                .setFooter({ text: '📢 إعلان تلقائي — ZENO BOT' });

            const mentionContent = settings.broadcast_mention_role ? `<@&${settings.broadcast_mention_role}>` : '';
            await channel.send({ content: mentionContent || undefined, embeds: [embed] });
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

    


    // =============================================
    // Backup System API
    // =============================================
    app.post('/api/guild/:guildId/backup/create', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { label } = req.body;

            rawDb.exec(`CREATE TABLE IF NOT EXISTS guild_backups (
                id TEXT PRIMARY KEY,
                guild_id TEXT NOT NULL,
                created_by TEXT NOT NULL,
                label TEXT DEFAULT '',
                channels_count INTEGER DEFAULT 0,
                roles_count INTEGER DEFAULT 0,
                settings_snapshot TEXT,
                channels_snapshot TEXT,
                roles_snapshot TEXT,
                created_at INTEGER DEFAULT (strftime('%s','now'))
            )`);

            const guild = client?.guilds?.cache?.get(guildId);
            if (!guild) return res.status(404).json({ success: false, error: 'السيرفر غير موجود أو البوت غير متصل' });

            // Snapshot channels
            const channelsSnapshot = guild.channels.cache.map(ch => ({
                id: ch.id, name: ch.name, type: ch.type,
                parentId: ch.parentId, position: ch.position,
                topic: ch.topic || null, nsfw: ch.nsfw || false,
                bitrate: ch.bitrate || null, userLimit: ch.userLimit || null,
            }));

            // Snapshot roles
            const rolesSnapshot = guild.roles.cache
                .filter(r => !r.managed && r.id !== guildId)
                .map(r => ({
                    id: r.id, name: r.name, color: r.hexColor,
                    hoist: r.hoist, mentionable: r.mentionable,
                    permissions: r.permissions.bitfield.toString(),
                    position: r.position,
                }));

            // Snapshot settings
            let settingsSnapshot = {};
            try { settingsSnapshot = database.getGuildSettings(guildId); } catch(e) {}

            const backupId = 'bk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            rawDb.prepare(
                'INSERT INTO guild_backups (id, guild_id, created_by, label, channels_count, roles_count, settings_snapshot, channels_snapshot, roles_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).run(
                backupId, guildId, req.session.user.id,
                label || '',
                channelsSnapshot.length, rolesSnapshot.length,
                JSON.stringify(settingsSnapshot),
                JSON.stringify(channelsSnapshot),
                JSON.stringify(rolesSnapshot)
            );

            // Auto-delete backups older than 30 days or exceeding 10 total
            try {
                const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
                rawDb.prepare('DELETE FROM guild_backups WHERE guild_id = ? AND created_at < ?').run(guildId, thirtyDaysAgo);
                const allBackups = rawDb.prepare('SELECT id FROM guild_backups WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
                if (allBackups.length > 10) {
                    const toDelete = allBackups.slice(10).map(b => b.id);
                    for (const id of toDelete) rawDb.prepare('DELETE FROM guild_backups WHERE id = ?').run(id);
                }
            } catch(e) {}

            res.json({ success: true, id: backupId, channels_count: channelsSnapshot.length, roles_count: rolesSnapshot.length });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/backup/:backupId/restore', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, backupId } = req.params;

            const backup = rawDb.prepare('SELECT * FROM guild_backups WHERE id = ? AND guild_id = ?').get(backupId, guildId);
            if (!backup) return res.status(404).json({ success: false, error: 'النسخة الاحتياطية غير موجودة' });

            const guild = client?.guilds?.cache?.get(guildId);
            if (!guild) return res.status(404).json({ success: false, error: 'السيرفر غير متصل' });

            let rolesRestored = 0, channelsRestored = 0;

            // Restore missing roles
            try {
                const savedRoles = JSON.parse(backup.roles_snapshot || '[]');
                const existingRoleNames = new Set(guild.roles.cache.map(r => r.name.toLowerCase()));
                for (const role of savedRoles) {
                    if (!existingRoleNames.has(role.name.toLowerCase())) {
                        try {
                            await guild.roles.create({
                                name: role.name,
                                color: role.color,
                                hoist: role.hoist,
                                mentionable: role.mentionable,
                                permissions: BigInt(role.permissions),
                                reason: 'ZENO Backup Restore'
                            });
                            rolesRestored++;
                        } catch(e) {}
                    }
                }
            } catch(e) {}

            // Restore missing channels
            try {
                const savedChannels = JSON.parse(backup.channels_snapshot || '[]');
                const existingChannelNames = new Set(guild.channels.cache.map(c => c.name.toLowerCase()));
                for (const ch of savedChannels) {
                    if (!existingChannelNames.has(ch.name.toLowerCase())) {
                        try {
                            await guild.channels.create({
                                name: ch.name,
                                type: ch.type,
                                topic: ch.topic,
                                nsfw: ch.nsfw,
                                bitrate: ch.bitrate,
                                userLimit: ch.userLimit,
                                reason: 'ZENO Backup Restore'
                            });
                            channelsRestored++;
                        } catch(e) {}
                    }
                }
            } catch(e) {}

            res.json({ success: true, message: `تمت الاستعادة: ${rolesRestored} رتبة و${channelsRestored} قناة تمت إضافتها` });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/backup/:backupId/delete', (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, backupId } = req.params;
            rawDb.prepare('DELETE FROM guild_backups WHERE id = ? AND guild_id = ?').run(backupId, guildId);
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.get('/api/guild/:guildId/backups', (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const rows = rawDb.prepare('SELECT id, guild_id, created_by, label, channels_count, roles_count, created_at FROM guild_backups WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
            res.json({ success: true, data: rows });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // Stat Channels API
    // =============================================
    app.post('/api/guild/:guildId/stat-channels', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { stat_type, channel_id, custom_prefix } = req.body;

            if (!stat_type || !channel_id) return res.status(400).json({ success: false, error: 'stat_type and channel_id are required' });

            const VALID_TYPES = ['total_members','humans','bots','online','voice','text_channels','voice_channels','total_channels','roles'];
            if (!VALID_TYPES.includes(stat_type)) return res.status(400).json({ success: false, error: 'Invalid stat_type' });

            rawDb.exec(`CREATE TABLE IF NOT EXISTS stat_channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                stat_type TEXT NOT NULL,
                custom_prefix TEXT DEFAULT '',
                enabled INTEGER DEFAULT 1,
                UNIQUE(guild_id, channel_id)
            )`);

            rawDb.prepare('INSERT OR REPLACE INTO stat_channels (guild_id, channel_id, stat_type, custom_prefix, enabled) VALUES (?, ?, ?, ?, 1)')
                .run(guildId, channel_id.trim(), stat_type, custom_prefix || '');

            // Trigger immediate update
            try {
                const StatChannelsService = require('./services/statChannels');
                // Force update by running the service tick
                const tempSvc = new StatChannelsService(client);
                tempSvc._updateChannel({ guild_id: guildId, channel_id: channel_id.trim(), stat_type, custom_prefix: custom_prefix || '', enabled: 1 }).catch(() => {});
            } catch(e) {}

            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/stat-channels/:id/delete', (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, id } = req.params;
            rawDb.prepare('DELETE FROM stat_channels WHERE id = ? AND guild_id = ?').run(id, guildId);
            // Redirect back to stat-channels page
            res.redirect('/dashboard/' + guildId + '/stat-channels');
        } catch(e) {
            res.status(500).send('Error: ' + e.message);
        }
    });

    app.get('/api/guild/:guildId/stat-channels', (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const rows = rawDb.prepare('SELECT * FROM stat_channels WHERE guild_id = ?').all(guildId);
            res.json({ success: true, data: rows });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/stat-channels/update-now', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const StatChannelsService = require('./services/statChannels');
            const svc = new StatChannelsService(client);
            await svc.forceUpdateGuild(guildId);
            res.json({ success: true, message: 'تم تحديث قنوات الإحصائيات الآن!' });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ===================== Logs System API (سجلات السيرفر الشاملة 📜) =====================
    const { PermissionFlagsBits } = require('discord.js');
    const logsCommand = require('../commands/admin/logs');

    // إنشاء قنوات السجلات تلقائياً (grouped = قناة لكل قسم / detailed = قناة لكل نوع سجل)
    app.post('/api/guild/:guildId/logs/auto-setup', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const mode = req.body?.mode === 'detailed' ? 'detailed' : 'grouped';

            const guild = client?.guilds?.cache?.get(guildId);
            if (!guild) return res.status(404).json({ success: false, error: 'البوت غير موجود في هذا السيرفر' });

            const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
            if (!botMember?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
                return res.status(400).json({ success: false, error: 'البوت لا يملك صلاحية إدارة القنوات' });
            }

            const created = await logsCommand._runSetup(guild, mode);
            res.json({ success: true, created: created.length });
        } catch (e) {
            console.error('[LOGS API] auto-setup error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // حذف كاتيجوري سجلات ZENO وجميع القنوات بداخلها وتعطيل السجلات
    app.post('/api/guild/:guildId/logs/delete-channels', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;

            const guild = client?.guilds?.cache?.get(guildId);
            if (!guild) return res.status(404).json({ success: false, error: 'البوت غير موجود في هذا السيرفر' });

            const deleted = await logsCommand._deleteLogsChannels(guild);
            res.json({ success: true, deleted });
        } catch (e) {
            console.error('[LOGS API] delete-channels error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // User Economy API
    app.post('/api/user/daily', (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'يجب تسجيل الدخول أولاً' });
            const userId = req.session.user.id;
            const now = Date.now();
            
            const userRow = rawDb.prepare('SELECT SUM(coins) as coins, MAX(last_daily) as last_daily FROM users WHERE user_id = ?').get(userId);
            const lastDaily = userRow?.last_daily || 0;
            
            if ((now - lastDaily) < 24 * 60 * 60 * 1000) {
                const remaining = Math.ceil((24 * 60 * 60 * 1000 - (now - lastDaily)) / (1000 * 60));
                return res.status(400).json({ success: false, error: 'لقد استلمت راتبك بالفعل، يرجى المحاولة لاحقاً بعد ' + remaining + ' دقيقة' });
            }

            // Random reward between 500 and 1000 Gold
            const reward = Math.floor(Math.random() * (1000 - 500 + 1)) + 500;
            const guilds = req.session.guilds || [];
            const primaryGuildId = guilds.length > 0 ? guilds[0].id : 'global';

            rawDb.prepare('INSERT OR IGNORE INTO users (user_id, guild_id, coins, last_daily) VALUES (?, ?, 0, 0)').run(userId, primaryGuildId);
            rawDb.prepare('UPDATE users SET coins = coins + ?, last_daily = ? WHERE user_id = ? AND guild_id = ?').run(reward, now, userId, primaryGuildId);

            const updatedRow = rawDb.prepare('SELECT SUM(coins) as coins FROM users WHERE user_id = ?').get(userId);
            res.json({ success: true, amount: reward, newBalance: updatedRow?.coins || reward });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/user/buy', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'يجب تسجيل الدخول أولاً' });
            const userId = req.session.user.id;
            const { type, name, price } = req.body;

            const userRow = rawDb.prepare('SELECT SUM(coins) as coins FROM users WHERE user_id = ?').get(userId);
            const coins = userRow?.coins || 0;

            if (coins < price) {
                return res.status(400).json({ success: false, error: 'رصيدك الحالي (' + coins.toLocaleString() + ') لا يكفي لشراء هذا العنصر (' + price.toLocaleString() + ' 🪙)' });
            }

            const guilds = req.session.guilds || [];
            const primaryGuildId = guilds.length > 0 ? guilds[0].id : 'global';

            rawDb.prepare('UPDATE users SET coins = MAX(0, coins - ?), wallpaper = ? WHERE user_id = ? AND guild_id = ?').run(price, name, userId, primaryGuildId);
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });


    // =============================================
    // Applications & Hiring System API
    // =============================================
    app.post('/api/guild/:guildId/applications/create', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { title, description, log_channel, accepted_role, reviewer_role, questions } = req.body;

            if (!title) return res.status(400).json({ success: false, error: 'عنوان النموذج مطلوب' });
            if (!log_channel) return res.status(400).json({ success: false, error: 'قناة استقبال الطلبات مطلوبة' });

            const newApp = database.createApplication(guildId, title, description, questions || [], log_channel, accepted_role, reviewer_role);
            res.json({ success: true, app: newApp });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/applications/:appId/update', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { appId } = req.params;
            const { title, description, log_channel, accepted_role, reviewer_role, questions, status } = req.body;

            const updated = database.updateApplication(appId, title, description, questions || [], log_channel, accepted_role, reviewer_role, status || 'open');
            res.json({ success: true, app: updated });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/applications/:appId/delete', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { appId } = req.params;
            database.deleteApplication(appId);
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/applications/:appId/send-panel', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, appId } = req.params;
            let { channelId } = req.body;

            const appData = database.getApplication(appId);
            if (!appData) return res.status(404).json({ success: false, error: 'النموذج غير موجود' });

            if (!channelId) channelId = appData.log_channel;
            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return res.status(404).json({ success: false, error: 'لم يتم العثور على القناة المحددة' });

            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const panelEmbed = new EmbedBuilder()
                .setColor('#9333ea')
                .setTitle(`📝 تقديم: ${appData.title}`)
                .setDescription(appData.description || 'اضغط على الزر بالأسفل لتعبئة استمارة التقديم والالتحاق بطاقم العمل.')
                .setFooter({ text: channel.guild.name, iconURL: channel.guild.iconURL({ dynamic: true }) || undefined })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`btn_apply_${appData.id}`)
                    .setLabel('تقديم الآن 📝')
                    .setStyle(ButtonStyle.Primary)
            );

            await channel.send({ embeds: [panelEmbed], components: [row] });
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });


    // =============================================
    // Quran Streaming API
    // =============================================
    app.post('/api/guild/:guildId/quran/play', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { channelId, stationKey } = req.body;

            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isVoiceBased()) return res.status(404).json({ success: false, error: 'القناة الصوتية غير موجودة' });

            const audioManager = require('../utils/audioPlayer');
            const station = audioManager.quranStations[stationKey || 'cairo_radio'];
            if (!station) return res.status(400).json({ success: false, error: 'محطة الراديو غير موجودة' });

            await audioManager.playStream(channel, station.url, station.name);
            res.json({ success: true, station: station.name });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/quran/stop', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const audioManager = require('../utils/audioPlayer');
            audioManager.stop(guildId);
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // Games / Fun Panel Direct Send API
    // =============================================
    app.post('/api/guild/:guildId/games/send-panel', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { channelId } = req.body;

            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return res.status(404).json({ success: false, error: 'القناة النصية غير موجودة' });

            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const embed = new EmbedBuilder()
                .setColor('#9333ea')
                .setTitle('🎮 مركز الألعاب والتسلية | ZENO Games')
                .setDescription('اختر اللعبة التي تريد خوض التحدي بها الآن من خلال الأزرار التفاعلية أدناه:')
                .addFields(
                    { name: '❓ سؤال وجواب (Trivia)', value: 'اختبر معلوماتك العامة مع 4 خيارات تفاعلية', inline: true },
                    { name: '⚡ أسرع كتابة (Fast Type)', value: 'كن أسرع شخص يكتب الكلمة المعروضة', inline: true },
                    { name: '✂️ حجر ورقة مقص (RPS)', value: 'تحدَّ الذكاء الاصطناعي في جولة سريعة', inline: true },
                    { name: '🎲 النرد الحظ', value: 'ارمِ النرد واكتشف رقم حظك اليوم', inline: true },
                    { name: '🪙 ملك أو كتابة', value: 'اقلب العملة واختبر حظك', inline: true }
                )
                .setFooter({ text: 'ZENO Games • العب واستمتع مع أصدقائك' })
                .setTimestamp();

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('game_btn_trivia').setLabel('سؤال وجواب ❓').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('game_btn_fast').setLabel('أسرع كتابة ⚡').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('game_btn_rps').setLabel('حجر ورقة مقص ✂️').setStyle(ButtonStyle.Secondary)
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('game_btn_dice').setLabel('رمي النرد 🎲').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('game_btn_coin').setLabel('رمي العملة 🪙').setStyle(ButtonStyle.Secondary)
            );

            await channel.send({ embeds: [embed], components: [row1, row2] });
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // Staff Activity Reset API
    // =============================================
    app.post('/api/guild/:guildId/staff/reset', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            if (database.resetStaffStats) database.resetStaffStats(guildId);
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/send-embed', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { channelId, title, titleUrl, desc, author, authorIcon, color, image, thumbnail, footer, footerIcon, timestamp, fields } = req.body;
            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) {
                return res.status(404).json({ success: false, error: 'لم يتم العثور على القناة أو البوت ليس لديه صلاحيات فيها' });
            }
            const { EmbedBuilder } = require('discord.js');
            const emb = new EmbedBuilder().setColor(color || '#9333ea');
            if (title) emb.setTitle(title);
            if (titleUrl) emb.setURL(titleUrl);
            if (desc) emb.setDescription(desc);
            if (author) emb.setAuthor({ name: author, iconURL: authorIcon || undefined });
            if (thumbnail) emb.setThumbnail(thumbnail);
            if (image) emb.setImage(image);
            if (footer) emb.setFooter({ text: footer, iconURL: footerIcon || undefined });
            if (timestamp !== false) emb.setTimestamp();
            if (Array.isArray(fields) && fields.length > 0) {
                for (const f of fields) {
                    if (f.name && f.value) {
                        emb.addFields({ name: f.name, value: f.value, inline: !!f.inline });
                    }
                }
            }
            await channel.send({ embeds: [emb] });
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });
};

