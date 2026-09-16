document.addEventListener('DOMContentLoaded', () => {
    // إصلاح جميع أزرار الحفظ في كل الصفحات
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]') || form.querySelector('button');
            if (!btn) return;

            const originalText = btn.textContent;
            btn.textContent = 'جارٍ الحفظ...';
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
                if (result.success) alert('تم الحفظ بنجاح!');
                else alert('خطأ: ' + (result.error || 'فشل في حفظ الإعدادات'));
            } catch (err) {
                alert('حدث خطأ في الاتصال');
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    });
});