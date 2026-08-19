// ==========================================
// FILE: src/dashboard/server.js (ZENO Purple Theme)
// ==========================================
const session = require('express-session');

module.exports = function (app) {
    app.use(session({
        secret: process.env.SESSION_SECRET || 'zeno_secret_key',
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 86400000 }
    }));

    // 1. رابط الدخول بـ Discord
    app.get('/auth/discord', (req, res) => {
        const clientId = process.env.DISCORD_CLIENT_ID || '1506005273893146775';
        const redirectUri = encodeURIComponent(`${req.protocol}://${req.get('host')}/auth/discord/callback`);
        const scope = encodeURIComponent('identify guilds');

        res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`);
    });

    // 2. استقبال بيانات ديسكورد
    app.get('/auth/discord/callback', async (req, res) => {
        const code = req.query.code;
        if (!code) return res.redirect('/');

        try {
            const redirectUri = `${req.protocol}://${req.get('host')}/auth/discord/callback`;
            const params = new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID || '1506005273893146775',
                client_secret: process.env.DISCORD_CLIENT_SECRET,
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
            if (!tokenData.access_token) return res.redirect('/?error=auth_failed');

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

            res.redirect('/dashboard');
        } catch (err) {
            console.error('OAuth2 Error:', err);
            res.redirect('/');
        }
    });

    // 3. الصفحة الرئيسية للوحة التحكم بهوية ZENO
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
            <div data-name="${guild.name}" class="server-card bg-[#111118] hover:bg-[#161622] border border-[#222232] hover:border-[#a855f7]/60 transition-all duration-300 rounded-2xl p-4 flex items-center justify-between shadow-lg hover:shadow-purple-900/20">
                <div class="flex items-center gap-4">
                    <img src="${guildIcon}" alt="${guild.name}" class="w-14 h-14 rounded-2xl object-cover border border-[#2d2d42] shrink-0">
                    <div>
                        <h3 class="font-bold text-white text-base line-clamp-1">${guild.name}</h3>
                        <span class="inline-block text-[11px] text-[#a1a1aa] font-semibold mt-0.5">مسؤول (Admin)</span>
                    </div>
                </div>
                <a href="/dashboard/${guild.id}" class="px-5 py-2.5 bg-gradient-to-r from-purple-600 via-purple-500 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-600/20 hover:scale-105 active:scale-95 shrink-0">
                    تحديد
                </a>
            </div>
            `;
        }).join('') : `
            <div class="col-span-full bg-[#111118] border border-[#222232] rounded-2xl p-10 text-center">
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
                html, body {
                    background-color: #08080a !important;
                    color: #ffffff !important;
                    font-family: 'Cairo', sans-serif;
                }
                .purple-glow {
                    background: radial-gradient(circle at 50% -20%, rgba(168, 85, 247, 0.15), transparent 70%);
                }
                ::-webkit-scrollbar { width: 6px; }
                ::-webkit-scrollbar-track { background: #08080a; }
                ::-webkit-scrollbar-thumb { background: #222232; border-radius: 10px; }
                ::-webkit-scrollbar-thumb:hover { background: #a855f7; }
            </style>
        </head>
        <body class="min-h-screen flex flex-col justify-between purple-glow">

            <!-- Navbar Menu -->
            <header class="bg-[#0b0b10]/90 border-b border-[#1c1c28] sticky top-0 z-50 backdrop-blur-xl">
                <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <a href="/" class="flex items-center gap-3 group">
                        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-700 via-purple-500 to-violet-400 flex items-center justify-center font-black text-white text-xl shadow-lg shadow-purple-600/30 group-hover:scale-105 transition-transform">Z</div>
                        <span class="text-xl font-black tracking-[0.25em] text-white group-hover:text-purple-300 transition-colors">Z E N O</span>
                    </a>

                    <div class="flex items-center gap-4">
                        <div class="flex items-center gap-3 bg-[#13131c] border border-[#222232] px-3.5 py-1.5 rounded-xl">
                            <img src="${avatarUrl}" class="w-8 h-8 rounded-lg object-cover border border-purple-500/30">
                            <span class="text-xs font-bold text-white hidden sm:inline">${user.username}</span>
                        </div>

                        <a href="/logout" class="px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-bold transition">
                            خروج
                        </a>
                    </div>
                </div>
            </header>

            <!-- Main Content -->
            <main class="max-w-7xl mx-auto w-full px-6 py-10 flex-1">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-[#1c1c28] pb-6">
                    <div>
                        <h1 class="text-2xl font-black text-white tracking-wide">سيرفراتي</h1>
                        <p class="text-xs text-[#a1a1aa] mt-1">اختر السيرفر الذي ترغب بإدارته للتحكم بالتذاكر والأوامر</p>
                    </div>

                    <div class="w-full md:w-72">
                        <input type="text" id="searchInput" onkeyup="filterServers()" placeholder="بحث عن سيرفر..." class="w-full bg-[#111118] border border-[#222232] focus:border-purple-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none transition shadow-inner">
                    </div>
                </div>

                <div id="serversGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${guildsHtml}
                </div>
            </main>

            <!-- Footer -->
            <footer class="border-t border-[#1c1c28] bg-[#070709] py-6 text-center text-[#71717a] text-xs">
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

    // 4. صفحة الإدارة داخل السيرفر
    app.get('/dashboard/:guildId', (req, res) => {
        if (!req.session || !req.session.user) return res.redirect('/auth/discord');
        const guildId = req.params.guildId;

        res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl" class="dark">
        <head>
            <meta charset="UTF-8">
            <title>إدارة السيرفر - ZENO</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;800;900&display=swap" rel="stylesheet">
            <style>
                body { background-color: #08080a !important; color: #fff !important; font-family: 'Cairo', sans-serif; }
            </style>
        </head>
        <body class="min-h-screen flex items-center justify-center p-6">
            <div class="max-w-md w-full bg-[#111118] border border-[#222232] p-8 rounded-2xl text-center shadow-2xl">
                <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-700 to-violet-500 mx-auto flex items-center justify-center font-black text-white text-2xl mb-4 shadow-lg shadow-purple-600/30">Z</div>
                <h1 class="text-xl font-black mb-2 text-white">إدارة السيرفر (${guildId})</h1>
                <p class="text-xs text-[#a1a1aa] mb-6">جاري جلب إعدادات السيرفر وقاعدة البيانات...</p>
                <a href="/dashboard" class="inline-block px-5 py-2.5 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white rounded-xl text-xs font-bold transition shadow-md">
                    العودة للقائمة
                </a>
            </div>
        </body>
        </html>
        `);
    });

    app.get('/logout', (req, res) => {
        if (req.session) req.session.destroy();
        res.redirect('/');
    });
};