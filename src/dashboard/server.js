// ========================================================
// FILE: src/dashboard/server.js
// ========================================================
const express = require('express');
const session = require('express-session');

module.exports = function (app) {
    const sessionStore = new session.MemoryStore();

    app.set('trust proxy', 1);
    app.use(express.static('public'));

    app.use(session({
        store: sessionStore,
        secret: process.env.SESSION_SECRET || 'ZENO_TICKETS_SUPER_SECRET',
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 86400000,
            secure: false,
            sameSite: 'lax'
        }
    }));

    // ==========================================
    // الصفحة الرئيسية
    // ==========================================
    app.get('/', (req, res) => {
        try {
            const user = req.session?.user;
            res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>ZENO | بوت ديشكورد احترافي</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                <style>
                    body { background-color: #0b0c10; color: #ffffff; font-family: 'Cairo', sans-serif; overflow-x: hidden; }
                    .glow-bg {
                        position: absolute;
                        width: 600px;
                        height: 600px;
                        background: radial-gradient(circle, rgba(168, 85, 247, 0.12) 0%, rgba(11, 12, 16, 0) 70%);
                        z-index: 0;
                        pointer-events: none;
                    }
                    .dropdown:hover .dropdown-menu { display: block; }
                </style>
            </head>
            <body class="min-h-screen flex flex-col relative overflow-hidden">
                <div class="glow-bg top-[-150px] right-[-150px]"></div>
                <div class="glow-bg bottom-[-150px] left-[-150px]"></div>

                <nav class="flex items-center justify-between px-6 md:px-16 py-5 z-10 border-b border-purple-900/20 backdrop-blur-xl bg-[#0b0c10]/80 sticky top-0">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-gradient-to-tr from-purple-700 to-indigo-500 rounded-2xl flex items-center justify-center shadow-xl shadow-purple-600/30 text-white font-black text-2xl border border-purple-400/30">Z</div>
                        <span class="font-black text-2xl tracking-wider bg-gradient-to-r from-white via-purple-200 to-purple-400 bg-clip-text text-transparent">ZENO</span>
                    </div>

                    <div class="hidden md:flex items-center gap-8 text-gray-300 font-semibold text-sm">
                        <div class="relative dropdown group py-2">
                            <button class="flex items-center gap-1 hover:text-purple-400 transition">
                                المميزات 
                                <svg class="w-4 h-4 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                            </button>
                            <div class="dropdown-menu hidden absolute top-full right-0 w-56 bg-[#13141b] border border-purple-500/20 rounded-2xl shadow-2xl p-2 z-50">
                                <a href="#" class="block px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-purple-600/20 rounded-xl transition">🎫 نظام التذاكر المتقدمة</a>
                                <a href="#" class="block px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-purple-600/20 rounded-xl transition">👋 رسائل الترحيب</a>
                                <a href="#" class="block px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-purple-600/20 rounded-xl transition">🛡️ نظام الحماية والإشراف</a>
                            </div>
                        </div>

                        <div class="relative dropdown group py-2">
                            <button class="flex items-center gap-1 hover:text-purple-400 transition">
                                المصادر
                                <svg class="w-4 h-4 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                            </button>
                            <div class="dropdown-menu hidden absolute top-full right-0 w-56 bg-[#13141b] border border-purple-500/20 rounded-2xl shadow-2xl p-2 z-50">
                                <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="block px-4 py-2.5 text-sm text-purple-400 hover:bg-purple-600/20 rounded-xl transition font-bold">💬 سيرفر الدعم الفني</a>
                                <a href="#" class="block px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-purple-600/20 rounded-xl transition">📚 الأوامر والمستندات</a>
                            </div>
                        </div>

                        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="hover:text-purple-400 transition">الدعم الفني</a>
                    </div>

                    <div class="z-10">
                        ${user
                    ? `<a href="/dashboard"><img src="${user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-11 h-11 rounded-full border-2 border-purple-500 hover:scale-105 transition shadow-lg shadow-purple-500/20 cursor-pointer"></a>`
                    : `<a href="/auth/discord" class="text-sm font-bold bg-[#5865F2] hover:bg-[#4752C4] text-white px-6 py-2.5 rounded-xl transition shadow-lg shadow-[#5865F2]/30 flex items-center gap-2">تسجيل الدخول</a>`
                }
                    </div>
                </nav>

                <main class="flex-1 flex flex-col items-center justify-center px-4 text-center pb-24 z-10 mt-12">
                    <span class="bg-purple-600/10 border border-purple-500/30 text-purple-300 px-5 py-2 rounded-full text-xs font-extrabold mb-8 shadow-inner tracking-wide">✨ تصميم جديد كلياً لتجربة استثنائية</span>
                    
                    <h1 class="text-4xl md:text-6xl font-black mb-6 leading-tight tracking-tight">
                        اصنع خادم ديسكورد <br> <span class="bg-gradient-to-r from-purple-400 via-indigo-300 to-purple-600 bg-clip-text text-transparent">احترافي ومتكامل!</span>
                    </h1>
                    
                    <p class="text-gray-400 mb-10 max-w-xl mx-auto leading-relaxed text-sm md:text-base font-medium">
                        بوت متعدد الأغراض قابل للتخصيص بالكامل، يوفر لك نظام تذاكر متطور، رسائل ترحيبية، سجلات دقيقة، وأدوات إشراف فائقة السرعة.
                    </p>
                    
                    <div class="flex flex-col sm:flex-row gap-4 items-center justify-center w-full sm:w-auto">
                        <a href="/dashboard" class="px-8 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-2xl font-bold transition text-white shadow-xl shadow-purple-600/30 w-full sm:w-auto text-sm">لوحة التحكم</a>
                        <a href="/auth/discord" class="px-8 py-3.5 bg-[#13141b] hover:bg-[#1a1b24] border border-purple-500/20 rounded-2xl font-bold transition flex items-center justify-center gap-2 w-full sm:w-auto text-sm text-gray-200">إضافة البوت في Discord</a>
                    </div>
                </main>
            </body>
            </html>
            `);
        } catch (error) {
            res.status(500).send("حدث خطأ في تحميل الصفحة الرئيسية.");
        }
    });

    // ==========================================
    // المصادقة مع ديسكورد
    // ==========================================
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

    // ==========================================
    // لوحة التحكم لاختيار السيرفر
    // ==========================================
    app.get('/dashboard', (req, res) => {
        try {
            if (!req.session?.user) return res.redirect('/auth/discord');
            const user = req.session.user;
            const guilds = req.session.guilds || [];
            const userAvatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

            const guildsHtml = guilds.length > 0 ? guilds.map(guild => `
                <a href="/dashboard/${guild.id}" class="group relative bg-[#13141b] border border-purple-500/10 hover:border-purple-500/50 rounded-3xl p-6 transition-all duration-300 hover:shadow-2xl hover:shadow-purple-600/10 flex flex-col justify-between overflow-hidden">
                    <div class="absolute top-0 right-0 w-32 h-32 bg-purple-600/5 rounded-full blur-2xl group-hover:bg-purple-600/15 transition"></div>
                    <div class="flex items-center gap-4 relative z-10">
                        <img src="${guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-16 h-16 rounded-2xl bg-[#0b0c10] border border-purple-500/20 shadow-md">
                        <div>
                            <h3 class="font-bold text-white group-hover:text-purple-400 transition text-lg truncate max-w-[180px]">${guild.name}</h3>
                            <span class="inline-block px-2.5 py-1 bg-purple-500/10 text-purple-300 text-[11px] font-bold rounded-lg mt-1 border border-purple-500/20">صلاحية إدارة كاملة</span>
                        </div>
                    </div>
                    <div class="mt-8 pt-4 border-t border-purple-500/10 flex items-center justify-between relative z-10">
                        <span class="text-xs text-gray-400 font-medium">الدخول للإعدادات</span>
                        <div class="w-9 h-9 rounded-xl bg-purple-600/10 group-hover:bg-purple-600 text-purple-400 group-hover:text-white flex items-center justify-center transition shadow">
                            <svg class="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"></path></svg>
                        </div>
                    </div>
                </a>
            `).join('') : '<div class="col-span-full py-12 text-center text-gray-400 bg-[#13141b] rounded-3xl border border-purple-500/10">لا توجد سيرفرات تمتلك صلاحيات الإدارة فيها.</div>';

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
                    body { background-color: #0b0c10; color: #d1d5db; font-family: 'Cairo', sans-serif; overflow-x: hidden; }
                </style>
            </head>
            <body class="min-h-screen flex flex-col relative">
                <header class="w-full px-6 md:px-16 py-5 border-b border-purple-900/20 backdrop-blur-xl bg-[#0b0c10]/80 sticky top-0 z-50 flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 bg-gradient-to-tr from-purple-700 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-600/30 text-white font-black text-xl border border-purple-400/30">Z</div>
                        <div>
                            <h1 class="font-black text-lg text-white tracking-wide">ZENO DASHBOARD</h1>
                            <p class="text-[11px] text-purple-400 font-bold">لوحة الإدارة المركزية</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-4">
                        <a href="/" class="px-4 py-2 bg-[#13141b] hover:bg-[#1a1b24] text-gray-300 hover:text-white rounded-xl border border-purple-500/20 text-xs font-bold transition shadow-sm">الرئيسية</a>
                        <div class="flex items-center gap-3 bg-[#13141b] px-3 py-1.5 rounded-2xl border border-purple-500/20">
                            <img src="${userAvatar}" class="w-8 h-8 rounded-full border border-purple-500/40">
                            <span class="text-xs font-bold text-white hidden sm:inline">${user.username}</span>
                        </div>
                    </div>
                </header>
                <main class="flex-1 px-6 md:px-16 py-10 z-10 max-w-7xl mx-auto w-full">
                    <div class="mb-10">
                        <h2 class="text-3xl font-black text-white tracking-tight">اختر السيرفر للبدء</h2>
                        <p class="text-gray-400 mt-2 text-sm font-medium">قم باختيار الخادم الذي تود التحكم بإعداداته وتخصيص ميزاته بالكامل.</p>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        ${guildsHtml}
                    </div>
                </main>
            </body>
            </html>
            `);
        } catch (error) {
            res.status(500).send("حدث خطأ في تحميل لوحة التحكم.");
        }
    });

    // ==========================================
    // صفحة إدارة السيرفر (تصميم احترافي مطابق للصورة مع القائمة الجانبية وصورة البوت)
    // ==========================================
    app.get('/dashboard/:guildId', (req, res) => {
        try {
            if (!req.session?.user) return res.redirect('/auth/discord');
            const guildId = req.params.guildId;
            const guilds = req.session.guilds || [];
            const guild = guilds.find(g => g.id === guildId);
            const user = req.session.user;

            if (!guild) return res.redirect('/dashboard');

            const userAvatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

            res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>إدارة ${guild.name} | ZENO</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                <style>
                    body { background-color: #0b0c10; color: #d1d5db; font-family: 'Cairo', sans-serif; overflow-x: hidden; }
                    ::-webkit-scrollbar { width: 6px; }
                    ::-webkit-scrollbar-thumb { background: #232430; border-radius: 10px; }
                </style>
            </head>
            <body class="min-h-screen flex flex-col bg-[#0b0c10] text-gray-200">
                
                <!-- الشريط العلوى (Top Bar) -->
                <header class="w-full px-6 py-4 border-b border-purple-900/20 bg-[#13141b]/90 backdrop-blur sticky top-0 z-50 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <a href="/dashboard" class="flex items-center gap-2 px-3 py-1.5 bg-[#0b0c10] hover:bg-[#1a1b24] text-gray-300 rounded-xl border border-purple-500/20 text-xs font-bold transition">
                            <svg class="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                            <span>العودة للخوادم</span>
                        </a>
                        <span class="text-gray-500">|</span>
                        <span class="text-sm font-extrabold text-white">${guild.name}</span>
                    </div>

                    <!-- صورة وبطاقة البوت في المنتصف/اليمين العلوي -->
                    <div class="flex items-center gap-3">
                        <div class="flex items-center gap-2 bg-[#0b0c10] px-3 py-1.5 rounded-2xl border border-purple-500/20 shadow-inner">
                            <span class="text-xs font-bold text-white hidden sm:inline">ZENO BOT</span>
                            <div class="w-8 h-8 bg-gradient-to-tr from-purple-600 to-indigo-500 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-md border border-purple-400/40">Z</div>
                        </div>
                        <img src="${userAvatar}" class="w-9 h-9 rounded-full border border-purple-500/30">
                    </div>
                </header>

                <div class="flex-1 flex flex-col lg:flex-row">
                    
                    <!-- المحتوى الرئيسي (Main Panel) -->
                    <main class="flex-1 p-6 md:p-10">
                        
                        <!-- شريط البحث السريع -->
                        <div class="mb-8">
                            <input type="text" placeholder="Search plugins..." class="w-full md:w-80 bg-[#13141b] border border-purple-500/20 focus:border-purple-500 rounded-2xl px-4 py-3 text-xs text-gray-200 outline-none transition shadow-inner">
                        </div>

                        <!-- قسم Fast Access -->
                        <div class="mb-10">
                            <h3 class="text-xs font-extrabold text-purple-400 uppercase tracking-widest mb-4">Fast Access</h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                
                                <div class="bg-[#13141b] border border-purple-500/10 hover:border-purple-500/30 rounded-2xl p-5 flex flex-col justify-between transition group">
                                    <div class="flex items-center justify-between mb-3">
                                        <h4 class="font-bold text-white text-sm">نظرة عامة</h4>
                                        <span class="p-2 bg-purple-600/10 rounded-xl text-purple-400">👁️</span>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-6">Get main information about your server settings</p>
                                    <button class="w-full py-2.5 bg-[#1a1b24] hover:bg-purple-600 hover:text-white text-gray-300 rounded-xl font-bold text-xs transition border border-purple-500/10">Visit</button>
                                </div>

                                <div class="bg-[#13141b] border border-purple-500/10 hover:border-purple-500/30 rounded-2xl p-5 flex flex-col justify-between transition group">
                                    <div class="flex items-center justify-between mb-3">
                                        <h4 class="font-bold text-white text-sm">إعدادات السيرفر</h4>
                                        <span class="p-2 bg-purple-600/10 rounded-xl text-purple-400">⚙️</span>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-6">Manage your server settings</p>
                                    <button class="w-full py-2.5 bg-[#1a1b24] hover:bg-purple-600 hover:text-white text-gray-300 rounded-xl font-bold text-xs transition border border-purple-500/10">Visit</button>
                                </div>

                                <div class="bg-[#13141b] border border-purple-500/10 hover:border-purple-500/30 rounded-2xl p-5 flex flex-col justify-between transition group">
                                    <div class="flex items-center justify-between mb-3">
                                        <h4 class="font-bold text-white text-sm">رسائل الإيمبد</h4>
                                        <span class="p-2 bg-purple-600/10 rounded-xl text-purple-400">💬</span>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-6">Create and manage embed messages</p>
                                    <button class="w-full py-2.5 bg-[#1a1b24] hover:bg-purple-600 hover:text-white text-gray-300 rounded-xl font-bold text-xs transition border border-purple-500/10">Visit</button>
                                </div>

                            </div>
                        </div>

                        <!-- قسم Modules -->
                        <div>
                            <h3 class="text-xs font-extrabold text-purple-400 uppercase tracking-widest mb-4">Modules (12 Plugins)</h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                
                                <div class="bg-[#13141b] border border-purple-500/10 rounded-2xl p-5 flex flex-col justify-between">
                                    <div class="flex items-center justify-between mb-3">
                                        <h4 class="font-bold text-white text-sm">الأوامر العامة</h4>
                                        <div class="flex items-center gap-2">
                                            <input type="checkbox" checked class="accent-purple-600 w-4 h-4 cursor-pointer">
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-6">Utility commands and features</p>
                                    <button class="w-full py-2.5 bg-[#1a1b24] hover:bg-[#232430] text-gray-300 rounded-xl font-bold text-xs transition border border-purple-500/10">Configure</button>
                                </div>

                                <div class="bg-[#13141b] border border-purple-500/10 rounded-2xl p-5 flex flex-col justify-between">
                                    <div class="flex items-center justify-between mb-3">
                                        <h4 class="font-bold text-white text-sm">الإشراف</h4>
                                        <div class="flex items-center gap-2">
                                            <input type="checkbox" checked class="accent-purple-600 w-4 h-4 cursor-pointer">
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-6">Moderation tools and commands</p>
                                    <button class="w-full py-2.5 bg-[#1a1b24] hover:bg-[#232430] text-gray-300 rounded-xl font-bold text-xs transition border border-purple-500/10">Configure</button>
                                </div>

                                <div class="bg-[#13141b] border border-purple-500/10 rounded-2xl p-5 flex flex-col justify-between">
                                    <div class="flex items-center justify-between mb-3">
                                        <h4 class="font-bold text-white text-sm">الرقابة التلقائية</h4>
                                        <div class="flex items-center gap-2">
                                            <input type="checkbox" checked class="accent-purple-600 w-4 h-4 cursor-pointer">
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-6">Automatic moderation features</p>
                                    <button class="w-full py-2.5 bg-[#1a1b24] hover:bg-[#232430] text-gray-300 rounded-xl font-bold text-xs transition border border-purple-500/10">Configure</button>
                                </div>

                                <div class="bg-[#13141b] border border-purple-500/10 rounded-2xl p-5 flex flex-col justify-between">
                                    <div class="flex items-center justify-between mb-3">
                                        <h4 class="font-bold text-white text-sm">نظام التذاكر</h4>
                                        <div class="flex items-center gap-2">
                                            <input type="checkbox" checked class="accent-purple-600 w-4 h-4 cursor-pointer">
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-6">Advanced support ticket system</p>
                                    <button class="w-full py-2.5 bg-[#1a1b24] hover:bg-[#232430] text-gray-300 rounded-xl font-bold text-xs transition border border-purple-500/10">Configure</button>
                                </div>

                                <div class="bg-[#13141b] border border-purple-500/10 rounded-2xl p-5 flex flex-col justify-between">
                                    <div class="flex items-center justify-between mb-3">
                                        <h4 class="font-bold text-white text-sm">الترحيب والمغادرة</h4>
                                        <div class="flex items-center gap-2">
                                            <input type="checkbox" checked class="accent-purple-600 w-4 h-4 cursor-pointer">
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-[11px] mb-6">Custom welcome & leave cards</p>
                                    <button class="w-full py-2.5 bg-[#1a1b24] hover:bg-[#232430] text-gray-300 rounded-xl font-bold text-xs transition border border-purple-500/10">Configure</button>
                                </div>

                            </div>
                        </div>

                    </main>

                    <!-- القائمة الجانبية اليمنى (Plugins Sidebar) المطابقة للصورة -->
                    <aside class="w-full lg:w-72 bg-[#101116] border-t lg:border-t-0 lg:border-r border-purple-900/10 p-4 flex flex-col gap-1 text-xs">
                        <div class="text-[10px] text-gray-500 font-bold uppercase tracking-wider px-3 mb-2">General</div>
                        <a href="#" class="flex items-center justify-between px-3 py-2 rounded-xl bg-purple-600/10 text-purple-400 font-bold">
                            <span>⚡ نظرة عامة</span>
                            <span class="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500"></span>
                        </a>
                        <a href="#" class="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-[#161720] text-gray-300 transition">
                            <span>⚙️ إعدادات السيرفر</span>
                            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                        </a>
                        <a href="#" class="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-[#161720] text-gray-300 transition">
                            <span>💬 رسائل الإيمبد</span>
                            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                        </a>
                        <a href="#" class="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-[#161720] text-gray-300 transition">
                            <span>🎫 التذاكر</span>
                            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                        </a>

                        <div class="text-[10px] text-gray-500 font-bold uppercase tracking-wider px-3 mt-4 mb-2">الإشراف</div>
                        <a href="#" class="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-[#161720] text-gray-300 transition">
                            <span>🛡️ الإشراف</span>
                            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                        </a>
                        <a href="#" class="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-[#161720] text-gray-300 transition">
                            <span>📜 اللوق والسجلات</span>
                            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                        </a>
                        <a href="#" class="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-[#161720] text-gray-300 transition">
                            <span>🤖 الرقابة التلقائية</span>
                            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                        </a>

                        <div class="text-[10px] text-gray-500 font-bold uppercase tracking-wider px-3 mt-4 mb-2">أخرى</div>
                        <a href="#" class="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-[#161720] text-gray-300 transition">
                            <span>🛠️ الأوامر العامة</span>
                            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                        </a>
                        <a href="#" class="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-[#161720] text-gray-300 transition">
                            <span>👋 الترحيب والمغادرة</span>
                            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                        </a>
                    </aside>

                </div>
            </body>
            </html>
            `);
        } catch (error) {
            res.redirect('/dashboard');
        }
    });

    app.get('/logout', (req, res) => {
        req.session.destroy(() => res.redirect('/'));
    });
};