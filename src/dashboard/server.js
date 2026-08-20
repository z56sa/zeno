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
                        position: absolute; width: 600px; height: 600px;
                        background: radial-gradient(circle, rgba(168, 85, 247, 0.12) 0%, rgba(11, 12, 16, 0) 70%);
                        z-index: 0; pointer-events: none;
                    }
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
                        <a href="/" class="hover:text-purple-400 transition">الرئيسية</a>
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
                    <span class="bg-purple-600/10 border border-purple-500/30 text-purple-300 px-5 py-2 rounded-full text-xs font-extrabold mb-8 shadow-inner tracking-wide">✨ لوحة تحكم متطورة بتصميم استثنائي</span>
                    <h1 class="text-4xl md:text-6xl font-black mb-6 leading-tight tracking-tight">
                        إدارة خادم ديسكورد الخاص بك <br> <span class="bg-gradient-to-r from-purple-400 via-indigo-300 to-purple-600 bg-clip-text text-transparent">بأعلى احترافية وسهولة!</span>
                    </h1>
                    <p class="text-gray-400 mb-10 max-w-xl mx-auto leading-relaxed text-sm md:text-base font-medium">
                        تحكم بكافة ميزات البوت، أنظمة التذاكر، الإشراف، والتنبيهات عبر لوحة تحكم تفاعلية وسريعة.
                    </p>
                    <div class="flex flex-col sm:flex-row gap-4 items-center justify-center w-full sm:w-auto">
                        <a href="/dashboard" class="px-8 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-2xl font-bold transition text-white shadow-xl shadow-purple-600/30 w-full sm:w-auto text-sm">لوحة التحكم</a>
                        <a href="/auth/discord" class="px-8 py-3.5 bg-[#13141b] hover:bg-[#1a1b24] border border-purple-500/20 rounded-2xl font-bold transition flex items-center justify-center gap-2 w-full sm:w-auto text-sm text-gray-200">تسجيل الدخول بـ Discord</a>
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
                <a href="/dashboard/${guild.id}" class="group relative bg-[#13141b]/90 border border-purple-500/15 hover:border-purple-500/60 rounded-3xl p-6 transition-all duration-300 hover:shadow-2xl hover:shadow-purple-600/20 flex flex-col justify-between overflow-hidden backdrop-blur-md">
                    <div class="absolute top-0 right-0 w-36 h-36 bg-purple-600/10 rounded-full blur-3xl group-hover:bg-purple-600/25 transition-all"></div>
                    <div class="flex items-center gap-4 relative z-10">
                        <img src="${guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-16 h-16 rounded-2xl bg-[#0b0c10] border-2 border-purple-500/30 shadow-lg object-cover">
                        <div class="text-right overflow-hidden">
                            <h3 class="font-bold text-white group-hover:text-purple-300 transition text-base truncate w-full">${guild.name}</h3>
                            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-500/10 text-purple-300 text-[11px] font-bold rounded-lg mt-1.5 border border-purple-500/20 shadow-sm">
                                <span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
                                صلاحية إدارية كاملة
                            </span>
                        </div>
                    </div>
                    <div class="mt-8 pt-4 border-t border-purple-500/10 flex items-center justify-between relative z-10 text-xs">
                        <span class="text-gray-400 group-hover:text-white transition font-semibold">الدخول لإدارة الإعدادات</span>
                        <div class="w-9 h-9 rounded-xl bg-purple-600/10 group-hover:bg-purple-600 text-purple-400 group-hover:text-white flex items-center justify-center transition shadow-md">
                            <svg class="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"></path></svg>
                        </div>
                    </div>
                </a>
            `).join('') : '<div class="col-span-full py-16 text-center text-gray-400 bg-[#13141b]/50 rounded-3xl border border-purple-500/10 font-semibold">لا توجد خوادم تمتلك صلاحيات الإدارة فيها حالياً.</div>';

            res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>اختر السيرفر | ZENO DASHBOARD</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                <style>body { background-color: #0b0c10; color: #d1d5db; font-family: 'Cairo', sans-serif; }</style>
            </head>
            <body class="min-h-screen flex flex-col relative">
                <header class="w-full px-6 md:px-16 py-4 border-b border-purple-900/20 backdrop-blur-xl bg-[#0b0c10]/90 sticky top-0 z-50 flex items-center justify-between shadow-lg">
                    <div class="flex items-center gap-4 z-10">
                        <a href="/" class="px-4 py-2 bg-[#13141b] hover:bg-[#1a1b24] text-gray-300 hover:text-white rounded-xl border border-purple-500/20 text-xs font-bold transition shadow">الرئيسية</a>
                        <div class="flex items-center gap-3.5 bg-[#13141b] px-3.5 py-1.5 rounded-2xl border border-purple-500/25 shadow-inner">
                            <span class="text-xs font-bold text-white hidden sm:inline">${user.username}</span>
                            <img src="${userAvatar}" class="w-8 h-8 rounded-full border border-purple-500/40 object-cover shadow">
                        </div>
                    </div>
                    <div class="flex items-center gap-3.5 z-10">
                        <div class="text-left">
                            <h1 class="font-black text-sm text-white tracking-wide">ZENO DASHBOARD</h1>
                            <p class="text-[10px] text-purple-400 font-extrabold">لوحة الإدارة المركزية</p>
                        </div>
                        <div class="w-10 h-10 bg-gradient-to-tr from-purple-700 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-600/30 text-white font-black text-xl border border-purple-400/40">Z</div>
                    </div>
                </header>
                <main class="flex-1 px-6 md:px-16 py-14 z-10 max-w-7xl mx-auto w-full">
                    <div class="mb-12 text-center">
                        <span class="px-4 py-1.5 bg-purple-600/10 text-purple-300 rounded-full text-xs font-bold border border-purple-500/20 mb-3 inline-block">خوادمك المتاحة</span>
                        <h2 class="text-3xl md:text-4xl font-black text-white tracking-tight">اختر السيرفر للبدء</h2>
                        <p class="text-gray-400 mt-2 text-sm font-medium">قم باختيار الخادم الذي تود التحكم بإعداداته وتخصيص ميزاته بالكامل.</p>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">${guildsHtml}</div>
                </main>
            </body>
            </html>
            `);
        } catch (error) {
            res.status(500).send("حدث خطأ في تحميل لوحة التحكم.");
        }
    });

    // ==========================================
    // صفحة إدارة السيرفر الداخلية (تصميم ProBoot الحقيقي: القائمة الجانبية يمين، المحتوى يسار)
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
            const guildIcon = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

            res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>إدارة ${guild.name} | ZENO DASHBOARD</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                <style>
                    body { background-color: #0b0c10; color: #d1d5db; font-family: 'Cairo', sans-serif; overflow-x: hidden; }
                    ::-webkit-scrollbar { width: 6px; }
                    ::-webkit-scrollbar-thumb { background: #232430; border-radius: 10px; }
                </style>
            </head>
            <body class="min-h-screen flex flex-col bg-[#0b0c10] text-gray-200">
                
                <!-- الهيدر العلوي تماماً مثل ProBoot -->
                <header class="w-full px-6 py-4 border-b border-purple-900/20 bg-[#13141b]/90 backdrop-blur-md sticky top-0 z-50 flex items-center justify-between shadow-lg">
                    <!-- جهة اليسار في النافبار: معلومات المستخدم وبوت ZENO -->
                    <div class="flex items-center gap-3 z-10">
                        <div class="flex items-center gap-2 bg-[#0b0c10] px-3.5 py-1.5 rounded-2xl border border-purple-500/20 shadow-inner">
                            <span class="text-xs font-bold text-white hidden sm:inline">ZENO DASHBOARD</span>
                            <div class="w-7 h-7 bg-gradient-to-tr from-purple-600 to-indigo-500 rounded-lg flex items-center justify-center text-white font-black text-xs shadow border border-purple-400/40">Z</div>
                        </div>
                        <img src="${userAvatar}" class="w-9 h-9 rounded-full border border-purple-500/30 object-cover shadow">
                    </div>

                    <!-- جهة اليمين في النافبار: زر العودة للخوادم واسم السيرفر الحالي -->
                    <div class="flex items-center gap-3.5 z-10">
                        <div class="flex items-center gap-2 bg-[#0b0c10]/80 px-3.5 py-1.5 rounded-xl border border-purple-500/15">
                            <img src="${guildIcon}" class="w-6 h-6 rounded-lg object-cover">
                            <span class="text-xs font-extrabold text-white truncate max-w-[140px]">${guild.name}</span>
                        </div>
                        <span class="text-purple-900 font-bold">/</span>
                        <a href="/dashboard" class="flex items-center gap-2 px-3.5 py-1.5 bg-[#13141b] hover:bg-[#1a1b24] text-gray-300 hover:text-white rounded-xl border border-purple-500/20 text-xs font-bold transition shadow">
                            <span>الخوادم</span>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                        </a>
                    </div>
                </header>

                <div class="flex-1 flex flex-col lg:flex-row-reverse">
                    
                    <!-- الشريط الجانبي (Sidebar) في اليمين مثل ProBot -->
                    <aside class="w-full lg:w-72 bg-[#101116] border-b lg:border-b-0 lg:border-r border-purple-900/15 p-5 flex flex-col gap-2 text-xs shrink-0">
                        <div class="text-[10px] text-gray-500 font-extrabold uppercase tracking-wider px-3 mb-1">الرئيسية</div>
                        <a href="/dashboard/${guildId}" class="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-purple-600/15 text-purple-300 font-bold border border-purple-500/20 shadow-sm">
                            <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-md shadow-emerald-400"></span>
                            <span>⚡ نظرة عامة</span>
                        </a>

                        <div class="text-[10px] text-gray-500 font-extrabold uppercase tracking-wider px-3 mt-4 mb-1">الإدارة والميزات</div>
                        <a href="#" class="flex items-center justify-end gap-2 px-3.5 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#161720] transition font-medium text-right">
                            <span>نظام التذاكر</span>
                            <span>🎫</span>
                        </a>
                        <a href="#" class="flex items-center justify-end gap-2 px-3.5 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#161720] transition font-medium text-right">
                            <span>رسائل الترحيب</span>
                            <span>👋</span>
                        </a>
                        <a href="#" class="flex items-center justify-end gap-2 px-3.5 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#161720] transition font-medium text-right">
                            <span>الحماية والأمان</span>
                            <span>🛡️</span>
                        </a>
                        <a href="#" class="flex items-center justify-end gap-2 px-3.5 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#161720] transition font-medium text-right">
                            <span>السجلات (Logs)</span>
                            <span>📊</span>
                        </a>
                        <a href="/dashboard/${guildId}/fun" class="flex items-center justify-end gap-2 px-3.5 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#161720] transition font-medium text-right">
                            <span>التسلية والألعاب</span>
                            <span>🎮</span>
                        </a>
                    </aside>

                    <!-- المحتوى الرئيسي -->
                    <main class="flex-1 p-6 md:p-10 z-10 max-w-6xl text-right">
                        
                        <!-- بانر العنوان -->
                        <div class="flex flex-col md:flex-row-reverse items-start md:items-center justify-between gap-4 mb-10 bg-gradient-to-l from-[#13141b] to-[#101116] border border-purple-500/15 p-6 rounded-3xl shadow-xl relative overflow-hidden">
                            <div class="absolute top-0 left-0 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>
                            <div>
                                <h2 class="text-xl font-black text-white flex items-center justify-end gap-2">
                                    <span>لوحة إعدادات الخادم</span>
                                    <span>⚙️</span>
                                </h2>
                                <p class="text-gray-400 text-xs mt-1 font-medium">تحكم في إعدادات التذاكر، الحماية، السجلات، والعديد من الخصائص المتقدمة.</p>
                            </div>
                            <div class="w-full md:w-72">
                                <input type="text" placeholder="ابحث عن ميزة أو إعداد..." class="w-full bg-[#0b0c10] border border-purple-500/20 focus:border-purple-500 rounded-2xl px-4 py-3 text-xs text-gray-200 outline-none transition shadow-inner text-right">
                            </div>
                        </div>

                        <!-- أقسام التحكم السريع -->
                        <div class="mb-12">
                            <div class="flex items-center justify-between mb-4">
                                <span class="text-[11px] text-gray-500 font-bold">كل الوحدات مفعلة</span>
                                <h3 class="text-xs font-extrabold text-purple-400 uppercase tracking-widest">أقسام التحكم السريع</h3>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                <div class="bg-[#13141b] border border-purple-500/15 hover:border-purple-500/40 rounded-2xl p-5 flex flex-col justify-between transition-all group shadow-lg">
                                    <div>
                                        <div class="flex items-center justify-between mb-3">
                                            <span class="p-2 bg-purple-600/10 rounded-xl text-purple-400 group-hover:scale-110 transition-transform">👁️</span>
                                            <h4 class="font-bold text-white text-sm">نظرة عامة</h4>
                                        </div>
                                        <p class="text-gray-400 text-[11px] mb-6 leading-relaxed font-medium">عرض احصائيات سريعة عن السيرفر وحالة البوت والنشاط العام.</p>
                                    </div>
                                    <button class="w-full py-2.5 bg-[#1a1b24] hover:bg-purple-600 hover:text-white text-gray-300 rounded-xl font-bold text-xs transition border border-purple-500/10 shadow-sm">إدارة القسم</button>
                                </div>

                                <div class="bg-[#13141b] border border-purple-500/15 hover:border-purple-500/40 rounded-2xl p-5 flex flex-col justify-between transition-all group shadow-lg">
                                    <div>
                                        <div class="flex items-center justify-between mb-3">
                                            <span class="p-2 bg-indigo-600/10 rounded-xl text-indigo-400 group-hover:scale-110 transition-transform">🎫</span>
                                            <h4 class="font-bold text-white text-sm">نظام التذاكر</h4>
                                        </div>
                                        <p class="text-gray-400 text-[11px] mb-6 leading-relaxed font-medium">تخصيص رسالة التذاكر، أزرار الفتح، ورتب الدعم الفني المسؤولة.</p>
                                    </div>
                                    <button class="w-full py-2.5 bg-[#1a1b24] hover:bg-indigo-600 hover:text-white text-gray-300 rounded-xl font-bold text-xs transition border border-purple-500/10 shadow-sm">تعديل التذاكر</button>
                                </div>

                                <a href="/dashboard/${guildId}/fun" class="bg-[#13141b] border border-purple-500/15 hover:border-purple-500/40 rounded-2xl p-5 flex flex-col justify-between transition-all group shadow-lg cursor-pointer">
                                    <div>
                                        <div class="flex items-center justify-between mb-3">
                                            <span class="p-2 bg-pink-600/10 rounded-xl text-pink-400 group-hover:scale-110 transition-transform">🎮</span>
                                            <h4 class="font-bold text-white text-sm">التسلية والألعاب</h4>
                                        </div>
                                        <p class="text-gray-400 text-[11px] mb-6 leading-relaxed font-medium">روليت، كراسي موسيقية، غميضة، مافيا وألعاب تفاعلية ممتعة للسيرفر.</p>
                                    </div>
                                    <div class="w-full py-2.5 bg-[#1a1b24] group-hover:bg-pink-600 group-hover:text-white text-gray-300 rounded-xl font-bold text-xs transition border border-purple-500/10 shadow-sm text-center">إدارة الألعاب</div>
                                </a>

                                <div class="bg-[#13141b] border border-purple-500/15 hover:border-purple-500/40 rounded-2xl p-5 flex flex-col justify-between transition-all group shadow-lg">
                                    <div>
                                        <div class="flex items-center justify-between mb-3">
                                            <span class="p-2 bg-emerald-600/10 rounded-xl text-emerald-400 group-hover:scale-110 transition-transform">🛡️</span>
                                            <h4 class="font-bold text-white text-sm">الترحيب والإشراف</h4>
                                        </div>
                                        <p class="text-gray-400 text-[11px] mb-6 leading-relaxed font-medium">ضبط رسائل الترحيب للأعضاء الجدد وإعدادات الحماية التلقائية.</p>
                                    </div>
                                    <button class="w-full py-2.5 bg-[#1a1b24] hover:bg-emerald-600 hover:text-white text-gray-300 rounded-xl font-bold text-xs transition border border-purple-500/10 shadow-sm">تخصيص الإشراف</button>
                                </div>
                            </div>
                        </div>

                    </main>

                </div>
            </body>
            </html>
            `);
        } catch (error) {
            res.redirect('/dashboard');
        }
    });

    // ==========================================
    // صفحة التسلية والألعاب (مثل ProBot تماماً)
    // ==========================================
    app.get('/dashboard/:guildId/fun', (req, res) => {
        try {
            if (!req.session?.user) return res.redirect('/auth/discord');
            const guildId = req.params.guildId;
            const guilds = req.session.guilds || [];
            const guild = guilds.find(g => g.id === guildId);
            const user = req.session.user;

            if (!guild) return res.redirect('/dashboard');

            const userAvatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
            const guildIcon = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

            res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>التسلية | ${guild.name} | ZENO</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                <style>
                    body { background-color: #0b0c10; color: #d1d5db; font-family: 'Cairo', sans-serif; overflow-x: hidden; }
                    ::-webkit-scrollbar { width: 6px; }
                    ::-webkit-scrollbar-thumb { background: #232430; border-radius: 10px; }
                    .toggle { position: relative; display: inline-block; width: 44px; height: 24px; }
                    .toggle input { opacity: 0; width: 0; height: 0; }
                    .slider { position: absolute; cursor: pointer; inset: 0; background: #2d2e3b; border-radius: 24px; transition: .3s; }
                    .slider:before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .3s; }
                    input:checked + .slider { background: #7c3aed; }
                    input:checked + .slider:before { transform: translateX(20px); }
                    .tab-btn { transition: all 0.2s; border-bottom: 2px solid transparent; }
                    .tab-btn.active { color: #a855f7; border-bottom-color: #a855f7; }
                    .tab-content { display: none; }
                    .tab-content.active { display: block; }
                    .game-card { transition: all 0.2s; }
                    .game-card:hover { border-color: rgba(168,85,247,0.4); transform: translateY(-2px); }
                </style>
            </head>
            <body class="min-h-screen flex flex-col bg-[#0b0c10] text-gray-200">

                <!-- الهيدر -->
                <header class="w-full px-6 py-4 border-b border-purple-900/20 bg-[#13141b]/90 backdrop-blur-md sticky top-0 z-50 flex items-center justify-between shadow-lg">
                    <div class="flex items-center gap-3 z-10">
                        <div class="flex items-center gap-2 bg-[#0b0c10] px-3.5 py-1.5 rounded-2xl border border-purple-500/20 shadow-inner">
                            <span class="text-xs font-bold text-white hidden sm:inline">ZENO DASHBOARD</span>
                            <div class="w-7 h-7 bg-gradient-to-tr from-purple-600 to-indigo-500 rounded-lg flex items-center justify-center text-white font-black text-xs shadow border border-purple-400/40">Z</div>
                        </div>
                        <img src="${userAvatar}" class="w-9 h-9 rounded-full border border-purple-500/30 object-cover shadow">
                    </div>
                    <div class="flex items-center gap-3.5 z-10">
                        <div class="flex items-center gap-2 bg-[#0b0c10]/80 px-3.5 py-1.5 rounded-xl border border-purple-500/15">
                            <img src="${guildIcon}" class="w-6 h-6 rounded-lg object-cover">
                            <span class="text-xs font-extrabold text-white truncate max-w-[140px]">${guild.name}</span>
                        </div>
                        <span class="text-purple-900 font-bold">/</span>
                        <a href="/dashboard/${guildId}" class="flex items-center gap-2 px-3.5 py-1.5 bg-[#13141b] hover:bg-[#1a1b24] text-gray-300 hover:text-white rounded-xl border border-purple-500/20 text-xs font-bold transition shadow">
                            <span>الإعدادات</span>
                        </a>
                        <a href="/dashboard" class="flex items-center gap-2 px-3.5 py-1.5 bg-[#13141b] hover:bg-[#1a1b24] text-gray-300 hover:text-white rounded-xl border border-purple-500/20 text-xs font-bold transition shadow">
                            <span>الخوادم</span>
                        </a>
                    </div>
                </header>

                <div class="flex-1 flex flex-col lg:flex-row-reverse">

                    <!-- الشريط الجانبي -->
                    <aside class="w-full lg:w-72 bg-[#101116] border-b lg:border-b-0 lg:border-r border-purple-900/15 p-5 flex flex-col gap-2 text-xs shrink-0">
                        <div class="text-[10px] text-gray-500 font-extrabold uppercase tracking-wider px-3 mb-1">الرئيسية</div>
                        <a href="/dashboard/${guildId}" class="flex items-center justify-end gap-2 px-3.5 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#161720] transition font-medium text-right">
                            <span>نظرة عامة</span>
                            <span>⚡</span>
                        </a>
                        <div class="text-[10px] text-gray-500 font-extrabold uppercase tracking-wider px-3 mt-4 mb-1">الإدارة والميزات</div>
                        <a href="#" class="flex items-center justify-end gap-2 px-3.5 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#161720] transition font-medium text-right">
                            <span>نظام التذاكر</span><span>🎫</span>
                        </a>
                        <a href="#" class="flex items-center justify-end gap-2 px-3.5 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#161720] transition font-medium text-right">
                            <span>رسائل الترحيب</span><span>👋</span>
                        </a>
                        <a href="#" class="flex items-center justify-end gap-2 px-3.5 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#161720] transition font-medium text-right">
                            <span>الحماية والأمان</span><span>🛡️</span>
                        </a>
                        <a href="#" class="flex items-center justify-end gap-2 px-3.5 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#161720] transition font-medium text-right">
                            <span>السجلات (Logs)</span><span>📊</span>
                        </a>
                        <a href="/dashboard/${guildId}/fun" class="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-purple-600/15 text-purple-300 font-bold border border-purple-500/20 shadow-sm">
                            <span class="w-2 h-2 rounded-full bg-pink-400 shadow-md shadow-pink-400"></span>
                            <span>🎮 التسلية والألعاب</span>
                        </a>
                    </aside>

                    <!-- المحتوى الرئيسي -->
                    <main class="flex-1 p-6 md:p-10 z-10 text-right">

                        <!-- عنوان الصفحة مع toggle رئيسي -->
                        <div class="flex flex-col md:flex-row-reverse items-start md:items-center justify-between gap-4 mb-8">
                            <div class="text-right">
                                <h2 class="text-2xl font-black text-white">التسلية</h2>
                                <p class="text-gray-400 text-xs mt-1">يضيف متعة إلى سيرفرك بميزات مثيرة مثل الروليت وكت تويت، مع المزيد من الألعاب في الطريق.</p>
                            </div>
                            <label class="toggle">
                                <input type="checkbox" checked onchange="toggleFun(this)">
                                <span class="slider"></span>
                            </label>
                        </div>

                        <!-- تبويبات مثل ProBot -->
                        <div class="border-b border-purple-900/20 mb-8 flex gap-6 justify-end">
                            <button onclick="switchTab('fun-tab')" class="tab-btn active pb-3 text-sm font-bold" id="btn-fun">الألعاب</button>
                            <button onclick="switchTab('mini-tab')" class="tab-btn pb-3 text-sm font-bold text-gray-400" id="btn-mini">الألعاب الصغيرة</button>
                            <button onclick="switchTab('cat-tab')" class="tab-btn pb-3 text-sm font-bold text-gray-400" id="btn-cat">كك تويت</button>
                        </div>

                        <!-- تبويب: الألعاب الرئيسية -->
                        <div id="fun-tab" class="tab-content active">
                            <!-- قسم الألعاب -->
                            <div class="bg-[#13141b]/80 border border-purple-500/10 rounded-2xl p-6 mb-6">
                                <h3 class="text-base font-black text-white mb-5 text-right">الألعاب</h3>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

                                    <!-- روليت -->
                                    <div class="game-card bg-[#0f1016] border border-purple-500/10 rounded-xl p-4 flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 bg-[#1a1b24] rounded-xl flex items-center justify-center text-xl">🎰</div>
                                            <span class="font-bold text-white text-sm">روليت</span>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <button class="text-gray-500 hover:text-purple-400 transition p-1.5 hover:bg-purple-500/10 rounded-lg">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                            </button>
                                            <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        </div>
                                    </div>

                                    <!-- الكراسي الموسيقية -->
                                    <div class="game-card bg-[#0f1016] border border-purple-500/10 rounded-xl p-4 flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 bg-[#1a1b24] rounded-xl flex items-center justify-center text-xl">🪑</div>
                                            <span class="font-bold text-white text-sm">الكراسي</span>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <button class="text-gray-500 hover:text-purple-400 transition p-1.5 hover:bg-purple-500/10 rounded-lg">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                            </button>
                                            <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        </div>
                                    </div>

                                    <!-- الغميضة -->
                                    <div class="game-card bg-[#0f1016] border border-purple-500/10 rounded-xl p-4 flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 bg-[#1a1b24] rounded-xl flex items-center justify-center text-xl">🙈</div>
                                            <span class="font-bold text-white text-sm">الغميضة</span>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <button class="text-gray-500 hover:text-purple-400 transition p-1.5 hover:bg-purple-500/10 rounded-lg">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                            </button>
                                            <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        </div>
                                    </div>

                                    <!-- مافيا -->
                                    <div class="game-card bg-[#0f1016] border border-purple-500/10 rounded-xl p-4 flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 bg-[#1a1b24] rounded-xl flex items-center justify-center text-xl">🔫</div>
                                            <span class="font-bold text-white text-sm">مافيا</span>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <button class="text-gray-500 hover:text-purple-400 transition p-1.5 hover:bg-purple-500/10 rounded-lg">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                            </button>
                                            <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                        </div>
                                    </div>

                                </div>
                            </div>

                            <!-- قسم الأوامر -->
                            <div class="bg-[#13141b]/80 border border-purple-500/10 rounded-2xl p-6">
                                <h3 class="text-base font-black text-white mb-5 text-right">الأوامر</h3>
                                <div class="flex flex-col gap-3">

                                    <!-- points -->
                                    <div class="bg-[#0f1016] border border-purple-500/10 rounded-xl p-4 flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <div class="w-8 h-8 bg-[#1a1b24] rounded-lg flex items-center justify-center text-purple-400">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                            </div>
                                            <button class="text-gray-500 hover:text-purple-400 transition p-1.5 hover:bg-purple-500/10 rounded-lg">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                            </button>
                                        </div>
                                        <div class="text-right flex-1 mx-4">
                                            <p class="font-bold text-white text-sm">roulette</p>
                                            <p class="text-gray-500 text-xs">لعبة الروليت - البوت يختار ضحية عشوائية من السيرفر!</p>
                                        </div>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>

                                    <!-- game stop -->
                                    <div class="bg-[#0f1016] border border-purple-500/10 rounded-xl p-4 flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <div class="w-8 h-8 bg-[#1a1b24] rounded-lg flex items-center justify-center text-purple-400">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                            </div>
                                            <button class="text-gray-500 hover:text-purple-400 transition p-1.5 hover:bg-purple-500/10 rounded-lg">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                            </button>
                                        </div>
                                        <div class="text-right flex-1 mx-4">
                                            <p class="font-bold text-white text-sm">mafia</p>
                                            <p class="text-gray-500 text-xs">لعبة المافيا الاجتماعية مع توزيع أدوار سرية لكل لاعب!</p>
                                        </div>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>

                                    <div class="bg-[#0f1016] border border-purple-500/10 rounded-xl p-4 flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <div class="w-8 h-8 bg-[#1a1b24] rounded-lg flex items-center justify-center text-purple-400">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                            </div>
                                            <button class="text-gray-500 hover:text-purple-400 transition p-1.5 hover:bg-purple-500/10 rounded-lg">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                            </button>
                                        </div>
                                        <div class="text-right flex-1 mx-4">
                                            <p class="font-bold text-white text-sm">chairs</p>
                                            <p class="text-gray-500 text-xs">الكراسي الموسيقية - ينضم اللاعبون ويُحذف من لم يحصل على كرسي!</p>
                                        </div>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>

                                    <div class="bg-[#0f1016] border border-purple-500/10 rounded-xl p-4 flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <div class="w-8 h-8 bg-[#1a1b24] rounded-lg flex items-center justify-center text-purple-400">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                            </div>
                                            <button class="text-gray-500 hover:text-purple-400 transition p-1.5 hover:bg-purple-500/10 rounded-lg">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                            </button>
                                        </div>
                                        <div class="text-right flex-1 mx-4">
                                            <p class="font-bold text-white text-sm">hideseek</p>
                                            <p class="text-gray-500 text-xs">لعبة الغميضة - شخص يختبئ والباقون يبحثون عنه!</p>
                                        </div>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>

                                </div>
                            </div>
                        </div>

                        <!-- تبويب: الألعاب الصغيرة -->
                        <div id="mini-tab" class="tab-content">
                            <div class="bg-[#13141b]/80 border border-purple-500/10 rounded-2xl p-6">
                                <h3 class="text-base font-black text-white mb-5 text-right">الألعاب الصغيرة</h3>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div class="game-card bg-[#0f1016] border border-purple-500/10 rounded-xl p-4 flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 bg-[#1a1b24] rounded-xl flex items-center justify-center text-xl">🎲</div>
                                            <span class="font-bold text-white text-sm">النرد</span>
                                        </div>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="game-card bg-[#0f1016] border border-purple-500/10 rounded-xl p-4 flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 bg-[#1a1b24] rounded-xl flex items-center justify-center text-xl">🪙</div>
                                            <span class="font-bold text-white text-sm">قلب عملة</span>
                                        </div>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="game-card bg-[#0f1016] border border-purple-500/10 rounded-xl p-4 flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 bg-[#1a1b24] rounded-xl flex items-center justify-center text-xl">🔢</div>
                                            <span class="font-bold text-white text-sm">خمّن الرقم</span>
                                        </div>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="game-card bg-[#0f1016] border border-purple-500/10 rounded-xl p-4 flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 bg-[#1a1b24] rounded-xl flex items-center justify-center text-xl">✂️</div>
                                            <span class="font-bold text-white text-sm">حجر ورقة مقص</span>
                                        </div>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- تبويب: كك تويت -->
                        <div id="cat-tab" class="tab-content">
                            <div class="bg-[#13141b]/80 border border-purple-500/10 rounded-2xl p-6">
                                <h3 class="text-base font-black text-white mb-2 text-right">كك تويت 🐱</h3>
                                <p class="text-gray-400 text-xs mb-6">أوامر ممتعة مع صور وردود فعل!</p>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div class="game-card bg-[#0f1016] border border-purple-500/10 rounded-xl p-4 flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 bg-[#1a1b24] rounded-xl flex items-center justify-center text-xl">🐱</div>
                                            <span class="font-bold text-white text-sm">صورة قطة</span>
                                        </div>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="game-card bg-[#0f1016] border border-purple-500/10 rounded-xl p-4 flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 bg-[#1a1b24] rounded-xl flex items-center justify-center text-xl">🐶</div>
                                            <span class="font-bold text-white text-sm">صورة كلب</span>
                                        </div>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="game-card bg-[#0f1016] border border-purple-500/10 rounded-xl p-4 flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 bg-[#1a1b24] rounded-xl flex items-center justify-center text-xl">😂</div>
                                            <span class="font-bold text-white text-sm">نكتة عشوائية</span>
                                        </div>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                    <div class="game-card bg-[#0f1016] border border-purple-500/10 rounded-xl p-4 flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 bg-[#1a1b24] rounded-xl flex items-center justify-center text-xl">🔮</div>
                                            <span class="font-bold text-white text-sm">توقع المستقبل</span>
                                        </div>
                                        <label class="toggle"><input type="checkbox" checked><span class="slider"></span></label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- زر الحفظ -->
                        <div class="mt-8 flex justify-start">
                            <button onclick="saveSettings()" class="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-2xl transition shadow-xl shadow-purple-600/30 text-sm">
                                💾 حفظ الإعدادات
                            </button>
                        </div>

                    </main>
                </div>

                <script>
                    function switchTab(tabId) {
                        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                        document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.classList.add('text-gray-400'); });
                        document.getElementById(tabId).classList.add('active');
                        const btnMap = { 'fun-tab': 'btn-fun', 'mini-tab': 'btn-mini', 'cat-tab': 'btn-cat' };
                        const btn = document.getElementById(btnMap[tabId]);
                        btn.classList.add('active');
                        btn.classList.remove('text-gray-400');
                    }

                    function toggleFun(el) {
                        const allToggles = document.querySelectorAll('.toggle input');
                        allToggles.forEach(t => { if (t !== el) t.checked = el.checked; });
                    }

                    function saveSettings() {
                        const btn = event.target;
                        btn.textContent = '✅ تم الحفظ!';
                        btn.classList.add('from-emerald-600', 'to-emerald-500');
                        btn.classList.remove('from-purple-600', 'to-indigo-600');
                        setTimeout(() => {
                            btn.textContent = '💾 حفظ الإعدادات';
                            btn.classList.remove('from-emerald-600', 'to-emerald-500');
                            btn.classList.add('from-purple-600', 'to-indigo-600');
                        }, 2000);
                    }
                </script>
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