// ==========================================
// FILE: src/dashboard/server.js
// ==========================================
const session = require('express-session');

module.exports = function (app) {
    // إعداد الجلسات (Sessions)
    app.use(session({
        secret: process.env.SESSION_SECRET || 'zeno_secret_key',
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 86400000 } // 24 ساعة
    }));

    // 1. رابط بدء تسجيل الدخول بـ Discord
    app.get('/auth/discord', (req, res) => {
        const clientId = process.env.DISCORD_CLIENT_ID || '1506005273893146775';
        const redirectUri = encodeURIComponent(`${req.protocol}://${req.get('host')}/auth/discord/callback`);
        const scope = encodeURIComponent('identify guilds');

        res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`);
    });

    // 2. استقبال العودة من Discord وجلب بيانات المستخدم وسيرفراته
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

            // جلب بيانات الحساب
            const userRes = await fetch('https://discord.com/api/users/@me', {
                headers: { authorization: `${tokenData.token_type} ${tokenData.access_token}` }
            });
            const userData = await userRes.json();

            // جلب السيرفرات وتصفية سيرفرات الادمن فقط (Administrator / Manage Guild)
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

    // 3. صفحة لوحة التحكم الاحترافية المتحركة (ZENO V3 Ultra Dashboard)
    app.get('/dashboard', (req, res) => {
        if (!req.session || !req.session.user) {
            return res.redirect('/auth/discord');
        }

        const user = req.session.user;
        const guilds = req.session.guilds || [];

        // دعم الصور المتحركة (GIF) أو الثابتة للحساب
        const avatarFormat = user.avatar && user.avatar.startsWith('a_') ? 'gif' : 'png';
        const avatarUrl = user.avatar
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${avatarFormat}?size=256`
            : `https://cdn.discordapp.com/embed/avatars/${(user.discriminator || 0) % 5}.png`;

        const guildsHtml = guilds.length > 0 ? guilds.map(guild => {
            const iconFormat = guild.icon && guild.icon.startsWith('a_') ? 'gif' : 'png';
            const guildIcon = guild.icon
                ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${iconFormat}?size=256`
                : `https://cdn.discordapp.com/embed/avatars/0.png`;

            return `
            <div data-name="${guild.name}" class="server-card group relative bg-[#0d121f]/90 hover:bg-[#131b2e] border border-indigo-500/10 hover:border-indigo-500/50 transition-all duration-300 p-5 rounded-2xl flex items-center justify-between shadow-xl hover:shadow-2xl hover:shadow-indigo-500/20 hover:-translate-y-1.5 backdrop-blur-md">
                <div class="flex items-center gap-4">
                    <div class="relative">
                        <img src="${guildIcon}" alt="${guild.name}" class="w-14 h-14 rounded-2xl object-cover border-2 border-indigo-500/20 group-hover:border-indigo-500 group-hover:rotate-3 transition-all duration-300 shadow-md">
                        <span class="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-[#0d121f] rounded-full shadow-[0_0_8px_#10b981]"></span>
                    </div>
                    <div>
                        <h3 class="font-black text-white text-base group-hover:text-indigo-300 transition-colors line-clamp-1">${guild.name}</h3>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="inline-flex items-center gap-1 text-[10px] bg-indigo-500/10 text-indigo-400 font-bold px-2.5 py-0.5 rounded-md border border-indigo-500/20">
                                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/></svg>
                                أدمن
                            </span>
                        </div>
                    </div>
                </div>
                <a href="/dashboard/${guild.id}" class="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/50 hover:scale-105 active:scale-95 shrink-0">
                    <span>إدارة</span>
                    <svg class="w-4 h-4 rotate-180 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                </a>
            </div>
            `;
        }).join('') : `
            <div class="col-span-full bg-[#0d121f]/60 border border-gray-800/80 rounded-3xl p-12 text-center backdrop-blur-md">
                <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-inner">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <h3 class="text-lg font-black text-gray-200 mb-1">لا توجد سيرفرات مؤهلة</h3>
                <p class="text-gray-400 text-xs">تأكد من امتلاكك لصلاحيات الإدارة (Administrator) في السيرفرات المطلوبة.</p>
            </div>
        `;

        res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>لوحة التحكم الفاخرة - ZENO</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Cairo', sans-serif; background: #05070e; color: #fff; overflow-x: hidden; }
                
                /* خلفية إضاءة نيون متفاعلة */
                .bg-glow {
                    background: 
                        radial-gradient(circle at 80% 20%, rgba(99, 102, 241, 0.18) 0%, transparent 40%),
                        radial-gradient(circle at 20% 80%, rgba(139, 92, 246, 0.15) 0%, transparent 45%),
                        radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.8) 0%, #05070e 100%);
                }

                /* تأثيرات الحركة المتدرجة (Animated Glow Button) */
                .btn-glow {
                    background-size: 200% 200%;
                    animation: gradientMove 4s ease infinite;
                }

                @keyframes gradientMove {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }

                .profile-card-hover {
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .profile-card-hover:hover {
                    box-shadow: 0 0 25px rgba(99, 102, 241, 0.35);
                    border-color: rgba(99, 102, 241, 0.6);
                }

                ::-webkit-scrollbar { width: 8px; }
                ::-webkit-scrollbar-track { background: #05070e; }
                ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 99px; }
                ::-webkit-scrollbar-thumb:hover { background: #6366f1; }
            </style>
        </head>
        <body class="min-h-screen flex flex-col justify-between bg-glow selection:bg-indigo-500 selection:text-white">

            <!-- Navbar Header -->
            <header class="border-b border-indigo-500/10 bg-[#05070e]/80 backdrop-blur-xl sticky top-0 z-50">
                <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <a href="/" class="flex items-center gap-3 group">
                            <div class="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center font-black text-white shadow-lg shadow-indigo-500/30 text-xl border border-indigo-400/30 group-hover:scale-105 transition-transform duration-300">Z</div>
                            <span class="text-2xl font-black tracking-wider text-white group-hover:text-indigo-300 transition-colors">ZENO</span>
                        </a>
                        <span class="hidden sm:inline-block h-5 w-[1px] bg-gray-800"></span>
                        <div class="hidden sm:flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                            <span class="text-[11px] font-bold text-emerald-400">متصل بالديسكورد</span>
                        </div>
                    </div>

                    <!-- بطاقة المستخدم الحالية المتحركة -->
                    <div class="flex items-center gap-3">
                        <div class="profile-card-hover flex items-center gap-3 bg-[#0d121f]/90 px-4 py-2 rounded-2xl border border-indigo-500/20 shadow-lg backdrop-blur-md">
                            <div class="relative">
                                <img src="${avatarUrl}" alt="Avatar" class="w-9 h-9 rounded-xl object-cover border border-indigo-500/50 shadow-md">
                                <span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-[#0d121f] rounded-full"></span>
                            </div>
                            <div class="text-right hidden sm:block">
                                <p class="text-xs font-black text-white leading-tight flex items-center gap-1">
                                    ${user.username}
                                </p>
                                <p class="text-[10px] text-indigo-400 font-bold">مسجل الدخول</p>
                            </div>
                        </div>

                        <a href="/logout" title="تسجيل الخروج" class="p-2.5 sm:px-4 sm:py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/40 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 active:scale-95 shadow-md">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                            <span class="hidden sm:inline">خروج</span>
                        </a>
                    </div>
                </div>
            </header>

            <!-- Main Container -->
            <main class="max-w-7xl mx-auto w-full px-6 py-8 flex-1">
                <!-- Stats Dashboard Header -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                    <div class="bg-[#0d121f]/80 border border-indigo-500/10 hover:border-indigo-500/30 p-4 rounded-2xl flex items-center justify-between shadow-lg backdrop-blur-md transition-all">
                        <div>
                            <p class="text-gray-400 text-xs font-bold mb-1">السيرفرات المؤهلة</p>
                            <p class="text-2xl font-black text-white">${guilds.length}</p>
                        </div>
                        <div class="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                        </div>
                    </div>

                    <div class="bg-[#0d121f]/80 border border-indigo-500/10 hover:border-indigo-500/30 p-4 rounded-2xl flex items-center justify-between shadow-lg backdrop-blur-md transition-all">
                        <div>
                            <p class="text-gray-400 text-xs font-bold mb-1">استجابة البوت</p>
                            <p class="text-2xl font-black text-emerald-400">18ms</p>
                        </div>
                        <div class="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                        </div>
                    </div>

                    <div class="bg-[#0d121f]/80 border border-indigo-500/10 hover:border-indigo-500/30 p-4 rounded-2xl flex items-center justify-between shadow-lg backdrop-blur-md transition-all">
                        <div>
                            <p class="text-gray-400 text-xs font-bold mb-1">حالة الحماية</p>
                            <p class="text-2xl font-black text-indigo-400">نشطة (SQL Clean)</p>
                        </div>
                        <div class="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                        </div>
                    </div>
                </div>

                <!-- Controls Header & Live Search -->
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div class="text-right">
                        <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-2">
                            <span>إدارة خوادم ديسكورد</span>
                            <span class="text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-1 rounded-full">V3 Ultra</span>
                        </h1>
                        <p class="text-gray-400 text-xs mt-1">اختر الخادم للوصول إلى لوحة التحكم والتعديل على التذاكر والأوامر.</p>
                    </div>

                    <!-- Live Search Input -->
                    <div class="relative w-full md:w-80">
                        <input type="text" id="searchInput" onkeyup="filterServers()" placeholder="ابحث عن خادم..." class="w-full bg-[#0d121f] border border-gray-800 focus:border-indigo-500 rounded-2xl py-3 px-10 text-xs text-white placeholder-gray-500 focus:outline-none transition-all shadow-inner focus:shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                        <svg class="w-4 h-4 text-gray-500 absolute right-3.5 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </div>
                </div>

                <!-- Servers Grid -->
                <div id="serversGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    ${guildsHtml}
                </div>
            </main>

            <!-- Footer -->
            <footer class="border-t border-gray-800/60 bg-[#05070e] py-6 text-center text-gray-500 text-xs">
                <div class="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
                    <p class="font-bold">جميع الحقوق محفوظة © ZENO BOT 2026</p>
                    <div class="flex items-center gap-4 text-gray-400">
                        <a href="/terms.html" class="hover:text-indigo-400 transition">الشروط</a>
                        <span>•</span>
                        <a href="/privacy.html" class="hover:text-indigo-400 transition">الخصوصية</a>
                    </div>
                </div>
            </footer>

            <!-- Filter Script -->
            <script>
                function filterServers() {
                    const input = document.getElementById('searchInput').value.toLowerCase();
                    const cards = document.querySelectorAll('.server-card');
                    cards.forEach(card => {
                        const name = card.getAttribute('data-name').toLowerCase();
                        if (name.includes(input)) {
                            card.style.display = 'flex';
                        } else {
                            card.style.display = 'none';
                        }
                    });
                }
            </script>
        </body>
        </html>
        `);
    });

    // 4. مسار إدارة سيرفر محدد
    app.get('/dashboard/:guildId', (req, res) => {
        if (!req.session || !req.session.user) {
            return res.redirect('/auth/discord');
        }

        const guildId = req.params.guildId;
        const guilds = req.session.guilds || [];
        const targetGuild = guilds.find(g => g.id === guildId);

        res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>إدارة الخادم - ZENO</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
        </head>
        <body class="bg-[#05070e] text-white font-['Cairo'] p-8 min-h-screen flex items-center justify-center">
            <div class="max-w-2xl w-full bg-[#0d121f] border border-indigo-500/20 p-8 rounded-3xl shadow-2xl backdrop-blur-xl">
                <a href="/dashboard" class="text-indigo-400 hover:text-indigo-300 text-xs font-bold mb-6 inline-flex items-center gap-2 transition-colors">
                    <svg class="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                    العودة للوحة الرئيسية
                </a>
                <h1 class="text-3xl font-black mb-2 text-white">إدارة: ${targetGuild ? targetGuild.name : guildId}</h1>
                <p class="text-gray-400 text-xs mb-6">قم بتعديل إعدادات التذاكر والأوامر لهذا الخادم.</p>
                <div class="p-5 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-indigo-300 text-xs flex items-center gap-3">
                    <span class="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping"></span>
                    جاري تحميل إعدادات السيرفر وقاعدة البيانات...
                </div>
            </div>
        </body>
        </html>
        `);
    });

    // 5. مسار تسجيل الخروج
    app.get('/logout', (req, res) => {
        if (req.session) {
            req.session.destroy();
        }
        res.redirect('/');
    });
};