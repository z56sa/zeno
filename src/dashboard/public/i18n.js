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
        "إخراج من السجن": "Unjail member"
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
                        if (original.includes(ar)) {
                            original = original.split(ar).join(dictionary[ar]);
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
})();
