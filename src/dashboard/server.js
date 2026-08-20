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
    // الصفحة الرئيسية (بتصميم ProBot وألوان بنفسجية فخمة)
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
                    body { background-color: #121317; color: #ffffff; font-family: 'Cairo', sans-serif; overflow-x: hidden; }
                    .glow-effect {
                        position: absolute;
                        width: 500px;
                        height: 500px;
                        background: radial-gradient(circle, rgba(147, 51, 234, 0.15) 0%, rgba(18, 19, 23, 0) 70%);
                        z-index: 0;
                        pointer-events: none;
                    }
                    .dropdown:hover .dropdown-menu { display: block; }
                </style>
            </head>
            <body class="min-h-screen flex flex-col relative overflow-hidden">
                
                <!-- تأثيرات الإضاءة البنفسجية بالخلفية -->
                <div class="glow-effect top-[-100px] right-[-100px]"></div>
                <div class="glow-effect bottom-[-100px] left-[-100px]"></div>

                <!-- الشريط العلوي -->
                <nav class="flex items-center justify-between px-6 md:px-16 py-5 z-10 border-b border-[#23242a]/50 backdrop-blur-md">
                    <!-- اللوجو وصورة البوت -->
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-600/30 text-white font-black text-2xl border border-purple-400/30">Z</div>
                        <span class="font-black text-2xl tracking-wide bg-gradient-to-r from-white via-purple-200 to-purple-400 bg-clip-text text-transparent">ZENO</span>
                    </div>

                    <!-- الروابط والقوائم -->
                    <div class="hidden md:flex items-center gap-8 text-gray-300 font-semibold text-sm">
                        
                        <!-- قائمة المميزات -->
                        <div class="relative dropdown group py-2">
                            <button class="flex items-center gap-1 hover:text-purple-400 transition">
                                المميزات 
                                <svg class="w-4 h-4 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                            </button>
                            <div class="dropdown-menu hidden absolute top-full right-0 w-56 bg-[#1a1b20] border border-[#2a2b33] rounded-xl shadow-2xl p-2 z-50">
                                <a href="#" class="block px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-purple-600/20 rounded-lg transition">🎫 نظام التذاكر المتقدمة</a>
                                <a href="#" class="block px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-purple-600/20 rounded-lg transition">👋 رسائل الترحيب والمغادرة</a>
                                <a href="#" class="block px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-purple-600/20 rounded-lg transition">🛡️ نظام الحماية والإشراف</a>
                            </div>
                        </div>

                        <!-- قائمة المصادر ودعم فني -->
                        <div class="relative dropdown group py-2">
                            <button class="flex items-center gap-1 hover:text-purple-400 transition">
                                المصادر
                                <svg class="w-4 h-4 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                            </button>
                            <div class="dropdown-menu hidden absolute top-full right-0 w-56 bg-[#1a1b20] border border-[#2a2b33] rounded-xl shadow-2xl p-2 z-50">
                                <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="block px-4 py-2 text-sm text-purple-400 hover:bg-purple-600/20 rounded-lg transition font-bold">💬 سيرفر الدعم الفني</a>
                                <a href="#" class="block px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-purple-600/20 rounded-lg transition">📚 المستندات والأوامر</a>
                            </div>
                        </div>

                        <a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="hover:text-purple-400 transition">الدعم الفني</a>
                    </div>

                    <!-- زر تسجيل الدخول / بروفايل المستخدم -->
                    <div class="z-10">
                        ${user
                    ? `<a href="/dashboard"><img src="${user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-11 h-11 rounded-full border-2 border-purple-500 hover:scale-105 transition shadow-lg shadow-purple-500/20 cursor-pointer"></a>`
                    : `<a href="/auth/discord" class="text-sm font-bold bg-[#5865F2] hover:bg-[#4752C4] text-white px-6 py-2.5 rounded-xl transition shadow-lg shadow-[#5865F2]/30 flex items-center gap-2">تسجيل الدخول</a>`
                }
                    </div>
                </nav>

                <!-- المحتوى الرئيسي -->
                <main class="flex-1 flex flex-col items-center justify-center px-4 text-center pb-24 z-10 mt-10">
                    <span class="bg-purple-600/10 border border-purple-500/30 text-purple-300 px-5 py-1.5 rounded-full text-xs font-bold mb-8 shadow-inner">✨ جديد: نظام التذاكر واحترافية الإدارة</span>
                    
                    <h1 class="text-4xl md:text-6xl font-black mb-6 leading-tight tracking-tight">
                        اصنع خادم ديسكورد <br> <span class="bg-gradient-to-r from-purple-400 via-indigo-400 to-purple-600 bg-clip-text text-transparent">احترافي ومتكامل!</span>
                    </h1>
                    
                    <p class="text-gray-400 mb-10 max-w-xl mx-auto leading-relaxed text-sm md:text-base font-medium">
                        بوت متعدد الأغراض قابل للتخصيص بشكل كامل، يوفر لك نظام تذاكر متطور، رسائل ترحيبية، سجلات دقيقة، وأدوات إشراف فائقة السرعة.
                    </p>
                    
                    <!-- الأزرار -->
                    <div class="flex flex-col sm:flex-row gap-4 items-center justify-center w-full sm:w-auto">
                        <a href="/dashboard" class="px-8 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl font-bold transition text-white shadow-xl shadow-purple-600/30 w-full sm:w-auto text-sm">لوحة التحكم</a>
                        <a href="/auth/discord" class="px-8 py-3.5 bg-[#1a1b20] hover:bg-[#23242a] border border-[#2a2b33] rounded-xl font-bold transition flex items-center justify-center gap-2 w-full sm:w-auto text-sm text-gray-200">إضافة البوت في Discord</a>
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
    // لوحة التحكم (باستايل ProBot الاحترافي)
    // ==========================================
    app.get('/dashboard', (req, res) => {
        try {
            if (!req.session?.user) return res.redirect('/auth/discord');
            const user = req.session.user;
            const guilds = req.session.guilds || [];

            const userAvatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

            const guildsHtml = guilds.length > 0 ? guilds.map(guild => `
                <a href="/dashboard/${guild.id}" class="bg-[#18191e] border border-[#23242a] rounded-2xl p-5 flex items-center justify-between hover:border-purple-500/50 hover:bg-[#1a1b20] transition group shadow-lg">
                    <div class="flex items-center gap-4">
                        <img src="${guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-14 h-14 rounded-2xl bg-[#121317] border border-[#2a2b33]">
                        <div>
                            <h3 class="font-bold text-white group-hover:text-purple-400 transition text-lg">${guild.name}</h3>
                            <p class="text-xs text-gray-500 mt-1">مدير السيرفر</p>
                        </div>
                    </div>
                    <div class="bg-[#23242a] p-3 rounded-xl text-gray-400 group-hover:bg-purple-600 group-hover:text-white transition shadow">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                    </div>
                </a>
            `).join('') : '<p class="text-gray-400">لا توجد سيرفرات تمتلك صلاحيات الإدارة فيها.</p>';

            res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>لوحة التحكم | ZENO</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
                <style>
                    body { background-color: #121317; color: #d1d5db; font-family: 'Cairo', sans-serif; overflow-x: hidden; }
                    .sidebar-bg { background-color: #18191e; border-left: 1px solid #23242a; }
                </style>
            </head>
            <body class="flex h-screen overflow-hidden">
                
                <!-- الشريط الجانبي المطابق لبروبوت -->
                <aside class="w-72 sidebar-bg h-full flex flex-col hidden md:flex">
                    <div class="p-6 border-b border-[#23242a] flex items-center gap-3">
                        <div class="w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center font-bold text-white text-xl shadow-md">Z</div>
                        <span class="font-black text-xl text-white tracking-wide">ZENO DASHBOARD</span>
                    </div>
                    
                    <div class="flex-1 overflow-y-auto p-4 space-y-6">
                        <!-- البروفايل -->
                        <div class="flex flex-col items-center bg-[#1f2026] p-4 rounded-2xl border border-[#2a2b33]">
                            <img src="${userAvatar}" class="w-20 h-20 rounded-full border-4 border-purple-500/30 mb-2 shadow-md">
                            <h2 class="font-bold text-white">${user.username}</h2>
                            <a href="/logout" class="text-xs text-red-400 hover:text-red-300 mt-2 font-semibold">تسجيل الخروج</a>
                        </div>

                        <!-- قائمة الخصائص -->
                        <div>
                            <h4 class="text-xs font-bold text-gray-500 mb-3 px-2">القائمة الرئيسية</h4>
                            <ul class="space-y-1.5">
                                <li><a href="/dashboard" class="flex items-center gap-3 px-3.5 py-2.5 text-sm text-white bg-purple-600 rounded-xl font-bold shadow-lg shadow-purple-600/20">🏠 اختيار السيرفر</a></li>
                                <li><a href="https://discord.gg/uxqQDtbVMz" target="_blank" class="flex items-center gap-3 px-3.5 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-[#1f2026] rounded-xl transition">💬 الدعم الفني</a></li>
                            </ul>
                        </div>
                    </div>
                </aside>

                <!-- المحتوى الرئيسي -->
                <main class="flex-1 h-full overflow-y-auto bg-[#121317] p-8 md:p-12">
                    <header class="flex justify-between items-center mb-10 border-b border-[#23242a] pb-6">
                        <div>
                            <h2 class="text-3xl font-extrabold text-white">اختيار السيرفر</h2>
                            <p class="text-gray-400 mt-1.5 text-sm">قم باختيار السيرفر الذي ترغب بإدارته وتعديل إعداداته بالكامل.</p>
                        </div>
                        <a href="/" class="text-sm bg-[#18191e] hover:bg-[#23242a] text-gray-300 px-4 py-2 rounded-xl border border-[#23242a] transition">الرئيسية</a>
                    </header>

                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
    // صفحة إدارة السيرفر (ستايل الإضافات والـ Modules المشابه لـ ProBot)
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
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
                <style>
                    body { background-color: #121317; color: #d1d5db; font-family: 'Cairo', sans-serif; }
                    .sidebar-bg { background-color: #18191e; border-left: 1px solid #23242a; }
                </style>
            </head>
            <body class="flex h-screen overflow-hidden">
                
                <!-- الشريط الجانبي للسيرفر (مطابق لصور بروبوت) -->
                <aside class="w-72 sidebar-bg h-full flex flex-col hidden md:flex overflow-y-auto">
                    <div class="p-5 border-b border-[#23242a] flex items-center gap-3">
                        <img src="${guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-10 h-10 rounded-xl">
                        <span class="font-bold text-white truncate">${guild.name}</span>
                    </div>

                    <div class="p-4 space-y-6 text-sm">
                        <div>
                            <span class="text-xs font-bold text-gray-500 px-2 block mb-2">عام</span>
                            <a href="#" class="flex items-center gap-3 px-3 py-2 bg-purple-600 text-white rounded-xl font-bold">⚙️ نظرة عامة</a>
                            <a href="#" class="flex items-center gap-3 px-3 py-2 text-gray-400 hover:text-white hover:bg-[#1f2026] rounded-xl transition">🔧 إعدادات السيرفر</a>
                            <a href="#" class="flex items-center gap-3 px-3 py-2 text-gray-400 hover:text-white hover:bg-[#1f2026] rounded-xl transition">💬 رسائل الإيمبد</a>
                        </div>

                        <div>
                            <span class="text-xs font-bold text-gray-500 px-2 block mb-2">قائمة الخصائص</span>
                            <a href="#" class="flex items-center justify-between px-3 py-2 text-gray-400 hover:text-white hover:bg-[#1f2026] rounded-xl transition">
                                <span>⚡ الأوامر العامة</span>
                                <span class="w-2 h-2 rounded-full bg-green-500"></span>
                            </a>
                            <a href="#" class="flex items-center justify-between px-3 py-2 text-gray-400 hover:text-white hover:bg-[#1f2026] rounded-xl transition">
                                <span>👋 الترحيب والمغادرة</span>
                                <span class="w-2 h-2 rounded-full bg-green-500"></span>
                            </a>
                            <a href="#" class="flex items-center justify-between px-3 py-2 text-gray-400 hover:text-white hover:bg-[#1f2026] rounded-xl transition">
                                <span>🎫 نظام التذاكر</span>
                                <span class="w-2 h-2 rounded-full bg-green-500"></span>
                            </a>
                            <a href="#" class="flex items-center justify-between px-3 py-2 text-gray-400 hover:text-white hover:bg-[#1f2026] rounded-xl transition">
                                <span>🛡️ الإشراف والحماية</span>
                                <span class="w-2 h-2 rounded-full bg-green-500"></span>
                            </a>
                        </div>
                    </div>
                </aside>

                <!-- المحتوى وإدارة الإضافات -->
                <main class="flex-1 h-full overflow-y-auto p-8 md:p-12">
                    <header class="flex justify-between items-center mb-10 border-b border-[#23242a] pb-6">
                        <div>
                            <h2 class="text-3xl font-bold text-white">إدارة الإضافات والوحدات</h2>
                            <p class="text-gray-400 mt-1 text-sm">تحكم بجميع إعدادات سيرفر ${guild.name} بسهولة تامة.</p>
                        </div>
                        <a href="/dashboard" class="px-5 py-2.5 bg-[#18191e] hover:bg-[#23242a] text-white rounded-xl border border-[#23242a] text-sm font-bold transition">العودة للسيرفرات</a>
                    </header>

                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div class="bg-[#18191e] border border-[#23242a] rounded-2xl p-6 flex flex-col justify-between hover:border-purple-500/40 transition">
                            <div>
                                <h3 class="font-bold text-white text-lg mb-2">🎫 نظام التذاكر</h3>
                                <p class="text-gray-400 text-xs leading-relaxed">إنشاء وتخصيص غرف الدعم الفني والتذاكر للأعضاء.</p>
                            </div>
                            <button class="mt-6 w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-sm transition">تعديل الإعدادات</button>
                        </div>

                        <div class="bg-[#18191e] border border-[#23242a] rounded-2xl p-6 flex flex-col justify-between hover:border-purple-500/40 transition">
                            <div>
                                <h3 class="font-bold text-white text-lg mb-2">👋 الترحيب التلقائي</h3>
                                <p class="text-gray-400 text-xs leading-relaxed">إرسال رسائل ترحيب مخصصة وصور للأعضاء الجدد.</p>
                            </div>
                            <button class="mt-6 w-full py-2.5 bg-[#23242a] hover:bg-[#2a2b33] text-white rounded-xl font-bold text-sm transition">تعديل الإعدادات</button>
                        </div>

                        <div class="bg-[#18191e] border border-[#23242a] rounded-2xl p-6 flex flex-col justify-between hover:border-purple-500/40 transition">
                            <div>
                                <h3 class="font-bold text-white text-lg mb-2">🛡️ الإشراف التلقائي</h3>
                                <p class="text-gray-400 text-xs leading-relaxed">حماية السيرفر من السبام والروابط الضارة والكلمات المسيئة.</p>
                            </div>
                            <button class="mt-6 w-full py-2.5 bg-[#23242a] hover:bg-[#2a2b33] text-white rounded-xl font-bold text-sm transition">تعديل الإعدادات</button>
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