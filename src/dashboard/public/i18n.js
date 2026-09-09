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
        
        // Sidebar & Tabs
        "إدارة سيرفر": "Manage Server",
        "عام": "General",
        "نظرة عامة": "Overview",
        "لوحة المتصدرين": "Leaderboards",
        "أغنى الأثرياء": "Richest Users",
        "أعلى نقاط السمعة & XP": "Top Rep & XP",
        "أخرى": "Other",
        "الراتب اليومي": "Daily Reward",
        "صوّت للبوت": "Vote for Bot",
        "صوّت للبوت على Top.gg": "Vote for Bot on Top.gg",
        "متجر الخلفيات": "Wallpapers Shop",
        "سيرفراتي المدارة": "My Managed Servers",
        
        // Stats & Cards
        "الذهب": "Gold",
        "السمعة": "Reputation",
        "التصنيف": "Rank",
        "المستوى": "Level",
        "الأعضاء": "Members",
        "إجمالي الأعضاء": "Total Members",
        "الأعضاء المتصلون": "Online Members",
        "خوادمك المتاحة للإدارة": "Your Manageable Servers",
        "إدارة السيرفر": "Manage Server",
        "آخر 5 معاملات الذهب": "Recent 5 Gold Transactions",
        "سجل التحويلات والمكافآت": "Transfers & Rewards History",
        "المكافأة اليومية (راتب)": "Daily Reward (Salary)",
        "الملف الشخصي": "Profile",
        "بطاقة الهوية": "ID Card",
        "اليوم": "Today",
        "الرصيد": "Balance",
        
        // Daily Reward Card
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
        
        // Guild Dashboard Sidebar Groups
        "الأخيرة": "Recent",
        "الرسائل والأمبد": "Messages & Embeds",
        "الميزات الأساسية": "Core Features",
        "الرقابة والإشراف": "Moderation & Logs",
        "الحماية المتقدمة": "Advanced Protection",
        "الإدارة والمنظومة": "Administration",
        "التفاعل والأنشطة": "Engagement",
        "القرآن والمحتوى الإسلامي": "Quran & Islamic",
        
        // Guild Sidebar Sections
        "مظهر البوت": "Bot Appearance",
        "الإعدادات": "Settings",
        "الإحصائيات": "Analytics",
        "الأوامر": "Commands",
        "الترحيب & المغادرة": "Welcome & Leave",
        "الرد التلقائي": "Auto Responder",
        "نظام التذاكر": "Ticket System",
        "رسائل الأمبد": "Embed Messages",
        "نظام الإعلانات": "Broadcast System",
        "الإشراف وحظر الأعضاء": "Moderation & Bans",
        "الرقابة التلقائية": "AutoMod Rules",
        "سجلات السيرفر": "Server Logs",
        "مكافحة الغزو والحسابات": "Anti-Raid & Bots",
        "جدار الحماية الشامل": "Comprehensive Shield",
        "تتبع نشاط الإدارة": "Staff Activity Tracking",
        "الرومات الصوتية المؤقتة": "Temp Voice Channels",
        "تنبيهات البوست": "Boost Notifications",
        "رتب الألوان": "Color Roles",
        "المستويات والخبرة": "Levels & XP",
        "الرتب التلقائية": "Auto Roles",
        "المسابقات والفعاليات": "Giveaways",
        "الاقتراحات والشكاوي": "Suggestions & Feedback",
        "متتبع الدعوات": "Invite Tracker",
        "إذاعة القرآن الكريم": "Quran Radio 24/7",
        "التقديمات والتوظيف": "Staff Applications",
        "جديد": "New",
        
        // Empty State
        "لا توجد سيرفرات مشتركة لديك صلاحيات إدارتها": "No manageable servers found",
        "لإدارة سيرفر، يجب أن تكون مالك السيرفر أو تملك رتبة إدارية (Manage Server أو Administrator) ويكون البوت مضافاً في السيرفر.": "To manage a server, you must be the owner or have Administrator / Manage Server permissions, and the bot must be invited.",
        "إضافة البوت لسيرفرك": "Add Bot to Server",
        
        // Landing Page Texts
        "جديد: نظام التذاكر والتحكم المتطور": "New: Advanced Ticket & Control System",
        "اصنع خادم ديسكورد": "Build a Professional",
        "احترافي!": "Discord Server!",
        "إضافة البوت في Discord": "Add Bot to Discord",
        "السيرفرات النشطة": "Active Servers",
        "سرعة الاستجابة": "Response Latency",
        "مستخدم نشط": "Active Users"
    };

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
                    // Check sub-phrases
                    for (const [ar, en] of Object.entries(dictionary)) {
                        if (original.includes(ar)) {
                            original = original.split(ar).join(en);
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
                    if (dictionary[trimmed]) node.setAttribute('placeholder', dictionary[trimmed]);
                } else if (node._zenoOrigPlaceholder) {
                    node.setAttribute('placeholder', node._zenoOrigPlaceholder);
                }
            }
            const title = node.getAttribute('title');
            if (title) {
                if (lang === 'en') {
                    if (!node._zenoOrigTitle) node._zenoOrigTitle = title;
                    const trimmed = node._zenoOrigTitle.trim();
                    if (dictionary[trimmed]) node.setAttribute('title', dictionary[trimmed]);
                } else if (node._zenoOrigTitle) {
                    node.setAttribute('title', node._zenoOrigTitle);
                }
            }
        }

        for (let i = 0; i < node.childNodes.length; i++) {
            translateNode(node.childNodes[i], lang);
        }
    }

    function applyLanguage(lang) {
        const html = document.documentElement;
        html.setAttribute('lang', lang);
        html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

        // Translate the whole body
        if (document.body) {
            translateNode(document.body, lang);
        }

        // Update toggle buttons text & flag
        document.querySelectorAll('.zeno-lang-toggle-btn').forEach(btn => {
            btn.innerHTML = lang === 'ar' 
                ? '<span class=\"text-sm\">🌐</span><span class=\"font-bold text-xs\">English</span>' 
                : '<span class=\"text-sm\">🌐</span><span class=\"font-bold text-xs\">العربية</span>';
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
