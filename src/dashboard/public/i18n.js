/**
 * @file i18n.js
 * @description Localization module for ZENO Dashboard (Arabic & English)
 * Features:
 * - Dynamic dictionary mapping English translations to all Arabic texts and phrases
 * - Automatically translates full DOM text nodes, attribute labels, and headings
 * - Detects device language (navigator.language)
 * - Switch button toggles between Arabic and English instantly
 * - Flips direction (RTL for Arabic, LTR for English)
 */

(function () {
    const dictionary = {
        // Top Navbar & Actions
        "لوحة التحكم": "Dashboard",
        "الرجوع للوحة التحكم": "Back to Dashboard",
        "تسجيل الخروج": "Logout",
        "الدعم الفني": "Support Server",
        "سيرفر الدعم": "Support Server",
        "المميزات والأنظمة": "Features & Systems",
        "حفظ التغييرات": "Save Changes",
        "تم الحفظ وتطبيق التغييرات في السيرفر بنجاح!": "Settings saved and applied to Discord successfully!",
        "البوت متصل ويعمل": "Bot is online & active",
        "يتم تطبيق كل التعديلات وحفظها مباشرة في سيرفر الديسكورد لحظياً بدون إعادة تشغيل.": "Changes are applied and saved directly to Discord in real-time.",
        
        // Page Titles (sectionTitles)
        "نظرة عامة على السيرفر": "Server Overview",
        "نظرة عامة على السيرفر 📊": "Server Overview 📊",
        "الإحصائيات والتحليلات 📊": "Analytics & Stats 📊",
        "الإحصائيات والتحليلات": "Analytics & Stats",
        "مظهر وتخصيص البوت 🎨": "Bot Appearance & Customization 🎨",
        "مظهر وتخصيص البوت": "Bot Appearance & Customization",
        "إعدادات السيرفر العامة ⚙️": "General Server Settings ⚙️",
        "إعدادات السيرفر العامة": "General Server Settings",
        "جميع الأوامر والخدمات ⌨️": "All Commands & Services ⌨️",
        "مركز إدارة الأوامر الشامل ⌨️": "Comprehensive Commands Center ⌨️",
        "الإشراف وإدارة الأعضاء 🔨": "Moderation & Members Management 🔨",
        "الرقابة التلقائية وفلاتر السب والشات 🤖": "AutoMod Rules & Chat Filters 🤖",
        "رسائل وبطاقات الترحيب والمغادرة 👋": "Welcome & Leave Messages 👋",
        "الرد التلقائي على الكلمات 💬": "Auto Responder on Words 💬",
        "نظام التذاكر والدعم الفني 🎫": "Ticket & Support System 🎫",
        "جدار الحماية الشامل ومكافحة التخريب 🛡️": "Comprehensive Shield & Anti-Nuke 🛡️",
        "الحماية / القائمة البيضاء ⚪": "Security / Whitelist ⚪",
        "الحماية / السجلات 📋": "Security / Logs 📋",
        "نظام مكافحة الغزو والأعضاء الوهميين 🚨": "Anti-Raid & Fake Accounts 🚨",
        "تتبع نشاط الإدارة والمشرفين 👮": "Staff & Moderator Activity Tracking 👮",
        "نظام الرومات الصوتية المؤقتة 🕒": "Temp Voice Channels 🕒",
        "نظام تنبيهات ومعلومات البوست 💎": "Server Boost Notifications 💎",
        "نظام رتب الألوان المتقدم 🎨": "Advanced Color Roles System 🎨",
        "سجلات السيرفر الشاملة 📜": "Comprehensive Server Logs 📜",
        "نظام المستويات والخبرة XP 🏆": "Levels & XP System 🏆",
        "الرتب التلقائية عند الانضمام 🎖️": "Auto Roles on Join 🎖️",
        "نظام مسابقات القيف اواي 🎁": "Giveaways System 🎁",
        "نظام الاقتراحات والشكاوي 💡": "Suggestions & Feedback System 💡",
        "متتبع الدعوات المتقدم (Invite Tracker) 🔗": "Advanced Invite Tracker 🔗",
        "نظام الإعلانات والمذيع الآلي 📢": "Broadcast System 📢",
        "صانع رسائل الإيمبد المتقدم 📄": "Advanced Embed Builder 📄",
        "القرآن الكريم والإذاعات الإسلامية 🕌": "Quran Radio & Islamic Content 🕌",
        "نظام التقديمات والتوظيف 📝": "Staff Applications System 📝",
        "لوحة الإعدادات ⚙️": "Settings Panel ⚙️",

        // Overview Metric Cards
        "بوستات السيرفر": "Server Boosts",
        "إجمالي القنوات": "Total Channels",
        "الأعضاء المتصلون": "Online Members",
        "إجمالي الأعضاء": "Total Members",
        "إجمالي الرتب": "Total Roles",
        "الإيموجيات المخصصة": "Custom Emojis",
        "عدد البوتات": "Bots Count",
        "إجمالي القيف اوايز": "Total Giveaways",
        "معلومات السيرفر": "Server Information",
        "تاريخ إنشاء السيرفر": "Server Creation Date",
        "مستوى البوست": "Boost Level",
        "رابط السيرفر المخصص": "Vanity URL",
        "مستوى التحقق": "Verification Level",
        "لا يوجد": "None",
        "منخفض": "Low",
        "متوسط": "Medium",
        "عالي": "High",
        "عالي جداً": "Very High",
        "مستوى": "Level",

        // Quick Actions & Widgets
        "الإجراءات السريعة": "Quick Actions",
        "إدارة الأوامر": "Manage Commands",
        "إعدادات الإشراف": "Moderation Settings",
        "نظام الحماية": "Protection System",
        "أكثر الأعضاء نشاطاً": "Top Active Members",
        "عرض الكل": "View All",
        "قنوات الإحصائيات": "Stat Channels",
        "مؤشرات تفاعل السيرفر": "Server Engagement Indicators",
        "القنوات النصية": "Text Channels",
        "القنوات الصوتية": "Voice Channels",
        "الرتب المسجلة": "Recorded Roles",
        "اقتراح": "Suggestion",
        "قناة": "Channel",

        // Sidebar & Groups
        "الأخيرة": "Recent",
        "الرسائل والأمبد": "Messages & Embeds",
        "الميزات الأساسية": "Core Features",
        "الإجراءات الآلية": "Automations",
        "الحماية والأمان": "Security & Protection",
        "الرقابة والإشراف": "Moderation & Logs",
        "الحماية المتقدمة": "Advanced Protection",
        "الإدارة والمنظومة": "Administration",
        "التفاعل والأنشطة": "Engagement",
        "القرآن والمحتوى الإسلامي": "Quran & Islamic",
        "عام": "General",
        "أخرى": "Other",
        "نظرة عامة": "Overview",
        "مظهر البوت": "Bot Appearance",
        "الإعدادات": "Settings",
        "الإحصائيات": "Analytics",
        "الأوامر": "Commands",
        "الترحيب & المغادرة": "Welcome & Leave",
        "الرد التلقائي": "Auto Responder",
        "نظام التذاكر": "Ticket System",
        "المستويات & XP": "Levels & XP",
        "الرتب التلقائية": "Auto Roles",
        "قيف اواي": "Giveaways",
        "التقديمات": "Applications",
        "الاقتراحات والشكاوي": "Suggestions & Feedback",
        "حماية السيرفر": "Server Protection",
        "سجلات الأحداث": "Event Logs",
        "تحديث": "Update",
        "جديد": "New",

        // Common General Buttons & Texts
        "تفعيل": "Enable",
        "تعطيل": "Disable",
        "حذف": "Delete",
        "إنشاء": "Create",
        "تعديل": "Edit",
        "إلغاء": "Cancel",
        "إرسال": "Send",
        "تطبيق": "Apply",
        "تحديث": "Refresh",
        "إجمالي": "Total",
        "عضو": "Member",
        "الأعضاء": "Members",
        "إدارة سيرفر": "Manage Server",
        "لوحة التحكم": "Dashboard",
        "لوحة المتصدرين": "Leaderboards",
        "أغنى الأثرياء": "Richest Users",
        "أعلى نقاط السمعة & XP": "Top Rep & XP",
        "الراتب اليومي": "Daily Reward",
        "صوّت للبوت": "Vote for Bot",
        "صوّت للبوت على Top.gg": "Vote for Bot on Top.gg",
        "متجر الخلفيات": "Wallpapers Shop",
        "سيرفراتي المدارة": "My Managed Servers",
        "خوادمك المتاحة للإدارة": "Your Manageable Servers",
        "إدارة السيرفر": "Manage Server",
        "الملف الشخصي": "Profile",
        "بطاقة الهوية": "ID Card",
        "اليوم": "Today",
        "الرصيد": "Balance",
        "الذهب": "Gold",
        "السمعة": "Reputation",
        "التصنيف": "Rank",
        "المستوى": "Level",
        "الأعضاء": "Members",
        "احصل على": "Get",
        "مجاناً كل 24 ساعة!": "for free every 24 hours!",
        "مكافأة اليوم": "Today's Reward",
        "التكرار": "Frequency",
        "كل 24 ساعة": "Every 24 hours",
        "استلام الرصيد اليومي": "Claim Daily Reward",
        "متاح بعد: ": "Available in: ",
        "صوّتك يساعد البوت على الانتشار ويدعم تطويره! يمكنك التصويت مرة كل": "Your vote helps the bot grow and supports development! You can vote every",
        "12 ساعة": "12 hours",
        "صوّت الآن واكسب": "Vote now and earn",
        "لا توجد سيرفرات مشتركة لديك صلاحيات إدارتها": "No manageable servers found",
        "لإدارة سيرفر، يجب أن تكون مالك السيرفر أو تملك رتبة إدارية (Manage Server أو Administrator) ويكون البوت مضافاً في السيرفر.": "To manage a server, you must be the owner or have Administrator / Manage Server permissions, and the bot must be invited.",
        "إضافة البوت لسيرفرك": "Add Bot to Server",
        "جديد: نظام التذاكر والتحكم المتطور": "New: Advanced Ticket & Control System",
        "اصنع خادم ديسكورد": "Build a Professional",
        "احترافي!": "Discord Server!",
        "إضافة البوت في Discord": "Add Bot to Discord",
        "السيرفرات النشطة": "Active Servers",
        "سرعة الاستجابة": "Response Latency",
        "مستخدم نشط": "Active Users",

        // ── Landing Page Features Section ──
        "مميزات حقيقية وشاملة": "Real & Comprehensive Features",
        "كل ما يحتاجه سيرفرك في مكان واحد": "Everything Your Server Needs in One Place",
        "أنظمة برمجية متطورة مصممة بأعلى معايير الحماية والأداء، بتحكم كامل ولحظي.": "Advanced software systems built to the highest security and performance standards, with complete real-time control.",
        "حماية متقدمة ومانع تخريب": "Advanced Protection & Anti-Nuke",
        "تصدي فوري لمحاولات السبام والروابط المشبوهة، حماية الرتب، منع تخريب القنوات، وسجل أمان ومراقبة متكامل لحظة بلحظة.": "Instant defense against spam and suspicious links, role protection, channel lockdown, and full real-time audit logging.",
        "بطاقات ترحيب ورتب فورية": "Welcome Cards & Instant Roles",
        "تصميم بطاقات ترحيب بالصور الاحترافية ومشاركتها فور دخول العضو، مع إسناد تلقائي للرتب وإرسال رسائل خاصة مميزة.": "Professional image welcome cards upon member join, with automated role assignment and customized direct messages.",
        "نظام اقتصاد ومكافآت يومية": "Economy & Daily Rewards System",
        "نظام راتب يومي مع مكافآت Streak متتالية، لوحة متصدرين بالذهب والخبرة، ومتجر خلفيات هوية غني بـ 105 خلفية حصرية.": "Daily salary system with consecutive Streak rewards, Gold and XP leaderboards, and a profile card wallpaper shop with 105 exclusive designs.",
        "لوحات تذاكر متعددة الأقسام": "Multi-Category Ticket Panels",
        "نظام تذاكر احترافي بأزرار تفاعلية، استلام التذاكر من فريق الدعم، حفظ سجل المحادثات (Transcripts)، وتقييم طاقم العمل.": "Professional ticket panels with interactive buttons, support staff claiming, full chat transcripts, and staff rating.",
        "سجلات دقيقة (Server Logs)": "Detailed Server Logs",
        "سجلات دقيقة": "Detailed Logs",
        "تسجيل شامل لـ 13 فئة (حذف وتعديل الرسائل، دخول وخروج الصوت، تعديل الرتب والقنوات، الطرد والحظر) بأدق التفاصيل.": "Comprehensive logging across 13 categories (messages, voice, roles, channels, kicks, bans) with precision details.",
        "القرآن الكريم والإذاعة 24/7": "Holy Quran & 24/7 Radio",
        "القرآن الكريم والإذاعة": "Holy Quran & Radio",
        "بث متواصل لإذاعة القرآن الكريم بأصوات كبار القراء في الرومات الصوتية، مع أذكار الصباح والمساء وتذكيرات آلية مباركة.": "Continuous 24/7 Quran recitation broadcast by renowned reciters in voice channels, with morning/evening Athkar reminders.",
        "جميع الحقوق محفوظة ©": "All Rights Reserved ©",
        "سيرفر الدعم الفني": "Support Server",

        // Additional Dashboard & Sidebar Terms
        "إدارة السيرفر": "Server Management",
        "القرآن والإذاعة": "Quran & Radio",
        "القرآن & الراديو": "Quran & Radio",
        "رسائل الأمبد": "Embed Messages",
        "نظام الإعلانات": "Broadcast System",
        "Anti Nuke (الحماية)": "Anti-Nuke Protection",
        "القائمة البيضاء": "Whitelist",
        "سجلات الأمان والإشراف": "Security & Mod Logs",
        "النسخ الاحتياطية": "Server Backups",
        "الرقابة التلقائية": "Auto Moderation",
        "مكافحة الغزو": "Anti-Raid",
        "نشاط الإدارة": "Staff Activity",
        "الرومات المؤقتة": "Temp Voice",
        "البوستات": "Server Boosts",
        "الألوان": "Color Roles",
        "السجلات": "Logs",
        "التذاكر": "Tickets",
        "لوحة صدارة المشرفين": "Staff Leaderboard",
        "إداريين نشطين": "Active Staff",
        "إجراءات إدارية": "Staff Actions",
        "تذاكر مغلقة": "Closed Tickets",
        "أعلى نقاط فردية": "Top Individual Points",
        "إداري مسجل": "Registered Staff",
        "تصفير الإحصائيات": "Reset Stats",
        "إحصائيات دقيقة للتذاكر، الإشراف، الصوت والنقاط لكل مشرف": "Accurate stats for tickets, mod actions, voice and points for each moderator",
        "لا يوجد نشاط مسجل للمشرفين حتى الآن": "No staff activity recorded yet",
        "يتم تسجيل إجراءات المشرفين تلقائياً عند تنفيذ أوامر الإشراف": "Staff actions are automatically tracked upon executing moderation commands",
        "الأقسام": "Categories",
        "الأوامر الأساسية": "Basic Commands",
        "العقوبات": "Punishments",
        "سجلات العقوبات": "Punishment Logs",
        "إدارة القنوات": "Channels Management",
        "أدوات الشات": "Chat Tools",
        "إدارة الصوت": "Voice Management",
        "إدارة الرتب": "Roles Management",
        "الرتب الخاصة": "Custom Roles",
        "أدوات البوت الخاص": "Custom Bot Tools",
        "الحماية": "Security",
        "المستويات والخبرة": "Levels & XP",
        "إحصائيات السيرفر": "Server Stats",
        "الأوامر المفعلة": "Enabled Commands",
        "إجمالي الأوامر": "Total Commands",
        "اختصارات مخصصة": "Custom Aliases",
        "تعطيل الكل": "Disable All",
        "تفعيل الكل": "Enable All",
        "حُفظ": "Saved",
        "الكل": "All",
        "مفعل": "Enabled",
        "معطل": "Disabled",
        "لا توجد أوامر مطابقة": "No matching commands found",
        "لا توجد بيانات نشاط حتى الآن": "No activity data yet",
        "صلاحيات ديسكورد": "Discord Perms",
        "قفل قناة": "Lock channel",
        "فتح قناة": "Unlock channel",
        "طرد عضو": "Kick member",
        "حظر عضو": "Ban member",
        "فك حظر عضو": "Unban member",
        "كتم عضو": "Mute member",
        "فك كتم عضو": "Unmute member",
        "عزل عضو": "Timeout member",
        "فك عزل عضو": "Untimeout member",
        "تحذير عضو": "Warn member",
        "حذف تحذير": "Delete warning",
        "سجن عضو": "Jail member",
        "إخراج من السجن": "Unjail member",

        // ── Appearance Section ──
        "تخصيص البوت": "Bot Customization",
        "غير اسم البوت وصورته وبنره لكل سيرفر": "Change bot name, avatar and banner per server",
        "اسم البوت في السيرفر": "Bot Name in Server",
        "تغيير اسم البوت المعروض في هذا السيرفر فقط": "Change bot name displayed in this server only",
        "وصف البوت في السيرفر": "Bot Description in Server",
        "تغيير وصف البوت (About Me) المعروض في هذا السيرفر فقط": "Change bot About Me displayed in this server only",
        "اكتب وصفاً للبوت في هذا السيرفر...": "Write a description for the bot in this server...",
        "صورة البوت في السيرفر": "Bot Avatar in Server",
        "تغيير صورة البوت المعروضة في هذا السيرفر فقط (Per-Server Avatar)": "Change bot avatar displayed in this server only (Per-Server Avatar)",
        "اختر صورة": "Choose Avatar",
        "اضغط أو الصق رابط صورة جديدة": "Click or paste a new image link",
        "بنر البوت في السيرفر": "Bot Banner in Server",
        "تغيير بنر البوت المعروض في هذا السيرفر فقط (Per-Server Banner)": "Change bot banner displayed in this server only (Per-Server Banner)",
        "اختر بنر": "Choose Banner",
        "الصق رابط صورة البنر المباشر": "Paste direct banner image link",
        "ملاحظات مهمة": "Important Notes",
        "• تغيير الاسم والصورة والبنر يؤثر فقط على السيرفر المحدد.": "• Changing name, avatar, and banner affects only the selected server.",
        "• قد يستغرق ظهور التغييرات بضع ثوانٍ في ديسكورد فور الضغط على حفظ.": "• Changes may take a few seconds to appear in Discord after saving.",
        "• الصور يجب أن تكون بروابط مباشرة بصيغة PNG أو JPG أو WEBP أو GIF.": "• Images must be direct links ending in PNG, JPG, WEBP, or GIF.",
        "رابط الصورة المباشر": "Direct image link",
        "رابط البنر المباشر": "Direct banner link",

        // ── Moderation Section Detailed Badges & Cards ──
        "إعدادات الإشراف والعقوبات": "Moderation & Punishments Settings",
        "مسح كل التحذيرات": "Clear All Warnings",
        "رتب الإشراف": "Moderator Roles",
        "رتب المشرفين": "Staff Roles",
        "رتب مستثناة": "Excluded Roles",
        "كلمات محظورة": "Banned Words",
        "نظام التحذيرات": "Warnings System",
        "نظام الكتم": "Mute System",
        "سبام المنشنات": "Mention Spam",
        "فلتر الحروف الكبيرة": "Caps Filter",
        "سبام الإيموجيات": "Emoji Spam",

        // ── General Settings & Danger Zone ──
        "تصفير سجلات العقوبات التلقائي": "Auto-Clear Infractions",
        "حذف دوري لسجلات العقوبات المنتهية / المزالة – العقوبات النشطة لا تتأثر إطلاقاً.": "Periodic cleanup of expired / removed punishment logs – active punishments are never affected.",
        "فترة التصفير": "Clearing Period",
        "كل أسبوع": "Every week",
        "كل أسبوعين": "Every 2 weeks",
        "كل 3 أسابيع": "Every 3 weeks",
        "كل شهر": "Every month",
        "أنواع العقوبات المشمولة": "Covered Punishment Types",
        "كل الأنواع": "All Types",
        "حظر": "Ban",
        "حظر مؤقت": "Temporary Ban",
        "ميوت": "Mute",
        "ميوت صوتي": "Voice Mute",
        "سجن": "Jail",
        "تحذير": "Warning",
        "طرد": "Kick",
        "داون": "Down",
        "بلوك": "Block",
        "بلاك لست": "Blacklist",
        "تايم اوت": "Timeout",
        "منطقة الخطر": "Danger Zone",
        "تصفير قاعدة بيانات السيرفر": "Reset Server Database",
        "أونر السيرفر حصراً. يمسح كل بيانات البوت لهذا السيرفر نهائياً – الإعدادات، الحماية، سجل العقوبات، كل شيء (عدا التوب الكتابي/الصوتي والدعوات، تُدار منفصلة عبر أمر reset).": "Server owner only. Permanently deletes all bot data for this server – Settings, Security, Punishment Logs, everything (except text/voice top & invites, managed separately via reset command).",

        // ── Analytics & Stats Section ──
        "لوحة الإحصائيات والتحليلات المتقدمة": "Advanced Analytics & Stats Dashboard",
        "تحليل شامل لحركة السيرفر ونموه وتوزيع الأعضاء والقنوات": "Comprehensive analysis of server activity, growth, and member & channel distribution",
        "إدارة قنوات العدادات 📡": "Manage Stat Channels 📡",
        "إدارة قنوات العدادات": "Manage Stat Channels",
        "مؤشرات تفاعل السيرفر": "Server Engagement Indicators",
        "الاقتراحات والشكاوى": "Suggestions & Feedback",
        "إجمالي قنوات السيرفر": "Total Server Channels",
        "قنوات السيرفر": "Server Channels",
        "الربط السريع للعدادات": "Quick Stat Channels Setup",
        "فتح مدير قنوات الإحصائيات (9 أنواع) 🚀": "Open Stat Channels Manager (9 Types) 🚀",
        "فتح مدير قنوات الإحصائيات": "Open Stat Channels Manager",
        "يمكنك الآن تفعيل **9 أنواع مختلفة** من قنوات الإحصائيات (أعضاء، بشر، بوتات، متصلين، صوتية، رتب...) تتحدث تلقائياً كل 10 دقائق من قسم قنوات الإحصائيات.": "You can now enable 9 different types of stat channels (members, humans, bots, online, voice, roles...) updating automatically every 10 minutes from the stat channels section.",
        "عدد جميع الأعضاء في السيرفر": "Total count of all members in the server",
        "عدد الأعضاء البشريين فقط": "Count of human members only",
        "عدد البوتات في السيرفر": "Count of bots in the server",
        "الأعضاء الأونلاين": "Online Members",
        "عدد الأعضاء المتصلين حالياً": "Count of currently connected members",
        "المتصلين صوتياً": "Connected to Voice",
        "عدد الأعضاء في القنوات الصوتية": "Count of members in voice channels",
        "عدد القنوات الكلي": "Total Channels Count",
        "إجمالي عدد جميع القنوات": "Total count of all channels",
        "الرتب الكلية": "Total Roles",
        "عدد الرتب في السيرفر": "Count of roles in the server",
        "حذف هذه القناة": "Delete this channel",
        "مربوطة بـ:": "Linked to:",

        // ── Commands DB: Category titles & descriptions ──
        "الأوامر الرئيسية للبوت والاستخدام اليومي": "Core bot commands for daily use",
        "أوامر تنفيذ العقوبات المباشرة على الأعضاء": "Commands for direct member punishments",
        "استعلام وعرض سجلات العقوبات السابقة": "Query and view past punishment logs",
        "أوامر قفل وإخفاء وإدارة القنوات": "Channel lock, hide & management commands",
        "أوامر حذف الرسائل والإعلانات والتفاعل": "Message deletion, announcements & interaction",
        "أوامر التحكم في قنوات الصوت والأعضاء": "Voice channel & member control commands",
        "أوامر إعطاء وإزالة وإنشاء الرتب": "Give, remove & create role commands",
        "أوامر الرتب الشخصية المخصصة لكل عضو": "Personal custom role commands for each member",
        "أوامر عرض إحصائيات ومعلومات السيرفر": "Server info & statistics commands",
        "أوامر تخصيص مظهر وحالة البوت الخاص": "Custom bot appearance & status commands",
        "أوامر الحماية من التخريب ومكافحة السبام": "Anti-nuke & anti-spam protection commands",
        "أوامر المستويات وبطاقات الرانك": "Level system & rank card commands",
        "أوامر قنوات العدادات التلقائية": "Automatic stat counter channel commands",
        "أوامر البروفايل والسمعة والعملات": "Profile, reputation & currency commands",

        // ── Commands DB: Item descriptions ──
        "قائمة جميع الأوامر المتاحة": "List of all available commands",
        "سرعة استجابة البوت": "Bot response latency",
        "معلومات البوت الكاملة": "Complete bot information",
        "معلومات السيرفر الشاملة": "Comprehensive server information",
        "معلومات عضو في السيرفر": "Member information in the server",
        "عرض صورة عضو بدقة عالية": "View member avatar in high resolution",
        "عرض بنر عضو": "View member banner",
        "عدد دعوات عضو في السيرفر": "Member's invite count in the server",
        "قائمة رتب السيرفر الكاملة": "Complete server roles list",
        "قائمة قنوات السيرفر": "Server channels list",
        "قائمة إيموجيات السيرفر المخصصة": "Server custom emojis list",
        "تقديم طلب وظيفي بالسيرفر": "Submit a staff application in the server",
        "فتح تذكرة دعم": "Open a support ticket",
        "استلام الراتب اليومي": "Claim daily reward",
        "عرض بطاقة البروفايل": "View profile card",
        "قائمة المتصدرين": "Leaderboard list",
        "رصيد النجوم والتقييمات": "Stars & rating balance",
        "حذف نهائي لكل سجلات العقوبات": "Permanently delete all punishment records",
        "تغيير الاسم المستعار": "Change nickname",
        "بلاك لست عضو (دائم)": "Blacklist member (permanent)",
        "فك بلاك لست عضو": "Unblacklist member",
        "حذف عقوبة من عضو": "Remove punishment from member",
        "إزالة الرتب الإدارية لمدة محددة": "Remove admin roles for a set duration",
        "استعادة الرتب الإدارية المزالة": "Restore removed admin roles",
        "حظر عضو من رتبة": "Block member from a role",
        "فك حظر عضو من رتبة": "Unblock member from a role",
        "عرض كل التحذيرات النشطة": "View all active warnings",
        "سجل باندات عضو": "Member ban log",
        "سجل بلاك لست عضو": "Member blacklist log",
        "سجل بلوكات عضو": "Member block log",
        "عرض تفاصيل عقوبة": "View punishment details",
        "سجل عقوبات العضو الكامل": "Complete member punishment log",
        "عقوبات العضو النشطة حالياً": "Member's currently active punishments",
        "سجل داونات عضو": "Member down log",
        "سجل إشراف المشرفين": "Moderator supervision log",
        "سجل طرديات عضو": "Member kick log",
        "سجل كتمات عضو": "Member mute log",
        "سجل سجنات عضو": "Member jail log",
        "سجل عزلات عضو": "Member timeout log",
        "سجل تحذيرات عضو": "Member warnings log",
        "تقرير نشاط فريق الإدارة": "Staff team activity report",
        "سجل التدقيق والعمليات": "Audit & operations log",
        "ملخص جميع العقوبات النشطة": "Summary of all active punishments",
        "قفل قناة مقفولة": "Unlock a locked channel",
        "إخفاء قناة عن الأعضاء": "Hide channel from members",
        "إظهار قناة مخفية": "Show a hidden channel",
        "تفعيل السلو مود في القناة": "Enable slow mode in channel",
        "نسخ قناة بكامل إعداداتها": "Clone channel with all its settings",
        "تغيير اسم القناة": "Change channel name",
        "تغيير وصف القناة": "Change channel topic",
        "تفعيل/تعطيل وضع NSFW": "Enable/disable NSFW mode",
        "حذف عدد محدد من الرسائل": "Delete a specific number of messages",
        "حذف الرسائل المثبتة": "Delete pinned messages",
        "حذف رسائل البوتات": "Delete bot messages",
        "حذف رسائل عضو معين": "Delete messages from a specific member",
        "إرسال رسالة عبر البوت": "Send a message through the bot",
        "إنشاء Embed مخصص": "Create a custom Embed",
        "إنشاء استطلاع رأي": "Create a poll",
        "تعيين تذكير مؤقت": "Set a temporary reminder",
        "إرسال إعلان رسمي": "Send an official announcement",
        "بث رسالة في جميع القنوات": "Broadcast a message to all channels",
        "ترجمة نص إلى لغة أخرى": "Translate text to another language",
        "اقتباس رسالة قديمة": "Quote an old message",
        "كتم عضو في الصوت": "Mute member in voice",
        "فك كتم عضو في الصوت": "Unmute member in voice",
        "صمم عضو في الصوت": "Deafen member in voice",
        "فك تصميم عضو في الصوت": "Undeafen member in voice",
        "طرد عضو من قناة الصوت": "Kick member from voice channel",
        "نقل عضو بين قنوات الصوت": "Move member between voice channels",
        "نقل جميع الأعضاء لقناة أخرى": "Move all members to another channel",
        "تحديد الحد الأقصى للمستخدمين": "Set maximum user limit",
        "إغلاق كامل قنوات السيرفر فوراً": "Immediately lock down all server channels",
        "إعادة فتح جميع القنوات المغلقة": "Re-open all locked channels",
        "تقرير حالة الحماية": "Security status report",
        "فحص ثغرات وصلاحيات السيرفر": "Scan server permissions & vulnerabilities",
        "إضافة رتبة مكافأة عند مستوى": "Add reward role at a level",
        "إزالة رتبة مكافأة": "Remove reward role",
        "قائمة جميع رتب المكافآت": "List of all reward roles",
        "تغيير خلفية بطاقة الرانك": "Change rank card background",
        "تفعيل مضاعفة الخبرة 2x": "Enable 2x XP boost",
        "إنشاء قنوات عدادات السيرفر": "Create server stat channels",
        "تفعيل عداد الأعضاء": "Enable members counter",
        "تفعيل عداد البوتات": "Enable bots counter",
        "تفعيل عداد القنوات": "Enable channels counter",
        "تفعيل عداد الرتب": "Enable roles counter",
        "تفعيل عداد البوستات": "Enable boosts counter",
        "تفعيل عداد المتواجدين أونلاين": "Enable online members counter",
        "تفعيل عداد المتواجدين في الصوت": "Enable in-voice counter",
        "حذف جميع قنوات العدادات": "Delete all stat channels",
        "تحديث فوري لأرقام العدادات": "Instant refresh of stat numbers",
        "تعديل شكل قنوات العدادات": "Edit stat channel format",
        "إعطاء رتبة لعضو": "Give role to member",
        "إزالة رتبة من عضو": "Remove role from member",
        "إعطاء رتبة لجميع الأعضاء": "Give role to all members",
        "إعطاء رتبة لجميع البوتات": "Give role to all bots",
        "إعطاء رتبة لجميع البشر": "Give role to all humans",
        "إنشاء رتبة جديدة": "Create a new role",
        "حذف رتبة من السيرفر": "Delete a role from the server",
        "تغيير لون رتبة": "Change role color",
        "معلومات رتبة مفصلة": "Detailed role information",
        "قائمة أعضاء رتبة معينة": "List of members with a specific role",
        "إنشاء رتبة خاصة بك": "Create your own custom role",
        "عرض معلومات رتبتك الخاصة": "View your custom role info",
        "تغيير لون رتبتك الخاصة": "Change your custom role color",
        "تغيير اسم رتبتك الخاصة": "Change your custom role name",
        "تغيير أيقونة رتبتك الخاصة": "Change your custom role icon",
        "مشاركة رتبتك الخاصة مع عضو": "Share your custom role with a member",
        "إلغاء مشاركة الرتبة مع عضو": "Revoke role sharing from a member",
        "حذف رتبتك الخاصة نهائياً": "Permanently delete your custom role",
        "قائمة جميع الرتب الخاصة": "List of all custom roles",
        "بنر السيرفر الرسمي": "Official server banner",
        "أيقونة السيرفر بدقة عالية": "Server icon in high resolution",
        "إحصائيات السيرفر المفصلة": "Detailed server statistics",
        "قائمة المبوستين وعدد البوستات": "List of boosters and boost count",
        "أكثر الأعضاء دعوةً": "Top member inviters",
        "قائمة كاملة بالقنوات": "Full channels list",
        "قائمة وتوزيع الرتب": "Roles list and distribution",
        "قائمة الإيموجيات المخصصة": "Custom emojis list",
        "قائمة الستيكرات": "Stickers list",
        "قائمة المحظورين": "Banned members list",
        "قائمة الإدارة والمشرفين": "Admins and moderators list",
        "قائمة بوتات السيرفر": "Server bots list",
        "رابط السيرفر المخصص": "Server vanity URL",
        "ميزات السيرفر المفعلة": "Enabled server features",
        "تاريخ إنشاء السيرفر": "Server creation date",
        "مدة تشغيل البوت": "Bot uptime",
        "سرعة الاستجابة": "Response speed",
        "معلومات الشاردات": "Shards information",
        "تغيير اسم البوت في السيرفر": "Change bot name in server",
        "تغيير صورة البوت": "Change bot avatar",
        "تغيير بنر البوت": "Change bot banner",
        "تغيير نشاط وحالة البوت": "Change bot activity & status",
        "تغيير حالة التواجد Online/DND/Idle": "Change online status Online/DND/Idle",
        "تفعيل/تعطيل مكافحة الغزو": "Enable/disable anti-raid",
        "إعدادات جدار الحماية Anti-Nuke": "Anti-Nuke shield settings",
        "إضافة عضو للقائمة البيضاء": "Add member to whitelist",
        "إزالة عضو من القائمة البيضاء": "Remove member from whitelist",
        "عرض القائمة البيضاء": "View whitelist",
        "منع دخول البوتات غير الموثقة": "Block unverified bots from joining",
        "مكافحة السبام والرسائل المتكررة": "Anti-spam & repeated messages",
        "منع نشر الروابط": "Prevent link sharing",
        "إنشاء نسخة احتياطية للسيرفر": "Create server backup",
        "استعادة نسخة احتياطية": "Restore a backup",
        "قائمة النسخ الاحتياطية": "Backups list",
        "عرض بطاقة مستواك الحالية": "View your current level card",
        "المتصدرين في المستويات": "Top levels leaderboard",
        "تعديل نقاط الخبرة لعضو": "Edit XP points for a member",
        "تعديل مستوى عضو": "Edit member level",
        "تصفير نظام المستويات": "Reset levels system",
        "عرض بطاقة بروفايلك الشاملة": "View your comprehensive profile card",
        "إعطاء نقطة سمعة لعضو (+rep)": "Give reputation point to member (+rep)",
        "استلام الراتب اليومي (Gold)": "Claim daily reward (Gold)",
        "رصيدك من عملات Gold": "Your Gold currency balance",
        "تحويل عملات Gold لعضو آخر": "Transfer Gold coins to another member",
        "تعديل النبذة الشخصية": "Edit personal bio",
        "تعديل اللقب الشخصي": "Edit personal title",
        "تعديل الشارة المفضلة": "Edit favorite badge",
        "تغيير خلفية بطاقة البروفايل": "Change profile card background",
        "الزواج التفاعلي في السيرفر": "Interactive marriage in the server",
        "مسح جميع التحذيرات": "Clear all warnings",
        "مسح تحذيرات عضو كاملة": "Clear all warnings for a member",
        "عرض بطاقة مستواك": "View your level card",
        "عرض بطاقة مستوى": "View level card",
        "عرض بطاقة بروفايل": "View profile card",
        "تشغيل نشاط جماعي بالصوت": "Start a group activity in voice",
        "معلومات قناة الصوت الحالية": "Current voice channel info",
        "السماح لعضو بالدخول": "Allow member to enter",
        "منع عضو من الدخول": "Prevent member from entering",
        "تغيير جودة الصوت (Bitrate)": "Change audio quality (Bitrate)",
        "إنشاء قناة صوتية مؤقتة": "Create a temporary voice channel",
        "تغيير اسم قناة الصوت": "Change voice channel name",

        // ── Commands Management UI ──
        "تخصيص وإدارة جميع أوامر البوت والصلاحيات": "Customize and manage all bot commands and permissions",
        "...ابحث عن أمر": "Search for a command...",
        "✓ حُفظ": "✓ Saved",
        "لا توجد أوامر مطابقة 🔍": "No matching commands found 🔍",

        // ── AutoMod section ──
        "حظر سبام المنشن": "Mention Spam Block",
        "حظر الحروف الكبيرة": "Block Uppercase Spam",
        "إزعاج Spoilers": "Spoiler Annoyance",
        "نص Zalgo": "Zalgo Text",
        "مكافحة السبام": "Anti-Spam",
        "إزعاج الإيموجي": "Emoji Spam",
        "تكرار النص": "Text Repetition",
        "رسائل مكررة": "Duplicate Messages",
        "سبام الملصقات": "Sticker Spam",
        "سبام الأسطر": "Line Spam",
        "الرسائل الطويلة": "Long Messages",
        "حماية البوت — حماية متقدمة يديرها البوت مباشرة": "Bot Protection — Advanced protection managed directly by the bot",
        "مرونة أكثر في التخصيص": "More flexibility in customization",
        "حدد عدد المنشنات المسموح بها في الرسالة الواحدة": "Set max allowed mentions per message",
        "منع الرسائل التي تحتوي على أحرف كبيرة بشكل مفرط (70% أو أكثر)": "Block messages with excessive capital letters (70%+)",
        "نظام الحماية من السبام والرسائل المتكررة": "Protection system against spam and repeated messages",
        "الحد الأقصى للمنشنات": "Max Mentions",
        "الحد الأقصى للإيموجيات": "Max Emojis",
        "حد الأسطر": "Line Limit",
        "حد الرسائل الطويلة": "Long Message Limit",
        "حد تكرار الرسائل": "Message Repeat Limit",
        "منع رسائل": "Block messages",
        "ثانية": "second",
        "رسائل في ثانية": "messages per second",
        "إعداد فلتر الكلمات": "Word Filter Settings",
        "نظام الحماية التلقائية": "Automatic Protection System",

        // ── Bad words filter ──
        "الكلمات المحظورة": "Banned Words",
        "فلتر الكلمات المحظورة المشدد": "Strict Bad Words Filter",
        "كلمات مسموح بها (Whitelist)": "Allowed Words (Whitelist)",
        "أعضاء معفيون من الفلتر": "Members Exempt from Filter",
        "قناة السجل ((اختياري))": "Log Channel (optional)",
        "جزئي — يحتوي على الكلمة في أي مكان": "Partial — contains the word anywhere",
        "كلمة كاملة — الكلمة وحدها فقط": "Exact — the word alone only",
        "جزئي": "Partial",
        "كلمة كاملة": "Exact Match",
        "إضافة": "Add",
        "اكتب كلمة محظورة...": "Type a banned word...",
        "اكتب كلمة مسموح بها...": "Type an allowed word...",
        "ابحث عن عضو أو أدخل الـ ID...": "Search for a member or enter ID...",
        "...اختر القناة": "Select channel...",
        "...اختر الرتبة": "Select role...",

        // ── Warn punishment system ──
        "نظام العقوبات التلقائية للتحذيرات": "Auto Warn Punishment System",
        "إضافة قاعدة جديدة": "Add New Rule",
        "عند بلوغ X تحذيرات": "Upon reaching X warnings",
        "قاعدة": "Rule",
        "العقوبة": "Punishment",
        "لا توجد قواعد بعد": "No rules yet",
        "أضف قاعدة عقوبة لتفعيل النظام": "Add a punishment rule to activate the system",
        "حذف 🗑️": "Delete 🗑️",
        "عزل 5 دقائق": "Timeout 5 min",
        "عزل ساعة": "Timeout 1 hour",
        "عزل 24 ساعة": "Timeout 24 hours",
        "حظر نهائي": "Permanent Ban",
        "تحذيرات": "warnings",
        "تحذير": "warning",

        // ── Manage page ──
        "آخر 5 معاملات الذهب": "Last 5 Gold Transactions",
        "سجل التحويلات والمكافآت": "Transfers & Rewards Log",
        "مرحباً بك في لوحة تحكم ZENO Bot!": "Welcome to ZENO Bot Dashboard!",
        "المبلغ": "Amount",
        "تاريخ": "Date",
        "ترتيبك الحالي": "Your Current Rank",
        "أعلى 100 عضو بواسطة نقاط الخبرة (XP Leaderboard) 🏆": "Top 100 Members by XP Points 🏆",
        "أعلى 100 عضو بواسطة نقاط الخبرة": "Top 100 Members by XP Points",
        "ترتيبك المالي": "Your Financial Rank",
        "أغنى الأثرياء برصيد الذهب 🪙": "Richest Members by Gold Balance 🪙",
        "أغنى الأثرياء برصيد الذهب": "Richest Members by Gold Balance",
        "احصل على 500 إلى 1,000 من الذهب": "Get 500 to 1,000 Gold",
        "صوّت للبوت على Top.gg": "Vote for Bot on Top.gg",
        "صوّت الآن على Top.gg": "Vote Now on Top.gg",
        "صوّت الآن واكسب ذهباً إضافياً!": "Vote now and earn extra Gold!",

        // ── Invites section ──
        "متتبع الدعوات المتقدم (Invite Tracker) 🔗": "Advanced Invite Tracker 🔗",
        "تتبع دقيق لمن قام بدعوة الأعضاء وحساب الدعوات الحقيقية والمغادرين والوهمية والبونص": "Precise tracking of who invited members with real, left, fake and bonus invite counts",
        "تصفير كل الدعوات": "Reset All Invites",
        "إجمالي الدعوات الصالحة": "Total Valid Invites",
        "دعوة نشطة في السيرفر": "active invite in server",
        "متصدر الدعوات (Top Inviter)": "Top Inviter",
        "دعوة مسجلة": "registered invite",
        "الأعضاء المشاركون بالدعوة": "Members Participating in Invites",
        "داعين مسجلين": "registered inviters",
        "إضافة أو خصم دعوات إضافية (Bonus Invites)": "Add or deduct bonus invites",
        "أيدي أو منشن العضو (User ID)": "Member ID or mention (User ID)",
        "عدد الدعوات (موجب للإضافة / سالب للخصم)": "Invite count (positive to add / negative to deduct)",
        "تطبيق الرصيد ✅": "Apply Balance ✅",
        "قائمة متصدري الدعوات (Top Invites Leaderboard)": "Top Invites Leaderboard",
        "حقيقية (Regular)": "Real (Regular)",
        "مغادرين (Leaves)": "Left (Leaves)",
        "وهمية (Fake)": "Fake",
        "بونص (Bonus)": "Bonus",
        "الصافي (Total)": "Net (Total)",
        "لا توجد بيانات دعوات مسجلة حتى الآن": "No invite data recorded yet",

        // ── Broadcast section ──
        "نظام الإعلانات والمذيع الآلي": "Announcements & Auto Broadcaster",
        "جدولة وإرسال إعلانات دورية تلقائية بتضمينات جذابة وتحديثات آلية": "Schedule and send periodic auto announcements with rich embeds",
        "إرسال فوري": "Send Now",
        "جدولة إعلان": "Schedule Announcement",
        "القناة المستهدفة": "Target Channel",
        "العنوان": "Title",
        "المحتوى": "Content",
        "لون الإمبد": "Embed Color",
        "إضافة صورة": "Add Image",
        "إعلانات مجدولة": "Scheduled Announcements",
        "لا توجد إعلانات مجدولة": "No scheduled announcements",

        // ── Moderation section ──
        "الإشراف وإدارة الأعضاء": "Moderation & Member Management",
        "قناة سجل الإشراف": "Moderation Log Channel",
        "رتبة الإشراف": "Moderator Role",
        "رتبة المشرف": "Moderator Role",
        "مدة الكتم الافتراضية": "Default Mute Duration",
        "دقائق": "minutes",
        "ساعات": "hours",
        "أيام": "days",
        "دقيقة": "minute",
        "ساعة": "hour",
        "يوم": "day",
        "أسبوع": "week",
        "شهر": "month",
        "نظام السجن": "Jail System",
        "رتبة السجن": "Jail Role",
        "قناة السجن": "Jail Channel",
        "نظام الكتم": "Mute System",
        "رتبة الكتم": "Mute Role",

        // ── Welcome section ──
        "رسائل وبطاقات الترحيب": "Welcome & Leave Messages",
        "قناة الترحيب": "Welcome Channel",
        "قناة المغادرة": "Leave Channel",
        "رسالة الترحيب": "Welcome Message",
        "رسالة المغادرة": "Leave Message",
        "تفعيل الترحيب": "Enable Welcome",
        "تفعيل المغادرة": "Enable Leave",
        "معاينة الرسالة": "Message Preview",
        "خلفية البطاقة": "Card Background",
        "لون النص": "Text Color",
        "حجم الخط": "Font Size",
        "البطاقة الترحيبية": "Welcome Card",
        "متغيرات الرسالة": "Message Variables",
        "اسم العضو": "Member Name",
        "ذكر العضو": "Member Mention",
        "اسم السيرفر": "Server Name",
        "عدد الأعضاء": "Member Count",

        // ── Auto responder section ──
        "الرد التلقائي على الكلمات": "Auto Word Responder",
        "إضافة رد جديد": "Add New Response",
        "الكلمة المشغِّلة": "Trigger Word",
        "الرد": "Response",
        "حذف الرسالة الأصلية": "Delete Original Message",
        "لا توجد ردود تلقائية": "No auto responses",
        "ردود تلقائية": "Auto Responses",

        // ── Tickets section ──
        "نظام التذاكر والدعم": "Ticket & Support System",
        "قناة التذاكر": "Tickets Channel",
        "قسم التذاكر": "Tickets Category",
        "رتبة الدعم": "Support Role",
        "رسالة فتح التذكرة": "Ticket Open Message",
        "رسالة الترحيب بالتذكرة": "Ticket Welcome Message",
        "تذاكر مفتوحة": "Open Tickets",
        "إجمالي التذاكر": "Total Tickets",
        "وقت الاستجابة المتوسط": "Average Response Time",

        // ── Antinuke section ──
        "جدار الحماية الشامل": "Comprehensive Anti-Nuke Shield",
        "نظام Anti-Nuke": "Anti-Nuke System",
        "حماية حذف القنوات": "Channel Delete Protection",
        "حماية حذف الرتب": "Role Delete Protection",
        "حماية الكيك الجماعي": "Mass Kick Protection",
        "حماية الباند الجماعي": "Mass Ban Protection",
        "حماية البوت": "Bot Protection",
        "الحد الأقصى للإجراءات": "Max Actions Threshold",
        "مدة الحظر التلقائي": "Auto-ban Duration",
        "الإجراء عند الاختراق": "Action on Breach",
        "إزالة الرتب الإدارية": "Remove Admin Roles",
        "حظر مؤقت": "Temporary Ban",
        "طرد من السيرفر": "Kick from Server",

        // ── Logs section ──
        "سجلات الأحداث الشاملة": "Comprehensive Event Logs",
        "قناة سجل الأحداث": "Event Log Channel",
        "سجل الرسائل": "Message Logs",
        "سجل الأعضاء": "Member Logs",
        "سجل الرتب": "Role Logs",
        "سجل القنوات": "Channel Logs",
        "سجل الأصوات": "Voice Logs",
        "سجل الإشراف": "Moderation Logs",
        "سجل السيرفر": "Server Logs",
        "سجل الدعوات": "Invite Logs",
        "أحداث مفعلة": "Active Events",
        "أحداث معطلة": "Disabled Events",

        // ── Levels section ──
        "نظام المستويات والخبرة XP": "XP Levels System",
        "قناة إشعارات الترقية": "Level-up Notification Channel",
        "رسالة الترقية": "Level-up Message",
        "مكاسب XP للرسائل": "XP Gain per Message",
        "مكاسب XP للصوت": "XP Gain in Voice",
        "الحد الأدنى لـ XP": "Minimum XP",
        "الحد الأقصى لـ XP": "Maximum XP",
        "قنوات مستثناة": "Excluded Channels",
        "رتب مستثناة": "Excluded Roles",
        "رتب مضاعفة XP": "Double XP Roles",
        "أكثر الأعضاء نشاطاً بالخبرة": "Most Active Members by XP",

        // ── Auto roles section ──
        "الرتب التلقائية عند الانضمام": "Auto Roles on Join",
        "الرتب الممنوحة للبشر": "Roles Granted to Humans",
        "الرتب الممنوحة للبوتات": "Roles Granted to Bots",
        "إضافة رتبة": "Add Role",

        // ── Giveaways section ──
        "نظام مسابقات القيف اواي": "Giveaway System",
        "إنشاء قيف اواي": "Create Giveaway",
        "الجائزة": "Prize",
        "المدة": "Duration",
        "عدد الفائزين": "Winner Count",
        "متطلبات الدخول": "Entry Requirements",
        "القيف اواي النشطة": "Active Giveaways",
        "لا توجد مسابقات نشطة": "No active giveaways",
        "انتهت": "Ended",
        "فائزون": "Winners",

        // ── Suggestions section ──
        "نظام الاقتراحات والشكاوي": "Suggestions & Feedback System",
        "قناة الاقتراحات": "Suggestions Channel",
        "قناة الاقتراحات المقبولة": "Accepted Suggestions Channel",
        "قناة الاقتراحات المرفوضة": "Rejected Suggestions Channel",
        "تفعيل التصويت التلقائي": "Enable Auto Voting",
        "مقبول": "Accepted",
        "مرفوض": "Rejected",
        "قيد المراجعة": "Under Review",
        "اقتراح جديد": "New Suggestion",

        // ── Applications section ──
        "نظام التقديمات والتوظيف": "Staff Applications System",
        "نماذج التقديم": "Application Forms",
        "أضف نموذجاً": "Add Form",
        "أسئلة النموذج": "Form Questions",
        "قناة استقبال الطلبات": "Application Receive Channel",
        "رتبة المراجع": "Reviewer Role",
        "تلقائي": "Automatic",
        "يدوي": "Manual",

        // ── Embed builder ──
        "صانع رسائل الإيمبد المتقدم": "Advanced Embed Builder",
        "الوصف": "Description",
        "الحقول": "Fields",
        "إضافة حقل": "Add Field",
        "اسم الحقل": "Field Name",
        "قيمة الحقل": "Field Value",
        "مضمّن": "Inline",
        "الصورة المصغرة": "Thumbnail",
        "الصورة الكبيرة": "Image",
        "التذييل": "Footer",
        "المرسل": "Author",
        "انسخ الكود": "Copy Code",
        "معاينة": "Preview",
        "إرسال الإمبد": "Send Embed",

        // ── Quran section ──
        "القرآن الكريم والإذاعات الإسلامية": "Holy Quran & Islamic Broadcasts",
        "قناة الإذاعة": "Broadcast Channel",
        "القارئ": "Reciter",
        "المحطة الإسلامية": "Islamic Station",
        "تشغيل الإذاعة": "Start Broadcasting",
        "إيقاف الإذاعة": "Stop Broadcasting",
        "بدء البث": "Start Broadcast",

        // ── Temp Voice section ──
        "نظام الرومات الصوتية المؤقتة": "Temp Voice Channels System",
        "قناة إنشاء الروم": "Room Creation Channel",
        "قسم الرومات": "Rooms Category",
        "اسم الروم الافتراضي": "Default Room Name",
        "الحد الافتراضي للأعضاء": "Default Member Limit",
        "صلاحيات الأعضاء": "Member Permissions",
        "صلاحية إدارة الروم": "Room Management Permission",
        "إنشاء الروم": "Create Room",
        "تعديل الروم": "Edit Room",
        "قفل الروم": "Lock Room",
        "فتح الروم": "Unlock Room",

        // ── Boost section ──
        "نظام تنبيهات البوست": "Boost Notifications System",
        "قناة البوست": "Boost Channel",
        "رسالة البوست": "Boost Message",
        "رتبة البوست": "Boost Role",
        "مكافأة البوست": "Boost Reward",
        "مبوستون": "Boosters",
        "عدد البوستات": "Boost Count",

        // ── Colors section ──
        "نظام رتب الألوان": "Color Roles System",
        "ألوان متاحة": "Available Colors",
        "إضافة لون": "Add Color",
        "اسم اللون": "Color Name",
        "كود اللون": "Color Code",
        "اختر لوناً": "Pick a Color",

        // ── Settings / Appearance section ──
        "مظهر وتخصيص البوت": "Bot Appearance & Customization",
        "اسم البوت": "Bot Name",
        "صورة البوت": "Bot Avatar",
        "بنر البوت": "Bot Banner",
        "حالة البوت": "Bot Status",
        "نشاط البوت": "Bot Activity",
        "البادئة": "Prefix",
        "اللغة": "Language",
        "المنطقة الزمنية": "Timezone",

        // ── Anti-raid section ──
        "نظام مكافحة الغزو والأعضاء الوهميين": "Anti-Raid & Fake Accounts System",
        "الحد الأقصى للانضمام": "Max Joins per Window",
        "نافذة الوقت": "Time Window",
        "الإجراء عند الغزو": "Action on Raid",
        "تفعيل التحقق": "Enable Verification",
        "قناة التحقق": "Verification Channel",
        "عمر الحساب الأدنى": "Minimum Account Age",

        // ── Staff Activity section ──
        "تتبع نشاط الإدارة والمشرفين": "Staff & Moderator Activity Tracking",
        "نقاط الفريق": "Team Points",
        "إجراءات الإشراف": "Moderation Actions",
        "الوقت في الصوت": "Voice Time",
        "التذاكر المعالجة": "Handled Tickets",
        "تصفير إحصائيات": "Reset Statistics",
        "إحصائيات دقيقة": "Accurate Statistics",
        "مشرف مسجل": "Registered Moderator",
        "لا يوجد إداريين مسجلين": "No registered staff",

        // ── General Settings section ──
        "إعدادات السيرفر العامة": "General Server Settings",
        "لغة البوت": "Bot Language",
        "تفعيل ميزة": "Enable Feature",
        "تعطيل ميزة": "Disable Feature",
        "إعادة ضبط الإعدادات": "Reset Settings",
        "استعادة الإعدادات الافتراضية": "Restore Default Settings",

        // ── Analytics section ──
        "الإحصائيات والتحليلات": "Analytics & Stats",
        "رسائل اليوم": "Today's Messages",
        "أعضاء جدد اليوم": "New Members Today",
        "معدل النشاط": "Activity Rate",
        "الساعة الأكثر نشاطاً": "Most Active Hour",
        "اليوم الأكثر نشاطاً": "Most Active Day",
        "إجمالي الرسائل": "Total Messages",
        "معدل النمو": "Growth Rate",
        "الأسبوع الماضي": "Last Week",
        "الشهر الماضي": "Last Month",
        "آخر 30 يوم": "Last 30 Days",

        // ── Common alerts and prompts ──
        "هل أنت متأكد؟": "Are you sure?",
        "هل أنت متأكد من رغبتك في حذف قاعدة العقوبة هذه؟": "Are you sure you want to delete this punishment rule?",
        "تحذير: هل أنت متأكد من تصفير كافة بيانات الدعوات في السيرفر؟ لا يمكن التراجع عن هذا الإجراء!": "Warning: Are you sure you want to reset all invite data? This action cannot be undone!",
        "أدخل عدد التحذيرات المطلوب لتنفيذ العقوبة (مثلاً: 3):": "Enter the warning count to trigger punishment (e.g., 3):",
        "اختر نوع العقوبة:": "Choose punishment type:",
        "تمت إضافة قاعدة العقوبة التلقائية بنجاح!": "Auto punishment rule added successfully!",
        "تم الحذف بنجاح!": "Deleted successfully!",
        "خطأ في الحذف": "Error while deleting",
        "حدث خطأ في الاتصال": "Connection error occurred",
        "تم تحديث رصيد دعوات العضو بنجاح!": "Member invite balance updated successfully!",
        "تم تصفير الدعوات بنجاح!": "Invites reset successfully!",
        "يرجى كتابة أيدي العضو وتحديد عدد الدعوات!": "Please enter member ID and specify invite count!",
        "بنجاح": "successfully",

        // ── Common UI ──
        "بحث": "Search",
        "فلتر": "Filter",
        "تصفية": "Filter",
        "ترتيب": "Sort",
        "تحميل...": "Loading...",
        "جارٍ التحميل": "Loading",
        "لا توجد نتائج": "No results",
        "لا يوجد": "None",
        "غير محدد": "Not set",
        "اختياري": "Optional",
        "مطلوب": "Required",
        "الصفحة": "Page",
        "التالي": "Next",
        "السابق": "Previous",
        "موافق": "OK",
        "تأكيد": "Confirm",
        "رجوع": "Back",
        "إغلاق": "Close",
        "حفظ": "Save",
        "نسخ": "Copy",
        "لصق": "Paste",
        "مسح": "Clear",
        "تحديد الكل": "Select All",
        "إلغاء التحديد": "Deselect All",
        "البحث في الأعضاء": "Search members",
        "ابحث...": "Search...",
        "ابحث عن...": "Search for...",
        "اختر...": "Select...",
        "اكتب هنا...": "Type here...",
        "لا يوجد شيء هنا": "Nothing here",
        "قريباً": "Coming Soon",
        "جديد!": "New!",
        "مميز": "Featured",
        "مكتمل": "Completed",
        "معلق": "Pending",
        "فاشل": "Failed",
        "منتهي": "Expired",
        "نشط": "Active",
        "غير نشط": "Inactive",
        "متصل": "Online",
        "غير متصل": "Offline",
        "مشغول": "Busy",
        "بعيد": "Away",
        "خطأ": "Error",
        "تحذير!": "Warning!",
        "ملاحظة": "Note",
        "نجاح": "Success",
        "معلومات": "Info",

        // ── Broadcast System ──
        "نظام الإعلانات والمذيع الآلي": "Broadcast & Auto Announcer System",
        "جدولة وإرسال إعلانات دورية تلقائية بتضمينات جذابة وتحديثات آلية": "Schedule and send automatic periodic announcements with rich embeds",
        "تفعيل المذيع الآلي": "Enable Auto Broadcaster",
        "إرسال رسائل إعلانية دورية تلقائياً في القناة المحددة": "Automatically send periodic announcement messages in the selected channel",
        "قناة البث": "Broadcast Channel",
        "فترة التكرار": "Broadcast Interval",
        "رتبة الإشارة (اختياري)": "Mention Role (Optional)",
        "رتبة يتم ذكرها تلقائياً مع كل إعلان للتنبيه": "A role automatically mentioned with each announcement for alerts",
        "قائمة رسائل البث": "Broadcast Messages List",
        "إضافة رسالة جديدة": "Add New Message",
        "لا توجد رسائل مضافة بعد — أضف رسالتك الأولى أعلاه 📢": "No messages added yet — add your first message above 📢",
        "إرسال الآن يدوياً": "Send Manually Now",
        "إرسال فوري": "Instant Send",
        "إرسال رسالة عشوائية من القائمة فوراً إلى القناة المحددة": "Immediately send a random message from the list to the selected channel",
        "اكتب نص الإعلان هنا... (يدعم markdown ومتغيرات مثل {server} و {members})": "Write announcement text here... (supports markdown and variables like {server} and {members})",
        "يرجى كتابة نص الرسالة أولاً!": "Please write the message text first!",
        "هل تريد حذف هذه الرسالة؟": "Do you want to delete this message?",
        "جارٍ الإرسال...": "Sending...",
        "تم الإرسال!": "Sent!",
        "فشل الإرسال. تأكد من ضبط القناة وإضافة رسائل في القائمة.": "Send failed. Make sure the channel is set and messages are added to the list.",
        "🟢 مفعل": "🟢 Active",
        "🔴 معطل": "🔴 Disabled",
        "دقيقة": "minute",
        "ساعة": "hour",
        "ساعات": "hours",
        "يوم": "day",

        // ── Embed Builder ──
        "رسائل الإيمبد": "Embed Messages",
        "صمم وأرسل رسائل إيمبد منسقة واحترافية لقنواتك": "Design and send formatted, professional embed messages to your channels",
        "محرر": "Editor",
        "مستند": "Document",
        "معاينة": "Preview",
        "أرسل إلى القناة": "Send to Channel",
        "لون الإيمبد": "Embed Color",
        "محتوى الإيمبد": "Embed Content",
        "أيقونة الكاتب (Author Icon URL)": "Author Icon URL",
        "اسم الكاتب (Author Name)": "Author Name",
        "رابط العنوان (Title URL - اختياري)": "Title URL (Optional)",
        "عنوان الإيمبد (Title)": "Embed Title",
        "الوصف والمحتوى (Description)": "Description & Content",
        "اكتب محتوى الرسالة هنا... يدعم Markdown مثل **عريض** و *مائل*": "Write message content here... supports Markdown like **bold** and *italic*",
        "الصورة المصغرة (Thumbnail URL)": "Thumbnail URL",
        "الصورة الكبيرة (Main Image URL)": "Main Image URL",
        "الحقول الإضافية (Fields)": "Additional Fields",
        "+ إضافة حقل (Field)": "+ Add Field",
        "إظهار الوقت (Timestamp)": "Show Timestamp",
        "التذييل والوقت (Footer)": "Footer & Timestamp",
        "أيقونة التذييل (Footer Icon URL)": "Footer Icon URL",
        "نص التذييل (Footer Text)": "Footer Text",
        "معاينة مباشرة": "Live Preview",
        "شكل الرسالة في ديسكورد": "Message Preview in Discord",
        "المحرر المرئي مفعل": "Visual editor is active",

        // ── Arabic months → English (for server creation date) ──
        "كانون الثاني": "January",
        "شباط": "February",
        "آذار": "March",
        "نيسان": "April",
        "أيار": "May",
        "حزيران": "June",
        "تموز": "July",
        "آب": "August",
        "أيلول": "September",
        "تشرين الأول": "October",
        "تشرين الثاني": "November",
        "كانون الأول": "December",

        // ── Input placeholders ──
        "مثال: ZENO Announcement": "Example: ZENO Announcement",
        "مثال: ZENO Bot • اليوم": "Example: ZENO Bot • Today",
        "مثال: 123456789012345678": "Example: 123456789012345678",
        "مثال: Discord Nitro لمدة شهر": "Example: Discord Nitro for a month",
        "مثال: تقديم الإدارة / تقديم الدعم الفني": "Example: Management application / Support application",
        "عنوان الرسالة الرئيسي...": "Main message title...",
        "عنوان الحقل...": "Field title...",
        "قيمة ومحتوى الحقل...": "Field value and content...",
        "اكتب الرد...": "Write reply...",
        "اكتب الكلمة أو العبارة...": "Write the word or phrase...",
        "اكتب عنواناً مختصراً...": "Write a short title...",
        "اكتب كلمة محظورة...": "Write a banned word...",
        "اكتب كلمة مسموح بها...": "Write an allowed word...",
        "اكتب نص السؤال هنا...": "Write the question text here...",
        "اكتب وصفاً للبوت في هذا السيرفر...": "Write a description for the bot in this server...",
        "شرح مختصر عن المنصب أو الشروط المطلوبة...": "Brief description of the position or requirements...",
        "ابحث عن عضو أو أدخل الـ ID...": "Search for a member or enter the ID...",
        "ابحث عن عضو لإضافته...": "Search for a member to add...",
        "...أضف تفاصيل إضافية": "Add more details...",
        "...ابحث عن سجل": "Search logs...",
        "أيدي_رتبة_1, أيدي_رتبة_2, أيدي_رتبة_3...": "role_id_1, role_id_2, role_id_3...",
        "اشرح فكرتك بالتفصيل وكيف ستفيد السيرفر...": "Explain your idea in detail and how it will benefit the server...",
        "آيدي الكاتيجوري الذي ستنشأ تحته الرومات...": "Category ID where rooms will be created...",
        "أدخل User ID لإضافته إلى Anti Mod": "Enter User ID to add to Anti Mod",
        "أدخل معرف المستخدم (User ID) ثم اضغط إضافة أو Enter": "Enter User ID then press Add or Enter",
        "https://... (أسفل الإيمبد)": "https://... (bottom of embed)",
        "https://... (أعلى اليمين)": "https://... (top right)",
        "https://i.imgur.com/... (رابط البنر المباشر)": "https://i.imgur.com/... (direct banner URL)",
        "https://i.imgur.com/... (رابط الصورة المباشر)": "https://i.imgur.com/... (direct image URL)",
        "0 = غير محدود": "0 = unlimited",

        // ── Sidebar items not yet covered ──
        "الإشراف": "Moderation",
        "الإشراف وإدارة الأعضاء": "Moderation & Members Management",
        "الحماية": "Protection",
        "الحماية / القائمة البيضاء": "Security / Whitelist",
        "الحماية / السجلات": "Security / Logs",
        "النظام الصوتي المؤقت": "Temp Voice System",
        "الميزات الأساسية": "Core Features",
        "الأتمتة": "Automation",
        "الأمان والحماية": "Security & Protection",
        "قناة إحصائيات": "Stat Channel",
        "قناة عدادات": "Counter Channel",
        "نشط الآن": "Now Active",
        "لوحة الترحيب": "Welcome Board",
        "رسالة المغادرة": "Leave Message",
        "رسالة الترحيب": "Welcome Message",

        // ── Common action buttons ──
        "✓ إضافة": "✓ Add",
        "✓ حُفظ": "✓ Saved",
        "✓ حُفظت الإعدادات": "✓ Settings saved",
        "✓ مفعّل حالياً": "✓ Currently active",
        "↻ تحديث": "↻ Refresh",
        "✏️ تعديل": "✏️ Edit",
        "✕ حذف": "✕ Delete",
        "⭐ تعديل النقاط": "⭐ Edit Points",
        "⭐ نقاط البونص": "⭐ Bonus Points",
        "✨ تطبيق على جميع السجلات المفعلة": "✨ Apply to all active logs",
        "🚀 إرسال": "🚀 Send",
        "🚀 إرسال البانل في القناة": "🚀 Send Panel to Channel",
        "🚀 إرسال لوحة الحضور (Login/Logout)": "🚀 Send Attendance Panel (Login/Logout)",
        "🚀 تم التنفيذ": "🚀 Done",
        "⏹️ إيقاف البث": "⏹️ Stop Stream",
        "▶️ تشغيل الآن في الروم الصوتي": "▶️ Play Now in Voice Room",
        "🗳️ صوّت الآن على Top.gg": "🗳️ Vote Now on Top.gg",
        "➕ إضافة البوت لسيرفرك": "➕ Add Bot to Your Server",
        "🗑️ تصفير كل الدعوات": "🗑️ Reset All Invites",
        "🎁 إضافة أو خصم دعوات إضافية (Bonus Invites)": "🎁 Add or Deduct Bonus Invites",
        "+ إضافة سؤال (حتى 5)": "+ Add Question (up to 5)",
        "+ إنشاء قيف اواي": "+ Create Giveaway",
        "+ إنشاء نموذج جديد": "+ Create New Form",
        "🔄 تصفير الإحصائيات": "🔄 Reset Stats",
        "اضغط Enter للإضافة السريعة": "Press Enter for quick add",

        // ── Status & badge labels ──
        "✅ مقبول": "✅ Accepted",
        "❌ مرفوض": "❌ Rejected",
        "⏳ عزل": "⏳ Timeout",
        "⏳ قيد المراجعة": "⏳ Under Review",
        "🟢 في الخدمة الآن": "🟢 On duty now",
        "💡 اقتراح عام": "💡 General Suggestion",
        "⚠️ شكوى أو بلاغ": "⚠️ Complaint or Report",
        "🎉 فعاليات ومسابقات": "🎉 Events & Contests",
        "🔘 زر (Button)": "🔘 Button",
        "😊 تفاعل (Reaction)": "😊 Reaction",

        // ── Stats counters ──
        "مفعل": "active",
        "دقائق": "minutes",
        "ساعتان": "2 hours",
        "أيام": "days",
        "سجل": "log",
        "الأقسام": "Sections",

        // ── Misc UI strings ──
        "اختر القارئ أو الإذاعة": "Choose a reciter or station",
        "اختر بنر": "Choose banner",
        "اختر صورة": "Choose image",
        "اختصارات مخصصة": "Custom shortcuts",
        "إجابة قصيرة (Short Answer)": "Short Answer",
        "إجراء مكافحة الغزو": "Anti-Raid action",
        "إداري مسجل": "Registered admin",
        "إداريون مسجلون دخول ويستقبلون التذاكر وخدمة الأعضاء الآن": "Admins logged in and receiving tickets and member service now",
        "إداريين مسجلين": "Registered admins",
        "إذا تركته فارغاً سيستخدم البوت النص الافتراضي": "If left empty, the bot will use the default text",
        "إذا تريد فقط Embed أو صورة بدون نص، اترك الرسالة فارغة.": "If you want only an Embed or image without text, leave the message empty.",
        "اترك فارغاً لاستخدام القناة الافتراضية للقسم": "Leave empty to use category default channel",
        "اتركها فارغة لاستخدام القناة الافتراضية للقسم": "Leave empty to use the section default channel",
        "احتفظ بنسخة من قنوات ورتب سيرفرك وأعدها بضغطة زر": "Keep a backup of your server channels and roles and restore them with one click",
        "أحدث سجلات الأمان والإشراف المسجلة لحظياً": "Latest real-time security and moderation logs",
        "ابدأ بإنشاء أول قيف اواي لسيرفرك!": "Start by creating the first giveaway for your server!",
        "اضغط أو الصق رابط صورة جديدة": "Click or paste a new image link",
        "اضغط على زر \"إنشاء نموذج جديد\" بالأعلى لإنشاء أول استمارة تقديم": "Click the \"Create New Form\" button above to create the first application form",
        "أضف أعضاء موثوقين أعلاه لاستثنائهم من قيود الحماية": "Add trusted members above to exempt them from protection restrictions",
        "أضف رتب لمكافأة الأعضاء النشطين": "Add roles to reward active members",
        "أضف رتب يحصل عليها الأعضاء عند الوصول لمستوى صوتي معين": "Add roles members receive when reaching a specific voice level",
        "أضف رتب يحصل عليها الأعضاء عند الوصول لمستوى كتابي معين": "Add roles members receive when reaching a specific text level",
        "احصل على": "Get",
        "استعادة": "Restore",
        "استلام الرصيد اليومي": "Claim daily balance",
        "اسم البوت في السيرفر": "Bot name in server",
        "اسم النموذج (العنوان)": "Form name (title)",
        "إشعار الأونر عبر DM": "Owner notification via DM",
        "أسئلة نموذج التقديم (Discord Modal)": "Application form questions (Discord Modal)",
        "أسبوع كامل": "Full week",
        "أدوات البوت الخاص": "Private bot tools",
        "أدوات الشات": "Chat tools",
        "أخرى": "Other",
        "⚪ رمادي (Secondary)": "⚪ Gray (Secondary)",
        "🔴 أحمر (Danger)": "🔴 Red (Danger)",
        "🔵 أزرق (Primary)": "🔵 Blue (Primary)",
        "🟢 أخضر (Success)": "🟢 Green (Success)",
        "🖼️ [صورة البنر أو بطاقة الترحيب]": "🖼️ [Welcome banner or card]",
        "🖼️ [صورة البنر أو بطاقة المغادرة]": "🖼️ [Leave banner or card]",
        "إذاعة القاهرة 🇪🇬": "Cairo Radio 🇪🇬",
        "إذاعة مكة المكرمة 🇸🇦": "Makkah Radio 🇸🇦",
        "📻 إذاعة القرآن الكريم من القاهرة (مباشر 24/7)": "📻 Holy Quran Radio from Cairo (Live 24/7)",
        "📻 إذاعة القرآن الكريم من مكة المكرمة (مباشر 24/7)": "📻 Holy Quran Radio from Makkah (Live 24/7)",
        "⚙️ إدارة السيرفر": "⚙️ Manage Server",
        "⚠️ تأكد أن البوت لديه صلاحية إدارة القنوات (Manage Channels)": "⚠️ Make sure the bot has Manage Channels permission",
        "⚡ تسجيل الخروج التلقائي (Auto Logout)": "⚡ Auto Logout",
        "✨ دعوة نشطة في السيرفر": "✨ Active invite in server",
        "🏆 قائمة متصدري الدعوات (Top Invites Leaderboard)": "🏆 Top Invites Leaderboard",
        "📡 مربوطة بـ:": "📡 Connected to:",
        "• الصور يجب أن تكون بروابط مباشرة بصيغة PNG أو JPG أو WEBP أو GIF.": "• Images must be direct links in PNG, JPG, WEBP, or GIF format.",
        "• تغيير الاسم والصورة والبنر يؤثر فقط على السيرفر المحدد.": "• Changing the name, avatar, and banner only affects the selected server.",
        "• قد يستغرق ظهور التغييرات بضع ثوانٍ في ديسكورد فور الضغط على حفظ.": "• Changes may take a few seconds to appear in Discord after saving.",
        "إرسال إشعار رفع المستوى برسالة خاصة في DM": "Send level-up notification via DM",
        "إرسال تنبيه خاص لأونر السيرفر عند رصد أي غزو": "Send private alert to server owner when a raid is detected",
        "إرسال رسالة أو إمبد ترحيبي عند انضمام عضو جديد للسيرفر": "Send a welcome message or embed when a new member joins the server",
        "إرسال رسالة خاصة": "Send private message",
        "إرسال رسالة عند اختيار الفائزين": "Send message when winners are selected",
        "إرسال رسالة عند رفع المستوى": "Send message on level up",
        "إرسال رسالة عند مغادرة عضو من السيرفر": "Send message when a member leaves the server",
        "أرسل لوحة الحضور عبر الزر بالأعلى وسيبدأ حساب الساعات فور تسجيل الإداريين": "Send the attendance panel using the button above and hours will be counted as soon as admins log in",
        "إزعاج الإيموجي": "Emoji Spam",
        "إزعاج Spoilers": "Spoiler Spam",
        "إجمالي الاستخدام": "Total Usage",
        "إجمالي الاقتراحات": "Total Suggestions",
        "إجمالي الأوامر": "Total Commands",
        "إجمالي التذاكر المسجلة": "Total Registered Tickets",
        "إجمالي الدعوات الصالحة": "Total Valid Invites",
        "إجمالي الردود": "Total Replies",
        "إجمالي القيف اواي": "Total Giveaways",
        "إجمالي المشاركين": "Total Participants",
        "إجمالي النماذج": "Total Forms",
        "إجمالي ساعات تواجد الإداري": "Total Admin Hours",
        "إجمالي قنوات السيرفر": "Total Server Channels",
        "إحصائيات السيرفر": "Server Statistics",
        "إدارة الرتب": "Manage Roles",
        "إدارة الصوت": "Manage Voice",
        "إدارة القنوات": "Manage Channels",
        "إدارة قنوات العدادات 📡": "Manage Counter Channels 📡",
        "إدارة سيرفر": "Server Management"
    };

    // Sort phrases by length descending to prevent sub-word collision
    let sortedDictionaryKeys = null;
    function getSortedKeys() {
        if (!sortedDictionaryKeys) {
            sortedDictionaryKeys = Object.keys(dictionary).sort((a, b) => b.length - a.length);
        }
        return sortedDictionaryKeys;
    }

    // Auto-detect device/browser language
    function detectInitialLanguage() {
        const saved = localStorage.getItem('zeno_dashboard_lang');
        if (saved === 'ar' || saved === 'en') {
            return saved;
        }
        const browserLang = (navigator.language || navigator.userLanguage || 'ar').toLowerCase();
        return browserLang.startsWith('ar') ? 'ar' : 'en';
    }

    let currentLang = detectInitialLanguage();

    function setLanguage(lang) {
        if (lang !== 'ar' && lang !== 'en') return;
        currentLang = lang;
        localStorage.setItem('zeno_dashboard_lang', lang);
        applyLanguage(lang);
    }

    function toggleLanguage() {
        setLanguage(currentLang === 'ar' ? 'en' : 'ar');
    }

    // Translate DOM tree nodes
    function translateNode(node, lang) {
        if (node.nodeType === Node.TEXT_NODE) {
            let text = node.textContent;
            let trimmed = text.trim();
            if (!trimmed) return;

            if (lang === 'en') {
                if (!node._zenoOriginalAr) {
                    node._zenoOriginalAr = text;
                }
                let original = node._zenoOriginalAr;
                let origTrimmed = original.trim();

                if (dictionary[origTrimmed]) {
                    node.textContent = original.replace(origTrimmed, dictionary[origTrimmed]);
                } else {
                    const keys = getSortedKeys();
                    for (let i = 0; i < keys.length; i++) {
                        const ar = keys[i];
                        if (ar.length < 2) continue;
                        if (original.includes(ar)) {
                            // If key has spaces or is long (>= 4 chars), replace directly
                            // Otherwise, ensure it matches a discrete word boundary or standalone phrase
                            if (ar.indexOf(' ') !== -1 || ar.length >= 4) {
                                original = original.split(ar).join(dictionary[ar]);
                            } else {
                                // Short words (2-3 chars) like 'من', 'كل': only replace when surrounded by space or punctuation
                                const escaped = ar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                const rx = new RegExp('(^|\\s|[.,!?:;()\\-\\[\\]])' + escaped + '(?=$|\\s|[.,!?:;()\\-\\[\\]])', 'g');
                                original = original.replace(rx, '$1' + dictionary[ar]);
                            }
                        }
                    }
                    node.textContent = original;
                }
            } else {
                if (node._zenoOriginalAr) {
                    node.textContent = node._zenoOriginalAr;
                }
            }
            return;
        }

        // Avoid translating script, style, code elements
        if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'CODE') {
            return;
        }

        // Check attributes like placeholder, title
        if (node.getAttribute) {
            const placeholder = node.getAttribute('placeholder');
            if (placeholder) {
                if (lang === 'en') {
                    if (!node._zenoOrigPlaceholder) node._zenoOrigPlaceholder = placeholder;
                    const trimmed = node._zenoOrigPlaceholder.trim();
                    if (dictionary[trimmed]) {
                        node.setAttribute('placeholder', dictionary[trimmed]);
                    } else {
                        let orig = node._zenoOrigPlaceholder;
                        const keys = getSortedKeys();
                        for (let i = 0; i < keys.length; i++) {
                            const ar = keys[i];
                            if (orig.includes(ar)) orig = orig.split(ar).join(dictionary[ar]);
                        }
                        node.setAttribute('placeholder', orig);
                    }
                } else if (node._zenoOrigPlaceholder) {
                    node.setAttribute('placeholder', node._zenoOrigPlaceholder);
                }
            }
            const title = node.getAttribute('title');
            if (title) {
                if (lang === 'en') {
                    if (!node._zenoOrigTitle) node._zenoOrigTitle = title;
                    const trimmed = node._zenoOrigTitle.trim();
                    if (dictionary[trimmed]) {
                        node.setAttribute('title', dictionary[trimmed]);
                    } else {
                        let orig = node._zenoOrigTitle;
                        const keys = getSortedKeys();
                        for (let i = 0; i < keys.length; i++) {
                            const ar = keys[i];
                            if (orig.includes(ar)) orig = orig.split(ar).join(dictionary[ar]);
                        }
                        node.setAttribute('title', orig);
                    }
                } else if (node._zenoOrigTitle) {
                    node.setAttribute('title', node._zenoOrigTitle);
                }
            }
        }

        for (let i = 0; i < node.childNodes.length; i++) {
            translateNode(node.childNodes[i], lang);
        }
    }

    let enStyleElement = null;
    function updateLayoutStyles(lang) {
        if (lang === 'en') {
            if (!enStyleElement) {
                enStyleElement = document.createElement('style');
                enStyleElement.id = 'zeno-en-layout-overrides';
                enStyleElement.textContent = `
                    html[dir="ltr"] [dir="rtl"] {
                        direction: ltr !important;
                    }
                    html[dir="ltr"] .text-right {
                        text-align: left !important;
                    }
                    html[dir="ltr"] .justify-end {
                        justify-content: flex-start !important;
                    }
                    html[dir="ltr"] .items-end {
                        align-items: flex-start !important;
                    }
                    html[dir="ltr"] aside.border-l {
                        border-left-width: 0 !important;
                        border-right-width: 1px !important;
                    }
                    html[dir="ltr"] .flex-row-reverse {
                        flex-direction: row !important;
                    }
                `;
                document.head.appendChild(enStyleElement);
            }
        } else {
            if (enStyleElement && enStyleElement.parentNode) {
                enStyleElement.parentNode.removeChild(enStyleElement);
                enStyleElement = null;
            }
        }
    }

    function applyLanguage(lang) {
        const html = document.documentElement;
        html.setAttribute('lang', lang);
        html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

        updateLayoutStyles(lang);

        // Translate the whole body
        if (document.body) {
            translateNode(document.body, lang);
        }

        // Update toggle buttons text & flag
        document.querySelectorAll('.zeno-lang-toggle-btn').forEach(btn => {
            btn.innerHTML = lang === 'ar' 
                ? '<span class="text-sm">🌐</span><span class="font-black text-xs uppercase tracking-wider">EN</span>' 
                : '<span class="text-sm">🌐</span><span class="font-black text-xs uppercase tracking-wider">AR</span>';
        });
    }

    window.zenoI18n = {
        getLang: () => currentLang,
        setLang: setLanguage,
        toggleLang: toggleLanguage,
        apply: () => applyLanguage(currentLang)
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => applyLanguage(currentLang));
    } else {
        applyLanguage(currentLang);
    }

    // Observer for dynamically added elements (tabs, modals, AJAX content)
    const observer = new MutationObserver((mutations) => {
        if (currentLang === 'en') {
            for (const mutation of mutations) {
                for (let i = 0; i < mutation.addedNodes.length; i++) {
                    translateNode(mutation.addedNodes[i], 'en');
                }
            }
        }
    });

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    // Listen for storage changes across all open browser tabs / pages
    window.addEventListener('storage', (e) => {
        if (e.key === 'zeno_dashboard_lang' && (e.newValue === 'ar' || e.newValue === 'en')) {
            currentLang = e.newValue;
            applyLanguage(currentLang);
        }
    });
})();
