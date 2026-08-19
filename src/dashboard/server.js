// ==========================================
// FILE: src/dashboard/server.js
// ==========================================

const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// مسار لوحة التحكم (مع التحقق من الجلسة)
app.get('/dashboard', (req, res) => {
    // نفترض أن جلسة المستخدم مخزنة في req.session.user أو req.user حسب نظام التحقق عندك (مثل Passport.js)
    if (!req.session || !req.session.user) {
        // إذا لم يكن مسجل دخول، وجهه لتسجيل الدخول بـ Discord
        return res.redirect('/auth/discord');
    }

    // إذا كان مسجل دخول، اعرض له صفحة لوحة التحكم
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

module.exports = app;