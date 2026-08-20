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
    // لوحة التحكم الفريدة لاختيار السيرفر
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
                    .mesh-bg {
                        position: absolute;
                        top: 0; left: 0; width: 100%; height: 300px;
                        background: linear-gradient(135deg, rgba(147, 51, 234, 0.1) 0%, rgba(11, 12, 16, 0) 100%);
                        z-index: 0;
                        pointer-events: none;
                    }
                </style>
            </head>
            <body class="min-h-screen flex flex-col relative">
                <div class="mesh-bg"></div>

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
                            <a href="/logout" title="تسجيل الخروج" class="text-red-400 hover:text-red-300 p-1 transition">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                            </a>
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
    // صفحة إدارة السيرفر المتكاملة (تضم جميع الوحدات بدون القائمة الجانبية القديمة)
    // ==========================================
    app.get('/dashboard/:guildId', (req, res) => {
        try {
            if (!req.session?.user) return res.redirect('/auth/discord');
            const guildId = req.params.guildId;
            const guilds = req.session.guilds || [];
            const guild = guilds.find(g => g.id === guildId);

            if (!guild) return res.redirect('/dashboard');

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
                    body { background-color: #0b0c10; color: #d1d5db; font-family: 'Cairo', sans-serif; }
                </style>
            </head>
            <body class="min-h-screen flex flex-col">
                
                <header class="w-full px-6 md:px-16 py-5 border-b border-purple-900/20 backdrop-blur-xl bg-[#0b0c10]/80 sticky top-0 z-50 flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <img src="${guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-11 h-11 rounded-2xl border border-purple-500/30">
                        <div>
                            <h1 class="font-black text-lg text-white">${guild.name}</h1>
                            <p class="text-[11px] text-purple-400 font-bold">لوحة تحكم الخادم وإدارة الوحدات</p>
                        </div>
                    </div>
                    <a href="/dashboard" class="px-5 py-2.5 bg-[#13141b] hover:bg-[#1a1b24] text-white rounded-2xl border border-purple-500/25 text-xs font-bold transition shadow-md flex items-center gap-2">
                        <span>العودة للسيرفرات</span>
                    </a>
                </header>

                <main class="flex-1 px-6 md:px-16 py-10 max-w-7xl mx-auto w-full">
                    <div class="mb-10">
                        <h2 class="text-3xl font-black text-white">إدارة الإضافات والوحدات الكاملة</h2>
                        <p class="text-gray-400 mt-2 text-sm">تحكم بجميع خصائص وأوامر البوت في سيرفر ${guild.name} بسهولة تامة.</p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        
                        <!-- نظام التذاكر -->
                        <div class="bg-[#13141b] border border-purple-500/10 hover:border-purple-500/40 rounded-3xl p-6 flex flex-col justify-between transition group">
                            <div>
                                <div class="w-12 h-12 bg-purple-600/10 rounded-2xl flex items-center justify-center text-purple-400 mb-4 border border-purple-500/20 text-xl font-bold">🎫</div>
                                <h3 class="font-bold text-white text-lg mb-2">نظام التذاكر المتقدم</h3>
                                <p class="text-gray-400 text-xs leading-relaxed">إنشاء وتخصيص غرف الدعم الفني والتذاكر للأعضاء وصلاحيات المشرفين.</p>
                            </div>
                            <button class="mt-8 w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl font-bold text-sm transition shadow-lg shadow-purple-600/20">تعديل الإعدادات</button>
                        </div>

                        <!-- الترحيب والمغادرة -->
                        <div class="bg-[#13141b] border border-purple-500/10 hover:border-purple-500/40 rounded-3xl p-6 flex flex-col justify-between transition group">
                            <div>
                                <div class="w-12 h-12 bg-purple-600/10 rounded-2xl flex items-center justify-center text-purple-400 mb-4 border border-purple-500/20 text-xl font-bold">👋</div>
                                <h3 class="font-bold text-white text-lg mb-2">الترحيب والمغادرة</h3>
                                <p class="text-gray-400 text-xs leading-relaxed">إرسال رسائل ترحيب مخصصة وصور احترافية للأعضاء الجدد عند الانضمام.</p>
                            </div>
                            <button class="mt-8 w-full py-3 bg-[#1a1b24] hover:bg-[#232430] text-white rounded-2xl font-bold text-sm transition border border-purple-500/15">تعديل الإعدادات</button>
                        </div>

                        <!-- الإشراف والحماية -->
                        <div class="bg-[#13141b] border border-purple-500/10 hover:border-purple-500/40 rounded-3xl p-6 flex flex-col justify-between transition group">
                            <div>
                                <div class="w-12 h-12 bg-purple-600/10 rounded-2xl flex items-center justify-center text-purple-400 mb-4 border border-purple-500/20 text-xl font-bold">🛡️</div>
                                <h3 class="font-bold text-white text-lg mb-2">الإشراف والحماية التلقائية</h3>
                                <p class="text-gray-400 text-xs leading-relaxed">حماية السيرفر من السبام، الروابط الضارة، والكلمات المسيئة بإعدادات متقدمة.</p>
                            </div>
                            <button class="mt-8 w-full py-3 bg-[#1a1b24] hover:bg-[#232430] text-white rounded-2xl font-bold text-sm transition border border-purple-500/15">تعديل الإعدادات</button>
                        </div>

                        <!-- الأوامر العامة -->
                        <div class="bg-[#13141b] border border-purple-500/10 hover:border-purple-500/40 rounded-3xl p-6 flex flex-col justify-between transition group">
                            <div>
                                <div class="w-12 h-12 bg-purple-600/10 rounded-2xl flex items-center justify-center text-purple-400 mb-4 border border-purple-500/20 text-xl font-bold">⚡</div>
                                <h3 class="font-bold text-white text-lg mb-2">الأوامر العامة</h3>
                                <p class="text-gray-400 text-xs leading-relaxed">تفعيل وتعطيل الأوامر الترفيهية والعامة المتاحة لجميع الأعضاء.</p>
                            </div>
                            <button class="mt-8 w-full py-3 bg-[#1a1b24] hover:bg-[#232430] text-white rounded-2xl font-bold text-sm transition border border-purple-500/15">تعديل الإعدادات</button>
                        </div>

                        <!-- رسائل الإيمبد -->
                        <div class="bg-[#13141b] border border-purple-500/10 hover:border-purple-500/40 rounded-3xl p-6 flex flex-col justify-between transition group">
                            <div>
                                <div class="w-12 h-12 bg-purple-600/10 rounded-2xl flex items-center justify-center text-purple-400 mb-4 border border-purple-500/20 text-xl font-bold">💬</div>
                                <h3 class="font-bold text-white text-lg mb-2">رسائل الإيمبد المخصصة</h3>
                                <p class="text-gray-400 text-xs leading-relaxed">تصميم وإرسال رسائل إيمبد احترافية ومتناسقة للقنوات العامة والإعلانات.</p>
                            </div>
                            <button class="mt-8 w-full py-3 bg-[#1a1b24] hover:bg-[#232430] text-white rounded-2xl font-bold text-sm transition border border-purple-500/15">تعديل الإعدادات</button>
                        </div>

                        <!-- إعدادات السيرفر العامة -->
                        <div class="bg-[#13141b] border border-purple-500/10 hover:border-purple-500/40 rounded-3xl p-6 flex flex-col justify-between transition group">
                            <div>
                                <div class="w-12 h-12 bg-purple-600/10 rounded-2xl flex items-center justify-center text-purple-400 mb-4 border border-purple-500/20 text-xl font-bold">🔧</div>
                                <h3 class="font-bold text-white text-lg mb-2">إعدادات الخادم العامة</h3>
                                <p class="text-gray-400 text-xs leading-relaxed">تخصيص بادئة البوت، لغة الأوامر، وصلاحيات المسؤولين الأساسية.</p>
                            </div>
                            <button class="mt-8 w-full py-3 bg-[#1a1b24] hover:bg-[#232430] text-white rounded-2xl font-bold text-sm transition border border-purple-500/15">تعديل الإعدادات</button>
                        </div>

                    </div>
                </main>
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