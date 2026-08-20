/**
 * ============================================================
 *  Zeno Dashboard - server.js
 *  سيرفر الداشبورد الخاص ببوت ديسكورد "Zeno"
 * ============================================================
 *
 *  الميزات:
 *  - تسجيل دخول عبر Discord OAuth2 (Passport)
 *  - جلسات آمنة (express-session)
 *  - حماية من هجمات (helmet, rate-limit, CORS محدد)
 *  - عرض السيرفرات التي يملك فيها المستخدم صلاحية Manage Server
 *  - عرض حالة/إحصائيات البوت (Ping - عدد السيرفرات - عدد المستخدمين)
 *  - ربط اختياري مع discord.js لجلب بيانات حية من البوت
 *
 *  التثبيت المطلوب:
 *  npm install express express-session passport passport-discord
 *  npm install dotenv helmet cors express-rate-limit connect-mongo
 *  npm install discord.js axios
 * ============================================================
 */

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const axios = require('axios');

// ============================================================
// إعدادات أساسية - عدّل هذه القيم عبر ملف .env
// ============================================================
const {
    CLIENT_ID = '1506005273893146775',
    CLIENT_SECRET,          // Client Secret من Discord Developer Portal
    BOT_TOKEN,               // توكن البوت (اختياري - لجلب بيانات حية)
    SESSION_SECRET = 'change_this_secret_before_production',
    CALLBACK_URL = 'http://localhost:3000/auth/discord/callback',
    PORT = 3000,
    SUPPORT_SERVER = 'https://discord.gg/uxqQDtbVMz',
    INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}`,
    MONGO_URI, // اختياري: لتخزين الجلسات بشكل دائم
} = process.env;

if (!CLIENT_SECRET) {
    console.error('❌ خطأ: يجب تعيين CLIENT_SECRET في ملف .env');
    process.exit(1);
}

const app = express();

// ============================================================
// الحماية العامة
// ============================================================
app.use(helmet({
    contentSecurityPolicy: false, // فعّلها وخصصها لاحقاً حسب الواجهة
}));

app.use(cors({
    origin: process.env.DASHBOARD_URL || true,
    credentials: true,
}));

// تحديد عدد الطلبات لمنع إساءة الاستخدام
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'طلبات كثيرة جداً، حاول لاحقاً.' },
});
app.use(globalLimiter);

const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    message: { error: 'محاولات دخول كثيرة، حاول لاحقاً.' },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// إعداد الجلسات
// ============================================================
const sessionConfig = {
    name: 'zeno.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // أسبوع
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
    },
};

// إن أردت جلسات دائمة عبر MongoDB بدل الذاكرة (يُفضّل في الإنتاج)
if (MONGO_URI) {
    const MongoStore = require('connect-mongo');
    sessionConfig.store = MongoStore.create({ mongoUrl: MONGO_URI });
}

app.use(session(sessionConfig));
app.use(passport.initialize());
app.use(passport.session());

// ============================================================
// إعداد Passport + Discord Strategy
// ============================================================
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: CALLBACK_URL,
    scope: ['identify', 'guilds'],
}, (accessToken, refreshToken, profile, done) => {
    profile.accessToken = accessToken;
    process.nextTick(() => done(null, profile));
}));

// Middleware للتحقق من تسجيل الدخول
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً', loginUrl: '/auth/discord' });
}

// ============================================================
// (اختياري) الاتصال ببوت ديسكورد عبر discord.js لجلب بيانات حية
// ============================================================
let botClient = null;
if (BOT_TOKEN) {
    const { Client, GatewayIntentBits } = require('discord.js');
    botClient = new Client({
        intents: [GatewayIntentBits.Guilds],
    });
    botClient.login(BOT_TOKEN).catch((err) => {
        console.error('⚠️ فشل تسجيل دخول البوت:', err.message);
    });
    botClient.once('ready', () => {
        console.log(`🤖 البوت متصل باسم: ${botClient.user.tag}`);
    });
}

// ============================================================
// المسارات - المصادقة (Auth)
// ============================================================
app.get('/auth/discord', authLimiter, passport.authenticate('discord'));

app.get('/auth/discord/callback', authLimiter,
    passport.authenticate('discord', { failureRedirect: '/' }),
    (req, res) => {
        res.redirect('/dashboard');
    }
);

app.get('/auth/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        req.session.destroy(() => {
            res.clearCookie('zeno.sid');
            res.redirect('/');
        });
    });
});

// ============================================================
// المسارات - المستخدم والسيرفرات
// ============================================================
app.get('/api/user', ensureAuthenticated, (req, res) => {
    const { id, username, discriminator, avatar, email } = req.user;
    res.json({
        id,
        username,
        discriminator,
        email: email || null,
        avatarUrl: avatar
            ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=256`
            : `https://cdn.discordapp.com/embed/avatars/${(discriminator || 0) % 5}.png`,
    });
});

