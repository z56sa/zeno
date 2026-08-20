/**
 * ============================================================
 *  Zeno Dashboard - src/dashboard/server.js
 * ============================================================
 *
 *  هذا الملف لا يُنشئ تطبيق Express مستقل ولا يشغّل app.listen().
 *  بدلاً من ذلك يصدّر دالة "mount" تستقبل تطبيق Express الرئيسي
 *  (المُنشأ في src/index.js) وتضيف عليه كل شيء: الجلسات، تسجيل
 *  الدخول عبر Discord، والمسارات (routes) الخاصة بالداشبورد.
 *
 *  في src/index.js يجب أن يبقى الاستدعاء كما هو:
 *      const mountDashboard = require('./dashboard/server');
 *      mountDashboard(app, client); // client اختياري - بوت discord.js
 *
 *  التثبيت المطلوب (في package.json بالجذر):
 *  npm install express express-session passport passport-discord
 *  npm install dotenv helmet cors express-rate-limit connect-mongo axios
 * ============================================================
 */

require('dotenv').config();

const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const {
    CLIENT_ID = '1506005273893146775',
    CLIENT_SECRET,
    SESSION_SECRET = 'change_this_secret_before_production',
    CALLBACK_URL = 'http://localhost:3000/auth/discord/callback',
    SUPPORT_SERVER = 'https://discord.gg/uxqQDtbVMz',
    INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}`,
    MONGO_URI,
} = process.env;

if (!CLIENT_SECRET) {
    console.error('❌ خطأ: يجب تعيين CLIENT_SECRET في ملف .env');
}

/**
 * الدالة الرئيسية: تستقبل تطبيق Express الموجود مسبقاً (app)
 * وتضيف عليه كل شيء يخص الداشبورد، دون إنشاء app جديد أو استدعاء listen().
 *
 * @param {import('express').Express} app - تطبيق Express الرئيسي من index.js
 * @param {import('discord.js').Client} [botClient] - عميل البوت (اختياري)
 */
function mountDashboard(app, botClient = null) {
    // ============================================================
    // الحماية العامة
    // ============================================================
    app.use(helmet({
        contentSecurityPolicy: false,
    }));

    app.use(cors({
        origin: process.env.DASHBOARD_URL || true,
        credentials: true,
    }));

    const globalLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
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

    app.use(express_json_middleware());
    app.use(express_urlencoded_middleware());

    // ============================================================
    // الجلسات
    // ============================================================
    const sessionConfig = {
        name: 'zeno.sid',
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24 * 7,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
        },
    };

    if (MONGO_URI) {
        const MongoStore = require('connect-mongo');
        sessionConfig.store = MongoStore.create({ mongoUrl: MONGO_URI });
    }

    app.use(session(sessionConfig));
    app.use(passport.initialize());
    app.use(passport.session());

    // ============================================================
    // Passport + Discord Strategy
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

    function ensureAuthenticated(req, res, next) {
        if (req.isAuthenticated()) return next();
        return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً', loginUrl: '/auth/discord' });
    }

    // ============================================================
    // مسارات المصادقة
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
    // المستخدم والسيرفرات
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

    const MANAGE_GUILD = 0x20;

    app.get('/api/guilds', ensureAuthenticated, async (req, res) => {
        try {
            const manageable = req.user.guilds.filter((g) => {
                const perms = BigInt(g.permissions);
                return g.owner || (perms & BigInt(MANAGE_GUILD)) === BigInt(MANAGE_GUILD);
            });

            let botGuildIds = new Set();
            if (botClient && botClient.isReady && botClient.isReady()) {
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

        if (!botClient || !botClient.isReady || !botClient.isReady()) {
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
    // إحصائيات عامة عن البوت
    // ============================================================
    app.get('/api/bot-stats', async (req, res) => {
        if (!botClient || !botClient.isReady || !botClient.isReady()) {
            return res.json({ online: false, servers: null, users: null, ping: null });
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

    app.get('/api/links', (req, res) => {
        res.json({ support: SUPPORT_SERVER, invite: INVITE_URL });
    });

    // ============================================================
    // صفحات الداشبورد
    // ============================================================
    app.get('/dashboard', ensureAuthenticated, (req, res) => {
        res.sendFile(path.join(process.cwd(), 'public', 'dashboard.html'));
    });

    console.log('✅ تم تركيب مسارات الداشبورد بنجاح');
    console.log(`🔗 رابط الدعوة: ${INVITE_URL}`);
    console.log(`🛠️  سيرفر الدعم الفني: ${SUPPORT_SERVER}`);
}

// دوال مساعدة صغيرة بدل استدعاء express() كامل (نتجنب إنشاء تطبيق جديد)
function express_json_middleware() {
    return require('express').json();
}
function express_urlencoded_middleware() {
    return require('express').urlencoded({ extended: true });
}

module.exports = mountDashboard;