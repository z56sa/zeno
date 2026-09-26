document.addEventListener('DOMContentLoaded', () => {
    function t(text) {
        if (window.ZenoI18n && typeof window.ZenoI18n.translate === 'function') {
            return window.ZenoI18n.translate(text);
        }
        return text;
    }

    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]') || form.querySelector('button');
            if (!btn) return;

            const originalText = btn.textContent;
            btn.textContent = t('جارٍ الحفظ...');
            btn.disabled = true;

            try {
                const formData = new FormData(form);
                const data = Object.fromEntries(formData.entries());
                const endpoint = form.getAttribute('action') || window.location.pathname;
                
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(data)
                });
                
                const result = await res.json();
                if (result.success) alert(t('تم الحفظ بنجاح!'));
                else alert(t('خطأ: ') + (result.error || t('فشل في حفظ الإعدادات')));
            } catch (err) {
                alert(t('حدث خطأ في الاتصال'));
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    });
});
