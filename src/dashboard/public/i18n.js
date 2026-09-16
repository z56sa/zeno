(function () {
    const dictionary = {
        "حفظ التغييرات": "Save Changes",
        "لوحة التحكم": "Dashboard",
        "تسجيل الخروج": "Logout",
        "الدعم الفني": "Support Server",
        "المميزات والأنظمة": "Features & Systems",
        "نظرة عامة": "Overview",
        "الترحيب & المغادرة": "Welcome & Leave",
        "الرد التلقائي": "Auto Responder",
        "نظام التذاكر": "Ticket System"
        // يمكننا إضافة بقية القاموس هنا
    };

    let currentLang = 'ar';

    window.zenoI18n = {
        toggleLang: function() {
            currentLang = currentLang === 'ar' ? 'en' : 'ar';
            this.apply();
        },
        apply: function() {
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (dictionary[key]) {
                    el.textContent = currentLang === 'en' ? dictionary[key] : key;
                }
            });
            document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
            document.documentElement.lang = currentLang;
        }
    };
})();