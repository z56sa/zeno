/**
 * @file i18n.js
 * @description Localization module for ZENO Dashboard (Arabic & English)
 * Features:
 * - Automatically detects device/browser language (navigator.language)
 * - Allows manual switching via language dropdown/button
 * - Remembers user choice in localStorage ('zeno_dashboard_lang')
 * - Flips document direction (rtl for Arabic, ltr for English)
 */

(function () {
    const translations = {
        ar: {
            "lang_name": "العربية",
            "switch_lang": "Language: AR 🇸🇦",
            "dir": "rtl",
            
            // Common
            "dashboard": "لوحة التحكم",
            "back_to_dashboard": "الرجوع للوحة التحكم",
            "support_server": "سيرفر الدعم",
            "features_systems": "المميزات والأنظمة",
            "logout": "تسجيل الخروج",
            "save_changes": "حفظ التغييرات",
            "saved_successfully": "تم الحفظ وتطبيق التغييرات في السيرفر بنجاح!",
            "all_rights_reserved": "جميع الحقوق محفوظة © ZENO BOT 2026",
            "bot_online": "البوت متصل ويعمل",
            "instant_sync": "يتم تطبيق كل التعديلات وحفظها مباشرة في سيرفر الديسكورد لحظياً بدون إعادة تشغيل.",
            "members": "الأعضاء",
            "gold": "الذهب",
            "reputation": "السمعة",
            "rank": "التصنيف",
            "level": "المستوى",
            "overview": "نظرة عامة",
            
            // Landing Page
            "landing_badge": "✨ جديد: نظام التذاكر والتحكم المتطور",
            "landing_h1_1": "اصنع خادم ديسكورد",
            "landing_h1_2": "احترافي!",
            "landing_desc": "بوت متعدد الأغراض قابل للتخصيص جداً حيث يوفر لك تخصيص صورة كرسالة ترحيبية وسجلات متعمقة وأوامر اجتماعية وإشراف وأكثر ...",
            "add_to_discord": "إضافة البوت للديسكورد",
            "manage_servers": "إدارة سيرفراتك",
            "explore_systems": "استكشف أحدث أنظمة ZENO BOT",
            "explore_subtitle": "كل ما يحتاجه سيرفرك لإدارته وحمايته بأعلى معايير السرعة والاحترافية",
            
            // Manage Page Tabs
            "tab_overview": "نظرة عامة",
            "tab_servers": "سيرفراتي المدارة",
            "tab_daily": "الراتب اليومي",
            "tab_shop": "متجر الخلفيات",
            "tab_leaderboard": "لوحة الشرف والمستويات",
            "claim_daily": "استلام الرصيد اليومي",
            "available_in": "متاح بعد: ",
            "vote_topgg": "التصويت للبوت على Top.gg",
            "vote_desc": "ادعم البوت بتصويتك واحصل على مكافأة ذهب إضافية مجاناً!",
            "vote_now": "صوّت الآن",
            "no_manageable_guilds": "لا توجد سيرفرات مشتركة لديك صلاحيات إدارتها",
            "no_manageable_guilds_sub": "لإدارة سيرفر، يجب أن تكون مالك السيرفر أو تملك رتبة إدارية (Manage Server أو Administrator) ويكون البوت مضافاً في السيرفر.",
            "add_bot_to_server": "إضافة البوت لسيرفرك",
            "manage_server_btn": "إدارة السيرفر",
            
            // Navigation Groups in Guild Page
            "grp_recent": "الأخيرة",
            "grp_general": "عام",
            "grp_messages": "الرسائل والأمبد",
            "grp_core": "الميزات الأساسية",
            "grp_moderation": "الرقابة والإشراف",
            "grp_protection": "الحماية المتقدمة",
            "grp_administration": "الإدارة والمنظومة",
            "grp_interaction": "التفاعل والأنشطة",
            "grp_islamic": "القرآن والمحتوى الإسلامي",
            
            // Sidebar Sections
            "sec_overview": "نظرة عامة",
            "sec_appearance": "مظهر البوت",
            "sec_settings": "الإعدادات",
            "sec_analytics": "الإحصائيات",
            "sec_commands": "الأوامر",
            "sec_welcome": "الترحيب & المغادرة",
            "sec_autoresponder": "الرد التلقائي",
            "sec_tickets": "نظام التذاكر",
            "sec_embed": "رسائل الأمبد",
            "sec_broadcast": "نظام الإعلانات",
            "sec_moderation": "الإشراف وحظر الأعضاء",
            "sec_automod": "الرقابة التلقائية",
            "sec_logs": "سجلات السيرفر",
            "sec_antiraid": "مكافحة الغزو والحسابات",
            "sec_protection": "جدار الحماية الشامل",
            "sec_staff_activity": "تتبع نشاط الإدارة",
            "sec_tempvoice": "الرومات الصوتية المؤقتة",
            "sec_boost": "تنبيهات البوست",
            "sec_colors": "رتب الألوان",
            "sec_levels": "المستويات والخبرة",
            "sec_autoroles": "الرتب التلقائية",
            "sec_giveaways": "المسابقات والفعاليات",
            "sec_suggestions": "الاقتراحات والشكاوي",
            "sec_invites": "متتبع الدعوات",
            "sec_quran": "إذاعة القرآن الكريم",
            "sec_applications": "التقديمات والتوظيف"
        },
        en: {
            "lang_name": "English",
            "switch_lang": "اللغة: EN 🇺🇸",
            "dir": "ltr",
            
            // Common
            "dashboard": "Dashboard",
            "back_to_dashboard": "Back to Dashboard",
            "support_server": "Support Server",
            "features_systems": "Features & Systems",
            "logout": "Logout",
            "save_changes": "Save Changes",
            "saved_successfully": "Settings saved and applied to Discord successfully!",
            "all_rights_reserved": "All rights reserved © ZENO BOT 2026",
            "bot_online": "Bot is Online & Active",
            "instant_sync": "Changes are applied and saved instantly to Discord without restarts.",
            "members": "Members",
            "gold": "Gold",
            "reputation": "Reputation",
            "rank": "Rank",
            "level": "Level",
            "overview": "Overview",
            
            // Landing Page
            "landing_badge": "✨ New: Advanced Ticket & Control System",
            "landing_h1_1": "Build a Professional",
            "landing_h1_2": "Discord Server!",
            "landing_desc": "All-in-one highly customizable bot providing welcome cards, deep server logs, social economy commands, moderation, and much more...",
            "add_to_discord": "Add to Discord",
            "manage_servers": "Manage Your Servers",
            "explore_systems": "Explore ZENO BOT Systems",
            "explore_subtitle": "Everything your server needs for management and protection with speed and quality",
            
            // Manage Page Tabs
            "tab_overview": "Overview",
            "tab_servers": "My Servers",
            "tab_daily": "Daily Salary",
            "tab_shop": "Card Wallpapers Shop",
            "tab_leaderboard": "Leaderboard & Levels",
            "claim_daily": "Claim Daily Reward",
            "available_in": "Available in: ",
            "vote_topgg": "Vote on Top.gg",
            "vote_desc": "Support ZENO Bot with your vote and receive free bonus gold coins!",
            "vote_now": "Vote Now",
            "no_manageable_guilds": "No manageable servers found",
            "no_manageable_guilds_sub": "To manage a server, you must be the owner or have Administrator / Manage Server permissions, and the bot must be invited.",
            "add_bot_to_server": "Add Bot to Server",
            "manage_server_btn": "Manage Server",
            
            // Navigation Groups in Guild Page
            "grp_recent": "Recent",
            "grp_general": "General",
            "grp_messages": "Messages & Embeds",
            "grp_core": "Core Features",
            "grp_moderation": "Moderation & Logs",
            "grp_protection": "Advanced Security",
            "grp_administration": "Staff & Structure",
            "grp_interaction": "Engagement & Social",
            "grp_islamic": "Quran & Islamic Audio",
            
            // Sidebar Sections
            "sec_overview": "Server Overview",
            "sec_appearance": "Bot Appearance",
            "sec_settings": "General Settings",
            "sec_analytics": "Analytics",
            "sec_commands": "Commands List",
            "sec_welcome": "Welcome & Goodbye",
            "sec_autoresponder": "Auto Responder",
            "sec_tickets": "Ticket System",
            "sec_embed": "Embed Builder",
            "sec_broadcast": "Broadcast System",
            "sec_moderation": "Moderation",
            "sec_automod": "AutoMod Rules",
            "sec_logs": "Server Logs",
            "sec_antiraid": "Anti-Raid & Bots",
            "sec_protection": "Server Shield & Anti-Nuke",
            "sec_staff_activity": "Staff Activity Tracking",
            "sec_tempvoice": "Temporary Voice Channels",
            "sec_boost": "Server Boost Alerts",
            "sec_colors": "Color Roles",
            "sec_levels": "Levels & XP System",
            "sec_autoroles": "Auto Roles",
            "sec_giveaways": "Giveaways",
            "sec_suggestions": "Suggestions & Feedback",
            "sec_invites": "Invite Tracker",
            "sec_quran": "Quran Radio 24/7",
            "sec_applications": "Staff Applications"
        }
    };

    function detectInitialLanguage() {
        const saved = localStorage.getItem('zeno_dashboard_lang');
        if (saved === 'ar' || saved === 'en') {
            return saved;
        }
        const browserLang = (navigator.language || navigator.userLanguage || 'ar').toLowerCase();
        if (browserLang.startsWith('ar')) {
            return 'ar';
        } else {
            return 'en';
        }
    }

    let currentLang = detectInitialLanguage();

    function setLanguage(lang) {
        if (!translations[lang]) return;
        currentLang = lang;
        localStorage.setItem('zeno_dashboard_lang', lang);
        applyLanguage(lang);
    }

    function toggleLanguage() {
        const nextLang = currentLang === 'ar' ? 'en' : 'ar';
        setLanguage(nextLang);
    }

    function applyLanguage(lang) {
        const dict = translations[lang] || translations.ar;
        const html = document.documentElement;
        
        html.setAttribute('lang', lang);
        html.setAttribute('dir', dict.dir);

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) {
                el.textContent = dict[key];
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (dict[key]) {
                el.placeholder = dict[key];
            }
        });

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
        t: (key) => (translations[currentLang] && translations[currentLang][key]) || key,
        apply: () => applyLanguage(currentLang)
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => applyLanguage(currentLang));
    } else {
        applyLanguage(currentLang);
    }
})();