// صلاحية MANAGE_GUILD = 0x20
const MANAGE_GUILD = 0x20;

app.get('/api/guilds', ensureAuthenticated, async (req, res) => {
    try {
        const manageable = req.user.guilds.filter((g) => {
            const perms = BigInt(g.permissions);
            return g.owner || (perms & BigInt(MANAGE_GUILD)) === BigInt(MANAGE_GUILD);
        });

        // إن كان البوت متصلاً، نحدد أي سيرفر منها فيه البوت فعلياً
        let botGuildIds = new Set();
        if (botClient && botClient.isReady()) {
            botGuildIds = new Set(botClient.guilds.cache.map((g) => g.id));
        }

        const result = manageable.map((g) => ({
            id: g.id,
            name: g.name,
            icon: g.icon
                ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128`
                : null,
            botInGuild: botGuildIds.has(g.id),
            inviteUrl: `${INVITE_URL}&guild_id=${g.id}&disable_guild_select=true&permissions=8&scope=bot%20applications.commands`,
        }));

        res.json({ guilds: result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'تعذر جلب السيرفرات' });
    }
});

app.get('/api/guilds/:guildId', ensureAuthenticated, async (req, res) => {
    const { guildId } = req.params;

    const userGuild = req.user.guilds.find((g) => g.id === guildId);
    if (!userGuild) {
        return res.status(403).json({ error: 'لا تملك صلاحية على هذا السيرفر' });
    }

    if (!botClient || !botClient.isReady()) {
        return res.status(503).json({ error: 'البوت غير متصل حالياً' });
    }

    const guild = botClient.guilds.cache.get(guildId);
    if (!guild) {
        return res.status(404).json({ error: 'البوت غير موجود في هذا السيرفر', inviteUrl: INVITE_URL });
    }

    res.json({
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
        icon: guild.iconURL({ size: 256 }),
        channels: guild.channels.cache.size,
        roles: guild.roles.cache.size,
        createdAt: guild.createdAt,
    });
});

// ============================================================
// المسارات - إحصائيات البوت العامة
// ============================================================
app.get('/api/stats', async (req, res) => {
    if (!botClient || !botClient.isReady()) {
        return res.json({
            online: false,
            servers: null,
            users: null,
            ping: null,
        });
    }

    const servers = botClient.guilds.cache.size;
    const users = botClient.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);

    res.json({
        online: true,
        servers,
        users,
        ping: Math.round(botClient.ws.ping),
        supportServer: SUPPORT_SERVER,
        inviteUrl: INVITE_URL,
    });
});

// ============================================================
// روابط عامة (بدون تسجيل دخول)
// ============================================================
app.get('/api/links', (req, res) => {
    res.json({
        support: SUPPORT_SERVER,
        invite: INVITE_URL,
    });
});

// ============================================================
// خدمة صفحة الداشبورد (Frontend يجب أن يكون في مجلد /public)
// ============================================================
app.get('/dashboard', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// معالجة الأخطاء العامة
// ============================================================
app.use((req, res) => {
    res.status(404).json({ error: 'الصفحة غير موجودة' });
});

app.use((err, req, res, next) => {
    console.error('❌ خطأ في السيرفر:', err);
    res.status(500).json({ error: 'حدث خطأ داخلي في السيرفر' });
});

// ============================================================
// تشغيل السيرفر
// ============================================================
app.listen(PORT, () => {
    console.log(`✅ داشبورد Zeno يعمل الآن على المنفذ ${PORT}`);
    console.log(`🔗 رابط الدعوة: ${INVITE_URL}`);
    console.log(`🛠️  سيرفر الدعم الفني: ${SUPPORT_SERVER}`);
});

module.exports = app;