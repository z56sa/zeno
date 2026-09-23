/**
 * @module server
 * @description Handles the web server setup for the zeno dashboard, managing sessions and routing.
 */

const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const database = require('../database');
const rawDb = database.db;
const SecretManager = require('../utils/secretManager');
const identityWallpapers = require('../data/identityWallpapers.json');
const { askAI } = require('../utils/ai');

module.exports = function (app, client) {
    const sessionStore = new SqliteStore({ client: rawDb });
    let sessionSecret = '';
    try {
        const secrets = SecretManager.getMultipleSecrets(['SESSION_SECRET']);
        sessionSecret = secrets['SESSION_SECRET'] || 'ZENO_DEFAULT_SUPER_SAFE_FALLBACK';
        console.log('[SECURITY] ? Dashboard: Session secret retrieved successfully.');
    } catch (e) {
        sessionSecret = 'ZENO_TICKETS_SUPER_SECRET';
    }

    app.use(express.static(require('path').join(__dirname, 'public'), { index: false }));
    app.use(session({
        store: sessionStore,
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 7 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            secure: false
        }
    }));

    // Helper: Discord OAuth2 config
    const getOAuthConfig = (req) => {
        // ���� ������ ������� ������ ������� ����� ��� �� ��� ������� �� ��������� ���� �� ����
        let clientId = process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID || client?.user?.id || '1506005273893146775';
        if (clientId === '506005273893146775' || !clientId.startsWith('15')) {
            clientId = '1506005273893146775';
        }
        const clientSecret = process.env.CLIENT_SECRET || process.env.DISCORD_CLIENT_SECRET || 'MNeCz9uTvXRzXeEUp8lUckSQeviU-cRY';
        const redirectUri = 'https://zeno-0gme.onrender.com/auth/discord/callback';
        return { clientId, clientSecret, redirectUri };
    };

    // 1. ������ �������� ����� ������� (ProBot Black & Purple Landing Page)
    app.get(['/', '/dashboard'], (req, res) => {
        return res.sendFile(require('path').join(__dirname, 'public', 'index.html'));
    });

    // 1.1 Real Bot Info API - used by landing page stats
    app.get('/api/bot-info', async (req, res) => {
        try {
            const botUser = client?.user;
            const guildsCount = client?.guilds?.cache?.size || 0;
            const ping = client?.ws?.ping || 0;

            // ���� ������ ������� �� �� ���������
            let totalMembers = 0;
            if (client?.guilds?.cache) {
                client.guilds.cache.forEach(guild => {
                    totalMembers += guild.memberCount || 0;
                });
            }

            res.json({
                id: botUser?.id || '1506005273893146775',
                username: botUser?.username || 'ZENO',
                avatar: botUser
                    ? (botUser.avatar ? `https://cdn.discordapp.com/avatars/${botUser.id}/${botUser.avatar}.png?size=128` : `https://cdn.discordapp.com/embed/avatars/${parseInt(botUser.discriminator || '0') % 5}.png`)
                    : null,
                guildsCount,
                ping: Math.max(0, ping),
                usersCount: totalMembers
            });
        } catch (err) {
            res.json({ id: '1506005273893146775', guildsCount: 0, ping: 0, usersCount: 0 });
        }
    });

    // 2. Real Discord OAuth2 Authentication Routes
    app.get('/auth/discord', (req, res) => {
        const { clientId, redirectUri } = getOAuthConfig(req);
        const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=identify+guilds`;
        res.redirect(discordAuthUrl);
    });

    app.get('/auth/discord/callback', async (req, res) => {
        const code = req.query.code;
        if (!code) {
            return res.redirect('/auth/discord');
        }

        const { clientId, clientSecret, redirectUri } = getOAuthConfig(req);
        if (!clientSecret) {
            console.error('[OAUTH ERROR] CLIENT_SECRET is missing from environment variables!');
            return res.status(500).send('��� �� ������� �����: CLIENT_SECRET ��� ���� �� ���� Render.');
        }

        try {
            // Exchange code for Access Token
            const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
            const tokenParams = new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri
            });

            const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${basicAuth}`
                },
                body: tokenParams.toString()
            });

            if (!tokenRes.ok) {
                const errText = await tokenRes.text();
                console.error('[OAUTH ERROR] Token exchange failed:', errText);
                return res.status(400).send(`
                    <div style="background:#0b0d14;color:#fff;font-family:sans-serif;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px;">
                        <h2 style="color:#ef4444;">���� ����� ����� ������ ��� Discord</h2>
                        <p style="color:#aaa;max-width:500px;margin-top:10px;">����� ����� �� Discord: <code>${errText}</code></p>
                        <p style="color:#888;font-size:13px;margin-top:5px;">���� �� ��� Client Secret �� ������� �����.</p>
                        <a href="/" style="color:#a855f7;margin-top:20px;text-decoration:none;font-weight:bold;">������ ������ ��������</a>
                    </div>
                `);
            }

            const tokenData = await tokenRes.json();
            const accessToken = tokenData.access_token;

            // Fetch user profile from Discord
            const userRes = await fetch('https://discord.com/api/v10/users/@me', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (!userRes.ok) throw new Error('��� ��� ������ �������� �� Discord');
            const userData = await userRes.json();

            // Fetch user guilds from Discord
            const guildsRes = await fetch('https://discord.com/api/v10/users/@me/guilds', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (!guildsRes.ok) throw new Error('��� ��� ������� �������� �� Discord');
            const rawGuilds = await guildsRes.json();

            // Filter guilds: User must be Owner OR have MANAGE_GUILD (0x20) or ADMINISTRATOR (0x8)
            // AND Bot must be currently present in this guild
            const ADMIN_OR_MANAGE = 0x8 | 0x20;
            const manageableGuilds = [];

            if (Array.isArray(rawGuilds)) {
                for (const g of rawGuilds) {
                    const isOwner = !!g.owner;
                    const perms = BigInt(g.permissions || '0');
                    const hasPerm = (perms & BigInt(0x8)) !== 0n || (perms & BigInt(0x20)) !== 0n;

                    if (isOwner || hasPerm) {
                        // Check if bot is present in this guild
                        const botGuild = client?.guilds?.cache?.get(g.id);
                        if (botGuild) {
                            manageableGuilds.push({
                                id: g.id,
                                name: g.name,
                                icon: g.icon,
                                memberCount: botGuild.memberCount || 0,
                                permissions: Number(perms & 0xffn) || 8,
                                isOwner: isOwner
                            });
                        }
                    }
                }
            }

            // Save to user session
            req.session.user = {
                id: userData.id,
                username: userData.global_name || userData.username,
                discriminator: userData.discriminator,
                avatar: userData.avatar
            };
            req.session.guilds = manageableGuilds;

            // Redirect directly to dashboard
            res.redirect('/dashboard/manage');
        } catch (err) {
            console.error('[OAUTH ERROR] OAuth callback error:', err);
            res.status(500).send('��� ��� ����� ����� ������: ' + err.message);
        }
    });

    app.get('/logout', (req, res) => {
        req.session?.destroy?.(() => {});
        return res.redirect('/');
    });

    // Bot Info API for public landing pages
    app.get('/api/bot-info', (req, res) => {
        const avatarUrl = client?.user?.avatar 
            ? `https://cdn.discordapp.com/avatars/${client.user.id}/${client.user.avatar}.png` 
            : 'https://cdn.discordapp.com/embed/avatars/0.png';

        // �������� ������ ���������� 100% ����� ��� ��������� �������� ���� ����� ������
        const realGuildsCount = client?.guilds?.cache ? client.guilds.cache.size : 0;

        // ���� ������ ������� �������� ���������� �� �� ����� ����� �����
        let totalMembersCount = 0;
        if (client?.guilds?.cache && client.guilds.cache.size > 0) {
            client.guilds.cache.forEach(g => {
                totalMembersCount += (g.memberCount || 0);
            });
        }

        const realPing = (client?.ws?.ping !== undefined && client.ws.ping >= 0) ? Math.round(client.ws.ping) : 0;

        res.json({
            id: client?.user?.id || '1506005273893146775',
            username: client?.user?.username || 'ZENO',
            avatar: avatarUrl,
            guildsCount: realGuildsCount,
            dashboardUsersCount: totalMembersCount,
            usersCount: totalMembersCount,
            ping: realPing
        });
    });

    // ?? ��� ������ ���� ��������� �������� ���� ����� ��������
    app.get('/api/admin/my-guilds', async (req, res) => {
        try {
            if (!client?.guilds?.cache) return res.json({ guilds: [] });
            const list = [];
            for (const [id, g] of client.guilds.cache) {
                let ownerTag = '��� �����';
                try {
                    const owner = await g.fetchOwner().catch(() => null);
                    if (owner) ownerTag = `${owner.user.tag} (${owner.id})`;
                } catch(e) {}
                list.push({
                    id: g.id,
                    name: g.name,
                    memberCount: g.memberCount,
                    owner: ownerTag
                });
            }
            res.json({ total: list.length, guilds: list });
        } catch(err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ?? ��� ���� ����� �� ����� ���� ����
    app.post('/api/admin/leave-guild', async (req, res) => {
        try {
            const { guildId } = req.body;
            if (!guildId) return res.status(400).json({ error: 'guildId required' });
            const g = client.guilds.cache.get(guildId);
            if (!g) return res.status(404).json({ error: '������� ��� ����� �� ��� �����' });
            await g.leave();
            res.json({ success: true, message: `�� ���� ����� ����� �� ����� ${g.name}` });
        } catch(err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Endpoint for claiming daily reward from web dashboard
    app.post('/api/user/daily', (req, res) => {
        try {
            // Use real Discord user ID if logged in, else use stable session ID
            const userId = req.session?.user?.id || req.session?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: '��� ����� ������ �����' });
            }
            const now = Date.now();
            const cooldown = 24 * 60 * 60 * 1000;

            const lastDaily = database.getLastDaily(userId);
            if (now - lastDaily < cooldown) {
                const remaining = cooldown - (now - lastDaily);
                const h = Math.floor(remaining / 3600000);
                const m = Math.floor((remaining % 3600000) / 60000);
                return res.status(400).json({
                    success: false,
                    error: `��� ������ ����� ������ ������! �������� ������� ��� ${h} ���� � ${m} �����.`
                });
            }

            // Determine active guild
            let targetGuildId = 'global';
            if (client?.guilds?.cache?.size > 0) {
                targetGuildId = client.guilds.cache.first().id;
            }

            const userData = database.getUser(userId, targetGuildId);
            let streak = userData.streak || 0;
            const twoDaysMs = 48 * 60 * 60 * 1000;
            if (now - lastDaily <= twoDaysMs && lastDaily > 0) {
                streak += 1;
            } else {
                streak = 1;
            }

            // Base reward 500 gold with streak bonus
            let reward = 500;
            if (streak >= 30) reward = 1000;
            else if (streak >= 7) reward = 750;
            else if (streak >= 3) reward = 600;

            database.addCoins(userId, targetGuildId, reward);
            database.setLastDaily(userId, targetGuildId, now, streak);

            const updatedUser = database.getUser(userId, targetGuildId);
            const newBalance = updatedUser.coins || updatedUser.credits || 0;

            return res.json({
                success: true,
                amount: reward,
                streak,
                newBalance
            });
        } catch (err) {
            console.error('Error claiming web daily:', err);
            return res.status(500).json({ success: false, error: '��� ��� ����� ������ ������ ������: ' + err.message });
        }
    });

    // ========================================================
    // ?? ECONOMY API ENDPOINTS (Live Persistent Dashboard API)
    // ========================================================
    
    // 1. Get Guild Economy Leaderboard
    app.get('/api/guilds/:guildId/economy/leaderboard', (req, res) => {
        try {
            const { guildId } = req.params;
            const limit = Math.min(parseInt(req.query.limit) || 10, 100);
            const leaderboard = db.getCoinsLeaderboard(guildId, limit);
            res.json({ success: true, leaderboard });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 2. Get User Balance
    app.get('/api/guilds/:guildId/economy/users/:userId', (req, res) => {
        try {
            const { guildId, userId } = req.params;
            const user = db.getUser(userId, guildId);
            res.json({
                success: true,
                user: {
                    userId: user.user_id,
                    guildId: user.guild_id,
                    balance: user.coins || 0,
                    level: user.level || 1,
                    xp: user.xp || 0,
                    lastDaily: user.last_daily || 0
                }
            });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 3. Admin Manage User Balance (Add / Remove / Set) with instant persistent write
    app.post('/api/guilds/:guildId/economy/manage', (req, res) => {
        try {
            if (!req.session?.user) {
                return res.status(401).json({ success: false, error: '��� ����� ������ �����' });
            }

            const { guildId } = req.params;
            const { targetUserId, action, amount } = req.body;
            const val = parseInt(amount, 10);

            if (!targetUserId || isNaN(val) || val < 0) {
                return res.status(400).json({ success: false, error: '������ ��� �����' });
            }

            let newBalance = 0;
            if (action === 'set') {
                newBalance = db.setCoins(targetUserId, guildId, val);
            } else if (action === 'add') {
                newBalance = db.addCoins(targetUserId, guildId, val);
            } else if (action === 'remove') {
                newBalance = db.removeCoins(targetUserId, guildId, val);
            } else {
                return res.status(400).json({ success: false, error: '����� ��� �����' });
            }

            res.json({
                success: true,
                message: '�� ����� ������ ����� ����� �� ����� ��������',
                targetUserId,
                newBalance
            });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });


    // API: ��� ������� �������
    app.post('/api/logs/save', (req, res) => {
        try {
            const { settings } = req.body;
            // ����� ��� ����� ����� ����� �� database.updateLogsSettings(settings)
            console.log('Received log settings:', settings);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 3. User Dashboard & Main Routes (���� ������ �������� ���������)
    app.get('/dashboard/manage', (req, res) => {
        try {
            // ������ �� ����� ���� �������� ��� Discord OAuth2
            let user = req.session?.user || null;
            if (!user) {
                return res.redirect('/auth/discord');
            }

            // ��� ��� ��������� ���� ����� ���� �������� ������ ����� �������� ���� �����
            let guilds = req.session?.guilds || [];

            // �� ��� �� ����� ����� ���� ����� ����� ����� ����� �� �������� �������
            if (client?.guilds?.cache) {
                guilds = guilds.filter(g => client.guilds.cache.has(g.id));
            }

            const userAvatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
            const botAvatarUrl = client?.user?.avatar ? `https://cdn.discordapp.com/avatars/${client.user.id}/${client.user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

            let userCoins = 0, userLevel = 1, userStars = 0, userXp = 0, userLastDaily = 0, userWallpaper = 'default';
            let xpLeaderboard = [];
            let coinsLeaderboard = [];
            let userRankXp = 1;
            let userRankCoins = 1;

            try {
                const userRow = rawDb.prepare('SELECT SUM(coins) as coins, MAX(level) as level, SUM(reputation) as rep, SUM(xp) as xp, MAX(last_daily) as last_daily, MAX(wallpaper) as wallpaper FROM users WHERE user_id = ?').get(user.id);
                userCoins = userRow?.coins || 0;
                userLevel = userRow?.level || 1;
                userStars = userRow?.rep || 0;
                userXp = userRow?.xp || 0;
                userLastDaily = userRow?.last_daily || 0;
                userWallpaper = userRow?.wallpaper || 'default';

                xpLeaderboard = rawDb.prepare(`
                    SELECT user_id, SUM(xp) as total_xp, MAX(level) as max_level, SUM(coins) as total_coins
                    FROM users
                    GROUP BY user_id
                    ORDER BY total_xp DESC
                    LIMIT 100
                `).all();

                coinsLeaderboard = rawDb.prepare(`
                    SELECT user_id, SUM(coins) as total_coins, MAX(level) as max_level, SUM(xp) as total_xp
                    FROM users
                    GROUP BY user_id
                    ORDER BY total_coins DESC
                    LIMIT 100
                `).all();

                const xIndex = xpLeaderboard.findIndex(r => r.user_id === user.id);
                if (xIndex !== -1) userRankXp = xIndex + 1;

                const cIndex = coinsLeaderboard.findIndex(r => r.user_id === user.id);
                if (cIndex !== -1) userRankCoins = cIndex + 1;
            } catch (err) {}

            const now = Date.now();
            const canClaimDaily = (now - userLastDaily) >= 24 * 60 * 60 * 1000;
            const nextDailyIn = Math.max(0, 24 * 60 * 60 * 1000 - (now - userLastDaily));
            const nextDailyHours = Math.floor(nextDailyIn / (1000 * 60 * 60));
            const nextDailyMinutes = Math.floor((nextDailyIn % (1000 * 60 * 60)) / (1000 * 60));

            const xpNeeded = userLevel * 100;
            const xpProgress = Math.min(100, Math.floor((userXp % 100) / 100 * 100));

            const serverRailHtml = guilds.map(g => `
                <a href="/dashboard/${g.id}" title="${g.name}" class="group relative flex items-center justify-center">
                    <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                         class="w-11 h-11 rounded-2xl border border-transparent hover:border-purple-500/40 hover:rounded-xl object-cover transition-all shadow-md">
                </a>
            `).join('');

            const userDashboardGuildsHtml = guilds.length > 0 ? guilds.map(g => `
                <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl flex items-center justify-between hover:border-purple-500/40 transition group">
                    <a href="/dashboard/${g.id}" class="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-purple-950/40 flex items-center gap-2">
                        <span>?? ����� �������</span>
                    </a>
                    <div class="flex items-center gap-3">
                        <div class="text-right">
                            <h4 class="font-bold text-white text-sm group-hover:text-purple-400 transition truncate max-w-[160px]">${g.name}</h4>
                            <span class="text-[10px] text-gray-500 font-mono">${g.id}</span>
                        </div>
                        <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-12 h-12 rounded-2xl bg-[#0b0d14] object-cover ring-2 ring-white/5">
                    </div>
                </div>
            `).join('') : `
                <div class="col-span-full py-12 text-center space-y-3 bg-[#131520] rounded-2xl border border-dashed border-white/10 p-6">
                    <div class="text-4xl">???</div>
                    <h4 class="text-white font-bold text-sm">�� ���� ������� ������ ���� ������� �������</h4>
                    <p class="text-gray-400 text-xs max-w-md mx-auto">������ ����ѡ ��� �� ���� ���� ������� �� ���� ���� ������ (Manage Server �� Administrator) ����� ����� ������ �� �������.</p>
                    <a href="https://discord.com/api/oauth2/authorize?client_id=1506005273893146775&permissions=8&scope=bot%20applications.commands" target="_blank" class="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition shadow-lg mt-2">
                        <span>? ����� ����� �������</span>
                    </a>
                </div>
            `;

            const xpLeaderboardHtml = xpLeaderboard.slice(0, 100).map((r, i) => `
                <div class="bg-[#1c1f2e] border border-white/5 p-3 rounded-2xl flex items-center justify-between">
                    <span class="text-xs font-mono font-bold text-purple-400">? ${Number(r.total_xp || 0).toLocaleString()} XP</span>
                    <div class="flex items-center gap-3">
                        <span class="text-xs text-white font-bold">${r.user_id}</span>
                        <span class="w-6 h-6 rounded-full bg-purple-950/60 text-purple-300 text-[10px] font-black flex items-center justify-center">#${i + 1}</span>
                    </div>
                </div>
            `).join('') || '<p class="text-xs text-gray-500 text-center py-4">�� ���� ������ ���� ����� ���</p>';

            const coinsLeaderboardHtml = coinsLeaderboard.slice(0, 100).map((r, i) => `
                <div class="bg-[#1c1f2e] border border-white/5 p-3 rounded-2xl flex items-center justify-between">
                    <span class="text-xs font-mono font-bold text-amber-400">?? ${Number(r.total_coins || 0).toLocaleString()}</span>
                    <div class="flex items-center gap-3">
                        <span class="text-xs text-white font-bold">${r.user_id}</span>
                        <span class="w-6 h-6 rounded-full bg-amber-950/60 text-amber-300 text-[10px] font-black flex items-center justify-center">#${i + 1}</span>
                    </div>
                </div>
            `).join('') || '<p class="text-xs text-gray-500 text-center py-4">�� ���� ������ ��� ����� ���</p>';

            const dailyActionBoxHtml = canClaimDaily ? `
                <button type="button" onclick="window.claimDailyReward()" id="claimDailyBtn" class="px-10 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-purple-950/60 hover:scale-105 transition-all cursor-pointer flex items-center gap-2 mx-auto">
                    <span class="text-lg">??</span>
                    <span>������ ������ ������</span>
                </button>
            ` : `
                <div class="inline-flex items-center gap-2.5 text-xs font-black text-purple-300 bg-purple-950/50 border border-purple-800/40 px-6 py-3 rounded-2xl shadow-xl shadow-purple-950/40">
                    <span class="text-sm">?</span>
                    <span>���� ���: </span>
                    <span id="liveDailyTimer" class="font-mono text-purple-200 tracking-wider text-sm font-black" data-target="${now + nextDailyIn}">${nextDailyHours}� ${nextDailyMinutes}�</span>
                </div>
            `;

            // ����� ������ ���� ������ ������ (105 ���� ������ �����)
            const categories = [...new Set(identityWallpapers.map(w => w.category))];
            const identityWallpapersHtml = identityWallpapers.map(w => {
                const isSelected = userWallpaper === w.url || userWallpaper === w.name;
                return `
                <div class="wallpaper-item bg-[#10121b] border ${isSelected ? 'border-purple-500 ring-2 ring-purple-500/40' : 'border-white/5 hover:border-purple-500/30'} rounded-2xl overflow-hidden shadow-lg transition-all flex flex-col justify-between group" data-category="${w.category}">
                    <div class="relative h-32 overflow-hidden bg-black">
                        <img src="${w.url}" alt="${w.name}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                        <div class="absolute inset-0 bg-gradient-to-t from-[#10121b] via-transparent to-black/20"></div>
                        <span class="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-[10px] font-bold text-purple-300 px-2 py-0.5 rounded-md border border-white/10">${w.category}</span>
                        ${isSelected ? '<span class="absolute top-2 left-2 bg-emerald-500 text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-md">? ����� ������</span>' : ''}
                    </div>
                    <div class="p-3.5 flex flex-col justify-between flex-1 text-right gap-2.5">
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-mono font-bold text-amber-300">?? ${w.price.toLocaleString()}</span>
                            <h4 class="text-xs font-bold text-white truncate max-w-[140px]">${w.name}</h4>
                        </div>
                        <button onclick="buyItem('identity', '${w.url}', ${w.price}, this)" class="w-full py-2 bg-gradient-to-r ${isSelected ? 'from-emerald-600 to-teal-600 cursor-default' : 'from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500'} text-white rounded-xl text-xs font-bold transition shadow-md flex items-center justify-center gap-1.5">
                            ${isSelected ? '<span>����� ��� ������ ??</span>' : `<span>���� ������ (${w.price.toLocaleString()} ??)</span>`}
                        </button>
                    </div>
                </div>
                `;
            }).join('');

            res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>���� ������ | ZENO BOT</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                
                <style>
                    :root {
                        --bg-main: #0b0d14;
                        --bg-sidebar: #10121b;
                        --bg-card: #151722;
                        --bg-card-hover: #1c1f2e;
                        --primary: #9333ea;
                        --border: rgba(255, 255, 255, 0.05);
                    }
                    body { background-color: var(--bg-main) !important; color: #ffffff !important; font-family: 'Cairo', sans-serif !important; transition: background-color 0.3s, color 0.3s; }
                    body.light-mode { background-color: #f8f9fa !important; color: #1a1a1a !important; }
                    body.light-mode .bg-\[\#0b0e14\], body.light-mode .bg-\[\#0b0d14\] { background-color: #f3f4f6 !important; }
                    body.light-mode .bg-\[\#121620\], body.light-mode .bg-\[\#151722\] { background-color: #ffffff !important; border-color: #e5e7eb !important; }
                    body.light-mode .text-white { color: #1a1a1a !important; }
                    body.light-mode .text-gray-300 { color: #4b5563 !important; }
                    body.light-mode .text-gray-400 { color: #6b7280 !important; }
                    body.light-mode .border-\[\#1e2638\] { border-color: #e5e7eb !important; }
                    ::-webkit-scrollbar { width: 6px; height: 6px; }
                    ::-webkit-scrollbar-track { background: #0b0d14; }
                    ::-webkit-scrollbar-thumb { background: #2f3146; border-radius: 10px; }
                    @keyframes spin { to { transform: rotate(360deg); } }
                    .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(139, 92, 246, 0.2); border-radius: 50%; border-top-color: #8b5cf6; animation: spin 0.8s linear infinite; }
                    @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                    .toast-enter { animation: slideUp 0.3s ease-out; }
                </style>
            
    <script>
    window.toggleNavGroup = function(groupId) {
        const el = document.getElementById(groupId);
        const arrow = document.getElementById('arrow_' + groupId);
        if (!el) return;
        el.classList.toggle('hidden');
        if (arrow) arrow.classList.toggle('rotate-180');
    };

    window.filterWallpapers = function(cat, btn) {
        const items = document.querySelectorAll('.wallpaper-item');
        items.forEach(el => {
            if (cat === 'all' || el.getAttribute('data-category') === cat) {
                el.style.display = 'flex';
            } else {
                el.style.display = 'none';
            }
        });
        const filterBtns = document.querySelectorAll('.cat-filter-btn');
        filterBtns.forEach(b => {
            b.classList.remove('bg-purple-600', 'text-white');
            b.classList.add('bg-white/5', 'text-gray-400');
        });
        if (btn) {
            btn.classList.add('bg-purple-600', 'text-white');
            btn.classList.remove('bg-white/5', 'text-gray-400');
        }
    };

    window.switchTab = function(tabId, btn) {
        const tabs = document.querySelectorAll('.tab-content');
        tabs.forEach(t => t.classList.add('hidden'));

        const target = document.getElementById(tabId);
        if (target) {
            target.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        if (btn) {
            const allNavBtns = document.querySelectorAll('.nav-btn');
            allNavBtns.forEach(b => {
                b.classList.remove('bg-purple-600', 'text-white', 'font-bold', 'shadow-md');
                b.classList.add('text-gray-300', 'hover:text-white', 'hover:bg-[#151724]', 'font-medium');
            });
            btn.classList.add('bg-purple-600', 'text-white', 'font-bold', 'shadow-md');
            btn.classList.remove('text-gray-300', 'hover:text-white', 'hover:bg-[#151724]', 'font-medium');
        }

        if (window.zenoI18n && typeof window.zenoI18n.apply === 'function') {
            window.zenoI18n.apply();
        }
    };

    window.claimDailyReward = async function() {
        const btn = document.getElementById('claimDailyBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '���� ��������... ?';
        }
        try {
            const res = await fetch('/api/user/daily', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                alert('?? �� ������ ' + data.amount + ' �� ����� �����! ����� ������: ' + data.newBalance.toLocaleString() + ' ??');
                location.reload();
            } else {
                alert('? ' + (data.error || '��� ������ ������ ������'));
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '������ ������ ??';
                }
            }
        } catch(e) {
            alert('��� ��� �� ������� ��������');
            if (btn) {
                btn.disabled = false;
                btn.textContent = '������ ������ ??';
            }
        }
    };

    
    // Live ticking countdown for daily reward
    setInterval(function() {
        var timerEl = document.getElementById('liveDailyTimer');
        if (!timerEl) return;
        var target = parseInt(timerEl.getAttribute('data-target'), 10);
        if (!target) return;
        var diff = target - Date.now();
        if (diff <= 0) {
            var box = document.getElementById('dailyActionBox');
            if (box) {
                box.innerHTML = '<button type="button" onclick="window.claimDailyReward()" id="claimDailyBtn" class="px-10 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-purple-950/60 hover:scale-105 transition-all cursor-pointer flex items-center gap-2 mx-auto"><span class="text-lg">??</span><span>������ ������ ������</span></button>';
            }
            return;
        }
        var h = Math.floor(diff / (1000 * 60 * 60));
        var m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        var sec = Math.floor((diff % (1000 * 60)) / 1000);
        timerEl.textContent = (h < 10 ? '0' + h : h) + '� ' + (m < 10 ? '0' + m : m) + '� ' + (sec < 10 ? '0' + sec : sec) + '�';
    }, 1000);
    
    window.buyItem = async function(type, name, price, btn) {
        if (!confirm('�� ��� ����� �� ���� ������ "' + name + '" ����� ' + price.toLocaleString() + ' ??�')) return;
        if (btn) {
            btn.disabled = true;
            btn.textContent = '���� ������... ?';
        }
        try {
            const res = await fetch('/api/user/buy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: type, name: name, price: price })
            });
            const data = await res.json();
            if (data.success) {
                alert('? �� ������ �������� �����!');
                location.reload();
            } else {
                alert('? ' + (data.error || '����� �� ���� ������ ������'));
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '���� ������';
                }
            }
        } catch(e) {
            alert('��� ��� ����� ������');
            if (btn) {
                btn.disabled = false;
                btn.textContent = '���� ������';
            }
        }
    };
    </script>

    <script src="/i18n.js"></script>
</head>
            <body class="min-h-screen flex flex-col bg-[#0b0d14] text-gray-200">
                <header class="h-16 bg-[#10121b]/95 backdrop-blur-md border-b border-white/5 px-6 flex items-center justify-between sticky top-0 z-40">
                    <div class="flex items-center gap-3">
                        <button type="button" onclick="window.zenoI18n.toggleLang()" class="zeno-lang-toggle-btn px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer text-xs">
                            <span class="text-sm">??</span>
                            <span class="font-black text-xs uppercase tracking-wider">EN</span>
                        </button>
                        <span class="text-gray-700">|</span>
                        <a href="/logout" data-i18n="logout" class="text-xs text-rose-400 hover:text-rose-300 font-bold transition">����� ������</a>
                        <span class="text-gray-700">|</span>
                        <a href="https://discord.gg/zduGPYv7pE" target="_blank" data-i18n="support_server" class="text-xs text-gray-400 hover:text-gray-200 transition">����� �����</a>
                    </div>
                    <div class="flex items-center gap-3">
                        <img src="${botAvatarUrl}" class="w-8 h-8 rounded-xl object-cover ring-2 ring-purple-500/40 shadow-md shadow-purple-900/30">
                        <span class="font-black text-sm text-white tracking-wide hidden sm:block">ZENO</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="text-right">
                            <span class="text-xs font-bold text-white block">${user.username}</span>
                            <span class="text-[10px] text-yellow-400 font-mono">?? ${userCoins.toLocaleString()} Gold</span>
                        </div>
                        <img src="${userAvatar}" class="w-9 h-9 rounded-xl object-cover ring-2 ring-yellow-500/40">
                    </div>
                </header>

                <div class="flex-1 flex overflow-hidden">
                    
                    <!-- Main Content (Left in RTL - Novax User Dashboard Style) -->
                    <main class="flex-1 p-8 overflow-y-auto custom-scrollbar space-y-6">
                        
                        <!-- Tab 1: ���� ���� ������ ������ (Novax Exact Style) -->
                        <div id="tabOverview" class="tab-content space-y-6">
                            
                            <!-- Header Title -->
                            <div class="flex items-center justify-end gap-2 text-white font-black text-lg">
                                <span>���� ����</span>
                                <span class="text-purple-400">???</span>
                            </div>

                            <!-- Top Stats 4-Grid (Novax Exact Order & Icons: ����� / ������ / ������� / �������) -->
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                
                                <!-- 1. ����� (Golds / Gold) -->
                                <div class="bg-[#10121b] border border-white/5 hover:border-purple-500/30 rounded-2xl p-4 flex items-center justify-between shadow-lg transition">
                                    <div class="w-10 h-10 rounded-xl bg-purple-600/10 text-amber-400 flex items-center justify-center text-xl font-bold shadow-inner">??</div>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-gray-400">�����</span>
                                        <h3 id="userCoinsDisplay" class="text-xl font-black text-white mt-0.5">${userCoins.toLocaleString()}</h3>
                                    </div>
                                </div>

                                <!-- 2. ������ (Reputation) -->
                                <div class="bg-[#10121b] border border-white/5 hover:border-purple-500/30 rounded-2xl p-4 flex items-center justify-between shadow-lg transition">
                                    <div class="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center text-xl shadow-inner">??</div>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-gray-400">������</span>
                                        <h3 class="text-xl font-black text-white mt-0.5">${userStars}</h3>
                                    </div>
                                </div>

                                <!-- 3. ������� (Rank) -->
                                <div class="bg-[#10121b] border border-white/5 hover:border-purple-500/30 rounded-2xl p-4 flex items-center justify-between shadow-lg transition">
                                    <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xl shadow-inner">??</div>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-gray-400">�������</span>
                                        <h3 class="text-xl font-black text-white mt-0.5">#${userRankXp}</h3>
                                    </div>
                                </div>

                                <!-- 4. ������� (Level) -->
                                <div class="bg-[#10121b] border border-white/5 hover:border-purple-500/30 rounded-2xl p-4 flex items-center justify-between shadow-lg transition">
                                    <div class="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xl shadow-inner">??</div>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-gray-400">�������</span>
                                        <h3 class="text-xl font-black text-white mt-0.5">${userLevel}</h3>
                                    </div>
                                </div>

                            </div>

                            <!-- ������ ������� ������� (Servers List) -->
                            <div class="bg-[#10121b] border border-white/5 rounded-3xl p-6 shadow-xl space-y-4">
                                <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                    <span class="text-xs text-purple-400 font-bold bg-purple-950/40 px-2.5 py-1 rounded-lg">${guilds.length} �����</span>
                                    <h3 class="text-sm font-black text-white text-right flex items-center gap-2"><span>������ ������� �������</span><span>???</span></h3>
                                </div>
                                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    ${userDashboardGuildsHtml}
                                </div>
                            </div>

                            <!-- ��� ������� ����� (Recent Gold Transactions - Novax Exact Style) -->
                            <div class="bg-[#10121b] border border-white/5 rounded-3xl p-6 shadow-xl space-y-4 text-right">
                                <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                    <span class="text-xs text-gray-400">��� ��������� ���������</span>
                                    <h3 class="text-sm font-black text-white flex items-center gap-2"><span>��� 5 ������� �����</span><span>??</span></h3>
                                </div>

                                <div class="overflow-x-auto">
                                    <div class="bg-gradient-to-r from-emerald-950/30 via-[#151724] to-[#151724] border border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between shadow-lg">
                                        <div class="flex items-center gap-2 text-emerald-400 font-bold font-mono text-sm">
                                            <span>?? ${userCoins.toLocaleString()}</span>
                                            <span class="text-xs text-gray-400 font-normal">������</span>
                                        </div>
                                        <div class="text-emerald-400 font-mono font-bold text-sm">
                                            +500
                                            <span class="text-[10px] text-gray-400 block font-normal">������</span>
                                        </div>
                                        <div class="text-gray-300 text-xs text-center">
                                            <span>�����</span>
                                            <span class="text-[10px] text-gray-400 block">�����</span>
                                        </div>
                                        <div class="flex items-center gap-2.5 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white leading-tight">�������� ������� (Daily)</h5>
                                                <span class="text-[10px] text-gray-400 font-mono">ZENO Bot System</span>
                                            </div>
                                            <div class="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-sm font-bold border border-purple-500/30">??</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- ��� ����� ������ ������ ������ (Profile Card & Identity Card - Novax Exact Style) -->
                            <div class="space-y-4 text-right">
                                <h3 class="text-sm font-black text-white flex items-center justify-end gap-2"><span>����� ������</span><span>??</span></h3>
                                
                                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    
                                    <!-- 1. ����� ������ (Main Profile Card) -->
                                    <div class="bg-[#10121b] border border-white/5 rounded-3xl p-5 shadow-xl space-y-4">
                                        <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                            <h4 class="text-xs font-black text-white">����� ������</h4>
                                        </div>

                                        <!-- The Graphic Discord Card (Purple Nebula Design) -->
                                        <div class="relative rounded-2xl overflow-hidden bg-gradient-to-br from-purple-950 via-[#18112e] to-[#0d071a] border border-purple-500/30 p-5 shadow-2xl space-y-4">
                                            <!-- Top Header in Card -->
                                            <div class="flex items-center justify-between">
                                                <span class="px-2.5 py-1 bg-purple-900/60 border border-purple-500/40 text-purple-200 text-[10px] font-bold rounded-lg">+0 REP</span>
                                                <div class="flex items-center gap-3">
                                                    <div class="text-right">
                                                        <h4 class="text-sm font-black text-white leading-tight">@${user.username}</h4>
                                                    </div>
                                                    <img src="${userAvatar}" class="w-12 h-12 rounded-2xl object-cover ring-2 ring-purple-500/60 shadow-lg shadow-black/40">
                                                </div>
                                            </div>

                                            <!-- About Me Box -->
                                            <div class="bg-black/30 border border-white/5 rounded-xl p-3 text-right">
                                                <span class="text-[9px] font-bold text-gray-400 block mb-0.5">ABOUT ME</span>
                                                <p class="text-xs text-gray-200">������ �� �� ���� ���� ZENO Bot!</p>
                                            </div>

                                            <!-- Stats & Gold in Card -->
                                            <div class="grid grid-cols-2 gap-3 text-right">
                                                <div class="bg-black/30 border border-white/5 rounded-xl p-3 space-y-1 text-xs">
                                                    <span class="text-[9px] font-bold text-gray-400 block">STATISTICS</span>
                                                    <div class="text-[11px] text-gray-300 flex items-center justify-between">
                                                        <span class="font-bold text-purple-300">${userLevel}</span>
                                                        <span>? LEVEL:</span>
                                                    </div>
                                                    <div class="text-[11px] text-gray-300 flex items-center justify-between">
                                                        <span class="font-bold text-emerald-400">#${userRankXp}</span>
                                                        <span>?? RANK:</span>
                                                    </div>
                                                    <div class="text-[11px] text-gray-300 flex items-center justify-between">
                                                        <span class="font-bold text-gray-200 font-mono">${userXp} XP</span>
                                                        <span>? XP:</span>
                                                    </div>
                                                </div>

                                                <div class="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2 text-right">
                                                    <span class="text-[9px] font-bold text-gray-400 block">GOLDS</span>
                                                    <div class="flex items-center justify-end gap-1.5 text-amber-400 font-black text-sm">
                                                        <span>${userCoins.toLocaleString()}</span>
                                                        <span class="text-base">??</span>
                                                    </div>
                                                    <span class="text-[9px] font-bold text-gray-400 block pt-1">BADGES</span>
                                                    <div class="flex items-center justify-end gap-1 text-base">
                                                        <span>??</span><span>??</span><span>??</span><span>?</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- 2. ����� ������ (Identity / Voice & Invites Card) -->
                                    <div class="bg-[#10121b] border border-white/5 rounded-3xl p-5 shadow-xl space-y-4">
                                        <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                            <h4 class="text-xs font-black text-white">����� ������</h4>
                                        </div>

                                        <!-- The Graphic Identity Card -->
                                        <div class="relative rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-950 via-[#101426] to-[#090b14] border border-indigo-500/30 p-5 shadow-2xl space-y-4">
                                            <div class="flex items-center justify-between">
                                                <div class="text-left text-xs font-bold text-indigo-300 bg-indigo-950/60 border border-indigo-800/40 px-3 py-1 rounded-xl">
                                                    <span>INVITES: 0</span>
                                                </div>
                                                <div class="flex items-center gap-3">
                                                    <div class="text-right">
                                                        <h4 class="text-sm font-black text-white leading-tight">@${user.username}</h4>
                                                        <span class="text-[10px] text-gray-400">ID CARD</span>
                                                    </div>
                                                    <img src="${userAvatar}" class="w-12 h-12 rounded-2xl object-cover ring-2 ring-indigo-500/60 shadow-lg shadow-black/40">
                                                </div>
                                            </div>

                                            <div class="grid grid-cols-2 gap-3 text-right">
                                                <div class="bg-black/30 border border-white/5 rounded-xl p-3 space-y-1">
                                                    <div class="flex items-center justify-between text-xs text-indigo-400 font-bold mb-1">
                                                        <span>TOP #1</span>
                                                        <span>?? TEXT</span>
                                                    </div>
                                                    <div class="text-[10px] text-gray-300">TOTAL XP: <span class="font-mono text-white">${userXp}</span></div>
                                                    <div class="text-[10px] text-gray-300">STREAK: <span class="font-mono text-emerald-400">Active</span></div>
                                                </div>

                                                <div class="bg-black/30 border border-white/5 rounded-xl p-3 space-y-1">
                                                    <div class="flex items-center justify-between text-xs text-purple-400 font-bold mb-1">
                                                        <span>TOP #1</span>
                                                        <span>??? VOICE</span>
                                                    </div>
                                                    <div class="text-[10px] text-gray-300">VOICE TIME: <span class="font-mono text-white">Online</span></div>
                                                    <div class="text-[10px] text-gray-300">STREAK: <span class="font-mono text-emerald-400">Level ${userLevel}</span></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>

                        </div>


                        <!-- Tab 5: ���� ��������� (Leaderboards) -->
                        <div id="tabLeaderboard" class="tab-content hidden space-y-6">
                            <div class="probot-card border border-white/5 rounded-3xl p-6 shadow-xl">
                                <div class="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                                    <span class="text-xs text-purple-400 font-mono font-bold">������ ������: #${userRankXp}</span>
                                    <h3 class="text-sm font-black text-white text-right">���� 100 ��� ������ ���� ������ (XP Leaderboard) ??</h3>
                                </div>
                                <div class="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                                    ${xpLeaderboardHtml}
                                </div>
                            </div>
                        </div>

                        <!-- Tab 5B: ���� �������� (Coins Leaderboard) -->
                        <div id="tabCoinsLeaderboard" class="tab-content hidden space-y-6">
                            <div class="probot-card border border-white/5 rounded-3xl p-6 shadow-xl">
                                <div class="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                                    <span class="text-xs text-amber-400 font-mono font-bold">������ ������: #${userRankCoins}</span>
                                    <h3 class="text-sm font-black text-white text-right">���� �������� ����� ����� ??</h3>
                                </div>
                                <div class="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                                    ${coinsLeaderboardHtml}
                                </div>
                            </div>
                        </div>

                        <!-- Tab 6: ������ ������ (Daily Reward) -->
                        <div id="tabDaily" class="tab-content hidden space-y-6">
                            <div class="probot-card border border-white/5 rounded-3xl p-8 shadow-xl text-center space-y-5 max-w-xl mx-auto">
                                <div class="w-20 h-20 rounded-3xl bg-gradient-to-tr from-purple-600/30 to-indigo-600/30 border border-purple-500/40 flex items-center justify-center text-4xl mx-auto shadow-xl shadow-black/20">
                                    ??
                                </div>
                                <div>
                                    <h3 class="text-xl font-black text-white">������ ������ (Daily Reward)</h3>
                                    <p class="text-gray-400 text-xs mt-2 leading-relaxed">
                                        ���� ��� <span class="text-amber-300 font-bold">500 ��� 1,000 �� �����</span> ������ �� 24 ����!
                                    </p>
                                </div>

                                <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-4 flex items-center justify-around text-xs">
                                    <div>
                                        <span class="text-gray-400 block text-[11px]">������ �����</span>
                                        <span class="text-amber-400 font-black font-mono text-sm">+500 ??</span>
                                    </div>
                                    <div class="w-px h-8 bg-purple-950/50"></div>
                                    <div>
                                        <span class="text-gray-400 block text-[11px]">�������</span>
                                        <span class="text-gray-200 font-bold">�� 24 ����</span>
                                    </div>
                                </div>

                                <div id="dailyActionBox" class="space-y-4">
                                    ${dailyActionBoxHtml}
                                </div>
                            </div>

                            <!-- �� ������� ����� ��� Top.gg -->
                            <div class="bg-[#12141f] border border-blue-500/20 rounded-3xl p-8 shadow-xl text-center space-y-4 max-w-xl mx-auto">
                                <div class="w-20 h-20 rounded-3xl bg-gradient-to-tr from-blue-600/30 to-indigo-600/30 border border-blue-500/40 flex items-center justify-center text-4xl mx-auto shadow-xl shadow-black/20">
                                    ???
                                </div>
                                <div>
                                    <h3 class="text-xl font-black text-white">���� ����� ��� Top.gg</h3>
                                    <p class="text-gray-400 text-xs mt-2 leading-relaxed">
                                        ����� ����� ����� ��� �������� ����� ������! ����� ������� ��� �� <span class="text-blue-300 font-bold">12 ����</span>
                                    </p>
                                </div>
                                <a href="https://top.gg/ar/bot/1506005273893146775/vote" target="_blank"
                                   class="inline-flex items-center gap-2.5 px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl text-sm font-black transition-all shadow-lg shadow-blue-900/30 hover:shadow-blue-800/40 hover:scale-105">
                                    ??? ���� ���� ��� Top.gg
                                </a>
                            </div>
                        </div>
                    </main>

                    <!-- Sidebar Right (Novax User Dashboard Menu with Exact Categories) -->
                    <aside class="w-72 bg-[#090a10] border-l border-white/5 flex flex-col shrink-0 h-full select-none">
                        
                        <!-- Top Server Management Switcher Card (Novax Style) -->
                        <div class="p-3">
                            <a href="#servers" onclick="switchTab('tabOverview')" class="bg-[#12141f] hover:bg-[#181926] border border-white/5 rounded-2xl p-3 flex items-center justify-between shadow-lg transition group">
                                <div class="text-gray-400 text-xs">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/></svg>
                                </div>
                                <div class="flex items-center gap-2.5">
                                    <span class="font-bold text-white text-xs">����� �����</span>
                                    <div class="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-sm border border-purple-500/30">
                                        ???
                                    </div>
                                </div>
                            </a>
                        </div>

                        <!-- Categorized Scrollable Nav Menu -->
                        <div class="flex-1 overflow-y-auto px-3 py-2 space-y-4 text-xs text-right custom-scrollbar">

                            <!-- ��� -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('user_grp_general')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_user_grp_general" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>���</span></span>
                                </button>
                                <div id="user_grp_general" class="space-y-1">
                                    <button onclick="switchTab('tabOverview', this)" class="nav-btn px-3 py-2 rounded-xl bg-purple-600 text-white font-bold flex items-center justify-between shadow-md w-full transition">
                                        <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
                                        <span class="flex items-center gap-2"><span>���� ����</span><span class="text-purple-300">???</span></span>
                                    </button>
                                </div>
                            </div>


                            <!-- ���� ��������� (Leaderboards) -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('user_grp_leaderboard')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_user_grp_leaderboard" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>���� ���������</span></span>
                                </button>
                                <div id="user_grp_leaderboard" class="space-y-1">
                                    <button onclick="switchTab('tabCoinsLeaderboard', this)" class="nav-btn px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] font-medium flex items-center justify-between transition w-full">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>���� ��������</span><span class="text-gray-400">??</span></span>
                                    </button>
                                    <button onclick="switchTab('tabLeaderboard', this)" class="nav-btn px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] font-medium flex items-center justify-between transition w-full">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>���� ���� ������ & XP</span><span class="text-gray-400">??</span></span>
                                    </button>
                                </div>
                            </div>

                            <!-- ���� (Other) -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('user_grp_other')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_user_grp_other" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>����</span></span>
                                </button>
                                <div id="user_grp_other" class="space-y-1">
                                    <button onclick="switchTab('tabDaily', this)" class="nav-btn px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-[#151724] font-medium flex items-center justify-between transition w-full">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>������ ������</span><span class="text-gray-400">??</span></span>
                                    </button>
                                    <a href="https://top.gg/ar/bot/1506005273893146775/vote" target="_blank" class="flex items-center justify-between px-3 py-2 rounded-xl text-blue-400 hover:text-blue-300 hover:bg-blue-950/20 font-medium transition w-full">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"/></svg>
                                        <span class="flex items-center gap-2"><span>���� �����</span><span>???</span></span>
                                    </a>
                                    <a href="/logout" class="flex items-center justify-between px-3 py-2 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 font-medium transition w-full">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                                        <span class="flex items-center gap-2"><span>����� ������</span><span>??</span></span>
                                    </a>
                                </div>
                            </div>

                        </div>

                        <!-- User Profile Bottom Bar (Novax Exact Style) -->
                        <div class="p-3 border-t border-white/5">
                            <div class="bg-gradient-to-r from-purple-700 to-indigo-700 rounded-2xl p-2.5 flex items-center justify-between shadow-lg shadow-purple-950/40">
                                <div class="text-white/80 hover:text-white cursor-pointer px-1">
                                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z"/></svg>
                                </div>
                                <div class="flex items-center gap-2.5">
                                    <div class="text-right">
                                        <span class="text-xs font-black text-white block leading-tight truncate max-w-[110px]">${user.username}</span>
                                    </div>
                                    <img src="${userAvatar}" class="w-8 h-8 rounded-xl object-cover ring-2 ring-white/20 shadow-md">
                                </div>
                            </div>
                        </div>

                    </aside>

                    <!-- Server Rail (Far Right Column - Novax Style) -->
                    <div class="w-18 bg-[#05060a] border-l border-white/5 py-4 px-2 flex flex-col items-center gap-3 shrink-0 overflow-y-auto select-none">
                        <!-- Home Icon Button -->
                        <a href="/dashboard" title="������ ��������" class="w-12 h-12 rounded-2xl bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-300 hover:text-white transition shadow-lg mb-1 group">
                            <svg class="w-6 h-6 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                        </a>
                        <div class="w-8 h-[1px] bg-white/5"></div>
                        ${serverRailHtml}
                    </div>

                </div>

                <script>
                function toggleNavGroup(groupId) {
                    const el = document.getElementById(groupId);
                    const arrow = document.getElementById('arrow_' + groupId);
                    if (!el) return;
                    el.classList.toggle('hidden');
                    if (arrow) arrow.classList.toggle('rotate-180');
                }
                </script>
            </body>
            </html>
            `);
        } catch (e) {
            console.error("Dashboard render error:", e);
            res.status(500).send("Internal error: " + e.message);
        }
    });

    // 4. Guild Dashboard & Sub-pages (���� ���� �������� �������)
    app.get('/dashboard/:guildId/:section?', async (req, res) => {
        try {
            const guildId = req.params.guildId;
            const section = req.params.section || 'overview';
            
            // ������ �� ����� ������
            const user = req.session?.user;
            if (!user) {
                return res.redirect('/auth/discord');
            }

            // ������ �� ���� ����� �� ��� ������� ���� ���� ������ (��� ���� �������� ��������)
            let botGuild = client?.guilds?.cache?.get(guildId);
            if (!botGuild) {
                try {
                    botGuild = await client?.guilds?.fetch(guildId);
                } catch(e) {}
            } else {
                // ��� ���� ������ ������� ������ ���� �������� �� ��� ����
                try {
                    await botGuild.fetch().catch(() => {});
                } catch(e) {}
            }
            if (!botGuild) {
                return res.status(404).send(`
                    <div style="background:#0b0d14;color:#fff;font-family:sans-serif;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
                        <h2>����� ��� ����� �� ��� �������</h2>
                        <a href="/dashboard/manage" style="color:#a855f7;margin-top:10px;">������ ����� ������</a>
                    </div>
                `);
            }

            // ������ �� ������ �������� ������� ����� �� ��� �������
            const sessionGuilds = req.session?.guilds || [];
            const userCanManage = sessionGuilds.some(g => g.id === guildId);
            if (!userCanManage) {
                return res.status(403).send(`
                    <div style="background:#0b0d14;color:#fff;font-family:sans-serif;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
                        <h2>��� ���� ������� ����� �� ��� �������</h2>
                        <p style="color:#888;">��� �� ���� ���� ������� �� ����� ������ Manage Server / Administrator</p>
                        <a href="/dashboard/manage" style="color:#a855f7;margin-top:10px;">������ ������� �������</a>
                    </div>
                `);
            }

            const guilds = sessionGuilds;
            let guild = { id: botGuild.id, name: botGuild.name, icon: botGuild.icon };

            let settings = {};
            try {
                settings = database.getGuildSettings ? database.getGuildSettings(guildId) : {};
            } catch (err) {}
            if (!settings) settings = {};

            let whitelistUsers = [];
            let antimodUsers = [];
            let securityLogsList = [];
            let warnPunishmentsList = [];
            let autoRespondersList = [];
            let guildTicketsList = [];
            try {
                if (database.getGuildTickets) {
                    guildTicketsList = database.getGuildTickets(guildId, 100) || [];
                }
            } catch (e) {}
            let guildGiveawaysList = [];
            let guildSuggestionsList = [];
            try {
                if (database.getGuildSuggestions) {
                    guildSuggestionsList = database.getGuildSuggestions(guildId, req.query?.status || null) || [];
                }
            } catch(e) {}
            try {
                if (database.getGuildGiveaways) {
                    guildGiveawaysList = database.getGuildGiveaways(guildId) || [];
                }
            } catch(e) {}
            let levelRewardsList = [];
            let guildLeaderboardUsers = [];
            const currentTab = req.query?.tab || 'settings';
            try {
                if (database.getLeaderboard) {
                    guildLeaderboardUsers = database.getLeaderboard(guildId, 20) || [];
                }
            } catch(e) {}
            try {
                if (database.getLevelRewards) {
                    levelRewardsList = database.getLevelRewards(guildId) || [];
                }
            } catch (err) {}
            try {
                if (database.getAutoResponders) {
                    autoRespondersList = database.getAutoResponders(guildId) || [];
                }
            } catch (err) {}
            try {
                if (database.getWarnPunishments) {
                    warnPunishmentsList = database.getWarnPunishments(guildId) || [];
                }
            } catch (err) {}
            try {
                if (database.getProtectionWhitelist) {
                    whitelistUsers = database.getProtectionWhitelist(guildId, 'whitelist') || [];
                    antimodUsers = database.getProtectionWhitelist(guildId, 'antimod') || [];
                }
                if (database.getSecurityLogs) {
                    securityLogsList = database.getSecurityLogs(guildId, null, 50) || [];
                }
            } catch (err) {}

            const userAvatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
            const botAvatarUrl = client?.user?.avatar ? `https://cdn.discordapp.com/avatars/${client.user.id}/${client.user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
            const guildIcon = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

            const serverRailHtml = guilds.map(g => `
                <a href="/dashboard/${g.id}" title="${g.name}" class="group relative flex items-center justify-center">
                    <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                         class="w-11 h-11 rounded-2xl ${g.id === guildId ? 'border-2 border-purple-500 shadow-lg shadow-purple-900/50 p-0.5 ring-2 ring-purple-600/30' : 'border border-transparent hover:border-purple-500/40'} hover:rounded-xl object-cover transition-all shadow-md">
                </a>
            `).join('');

            const sectionTitles = {
                'overview': '���� ���� ��� ������� ??',
                'analytics': '���������� ���������� ??',
                'stats': '���������� ���������� ??',
                'appearance': '���� ������ ����� ??',
                'settings': '������� ������� ������ ??',
                'general': '���� ������� �������� ??',
                'commands': '���� ����� ������� ������ ??',
                'moderation': '������� ������ ������� ??',
                'automod': '������� ��������� ������ ���� ������ ??',
                'welcome': '����� ������� ������� ��������� ??',
                'autoresponder': '���� �������� ��� ������� ??',
                'tickets': '���� ������� ������ ����� ??',
                'protection': '���� ������� ������ ������� ������� ???',
                'whitelist': '������� / ������� ������� ?',
                'protection-logs': '������� / ������� ??',
                'antiraid': '���� ������ ����� �������� �������� ??',
                'staff-activity': '���� ���� ������� ��������� ??',
                'tempvoice': '���� ������� ������� ������� ??',
                'boost': '���� ������� �������� ������ ??',
                'colors': '���� ��� ������� ������� ??',
                'logs': '����� ������� ������� ??',
                'levels': '���� ��������� ������� XP ??',
                'autoroles': '����� ��������� ��� �������� ???',
                'giveaways': '���� ������� ����� ���� ??',
                'suggestions': '���� ���������� �������� ??',
                'invites': '����� ������� ������� (Invite Tracker) ??',
                'broadcast': '���� ��������� ������� ����� ??',
                'embed': '���� ����� ������� ������� ??',
                'applications': '���� ��������� �������� ??',
                'help': '����� ������� ������� ??',
                'ai': '������ ��������� (ZENO AI & Web) ??'
            };

            let title = sectionTitles[section] || '���� ��������� ??';

            const guildTextChannels = botGuild ? Array.from(botGuild.channels.cache.values()).filter(c => c.type === 0 || c.type === 5) : [];
            const guildVoiceChannels = botGuild ? Array.from(botGuild.channels.cache.values()).filter(c => c.type === 2) : [];
            const guildRoles = botGuild ? Array.from(botGuild.roles.cache.values()).filter(r => r.name !== '@everyone') : [];

            function renderChannelSelect(inputName, selectedId, isMulti = false) {
                return `
                    <select name="${inputName}" id="${inputName}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer">
                        <option value="">...���� ������</option>
                        ${guildTextChannels.map(c => `<option value="${c.id}" ${String(selectedId).includes(String(c.id)) ? 'selected' : ''}># ${c.name}</option>`).join('')}
                    </select>
                `;
            }

            function renderRoleSelect(inputName, selectedId) {
                return `
                    <select name="${inputName}" id="${inputName}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer">
                        <option value="">...���� ������</option>
                        ${guildRoles.map(r => `<option value="${r.id}" ${String(selectedId) === String(r.id) ? 'selected' : ''}>@ ${r.name}</option>`).join('')}
                    </select>
                `;
            }

            let formFieldsHtml = '';
            let embedScriptHtml = '';

            if (section === 'overview') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Server Overview Hero Banner -->
                        <div class="bg-gradient-to-br from-[#1a0a2e] via-[#12141f] to-[#0b0d14] border border-purple-500/20 p-6 rounded-3xl shadow-2xl relative overflow-hidden">
                            <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(147,51,234,0.12),transparent_70%)]"></div>
                            <div class="relative flex items-center justify-between">
                                <div class="flex items-center gap-4">
                                    <div class="text-right">
                                        <h2 class="text-2xl font-black text-white">${guild.name || "ZENO'BOT"}</h2>
                                        <p class="text-purple-300/80 text-xs font-mono mt-0.5">ID: ${guildId}</p>
                                        <div class="flex items-center gap-1.5 mt-2 justify-end">
                                            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                            <span class="text-xs text-emerald-300 font-bold">����� ���� �����</span>
                                        </div>
                                    </div>
                                    <img src="${guild.icon ? `https://cdn.discordapp.com/icons/${guildId}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-20 h-20 rounded-3xl ring-4 ring-purple-500/40 shadow-xl object-cover">
                                </div>
                                <div class="text-left">
                                    <div class="text-5xl font-black text-white/10 select-none">??</div>
                                </div>
                            </div>
                        </div>

                        <!-- Real-Time Stats Grid (4 Counters) -->
                        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div class="bg-[#12141f] border border-purple-500/20 p-5 rounded-2xl shadow-xl text-right hover:border-purple-500/40 transition group">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400 flex items-center justify-center text-sm">??</div>
                                    <span class="text-[10px] text-gray-500 font-mono">MEMBERS</span>
                                </div>
                                <div class="text-2xl font-black text-white">${(botGuild?.memberCount || 0).toLocaleString()}</div>
                                <p class="text-xs text-gray-400 mt-1 font-bold">������ �������</p>
                            </div>
                            <div class="bg-[#12141f] border border-emerald-500/20 p-5 rounded-2xl shadow-xl text-right hover:border-emerald-500/40 transition group">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-sm">??</div>
                                    <span class="text-[10px] text-gray-500 font-mono">ONLINE</span>
                                </div>
                                <div class="text-2xl font-black text-white">${(botGuild?.members?.cache?.filter(m => m.presence?.status === 'online' || m.presence?.status === 'idle' || m.presence?.status === 'dnd').size || 0).toLocaleString()}</div>
                                <p class="text-xs text-gray-400 mt-1 font-bold">������� ��������</p>
                            </div>
                            <div class="bg-[#12141f] border border-indigo-500/20 p-5 rounded-2xl shadow-xl text-right hover:border-indigo-500/40 transition group">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center text-sm">??</div>
                                    <span class="text-[10px] text-gray-500 font-mono">CHANNELS</span>
                                </div>
                                <div class="text-2xl font-black text-white">${(botGuild?.channels?.cache?.size || 0)}</div>
                                <p class="text-xs text-gray-400 mt-1 font-bold">������ �������</p>
                            </div>
                            <div class="bg-[#12141f] border border-amber-500/20 p-5 rounded-2xl shadow-xl text-right hover:border-amber-500/40 transition group">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-amber-600/20 border border-amber-500/30 text-amber-400 flex items-center justify-center text-sm">??</div>
                                    <span class="text-[10px] text-gray-500 font-mono">BOOSTS</span>
                                </div>
                                <div class="text-2xl font-black text-white">${(botGuild?.premiumSubscriptionCount || 0)}</div>
                                <p class="text-xs text-gray-400 mt-1 font-bold">������ �������</p>
                            </div>
                        </div>

                        <!-- Second Row Stats -->
                        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl shadow-xl text-right hover:border-purple-500/20 transition">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-pink-600/20 border border-pink-500/30 text-pink-400 flex items-center justify-center text-sm">???</div>
                                    <span class="text-[10px] text-gray-500 font-mono">ROLES</span>
                                </div>
                                <div class="text-2xl font-black text-white">${(botGuild?.roles?.cache?.size || 0)}</div>
                                <p class="text-xs text-gray-400 mt-1 font-bold">������ �����</p>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl shadow-xl text-right hover:border-purple-500/20 transition">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-purple-700/20 border border-purple-500/30 text-purple-400 flex items-center justify-center text-sm">??</div>
                                    <span class="text-[10px] text-gray-500 font-mono">EMOJIS</span>
                                </div>
                                <div class="text-2xl font-black text-white">${(botGuild?.emojis?.cache?.size || 0)}</div>
                                <p class="text-xs text-gray-400 mt-1 font-bold">���������� �������</p>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl shadow-xl text-right hover:border-purple-500/20 transition">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 flex items-center justify-center text-sm">??</div>
                                    <span class="text-[10px] text-gray-500 font-mono">BOTS</span>
                                </div>
                                <div class="text-2xl font-black text-white">${(botGuild?.members?.cache?.filter(m => m.user.bot).size || 0)}</div>
                                <p class="text-xs text-gray-400 mt-1 font-bold">��� �������</p>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl shadow-xl text-right hover:border-purple-500/20 transition">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-400 flex items-center justify-center text-sm">??</div>
                                    <span class="text-[10px] text-gray-500 font-mono">GIVEAWAYS</span>
                                </div>
                                <div class="text-2xl font-black text-white">${guildGiveawaysList?.length || 0}</div>
                                <p class="text-xs text-gray-400 mt-1 font-bold">������ ����� �����</p>
                            </div>
                        </div>

                        <!-- Server Info & Boost Level -->
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <!-- Server Details -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl shadow-xl space-y-3 text-right">
                                <h4 class="font-black text-white text-sm flex items-center justify-end gap-2"><span>������� �������</span><span>??</span></h4>
                                <div class="space-y-2.5 text-xs text-gray-400">
                                    <div class="flex items-center justify-between bg-[#0b0d14] p-3 rounded-xl border border-white/5">
                                        <span class="text-white font-bold font-mono">${new Date((parseInt(guildId) / 4194304 + 1420070400000)).toLocaleDateString('ar-IQ', {year:'numeric',month:'long',day:'numeric'})}</span>
                                        <span>����� ����� �������</span>
                                    </div>
                                    <div class="flex items-center justify-between bg-[#0b0d14] p-3 rounded-xl border border-white/5">
                                        <span class="text-purple-300 font-bold">����� ${botGuild?.premiumTier || 0}</span>
                                        <span>����� ������</span>
                                    </div>
                                    <div class="flex items-center justify-between bg-[#0b0d14] p-3 rounded-xl border border-white/5">
                                        <span class="text-white font-bold font-mono">${botGuild?.vanityURLCode ? `discord.gg/${botGuild.vanityURLCode}` : '�'}</span>
                                        <span>���� ������� ������</span>
                                    </div>
                                    <div class="flex items-center justify-between bg-[#0b0d14] p-3 rounded-xl border border-white/5">
                                        <span class="text-white font-bold">${botGuild?.verificationLevel === 0 ? '�� ����' : botGuild?.verificationLevel === 1 ? '�����' : botGuild?.verificationLevel === 2 ? '�����' : botGuild?.verificationLevel === 3 ? '����' : '���� ����'}</span>
                                        <span>����� ������</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Quick Actions -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl shadow-xl space-y-3 text-right">
                                <h4 class="font-black text-white text-sm flex items-center justify-end gap-2"><span>��������� �������</span><span>?</span></h4>
                                <div class="space-y-2">
                                    <a href="/dashboard/${guildId}/commands" class="flex items-center justify-between bg-[#0b0d14] hover:bg-purple-900/20 border border-white/5 hover:border-purple-500/30 p-3 rounded-xl transition group">
                                        <span class="text-purple-400 text-xs group-hover:text-purple-300">?</span>
                                        <div class="flex items-center gap-2 text-right">
                                            <span class="text-xs font-bold text-white">����� �������</span>
                                            <span class="text-sm">???</span>
                                        </div>
                                    </a>
                                    <a href="/dashboard/${guildId}/moderation" class="flex items-center justify-between bg-[#0b0d14] hover:bg-purple-900/20 border border-white/5 hover:border-purple-500/30 p-3 rounded-xl transition group">
                                        <span class="text-purple-400 text-xs group-hover:text-purple-300">?</span>
                                        <div class="flex items-center gap-2 text-right">
                                            <span class="text-xs font-bold text-white">������� �������</span>
                                            <span class="text-sm">??</span>
                                        </div>
                                    </a>
                                    <a href="/dashboard/${guildId}/protection" class="flex items-center justify-between bg-[#0b0d14] hover:bg-purple-900/20 border border-white/5 hover:border-purple-500/30 p-3 rounded-xl transition group">
                                        <span class="text-purple-400 text-xs group-hover:text-purple-300">?</span>
                                        <div class="flex items-center gap-2 text-right">
                                            <span class="text-xs font-bold text-white">���� �������</span>
                                            <span class="text-sm">???</span>
                                        </div>
                                    </a>
                                    <a href="/dashboard/${guildId}/analytics" class="flex items-center justify-between bg-[#0b0d14] hover:bg-purple-900/20 border border-white/5 hover:border-purple-500/30 p-3 rounded-xl transition group">
                                        <span class="text-purple-400 text-xs group-hover:text-purple-300">?</span>
                                        <div class="flex items-center gap-2 text-right">
                                            <span class="text-xs font-bold text-white">���������� ����������</span>
                                            <span class="text-sm">??</span>
                                        </div>
                                    </a>
                                    <a href="/dashboard/${guildId}/stat-channels" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'stat-channels' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded">����</span>
                                        <span class="flex items-center gap-2"><span>����� ����������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                </div>
                            </div>
                        </div>

                        <!-- Top Members & Leaderboard Preview -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl shadow-xl text-right">
                            <div class="flex items-center justify-between mb-4">
                                <a href="/dashboard/${guildId}/analytics" class="text-xs text-purple-400 hover:text-purple-300 font-bold transition">��� ���� ?</a>
                                <h4 class="font-black text-white text-sm flex items-center gap-2"><span>���� ������� ������</span><span>??</span></h4>
                            </div>
                            <div class="space-y-2">
                                ${guildLeaderboardUsers.slice(0, 5).map((u, i) => `
                                <div class="flex items-center justify-between bg-[#0b0d14] border border-white/5 p-3 rounded-xl hover:border-purple-500/20 transition">
                                    <div class="flex items-center gap-3">
                                        <span class="text-xs font-mono font-black text-purple-400">? ${Number(u.total_xp || 0).toLocaleString()} XP</span>
                                        <span class="text-xs text-gray-300 font-mono truncate max-w-[120px]">${u.user_id}</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="w-6 h-6 rounded-lg ${i === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : i === 1 ? 'bg-gray-400/20 text-gray-300 border border-gray-400/30' : i === 2 ? 'bg-purple-700/20 text-purple-400 border border-purple-500/30' : 'bg-purple-600/20 text-purple-400 border border-purple-500/30'} text-[10px] font-black flex items-center justify-center">#${i+1}</span>
                                    </div>
                                </div>
                                `).join('')}
                                ${guildLeaderboardUsers.length === 0 ? '<p class="text-xs text-gray-500 text-center py-4">�� ���� ������ ���� ��� ����</p>' : ''}
                            </div>
                        </div>

                    </div>
`;
            } else if (section === 'general' || section === 'commands') {
formFieldsHtml = "<div id=\"cmdsMgmtRoot\" class=\"space-y-6 text-right\" dir=\"rtl\" style=\"margin-top:0\">\n\n    <!-- Header Card -->\n    <div class=\"bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl\">\n        <div class=\"flex items-center gap-6\">\n            <div class=\"text-center\">\n                <span id=\"customAliasesCount\" class=\"text-xl font-black text-purple-400 font-mono\">0</span>\n                <span class=\"text-[10px] text-gray-400 block font-bold\">�������� �����</span>\n            </div>\n            <div class=\"text-center\">\n                <span id=\"enabledCmdsCount\" class=\"text-xl font-black text-emerald-400 font-mono\">177</span>\n                <span class=\"text-[10px] text-gray-400 block font-bold\">������� �������</span>\n            </div>\n            <div class=\"text-center\">\n                <span id=\"totalCmdsCount\" class=\"text-xl font-black text-white font-mono\">177</span>\n                <span class=\"text-[10px] text-gray-400 block font-bold\">������ �������</span>\n            </div>\n        </div>\n        <div class=\"flex items-center gap-3\">\n            <div class=\"text-right\">\n                <h4 class=\"font-black text-white text-base\">����� �������</h4>\n                <p class=\"text-gray-400 text-xs mt-0.5\">����� ������ ���� ����� ����� ����������</p>\n            </div>\n            <div class=\"w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30\">???</div>\n        </div>\n    </div>\n\n    <!-- Search & Filter Bar -->\n    <div class=\"flex items-center justify-between gap-4\">\n        <div class=\"flex items-center gap-1.5 bg-[#12141f] border border-white/5 p-1 rounded-xl\">\n            <button type=\"button\" id=\"btnFilterDisabled\" onclick=\"window.filterCmdStatus('disabled')\" class=\"px-3 py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer\">����</button>\n            <button type=\"button\" id=\"btnFilterEnabled\" onclick=\"window.filterCmdStatus('enabled')\" class=\"px-3 py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer\">����</button>\n            <button type=\"button\" id=\"btnFilterAll\" onclick=\"window.filterCmdStatus('all')\" class=\"px-3 py-1 rounded-lg text-xs font-bold bg-purple-600 text-white transition shadow cursor-pointer\">����</button>\n        </div>\n        <div class=\"flex-1 relative\">\n            <input type=\"text\" id=\"cmdSearchInput\" placeholder=\"...���� �� ���\" oninput=\"window.searchCommands()\" class=\"w-full bg-[#12141f] border border-white/5 focus:border-purple-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right pr-10\">\n            <span class=\"absolute right-3 top-2.5 text-gray-400\">??</span>\n        </div>\n    </div>\n\n    <!-- Main Grid -->\n    <div class=\"grid grid-cols-1 lg:grid-cols-4 gap-6\">\n\n        <!-- Sidebar: Categories -->\n        <div class=\"lg:col-span-1 space-y-1.5 bg-[#12141f] border border-white/5 p-3 rounded-2xl shadow-xl h-fit\">\n            <div class=\"flex items-center justify-end gap-1.5 text-xs font-black text-white px-2 py-1.5 border-b border-white/5 mb-1\">\n                <span>�������</span><span>??</span>\n            </div>\n            <button type=\"button\" id=\"btnCatBasic\" onclick=\"window.switchCmdCategory('basic')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatBasic\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">17/17</span>\n                <span class=\"flex items-center gap-1.5\"><span>������� ��������</span><span>??</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatPunishments\" onclick=\"window.switchCmdCategory('punishments')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold bg-purple-600 text-white shadow-lg transition cursor-pointer\">\n                <span id=\"badgeCatPunishments\" class=\"px-2 py-0.5 bg-white/20 text-white rounded-lg text-[10px] font-mono\">22/22</span>\n                <span class=\"flex items-center gap-1.5\"><span>��������</span><span>??</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatPunishmentLogs\" onclick=\"window.switchCmdCategory('punishment_logs')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatPunishmentLogs\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">17/17</span>\n                <span class=\"flex items-center gap-1.5\"><span>����� ��������</span><span>??</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatChannels\" onclick=\"window.switchCmdCategory('channels')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatChannels\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">9/9</span>\n                <span class=\"flex items-center gap-1.5\"><span>����� �������</span><span>??</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatChat\" onclick=\"window.switchCmdCategory('chat')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatChat\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">12/12</span>\n                <span class=\"flex items-center gap-1.5\"><span>����� �����</span><span>??</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatVoice\" onclick=\"window.switchCmdCategory('voice')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatVoice\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">19/19</span>\n                <span class=\"flex items-center gap-1.5\"><span>����� �����</span><span>???</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatRoles\" onclick=\"window.switchCmdCategory('roles')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatRoles\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">10/10</span>\n                <span class=\"flex items-center gap-1.5\"><span>����� �����</span><span>???</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatCustomRoles\" onclick=\"window.switchCmdCategory('custom_roles')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatCustomRoles\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">9/9</span>\n                <span class=\"flex items-center gap-1.5\"><span>����� ������</span><span>??</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatServerInfo\" onclick=\"window.switchCmdCategory('server_info')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatServerInfo\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">19/19</span>\n                <span class=\"flex items-center gap-1.5\"><span>������� �������</span><span>??</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatCustomBot\" onclick=\"window.switchCmdCategory('custom_bot')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatCustomBot\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">5/5</span>\n                <span class=\"flex items-center gap-1.5\"><span>����� ����� �����</span><span>??</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatSecurity\" onclick=\"window.switchCmdCategory('security')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatSecurity\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">15/15</span>\n                <span class=\"flex items-center gap-1.5\"><span>�������</span><span>???</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatLevels\" onclick=\"window.switchCmdCategory('levels_cat')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatLevels\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">10/10</span>\n                <span class=\"flex items-center gap-1.5\"><span>��������� �������</span><span>?</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatServerStats\" onclick=\"window.switchCmdCategory('server_stats')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatServerStats\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">11/11</span>\n                <span class=\"flex items-center gap-1.5\"><span>�������� �������</span><span>??</span></span>\n            </button>\n            <button type=\"button\" id=\"btnCatProfile\" onclick=\"window.switchCmdCategory('profile_cat')\" class=\"w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer\">\n                <span id=\"badgeCatProfile\" class=\"px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono\">10/10</span>\n                <span class=\"flex items-center gap-1.5\"><span>����� ������</span><span>??</span></span>\n            </button>\n        </div>\n\n        <!-- Commands Display Area -->\n        <div class=\"lg:col-span-3 space-y-4\">\n            <!-- Active Category Header -->\n            <div class=\"bg-[#12141f] border border-white/5 p-4 rounded-2xl flex items-center justify-between shadow-xl\">\n                <div class=\"flex items-center gap-2\">\n                    <span id=\"cmdSaveIndicator\" class=\"text-xs font-bold text-emerald-400 bg-emerald-950/60 px-2 py-1 rounded-lg opacity-0 transition-opacity duration-300\">? ����</span>\n                    <button type=\"button\" onclick=\"window.toggleAllCategoryCmds(false)\" class=\"px-3.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 rounded-xl text-xs font-bold transition flex items-center gap-1\">\n                        <span>?</span><span>����� ����</span>\n                    </button>\n                    <button type=\"button\" onclick=\"window.toggleAllCategoryCmds(true)\" class=\"px-3.5 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/40 rounded-xl text-xs font-bold transition flex items-center gap-1\">\n                        <span>?</span><span>����� ����</span>\n                    </button>\n                </div>\n                <div class=\"flex items-center gap-3\">\n                    <div class=\"text-right\">\n                        <h5 id=\"catTitle\" class=\"font-black text-white text-sm\">��������</h5>\n                        <p id=\"catDesc\" class=\"text-gray-400 text-[11px] mt-0.5\">����� ����� �������� �������� ��� �������</p>\n                    </div>\n                    <span id=\"catIcon\" class=\"text-xl\">??</span>\n                </div>\n            </div>\n            <!-- Commands List -->\n            <div id=\"cmdsListContainer\" class=\"space-y-3\"></div>\n        </div>\n    </div>\n</div>\n\n<script>\n\n(function() {\n    var DB = {\n        basic: { title: '������� ��������', desc: '������� �������� ����� ���������� ������', icon: '??', items: [\n            { name: '/help', desc: '����� ���� ������� �������', badge: '', icon: '??' },\n            { name: '/ping', desc: '���� ������� �����', badge: '', icon: '??' },\n            { name: '/botinfo', desc: '������� ����� �������', badge: '', icon: '??' },\n            { name: '/serverinfo', desc: '������� ������� �������', badge: '', icon: '??' },\n            { name: '/userinfo', desc: '������� ��� �� �������', badge: '', icon: '??' },\n            { name: '/avatar', desc: '��� ���� ��� ���� �����', badge: '', icon: '???' },\n            { name: '/banner', desc: '��� ��� ���', badge: '', icon: '??' },\n            { name: '/invites', desc: '��� ����� ��� �� �������', badge: '', icon: '??' },\n            { name: '/roles', desc: '����� ��� ������� �������', badge: '', icon: '???' },\n            { name: '/channels', desc: '����� ����� �������', badge: '', icon: '??' },\n            { name: '/emojis', desc: '����� �������� ������� �������', badge: '', icon: '??' },\n            { name: '/apply', desc: '����� ��� ����� ��������', badge: '', icon: '??' },\n            { name: '/ticket', desc: '��� ����� ���', badge: '', icon: '??' },\n            { name: '/daily', desc: '������ ������ ������', badge: '', icon: '??' },\n            { name: '/profile', desc: '��� ����� ���������', badge: '', icon: '??' },\n            { name: '/leaderboard', desc: '����� ���������', badge: '', icon: '??' },\n            { name: '/gold', desc: '���� ����� ��������', badge: '', icon: '??' }\n        ]},\n        punishments: { title: '��������', desc: '����� ����� �������� �������� ��� �������', icon: '??', items: [\n            { name: '/ban', desc: '��� ���', badge: '������� �������', icon: '??' },\n            { name: '/unban', desc: '�� ��� ���', badge: '������� �������', icon: '???' },\n            { name: '/kick', desc: '��� ���', badge: '������� �������', icon: '??' },\n            { name: '/mute', desc: '��� ���', badge: '������� �������', icon: '??' },\n            { name: '/unmute', desc: '�� ��� ���', badge: '������� �������', icon: '??' },\n            { name: '/timeout', desc: '��� ���', badge: '������� �������', icon: '?' },\n            { name: '/untimeout', desc: '�� ��� ���', badge: '������� �������', icon: '???' },\n            { name: '/warn', desc: '����� ���', badge: '������� �������', icon: '??' },\n            { name: '/delwarn', desc: '��� �����', badge: '������� �������', icon: '???' },\n            { name: '/clearwarns', desc: '��� ���� ���������', badge: '������� �������', icon: '???' },\n            { name: '/clearallwarns', desc: '��� ������� ��� �����', badge: '������� �������', icon: '???' },\n            { name: '/clearallpunishments', desc: '��� ����� ��� ����� ��������', badge: '', icon: '???' },\n            { name: '/prison', desc: '��� ���', badge: '������� �������', icon: '??' },\n            { name: '/unprison', desc: '����� �� �����', badge: '������� �������', icon: '???' },\n            { name: '/setnick', desc: '����� ����� ��������', badge: '������� �������', icon: '??' },\n            { name: '/blacklist', desc: '���� ��� ��� (����)', badge: '������� �������', icon: '??' },\n            { name: '/unblacklist', desc: '�� ���� ��� ���', badge: '������� �������', icon: '???' },\n            { name: '/remove', desc: '��� ����� �� ���', badge: '������� �������', icon: '???' },\n            { name: '/down', desc: '����� ����� �������� ���� �����', badge: '������� �������', icon: '??' },\n            { name: '/undown', desc: '������� ����� �������� �������', badge: '', icon: '???' },\n            { name: '/block', desc: '��� ��� �� ����', badge: '������� �������', icon: '???' },\n            { name: '/unblock', desc: '�� ��� ��� �� ����', badge: '������� �������', icon: '???' }\n        ]},\n        punishment_logs: { title: '����� ��������', desc: '������� ���� ����� �������� �������', icon: '??', items: [\n            { name: '/allwarns', desc: '��� �� ��������� ������', badge: '', icon: '??' },\n            { name: '/bans', desc: '��� ������ ���', badge: '', icon: '??' },\n            { name: '/blacklists', desc: '��� ���� ��� ���', badge: '', icon: '??' },\n            { name: '/blocks', desc: '��� ������ ���', badge: '', icon: '??' },\n            { name: '/case', desc: '��� ������ �����', badge: '������� �������', icon: '??' },\n            { name: '/crime', desc: '��� ������ ����� ������', badge: '', icon: '??' },\n            { name: '/crimes', desc: '������ ����� ������ ������', badge: '', icon: '??' },\n            { name: '/downs', desc: '��� ������ ���', badge: '', icon: '??' },\n            { name: '/modlogs', desc: '��� ����� ��������', badge: '������� �������', icon: '??' },\n            { name: '/kicks', desc: '��� ������ ���', badge: '', icon: '??' },\n            { name: '/mutes', desc: '��� ����� ���', badge: '', icon: '??' },\n            { name: '/prisons', desc: '��� ����� ���', badge: '', icon: '??' },\n            { name: '/timeouts', desc: '��� ����� ���', badge: '', icon: '??' },\n            { name: '/warns', desc: '��� ������� ���', badge: '', icon: '??' },\n            { name: '/staffactivity', desc: '����� ���� ���� �������', badge: '������� �������', icon: '??' },\n            { name: '/audit', desc: '��� ������� ���������', badge: '������� �������', icon: '??' },\n            { name: '/punishments', desc: '���� ���� �������� ������', badge: '', icon: '??' }\n        ]},\n        channels: { title: '����� �������', desc: '����� ��� ������ ������ �������', icon: '??', items: [\n            { name: '/lock', desc: '��� ����', badge: '������� �������', icon: '??' },\n            { name: '/unlock', desc: '��� ���� ������', badge: '������� �������', icon: '??' },\n            { name: '/hide', desc: '����� ���� �� �������', badge: '������� �������', icon: '???' },\n            { name: '/unhide', desc: '����� ���� �����', badge: '������� �������', icon: '???' },\n            { name: '/slowmode', desc: '����� ����� ��� �� ������', badge: '������� �������', icon: '??' },\n            { name: '/clone', desc: '��� ���� ����� ���������', badge: '������� �������', icon: '??' },\n            { name: '/rename', desc: '����� ��� ������', badge: '������� �������', icon: '??' },\n            { name: '/settopic', desc: '����� ��� ������', badge: '������� �������', icon: '??' },\n            { name: '/setnsfw', desc: '�����/����� ��� NSFW', badge: '������� �������', icon: '??' }\n        ]},\n        chat: { title: '����� �����', desc: '����� ��� ������� ���������� ��������', icon: '??', items: [\n            { name: '/clear', desc: '��� ��� ���� �� �������', badge: '������� �������', icon: '???' },\n            { name: '/clearpinned', desc: '��� ������� �������', badge: '������� �������', icon: '???' },\n            { name: '/clearbots', desc: '��� ����� �������', badge: '������� �������', icon: '???' },\n            { name: '/clearuser', desc: '��� ����� ��� ����', badge: '������� �������', icon: '???' },\n            { name: '/say', desc: '����� ����� ��� �����', badge: '������� �������', icon: '??' },\n            { name: '/embed', desc: '����� Embed ����', badge: '������� �������', icon: '??' },\n            { name: '/poll', desc: '����� ������� ���', badge: '������� �������', icon: '??' },\n            { name: '/remind', desc: '����� ����� ����', badge: '', icon: '?' },\n            { name: '/announce', desc: '����� ����� ����', badge: '������� �������', icon: '??' },\n            { name: '/broadcast', desc: '�� ����� �� ���� �������', badge: '������� �������', icon: '??' },\n            { name: '/translate', desc: '����� �� ��� ��� ����', badge: '', icon: '??' },\n            { name: '/quote', desc: '������ ����� �����', badge: '', icon: '??' }\n        ]},\n        voice: { title: '����� �����', desc: '����� ������ �� ����� ����� ��������', icon: '???', items: [\n            { name: '/vcmute', desc: '��� ��� �� �����', badge: '������� �������', icon: '??' },\n            { name: '/vcunmute', desc: '�� ��� ��� �� �����', badge: '������� �������', icon: '??' },\n            { name: '/vcdeafen', desc: '��� ��� �� �����', badge: '������� �������', icon: '??' },\n            { name: '/vcundeafen', desc: '�� ����� ��� �� �����', badge: '������� �������', icon: '??' },\n            { name: '/vckick', desc: '��� ��� �� ���� �����', badge: '������� �������', icon: '??' },\n            { name: '/vcmove', desc: '��� ��� ��� ����� �����', badge: '������� �������', icon: '??' },\n            { name: '/vcmoveall', desc: '��� ���� ������� ����� ����', badge: '������� �������', icon: '??' },\n            { name: '/vclimit', desc: '����� ���� ������ ����������', badge: '������� �������', icon: '??' },\n            { name: '/vclock', desc: '��� ���� �����', badge: '������� �������', icon: '??' },\n            { name: '/vcunlock', desc: '��� ���� �����', badge: '������� �������', icon: '??' },\n            { name: '/vchide', desc: '����� ���� �����', badge: '������� �������', icon: '???' },\n            { name: '/vcunhide', desc: '����� ���� �����', badge: '������� �������', icon: '???' },\n            { name: '/vcbitrate', desc: '����� ���� ����� (Bitrate)', badge: '������� �������', icon: '??' },\n            { name: '/tempvoice', desc: '����� ���� ����� �����', badge: '', icon: '?' },\n            { name: '/vcinfo', desc: '������� ���� ����� �������', badge: '', icon: '??' },\n            { name: '/vcactivity', desc: '����� ���� ����� ������', badge: '', icon: '??' },\n            { name: '/vcrename', desc: '����� ��� ���� �����', badge: '������� �������', icon: '??' },\n            { name: '/vcpermit', desc: '������ ���� �������', badge: '������� �������', icon: '?' },\n            { name: '/vcreject', desc: '��� ��� �� ������', badge: '������� �������', icon: '??' }\n        ]},\n        roles: { title: '����� �����', desc: '����� ����� ������ ������ �����', icon: '???', items: [\n            { name: '/giverole', desc: '����� ���� ����', badge: '������� �������', icon: '??' },\n            { name: '/removerole', desc: '����� ���� �� ���', badge: '������� �������', icon: '?' },\n            { name: '/roleall', desc: '����� ���� ����� �������', badge: '������� �������', icon: '??' },\n            { name: '/rolebots', desc: '����� ���� ����� �������', badge: '������� �������', icon: '??' },\n            { name: '/rolehumans', desc: '����� ���� ����� �����', badge: '������� �������', icon: '??' },\n            { name: '/createrole', desc: '����� ���� �����', badge: '������� �������', icon: '?' },\n            { name: '/deleterole', desc: '��� ���� �� �������', badge: '������� �������', icon: '???' },\n            { name: '/rolecolor', desc: '����� ��� ����', badge: '������� �������', icon: '??' },\n            { name: '/roleinfo', desc: '������� ���� �����', badge: '', icon: '??' },\n            { name: '/inrole', desc: '����� ����� ���� �����', badge: '', icon: '??' }\n        ]},\n        custom_roles: { title: '����� ������', desc: '����� ����� ������� ������� ��� ���', icon: '??', items: [\n            { name: '/customrole', desc: '����� ���� ���� ��', badge: '', icon: '??' },\n            { name: '/myrole', desc: '��� ������� ����� ������', badge: '', icon: '??' },\n            { name: '/myrole-color', desc: '����� ��� ����� ������', badge: '', icon: '??' },\n            { name: '/myrole-name', desc: '����� ��� ����� ������', badge: '', icon: '??' },\n            { name: '/myrole-icon', desc: '����� ������ ����� ������', badge: '', icon: '???' },\n            { name: '/myrole-give', desc: '������ ����� ������ �� ���', badge: '', icon: '??' },\n            { name: '/myrole-remove', desc: '����� ������ ������ �� ���', badge: '', icon: '?' },\n            { name: '/myrole-delete', desc: '��� ����� ������ �������', badge: '', icon: '???' },\n            { name: '/customroles-list', desc: '����� ���� ����� ������', badge: '������� �������', icon: '??' }\n        ]},\n        server_info: { title: '������� �������', desc: '����� ��� �������� �������� �������', icon: '??', items: [\n            { name: '/serverinfo', desc: '������� ������� �������', badge: '', icon: '??' },\n            { name: '/serverbanner', desc: '��� ������� ������', badge: '', icon: '??' },\n            { name: '/servericon', desc: '������ ������� ���� �����', badge: '', icon: '???' },\n            { name: '/serverstats', desc: '�������� ������� �������', badge: '', icon: '??' },\n            { name: '/boosts', desc: '����� ��������� ���� ��������', badge: '', icon: '??' },\n            { name: '/invites-top', desc: '���� ������� �����', badge: '', icon: '??' },\n            { name: '/channels-list', desc: '����� ����� ��������', badge: '', icon: '??' },\n            { name: '/roles-list', desc: '����� ������ �����', badge: '', icon: '???' },\n            { name: '/emojis-list', desc: '����� ���������� �������', badge: '', icon: '??' },\n            { name: '/stickers-list', desc: '����� ���������', badge: '', icon: '???' },\n            { name: '/bans-list', desc: '����� ���������', badge: '������� �������', icon: '??' },\n            { name: '/admins', desc: '����� ������� ���������', badge: '', icon: '??' },\n            { name: '/bots', desc: '����� ����� �������', badge: '', icon: '??' },\n            { name: '/vanity', desc: '���� ������� ������', badge: '', icon: '??' },\n            { name: '/features', desc: '����� ������� �������', badge: '', icon: '?' },\n            { name: '/created', desc: '����� ����� �������', badge: '', icon: '??' },\n            { name: '/uptime', desc: '��� ����� �����', badge: '', icon: '??' },\n            { name: '/ping', desc: '���� ���������', badge: '', icon: '??' },\n            { name: '/shards', desc: '������� ��������', badge: '', icon: '??' }\n        ]},\n        custom_bot: { title: '����� ����� �����', desc: '����� ����� ���� ����� ����� �����', icon: '??', items: [\n            { name: '/bot-setnick', desc: '����� ��� ����� �� �������', badge: '������� �������', icon: '??' },\n            { name: '/bot-setavatar', desc: '����� ���� �����', badge: '������� �������', icon: '???' },\n            { name: '/bot-setbanner', desc: '����� ��� �����', badge: '������� �������', icon: '??' },\n            { name: '/bot-setactivity', desc: '����� ���� ����� �����', badge: '������� �������', icon: '??' },\n            { name: '/bot-setstatus', desc: '����� ���� ������� Online/DND/Idle', badge: '������� �������', icon: '??' }\n        ]},\n        security: { title: '�������', desc: '����� ������� �� ������� ������� ������', icon: '???', items: [\n            { name: '/antiraid', desc: '�����/����� ������ �����', badge: '������� �������', icon: '??' },\n            { name: '/antinuke', desc: '������� ���� ������� Anti-Nuke', badge: '������� �������', icon: '???' },\n            { name: '/whitelist-add', desc: '����� ��� ������� �������', badge: '������� �������', icon: '?' },\n            { name: '/whitelist-remove', desc: '����� ��� �� ������� �������', badge: '������� �������', icon: '?' },\n            { name: '/whitelist-list', desc: '��� ������� �������', badge: '������� �������', icon: '??' },\n            { name: '/antibot', desc: '��� ���� ������� ��� �������', badge: '������� �������', icon: '??' },\n            { name: '/antispam', desc: '������ ������ �������� ��������', badge: '������� �������', icon: '?' },\n            { name: '/antilink', desc: '��� ��� �������', badge: '������� �������', icon: '??' },\n            { name: '/backup-create', desc: '����� ���� �������� �������', badge: '������� �������', icon: '??' },\n            { name: '/backup-load', desc: '������� ���� ��������', badge: '������� �������', icon: '??' },\n            { name: '/backup-list', desc: '����� ����� ����������', badge: '������� �������', icon: '??' },\n            { name: '/lockdown', desc: '����� ���� ����� ������� �����', badge: '������� �������', icon: '??' },\n            { name: '/unlockdown', desc: '����� ��� ���� ������� �������', badge: '������� �������', icon: '??' },\n            { name: '/security-status', desc: '����� ���� �������', badge: '', icon: '??' },\n            { name: '/security-audit', desc: '��� ����� �������� �������', badge: '������� �������', icon: '??' }\n        ]},\n        levels_cat: { title: '��������� �������', desc: '����� ��������� ������� ������', icon: '?', items: [\n            { name: '/rank', desc: '��� ����� ������ �������', badge: '', icon: '??' },\n            { name: '/levels-leaderboard', desc: '��������� �� ���������', badge: '', icon: '??' },\n            { name: '/setxp', desc: '����� ���� ������ ����', badge: '������� �������', icon: '?' },\n            { name: '/setlevel', desc: '����� ����� ���', badge: '������� �������', icon: '???' },\n            { name: '/resetlevels', desc: '����� ���� ���������', badge: '������� �������', icon: '???' },\n            { name: '/level-reward-add', desc: '����� ���� ������ ��� �����', badge: '������� �������', icon: '??' },\n            { name: '/level-reward-remove', desc: '����� ���� ������', badge: '������� �������', icon: '?' },\n            { name: '/level-rewards-list', desc: '����� ���� ��� ��������', badge: '', icon: '??' },\n            { name: '/levelcard-bg', desc: '����� ����� ����� ������', badge: '', icon: '??' },\n            { name: '/doublexp', desc: '����� ������ ������ 2x', badge: '������� �������', icon: '??' }\n        ]},\n        server_stats: { title: '�������� �������', desc: '����� ����� �������� ���������', icon: '??', items: [\n            { name: '/stats-setup', desc: '����� ����� ������ �������', badge: '������� �������', icon: '??' },\n            { name: '/stats-members', desc: '����� ���� �������', badge: '������� �������', icon: '??' },\n            { name: '/stats-bots', desc: '����� ���� �������', badge: '������� �������', icon: '??' },\n            { name: '/stats-channels', desc: '����� ���� �������', badge: '������� �������', icon: '??' },\n            { name: '/stats-roles', desc: '����� ���� �����', badge: '������� �������', icon: '???' },\n            { name: '/stats-boosts', desc: '����� ���� ��������', badge: '������� �������', icon: '??' },\n            { name: '/stats-online', desc: '����� ���� ���������� �������', badge: '������� �������', icon: '??' },\n            { name: '/stats-voice', desc: '����� ���� ���������� �� �����', badge: '������� �������', icon: '???' },\n            { name: '/stats-delete', desc: '��� ���� ����� ��������', badge: '������� �������', icon: '???' },\n            { name: '/stats-refresh', desc: '����� ���� ������ ��������', badge: '������� �������', icon: '??' },\n            { name: '/stats-format', desc: '����� ��� ����� ��������', badge: '������� �������', icon: '??' }\n        ]},\n        profile_cat: { title: '����� ������', desc: '����� ��������� ������� ��������', icon: '??', items: [\n            { name: '/profile', desc: '��� ����� �������� �������', badge: '', icon: '??' },\n            { name: '/rep', desc: '����� ���� ���� ���� (+rep)', badge: '', icon: '?' },\n            { name: '/daily', desc: '������ ������ ������ (Gold)', badge: '', icon: '??' },\n            { name: '/coins', desc: '����� �� ����� Gold', badge: '', icon: '??' },\n            { name: '/pay', desc: '����� ����� Gold ���� ���', badge: '', icon: '??' },\n            { name: '/setbio', desc: '����� ������ �������', badge: '', icon: '??' },\n            { name: '/settitle', desc: '����� ����� ������', badge: '', icon: '???' },\n            { name: '/setbadge', desc: '����� ������ �������', badge: '', icon: '???' },\n            { name: '/profile-bg', desc: '����� ����� ����� ���������', badge: '', icon: '??' },\n            { name: '/marry', desc: '������ �������� �� �������', badge: '', icon: '??' }\n        ]}\n    };\n\n    var catBtnMap = {\n        basic:'btnCatBasic', punishments:'btnCatPunishments', punishment_logs:'btnCatPunishmentLogs',\n        channels:'btnCatChannels', chat:'btnCatChat', voice:'btnCatVoice',\n        roles:'btnCatRoles', custom_roles:'btnCatCustomRoles', server_info:'btnCatServerInfo',\n        custom_bot:'btnCatCustomBot', security:'btnCatSecurity', levels_cat:'btnCatLevels',\n        server_stats:'btnCatServerStats', profile_cat:'btnCatProfile'\n    };\n    var catBadgeMap = {\n        basic:'badgeCatBasic', punishments:'badgeCatPunishments', punishment_logs:'badgeCatPunishmentLogs',\n        channels:'badgeCatChannels', chat:'badgeCatChat', voice:'badgeCatVoice',\n        roles:'badgeCatRoles', custom_roles:'badgeCatCustomRoles', server_info:'badgeCatServerInfo',\n        custom_bot:'badgeCatCustomBot', security:'badgeCatSecurity', levels_cat:'badgeCatLevels',\n        server_stats:'badgeCatServerStats', profile_cat:'badgeCatProfile'\n    };\n\n    var currentCat = 'punishments';\n    var currentFilter = 'all';\n    var disabledCmds = " + JSON.stringify((function() { try { var raw = settings.disabled_commands; if (!raw) return {}; var arr = typeof raw === "string" ? JSON.parse(raw) : raw; var m = {}; for (var i = 0; i < arr.length; i++) m[arr[i]] = true; return m; } catch(e) { return {}; } })()) + ";\n    var commandConfigs = " + JSON.stringify((function() { try { var raw = settings.command_configs; if (!raw) return {}; return typeof raw === "string" ? JSON.parse(raw) : (raw || {}); } catch(e) { return {}; } })()) + ";\n    var guildRoles = " + JSON.stringify((guildRoles || []).map(function(r) { return { id: r.id, name: r.name }; })) + ";\n    var guildChannels = " + JSON.stringify((guildTextChannels || []).map(function(c) { return { id: c.id, name: c.name }; })) + ";\n\n    function isEn(name) { return !disabledCmds[name]; }\n\n    function render() {\n        var container = document.getElementById('cmdsListContainer');\n        if (!container) return;\n        var data = DB[currentCat] || DB.punishments;\n        var t = document.getElementById('catTitle');\n        var d = document.getElementById('catDesc');\n        var ic = document.getElementById('catIcon');\n        if (t) t.innerText = data.title;\n        if (d) d.innerText = data.desc;\n        if (ic) ic.innerText = data.icon;\n        var searchEl = document.getElementById('cmdSearchInput');\n        var sv = searchEl ? searchEl.value.toLowerCase().trim() : '';\n        var filtered = data.items.filter(function(item) {\n            if (currentFilter === 'enabled' && !isEn(item.name)) return false;\n            if (currentFilter === 'disabled' && isEn(item.name)) return false;\n            if (sv && item.name.toLowerCase().indexOf(sv) === -1 && item.desc.toLowerCase().indexOf(sv) === -1) return false;\n            return true;\n        });\n        if (!filtered.length) {\n            container.innerHTML = '<div class=\"py-12 bg-[#12141f] border border-white/5 rounded-2xl text-center text-xs text-gray-500\">�� ���� ����� ������ ??</div>';\n            updateCounters(); return;\n        }\n        var html = '';\n        for (var i = 0; i < filtered.length; i++) {\n            var item = filtered[i];\n            var en = isEn(item.name);\n            var bh = item.badge ? '<span class=\"px-2.5 py-0.5 bg-purple-950/60 text-purple-300 border border-purple-800/40 rounded-lg text-[10px] font-bold flex items-center gap-1\"><span>' + item.badge + '</span><span>&#128737;</span></span>' : '';\n            var cfg = commandConfigs[item.name] || {};\n            var alias = cfg.alias || '';\n            var aRoles = cfg.allowedRoles || [];\n            var aChs = cfg.allowedChannels || [];\n            html += '<div class=\"cmd-card-wrap border border-white/5 rounded-2xl bg-[#12141f] overflow-hidden transition hover:border-purple-500/40' + (en ? '' : ' opacity-50') + '\" data-cmd=\"' + item.name + '\">';\n            html += '<div class=\"p-4 flex items-center justify-between\">';\n            html += '<div class=\"flex items-center gap-3\">';\n            html += '<label class=\"toggle\"><input type=\"checkbox\" data-cmd=\"' + item.name + '\"' + (en ? ' checked' : '') + '><span class=\"slider\"></span></label>';\n            html += '<button type=\"button\" class=\"cmd-expand-btn text-gray-500 hover:text-purple-400 p-1 text-xs transition cursor-pointer\" data-cmd=\"' + item.name + '\">&#9660;</button>';\n            html += '</div>';\n            html += '<div class=\"flex items-center gap-3\">';\n            html += '<div class=\"text-right\">';\n            html += '<div class=\"flex items-center justify-end gap-2\">' + bh + '<span class=\"font-black text-white text-xs font-mono\">' + item.name + '</span></div>';\n            html += '<p class=\"text-[11px] text-gray-400 mt-0.5\">' + item.desc + '</p>';\n            html += '</div>';\n            html += '<div class=\"w-9 h-9 rounded-xl bg-[#0b0d14] border border-white/5 flex items-center justify-center text-sm shadow-inner\">' + (item.icon || '&#9881;') + '</div>';\n            html += '</div>';\n            html += '</div>';\n            // Accordion Settings Details\n            html += '<div class=\"cmd-accordion border-t border-white/5 bg-[#0b0d14] p-4 space-y-4 text-right\" data-cmd=\"' + item.name + '\" style=\"display:none;\">';\n            html += '<div class=\"flex items-center justify-between gap-4 flex-wrap\">';\n            html += '<div class=\"flex-1 min-w-[200px]\">';\n            html += '<label class=\"block text-[10px] text-gray-400 font-bold mb-1\">������ ���� ����� (Custom Alias)</label>';\n            html += '<input type=\"text\" class=\"cmd-alias-input w-full bg-[#12141f] border border-white/10 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white outline-none text-right\" placeholder=\"����: !b �� /b\" data-cmd=\"' + item.name + '\" value=\"' + alias.split('\"').join('&quot;') + '\">';\n            html += '</div>';\n            html += '</div>';\n            html += '<div>';\n            html += '<label class=\"block text-[10px] text-gray-400 font-bold mb-1.5\">����� ������� ��� ��� ������ ����� (Allowed Roles)</label>';\n            html += '<div class=\"flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-[#12141f]/50 border border-white/5 rounded-xl justify-end\">';\n            for (var ri = 0; ri < guildRoles.length; ri++) {\n                var role = guildRoles[ri];\n                var rChecked = aRoles.indexOf(role.id) !== -1;\n                html += '<label class=\"flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/5 bg-[#12141f] hover:border-purple-500/30 cursor-pointer text-[10px] text-gray-300\">';\n                html += '<span>' + role.name + '</span>';\n                html += '<input type=\"checkbox\" class=\"cmd-role-chk accent-purple-600\" data-cmd=\"' + item.name + '\" data-rid=\"' + role.id + '\"' + (rChecked ? ' checked' : '') + '>';\n                html += '</label>';\n            }\n            html += '</div>';\n            html += '</div>';\n            html += '<div>';\n            html += '<label class=\"block text-[10px] text-gray-400 font-bold mb-1.5\">������� ������� ���� ��� ������ ����� (Allowed Channels)</label>';\n            html += '<div class=\"flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-[#12141f]/50 border border-white/5 rounded-xl justify-end\">';\n            for (var ci = 0; ci < guildChannels.length; ci++) {\n                var ch = guildChannels[ci];\n                var cChecked = aChs.indexOf(ch.id) !== -1;\n                html += '<label class=\"flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/5 bg-[#12141f] hover:border-purple-500/30 cursor-pointer text-[10px] text-gray-300\">';\n                html += '<span>#' + ch.name + '</span>';\n                html += '<input type=\"checkbox\" class=\"cmd-ch-chk accent-purple-600\" data-cmd=\"' + item.name + '\" data-chid=\"' + ch.id + '\"' + (cChecked ? ' checked' : '') + '>';\n                html += '</label>';\n            }\n            html += '</div>';\n            html += '</div>';\n            html += '<div class=\"flex items-center justify-between pt-2 border-t border-white/5\">';\n            html += '<button type=\"button\" class=\"cmd-reset-btn px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 rounded-xl text-xs font-bold transition cursor-pointer\" data-cmd=\"' + item.name + '\">����� ���</button>';\n            html += '<button type=\"button\" class=\"cmd-save-btn px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition shadow-lg cursor-pointer\" data-cmd=\"' + item.name + '\">��� ������ �����</button>';\n            html += '</div>';\n            html += '</div>';\n            html += '</div>';\n        }\n        container.innerHTML = html;\n        var checks = container.querySelectorAll('input[type=\"checkbox\"][data-cmd]:not(.cmd-role-chk):not(.cmd-ch-chk)');\n        for (var j = 0; j < checks.length; j++) {\n            (function(cb) {\n                cb.addEventListener('change', function() {\n                    window.toggleSingleCmd(cb.getAttribute('data-cmd'), cb.checked);\n                    var card = cb.closest('div.cmd-card-wrap');\n                    if (card) { if (cb.checked) card.classList.remove('opacity-50'); else card.classList.add('opacity-50'); }\n                });\n            })(checks[j]);\n        }\n        var expBtns = container.querySelectorAll('.cmd-expand-btn');\n        for (var eb = 0; eb < expBtns.length; eb++) {\n            (function(btn) {\n                btn.addEventListener('click', function() {\n                    var cmdName = btn.getAttribute('data-cmd');\n                    var panel = container.querySelector('.cmd-accordion[data-cmd=\"' + cmdName + '\"]');\n                    if (!panel) return;\n                    var open = panel.style.display !== 'none';\n                    panel.style.display = open ? 'none' : 'block';\n                    btn.innerHTML = open ? '&#9660;' : '&#9650;';\n                });\n            })(expBtns[eb]);\n        }\n        var saveBtns = container.querySelectorAll('.cmd-save-btn');\n        for (var sb = 0; sb < saveBtns.length; sb++) {\n            (function(btn) {\n                btn.addEventListener('click', function() {\n                    var cmdName = btn.getAttribute('data-cmd');\n                    var panel = container.querySelector('.cmd-accordion[data-cmd=\"' + cmdName + '\"]');\n                    if (!panel) return;\n                    var aliasInput = panel.querySelector('.cmd-alias-input');\n                    var alias = aliasInput ? aliasInput.value.trim() : '';\n                    var roleChks = panel.querySelectorAll('.cmd-role-chk:checked');\n                    var chChks = panel.querySelectorAll('.cmd-ch-chk:checked');\n                    var roles = [], chs = [];\n                    for (var i = 0; i < roleChks.length; i++) roles.push(roleChks[i].getAttribute('data-rid'));\n                    for (var i = 0; i < chChks.length; i++) chs.push(chChks[i].getAttribute('data-chid'));\n                    if (!commandConfigs[cmdName]) commandConfigs[cmdName] = {};\n                    commandConfigs[cmdName].alias = alias;\n                    commandConfigs[cmdName].allowedRoles = roles;\n                    commandConfigs[cmdName].allowedChannels = chs;\n                    saveStates();\n                    updateCounters();\n                });\n            })(saveBtns[sb]);\n        }\n        var resetBtns = container.querySelectorAll('.cmd-reset-btn');\n        for (var rb = 0; rb < resetBtns.length; rb++) {\n            (function(btn) {\n                btn.addEventListener('click', function() {\n                    var cmdName = btn.getAttribute('data-cmd');\n                    delete commandConfigs[cmdName];\n                    render();\n                    saveStates();\n                    updateCounters();\n                });\n            })(resetBtns[rb]);\n        }\n        updateCounters();\n        if (window.zenoI18n && typeof window.zenoI18n.apply === \"function\") { try { window.zenoI18n.apply(); } catch(e) {} }\n    }\n\n    function updateCounters() {\n        var total = 0, enabled = 0;\n        var keys = Object.keys(DB);\n        for (var i = 0; i < keys.length; i++) {\n            var cat = keys[i];\n            var items = DB[cat].items;\n            total += items.length;\n            var catEn = 0;\n            for (var j = 0; j < items.length; j++) { if (isEn(items[j].name)) catEn++; }\n            enabled += catEn;\n            var bId = catBadgeMap[cat];\n            if (bId) {\n                var badge = document.getElementById(bId);\n                if (badge) {\n                    badge.textContent = catEn + '/' + items.length;\n                    badge.className = catEn === 0\n                        ? 'px-2 py-0.5 bg-rose-950/60 text-rose-400 rounded-lg text-[10px] font-mono'\n                        : catEn < items.length\n                            ? 'px-2 py-0.5 bg-amber-950/60 text-amber-400 rounded-lg text-[10px] font-mono'\n                            : 'px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono';\n                }\n            }\n        }\n        var aliasCount = Object.keys(commandConfigs).filter(function(k){ return commandConfigs[k] && commandConfigs[k].alias; }).length;\n        var acEl = document.getElementById('customAliasesCount');\n        if (acEl) acEl.textContent = aliasCount;\n        var te = document.getElementById('totalCmdsCount');\n        var ee = document.getElementById('enabledCmdsCount');\n        if (te) te.textContent = total;\n        if (ee) ee.textContent = enabled;\n    }\n\n    function showSaved() {\n        var el = document.getElementById('cmdSaveIndicator');\n        if (el) { el.classList.remove('opacity-0'); setTimeout(function() { el.classList.add('opacity-0'); }, 2000); }\n    }\n\n    function saveStates() {\n        try {\n            var gId = window.location.pathname.split('/')[2];\n            if (!gId) return;\n            var disArr = Object.keys(disabledCmds).filter(function(k) { return disabledCmds[k]; });\n            var xhr = new XMLHttpRequest();\n            xhr.open('POST', '/api/guild/' + gId + '/settings', true);\n            xhr.setRequestHeader('Content-Type', 'application/json');\n            xhr.onload = function() { try { if (JSON.parse(xhr.responseText).success) showSaved(); } catch(e) {} };\n            xhr.send(JSON.stringify({ disabled_commands: JSON.stringify(disArr), command_configs: JSON.stringify(commandConfigs) }));\n        } catch(e) {}\n    }\n\n    window.switchCmdCategory = function(catKey) {\n        currentCat = catKey;\n        var bKeys = Object.keys(catBtnMap);\n        for (var i = 0; i < bKeys.length; i++) {\n            var btn = document.getElementById(catBtnMap[bKeys[i]]);\n            if (!btn) continue;\n            btn.className = bKeys[i] === catKey\n                ? 'w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold bg-purple-600 text-white shadow-lg transition cursor-pointer'\n                : 'w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer';\n        }\n        render();\n    };\n\n    window.searchCommands = function() { render(); };\n\n    window.filterCmdStatus = function(status) {\n        currentFilter = status;\n        var statusList = ['all','enabled','disabled'];\n        for (var i = 0; i < statusList.length; i++) {\n            var s = statusList[i];\n            var label = s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1);\n            var btn = document.getElementById('btnFilter' + label);\n            if (btn) btn.className = s === status\n                ? 'px-3 py-1 rounded-lg text-xs font-bold bg-purple-600 text-white transition shadow cursor-pointer'\n                : 'px-3 py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer';\n        }\n        render();\n    };\n\n    window.toggleAllCategoryCmds = function(enable) {\n        var items = (DB[currentCat] || DB.punishments).items;\n        for (var i = 0; i < items.length; i++) { disabledCmds[items[i].name] = !enable; }\n        saveStates(); render();\n    };\n\n    window.toggleSingleCmd = function(cmdName, enabled) {\n        disabledCmds[cmdName] = !enabled;\n        saveStates(); updateCounters();\n    };\n\n    // Run render immediately\n    render();\n})();\n\n</script>";
            } else if (section === 'automod') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Master Toggle & Banner -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                            <label class="toggle">
                                <input type="checkbox" name="automod_enabled" value="1" ${settings.automod_enabled !== 0 ? 'checked' : ''} onchange="saveAutomodSetting('automod_enabled', this.checked)">
                                <span class="slider"></span>
                            </label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">������� ���������</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">����� ������ �� ������� ��� �������</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30">
                                    ???
                                </div>
                            </div>
                        </div>

                        <!-- 2. Discord AutoMod Header -->
                        <div class="space-y-4">
                            <div class="flex items-center justify-between">
                                <span class="text-[11px] text-gray-400 font-bold">����� �������</span>
                                <div class="flex items-center gap-2 text-indigo-400 font-bold text-xs">
                                    <span>Discord AutoMod � ����� ������ �� Discord ������ - ����� �������</span>
                                    <span>??</span>
                                </div>
                            </div>

                            <!-- ����� ������� �������� -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="bad_words_enabled" value="1" ${settings.bad_words_enabled ? 'checked' : ''} onchange="saveAutomodSetting('bad_words_enabled', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="document.getElementById('sec_strict_words').scrollIntoView({behavior:'smooth'})" class="text-gray-400 hover:text-white p-1 text-xs">??</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">����� ������� ��������</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">����</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">����� ������� ������� �������� �������� ��� ������</p>
                                    </div>
                                    <span class="text-base">???</span>
                                </div>
                            </div>

                            <!-- ��� ����� ��������� -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_invites" value="1" ${settings.anti_invites ? 'checked' : ''} onchange="saveAutomodSetting('anti_invites', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_invites', '��� ����� ���������')" class="text-gray-400 hover:text-white p-1 text-xs" title="�������">??</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">��� ����� ���������</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">����</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">��� ������ ����� ����� ��������� ������</p>
                                    </div>
                                    <span class="text-base">??</span>
                                </div>
                            </div>
                        </div>

                        <!-- 3. ����� ������ (Spam Filters) -->
                        <div class="space-y-3 pt-2">
                            <span class="text-[11px] text-gray-400 font-bold block">����� ������</span>

                            <!-- ������ ������ -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_spam" value="1" ${settings.anti_spam ? 'checked' : ''} onchange="saveAutomodSetting('anti_spam', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_spam', '������ ������')" class="text-gray-400 hover:text-white p-1 text-xs" title="�������">??</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">������ ������</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">����</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">��� ���� ������� ������� ���������</p>
                                    </div>
                                    <span class="text-base">???</span>
                                </div>
                            </div>

                            <!-- ��� ������� -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_link" value="1" ${settings.anti_link ? 'checked' : ''} onchange="saveAutomodSetting('anti_link', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_link', '��� �������')" class="text-gray-400 hover:text-white p-1 text-xs" title="�������">??</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">��� �������</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">����</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">��� ������� ����� ����� ���</p>
                                    </div>
                                    <span class="text-base">???</span>
                                </div>
                            </div>

                            <!-- ��� ���� ������ -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_mass_mention" value="1" ${settings.anti_mass_mention ? 'checked' : ''} onchange="saveAutomodSetting('anti_mass_mention', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_mass_mention', '��� ���� ������')" class="text-gray-400 hover:text-white p-1 text-xs" title="�������">??</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">��� ���� ������</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">����</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">��� ��� �������� ������� ��� �� ������� �������</p>
                                    </div>
                                    <span class="text-base">??</span>
                                </div>
                            </div>

                            <!-- ��� ������ ������� -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_caps" value="1" ${settings.anti_caps ? 'checked' : ''} onchange="saveAutomodSetting('anti_caps', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_caps', '��� ������ �������')" class="text-gray-400 hover:text-white p-1 text-xs" title="�������">??</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">��� ������ �������</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">����</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">��� ������� ���� ����� ��� ���� ����� ���� ���� (70% �� ����)</p>
                                    </div>
                                    <span class="text-base">??</span>
                                </div>
                            </div>

                            <!-- ����� Spoilers -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_spoilers" value="1" ${settings.anti_spoilers ? 'checked' : ''} onchange="saveAutomodSetting('anti_spoilers', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_spoilers', '����� Spoilers')" class="text-gray-400 hover:text-white p-1 text-xs" title="�������">??</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">����� Spoilers</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">����</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">��� ��������� ������ ������� ��������</p>
                                    </div>
                                    <span class="text-base">??</span>
                                </div>
                            </div>

                            <!-- �� Zalgo -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_zalgo" value="1" ${settings.anti_zalgo ? 'checked' : ''} onchange="saveAutomodSetting('anti_zalgo', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_zalgo', '�� Zalgo')" class="text-gray-400 hover:text-white p-1 text-xs" title="�������">??</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">�� Zalgo</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">����</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">��� ������ ������� ������� ������� (Zalgo text)</p>
                                    </div>
                                    <span class="text-base">??</span>
                                </div>
                            </div>
                        </div>

                        <!-- 4. ����� ������ - ����� ����� (Bot Shield Automod) -->
                        <div class="space-y-3 pt-4 border-t border-white/5">
                            <div class="flex items-center justify-between">
                                <span class="text-[11px] text-gray-400">����� ���� �� �������</span>
                                <div class="flex items-center gap-2 text-amber-400 font-bold text-xs">
                                    <span>����� ����� � ����� ������ ������ ����� ������</span>
                                    <span>???</span>
                                </div>
                            </div>

                            <!-- ������ ������ ������� -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_spam_adv" value="1" checked onchange="saveAutomodSetting('anti_spam_adv', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_spam_adv', '������ ������ �������')" class="text-gray-400 hover:text-white p-1 text-xs" title="�������">??</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">������ ������</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">����</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">��� ������� �������� �������� ������ ������ ��������</p>
                                    </div>
                                    <span class="text-base">???</span>
                                </div>
                            </div>

                            <!-- ����� �������� -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_emoji" value="1" ${settings.anti_emoji ? 'checked' : ''} onchange="saveAutomodSetting('anti_emoji', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_emoji', '����� ��������')" class="text-gray-400 hover:text-white p-1 text-xs" title="�������">??</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">����� ��������</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">����</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">��� ��������� ������ ������ ���������</p>
                                    </div>
                                    <span class="text-base">?</span>
                                </div>
                            </div>

                            <!-- ����� ���� -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_text_repeat" value="1" ${settings.anti_text_repeat ? 'checked' : ''} onchange="saveAutomodSetting('anti_text_repeat', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_text_repeat', '����� ����')" class="text-gray-400 hover:text-white p-1 text-xs" title="�������">??</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">����� ����</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">����</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">��� ����� ��� ������ �� ������� ���� ����</p>
                                    </div>
                                    <span class="text-base">?</span>
                                </div>
                            </div>

                            <!-- ����� ����� -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_repeat_messages" value="1" ${settings.anti_repeat_messages ? 'checked' : ''} onchange="saveAutomodSetting('anti_repeat_messages', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_repeat_messages', '����� �����')" class="text-gray-400 hover:text-white p-1 text-xs" title="�������">??</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">����� �����</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">����</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">��� ����� ��� ������� ��� ���� �������</p>
                                    </div>
                                    <span class="text-base">??</span>
                                </div>
                            </div>

                            <!-- ���� �������� -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_stickers" value="1" ${settings.anti_stickers ? 'checked' : ''} onchange="saveAutomodSetting('anti_stickers', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_stickers', '���� ��������')" class="text-gray-400 hover:text-white p-1 text-xs" title="�������">??</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">���� ��������</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">����</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">��� ����� �������� ���� ����� �����</p>
                                    </div>
                                    <span class="text-base">?</span>
                                </div>
                            </div>

                            <!-- ���� ������ -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_line_spam" value="1" ${settings.anti_line_spam ? 'checked' : ''} onchange="saveAutomodSetting('anti_line_spam', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_line_spam', '���� ������')" class="text-gray-400 hover:text-white p-1 text-xs" title="�������">??</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">���� ������</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">����</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">��� ������� ���� ����� ��� ���� ����� �����</p>
                                    </div>
                                    <span class="text-base">?</span>
                                </div>
                            </div>

                            <!-- ������� ������� -->
                            <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_long_messages" value="1" ${settings.anti_long_messages ? 'checked' : ''} onchange="saveAutomodSetting('anti_long_messages', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_long_messages', '������� �������')" class="text-gray-400 hover:text-white p-1 text-xs" title="�������">??</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">������� �������</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">����</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 mt-0.5">��� ������� ���� ������ ���� ������ ���� ������</p>
                                    </div>
                                    <span class="text-base">??</span>
                                </div>
                            </div>
                        </div>

                        <!-- 5. ���� �������� ��������� ��������� -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span class="px-2.5 py-1 bg-amber-950/60 text-amber-300 border border-amber-800/40 rounded-xl text-xs font-mono font-bold" id="warnRulesCount">${(warnPunishmentsList || []).length} �����</span>
                                <div class="text-right">
                                    <div class="flex items-center justify-end gap-2 text-white font-black text-sm">
                                        <span>���� �������� ��������� ���������</span>
                                        <span class="text-amber-400">??</span>
                                    </div>
                                    <p class="text-gray-400 text-[10px] mt-0.5">����� ������ ������� ��� ����� ��� ��������� �� ��� warn!</p>
                                </div>
                            </div>

                            <div id="warnPunishmentsList" class="space-y-2">
                                ${(warnPunishmentsList && warnPunishmentsList.length > 0) ? warnPunishmentsList.map(rule => `
                                    <div class="bg-[#0b0d14] border border-white/5 p-3.5 rounded-xl flex items-center justify-between hover:border-amber-500/30 transition text-xs">
                                        <button type="button" onclick="deleteWarnRule(${rule.id})" class="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">��� ???</button>
                                        <div class="flex items-center gap-3">
                                            <div class="text-right">
                                                <span class="font-bold text-white block">��� ���� ${rule.warn_count} �������</span>
                                                <span class="text-[10px] text-amber-400 font-mono">�������: ${rule.action_type}</span>
                                            </div>
                                            <span class="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center font-bold">??</span>
                                        </div>
                                    </div>
                                `).join('') : `
                                    <div class="py-8 text-center space-y-2">
                                        <div class="w-12 h-12 rounded-full bg-white/5 text-gray-400 flex items-center justify-center text-xl mx-auto">??</div>
                                        <h5 class="text-xs font-bold text-gray-300">�� ���� ����� ���</h5>
                                        <p class="text-[10px] text-gray-500">��� ����� ����� ������ ������</p>
                                    </div>
                                `}
                            </div>

                            <!-- �� ����� ����� ����� -->
                            <button type="button" onclick="openAddWarnModal()" class="w-full py-3 bg-[#171926] hover:bg-[#1f2233] border border-dashed border-amber-500/40 hover:border-amber-500/80 rounded-xl text-amber-300 font-bold text-xs transition flex items-center justify-center gap-2">
                                <span>?</span>
                                <span>����� ����� �����</span>
                            </button>
                        </div>

                        <!-- 6. ���� ������� �������� ������ (Strict Bad Words Filter) -->
                        <div id="sec_strict_words" class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-5 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <label class="toggle">
                                    <input type="checkbox" name="strict_bad_words_enabled" value="1" ${settings.strict_bad_words_enabled ? 'checked' : ''} onchange="saveAutomodSetting('strict_bad_words_enabled', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <div class="text-right">
                                    <div class="flex items-center justify-end gap-2 text-rose-400 font-black text-sm">
                                        <span>���� ������� �������� ������</span>
                                        <span>??</span>
                                    </div>
                                    <p class="text-gray-400 text-[10px] mt-0.5">���� ��� ���� ������� � ����� Discord AutoMod</p>
                                </div>
                            </div>

                            <!-- ���� ������� �������� -->
                            <div class="space-y-2">
                                <div class="flex items-center justify-between text-xs text-gray-300 font-bold">
                                    <div class="flex items-center gap-2 text-[10px] text-gray-400">
                                        <span>���� � ����� ��� ������ �� �� ����</span>
                                        <span>�</span>
                                        <span>���� ����� � ������ ����� ���</span>
                                    </div>
                                    <div class="flex items-center gap-1 text-white">
                                        <span>������� ��������</span>
                                        <span>??</span>
                                    </div>
                                </div>

                                <div class="flex items-center gap-2">
                                    <button type="button" onclick="addStrictBadWord()" class="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-rose-950/40">�����</button>
                                    <select id="strictWordMatchMode" class="bg-[#0b0d14] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-gray-300 outline-none">
                                        <option value="partial">����</option>
                                        <option value="exact">���� �����</option>
                                    </select>
                                    <input type="text" id="strictWordInput" placeholder="���� ���� ������..." class="flex-1 bg-[#0b0d14] border border-white/5 focus:border-rose-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right" onkeydown="if(event.key==='Enter') addStrictBadWord()">
                                </div>

                                <div id="strictWordsContainer" class="flex flex-wrap gap-2 pt-2">
                                    ${(settings.bad_words_list ? settings.bad_words_list.split(/[\n,]+/).map(w => w.trim()).filter(Boolean) : []).map(w => `
                                        <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-950/60 text-rose-300 border border-rose-800/40 rounded-xl text-xs font-mono">
                                            <span>${w}</span>
                                            <button type="button" onclick="removeStrictBadWord('${w}')" class="text-rose-400 hover:text-white font-bold text-xs">�</button>
                                        </span>
                                    `).join('')}
                                </div>
                            </div>

                            <!-- ����� ����� ��� (Whitelist) -->
                            <div class="space-y-2 pt-3 border-t border-white/5">
                                <div class="flex items-center justify-end gap-1 text-xs font-bold text-emerald-400">
                                    <span>����� ����� ��� (Whitelist)</span>
                                    <span>???</span>
                                </div>
                                <p class="text-[10px] text-gray-400 text-right">��� ����� ����� ��� ���� ������ ����� ������</p>

                                <div class="flex items-center gap-2">
                                    <button type="button" onclick="addWhitelistedWord()" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-950/40">�����</button>
                                    <input type="text" id="whitelistWordInput" placeholder="���� ���� ����� ���..." class="flex-1 bg-[#0b0d14] border border-white/5 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right" onkeydown="if(event.key==='Enter') addWhitelistedWord()">
                                </div>

                                <div id="whitelistWordsContainer" class="flex flex-wrap gap-2 pt-2">
                                    ${(settings.whitelist_words_list ? settings.whitelist_words_list.split(/[\n,]+/).map(w => w.trim()).filter(Boolean) : []).map(w => `
                                        <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 rounded-xl text-xs font-mono">
                                            <span>${w}</span>
                                            <button type="button" onclick="removeWhitelistedWord('${w}')" class="text-emerald-400 hover:text-white font-bold text-xs">�</button>
                                        </span>
                                    `).join('')}
                                </div>
                            </div>

                            <!-- ����� ������ �� ������ -->
                            <div class="space-y-2 pt-3 border-t border-white/5">
                                <div class="flex items-center justify-end gap-1 text-xs font-bold text-white">
                                    <span>����� ������ �� ������</span>
                                    <span class="text-emerald-400">???</span>
                                </div>
                                <input type="text" name="automod_exempt_users" value="${settings.automod_exempt_users || ''}" placeholder="���� �� ��� �� ���� ��� ID..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-mono">
                                <p class="text-[10px] text-gray-500 text-right">�������� ��� ������ �������� � ����� ��� ��� ����</p>
                            </div>

                            <!-- ���� ����� (�������) -->
                            <div class="space-y-2 pt-3 border-t border-white/5">
                                <div class="flex items-center justify-end gap-1 text-xs font-bold text-white">
                                    <span>���� ����� ((�������))</span>
                                    <span>??</span>
                                </div>
                                ${renderChannelSelect('automod_log_channel', settings.automod_log_channel || settings.log_channel || '')}
                            </div>
                        </div>

                    </div>

                    <script>
                    async function saveAutomodSetting(key, value) {
                        try {
                            const res = await fetch('/api/guild/${guildId}/settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ [key]: value ? 1 : 0 })
                            });
                            const data = await res.json();
                            const status = document.getElementById('saveStatus');
                            if (status) {
                                status.classList.remove('hidden');
                                setTimeout(() => status.classList.add('hidden'), 3000);
                            }
                        } catch(e) {
                            console.error('Failed to save automod setting', e);
                        }
                    }

                    async function addStrictBadWord() {
                        const input = document.getElementById('strictWordInput');
                        const word = input.value.trim();
                        if (!word) return;
                        
                        let current = ${JSON.stringify(String(settings.bad_words_list || ''))};
                        let words = current ? current.split(/[\n,]+/).map(w => w.trim()).filter(Boolean) : [];
                        if (!words.includes(word)) {
                            words.push(word);
                            await fetch('/api/guild/${guildId}/settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ bad_words_list: words.join(',') })
                            });
                            location.reload();
                        }
                    }

                    async function removeStrictBadWord(word) {
                        let current = ${JSON.stringify(String(settings.bad_words_list || ''))};
                        let words = current ? current.split(/[\n,]+/).map(w => w.trim()).filter(Boolean) : [];
                        words = words.filter(w => w !== word);
                        await fetch('/api/guild/${guildId}/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ bad_words_list: words.join(',') })
                        });
                        location.reload();
                    }

                    async function addWhitelistedWord() {
                        const input = document.getElementById('whitelistWordInput');
                        const word = input.value.trim();
                        if (!word) return;

                        let current = ${JSON.stringify(String(settings.whitelist_words_list || ''))};
                        let words = current ? current.split(/[\n,]+/).map(w => w.trim()).filter(Boolean) : [];
                        if (!words.includes(word)) {
                            words.push(word);
                            await fetch('/api/guild/${guildId}/settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ whitelist_words_list: words.join(',') })
                            });
                            location.reload();
                        }
                    }

                    async function removeWhitelistedWord(word) {
                        let current = ${JSON.stringify(String(settings.whitelist_words_list || ''))};
                        let words = current ? current.split(/[\n,]+/).map(w => w.trim()).filter(Boolean) : [];
                        words = words.filter(w => w !== word);
                        await fetch('/api/guild/${guildId}/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ whitelist_words_list: words.join(',') })
                        });
                        location.reload();
                    }

                    async function openAddWarnModal() {
                        const count = prompt('���� ��� ��������� ������� ������ ������� (�����: 3):');
                        if (!count || isNaN(count)) return;
                        const action = prompt('���� ��� �������:\\n1 = timeout_5m (��� 5 �����)\\n2 = timeout_1h (��� ����)\\n3 = timeout_24h (��� 24 ����)\\n4 = kick (���)\\n5 = ban (��� �����)', '1');
                        
                        const actionMap = { '1': 'timeout_5m', '2': 'timeout_1h', '3': 'timeout_24h', '4': 'kick', '5': 'ban' };
                        const finalAction = actionMap[action] || 'timeout_5m';

                        try {
                            const res = await fetch('/api/guild/${guildId}/warn-punishments', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ warnCount: parseInt(count), actionType: finalAction })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('? ��� ����� ����� ������� ��������� �����!');
                                location.reload();
                            } else {
                                alert('? ���: ' + (data.error || '��� �������'));
                            }
                        } catch(e) {
                            alert('��� ��� �� �������');
                        }
                    }

                    async function configureAutomodRule(ruleKey, ruleTitle) {
                        const exemptUsersSec = document.querySelector('input[name="automod_exempt_users"]');
                        if (ruleKey === 'anti_mass_mention') {
                            const currentLimit = prompt('���� ���� ������ �������� ������� ��� �� ������� ������� (�����: 5):', '5');
                            if (currentLimit && !isNaN(currentLimit)) {
                                await saveAutomodSetting('anti_mass_mention_limit', parseInt(currentLimit));
                                alert('? �� ����� �� �������� �����!');
                            }
                        } else if (ruleKey === 'anti_long_messages') {
                            const currentLimit = prompt('���� ���� ������ ���� ������� ������� (�����: 1000):', '1000');
                            if (currentLimit && !isNaN(currentLimit)) {
                                await saveAutomodSetting('max_message_length', parseInt(currentLimit));
                                alert('? �� ����� �� ��� ������� �����!');
                            }
                        } else if (ruleKey === 'bad_words_enabled') {
                            const sec = document.getElementById('sec_strict_words');
                            if (sec) sec.scrollIntoView({ behavior: 'smooth' });
                        } else {
                            if (exemptUsersSec) {
                                exemptUsersSec.scrollIntoView({ behavior: 'smooth' });
                                exemptUsersSec.focus();
                                alert('?? ������� ' + ruleTitle + ':\\n����� ������� ����� ������ ��� ��� "����� ������ �� ������" �������.');
                            } else {
                                alert('?? ' + ruleTitle + ' ���� ������ ��� ��������� �������.');
                            }
                        }
                    }

                    async function deleteWarnRule(ruleId) {
                        if (!confirm('�� ��� ����� �� ����� �� ��� ����� ������� ���')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/warn-punishments/' + ruleId, {
                                method: 'DELETE'
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('? �� ����� �����!');
                                location.reload();
                            } else {
                                alert('? ��� �� �����');
                            }
                        } catch(e) {
                            alert('��� ��� �� �������');
                        }
                    }
                    </script>
`;
            } else if (section === 'invites') {
const leaderboard = database.getInvitesLeaderboard ? database.getInvitesLeaderboard(guildId, 20) : [];
                const totalInvitesCount = leaderboard.reduce((acc, r) => acc + (r.total || 0), 0);
                const topInviter = leaderboard.length > 0 ? leaderboard[0] : null;

                const lbRowsHtml = leaderboard.length > 0 ? leaderboard.map((item, index) => {
                    const memberObj = botGuild?.members?.cache?.get(item.user_id);
                    const name = memberObj ? memberObj.user.username : `User (${item.user_id})`;
                    const avatar = memberObj ? memberObj.user.displayAvatarURL({ dynamic: true }) : 'https://cdn.discordapp.com/embed/avatars/0.png';
                    const medal = index === 0 ? '??' : (index === 1 ? '??' : (index === 2 ? '??' : `#${index + 1}`));
                    return `
                        <tr class="border-b border-white/5 hover:bg-white/[0.02] transition text-right">
                            <td class="py-3 px-4 font-bold text-center text-amber-400 font-mono">${medal}</td>
                            <td class="py-3 px-4 flex items-center gap-3 justify-end">
                                <div>
                                    <div class="font-bold text-white text-xs">${name}</div>
                                    <div class="text-[10px] text-gray-500 font-mono">${item.user_id}</div>
                                </div>
                                <img src="${avatar}" class="w-7 h-7 rounded-full object-cover">
                            </td>
                            <td class="py-3 px-4 font-bold text-emerald-400 font-mono text-center">${item.regular}</td>
                            <td class="py-3 px-4 font-bold text-rose-400 font-mono text-center">${item.leaves}</td>
                            <td class="py-3 px-4 font-bold text-orange-400 font-mono text-center">${item.fake}</td>
                            <td class="py-3 px-4 font-bold text-purple-400 font-mono text-center">${item.bonus}</td>
                            <td class="py-3 px-4 font-black text-yellow-400 font-mono text-center text-sm">${item.total}</td>
                        </tr>
                    `;
                }).join('') : `<tr><td colspan="7" class="text-center py-8 text-gray-500 text-xs">�� ���� ������ ����� ����� ��� ����</td></tr>`;

                formFieldsHtml = `
                    <div class="space-y-6 text-right">
                        <!-- Top Header -->
                        <div class="flex flex-col md:flex-row items-center justify-between gap-4 bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl">
                            <div class="flex items-center gap-3">
                                <button type="button" onclick="resetAllInvitesDirect()" class="px-4 py-2 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 rounded-xl text-xs font-bold transition">
                                    ??? ����� �� �������
                                </button>
                            </div>
                            <div>
                                <h3 class="font-black text-white text-xl">����� ������� ������� (Invite Tracker) ??</h3>
                                <p class="text-gray-400 text-xs mt-1">���� ���� ��� ��� ����� ������� ����� ������� �������� ���������� �������� �������</p>
                            </div>
                        </div>

                        <!-- 3 Stat Cards -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl">
                                <span class="text-gray-400 text-[11px]">������ ������� �������</span>
                                <h4 class="text-2xl font-black text-yellow-400 mt-1 font-mono">${totalInvitesCount.toLocaleString()}</h4>
                                <span class="text-[10px] text-emerald-400">? ���� ���� �� �������</span>
                            </div>
                            <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl">
                                <span class="text-gray-400 text-[11px]">����� ������� (Top Inviter)</span>
                                <h4 class="text-base font-black text-white mt-1 truncate">${topInviter ? (botGuild?.members?.cache?.get(topInviter.user_id)?.user.username || topInviter.user_id) : '�� ����'}</h4>
                                <span class="text-[10px] text-amber-400 font-mono font-bold">${topInviter ? topInviter.total : 0} ���� �����</span>
                            </div>
                            <div class="bg-[#1c1f2e] border border-white/5 p-4 rounded-2xl">
                                <span class="text-gray-400 text-[11px]">������� ��������� �������</span>
                                <h4 class="text-2xl font-black text-purple-400 mt-1 font-mono">${leaderboard.length}</h4>
                                <span class="text-[10px] text-indigo-400">?? ����� ������</span>
                            </div>
                        </div>

                        <!-- Add Bonus Invites Box -->
                        <div class="bg-[#1c1f2e] border border-white/5 p-6 rounded-2xl space-y-4">
                            <h4 class="font-bold text-white text-sm">?? ����� �� ��� ����� ������ (Bonus Invites)</h4>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">���� �� ���� ����� (User ID)</label>
                                    <input type="text" id="bonusUserId" placeholder="����: 123456789012345678" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">��� ������� (���� ������� / ���� �����)</label>
                                    <input type="number" id="bonusAmount" value="5" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                                <div>
                                    <button type="button" onclick="submitBonusInvites()" class="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition shadow-lg">
                                        ����� ������ ?
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Leaderboard Table -->
                        <div class="bg-[#1c1f2e] border border-white/5 rounded-2xl p-5 overflow-x-auto">
                            <h4 class="font-bold text-white text-sm mb-4">?? ����� ������ ������� (Top Invites Leaderboard)</h4>
                            <table class="w-full text-xs">
                                <thead>
                                    <tr class="border-b border-white/10 text-gray-400 font-bold text-center">
                                        <th class="py-2.5 px-4">#</th>
                                        <th class="py-2.5 px-4 text-right">�����</th>
                                        <th class="py-2.5 px-4">������ (Regular)</th>
                                        <th class="py-2.5 px-4">������� (Leaves)</th>
                                        <th class="py-2.5 px-4">����� (Fake)</th>
                                        <th class="py-2.5 px-4">���� (Bonus)</th>
                                        <th class="py-2.5 px-4">������ (Total)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${lbRowsHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <script>
                    async function submitBonusInvites() {
                        let rawUser = document.getElementById('bonusUserId').value.trim();
                        const userId = rawUser.replace(/[^0-9]/g, '');
                        const amount = parseInt(document.getElementById('bonusAmount').value, 10);
                        if (!userId || isNaN(amount)) return alert('���� ����� ���� ����� �� ���� ���� ������ ��� �������!');
                        const res = await fetch('/api/guild/${guildId}/invites/add-bonus', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId, amount })
                        });
                        const data = await res.json();
                        if (data.success) { alert('? �� ����� ���� ����� ����� �����!'); location.reload(); }
                        else alert('? ���: ' + (data.error || '��� �������'));
                    }

                    async function resetAllInvitesDirect() {
                        if (!confirm('?? �����: �� ��� ����� �� ����� ���� ������ ������� �� ������ѿ �� ���� ������� �� ��� �������!')) return;
                        const res = await fetch('/api/guild/${guildId}/invites/reset', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({})
                        });
                        const data = await res.json();
                        if (data.success) { alert('? �� ����� ������� �����!'); location.reload(); }
                    }
                    </script>
                `;
            } else if (section === 'broadcast' || section === 'announcements') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Header -->
                        <div class="bg-gradient-to-r from-[#0a1a10] via-[#12141f] to-[#141724] border border-emerald-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-2xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-xl shadow-lg">??</div>
                                <div class="text-right">
                                    <h3 class="font-black text-white text-lg">���� ��������� ������� �����</h3>
                                    <p class="text-gray-400 text-xs mt-0.5">����� ������ ������� ����� ������� �������� ����� �������� ����</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-xs font-bold ${settings.broadcast_enabled ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-500/30' : 'text-red-400 bg-red-950/60 border border-red-500/30'} px-3 py-1 rounded-xl">${settings.broadcast_enabled ? '?? ����' : '?? ����'}</span>
                            </div>
                        </div>

                        <!-- Master Toggle & Channel -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-3xl flex items-center justify-between shadow-xl">
                                <label class="toggle">
                                    <input type="checkbox" name="broadcast_enabled" value="1" id="broadcastToggle" onchange="document.getElementById('broadcastContent').classList.toggle('opacity-40', !this.checked)" ${settings.broadcast_enabled ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">����� ������ �����</h4>
                                        <p class="text-gray-400 text-xs mt-0.5">����� ����� ������� ����� �������� �� ������ �������</p>
                                    </div>
                                    <div class="w-8 h-8 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center text-sm border border-emerald-500/30">??</div>
                                </div>
                            </div>

                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-3xl space-y-2 shadow-xl text-right">
                                <h4 class="font-black text-white text-sm flex items-center justify-end gap-2"><span>���� ����</span><span>??</span></h4>
                                ${renderChannelSelect('broadcast_channel', settings.broadcast_channel)}
                            </div>
                        </div>

                        <!-- Broadcast Content Area -->
                        <div id="broadcastContent" class="${settings.broadcast_enabled ? '' : 'opacity-40'} transition-opacity space-y-6">

                            <!-- Interval & Mention Role -->
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

                                <!-- Interval Selector -->
                                <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl text-right">
                                    <h4 class="font-black text-white text-sm flex items-center justify-end gap-2"><span>���� �������</span><span>??</span></h4>
                                    <input type="hidden" name="broadcast_interval" id="inpBroadcastInterval" value="${settings.broadcast_interval || 60}">
                                    <div class="grid grid-cols-2 gap-2">
                                        ${[15, 30, 60, 120, 360, 720, 1440, 2880].map(m => `
                                        <button type="button" onclick="selectBroadcastInterval(${m}, this)" class="bc-interval-btn py-2.5 px-3 rounded-xl border text-xs font-bold transition ${(settings.broadcast_interval || 60) == m ? 'bg-purple-900/40 border-purple-500 text-white' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white'}">
                                            ${m < 60 ? m + ' �����' : m === 60 ? '����' : m < 1440 ? (m/60) + ' �����' : (m/1440) + ' ���'}
                                        </button>`).join('')}
                                    </div>
                                </div>

                                <!-- Mention Role -->
                                <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-3 shadow-xl text-right">
                                    <h4 class="font-black text-white text-sm flex items-center justify-end gap-2"><span>���� ������� (�������)</span><span>??</span></h4>
                                    <p class="text-gray-400 text-[11px]">���� ��� ����� �������� �� �� ����� �������</p>
                                    ${renderRoleSelect('broadcast_mention_role', settings.broadcast_mention_role)}
                                </div>
                            </div>

                            <!-- Messages List & Add New -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl">
                                <div class="flex items-center justify-between border-b border-white/5 pb-4">
                                    <button type="button" onclick="addBroadcastMessage()" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5">
                                        <span>?</span><span>����� ����� �����</span>
                                    </button>
                                    <h4 class="font-black text-white text-sm flex items-center gap-2"><span>����� ����� ����</span><span>??</span></h4>
                                </div>

                                <div id="broadcastMsgList" class="space-y-3">
                                    ${(() => {
                                        let msgs = [];
                                        try { msgs = JSON.parse(settings.broadcast_messages || '[]'); } catch(e) {}
                                        if (msgs.length === 0) return `<div class="text-center py-8 text-xs text-gray-500">�� ���� ����� ����� ��� � ��� ������ ������ ����� ??</div>`;
                                        return msgs.map((m, i) => `
                                        <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-2xl flex items-start justify-between gap-3 hover:border-purple-500/20 transition" id="bcMsg${i}">
                                            <div class="flex items-center gap-2 shrink-0 mt-1">
                                                <button type="button" onclick="deleteBroadcastMessage(${i})" class="text-rose-400 hover:text-rose-300 text-sm transition">???</button>
                                                <span class="w-6 h-6 rounded-lg bg-purple-950/60 text-purple-300 text-[10px] font-black flex items-center justify-center border border-purple-500/20">${i+1}</span>
                                            </div>
                                            <p class="text-xs text-gray-300 text-right leading-relaxed flex-1 truncate">${m}</p>
                                        </div>`).join('');
                                    })()}
                                </div>

                                <!-- Add Message Input Area (hidden by default) -->
                                <div id="addMsgArea" class="hidden space-y-3 border-t border-white/5 pt-4">
                                    <textarea id="newBcMsgInput" rows="3" placeholder="���� �� ������� ���... (���� markdown �������� ��� {server} � {members})" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right leading-relaxed transition"></textarea>
                                    <div class="flex items-center gap-2 justify-end">
                                        <button type="button" onclick="cancelAddMessage()" class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold transition">�����</button>
                                        <button type="button" onclick="confirmAddMessage()" class="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition">? �����</button>
                                    </div>
                                </div>
                            </div>

                            <!-- ���� ��� ������� ���� Wicks -->
                            <div class="bg-[#12141f] border border-white/5 hover:border-emerald-500/30 rounded-3xl p-6 transition shadow-xl space-y-3">
                                <div class="flex flex-col md:flex-row items-center justify-between gap-4">
                                    <!-- �������� ��� ����� -->
                                    <div class="w-full md:w-auto flex flex-col items-center gap-2">
                                        <div class="w-full md:w-56 h-28 rounded-2xl border border-white/10 bg-[#0b0d14] overflow-hidden flex items-center justify-center relative group">
                                            <img id="img_broadcast_image" src="${settings.broadcast_image || ''}" class="w-full h-full object-cover ${settings.broadcast_image ? '' : 'hidden'}">
                                            <div id="placeholder_broadcast_image" class="text-gray-500 text-xs flex flex-col items-center gap-1 ${settings.broadcast_image ? 'hidden' : ''}">
                                                <span class="text-2xl">???</span>
                                                <span>�� ���� ����</span>
                                            </div>
                                        </div>
                                        <button type="button" onclick="clearUploadedImageInDOM('broadcast_image', () => saveBroadcastImageSetting(''))" class="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition font-bold py-1 px-3 rounded-lg hover:bg-rose-950/30 cursor-pointer">
                                            <span>???</span>
                                            <span>����� ������</span>
                                        </button>
                                    </div>

                                    <!-- ���� ����� -->
                                    <div class="flex-1 text-right space-y-1 w-full">
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-sm font-black text-white">���� ��� ������� / ������ �����</h5>
                                            <span class="text-emerald-400 text-base">??</span>
                                        </div>
                                        <ul class="text-[11px] text-gray-400 space-y-0.5 list-disc list-inside">
                                            <li>������ ��� ������ �� ����� �������� �� ����� ��������� �������.</li>
                                            <li>���� ������ ������ �� ����� �� 1024x512 �� 1920x1080 ����.</li>
                                            <li>����� ��������: PNG, JPG, GIF, WEBP.</li>
                                        </ul>
                                    </div>

                                    <!-- �� ����� -->
                                    <div class="w-full md:w-auto flex justify-end">
                                        <input type="file" id="file_broadcast_image" accept="image/*" class="hidden" onchange="uploadImageFile(this, 'broadcast_image', (url) => saveBroadcastImageSetting(url))">
                                        <input type="hidden" id="input_broadcast_image" name="broadcast_image" value="${settings.broadcast_image || ''}">
                                        <button type="button" onclick="document.getElementById('file_broadcast_image').click()" class="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-xl text-xs font-black transition shadow-lg flex items-center gap-2 cursor-pointer w-full md:w-auto justify-center">
                                            <span>??</span>
                                            <span id="btn_text_broadcast_image">��� ������</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <!-- Send Now (Manual Broadcast) -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-3xl flex items-center justify-between shadow-xl">
                                <button type="button" onclick="sendBroadcastNow()" id="btnBroadcastNow" class="px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-xl text-xs font-black transition shadow-lg flex items-center gap-2">
                                    <span>??</span>
                                    <span>����� ���� ������</span>
                                </button>
                                <div class="text-right">
                                    <h4 class="font-black text-white text-sm">����� ����</h4>
                                    <p class="text-gray-400 text-[11px] mt-0.5">����� ����� ������� �� ������� ����� ��� ������ �������</p>
                                </div>
                            </div>

                        </div>

                    </div>

                    <script>
                    let broadcastMsgs = [];
                    try { broadcastMsgs = JSON.parse('${(settings.broadcast_messages || '[]').replace(/'/g, "\\'")}'); } catch(e) {}

                    function selectBroadcastInterval(interval, btn) {
                        document.getElementById('inpBroadcastInterval').value = interval;
                        document.querySelectorAll('.bc-interval-btn').forEach(b => {
                            b.className = 'bc-interval-btn py-2.5 px-3 rounded-xl border text-xs font-bold transition bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white';
                        });
                        btn.className = 'bc-interval-btn py-2.5 px-3 rounded-xl border text-xs font-bold transition bg-purple-900/40 border-purple-500 text-white';
                    }

                    function addBroadcastMessage() {
                        document.getElementById('addMsgArea').classList.remove('hidden');
                        document.getElementById('newBcMsgInput').focus();
                    }

                    function cancelAddMessage() {
                        document.getElementById('addMsgArea').classList.add('hidden');
                        document.getElementById('newBcMsgInput').value = '';
                    }

                    async function confirmAddMessage() {
                        const txt = document.getElementById('newBcMsgInput').value.trim();
                        if (!txt) return alert('���� ����� �� ������� �����!');
                        broadcastMsgs.push(txt);
                        await saveBroadcastMessages();
                        cancelAddMessage();
                        location.reload();
                    }

                    async function deleteBroadcastMessage(idx) {
                        if (!confirm('�� ���� ��� ��� ������ɿ')) return;
                        broadcastMsgs.splice(idx, 1);
                        await saveBroadcastMessages();
                        location.reload();
                    }

                    async function saveBroadcastMessages() {
                        await fetch('/api/guild/${guildId}/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ broadcast_messages: JSON.stringify(broadcastMsgs) })
                        });
                    }

                    async function saveBroadcastImageSetting(url) {
                        await fetch('/api/guild/${guildId}/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ broadcast_image: url })
                        });
                    }

                    async function sendBroadcastNow() {
                        const btn = document.getElementById('btnBroadcastNow');
                        btn.disabled = true;
                        btn.innerHTML = '? ���� �������...';
                        try {
                            const res = await fetch('/api/guild/${guildId}/broadcast-now', { method: 'POST' });
                            const d = await res.json();
                            if (d.success) {
                                btn.innerHTML = '? �� �������!';
                                setTimeout(() => { btn.disabled = false; btn.innerHTML = '?? ����� ���� ������'; }, 3000);
                            } else {
                                alert('? ' + (d.error || '��� �������. ���� �� ��� ������ ������ ����� �� �������.'));
                                btn.disabled = false;
                                btn.innerHTML = '?? ����� ���� ������';
                            }
                        } catch(e) {
                            btn.disabled = false;
                            btn.innerHTML = '?? ����� ���� ������';
                        }
                    }
                    </script>
`;
            } else if (section === 'protection') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Banner Alert: ����� �� ���� ������� ���� ���� -->
                        <div class="bg-[#1e0e11] border border-rose-900/50 p-4 rounded-2xl flex items-center justify-between shadow-lg">
                            <div class="flex items-center gap-3">
                                <label class="toggle">
                                    <input type="checkbox" name="lock_dashboard" value="1" ${settings.lock_dashboard ? 'checked' : ''} onchange="saveProtectionSetting('lock_dashboard', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <span class="text-xs font-bold text-rose-300">��� ���� ������</span>
                            </div>
                            <div class="flex items-center gap-2 text-rose-400 font-bold text-xs">
                                <span>����� �� ���� ������� ���� ����</span>
                                <span class="text-base">??</span>
                            </div>
                        </div>

                        <!-- 2. Master Toggle: ����� ���� ������� -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                            <label class="toggle">
                                <input type="checkbox" name="anti_nuke_enabled" value="1" ${settings.anti_nuke_enabled !== 0 ? 'checked' : ''} onchange="saveProtectionSetting('anti_nuke_enabled', this.checked)">
                                <span class="slider"></span>
                            </label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-sm">����� ���� �������</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">����� �� ����� ���� ������� ������</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30">
                                    ???
                                </div>
                            </div>
                        </div>

                        <!-- 3. ����� ������� (Browser Protection) -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl space-y-3 shadow-lg">
                            <div class="flex items-center justify-between">
                                <span class="text-xs text-gray-500 font-mono">PRO ONLY</span>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">����� �������</h4>
                                        <p class="text-gray-400 text-xs mt-0.5">���� ��� ������� ������� ������ ��� ������ �� ����� � ����� ���� ���</p>
                                    </div>
                                    <div class="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-lg border border-indigo-500/30">
                                        ??
                                    </div>
                                </div>
                            </div>
                            <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-end gap-2 text-gray-400 text-xs">
                                <span>��� ������ ���� ��� �� ������� ������ � ����� ������ ��� ��� ��� ���� �������.</span>
                                <span>??</span>
                            </div>
                        </div>

                        <!-- 4. ����� ������ -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl space-y-6 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span id="badge_limit_punish" class="px-3 py-1 bg-amber-950/60 text-amber-300 border border-amber-800/40 rounded-xl text-xs font-bold font-mono">${[settings.anti_channel_delete, settings.anti_channel_create, settings.anti_channel_update, settings.anti_channel_permissions, settings.anti_role_delete, settings.anti_role_create, settings.anti_role_update, settings.anti_webhook_create, settings.anti_webhook_update, settings.anti_mass_ban, settings.anti_mass_kick, settings.anti_mass_mention].filter(Boolean).length}/12 ����</span>
                                <div class="flex items-center gap-2">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">����� ������</h4>
                                        <p class="text-gray-400 text-[11px]">����� �� ������ ��� �����</p>
                                    </div>
                                    <span class="text-base">???</span>
                                </div>
                            </div>

                            <!-- ������ 1: ����� ������� / ������� -->
                            <div class="space-y-3">
                                <div class="flex items-center justify-between text-xs text-gray-400 font-bold">
                                    <span id="badge_grp_channels">${[settings.anti_channel_delete, settings.anti_channel_create, settings.anti_channel_update, settings.anti_channel_permissions].filter(Boolean).length}/4 ����</span>
                                    <span class="text-white">����� ������� / �������</span>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <!-- ������ ��� ������� -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_channel_delete" value="1" ${settings.anti_channel_delete ? 'checked' : ''} onchange="saveProtectionSetting('anti_channel_delete', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">������ ��� �������</h5>
                                                <p class="text-[10px] text-gray-400">��� ��� ����� �����</p>
                                            </div>
                                            <span class="text-sm">???</span>
                                        </div>
                                    </div>

                                    <!-- ������ ����� ������� -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_channel_create" value="1" ${settings.anti_channel_create ? 'checked' : ''} onchange="saveProtectionSetting('anti_channel_create', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">������ ����� �������</h5>
                                                <p class="text-[10px] text-gray-400">��� ����� ����� �����</p>
                                            </div>
                                            <span class="text-sm">??</span>
                                        </div>
                                    </div>

                                    <!-- ������ ����� ������� -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_channel_update" value="1" ${settings.anti_channel_update ? 'checked' : ''} onchange="saveProtectionSetting('anti_channel_update', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">������ ����� �������</h5>
                                                <p class="text-[10px] text-gray-400">��� ����� ����� �����</p>
                                            </div>
                                            <span class="text-sm">#??</span>
                                        </div>
                                    </div>

                                    <!-- ����� ������� ������� -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_channel_permissions" value="1" ${settings.anti_channel_permissions ? 'checked' : ''} onchange="saveProtectionSetting('anti_channel_permissions', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">����� ������� �������</h5>
                                                <p class="text-[10px] text-gray-400">��� �� ����� ��� ������� ������� ��� ��� (Allow/Deny/Overwrites)</p>
                                            </div>
                                            <span class="text-sm">??</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- ������ 2: ����� ����� -->
                            <div class="space-y-3 pt-4 border-t border-white/5">
                                <div class="flex items-center justify-between text-xs text-gray-400 font-bold">
                                    <span id="badge_grp_roles">${[settings.anti_role_delete, settings.anti_role_create, settings.anti_role_update].filter(Boolean).length}/3 ����</span>
                                    <span class="text-white">����� �����</span>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <!-- ������ ��� ����� -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_role_delete" value="1" ${settings.anti_role_delete ? 'checked' : ''} onchange="saveProtectionSetting('anti_role_delete', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">������ ��� �����</h5>
                                                <p class="text-[10px] text-gray-400">��� ��� ��� �����</p>
                                            </div>
                                            <span class="text-sm">???</span>
                                        </div>
                                    </div>

                                    <!-- ������ ����� ����� -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_role_create" value="1" ${settings.anti_role_create ? 'checked' : ''} onchange="saveProtectionSetting('anti_role_create', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">������ ����� �����</h5>
                                                <p class="text-[10px] text-gray-400">��� ����� ��� �����</p>
                                            </div>
                                            <span class="text-sm">???</span>
                                        </div>
                                    </div>

                                    <!-- ������ ����� ����� -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_role_update" value="1" ${settings.anti_role_update ? 'checked' : ''} onchange="saveProtectionSetting('anti_role_update', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">������ ����� �����</h5>
                                                <p class="text-[10px] text-gray-400">��� ����� ��� �����</p>
                                            </div>
                                            <span class="text-sm">??</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- ������ 3: ����� ����� ��� -->
                            <div class="space-y-3 pt-4 border-t border-white/5">
                                <div class="flex items-center justify-between text-xs text-gray-400 font-bold">
                                    <span id="badge_grp_webhooks">${[settings.anti_webhook_create, settings.anti_webhook_update].filter(Boolean).length}/2 ����</span>
                                    <span class="text-white">����� ����� ���</span>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <!-- ������ ����� ����� ��� -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_webhook_create" value="1" ${settings.anti_webhook_create ? 'checked' : ''} onchange="saveProtectionSetting('anti_webhook_create', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">������ ����� ����� ���</h5>
                                                <p class="text-[10px] text-gray-400">��� ����� ����� ��� ����� ����� �� ������ �������</p>
                                            </div>
                                            <span class="text-sm">??</span>
                                        </div>
                                    </div>

                                    <!-- ������ ����� ����� ��� -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_webhook_update" value="1" ${settings.anti_webhook_update ? 'checked' : ''} onchange="saveProtectionSetting('anti_webhook_update', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">������ ����� ����� ���</h5>
                                                <p class="text-[10px] text-gray-400">��� ������� ������� ��� ����� ����� ������� �� ������ �������</p>
                                            </div>
                                            <span class="text-sm">??</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- ������ 4: ����� ������� -->
                            <div class="space-y-3 pt-4 border-t border-white/5">
                                <div class="flex items-center justify-between text-xs text-gray-400 font-bold">
                                    <span id="badge_grp_members">${[settings.anti_mass_ban, settings.anti_mass_kick].filter(Boolean).length}/2 ����</span>
                                    <span class="text-white">����� �������</span>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <!-- ������ ����� -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_mass_ban" value="1" ${settings.anti_mass_ban ? 'checked' : ''} onchange="saveProtectionSetting('anti_mass_ban', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">������ �����</h5>
                                                <p class="text-[10px] text-gray-400">��� ����� �������</p>
                                            </div>
                                            <span class="text-sm">??</span>
                                        </div>
                                    </div>

                                    <!-- ������ ����� -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_mass_kick" value="1" ${settings.anti_mass_kick ? 'checked' : ''} onchange="saveProtectionSetting('anti_mass_kick', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">������ �����</h5>
                                                <p class="text-[10px] text-gray-400">��� ����� �������</p>
                                            </div>
                                            <span class="text-sm">??</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- ������ 5: ����� ������� -->
                            <div class="space-y-3 pt-4 border-t border-white/5">
                                <div class="flex items-center justify-between text-xs text-gray-400 font-bold">
                                    <span id="badge_grp_content">${[settings.anti_mass_mention].filter(Boolean).length}/1 ����</span>
                                    <span class="text-white">����� �������</span>
                                </div>
                                <div class="grid grid-cols-1 gap-3">
                                    <!-- ������ �������� -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_mass_mention" value="1" ${settings.anti_mass_mention ? 'checked' : ''} onchange="saveProtectionSetting('anti_mass_mention', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">������ ��������</h5>
                                                <p class="text-[10px] text-gray-400">��� �������� �������</p>
                                            </div>
                                            <span class="text-sm">??</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>

                        <!-- 5. ����� ����� -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span id="badge_instant_punish" class="px-3 py-1 bg-rose-950/60 text-rose-300 border border-rose-800/40 rounded-xl text-xs font-bold font-mono">${[settings.anti_onboarding_danger, settings.anti_join_danger_roles, settings.anti_raid_fast, settings.anti_dangerous_perms, settings.anti_linked_roles, settings.anti_bot_add, settings.anti_prune, settings.anti_server_name_change, settings.anti_server_icon_change].filter(Boolean).length}/9 ����</span>
                                <div class="flex items-center gap-2">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">����� �����</h4>
                                        <p class="text-gray-400 text-[11px]">����� ������� �����</p>
                                    </div>
                                    <span class="text-base">??</span>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <!-- ��� Onboarding ������� -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_onboarding_danger" value="1" ${settings.anti_onboarding_danger ? 'checked' : ''} onchange="saveProtectionSetting('anti_onboarding_danger', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">��� Onboarding �������</h5>
                                            <p class="text-[10px] text-gray-400">���� ��� ���� �������� ����� �������� ��� ��� ���� ��� ����� �������� (Onboarding)</p>
                                        </div>
                                        <span class="text-sm">??</span>
                                    </div>
                                </div>

                                <!-- ��� ����� ��� �������� (����� ��������) -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_join_danger_roles" value="1" ${settings.anti_join_danger_roles ? 'checked' : ''} onchange="saveProtectionSetting('anti_join_danger_roles', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">��� ����� ��� �������� (����� ��������)</h5>
                                            <p class="text-[10px] text-gray-400">���� �������� �� ���� ������ ��� ��� ���� ��� ���� ���� �� Onboarding ��� ��� ������ ��������� �������</p>
                                        </div>
                                        <span class="text-sm">??</span>
                                    </div>
                                </div>

                                <!-- ������ ����� -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_raid_fast" value="1" ${settings.anti_raid_fast ? 'checked' : ''} onchange="saveProtectionSetting('anti_raid_fast', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">������ �����</h5>
                                            <p class="text-[10px] text-gray-400">����� �� �������� �������</p>
                                        </div>
                                        <span class="text-sm">???</span>
                                    </div>
                                </div>

                                <!-- ������ ��������� ������� -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_dangerous_perms" value="1" ${settings.anti_dangerous_perms ? 'checked' : ''} onchange="saveProtectionSetting('anti_dangerous_perms', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">������ ��������� �������</h5>
                                            <p class="text-[10px] text-gray-400">��� ��� ������� �����</p>
                                        </div>
                                        <span class="text-sm">??</span>
                                    </div>
                                </div>

                                <!-- ������ ����� ������� ������� ����� -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_linked_roles" value="1" ${settings.anti_linked_roles ? 'checked' : ''} onchange="saveProtectionSetting('anti_linked_roles', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">������ ����� ������� ������� �����</h5>
                                            <p class="text-[10px] text-gray-400">���� �� ���� ���� ������ ����� �� �� ���� ����� ������ ����� ������ ��� ��� ���� ����� (Linked Roles)</p>
                                        </div>
                                        <span class="text-sm">??</span>
                                    </div>
                                </div>

                                <!-- ������ ����� ������� -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_bot_add" value="1" ${settings.anti_bot_add ? 'checked' : ''} onchange="saveProtectionSetting('anti_bot_add', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">������ ����� �������</h5>
                                            <p class="text-[10px] text-gray-400">��� ����� ����� ���� ���</p>
                                        </div>
                                        <span class="text-sm">??</span>
                                    </div>
                                </div>

                                <!-- ������ ������� -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_prune" value="1" ${settings.anti_prune ? 'checked' : ''} onchange="saveProtectionSetting('anti_prune', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">������ �������</h5>
                                            <p class="text-[10px] text-gray-400">��� ����� �������</p>
                                        </div>
                                        <span class="text-sm">??</span>
                                    </div>
                                </div>

                                <!-- ������ ����� ��� ������� -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_server_name_change" value="1" ${settings.anti_server_name_change ? 'checked' : ''} onchange="saveProtectionSetting('anti_server_name_change', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">������ ����� ��� �������</h5>
                                            <p class="text-[10px] text-gray-400">��� ����� ��� �������</p>
                                        </div>
                                        <span class="text-sm">??</span>
                                    </div>
                                </div>

                                <!-- ������ ����� ������ ������� -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_server_icon_change" value="1" ${settings.anti_server_icon_change ? 'checked' : ''} onchange="saveProtectionSetting('anti_server_icon_change', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">������ ����� ������ �������</h5>
                                            <p class="text-[10px] text-gray-400">��� ����� ������ �������</p>
                                        </div>
                                        <span class="text-sm">???</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 6. ��� ��� -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span id="badge_detect_only" class="px-3 py-1 bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 rounded-xl text-xs font-bold font-mono">${[settings.anti_scam, settings.anti_invite_links, settings.anti_nsfw_content, settings.anti_ghost_ping, settings.anti_channel_move, (settings.anti_webhook_spam !== 0 ? 1 : 0)].filter(Boolean).length}/6 ����</span>
                                <div class="flex items-center gap-2">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">��� ���</h4>
                                        <p class="text-gray-400 text-[11px]">����� ��� ���� �����</p>
                                    </div>
                                    <span class="text-base">??</span>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <!-- ������ �������� -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_scam" value="1" ${settings.anti_scam ? 'checked' : ''} onchange="saveProtectionSetting('anti_scam', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">������ ��������</h5>
                                            <p class="text-[10px] text-gray-400">��� ���� ����� ��������</p>
                                        </div>
                                        <span class="text-sm">??</span>
                                    </div>
                                </div>

                                <!-- ������ ����� ������ -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_invite_links" value="1" ${settings.anti_invite_links ? 'checked' : ''} onchange="saveProtectionSetting('anti_invite_links', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">������ ����� ������</h5>
                                            <p class="text-[10px] text-gray-400">��� ����� ������</p>
                                        </div>
                                        <span class="text-sm">??</span>
                                    </div>
                                </div>

                                <!-- ������ ������� ����� ���� -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_nsfw_content" value="1" ${settings.anti_nsfw_content ? 'checked' : ''} onchange="saveProtectionSetting('anti_nsfw_content', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">������ ������� ����� ����</h5>
                                            <p class="text-[10px] text-gray-400">��� ������� ����� ����</p>
                                        </div>
                                        <span class="text-sm">???</span>
                                    </div>
                                </div>

                                <!-- ������ ������ ���� -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_ghost_ping" value="1" ${settings.anti_ghost_ping ? 'checked' : ''} onchange="saveProtectionSetting('anti_ghost_ping', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">������ ������ ����</h5>
                                            <p class="text-[10px] text-gray-400">��� ��� ��������</p>
                                        </div>
                                        <span class="text-sm">??</span>
                                    </div>
                                </div>

                                <!-- ��� ��� ������� -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_channel_move" value="1" ${settings.anti_channel_move ? 'checked' : ''} onchange="saveProtectionSetting('anti_channel_move', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">��� ��� �������</h5>
                                            <p class="text-[10px] text-gray-400">��� ��� ������� ��� ������� ���� (����� ���)</p>
                                        </div>
                                        <span class="text-sm">??</span>
                                    </div>
                                </div>

                                <!-- ������ ���� ����� ��� -->
                                <div class="bg-[#0b0d14] border border-purple-500/40 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/60 transition shadow-inner">
                                    <label class="toggle"><input type="checkbox" name="anti_webhook_spam" value="1" checked onchange="saveProtectionSetting('anti_webhook_spam', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">������ ���� ����� ���</h5>
                                            <p class="text-[10px] text-gray-400">���� �������� ����� ������ ������� ��� �� ������ ����� ����� ��� ���� � ���� �������� ��������</p>
                                        </div>
                                        <span class="text-sm">??</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 7. ������ ������ ����� (Self Defense - ����� ������) -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span class="text-[11px] text-gray-400">����� ������ � ���� ����� ���� �� ���� �������</span>
                                <div class="flex items-center gap-2">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">������ ������ �����</h4>
                                    </div>
                                    <span class="text-base">???</span>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <span class="px-2.5 py-1 bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 text-[10px] font-bold rounded-lg">����� ������</span>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">������ ��� ������� �����</h5>
                                        <p class="text-[10px] text-gray-400">����� (��� ����� ����) �� ���� ���� ����� ����� ������� ���� � ����� ��� ����� ������� ���� ����� ������ ����� ���������</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <span class="px-2.5 py-1 bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 text-[10px] font-bold rounded-lg">����� ������</span>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">������ ����� ���� �����</h5>
                                        <p class="text-[10px] text-gray-400">����� (��� ����� ����) �� ����� �� ����� ������ ���� ����� ������� ����</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    <script>
                    function updateProtectionBadges() {
                        const countChecked = (names) => names.reduce((acc, n) => {
                            const el = document.querySelector('input[name="' + n + '"]');
                            return acc + (el && el.checked ? 1 : 0);
                        }, 0);

                        const chNames = ['anti_channel_delete', 'anti_channel_create', 'anti_channel_update', 'anti_channel_permissions'];
                        const roleNames = ['anti_role_delete', 'anti_role_create', 'anti_role_update'];
                        const whNames = ['anti_webhook_create', 'anti_webhook_update'];
                        const memNames = ['anti_mass_ban', 'anti_mass_kick'];
                        const cntNames = ['anti_mass_mention'];
                        const instNames = ['anti_onboarding_danger', 'anti_join_danger_roles', 'anti_raid_fast', 'anti_dangerous_perms', 'anti_linked_roles', 'anti_bot_add', 'anti_prune', 'anti_server_name_change', 'anti_server_icon_change'];
                        const detNames = ['anti_scam', 'anti_invite_links', 'anti_nsfw_content', 'anti_ghost_ping', 'anti_channel_move', 'anti_webhook_spam'];

                        const bCh = document.getElementById('badge_grp_channels');
                        if (bCh) bCh.innerText = countChecked(chNames) + '/4 ����';

                        const bRoles = document.getElementById('badge_grp_roles');
                        if (bRoles) bRoles.innerText = countChecked(roleNames) + '/3 ����';

                        const bWh = document.getElementById('badge_grp_webhooks');
                        if (bWh) bWh.innerText = countChecked(whNames) + '/2 ����';

                        const bMem = document.getElementById('badge_grp_members');
                        if (bMem) bMem.innerText = countChecked(memNames) + '/2 ����';

                        const bCnt = document.getElementById('badge_grp_content');
                        if (bCnt) bCnt.innerText = countChecked(cntNames) + '/1 ����';

                        const allPunishNames = chNames.concat(roleNames, whNames, memNames, cntNames);
                        const bPunish = document.getElementById('badge_limit_punish');
                        if (bPunish) bPunish.innerText = countChecked(allPunishNames) + '/12 ����';

                        const bInst = document.getElementById('badge_instant_punish');
                        if (bInst) bInst.innerText = countChecked(instNames) + '/9 ����';

                        const bDet = document.getElementById('badge_detect_only');
                        if (bDet) bDet.innerText = countChecked(detNames) + '/6 ����';
                    }

                    async function saveProtectionSetting(key, value) {
                        updateProtectionBadges();
                        try {
                            const res = await fetch('/api/guild/${guildId}/settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ [key]: value ? 1 : 0 })
                            });
                            const data = await res.json();
                            const status = document.getElementById('saveStatus');
                            if (status) {
                                status.classList.remove('hidden');
                                setTimeout(() => status.classList.add('hidden'), 3000);
                            }
                        } catch(e) {
                            console.error('Failed to save protection setting', e);
                        }
                    }
                    </script>
`;
            } else if (section === 'whitelist') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Banner Alert: ����� �� ���� ������� ���� ���� -->
                        <div class="bg-[#1e0e11] border border-rose-900/50 p-4 rounded-2xl flex items-center justify-between shadow-lg">
                            <div class="flex items-center gap-3">
                                <label class="toggle">
                                    <input type="checkbox" name="lock_dashboard" value="1" ${settings.lock_dashboard ? 'checked' : ''} onchange="saveProtectionSetting('lock_dashboard', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <span class="text-xs font-bold text-rose-300">��� ���� ������</span>
                            </div>
                            <div class="flex items-center gap-2 text-rose-400 font-bold text-xs">
                                <span>����� �� ���� ������� ���� ����</span>
                                <span class="text-base">??</span>
                            </div>
                        </div>

                        <!-- 2. ����� ����� ��� ����� -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-end gap-2 text-emerald-400 font-black text-sm">
                                <span>����� ��� �����</span>
                                <span class="text-base">?</span>
                            </div>

                            <div class="space-y-3">
                                <div>
                                    <input type="text" id="wlSearchUser" placeholder="���� �� ��� �������..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right placeholder-gray-500">
                                </div>
                                <div class="flex items-center gap-3">
                                    <button type="button" onclick="addWhitelistUser('whitelist')" class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-emerald-950/40">
                                        <span>?</span>
                                        <span>�����</span>
                                    </button>
                                    <input type="text" id="wlUserId" placeholder="���� ���� �������� (User ID) �� ���� ����� �� Enter" class="flex-1 bg-[#0b0d14] border border-white/5 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-mono placeholder-gray-500" onkeydown="if(event.key==='Enter') addWhitelistUser('whitelist')">
                                </div>
                                <div class="text-[10px] text-gray-500 flex items-center justify-end gap-1">
                                    <span>���� Enter ������� �������</span>
                                    <span>??</span>
                                </div>
                            </div>
                        </div>

                        <!-- 3. ����� ������� ��������� -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span class="px-2.5 py-1 bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 rounded-xl text-xs font-mono font-bold" id="wlCountBadge">${(whitelistUsers || []).length} ���</span>
                                <div class="flex items-center gap-2 text-white font-black text-sm">
                                    <span>������� ���������</span>
                                    <span class="text-emerald-400">???</span>
                                </div>
                            </div>

                            <div id="wlUsersList" class="space-y-2">
                                ${(whitelistUsers && whitelistUsers.length > 0) ? whitelistUsers.map(u => `
                                    <div class="bg-[#0b0d14] border border-white/5 p-3.5 rounded-xl flex items-center justify-between hover:border-emerald-500/30 transition">
                                        <button type="button" onclick="removeWhitelistUser('${u.user_id}', 'whitelist')" class="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">��� ???</button>
                                        <div class="flex items-center gap-3">
                                            <div class="text-right">
                                                <span class="text-xs font-bold text-white block font-mono">${u.user_id}</span>
                                                <span class="text-[10px] text-gray-400">������ �� ���� ����� �������</span>
                                            </div>
                                            <div class="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold text-xs">??</div>
                                        </div>
                                    </div>
                                `).join('') : `
                                    <div class="py-10 text-center space-y-2">
                                        <div class="w-12 h-12 rounded-full bg-white/5 text-gray-400 flex items-center justify-center text-xl mx-auto">??</div>
                                        <h5 class="text-xs font-bold text-gray-300">�� ���� ����� �������</h5>
                                        <p class="text-[10px] text-gray-500">��� ����� ������� ����� ���������� �� ���� �������</p>
                                    </div>
                                `}
                            </div>
                        </div>

                        <!-- 4. ���� Anti Mod (���� �� ��������) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span class="px-2.5 py-1 bg-amber-950/60 text-amber-300 border border-amber-800/40 rounded-xl text-xs font-mono font-bold" id="antiModCountBadge">${(antimodUsers || []).length} ���</span>
                                <div class="flex items-center gap-2 text-white font-black text-sm">
                                    <span>���� Anti Mod (���� �� ��������)</span>
                                    <span class="text-amber-400">???</span>
                                </div>
                            </div>

                            <div class="space-y-3">
                                <div>
                                    <input type="text" id="antiModSearchUser" placeholder="���� �� ��� �������..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right placeholder-gray-500">
                                </div>
                                <div class="flex items-center gap-3">
                                    <button type="button" onclick="addWhitelistUser('antimod')" class="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
                                        <span>�����</span>
                                    </button>
                                    <input type="text" id="antiModUserId" placeholder="���� User ID ������� ��� Anti Mod" class="flex-1 bg-[#0b0d14] border border-white/5 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-mono placeholder-gray-500" onkeydown="if(event.key==='Enter') addWhitelistUser('antimod')">
                                </div>
                            </div>

                            <div id="antiModUsersList" class="space-y-2 pt-2">
                                ${(antimodUsers && antimodUsers.length > 0) ? antimodUsers.map(u => `
                                    <div class="bg-[#0b0d14] border border-white/5 p-3.5 rounded-xl flex items-center justify-between hover:border-amber-500/30 transition">
                                        <button type="button" onclick="removeWhitelistUser('${u.user_id}', 'antimod')" class="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">��� ???</button>
                                        <div class="flex items-center gap-3">
                                            <div class="text-right">
                                                <span class="text-xs font-bold text-white block font-mono">${u.user_id}</span>
                                                <span class="text-[10px] text-amber-400/80">���� �� ����� ������ ��������� ���������</span>
                                            </div>
                                            <div class="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center font-bold text-xs">???</div>
                                        </div>
                                    </div>
                                `).join('') : `
                                    <div class="py-6 text-center text-xs text-gray-500">
                                        �� ���� ����� �� Anti Mod ������.
                                    </div>
                                `}
                            </div>
                        </div>

                    </div>

                    <script>
                    async function addWhitelistUser(type) {
                        const inputId = type === 'antimod' ? 'antiModUserId' : 'wlUserId';
                        const input = document.getElementById(inputId);
                        const userId = input.value.trim();
                        if (!userId) return alert('���� ����� ���� �������� (User ID)!');

                        try {
                            const res = await fetch('/api/guild/${guildId}/whitelist', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId, type })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('? �� ����� ����� �����!');
                                location.reload();
                            } else {
                                alert('? ���: ' + (data.error || '��� �������'));
                            }
                        } catch(e) {
                            alert('��� ��� �� ������� �������');
                        }
                    }

                    async function removeWhitelistUser(userId, type) {
                        if (!confirm('�� ��� ����� �� ��� ��� �����')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/whitelist', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId, type })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('? �� ����� �����!');
                                location.reload();
                            } else {
                                alert('? ���: ' + (data.error || '��� �����'));
                            }
                        } catch(e) {
                            alert('��� ��� �� �������');
                        }
                    }
                    </script>
`;
            } else if (section === 'protection-logs' || section === 'security-logs') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Banner Alert: ����� �� ���� ������� ���� ���� -->
                        <div class="bg-[#1e0e11] border border-rose-900/50 p-4 rounded-2xl flex items-center justify-between shadow-lg">
                            <div class="flex items-center gap-3">
                                <label class="toggle">
                                    <input type="checkbox" name="lock_dashboard" value="1" ${settings.lock_dashboard ? 'checked' : ''} onchange="saveProtectionSetting('lock_dashboard', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <span class="text-xs font-bold text-rose-300">��� ���� ������</span>
                            </div>
                            <div class="flex items-center gap-2 text-rose-400 font-bold text-xs">
                                <span>����� �� ���� ������� ���� ����</span>
                                <span class="text-base">??</span>
                            </div>
                        </div>

                        <!-- 2. ������ ����� ����� ������ ������ ������� ����� ��� ��� -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <!-- ����� ������ -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                                <label class="toggle">
                                    <input type="checkbox" name="security_logs_enabled" value="1" ${settings.security_logs_enabled !== 0 ? 'checked' : ''} onchange="saveProtectionSetting('security_logs_enabled', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">����� ������</h4>
                                        <p class="text-gray-400 text-xs mt-0.5">����� ����� ������</p>
                                    </div>
                                    <div class="w-10 h-10 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center text-lg border border-amber-500/30">
                                        ???
                                    </div>
                                </div>
                            </div>

                            <!-- ����� ������� -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_logs_enabled" value="1" ${settings.mod_logs_enabled !== 0 ? 'checked' : ''} onchange="saveProtectionSetting('mod_logs_enabled', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">����� �������</h4>
                                        <p class="text-gray-400 text-xs mt-0.5">����� ������� �������</p>
                                    </div>
                                    <div class="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30">
                                        ??
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 3. ����� ���� ��� ������ -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-6 shadow-xl">
                            <div class="flex items-center justify-end gap-2 text-white font-black text-sm border-b border-white/5 pb-3">
                                <span>���� ��� ������</span>
                                <span class="text-base">??</span>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <!-- ���� ����� ������ -->
                                <div class="space-y-3">
                                    <div class="flex items-center justify-end gap-2 text-amber-400 font-bold text-xs">
                                        <span>����� ������</span>
                                        <span>??</span>
                                    </div>
                                    <div class="space-y-2">
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                                            <span class="text-gray-300 font-medium">������� �������</span>
                                        </div>
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                                            <span class="text-gray-300 font-medium">�������� ���������</span>
                                        </div>
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                                            <span class="text-gray-300 font-medium">����� ������</span>
                                        </div>
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                                            <span class="text-gray-300 font-medium">����� ������</span>
                                        </div>
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                                            <span class="text-gray-300 font-medium">����� ��������</span>
                                        </div>
                                    </div>
                                </div>

                                <!-- ���� ����� ������� -->
                                <div class="space-y-3">
                                    <div class="flex items-center justify-end gap-2 text-purple-400 font-bold text-xs">
                                        <span>����� �������</span>
                                        <span>???</span>
                                    </div>
                                    <div class="space-y-2">
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                            <span class="text-gray-300 font-medium">����� ����� ������</span>
                                        </div>
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                            <span class="text-gray-300 font-medium">����� ����� ������</span>
                                        </div>
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                            <span class="text-gray-300 font-medium">���������</span>
                                        </div>
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                            <span class="text-gray-300 font-medium">��� �������</span>
                                        </div>
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                            <span class="text-gray-300 font-medium">���/��� �������</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 4. ���� ������� �������� ����� ������� -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span class="px-2.5 py-1 bg-purple-950/60 text-purple-300 border border-purple-800/40 rounded-xl text-xs font-mono font-bold">${(securityLogsList || []).length} ��� ����</span>
                                <h4 class="font-black text-white text-sm">���� ����� ������ �������� ������� ������</h4>
                            </div>

                            <div class="space-y-2">
                                ${(securityLogsList && securityLogsList.length > 0) ? securityLogsList.map(log => `
                                    <div class="bg-[#0b0d14] border border-white/5 p-3.5 rounded-xl flex items-center justify-between text-xs hover:border-purple-500/30 transition">
                                        <span class="text-[10px] text-gray-500 font-mono">${new Date(log.created_at * 1000).toLocaleString('ar-SA')}</span>
                                        <div class="flex items-center gap-3">
                                            <div class="text-right">
                                                <span class="font-bold text-white block">${log.reason || log.action_type}</span>
                                                <span class="text-[10px] text-gray-400">${log.details || ''} ${log.executor_id ? `� ������: <span class="font-mono text-purple-300">${log.executor_id}</span>` : ''}</span>
                                            </div>
                                            <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold ${log.category === 'security' ? 'bg-amber-950/60 text-amber-400 border border-amber-800/30' : 'bg-purple-950/60 text-purple-400 border border-purple-800/30'}">${log.category === 'security' ? '����' : '�����'}</span>
                                        </div>
                                    </div>
                                `).join('') : `
                                    <div class="py-8 text-center text-xs text-gray-500">
                                        �� ���� ����� ���� ����� ��� ����. ������� ��� ������! ???
                                    </div>
                                `}
                            </div>
                        </div>

                    </div>
`;
            } else if (section === 'welcome') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Top Tab Switcher (����� ������� / ����� ��������) -->
                        <div class="flex items-center gap-3 bg-[#10121b] border border-white/5 p-2 rounded-2xl w-fit">
                            <button type="button" onclick="switchWelcomeTab('leave')" id="btnTabLeave" class="px-5 py-2 rounded-xl text-xs font-bold transition text-gray-400 hover:text-white">
                                <span>����� ��������</span>
                                <span class="text-rose-400">??</span>
                            </button>
                            <button type="button" onclick="switchWelcomeTab('welcome')" id="btnTabWelcome" class="px-5 py-2 rounded-xl text-xs font-bold transition bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-lg">
                                <span>����� �������</span>
                                <span class="text-amber-300">??</span>
                            </button>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 1. ��� ����� ������� (Welcome Section - Exact to Image 2 & 3) -->
                        <!-- ========================================================= -->
                        <div id="sectionWelcomeBox" class="space-y-6">
                            <!-- Card 1: Master Header Card -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                                <label class="toggle">
                                    <input type="checkbox" name="welcome_enabled" value="1" ${settings.welcome_enabled !== 0 ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <div class="flex items-center justify-end gap-2 text-white font-black text-base">
                                            <span>����</span>
                                            <span class="text-emerald-400">??</span>
                                        </div>
                                        <p class="text-gray-400 text-xs mt-0.5">����� ����� �� ���� ������ ��� ������ ��� ���� �������</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Card 2: ���� ������� �������� -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">���� ������� <span class="text-purple-400">*</span></label>
                                    ${renderChannelSelect('welcome_channel', settings.welcome_channel || '')}
                                </div>

                                <div class="space-y-2">
                                    <div class="flex items-center justify-between text-xs text-gray-400 font-bold">
                                        <span>?</span>
                                        <span>����� ������� (�� ����)</span>
                                    </div>
                                    <textarea name="welcome_message" id="welcomeText" rows="3" oninput="updateWelcomePreview()" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-500 rounded-xl p-4 text-xs text-white outline-none leading-relaxed text-right">${settings.welcome_message || '������ {user} �� ����� **{server}**! ?? ��� ����� ��� **{memberCount}**'}</textarea>
                                    
                                    <!-- Variables Pill Badges -->
                                    <div class="flex items-center justify-between pt-1">
                                        <span class="text-[10px] text-gray-500">��� ���� ��� Embed �� ���� ���� �ա ���� ������� �����.</span>
                                        <div class="flex flex-wrap gap-1.5 justify-end">
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{user}')">{user}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{username}')">{username}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{server}')">{server}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{memberCount}')">{memberCount}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{inviter}')">{inviter}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{joinDate}')">{joinDate}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Card 3: ������ ������� ������� (�� ��� / ���� ����� / ����� Embed) -->
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <button type="button" onclick="setWelcomeType('text')" id="btnWlTypeText" class="p-4 rounded-2xl border ${settings.welcome_embed_enabled === 0 && !settings.welcome_image ? 'border-purple-500 bg-orange-950/20 text-white' : 'border-white/5 bg-[#12141f] text-gray-400'} text-center transition">
                                    <h5 class="font-bold text-xs">�� ���</h5>
                                    <p class="text-[10px] text-gray-500 mt-1">����� ���� �����</p>
                                </button>
                                <button type="button" onclick="setWelcomeType('image')" id="btnWlTypeImage" class="p-4 rounded-2xl border ${settings.welcome_image ? 'border-purple-500 bg-orange-950/20 text-white' : 'border-white/5 bg-[#12141f] text-gray-400'} text-center transition">
                                    <h5 class="font-bold text-xs">���� �����</h5>
                                    <p class="text-[10px] text-gray-500 mt-1">���� ����� �� ��� �����</p>
                                </button>
                                <button type="button" onclick="setWelcomeType('embed')" id="btnWlTypeEmbed" class="p-4 rounded-2xl border ${settings.welcome_embed_enabled !== 0 ? 'border-purple-500 bg-orange-950/20 text-white' : 'border-white/5 bg-[#12141f] text-gray-400'} text-center transition">
                                    <h5 class="font-bold text-xs">����� Embed</h5>
                                    <p class="text-[10px] text-gray-500 mt-1">����� ����� �� �����</p>
                                </button>
                            </div>

                            <input type="hidden" name="welcome_embed_enabled" id="welcome_embed_enabled" value="${settings.welcome_embed_enabled !== 0 ? 1 : 0}">
                            <input type="hidden" name="welcome_image" id="welcome_image" value="${settings.welcome_image ? 1 : 0}">

                            <!-- Upload Card: ���� ������� ���� Wicks -->
                            <div class="bg-[#0b0d14] border border-white/5 hover:border-purple-500/30 rounded-2xl p-5 transition shadow-lg" id="welcomeImageUploadCard">
                                <div class="flex flex-col md:flex-row items-center justify-between gap-4">
                                    <!-- �������� ��� ����� -->
                                    <div class="w-full md:w-auto flex flex-col items-center gap-2">
                                        <div class="w-full md:w-56 h-28 rounded-xl border border-white/10 bg-[#12141f] overflow-hidden flex items-center justify-center relative group">
                                            <img id="img_welcome_banner_image" src="${settings.welcome_banner_image || ''}" class="w-full h-full object-cover ${settings.welcome_banner_image ? '' : 'hidden'}">
                                            <div id="placeholder_welcome_banner_image" class="text-gray-500 text-xs flex flex-col items-center gap-1 ${settings.welcome_banner_image ? 'hidden' : ''}">
                                                <span class="text-2xl">???</span>
                                                <span>�� ���� ����</span>
                                            </div>
                                        </div>
                                        <button type="button" onclick="clearUploadedImageInDOM('welcome_banner_image')" class="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition font-bold py-1 px-3 rounded-lg hover:bg-rose-950/30 cursor-pointer">
                                            <span>???</span>
                                            <span>����� ������</span>
                                        </button>
                                    </div>

                                    <!-- ���� ����� -->
                                    <div class="flex-1 text-right space-y-1 w-full">
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-sm font-black text-white">���� ���� �������</h5>
                                            <span class="text-purple-400 text-base">???</span>
                                        </div>
                                        <ul class="text-[11px] text-gray-400 space-y-0.5 list-disc list-inside">
                                            <li>����� ��� ������ ����� ����� �� ����� ������� �������� �����.</li>
                                            <li>���� ������ ������ �� ����� �� 1024x512 ����.</li>
                                            <li>����� ��������: PNG, JPG, GIF, WEBP.</li>
                                        </ul>
                                    </div>

                                    <!-- �� ����� -->
                                    <div class="w-full md:w-auto flex justify-end">
                                        <input type="file" id="file_welcome_banner_image" accept="image/*" class="hidden" onchange="uploadImageFile(this, 'welcome_banner_image')">
                                        <input type="hidden" id="input_welcome_banner_image" name="welcome_banner_image" value="${settings.welcome_banner_image || ''}">
                                        <button type="button" onclick="document.getElementById('file_welcome_banner_image').click()" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-purple-900/30 flex items-center gap-2 cursor-pointer w-full md:w-auto justify-center">
                                            <span>??</span>
                                            <span id="btn_text_welcome_banner_image">��� ������</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <!-- Card 4: ����� ����� ������� / ������� (Live Preview & Embed Customizer - Exact to Image 2 & 3) -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                                <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                    <div class="flex flex-wrap gap-1.5">
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{user}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{username}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{server}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{memberCount}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{user.avatar}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{inviter}</span>
                                    </div>
                                    <h5 class="text-xs font-black text-white">����� ����� �������</h5>
                                </div>

                                <!-- Color Pickers Palette -->
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs font-mono text-gray-400">#EF5700</span>
                                        <input type="color" name="welcome_embed_color" id="wlColorInput" value="${settings.welcome_embed_color || '#ef5700'}" class="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0">
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs font-bold text-gray-300">��� �������</span>
                                        <div class="flex items-center gap-1.5">
                                            <button type="button" onclick="setWlColor('#a855f7')" class="w-4 h-4 rounded-md bg-[#a855f7]"></button>
                                            <button type="button" onclick="setWlColor('#3b82f6')" class="w-4 h-4 rounded-md bg-[#3b82f6]"></button>
                                            <button type="button" onclick="setWlColor('#10b981')" class="w-4 h-4 rounded-md bg-[#10b981]"></button>
                                            <button type="button" onclick="setWlColor('#ec4899')" class="w-4 h-4 rounded-md bg-[#ec4899]"></button>
                                            <button type="button" onclick="setWlColor('#ef4444')" class="w-4 h-4 rounded-md bg-[#ef4444]"></button>
                                            <button type="button" onclick="setWlColor('#9333ea')" class="w-4 h-4 rounded-md bg-[#9333ea]"></button>
                                            <button type="button" onclick="setWlColor('#ef5700')" class="w-4 h-4 rounded-md bg-[#ef5700] ring-2 ring-white/50"></button>
                                        </div>
                                    </div>
                                </div>

                                <!-- Live Interactive Embed Card (Exact to Image 3) -->
                                <div id="wlPreviewEmbed" class="bg-[#0b0d14] border-r-4 border-purple-500 rounded-xl p-5 space-y-4 text-right shadow-inner">
                                    <div class="flex items-center justify-end gap-2 text-xs font-bold text-gray-400">
                                        <span>${guild.name}</span>
                                        <img src="${guildIcon}" class="w-5 h-5 rounded-full object-cover">
                                    </div>

                                    <div class="space-y-1">
                                        <h4 class="text-sm font-black text-white flex items-center justify-end gap-1.5">
                                            <span>������ ��!</span>
                                            <span>??</span>
                                        </h4>
                                        <p id="pvWlMsg" class="text-xs text-gray-300">������ {user} �� ����� **{server}**! ��� ����� ��� **{memberCount}**</p>
                                    </div>

                                    <div class="border border-dashed border-white/10 rounded-xl p-6 text-center text-gray-600 text-xs">
                                        <span>??? [���� ����� �� ����� �������]</span>
                                    </div>

                                    <div class="flex items-center justify-between text-[10px] text-gray-500 border-t border-white/5 pt-2 font-mono">
                                        <span>����� �� ����� ������ ??</span>
                                        <div class="flex items-center gap-1">
                                            <input type="checkbox" checked id="wlShowTime">
                                            <label for="wlShowTime">����� �����</label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 2. ��� ����� �������� (Leave Section - Exact to Image 4 & 5) -->
                        <!-- ========================================================= -->
                        <div id="sectionLeaveBox" class="space-y-6 hidden">
                            <!-- Card 1: Master Header Card -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                                <label class="toggle">
                                    <input type="checkbox" name="leave_enabled" value="1" ${settings.leave_enabled ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <div class="flex items-center justify-end gap-2 text-white font-black text-base">
                                            <span>����</span>
                                            <span class="text-rose-400">??</span>
                                        </div>
                                        <p class="text-gray-400 text-xs mt-0.5">����� ����� ��� ������ ��� �� �������</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Card 2: ���� �������� �������� -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">���� �������� <span class="text-rose-400">*</span></label>
                                    ${renderChannelSelect('leave_channel', settings.leave_channel || '')}
                                </div>

                                <div class="space-y-2">
                                    <div class="flex items-center justify-between text-xs text-gray-400 font-bold">
                                        <span>?</span>
                                        <span>����� �������� (�� ����)</span>
                                    </div>
                                    <textarea name="leave_message" id="leaveText" rows="3" oninput="updateLeavePreview()" class="w-full bg-[#0b0d14] border border-white/5 focus:border-rose-500 rounded-xl p-4 text-xs text-white outline-none leading-relaxed text-right">${settings.leave_message || '������ **{user}**� ����� �� ������� ??'}</textarea>
                                    
                                    <!-- Variables Pill Badges -->
                                    <div class="flex items-center justify-end gap-1.5 pt-1">
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20 cursor-pointer" onclick="insertVar('leaveText', '{user}')">{user}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20 cursor-pointer" onclick="insertVar('leaveText', '{username}')">{username}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20 cursor-pointer" onclick="insertVar('leaveText', '{server}')">{server}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20 cursor-pointer" onclick="insertVar('leaveText', '{memberCount}')">{memberCount}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Card 3: ������ �������� (����� ���� / ����� Embed) -->
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <button type="button" onclick="setLeaveType('text')" id="btnLvTypeText" class="p-4 rounded-2xl border ${settings.leave_embed_enabled === 0 ? 'border-rose-500 bg-rose-950/20 text-white' : 'border-white/5 bg-[#12141f] text-gray-400'} text-center transition">
                                    <h5 class="font-bold text-xs">����� ����</h5>
                                    <p class="text-[10px] text-gray-500 mt-1">����� �����</p>
                                </button>
                                <button type="button" onclick="setLeaveType('embed')" id="btnLvTypeEmbed" class="p-4 rounded-2xl border ${settings.leave_embed_enabled !== 0 ? 'border-rose-500 bg-rose-950/20 text-white' : 'border-white/5 bg-[#12141f] text-gray-400'} text-center transition">
                                    <h5 class="font-bold text-xs">����� Embed</h5>
                                    <p class="text-[10px] text-gray-500 mt-1">����� ����� �� �����</p>
                                </button>
                            </div>

                            <input type="hidden" name="leave_embed_enabled" id="leave_embed_enabled" value="${settings.leave_embed_enabled !== 0 ? 1 : 0}">

                            <!-- Card 4: ����� ����� �������� (Live Preview & Colors) -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                                <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                    <div class="flex flex-wrap gap-1.5">
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20">{user}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20">{username}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20">{server}</span>
                                        <span class="text-[10px] font-mono bg-[#1c1f2e] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20">{memberCount}</span>
                                    </div>
                                    <h5 class="text-xs font-black text-white">����� ����� ��������</h5>
                                </div>

                                <!-- Color Pickers Palette -->
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs font-mono text-gray-400">#EF4444</span>
                                        <input type="color" name="leave_embed_color" id="lvColorInput" value="${settings.leave_embed_color || '#ef4444'}" class="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0">
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs font-bold text-gray-300">��� �������</span>
                                        <div class="flex items-center gap-1.5">
                                            <button type="button" onclick="setLvColor('#ef4444')" class="w-4 h-4 rounded-md bg-[#ef4444] ring-2 ring-white/50"></button>
                                            <button type="button" onclick="setLvColor('#9333ea')" class="w-4 h-4 rounded-md bg-[#9333ea]"></button>
                                            <button type="button" onclick="setLvColor('#eab308')" class="w-4 h-4 rounded-md bg-[#eab308]"></button>
                                            <button type="button" onclick="setLvColor('#10b981')" class="w-4 h-4 rounded-md bg-[#10b981]"></button>
                                            <button type="button" onclick="setLvColor('#06b6d4')" class="w-4 h-4 rounded-md bg-[#06b6d4]"></button>
                                            <button type="button" onclick="setLvColor('#8b5cf6')" class="w-4 h-4 rounded-md bg-[#8b5cf6]"></button>
                                        </div>
                                    </div>
                                </div>

                                <!-- Live Interactive Leave Embed Card -->
                                <div id="lvPreviewEmbed" class="bg-[#0b0d14] border-r-4 border-rose-500 rounded-xl p-5 space-y-4 text-right shadow-inner">
                                    <div class="flex items-center justify-end gap-2 text-xs font-bold text-gray-400">
                                        <span>${guild.name}</span>
                                        <img src="${guildIcon}" class="w-5 h-5 rounded-full object-cover">
                                    </div>

                                    <div class="space-y-1">
                                        <h4 class="text-sm font-black text-white flex items-center justify-end gap-1.5">
                                            <span>������ ??</span>
                                        </h4>
                                        <p id="pvLvMsg" class="text-xs text-gray-300">������ **{username}**� ����� �� �������</p>
                                    </div>

                                    <div class="border border-dashed border-white/10 rounded-xl p-6 text-center text-gray-600 text-xs">
                                        <span>??? [���� ����� �� ����� ��������]</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    <script>
                    function switchWelcomeTab(tab) {
                        const secWl = document.getElementById('sectionWelcomeBox');
                        const secLv = document.getElementById('sectionLeaveBox');
                        const btnWl = document.getElementById('btnTabWelcome');
                        const btnLv = document.getElementById('btnTabLeave');

                        if (tab === 'welcome') {
                            secWl.classList.remove('hidden');
                            secLv.classList.add('hidden');
                            btnWl.className = "px-5 py-2 rounded-xl text-xs font-bold transition bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-lg";
                            btnLv.className = "px-5 py-2 rounded-xl text-xs font-bold transition text-gray-400 hover:text-white";
                        } else {
                            secWl.classList.add('hidden');
                            secLv.classList.remove('hidden');
                            btnLv.className = "px-5 py-2 rounded-xl text-xs font-bold transition bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-lg";
                            btnWl.className = "px-5 py-2 rounded-xl text-xs font-bold transition text-gray-400 hover:text-white";
                        }
                    }

                    function insertVar(targetId, varName) {
                        const el = document.getElementById(targetId);
                        if (!el) return;
                        el.value += ' ' + varName;
                        if (targetId === 'welcomeText') updateWelcomePreview();
                        if (targetId === 'leaveText') updateLeavePreview();
                    }

                    function updateWelcomePreview() {
                        const msg = document.getElementById('welcomeText').value;
                        const pv = document.getElementById('pvWlMsg');
                        if (pv) pv.innerText = msg || '������ {user} �� ����� **{server}**!';
                    }

                    function updateLeavePreview() {
                        const msg = document.getElementById('leaveText').value;
                        const pv = document.getElementById('pvLvMsg');
                        if (pv) pv.innerText = msg || '������ **{user}**� ����� �� �������';
                    }

                    function setWelcomeType(type) {
                        document.getElementById('welcome_embed_enabled').value = type === 'embed' ? 1 : 0;
                        document.getElementById('welcome_image').value = type === 'image' ? 1 : 0;
                        
                        document.getElementById('btnWlTypeText').className = type === 'text' ? 'p-4 rounded-2xl border border-purple-500 bg-orange-950/20 text-white text-center transition' : 'p-4 rounded-2xl border border-white/5 bg-[#12141f] text-gray-400 text-center transition';
                        document.getElementById('btnWlTypeImage').className = type === 'image' ? 'p-4 rounded-2xl border border-purple-500 bg-orange-950/20 text-white text-center transition' : 'p-4 rounded-2xl border border-white/5 bg-[#12141f] text-gray-400 text-center transition';
                        document.getElementById('btnWlTypeEmbed').className = type === 'embed' ? 'p-4 rounded-2xl border border-purple-500 bg-orange-950/20 text-white text-center transition' : 'p-4 rounded-2xl border border-white/5 bg-[#12141f] text-gray-400 text-center transition';
                    }

                    function setLeaveType(type) {
                        document.getElementById('leave_embed_enabled').value = type === 'embed' ? 1 : 0;
                        document.getElementById('btnLvTypeText').className = type === 'text' ? 'p-4 rounded-2xl border border-rose-500 bg-rose-950/20 text-white text-center transition' : 'p-4 rounded-2xl border border-white/5 bg-[#12141f] text-gray-400 text-center transition';
                        document.getElementById('btnLvTypeEmbed').className = type === 'embed' ? 'p-4 rounded-2xl border border-rose-500 bg-rose-950/20 text-white text-center transition' : 'p-4 rounded-2xl border border-white/5 bg-[#12141f] text-gray-400 text-center transition';
                    }

                    function setWlColor(c) {
                        document.getElementById('wlColorInput').value = c;
                        document.getElementById('wlPreviewEmbed').style.borderRightColor = c;
                    }

                    function setLvColor(c) {
                        document.getElementById('lvColorInput').value = c;
                        document.getElementById('lvPreviewEmbed').style.borderRightColor = c;
                    }
                    </script>
`;
            } else if (section === 'autoresponder') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Master Header Card (Exact to Image 1) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <button type="button" onclick="openAddAutoresponderModal()" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
                                <span>?</span>
                                <span>����� �� ������</span>
                            </button>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">���� ��������</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">����� ���� ������� ��� ����� �� ������ �����</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-purple-700/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30">
                                    ??
                                </div>
                            </div>
                        </div>

                        <!-- 2. Triple Stats Badges (Exact to Image 1) -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <!-- ������ ������ -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(autoRespondersList || []).length}</span>
                                <span class="text-xs font-bold text-gray-400 block">������ ������</span>
                            </div>
                            <!-- ���� ���� -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-emerald-400 font-mono">${(autoRespondersList || []).filter(r => r.is_active !== 0).length}</span>
                                <span class="text-xs font-bold text-gray-400 block">���� ����</span>
                            </div>
                            <!-- ������ ��������� -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(autoRespondersList || []).reduce((acc, r) => acc + (r.uses_count || 0), 0)}</span>
                                <span class="text-xs font-bold text-gray-400 block">������ ���������</span>
                            </div>
                        </div>

                        <!-- 3. Main List / Empty State Card (Exact to Image 1) -->
                        <div class="bg-[#12141f] border border-white/5 p-8 rounded-2xl space-y-6 shadow-xl">
                            ${(autoRespondersList && autoRespondersList.length > 0) ? `
                                <div class="space-y-3">
                                    <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                        <span class="text-xs font-mono text-gray-400 font-bold">${autoRespondersList.length} �� ����</span>
                                        <h5 class="text-xs font-black text-white">������ ��������� ������</h5>
                                    </div>
                                    ${autoRespondersList.map(r => `
                                        <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/40 transition">
                                            <button type="button" onclick="deleteAutoresponderItem(${r.id})" class="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">��� ???</button>
                                            <div class="text-right space-y-1">
                                                <div class="flex items-center justify-end gap-2">
                                                    <span class="px-2 py-0.5 bg-white/5 text-gray-400 rounded text-[10px] font-mono">${r.match_mode || '����� ���'}</span>
                                                    <span class="px-2.5 py-0.5 bg-orange-950/60 text-orange-300 border border-orange-800/40 rounded-lg text-xs font-bold font-mono">${r.trigger_word}</span>
                                                    <span class="text-gray-400 text-xs font-bold">������:</span>
                                                </div>
                                                <p class="text-xs text-gray-300">${r.reply_text}</p>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : `
                                <div class="py-12 text-center space-y-4">
                                    <div class="w-14 h-14 rounded-2xl bg-white/5 text-gray-400 flex items-center justify-center text-2xl mx-auto border border-white/5">
                                        ??
                                    </div>
                                    <div class="space-y-1">
                                        <h5 class="text-sm font-black text-white">�� ���� ���� �������</h5>
                                        <p class="text-xs text-gray-400">��� ���� ������� ���� ��� ����� �� ������ �����</p>
                                    </div>
                                    <button type="button" onclick="openAddAutoresponderModal()" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-2 shadow-lg shadow-purple-950/40">
                                        <span>����� ��� �� ������</span>
                                    </button>
                                </div>
                            `}
                        </div>

                        <!-- ========================================================= -->
                        <!-- 4. ����� ������� ��������� ������� (Exact to Image 2 Modal) -->
                        <!-- ========================================================= -->
                        <div id="addAutoresponderModal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
                            <div class="bg-[#12141f] border border-white/10 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6 text-right shadow-2xl" dir="rtl">
                                
                                <!-- Modal Header -->
                                <div class="flex items-center justify-between border-b border-white/5 pb-4">
                                    <button type="button" onclick="closeAddAutoresponderModal()" class="text-gray-400 hover:text-white text-lg font-bold">?</button>
                                    <h3 class="text-base font-black text-white">����� �� ����</h3>
                                </div>

                                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    
                                    <!-- ������ ������: ������ ���� �������� ����� -->
                                    <div class="space-y-4">
                                        <!-- ��� ������ -->
                                        <div class="space-y-1.5">
                                            <label class="block text-xs font-bold text-gray-300">��� ������</label>
                                            <input type="text" id="arTrigger" placeholder="���� ������ �� �������..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                        </div>

                                        <!-- ��� �������� (Buttons: ����� ��� / ������ ���� / ���� �� / ����� �� / Regex) -->
                                        <div class="space-y-1.5">
                                            <label class="block text-xs font-bold text-gray-300">��� ��������</label>
                                            <div class="grid grid-cols-5 gap-1 bg-[#0b0d14] p-1 rounded-xl border border-white/5 text-[10px] text-center">
                                                <button type="button" onclick="setArMatchMode('regex')" id="btnArRegex" class="py-1.5 rounded-lg text-gray-400 hover:text-white transition">Regex</button>
                                                <button type="button" onclick="setArMatchMode('ends')" id="btnArEnds" class="py-1.5 rounded-lg text-gray-400 hover:text-white transition">����� ��</button>
                                                <button type="button" onclick="setArMatchMode('starts')" id="btnArStarts" class="py-1.5 rounded-lg text-gray-400 hover:text-white transition">���� ��</button>
                                                <button type="button" onclick="setArMatchMode('exact')" id="btnArExact" class="py-1.5 rounded-lg text-gray-400 hover:text-white transition">������ ����</button>
                                                <button type="button" onclick="setArMatchMode('contains')" id="btnArContains" class="py-1.5 rounded-lg bg-purple-700 text-white font-bold transition">����� ���</button>
                                            </div>
                                        </div>

                                        <!-- ��� ���� (Buttons: �� ��� / �� ����� / �����) -->
                                        <div class="space-y-1.5">
                                            <label class="block text-xs font-bold text-gray-300">��� ����</label>
                                            <div class="grid grid-cols-3 gap-1.5">
                                                <button type="button" onclick="setArReplyType('reaction')" id="btnArReaction" class="py-2 bg-[#0b0d14] border border-white/5 rounded-xl text-[11px] text-gray-400 hover:text-white flex items-center justify-center gap-1 transition">
                                                    <span>�����</span>
                                                    <span>??</span>
                                                </button>
                                                <button type="button" onclick="setArReplyType('embed')" id="btnArEmbed" class="py-2 bg-[#0b0d14] border border-white/5 rounded-xl text-[11px] text-gray-400 hover:text-white flex items-center justify-center gap-1 transition">
                                                    <span>�� �����</span>
                                                    <span>??</span>
                                                </button>
                                                <button type="button" onclick="setArReplyType('text')" id="btnArText" class="py-2 bg-purple-700 border border-purple-500 rounded-xl text-[11px] text-white font-bold flex items-center justify-center gap-1 transition">
                                                    <span>�� ���</span>
                                                    <span>??</span>
                                                </button>
                                            </div>
                                        </div>

                                        <!-- ���� ��������� -->
                                        <div class="space-y-2">
                                            <label class="block text-xs font-bold text-gray-300">����</label>
                                            <textarea id="arReply" rows="3" placeholder="���� ����..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-500 rounded-xl p-3 text-xs text-white outline-none leading-relaxed text-right"></textarea>
                                            <div class="flex flex-wrap gap-1 justify-end">
                                                <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertArVar('{user}')">{user}</span>
                                                <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertArVar('{server}')">{server}</span>
                                                <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertArVar('{channel}')">{channel}</span>
                                                <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20 cursor-pointer" onclick="insertArVar('{memberCount}')">{memberCount}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- ������ ������: �������� ������� ������������ -->
                                    <div class="space-y-4">
                                        <!-- ���� ����� ������ -->
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between">
                                            <label class="toggle"><input type="checkbox" id="arCase"><span class="slider"></span></label>
                                            <div class="text-right">
                                                <h5 class="text-xs font-bold text-white">���� ����� ������</h5>
                                                <p class="text-[10px] text-gray-500">������� ��� ������ ������� ��������</p>
                                            </div>
                                        </div>

                                        <!-- ��� ����� ������ -->
                                        <div class="bg-[#0b0d14] border border-white/5 p-3 rounded-xl flex items-center justify-between">
                                            <label class="toggle"><input type="checkbox" id="arDeleteTrigger"><span class="slider"></span></label>
                                            <div class="text-right">
                                                <h5 class="text-xs font-bold text-white">��� ����� ������</h5>
                                                <p class="text-[10px] text-gray-500">��� ������� ���� ����� ���� ��������</p>
                                            </div>
                                        </div>

                                        <!-- ���� �������� (�����) -->
                                        <div class="space-y-1">
                                            <label class="block text-xs font-bold text-gray-300">���� �������� (�����)</label>
                                            <input type="number" id="arCooldown" placeholder="0" class="w-full bg-[#0b0d14] border border-white/5 rounded-xl px-4 py-2 text-xs text-white outline-none text-right font-mono">
                                        </div>

                                        <!-- ������� �������� -->
                                        <div class="space-y-1">
                                            <label class="block text-xs font-bold text-gray-300">������� �������� (���� = ���� �������)</label>
                                            ${renderChannelSelect('arAllowedChan', '', true)}
                                        </div>

                                        <!-- ����� �������� -->
                                        <div class="space-y-1">
                                            <label class="block text-xs font-bold text-gray-300">����� �������� (���� = ���� �����)</label>
                                            ${renderRoleSelect('arAllowedRole', '')}
                                        </div>

                                        <!-- ����� ������� -->
                                        <div class="space-y-1">
                                            <label class="block text-xs font-bold text-gray-300">����� �������</label>
                                            ${renderChannelSelect('arExemptChan', '', true)}
                                        </div>

                                        <!-- ��� ������� -->
                                        <div class="space-y-1">
                                            <label class="block text-xs font-bold text-gray-300">��� �������</label>
                                            ${renderRoleSelect('arExemptRole', '')}
                                        </div>
                                    </div>

                                </div>

                                <!-- Modal Footer Buttons -->
                                <div class="flex items-center justify-between pt-4 border-t border-white/5 flex-row-reverse">
                                    <button type="button" onclick="submitNewAutoresponder()" class="px-8 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-purple-950/40">
                                        ����� �� ������
                                    </button>
                                    <button type="button" onclick="closeAddAutoresponderModal()" class="px-6 py-2.5 bg-[#0b0d14] hover:bg-white/5 border border-white/5 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition">
                                        �����
                                    </button>
                                </div>

                            </div>
                        </div>

                    </div>

                    <script>
                    let currentArMatchMode = 'contains';
                    let currentArReplyType = 'text';

                    function openAddAutoresponderModal() {
                        document.getElementById('addAutoresponderModal').classList.remove('hidden');
                    }

                    function closeAddAutoresponderModal() {
                        document.getElementById('addAutoresponderModal').classList.add('hidden');
                    }

                    function setArMatchMode(mode) {
                        currentArMatchMode = mode;
                        const modes = ['contains', 'exact', 'starts', 'ends', 'regex'];
                        modes.forEach(m => {
                            const btn = document.getElementById('btnAr' + m.charAt(0).toUpperCase() + m.slice(1));
                            if (btn) {
                                btn.className = m === mode
                                    ? "py-1.5 rounded-lg bg-purple-700 text-white font-bold transition"
                                    : "py-1.5 rounded-lg text-gray-400 hover:text-white transition";
                            }
                        });
                    }

                    function setArReplyType(type) {
                        currentArReplyType = type;
                        const types = ['text', 'embed', 'reaction'];
                        types.forEach(t => {
                            const btn = document.getElementById('btnAr' + t.charAt(0).toUpperCase() + t.slice(1));
                            if (btn) {
                                btn.className = t === type
                                    ? "py-2 bg-purple-700 border border-purple-500 rounded-xl text-[11px] text-white font-bold flex items-center justify-center gap-1 transition"
                                    : "py-2 bg-[#0b0d14] border border-white/5 rounded-xl text-[11px] text-gray-400 hover:text-white flex items-center justify-center gap-1 transition";
                            }
                        });
                    }

                    function insertArVar(varName) {
                        const el = document.getElementById('arReply');
                        if (el) el.value += ' ' + varName;
                    }

                    async function submitNewAutoresponder() {
                        const trigger = document.getElementById('arTrigger').value.trim();
                        const reply = document.getElementById('arReply').value.trim();
                        if (!trigger) { alert('���� ����� ���� �� ����� ������'); return; }
                        if (!reply) { alert('���� ����� ���� ��������'); return; }

                        const payload = {
                            trigger_word: trigger,
                            reply_text: reply,
                            match_mode: currentArMatchMode,
                            reply_type: currentArReplyType,
                            case_sensitive: document.getElementById('arCase').checked ? 1 : 0,
                            delete_trigger: document.getElementById('arDeleteTrigger').checked ? 1 : 0,
                            cooldown_seconds: parseInt(document.getElementById('arCooldown').value) || 0,
                            allowed_channels: document.getElementById('arAllowedChan')?.value || '',
                            allowed_roles: document.getElementById('arAllowedRole')?.value || '',
                            exempt_channels: document.getElementById('arExemptChan')?.value || '',
                            exempt_roles: document.getElementById('arExemptRole')?.value || ''
                        };

                        try {
                            const res = await fetch('/api/guild/${guildId}/autoresponder', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('? ��� ����� ���� �������� �����!');
                                location.reload();
                            } else {
                                alert('? ���: ' + (data.error || '��� �������'));
                            }
                        } catch(e) {
                            alert('��� ��� �� ������� �������');
                        }
                    }

                    async function deleteAutoresponderItem(id) {
                        if (!confirm('�� ��� ����� �� ��� ��� ���� ��������')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/autoresponder/' + id, {
                                method: 'DELETE'
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('? �� ����� �����!');
                                location.reload();
                            } else {
                                alert('? ��� �����');
                            }
                        } catch(e) {
                            alert('��� ��� �� �������');
                        }
                    }
                    </script>
`;
            } else if (section === 'tickets') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Master Header Card (Tickets) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <label class="toggle">
                                <input type="checkbox" name="tickets_enabled" value="1" ${settings.tickets_enabled !== 0 ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">���� ������� ������ ����� ??</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">����� ����� ������ɡ ������� ����ɡ �������� ���� �������</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30">
                                    ??
                                </div>
                            </div>
                        </div>

                        <!-- 2. �������� ������� ����� (Live Ticket Stats) -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-purple-400 font-mono">${(guildTicketsList || []).length}</span>
                                <span class="text-xs font-bold text-gray-400 block">������ ������� �������</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-emerald-400 font-mono">${(guildTicketsList || []).filter(t => t.status === 'open').length}</span>
                                <span class="text-xs font-bold text-gray-400 block">������� �������� ������</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-amber-400 font-mono">${(guildTicketsList || []).filter(t => t.status === 'closed').length}</span>
                                <span class="text-xs font-bold text-gray-400 block">������� �������</span>
                            </div>
                        </div>

                        <!-- 3. ������� ���� ���� ������� �������� -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <button type="button" onclick="sendTicketPanelDirect()" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black shadow-lg shadow-purple-900/30 flex items-center gap-2 transition cursor-pointer">
                                    <span>??</span>
                                    <span>����� ������ ����� ����</span>
                                </button>
                                <h4 class="text-xs font-black text-white">������� ����� ���� ����� ����� (Wicks Design)</h4>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">���� ���� ����� ����� (Support Role)</label>
                                    ${renderRoleSelect('ticket_role', settings.ticket_role || '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">��� ����� ���� ������� (Panel Channel)</label>
                                    ${renderChannelSelect('ticket_panel_channel', settings.ticket_panel_channel || '')}
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">����� ���� ������� (Panel Title)</label>
                                    <input type="text" id="input_ticket_panel_title" name="ticket_panel_title" value="${settings.ticket_panel_title || 'Open a ticket ??'}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">���� ����� ������� (Transcripts Channel)</label>
                                    ${renderChannelSelect('ticket_log_channel', settings.ticket_log_channel || settings.log_channel || '')}
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">? ��� ����� ������� ������� (Ratings / Feedback Channel)</label>
                                    ${renderChannelSelect('ticket_feedback_channel', settings.ticket_feedback_channel || settings.ticket_rating_channel || '')}
                                </div>
                                <div class="flex items-center justify-between p-3 bg-[#0b0d14] border border-white/5 rounded-xl self-end h-[46px]">
                                    <label class="toggle">
                                        <input type="checkbox" name="ticket_rating_enabled" value="1" ${settings.ticket_rating_enabled !== 0 ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-white block">��� ����� ������ ��� ����� �������</span>
                                        <span class="text-[10px] text-gray-400">����� ���� ������� ? ����� ��� �������</span>
                                    </div>
                                </div>
                            </div>

                            <!-- ������ ��� ����� ������ Wicks (���� ����� ������� & ���� �� �������) -->
                            <div class="space-y-4 pt-2">
                                <!-- 1. ���� ����� ����� ������� (Panel Banner) -->
                                <div class="bg-[#0b0d14] border border-white/5 hover:border-purple-500/30 rounded-2xl p-5 transition shadow-lg">
                                    <div class="flex flex-col md:flex-row items-center justify-between gap-4">
                                        <!-- �������� ��� ����� -->
                                        <div class="w-full md:w-auto flex flex-col items-center gap-2">
                                            <div id="preview_box_ticket_panel_banner" class="w-full md:w-56 h-28 rounded-xl border border-white/10 bg-[#12141f] overflow-hidden flex items-center justify-center relative group">
                                                <img id="img_ticket_panel_banner" src="${settings.ticket_panel_banner || ''}" class="w-full h-full object-cover ${settings.ticket_panel_banner ? '' : 'hidden'}">
                                                <div id="placeholder_ticket_panel_banner" class="text-gray-500 text-xs flex flex-col items-center gap-1 ${settings.ticket_panel_banner ? 'hidden' : ''}">
                                                    <span class="text-2xl">???</span>
                                                    <span>�� ���� �����</span>
                                                </div>
                                            </div>
                                            <button type="button" onclick="clearUploadedImage('ticket_panel_banner')" class="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition font-bold py-1 px-3 rounded-lg hover:bg-rose-950/30 cursor-pointer">
                                                <span>???</span>
                                                <span>����� �������</span>
                                            </button>
                                        </div>

                                        <!-- ���� ����� ��� ����� -->
                                        <div class="flex-1 text-right space-y-1 w-full">
                                            <div class="flex items-center justify-end gap-2">
                                                <h5 class="text-sm font-black text-white">���� ����� ����� �������</h5>
                                                <span class="text-purple-400 text-base">???</span>
                                            </div>
                                            <ul class="text-[11px] text-gray-400 space-y-0.5 list-disc list-inside">
                                                <li>����� ��� ������ ����� ����� ���� ����� ���� �������.</li>
                                                <li>���� ������ ������ �� ����� �� 1920x1080 ����.</li>
                                                <li>���� ����� ��� �������� ������ ��� �� 16:9.</li>
                                            </ul>
                                        </div>

                                        <!-- �� ��� ������� ������� ����� -->
                                        <div class="w-full md:w-auto flex justify-end">
                                            <input type="file" id="file_ticket_panel_banner" accept="image/*" class="hidden" onchange="handleImageFileUpload(this, 'ticket_panel_banner')">
                                            <input type="hidden" id="input_ticket_panel_banner" name="ticket_panel_banner" value="${settings.ticket_panel_banner || ''}">
                                            <button type="button" onclick="document.getElementById('file_ticket_panel_banner').click()" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-purple-900/30 flex items-center gap-2 cursor-pointer w-full md:w-auto justify-center">
                                                <span>??</span>
                                                <span id="btn_text_ticket_panel_banner">��� �������</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <!-- 2. ���� �� ����� ������� / ����� (Welcome Embed Image) -->
                                <div class="bg-[#0b0d14] border border-white/5 hover:border-purple-500/30 rounded-2xl p-5 transition shadow-lg">
                                    <div class="flex flex-col md:flex-row items-center justify-between gap-4">
                                        <!-- �������� ��� ����� -->
                                        <div class="w-full md:w-auto flex flex-col items-center gap-2">
                                            <div id="preview_box_ticket_welcome_image" class="w-full md:w-56 h-14 rounded-xl border border-white/10 bg-[#12141f] overflow-hidden flex items-center justify-center relative group">
                                                <img id="img_ticket_welcome_image" src="${settings.ticket_welcome_image || ''}" class="w-full h-full object-cover ${settings.ticket_welcome_image ? '' : 'hidden'}">
                                                <div id="placeholder_ticket_welcome_image" class="text-gray-500 text-xs flex flex-col items-center gap-1 ${settings.ticket_welcome_image ? 'hidden' : ''}">
                                                    <span class="text-lg">???</span>
                                                    <span>�� ���� ��</span>
                                                </div>
                                            </div>
                                            <button type="button" onclick="clearUploadedImage('ticket_welcome_image')" class="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition font-bold py-1 px-3 rounded-lg hover:bg-rose-950/30 cursor-pointer">
                                                <span>???</span>
                                                <span>����� ����</span>
                                            </button>
                                        </div>

                                        <!-- ���� ����� ��� ����� -->
                                        <div class="flex-1 text-right space-y-1 w-full">
                                            <div class="flex items-center justify-end gap-2">
                                                <h5 class="text-sm font-black text-white">���� �� ����� �������</h5>
                                                <span class="text-purple-400 text-base">???</span>
                                            </div>
                                            <ul class="text-[11px] text-gray-400 space-y-0.5 list-disc list-inside">
                                                <li>����� ���� ���� ��� ����� �� ������� ���� �������.</li>
                                                <li>���� ������ ������ �� ����� �� 1920 ����.</li>
                                                <li>���� ����� ��� �������� ������ ��� �� 5:1.</li>
                                            </ul>
                                        </div>

                                        <!-- �� ��� ���� ������� ����� -->
                                        <div class="w-full md:w-auto flex justify-end">
                                            <input type="file" id="file_ticket_welcome_image" accept="image/*" class="hidden" onchange="handleImageFileUpload(this, 'ticket_welcome_image')">
                                            <input type="hidden" id="input_ticket_welcome_image" name="ticket_welcome_image" value="${settings.ticket_welcome_image || ''}">
                                            <button type="button" onclick="document.getElementById('file_ticket_welcome_image').click()" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-purple-900/30 flex items-center gap-2 cursor-pointer w-full md:w-auto justify-center">
                                                <span>??</span>
                                                <span id="btn_text_ticket_welcome_image">��� ����</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2">����� ������� ��������� ���� ������� (Ticket Welcome Message)</label>
                                <textarea name="ticket_welcome_msg" rows="3" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl p-4 text-xs text-white outline-none leading-relaxed text-right">${settings.ticket_welcome_msg || '������ �� {user}! ���� ����� �������� ������ ���� ������� ����� ���� ������ ??'}</textarea>
                            </div>
                        </div>

                        <!-- 4. ���� ������� ����� (Live Active Tickets) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                <span class="text-xs font-mono text-gray-400 font-bold">${(guildTicketsList || []).length} �����</span>
                                <h4 class="text-xs font-black text-white">��� ������� �������</h4>
                            </div>

                            <div class="space-y-2">
                                ${(guildTicketsList && guildTicketsList.length > 0) ? guildTicketsList.slice(0, 10).map(t => `
                                    <div class="bg-[#0b0d14] border border-white/5 p-3.5 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition text-xs">
                                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${t.status === 'open' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/30' : 'bg-rose-950/60 text-rose-400 border border-rose-800/30'}">${t.status === 'open' ? '������ ??' : '����� ??'}</span>
                                        <div class="text-right">
                                            <span class="font-bold text-white block">���� �������: <span class="font-mono text-purple-300">${t.user_id}</span></span>
                                            <span class="text-[10px] text-gray-400">${t.category || '���'} � <span class="font-mono">${new Date(t.created_at * 1000).toLocaleDateString('ar-SA')}</span></span>
                                        </div>
                                    </div>
                                `).join('') : `
                                    <div class="py-8 text-center text-xs text-gray-500">
                                        �� ���� ����� ����� ������ �� ������� ??
                                    </div>
                                `}
                            </div>
                        </div>

                    </div>
                    <script>
                    async function handleImageFileUpload(input, fieldName) {
                        const file = input.files && input.files[0];
                        if (!file) return;

                        if (!file.type.startsWith('image/')) {
                            alert('? ���� ������ ��� ���� ���� (PNG, JPG, WEBP, GIF)');
                            return;
                        }

                        if (file.size > 15 * 1024 * 1024) {
                            alert('? ��� ������ ������ 15 ��������. ���� ������ ���� ����.');
                            return;
                        }

                        const btnText = document.getElementById('btn_text_' + fieldName);
                        const origText = btnText ? btnText.innerText : '���';
                        if (btnText) btnText.innerText = '���� �����... ?';

                        const reader = new FileReader();
                        reader.onload = async function(e) {
                            const base64Data = e.target.result;
                            try {
                                const res = await fetch('/api/guild/${guildId}/upload-image', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        imageBase64: base64Data,
                                        fieldName: fieldName
                                    })
                                });
                                const data = await res.json();
                                if (data.success && data.url) {
                                    // Update hidden input
                                    const hiddenInput = document.getElementById('input_' + fieldName);
                                    if (hiddenInput) hiddenInput.value = data.url;

                                    // Update preview
                                    const imgElem = document.getElementById('img_' + fieldName);
                                    const placeholderElem = document.getElementById('placeholder_' + fieldName);
                                    if (imgElem) {
                                        imgElem.src = data.url;
                                        imgElem.classList.remove('hidden');
                                    }
                                    if (placeholderElem) {
                                        placeholderElem.classList.add('hidden');
                                    }
                                    if (btnText) btnText.innerText = '? �� �����';
                                    setTimeout(() => { if (btnText) btnText.innerText = origText; }, 2500);
                                } else {
                                    alert('? ��� ��� ������: ' + (data.error || '��� ��� �����'));
                                    if (btnText) btnText.innerText = origText;
                                }
                            } catch(err) {
                                alert('��� ��� ����� ��� ������: ' + err.message);
                                if (btnText) btnText.innerText = origText;
                            }
                        };
                        reader.readAsDataURL(file);
                    }

                    function clearUploadedImage(fieldName) {
                        const hiddenInput = document.getElementById('input_' + fieldName);
                        if (hiddenInput) hiddenInput.value = '';

                        const imgElem = document.getElementById('img_' + fieldName);
                        const placeholderElem = document.getElementById('placeholder_' + fieldName);
                        if (imgElem) {
                            imgElem.src = '';
                            imgElem.classList.add('hidden');
                        }
                        if (placeholderElem) {
                            placeholderElem.classList.remove('hidden');
                        }

                        const fileInput = document.getElementById('file_' + fieldName);
                        if (fileInput) fileInput.value = '';
                    }

                    async function sendTicketPanelDirect() {
                        const panelCh = document.getElementById('ticket_panel_channel')?.value;
                        if (!panelCh) {
                            return alert('���� ������ "��� ����� ���� ������� (Panel Channel)" ����� �� ��� ���������.');
                        }

                        const title = document.getElementById('input_ticket_panel_title')?.value || 'Open a ticket ??';
                        const banner = document.getElementById('input_ticket_panel_banner')?.value || '';

                        if (!confirm('�� ���� ����� ���� ������� ���� ������ ��� ����� ������ѿ')) return;

                        try {
                            const res = await fetch('/api/guild/${guildId}/tickets/send-panel', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    channelId: panelCh,
                                    ticket_panel_title: title,
                                    ticket_panel_banner: banner
                                })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('? �� ����� ���� ������� ����� ��� ������!');
                            } else {
                                alert('? ��� �������: ' + (data.error || '���� �� ������� ����� �� ������'));
                            }
                        } catch(e) {
                            alert('��� ��� ����� ������ �������: ' + e.message);
                        }
                    }
                    </script>
`;
            } else if (section === 'autoroles') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Master Header Card (Exact to Image 1) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <label class="toggle">
                                <input type="checkbox" name="autoroles_enabled" value="1" ${settings.autoroles_enabled !== 0 ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                            <div class="flex items-center gap-3">
                                <span class="text-xs font-black text-white">����</span>
                                <div class="w-10 h-10 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center text-lg border border-amber-500/30">
                                    ???
                                </div>
                            </div>
                        </div>

                        <!-- Card: ��� ������� ����� & ���� ������� ������� (Exact to Image 1) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-6 shadow-xl">
                            <!-- ��� ������� ����� -->
                            <div class="space-y-2">
                                <div class="flex items-center justify-end gap-1 text-xs font-bold text-gray-300">
                                    <span>��� ������� �����</span>
                                </div>
                                ${renderRoleSelect('autorole_id', settings.autorole_id || settings.auto_role || '')}
                                <p class="text-[10px] text-gray-500 text-right">����� ���� ����� ������� ����� ��� ��������</p>
                            </div>

                            <!-- ���� ������� ������� -->
                            <div class="space-y-2 pt-4 border-t border-white/5">
                                <div class="flex items-center justify-end gap-1 text-xs font-bold text-gray-300">
                                    <span>���� ������� �������</span>
                                </div>
                                ${renderRoleSelect('autorole_bot_id', settings.autorole_bot_id || '')}
                                <p class="text-[10px] text-gray-500 text-right">������ ���� ����� ������� ��� ������� �������</p>
                            </div>
                        </div>

                    </div>
`;
            } else if (section === 'levels') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Top Tab Switcher & Master Toggle (Exact to Images 1, 2, 3) -->
                        <div class="flex items-center justify-between">
                            <label class="toggle">
                                <input type="checkbox" name="leveling_enabled" value="1" onchange="toggleModule(_dashGuildId, 'leveling_enabled', this.checked)" ${settings.leveling_enabled !== 0 ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>

                            <!-- Navigation Tabs (Exact to Versa Tab Bar) -->
                            <div class="flex items-center gap-2 bg-[#10121b] border border-white/5 p-1.5 rounded-2xl">
                                <button type="button" onclick="switchLevelTab('settings')" id="btnTabLvlSettings" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(!currentTab || currentTab === 'settings') ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white'} flex items-center gap-1">
                                    <span>���������</span>
                                    <span>??</span>
                                </button>
                                <button type="button" onclick="switchLevelTab('text_roles')" id="btnTabLvlText" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(currentTab === 'text_roles') ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white'} flex items-center gap-1">
                                    <span>��� ������</span>
                                    <span>??</span>
                                </button>
                                <button type="button" onclick="switchLevelTab('voice_roles')" id="btnTabLvlVoice" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(currentTab === 'voice_roles') ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white'} flex items-center gap-1">
                                    <span>��� �����</span>
                                    <span>??</span>
                                </button>
                                <button type="button" onclick="switchLevelTab('shared_roles')" id="btnTabLvlShared" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(currentTab === 'shared_roles') ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white'} flex items-center gap-1">
                                    <span>��� ������</span>
                                    <span>?</span>
                                </button>
                                <button type="button" onclick="switchLevelTab('leaderboard')" id="btnTabLvlLeaderboard" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(currentTab === 'leaderboard') ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white'} flex items-center gap-1">
                                    <span>���������</span>
                                    <span>??</span>
                                </button>
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 1. ����� ��������� ������ (Settings Tab) -->
                        <!-- ========================================================= -->
                        <div id="tabLvlSettings" class="space-y-6 ${(!currentTab || currentTab === 'settings') ? '' : 'hidden'}">
                            <!-- ����� ���� XP -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-end gap-2 text-white font-black text-sm border-b border-white/5 pb-3">
                                    <span>���� XP</span>
                                    <span class="text-amber-400">?</span>
                                </div>

                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <!-- ������� ������ -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                        <label class="toggle">
                                            <input type="checkbox" name="level_text_xp_enabled" value="1" ${settings.level_text_xp_enabled !== 0 ? 'checked' : ''}>
                                            <span class="slider"></span>
                                        </label>
                                        <div class="flex items-center gap-2 text-xs font-bold text-white">
                                            <span>������� ������</span>
                                            <span>??</span>
                                        </div>
                                    </div>

                                    <!-- ������� ����� -->
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                        <label class="toggle">
                                            <input type="checkbox" name="level_voice_xp_enabled" value="1" ${settings.level_voice_xp_enabled !== 0 ? 'checked' : ''}>
                                            <span class="slider"></span>
                                        </label>
                                        <div class="flex items-center gap-2 text-xs font-bold text-white">
                                            <span>������� �����</span>
                                            <span>??</span>
                                        </div>
                                    </div>
                                </div>

                                <!-- ���� ������ XP -->
                                <div class="space-y-2">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <span class="text-xs text-gray-400">�����</span>
                                            <input type="number" name="level_cooldown_seconds" value="${settings.level_cooldown_seconds || 120}" class="w-20 bg-[#0b0d14] border border-white/5 rounded-xl px-3 py-1.5 text-xs text-white font-mono text-center outline-none">
                                        </div>
                                        <div class="text-right">
                                            <h5 class="text-xs font-bold text-white">���� ������ XP</h5>
                                            <p class="text-[10px] text-gray-500">������� ��� �� ����� ���� XP</p>
                                        </div>
                                    </div>
                                </div>

                                <!-- XP ����� �� ������� -->
                                <div class="space-y-2 pt-3 border-t border-white/5">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <span class="text-xs text-gray-400">XP/�����</span>
                                            <input type="number" name="level_voice_xp_rate" value="${settings.level_voice_xp_rate || 3}" class="w-20 bg-[#0b0d14] border border-white/5 rounded-xl px-3 py-1.5 text-xs text-white font-mono text-center outline-none">
                                        </div>
                                        <div class="text-right">
                                            <h5 class="text-xs font-bold text-white">XP ����� �� �������</h5>
                                            <p class="text-[10px] text-gray-500">���� XP �������� ��� ����� �� �����</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- ����� ������� ����� -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-end gap-2 text-white font-black text-sm border-b border-white/5 pb-3">
                                    <span>������� �����</span>
                                    <span class="text-pink-400">??</span>
                                </div>

                                <div class="space-y-2">
                                    <div class="flex items-center justify-between text-xs font-bold">
                                        <span class="px-3 py-1 bg-orange-950/60 text-purple-400 border border-orange-800/40 rounded-xl font-mono text-sm" id="voiceMinMembersVal">${settings.level_voice_min_members || 2}</span>
                                        <span class="text-white">���� ������ ������� �� ������</span>
                                    </div>
                                    <input type="range" name="level_voice_min_members" min="1" max="10" value="${settings.level_voice_min_members || 2}" oninput="document.getElementById('voiceMinMembersVal').innerText = this.value" class="w-full accent-purple-600 cursor-pointer">
                                    <p class="text-[10px] text-gray-500 text-right">��� ������� ������� �� ������ ���� ���� XP</p>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <label class="toggle">
                                        <input type="checkbox" name="level_ignore_deafened" value="1" ${settings.level_ignore_deafened !== 0 ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">����� ������� ���������</h5>
                                        <p class="text-[10px] text-gray-500">�� ���� ������� ��������� ��� XP ����</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <label class="toggle">
                                        <input type="checkbox" name="level_ignore_muted" value="1" ${settings.level_ignore_muted !== 0 ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">����� ������� ��������</h5>
                                        <p class="text-[10px] text-gray-500">�� ���� ������� �������� ��� XP ����</p>
                                    </div>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <label class="toggle">
                                        <input type="checkbox" name="level_ignore_afk" value="1" ${settings.level_ignore_afk !== 0 ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">����� ���� AFK</h5>
                                        <p class="text-[10px] text-gray-500">�� ���� ������� �� ���� AFK ��� XP</p>
                                    </div>
                                </div>
                            </div>

                            <!-- ����� ������� ��� ������� -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-end gap-2 text-white font-black text-sm border-b border-white/5 pb-3">
                                    <span>������� ��� �������</span>
                                    <span class="text-indigo-400">??</span>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <label class="toggle">
                                        <input type="checkbox" name="level_up_msg_enabled" value="1" ${settings.level_up_msg_enabled !== 0 ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">����� ��� �������</h5>
                                        <p class="text-[10px] text-gray-500">����� ����� ��� ��� �������</p>
                                    </div>
                                </div>

                                <div class="space-y-2">
                                    <label class="block text-xs font-bold text-gray-300">���� ������� �������</label>
                                    ${renderChannelSelect('level_channel', settings.level_channel || '')}
                                </div>

                                <div class="space-y-2">
                                    <div class="flex items-center justify-between text-xs text-gray-400">
                                        <div class="flex items-center gap-1">
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{server}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{xp}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{level}</span>
                                            <span class="text-[10px] font-mono bg-[#1c1f2e] text-purple-400 px-2 py-0.5 rounded-lg border border-purple-500/20">{user}</span>
                                        </div>
                                        <span class="font-bold text-white">����� ��� ������� (�����)</span>
                                    </div>
                                    <input type="text" name="level_message" value="${settings.level_message || '?? ����� {user}! ���� ������� **{level}**!'}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>

                                <div class="space-y-2">
                                    <label class="block text-xs font-bold text-white text-right">����� ��� ������� (����)</label>
                                    <input type="text" name="level_voice_msg" value="${settings.level_voice_msg || '?? ����� {user}! ���� ������� ������ **{level}**!'}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <label class="toggle">
                                        <input type="checkbox" name="level_dm_msg_enabled" value="1" ${settings.level_dm_msg_enabled ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">����� ����� ����</h5>
                                        <p class="text-[10px] text-gray-500">����� ����� ��� ������� ������ ���� �� DM</p>
                                    </div>
                                </div>

                                <!-- ���� ����� ������� ���� Wicks -->
                                <div class="bg-[#0b0d14] border border-white/5 hover:border-purple-500/30 rounded-2xl p-4 transition shadow-lg">
                                    <div class="flex flex-col md:flex-row items-center justify-between gap-4">
                                        <!-- �������� ��� ����� -->
                                        <div class="w-full md:w-auto flex flex-col items-center gap-2">
                                            <div class="w-full md:w-48 h-24 rounded-xl border border-white/10 bg-[#12141f] overflow-hidden flex items-center justify-center relative group">
                                                <img id="img_level_up_image" src="${settings.level_up_image || ''}" class="w-full h-full object-cover ${settings.level_up_image ? '' : 'hidden'}">
                                                <div id="placeholder_level_up_image" class="text-gray-500 text-xs flex flex-col items-center gap-1 ${settings.level_up_image ? 'hidden' : ''}">
                                                    <span class="text-2xl">???</span>
                                                    <span>�� ���� ����</span>
                                                </div>
                                            </div>
                                            <button type="button" onclick="clearUploadedImageInDOM('level_up_image')" class="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition font-bold py-1 px-3 rounded-lg hover:bg-rose-950/30 cursor-pointer">
                                                <span>???</span>
                                                <span>����� ������</span>
                                            </button>
                                        </div>

                                        <!-- ���� ����� -->
                                        <div class="flex-1 text-right space-y-1 w-full">
                                            <div class="flex items-center justify-end gap-2">
                                                <h5 class="text-sm font-black text-white">���� ����� ��� �������</h5>
                                                <span class="text-purple-400 text-base">??</span>
                                            </div>
                                            <ul class="text-[11px] text-gray-400 space-y-0.5 list-disc list-inside">
                                                <li>���� ���� �� ����� ������� ���� ������� �� ����� �� �����.</li>
                                                <li>���� ������ ������ �� ����� �� 1024x512 ����.</li>
                                                <li>����� ��������: PNG, JPG, GIF, WEBP.</li>
                                            </ul>
                                        </div>

                                        <!-- �� ����� -->
                                        <div class="w-full md:w-auto flex justify-end">
                                            <input type="file" id="file_level_up_image" accept="image/*" class="hidden" onchange="uploadImageFile(this, 'level_up_image')">
                                            <input type="hidden" id="input_level_up_image" name="level_up_image" value="${settings.level_up_image || ''}">
                                            <button type="button" onclick="document.getElementById('file_level_up_image').click()" class="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-purple-900/30 flex items-center gap-2 cursor-pointer w-full md:w-auto justify-center">
                                                <span>??</span>
                                                <span id="btn_text_level_up_image">��� ������</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- ����� ����� ����� & ����������� -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-end gap-2 text-white font-black text-sm border-b border-white/5 pb-3">
                                    <span>������� ����� ������������</span>
                                    <span class="text-amber-400">??</span>
                                </div>

                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <label class="toggle">
                                        <input type="checkbox" name="level_stack_roles" value="1" ${settings.level_stack_roles ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">����� �����</h5>
                                        <p class="text-[10px] text-gray-500">�������� ����� ��� ��������� ������� ��� �������</p>
                                    </div>
                                </div>

                                <div class="space-y-2 pt-3 border-t border-white/5">
                                    <label class="block text-xs font-bold text-white">����� �������</label>
                                    ${renderChannelSelect('level_exempt_channels', settings.level_exempt_channels || '', true)}
                                </div>

                                <div class="space-y-2 pt-3 border-t border-white/5">
                                    <label class="block text-xs font-bold text-white">��� �������</label>
                                    ${renderRoleSelect('level_exempt_roles', settings.level_exempt_roles || '')}
                                </div>
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 2. ����� ��� ��������� �������� (Text Roles Tab) -->
                        <!-- ========================================================= -->
                        <div id="tabLvlText" class="space-y-6 ${(currentTab === 'text_roles') ? '' : 'hidden'}">
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                    <div class="flex items-center gap-2">
                                        <button type="button" onclick="openAddLevelRoleModal('text')" class="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
                                            <span>?</span>
                                            <span>����� ����</span>
                                        </button>
                                        <button type="button" onclick="location.reload()" class="px-3.5 py-2 bg-[#0b0d14] hover:bg-white/5 border border-white/5 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1">
                                            <span>??</span>
                                            <span>������</span>
                                        </button>
                                    </div>
                                    <div class="text-right">
                                        <h4 class="text-sm font-black text-white">��� ��������� ��������</h4>
                                        <p class="text-[10px] text-gray-500 mt-0.5">��� ��� ���� ����� ������� ��� ������ ������ ����� ����</p>
                                    </div>
                                </div>

                                <div class="space-y-2">
                                    ${(levelRewardsList && levelRewardsList.filter(r => r.reward_type === 'text' || !r.reward_type).length > 0) ? levelRewardsList.filter(r => r.reward_type === 'text' || !r.reward_type).map(r => `
                                        <div class="bg-[#0b0d14] border border-white/5 p-3.5 rounded-xl flex items-center justify-between hover:border-purple-500/40 transition text-xs">
                                            <button type="button" onclick="deleteLevelRole(${r.id || r.level})" class="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">��� ???</button>
                                            <div class="flex items-center gap-3">
                                                <div class="text-right">
                                                    <span class="font-bold text-white block">����� ����� ${r.level}</span>
                                                    <span class="text-[10px] text-purple-400 font-mono">������: @${(guildRoles.find(role => role.id === r.role_id)?.name) || r.role_id}</span>
                                                </div>
                                                <span class="w-8 h-8 rounded-lg bg-purple-700/20 text-purple-400 flex items-center justify-center font-bold">??</span>
                                            </div>
                                        </div>
                                    `).join('') : `
                                        <div class="py-12 text-center space-y-3">
                                            <div class="w-12 h-12 rounded-full bg-white/5 text-gray-400 flex items-center justify-center text-xl mx-auto">??</div>
                                            <h5 class="text-xs font-bold text-gray-300">�� ���� ��� �������</h5>
                                            <p class="text-[10px] text-gray-500">��� ��� ������� ������� �������</p>
                                            <button type="button" onclick="openAddLevelRoleModal('text')" class="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
                                                <span>����� ��� ����</span>
                                            </button>
                                        </div>
                                    `}
                                </div>

                                <!-- ����� ������ ���� XP -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl space-y-3">
                                    <div class="flex items-center justify-end gap-1.5 text-xs font-bold text-gray-300">
                                        <span>������ ���� XP</span>
                                        <span class="text-purple-400">??</span>
                                    </div>
                                    <p class="text-[11px] text-gray-400 text-right font-mono">XP ������� ������� = (������� � 25)�</p>
                                    <div class="flex items-center justify-center gap-2 pt-1">
                                        <span class="px-3 py-1 bg-white/5 border border-white/5 rounded-lg text-[10px] font-mono text-gray-300">����� 20 = 250,000 XP</span>
                                        <span class="px-3 py-1 bg-white/5 border border-white/5 rounded-lg text-[10px] font-mono text-gray-300">����� 10 = 62,500 XP</span>
                                        <span class="px-3 py-1 bg-white/5 border border-white/5 rounded-lg text-[10px] font-mono text-gray-300">����� 5 = 15,625 XP</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 3. ����� ��� ��������� ������� (Voice Roles Tab - Image 1) -->
                        <!-- ========================================================= -->
                        <div id="tabLvlVoice" class="space-y-6 ${(currentTab === 'voice_roles') ? '' : 'hidden'}">
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                    <div class="flex items-center gap-2">
                                        <button type="button" onclick="openAddLevelRoleModal('voice')" class="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
                                            <span>?</span>
                                            <span>����� ����</span>
                                        </button>
                                        <button type="button" onclick="location.reload()" class="px-3.5 py-2 bg-[#0b0d14] hover:bg-white/5 border border-white/5 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1">
                                            <span>??</span>
                                            <span>������</span>
                                        </button>
                                    </div>
                                    <div class="text-right">
                                        <h4 class="text-sm font-black text-white">��� ��������� �������</h4>
                                        <p class="text-[10px] text-gray-500 mt-0.5">��� ��� ���� ����� ������� ��� ������ ������ ���� ����</p>
                                    </div>
                                </div>

                                <div class="space-y-2">
                                    ${(levelRewardsList && levelRewardsList.filter(r => r.reward_type === 'voice').length > 0) ? levelRewardsList.filter(r => r.reward_type === 'voice').map(r => `
                                        <div class="bg-[#0b0d14] border border-white/5 p-3.5 rounded-xl flex items-center justify-between hover:border-pink-500/40 transition text-xs">
                                            <button type="button" onclick="deleteLevelRole(${r.id || r.level})" class="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">��� ???</button>
                                            <div class="flex items-center gap-3">
                                                <div class="text-right">
                                                    <span class="font-bold text-white block">����� ���� ${r.level}</span>
                                                    <span class="text-[10px] text-pink-400 font-mono">������: @${(guildRoles.find(role => role.id === r.role_id)?.name) || r.role_id}</span>
                                                </div>
                                                <span class="w-8 h-8 rounded-lg bg-pink-600/20 text-pink-400 flex items-center justify-center font-bold">??</span>
                                            </div>
                                        </div>
                                    `).join('') : `
                                        <div class="py-12 text-center space-y-3">
                                            <div class="w-12 h-12 rounded-full bg-pink-950/40 text-pink-400 flex items-center justify-center text-xl mx-auto border border-pink-500/20">??</div>
                                            <h5 class="text-xs font-bold text-gray-300">�� ���� ��� �������</h5>
                                            <p class="text-[10px] text-gray-500">��� ��� ������� ������� �������</p>
                                            <button type="button" onclick="openAddLevelRoleModal('voice')" class="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
                                                <span>����� ��� ����</span>
                                            </button>
                                        </div>
                                    `}
                                </div>

                                <!-- ����� ������ ���� XP -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl space-y-3">
                                    <div class="flex items-center justify-end gap-1.5 text-xs font-bold text-gray-300">
                                        <span>������ ���� XP</span>
                                        <span class="text-purple-400">??</span>
                                    </div>
                                    <p class="text-[11px] text-gray-400 text-right font-mono">XP ������� ������� = (������� � 25)�</p>
                                    <div class="flex items-center justify-center gap-2 pt-1">
                                        <span class="px-3 py-1 bg-white/5 border border-white/5 rounded-lg text-[10px] font-mono text-gray-300">����� 20 = 250,000 XP</span>
                                        <span class="px-3 py-1 bg-white/5 border border-white/5 rounded-lg text-[10px] font-mono text-gray-300">����� 10 = 62,500 XP</span>
                                        <span class="px-3 py-1 bg-white/5 border border-white/5 rounded-lg text-[10px] font-mono text-gray-300">����� 5 = 15,625 XP</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 4. ����� ��� ������ / ����� ������� (Shared Dual Roles - Image 2) -->
                        <!-- ========================================================= -->
                        <div id="tabLvlShared" class="space-y-6 ${(currentTab === 'shared_roles') ? '' : 'hidden'}">
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                    <div class="flex items-center gap-2">
                                        <button type="button" onclick="openAddSharedRoleModal()" class="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
                                            <span>?</span>
                                            <span>����� ���</span>
                                        </button>
                                        <button type="button" onclick="location.reload()" class="px-3.5 py-2 bg-[#0b0d14] hover:bg-white/5 border border-white/5 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1">
                                            <span>??</span>
                                            <span>������</span>
                                        </button>
                                    </div>
                                    <div class="text-right">
                                        <h4 class="text-sm font-black text-white">��� ����� �������</h4>
                                        <p class="text-[10px] text-gray-500 mt-0.5">������ ����� ��� ��� ���� ���� ������� ������ ����</p>
                                    </div>
                                </div>

                                <!-- ����� ��� ���� ����� �������ɿ (Exact to Image 2) -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl space-y-2 text-right">
                                    <div class="flex items-center justify-end gap-1.5 text-xs font-bold text-amber-400">
                                        <span>��� ���� ����� �������ɿ</span>
                                        <span>??</span>
                                    </div>
                                    <p class="text-[11px] text-gray-300 leading-relaxed">
                                        ����� ������ ��� ����� ���� ����� ��� ������� �� ��� ����� � ����� ����� ����� ������ ���� �������. ��� ��� �� ��ء ����� ������ ��������.
                                    </p>
                                </div>

                                <!-- ���� ������ (Exact to Image 2) -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl space-y-2">
                                    <span class="text-[10px] text-gray-500 block text-right">���� ������:</span>
                                    <div class="flex items-center justify-center gap-3">
                                        <span class="px-3 py-1 bg-amber-950/60 text-amber-400 border border-amber-800/40 rounded-xl text-xs font-bold flex items-center gap-1.5">
                                            <span>��� ����</span>
                                            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                                        </span>
                                        <span class="text-gray-500 font-bold">&gt;</span>
                                        <span class="px-3 py-1 bg-pink-950/60 text-pink-400 border border-pink-500/20 rounded-xl text-xs font-bold flex items-center gap-1">
                                            <span>���� ? 5</span>
                                            <span>??</span>
                                        </span>
                                        <span class="text-gray-500 font-bold">+</span>
                                        <span class="px-3 py-1 bg-indigo-950/60 text-indigo-400 border border-indigo-500/20 rounded-xl text-xs font-bold flex items-center gap-1">
                                            <span>����� ? 10</span>
                                            <span>??</span>
                                        </span>
                                    </div>
                                </div>

                                <div class="space-y-2">
                                    ${(levelRewardsList && levelRewardsList.filter(r => r.reward_type === 'shared').length > 0) ? levelRewardsList.filter(r => r.reward_type === 'shared').map(r => `
                                        <div class="bg-[#0b0d14] border border-white/5 p-3.5 rounded-xl flex items-center justify-between hover:border-amber-500/40 transition text-xs">
                                            <button type="button" onclick="deleteLevelRole(${r.id || r.level})" class="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">��� ???</button>
                                            <div class="flex items-center gap-3">
                                                <div class="text-right">
                                                    <span class="font-bold text-white block">����� ? ${r.level} + ���� ? ${r.voice_level || 0}</span>
                                                    <span class="text-[10px] text-amber-400 font-mono">������: @${(guildRoles.find(role => role.id === r.role_id)?.name) || r.role_id}</span>
                                                </div>
                                                <span class="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center font-bold">?</span>
                                            </div>
                                        </div>
                                    `).join('') : `
                                        <div class="py-12 text-center space-y-3">
                                            <div class="w-12 h-12 rounded-full bg-amber-950/40 text-amber-400 flex items-center justify-center text-xl mx-auto border border-amber-500/20">?</div>
                                            <h5 class="text-xs font-bold text-gray-300">�� ���� ��� ������</h5>
                                            <p class="text-[10px] text-gray-500">��� ����� ������� ���� ���� ��� ���� ����� ���� ������ ����</p>
                                            <button type="button" onclick="openAddSharedRoleModal()" class="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
                                                <span>����� ��� ���</span>
                                            </button>
                                        </div>
                                    `}
                                </div>
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 5. ����� ��������� (Leaderboard Tab - Image 3) -->
                        <!-- ========================================================= -->
                        <div id="tabLvlLeaderboard" class="space-y-6 ${(currentTab === 'leaderboard') ? '' : 'hidden'}">
                            <div class="flex items-center justify-between">
                                <button type="button" onclick="location.reload()" class="px-4 py-2 bg-[#12141f] hover:bg-white/5 border border-white/5 text-gray-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5">
                                    <span>??</span>
                                    <span>�����</span>
                                </button>
                                <div class="text-right">
                                    <h4 class="text-sm font-black text-white">���� ���������</h4>
                                    <p class="text-[10px] text-gray-500 mt-0.5">���� ������� ������ �� �������</p>
                                </div>
                            </div>

                            <!-- Triple Stats Cards (Exact to Image 3: ��� ��� | ������ XP | ���� �����) -->
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                    <span class="text-2xl font-black text-white font-mono">${(guildLeaderboardUsers || []).length}</span>
                                    <span class="text-xs font-bold text-gray-400 block">��� ���</span>
                                </div>
                                <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                    <span class="text-2xl font-black text-white font-mono">${(guildLeaderboardUsers || []).reduce((acc, u) => acc + (u.xp || 0), 0)}</span>
                                    <span class="text-xs font-bold text-gray-400 block">������ XP</span>
                                </div>
                                <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                    <span class="text-2xl font-black text-white font-mono">${(guildLeaderboardUsers && guildLeaderboardUsers[0]) ? guildLeaderboardUsers[0].level : 1}</span>
                                    <span class="text-xs font-bold text-gray-400 block">���� �����</span>
                                </div>
                            </div>

                            <!-- Leaderboard User Cards with Progress Bar (Exact to Image 3) -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                                ${(guildLeaderboardUsers && guildLeaderboardUsers.length > 0) ? guildLeaderboardUsers.map((u, idx) => `
                                    <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-2xl flex items-center justify-between shadow-md">
                                        <div class="flex items-center gap-3">
                                            <span class="text-xs font-bold text-purple-400 font-mono">${u.xp || 0} <span class="text-[10px] text-gray-500">������ XP</span></span>
                                        </div>
                                        
                                        <div class="flex-1 max-w-md mx-6 hidden sm:block">
                                            <div class="w-full bg-[#1c1f2e] h-1.5 rounded-full overflow-hidden">
                                                <div class="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full" style="width: ${Math.min(100, Math.max(10, ((u.xp || 0) % 1875) / 18.75))}%"></div>
                                            </div>
                                        </div>

                                        <div class="flex items-center gap-3">
                                            <span class="px-2 py-0.5 bg-indigo-950/60 text-indigo-300 border border-indigo-500/30 rounded-lg text-[10px] font-mono font-bold">Lv.${u.level || 1}</span>
                                            <span class="font-bold text-white text-xs">${u.user_id}</span>
                                            <div class="w-7 h-7 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center font-bold text-xs border border-amber-500/30 font-mono">
                                                ${idx + 1}
                                            </div>
                                        </div>
                                    </div>
                                `).join('') : `
                                    <div class="py-8 text-center text-xs text-gray-500">
                                        �� ���� ������ ����� �� ���� ��������� ���.
                                    </div>
                                `}
                            </div>
                        </div>

                    </div>

                    <script>
                    function switchLevelTab(tab) {
                        const tabs = ['settings', 'text_roles', 'voice_roles', 'shared_roles', 'leaderboard'];
                        tabs.forEach(t => {
                            const el = document.getElementById(t === 'settings' ? 'tabLvlSettings' : (t === 'text_roles' ? 'tabLvlText' : (t === 'voice_roles' ? 'tabLvlVoice' : (t === 'shared_roles' ? 'tabLvlShared' : 'tabLvlLeaderboard'))));
                            const btn = document.getElementById(t === 'settings' ? 'btnTabLvlSettings' : (t === 'text_roles' ? 'btnTabLvlText' : (t === 'voice_roles' ? 'btnTabLvlVoice' : (t === 'shared_roles' ? 'btnTabLvlShared' : 'btnTabLvlLeaderboard'))));
                            if (el) el.classList.toggle('hidden', t !== tab);
                            if (btn) {
                                btn.className = t === tab 
                                    ? "px-4 py-1.5 rounded-xl text-xs font-bold transition bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md flex items-center gap-1"
                                    : "px-4 py-1.5 rounded-xl text-xs font-bold transition text-gray-400 hover:text-white flex items-center gap-1";
                            }
                        });
                    }

                    async function openAddLevelRoleModal(rewardType = 'text') {
                        const typeLabel = rewardType === 'voice' ? '������' : '�������';
                        const level = prompt('���� ��� ������� ' + typeLabel + ' ������� (����: 5 �� 10 �� 20):');
                        if (!level || isNaN(level)) return;
                        const roleId = prompt('���� ID ������ ��������:');
                        if (!roleId || !roleId.trim()) return;

                        try {
                            const res = await fetch('/api/guild/${guildId}/level-reward', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ level: parseInt(level), roleId: roleId.trim(), rewardType })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('? ��� ����� ���� ������� �����!');
                                location.reload();
                            } else {
                                alert('? ���: ' + (data.error || '��� �������'));
                            }
                        } catch(e) {
                            alert('��� ��� �� ������� �������');
                        }
                    }

                    async function openAddSharedRoleModal() {
                        const textLevel = prompt('���� ���� ������ ������� ������� (����: 10):');
                        if (!textLevel || isNaN(textLevel)) return;
                        const voiceLevel = prompt('���� ���� ������ ������� ������ (����: 5):');
                        if (!voiceLevel || isNaN(voiceLevel)) return;
                        const roleId = prompt('���� ID ������ �������� ��� ���� �������:');
                        if (!roleId || !roleId.trim()) return;

                        try {
                            const res = await fetch('/api/guild/${guildId}/level-reward', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ level: parseInt(textLevel), voiceLevel: parseInt(voiceLevel), roleId: roleId.trim(), rewardType: 'shared' })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('? ��� ����� ���� ����� ������� �����!');
                                location.reload();
                            } else {
                                alert('? ���: ' + (data.error || '��� �������'));
                            }
                        } catch(e) {
                            alert('��� ��� �� ������� �������');
                        }
                    }

                    async function deleteLevelRole(idOrLevel) {
                        if (!confirm('�� ��� ����� �� ��� ��� �����ɿ')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/level-reward/' + idOrLevel, {
                                method: 'DELETE'
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('? �� ����� �����!');
                                location.reload();
                            } else {
                                alert('? ��� �����');
                            }
                        } catch(e) {
                            alert('��� ��� �� �������');
                        }
                    }
                    </script>
`;
            } else if (section === 'moderation') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Master Header Card (Exact to Image 1: ������� & Action Buttons) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <div class="flex items-center gap-3">
                                <button type="button" onclick="clearAllServerWarnings()" class="px-4 py-2.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow">
                                    <span>???</span>
                                    <span>��� �� ���������</span>
                                </button>
                            </div>

                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">�������</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">������� ������� ���������</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-purple-700/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30">
                                    ???
                                </div>
                            </div>
                        </div>

                        <!-- 2. Triple Stats Badges (Exact to Image 1: ��� ������� / ��� ������� / ����� ������) -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <!-- ��� ������� -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(settings.mod_staff_roles ? settings.mod_staff_roles.split(',').filter(Boolean).length : 0)}</span>
                                <span class="text-xs font-bold text-gray-400 block">��� �������</span>
                            </div>
                            <!-- ��� ������� -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-emerald-400 font-mono">${(settings.mod_exempt_roles ? settings.mod_exempt_roles.split(',').filter(Boolean).length : 0)}</span>
                                <span class="text-xs font-bold text-gray-400 block">��� �������</span>
                            </div>
                            <!-- ����� ������ -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(settings.bad_words_list ? settings.bad_words_list.split(/[\n,]+/).filter(Boolean).length : 0)}</span>
                                <span class="text-xs font-bold text-gray-400 block">����� ������</span>
                            </div>
                        </div>

                        <!-- 3. Grid of 6 Moderation Feature Cards (Exact to Image 1) -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            
                            <!-- 1. ���� ��������� -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_warn_enabled" value="1" ${settings.mod_warn_enabled !== 0 ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-2 text-right">
                                    <h5 class="text-xs font-bold text-white">���� ���������</h5>
                                    <span class="text-amber-400">???</span>
                                </div>
                            </div>

                            <!-- 2. ���� ����� -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_mute_enabled" value="1" ${settings.mod_mute_enabled !== 0 ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-2 text-right">
                                    <h5 class="text-xs font-bold text-white">���� �����</h5>
                                    <span class="text-indigo-400">?</span>
                                </div>
                            </div>

                            <!-- 3. ������� �������� -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_badwords_enabled" value="1" ${settings.mod_badwords_enabled !== 0 ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-2 text-right">
                                    <h5 class="text-xs font-bold text-white">������� ��������</h5>
                                    <span class="text-rose-400">??</span>
                                </div>
                            </div>

                            <!-- 4. ���� �������� -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_mention_spam_enabled" value="1" ${settings.mod_mention_spam_enabled !== 0 ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-2 text-right">
                                    <h5 class="text-xs font-bold text-white">���� ��������</h5>
                                    <span class="text-pink-400">??</span>
                                </div>
                            </div>

                            <!-- 5. ���� ������ ������� -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_caps_enabled" value="1" ${settings.mod_caps_enabled ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-2 text-right">
                                    <h5 class="text-xs font-bold text-white">���� ������ �������</h5>
                                    <span class="text-blue-400">??</span>
                                </div>
                            </div>

                            <!-- 6. ���� ���������� -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_emoji_spam_enabled" value="1" ${settings.mod_emoji_spam_enabled ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-2 text-right">
                                    <h5 class="text-xs font-bold text-white">���� ����������</h5>
                                    <span class="text-amber-300">??</span>
                                </div>
                            </div>

                        </div>

                        <!-- 4. ����� ��� ������� ������ ��������� (Exact to Image 1) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-5 shadow-xl">
                            <div class="flex items-center justify-end gap-2 text-white font-black text-sm border-b border-white/5 pb-3">
                                <span>��� �������</span>
                                <span class="text-blue-400">??</span>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <!-- ��� �������� -->
                                <div class="space-y-1.5">
                                    <label class="block text-xs font-bold text-gray-300">��� ��������</label>
                                    ${renderRoleSelect('mod_staff_roles', settings.mod_staff_roles || '')}
                                </div>

                                <!-- ��� ������� -->
                                <div class="space-y-1.5">
                                    <label class="block text-xs font-bold text-gray-300">��� �������</label>
                                    ${renderRoleSelect('mod_exempt_roles', settings.mod_exempt_roles || '')}
                                </div>
                            </div>
                        </div>

                    </div>

                    <script>
                    async function clearAllServerWarnings() {
                        if (!confirm('�� ��� ����� �� ��� ���� ��������� ������� ����� ������� �� ��� ������ѿ')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/clear-all-warnings', {
                                method: 'POST'
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('? �� ��� ���� ��������� �����!');
                                location.reload();
                            } else {
                                alert('? ��� ��� ���������');
                            }
                        } catch(e) {
                            alert('��� ��� �� �������');
                        }
                    }
                    </script>
`;
            } else if (section === 'giveaways') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Master Header Card (Exact to Image 1: ���� ����� ���� & Action Button) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <button type="button" onclick="openCreateGiveawayModal()" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
                                <span>?</span>
                                <span>����� ��� ����</span>
                            </button>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">���� ����� ����</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">����� ������ ������� ����� ���� �� ������</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-purple-700/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30">
                                    ??
                                </div>
                            </div>
                        </div>

                        <!-- 2. Quad Stats Badges (Exact to Image 1: ������ ����� ���� / ���� ���� / ������ / ������ ���������) -->
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <!-- ������ ����� ���� -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(guildGiveawaysList || []).length}</span>
                                <span class="text-xs font-bold text-gray-400 block">������ ����� ����</span>
                            </div>
                            <!-- ���� ���� -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-emerald-400 font-mono">${(guildGiveawaysList || []).filter(g => g.status === 'active').length}</span>
                                <span class="text-xs font-bold text-gray-400 block">���� ����</span>
                            </div>
                            <!-- ������ -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(guildGiveawaysList || []).filter(g => g.status === 'ended').length}</span>
                                <span class="text-xs font-bold text-gray-400 block">������</span>
                            </div>
                            <!-- ������ ��������� -->
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-amber-400 font-mono">${(guildGiveawaysList || []).reduce((acc, g) => acc + ((g.entries ? (typeof g.entries === 'string' ? JSON.parse(g.entries || '[]').length : g.entries.length) : 0)), 0)}</span>
                                <span class="text-xs font-bold text-gray-400 block">������ ���������</span>
                            </div>
                        </div>

                        <!-- 3. Filter Bar & List / Empty State (Exact to Image 1) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-6 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-4">
                                <button type="button" onclick="location.reload()" class="p-2 bg-[#0b0d14] hover:bg-white/5 border border-white/5 text-gray-400 hover:text-white rounded-xl transition">
                                    ??
                                </button>
                                <div class="flex items-center gap-1.5 bg-[#0b0d14] p-1 rounded-xl border border-white/5 text-xs font-bold">
                                    <button type="button" onclick="filterGiveawayTab('ended')" id="btnGwEnded" class="px-3 py-1 rounded-lg text-gray-400 hover:text-white transition">�������� ${(guildGiveawaysList || []).filter(g => g.status === 'ended').length}</button>
                                    <button type="button" onclick="filterGiveawayTab('active')" id="btnGwActive" class="px-3 py-1 rounded-lg text-gray-400 hover:text-white transition">������ ${(guildGiveawaysList || []).filter(g => g.status === 'active').length}</button>
                                    <button type="button" onclick="filterGiveawayTab('all')" id="btnGwAll" class="px-3 py-1 rounded-lg bg-purple-700 text-white transition shadow">���� ${(guildGiveawaysList || []).length}</button>
                                </div>
                            </div>

                            <div id="giveawaysListContainer">
                                ${(guildGiveawaysList && guildGiveawaysList.length > 0) ? `
                                    <div class="space-y-3">
                                        ${guildGiveawaysList.map(g => {
                                            const entriesCount = g.entries ? (typeof g.entries === 'string' ? JSON.parse(g.entries || '[]').length : g.entries.length) : 0;
                                            return '<div class="bg-[#0b0d14] border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-purple-500/40 transition text-xs">' +
                                                '<div class="flex items-center gap-3">' +
                                                    '<span class="px-2 py-0.5 rounded text-[10px] font-bold ' + (g.status === 'active' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/30' : 'bg-white/5 text-gray-400') + '">' + (g.status === 'active' ? '��� ??' : '����� ??') + '</span>' +
                                                    '<span class="text-gray-400 font-mono">' + entriesCount + ' ����� ??</span>' +
                                                '</div>' +
                                                '<div class="text-right">' +
                                                    '<h5 class="font-bold text-white text-sm">' + g.prize + '</h5>' +
                                                    '<p class="text-[10px] text-gray-400">��������: ' + (g.winners_count || 1) + ' � ������: <#' + g.channel_id + '></p>' +
                                                '</div>' +
                                            '</div>';
                                        }).join('')}
                                    </div>
                                ` : `
                                    <div class="py-14 text-center space-y-4">
                                        <div class="w-16 h-16 rounded-2xl bg-orange-950/30 text-purple-400 flex items-center justify-center text-3xl mx-auto border border-purple-500/20 shadow-inner">
                                            ??
                                        </div>
                                        <div class="space-y-1">
                                            <h5 class="text-sm font-black text-white">�� ���� ��� ���� ���</h5>
                                            <p class="text-xs text-gray-400">���� ������ ��� ��� ���� �������!</p>
                                        </div>
                                        <button type="button" onclick="openCreateGiveawayModal()" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-2 shadow-lg shadow-purple-950/40">
                                            <span>����� ��� ����</span>
                                        </button>
                                    </div>
                                `}
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 4. ����� ����� ��� ���� ��������� ������� (Exact to Images 2 & 3 Modal) -->
                        <!-- ========================================================= -->
                        <div id="createGiveawayModal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
                            <div class="bg-[#12141f] border border-white/10 rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-5 text-right shadow-2xl" dir="rtl">
                                
                                <!-- Modal Header -->
                                <div class="flex items-center justify-between border-b border-white/5 pb-4">
                                    <button type="button" onclick="closeCreateGiveawayModal()" class="text-gray-400 hover:text-white text-lg font-bold">?</button>
                                    <div class="flex items-center gap-2.5">
                                        <div class="text-right">
                                            <h3 class="text-base font-black text-white">����� ��� ���� ����</h3>
                                            <p class="text-[10px] text-gray-400">���� �� ������ ����</p>
                                        </div>
                                        <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-sm shadow">
                                            ??
                                        </div>
                                    </div>
                                </div>

                                <!-- ��� ������� -->
                                <div class="space-y-1.5">
                                    <label class="block text-xs font-bold text-gray-300">������� <span class="text-purple-400">*</span></label>
                                    <input type="text" id="gwPrize" placeholder="����: Discord Nitro ���� ���" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>

                                <!-- ����� (�������) -->
                                <div class="space-y-1.5">
                                    <label class="block text-xs font-bold text-gray-300">����� (�������)</label>
                                    <textarea id="gwDesc" rows="2" placeholder="...��� ������ ������" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-500 rounded-xl p-3 text-xs text-white outline-none text-right leading-relaxed"></textarea>
                                </div>

                                <!-- ������ ��������� -->
                                <div class="space-y-1.5">
                                    <label class="block text-xs font-bold text-gray-300">������ <span class="text-purple-400">*</span></label>
                                    ${renderChannelSelect('gwChannel', '')}
                                </div>

                                <!-- ����� & ��� �������� -->
                                <div class="grid grid-cols-2 gap-4">
                                    <div class="space-y-1.5">
                                        <label class="block text-xs font-bold text-gray-300">��� ��������</label>
                                        <input type="number" id="gwWinners" value="1" min="1" max="50" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-center font-mono">
                                    </div>
                                    <div class="space-y-1.5">
                                        <label class="block text-xs font-bold text-gray-300">�����</label>
                                        <select id="gwDuration" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right cursor-pointer">
                                            <option value="10m">10 �����</option>
                                            <option value="1h">���� �����</option>
                                            <option value="6h">6 �����</option>
                                            <option value="12h">12 ����</option>
                                            <option value="24h" selected>��� ���� (24 ����)</option>
                                            <option value="3d">3 ����</option>
                                            <option value="7d">����� ����</option>
                                        </select>
                                    </div>
                                </div>

                                <!-- ������ (������ ��������� ���� ������) -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-2xl space-y-4">
                                    <span class="text-xs font-bold text-white block border-b border-white/5 pb-2">������</span>

                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <span class="text-lg">??</span>
                                            <input type="text" id="gwEmoji" value="??" class="w-16 bg-[#12141f] border border-white/5 rounded-xl px-2 py-1 text-xs text-center text-white font-mono outline-none">
                                        </div>
                                        <label class="text-xs font-bold text-gray-300">��������</label>
                                    </div>

                                    <!-- ����� ������ -->
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <input type="color" id="gwColorInput" value="#ef5700" class="w-6 h-6 rounded-md cursor-pointer bg-transparent border-0">
                                            <div class="flex items-center gap-1.5">
                                                <button type="button" onclick="setGwColor('#ef5700')" class="w-4 h-4 rounded-md bg-[#ef5700] ring-2 ring-white/50"></button>
                                                <button type="button" onclick="setGwColor('#9333ea')" class="w-4 h-4 rounded-md bg-[#9333ea]"></button>
                                                <button type="button" onclick="setGwColor('#10b981')" class="w-4 h-4 rounded-md bg-[#10b981]"></button>
                                                <button type="button" onclick="setGwColor('#3b82f6')" class="w-4 h-4 rounded-md bg-[#3b82f6]"></button>
                                                <button type="button" onclick="setGwColor('#8b5cf6')" class="w-4 h-4 rounded-md bg-[#8b5cf6]"></button>
                                                <button type="button" onclick="setGwColor('#ec4899')" class="w-4 h-4 rounded-md bg-[#ec4899]"></button>
                                                <button type="button" onclick="setGwColor('#ef4444')" class="w-4 h-4 rounded-md bg-[#ef4444]"></button>
                                                <button type="button" onclick="setGwColor('#ffffff')" class="w-4 h-4 rounded-md bg-[#ffffff]"></button>
                                                <button type="button" onclick="setGwColor('#000000')" class="w-4 h-4 rounded-md bg-[#000000]"></button>
                                            </div>
                                        </div>
                                        <label class="text-xs font-bold text-gray-300">��� ������</label>
                                    </div>

                                    <!-- ���� ����� ���� (��� ��� �� ������ ����� ���� �����) -->
                                    <div class="space-y-2 pt-2 border-t border-white/5">
                                        <div class="flex items-center justify-between">
                                            <button type="button" onclick="clearGwImage()" class="text-[11px] text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 cursor-pointer">
                                                <span>?</span><span>����� ������</span>
                                            </button>
                                            <label class="block text-xs font-bold text-gray-300">���� ����� ���� (�������)</label>
                                        </div>
                                        
                                        <div class="flex items-center gap-3 bg-[#12141f] p-3 rounded-2xl border border-white/5">
                                            <div class="w-16 h-16 rounded-xl border border-white/10 bg-[#0b0d14] overflow-hidden flex items-center justify-center shrink-0">
                                                <img id="prev_gwImage_box" src="" class="w-full h-full object-cover hidden">
                                                <span id="ph_gwImage" class="text-xl text-gray-600">???</span>
                                            </div>
                                            <div class="flex-1 space-y-1">
                                                <input type="hidden" id="gwImage" value="">
                                                <input type="file" id="file_gwImage" accept="image/*" class="hidden" onchange="uploadGwImageFile(this)">
                                                <button type="button" onclick="document.getElementById('file_gwImage').click()" class="w-full px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95">
                                                    <span>??</span><span id="btn_text_gwImage">������ ���� �� ������</span>
                                                </button>
                                                <p class="text-[10px] text-gray-400 text-right">���� ���� �� ����� ������ ���� ������ ��� ����</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- ��������� ������� -->
                                <div class="bg-[#0b0d14] border border-white/5 p-4 rounded-2xl space-y-4">
                                    <span class="text-xs font-bold text-white block border-b border-white/5 pb-2">��������� �������</span>

                                    <!-- ����� �������� -->
                                    <div class="space-y-1.5">
                                        <div class="flex items-center justify-between">
                                            <span class="text-[10px] text-purple-400 font-bold">����� ���� ������ ���</span>
                                            <label class="block text-xs font-bold text-gray-300">������ ������� ��� ��������� ��� (�������)</label>
                                        </div>
                                        ${renderRoleSelect('gwReqRole', '')}
                                        <p class="text-[10px] text-gray-500">��� ����� ���ɡ �� ����� �� ��� �� ���� ����� ��� ��� ��� ����� ��� ������ ���.</p>
                                    </div>

                                    <!-- ����� �������� & ��� ���� -->
                                    <div class="grid grid-cols-2 gap-3">
                                        <div class="space-y-1.5">
                                            <label class="block text-xs font-bold text-gray-300">��� ����</label>
                                            <select id="gwBtnStyle" class="w-full bg-[#12141f] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none text-right">
                                                <option value="Primary">?? ���� (Primary)</option>
                                                <option value="Success">?? ���� (Success)</option>
                                                <option value="Danger">?? ���� (Danger)</option>
                                                <option value="Secondary">? ����� (Secondary)</option>
                                            </select>
                                        </div>
                                        <div class="space-y-1.5">
                                            <label class="block text-xs font-bold text-gray-300">����� ��������</label>
                                            <select id="gwEntryMode" class="w-full bg-[#12141f] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none text-right">
                                                <option value="button">?? �� (Button)</option>
                                                <option value="reaction">?? ����� (Reaction)</option>
                                            </select>
                                        </div>
                                    </div>

                                    <!-- ����� �������� -->
                                    <div class="flex items-center justify-between pt-2 border-t border-white/5">
                                        <label class="toggle"><input type="checkbox" id="gwNotifyWinners" checked><span class="slider"></span></label>
                                        <div class="text-right">
                                            <h5 class="text-xs font-bold text-white">����� ��������</h5>
                                            <p class="text-[10px] text-gray-500">����� ����� ��� ������ ��������</p>
                                        </div>
                                    </div>
                                </div>

                                <!-- Modal Footer Buttons -->
                                <div class="flex items-center justify-between pt-4 border-t border-white/5 flex-row-reverse">
                                    <button type="button" onclick="submitCreateGiveaway()" class="px-8 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-purple-950/40">
                                        + ����� ��� ����
                                    </button>
                                    <button type="button" onclick="closeCreateGiveawayModal()" class="px-6 py-2.5 bg-[#0b0d14] hover:bg-white/5 border border-white/5 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition">
                                        �����
                                    </button>
                                </div>

                            </div>
                        </div>

                    </div>

                    <script>
                    function openCreateGiveawayModal() {
                        document.getElementById('createGiveawayModal').classList.remove('hidden');
                    }

                    function closeCreateGiveawayModal() {
                        document.getElementById('createGiveawayModal').classList.add('hidden');
                    }

                    function setGwColor(c) {
                        document.getElementById('gwColorInput').value = c;
                    }

                    function filterGiveawayTab(status) {
                        document.getElementById('btnGwAll').className = status === 'all' ? "px-3 py-1 rounded-lg bg-purple-700 text-white transition shadow" : "px-3 py-1 rounded-lg text-gray-400 hover:text-white transition";
                        document.getElementById('btnGwActive').className = status === 'active' ? "px-3 py-1 rounded-lg bg-purple-700 text-white transition shadow" : "px-3 py-1 rounded-lg text-gray-400 hover:text-white transition";
                        document.getElementById('btnGwEnded').className = status === 'ended' ? "px-3 py-1 rounded-lg bg-purple-700 text-white transition shadow" : "px-3 py-1 rounded-lg text-gray-400 hover:text-white transition";
                    }

                    async function submitCreateGiveaway() {
                        const prize = document.getElementById('gwPrize').value.trim();
                        const channelId = document.getElementById('gwChannel')?.value;
                        const duration = document.getElementById('gwDuration').value;
                        const winners = parseInt(document.getElementById('gwWinners').value) || 1;
                        const desc = document.getElementById('gwDesc').value.trim();
                        const color = document.getElementById('gwColorInput').value;
                        const image = document.getElementById('gwImage').value.trim();
                        const emoji = document.getElementById('gwEmoji').value.trim() || '??';
                        const reqRole = document.getElementById('gwReqRole')?.value;

                        if (!prize) { alert('���� ����� ��� �������'); return; }
                        if (!channelId) { alert('���� ������ ������ ���� ���� ��� ����� ���� ����'); return; }

                        try {
                            const res = await fetch('/api/guild/${guildId}/giveaways', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ prize, channelId, duration, winners, desc, color, image, emoji, reqRole })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('? �� ����� ���� ����� ���� �� ������� �����!');
                                location.reload();
                            } else {
                                alert('? ���: ' + (data.error || '��� ����� ����� ����'));
                            }
                        } catch(e) {
                            alert('��� ��� �� ������� �������');
                        }
                    }

                    async function uploadGwImageFile(input) {
                        var file = input.files && input.files[0];
                        if (!file) return;
                        if (!file.type.startsWith('image/')) {
                            alert('? ���� ������ ��� ���� ���� (PNG, JPG, WEBP, GIF)');
                            return;
                        }
                        if (file.size > 15 * 1024 * 1024) {
                            alert('? ��� ������ ���� ���� (���� �� 15 ��������)');
                            return;
                        }

                        // ������ ����� �����
                        var localUrl = URL.createObjectURL(file);
                        var boxImg = document.getElementById('prev_gwImage_box');
                        var ph = document.getElementById('ph_gwImage');
                        if (boxImg) { boxImg.src = localUrl; boxImg.classList.remove('hidden'); }
                        if (ph) ph.classList.add('hidden');
                        var hiddenInput = document.getElementById('gwImage');
                        if (hiddenInput) hiddenInput.value = localUrl;

                        var btnText = document.getElementById('btn_text_gwImage');
                        var origText = btnText ? btnText.innerText : '������ ���� �� ������';
                        if (btnText) btnText.innerText = '���� �����... ?';

                        var reader = new FileReader();
                        reader.onload = async function(e) {
                            try {
                                var res = await fetch('/api/guild/${guildId}/upload-image', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ imageBase64: e.target.result, fieldName: 'gwImage' })
                                });
                                var data = await res.json();
                                if (data.success && data.url) {
                                    if (hiddenInput) hiddenInput.value = data.url;
                                    if (boxImg) boxImg.src = data.url;
                                    if (btnText) btnText.innerText = '? �� �����';
                                    setTimeout(function() { if (btnText) btnText.innerText = origText; }, 2000);
                                    URL.revokeObjectURL(localUrl);
                                } else {
                                    alert('?? ����� ��� ������: ' + (data.error || '��� ��� �����'));
                                    if (btnText) btnText.innerText = origText;
                                }
                            } catch(err) {
                                alert('?? ��� �� ������� ����� ��� ������');
                                if (btnText) btnText.innerText = origText;
                            }
                        };
                        reader.readAsDataURL(file);
                    }

                    function clearGwImage() {
                        var hiddenInput = document.getElementById('gwImage');
                        if (hiddenInput) hiddenInput.value = '';
                        var fileInp = document.getElementById('file_gwImage');
                        if (fileInp) fileInp.value = '';
                        var boxImg = document.getElementById('prev_gwImage_box');
                        var ph = document.getElementById('ph_gwImage');
                        if (boxImg) { boxImg.src = ''; boxImg.classList.add('hidden'); }
                        if (ph) ph.classList.remove('hidden');
                    }

                    window.uploadGwImageFile = uploadGwImageFile;
                    window.clearGwImage = clearGwImage;
                    </script>
`;
            } else if (section === 'suggestions') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Master Header Card (Suggestions & Feedback) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <button type="button" onclick="openCreateSuggestionModal()" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-purple-950/40">
                                <span>?</span>
                                <span>����� ������ ����</span>
                            </button>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">���� ���������� ��������</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">��� ���� �������� ������� ������� ������ ����� ����������</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg border border-purple-500/30">
                                    ??
                                </div>
                            </div>
                        </div>

                        <!-- 2. Quad Stats Badges (������ ���������� / ��� �������� / ������ / ������) -->
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(guildSuggestionsList || []).length}</span>
                                <span class="text-xs font-bold text-gray-400 block">������ ����������</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-amber-400 font-mono">${(guildSuggestionsList || []).filter(s => s.status === 'pending').length}</span>
                                <span class="text-xs font-bold text-gray-400 block">��� ��������</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-emerald-400 font-mono">${(guildSuggestionsList || []).filter(s => s.status === 'accepted' || s.status === 'implemented').length}</span>
                                <span class="text-xs font-bold text-gray-400 block">������ / �����</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-rose-400 font-mono">${(guildSuggestionsList || []).filter(s => s.status === 'rejected').length}</span>
                                <span class="text-xs font-bold text-gray-400 block">������</span>
                            </div>
                        </div>

                        <!-- 3. ������� ���� ���������� �������� (���� ���������ʡ ��� �������ɡ ������ ���������) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <h4 class="text-xs font-black text-white border-b border-white/5 pb-3">������� ���� �������� ����������</h4>
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">���� ��� ���������� (Suggestions Channel)</label>
                                    ${renderChannelSelect('suggestions_channel', settings.suggestions_channel || '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">���� ����� ������� (Log Channel)</label>
                                    ${renderChannelSelect('suggestions_log_channel', settings.suggestions_log_channel || settings.log_channel || '')}
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">��� ������� �������� �� �������� (Staff Roles)</label>
                                    ${renderRoleSelect('suggestions_staff_roles', settings.suggestions_staff_roles || '')}
                                </div>
                                <div class="flex items-center justify-between p-3.5 bg-[#0b0d14] border border-white/5 rounded-xl mt-6">
                                    <label class="toggle"><input type="checkbox" name="suggestions_auto_thread" value="1" ${settings.suggestions_auto_thread !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">����� ��� ���� ������ (Thread)</h5>
                                        <p class="text-[10px] text-gray-500">��� ���� ��� �� ������ ������ ������� �� ������</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 4. ����� ����� ���������� ����� �������� (Live Suggestions List) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-6 shadow-xl">
                            <div class="flex items-center justify-between border-b border-white/5 pb-4">
                                <button type="button" onclick="location.reload()" class="p-2 bg-[#0b0d14] hover:bg-white/5 border border-white/5 text-gray-400 hover:text-white rounded-xl transition">
                                    ??
                                </button>
                                <div class="flex items-center gap-1.5 bg-[#0b0d14] p-1 rounded-xl border border-white/5 text-xs font-bold">
                                    <button type="button" onclick="filterSuggTab('rejected')" id="btnSgRejected" class="px-3 py-1 rounded-lg text-gray-400 hover:text-white transition">��������</button>
                                    <button type="button" onclick="filterSuggTab('accepted')" id="btnSgAccepted" class="px-3 py-1 rounded-lg text-gray-400 hover:text-white transition">��������</button>
                                    <button type="button" onclick="filterSuggTab('pending')" id="btnSgPending" class="px-3 py-1 rounded-lg text-gray-400 hover:text-white transition">��� ��������</button>
                                    <button type="button" onclick="filterSuggTab('all')" id="btnSgAll" class="px-3 py-1 rounded-lg bg-purple-600 text-white transition shadow">����</button>
                                </div>
                            </div>

                            <div id="suggestionsListContainer" class="space-y-4">
                                ${(guildSuggestionsList && guildSuggestionsList.length > 0) ? guildSuggestionsList.map(s => {
                                    let upCount = 0;
                                    let downCount = 0;
                                    try { upCount = JSON.parse(s.upvotes || '[]').length; } catch(e) {}
                                    try { downCount = JSON.parse(s.downvotes || '[]').length; } catch(e) {}

                                    let statusBadge = '<span class="px-2.5 py-0.5 bg-amber-950/60 text-amber-400 border border-amber-800/30 rounded-lg text-[10px] font-bold">? ��� ��������</span>';
                                    if (s.status === 'accepted') statusBadge = '<span class="px-2.5 py-0.5 bg-emerald-950/60 text-emerald-400 border border-emerald-800/30 rounded-lg text-[10px] font-bold">? �����</span>';
                                    if (s.status === 'implemented') statusBadge = '<span class="px-2.5 py-0.5 bg-indigo-950/60 text-indigo-400 border border-indigo-800/30 rounded-lg text-[10px] font-bold">?? �� �������</span>';
                                    if (s.status === 'rejected') statusBadge = '<span class="px-2.5 py-0.5 bg-rose-950/60 text-rose-400 border border-rose-800/30 rounded-lg text-[10px] font-bold">? �����</span>';

                                    return '<div class="bg-[#0b0d14] border border-white/5 p-5 rounded-2xl space-y-3 hover:border-purple-500/40 transition text-right">' +
                                        '<div class="flex items-center justify-between border-b border-white/5 pb-2">' +
                                            '<div class="flex items-center gap-2">' +
                                                '<button type="button" onclick="updateSuggestionStatus(' + s.id + ', &quot;accepted&quot;)" class="px-2.5 py-1 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/40 rounded-lg text-[10px] font-bold transition">���� ?</button>' +
                                                '<button type="button" onclick="updateSuggestionStatus(' + s.id + ', &quot;rejected&quot;)" class="px-2.5 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 rounded-lg text-[10px] font-bold transition">��� ?</button>' +
                                                '<button type="button" onclick="updateSuggestionStatus(' + s.id + ', &quot;implemented&quot;)" class="px-2.5 py-1 bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-400 border border-indigo-800/40 rounded-lg text-[10px] font-bold transition">����� ??</button>' +
                                            '</div>' +
                                            '<div class="flex items-center gap-2">' +
                                                statusBadge +
                                                '<span class="text-xs font-bold text-white font-mono">#' + s.id + '</span>' +
                                            '</div>' +
                                        '</div>' +
                                        '<div>' +
                                            (s.title ? '<h5 class="text-sm font-bold text-white mb-1">' + s.title + '</h5>' : '') +
                                            '<p class="text-xs text-gray-300 leading-relaxed">' + s.content + '</p>' +
                                        '</div>' +
                                        (s.status_reason ? '<div class="bg-[#12141f] p-3 rounded-xl border border-white/5 text-[11px] text-gray-400"><span class="text-white font-bold">�� �������: </span>' + s.status_reason + '</div>' : '') +
                                        '<div class="flex items-center justify-between text-[11px] text-gray-500 pt-2 border-t border-white/5">' +
                                            '<div class="flex items-center gap-3">' +
                                                '<span class="text-emerald-400 font-mono font-bold">?? ' + upCount + '</span>' +
                                                '<span class="text-rose-400 font-mono font-bold">?? ' + downCount + '</span>' +
                                            '</div>' +
                                            '<div class="flex items-center gap-2">' +
                                                '<span>���� ��������: <span class="font-mono text-purple-300">' + s.user_id + '</span></span>' +
                                                '<span>�</span>' +
                                                '<span>' + (s.category || '���') + '</span>' +
                                            '</div>' +
                                        '</div>' +
                                    '</div>';
                                }).join('') : `
                                    <div class="py-14 text-center space-y-4">
                                        <div class="w-16 h-16 rounded-2xl bg-purple-950/30 text-purple-400 flex items-center justify-center text-3xl mx-auto border border-purple-500/20 shadow-inner">
                                            ??
                                        </div>
                                        <div class="space-y-1">
                                            <h5 class="text-sm font-black text-white">�� ���� �������� ���</h5>
                                            <p class="text-xs text-gray-400">�� ��� �� ����� ���� ������ ������ �������!</p>
                                        </div>
                                        <button type="button" onclick="openCreateSuggestionModal()" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-2 shadow-lg shadow-purple-950/40">
                                            <span>����� ������</span>
                                        </button>
                                    </div>
                                `}
                            </div>
                        </div>

                        <!-- 5. ����� ����� ������ ������ (Create Suggestion Modal) -->
                        <div id="createSuggestionModal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
                            <div class="bg-[#12141f] border border-white/10 rounded-3xl w-full max-w-lg p-6 space-y-5 text-right shadow-2xl" dir="rtl">
                                <div class="flex items-center justify-between border-b border-white/5 pb-4">
                                    <button type="button" onclick="closeCreateSuggestionModal()" class="text-gray-400 hover:text-white text-lg font-bold">?</button>
                                    <h3 class="text-base font-black text-white">����� ������ ���� ??</h3>
                                </div>

                                <div class="space-y-3">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1.5">����� ������ (�������)</label>
                                        <input type="text" id="sgTitle" placeholder="���� ������� �������..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                    </div>

                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1.5">����� ��������</label>
                                        <select id="sgCategory" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right cursor-pointer">
                                            <option value="���">?? ������ ���</option>
                                            <option value="�������">?? ������� ��������</option>
                                            <option value="���">??? ��� ������</option>
                                            <option value="�����">?? ����� ������ �����</option>
                                            <option value="���">?? ����� �����</option>
                                            <option value="����">?? ���� �� ����</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1.5">������ �������� <span class="text-purple-400">*</span></label>
                                        <textarea id="sgContent" rows="4" placeholder="���� ����� �������� ���� ����� �������..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl p-3 text-xs text-white outline-none text-right leading-relaxed"></textarea>
                                    </div>
                                </div>

                                <div class="flex items-center justify-between pt-4 border-t border-white/5 flex-row-reverse">
                                    <button type="button" onclick="submitCreateSuggestion()" class="px-8 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-purple-950/40">
                                        ����� ��������
                                    </button>
                                    <button type="button" onclick="closeCreateSuggestionModal()" class="px-6 py-2.5 bg-[#0b0d14] hover:bg-white/5 border border-white/5 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition">
                                        �����
                                    </button>
                                </div>
                            </div>
                        </div>

                    </div>

                    <script>
                    function openCreateSuggestionModal() {
                        document.getElementById('createSuggestionModal').classList.remove('hidden');
                    }

                    function closeCreateSuggestionModal() {
                        document.getElementById('createSuggestionModal').classList.add('hidden');
                    }

                    async function submitCreateSuggestion() {
                        const title = document.getElementById('sgTitle').value.trim();
                        const category = document.getElementById('sgCategory').value;
                        const content = document.getElementById('sgContent').value.trim();

                        if (!content) { alert('���� ����� ������ ��������'); return; }

                        try {
                            const res = await fetch('/api/guild/${guildId}/suggestions', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ title, category, content })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('? �� ����� �������� ����� ����� �� �������!');
                                location.reload();
                            } else {
                                alert('? ���: ' + (data.error || '��� ����� ��������'));
                            }
                        } catch(e) {
                            alert('��� ��� �� �������');
                        }
                    }

                    async function updateSuggestionStatus(id, status) {
                        const reason = prompt('���� ��� �� �� ������� ��� ��� ������ (�������):');
                        try {
                            const res = await fetch('/api/guild/${guildId}/suggestions/' + id + '/status', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status, reason })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('? �� ����� ���� �������� �����!');
                                location.reload();
                            } else {
                                alert('? ��� ����� ������');
                            }
                        } catch(e) {
                            alert('��� ��� �� �������');
                        }
                    }

                    function filterSuggTab(status) {
                        // Switch active class
                        ['all', 'pending', 'accepted', 'rejected'].forEach(s => {
                            const btn = document.getElementById('btnSg' + s.charAt(0).toUpperCase() + s.slice(1));
                            if (btn) {
                                btn.className = s === status 
                                    ? "px-3 py-1 rounded-lg bg-purple-600 text-white transition shadow"
                                    : "px-3 py-1 rounded-lg text-gray-400 hover:text-white transition";
                            }
                        });
                        location.href = '/dashboard/${guildId}/suggestions?status=' + (status === 'all' ? '' : status);
                    }
                    </script>
`;
            } else if (section === 'antiraid') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Header -->
                        <div class="bg-gradient-to-r from-[#1a0a0a] via-[#12141f] to-[#141724] border border-red-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-2xl bg-red-600/20 text-red-400 border border-red-500/30 flex items-center justify-center text-xl shadow-lg">??</div>
                                <div class="text-right">
                                    <h3 class="font-black text-white text-lg">������ ����� �������� ��������</h3>
                                    <p class="text-gray-400 text-xs mt-0.5">��� ����� ������� ���� �������� ������� �������� ��������</p>
                                </div>
                            </div>
                            <div class="grid grid-cols-3 gap-3">
                                <div class="bg-[#0b0d14] border border-white/5 px-4 py-2 rounded-2xl text-center">
                                    <div class="text-xl font-black text-white">${settings.anti_alt_days || 3}</div>
                                    <div class="text-[10px] text-gray-400 font-bold mt-0.5">���� ������</div>
                                </div>
                                <div class="bg-[#0b0d14] border border-white/5 px-4 py-2 rounded-2xl text-center">
                                    <div class="text-xl font-black text-emerald-400">${settings.raid_threshold || 5}</div>
                                    <div class="text-[10px] text-gray-400 font-bold mt-0.5">�� �����</div>
                                </div>
                                <div class="bg-[#0b0d14] border border-white/5 px-4 py-2 rounded-2xl text-center">
                                    <div class="text-xl font-black ${settings.antiraid_enabled ? 'text-emerald-400' : 'text-red-400'}">${settings.antiraid_enabled ? '??' : '??'}</div>
                                    <div class="text-[10px] text-gray-400 font-bold mt-0.5">������</div>
                                </div>
                            </div>
                        </div>

                        <!-- Master Toggle -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-3xl flex items-center justify-between shadow-xl">
                            <label class="toggle">
                                <input type="checkbox" name="antiraid_enabled" value="1" ${settings.antiraid_enabled !== 0 ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-sm">����� ���� ������ ����� (Anti-Raid)</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">��� ���� ����� ������ ������� ��������� ������� �� ������� ��������</p>
                                </div>
                                <div class="w-8 h-8 rounded-xl bg-red-600/20 text-red-400 flex items-center justify-center text-sm border border-red-500/30">???</div>
                            </div>
                        </div>

                        <!-- Account Age & Raid Threshold Settings -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

                            <!-- Account Age Filter -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl">
                                <div class="flex items-center justify-between">
                                    <div class="w-8 h-8 rounded-xl bg-purple-700/20 text-purple-400 flex items-center justify-center text-sm border border-purple-500/30">???</div>
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">���� ������ ���� ������</h4>
                                        <p class="text-gray-400 text-[11px] mt-0.5">�������� ������� ����� �� ��� ����� �� ����� �� ������</p>
                                    </div>
                                </div>
                                <div class="grid grid-cols-4 gap-2">
                                    ${[0, 1, 3, 7, 14, 30, 60, 90].map(d => `
                                    <button type="button" onclick="selectAltDays(${d}, this)" class="alt-days-btn py-2 px-3 rounded-xl border text-xs font-bold transition ${(settings.anti_alt_days || 3) == d ? 'bg-purple-900/40 border-purple-500 text-white' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white'}">
                                        ${d === 0 ? '����' : d + ' ���'}
                                    </button>`).join('')}
                                </div>
                                <input type="hidden" name="anti_alt_days" id="inpAltDays" value="${settings.anti_alt_days || 3}">
                            </div>

                            <!-- Raid Threshold (Members / 10s) -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl">
                                <div class="flex items-center justify-between">
                                    <div class="w-8 h-8 rounded-xl bg-red-600/20 text-red-400 flex items-center justify-center text-sm border border-red-500/30">?</div>
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">�� ��� ����� �������</h4>
                                        <p class="text-gray-400 text-[11px] mt-0.5">��� ������� ����� ������ �� 10 ����� ������ ��� �����</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-4">
                                    <div class="flex-1">
                                        <input type="range" name="raid_threshold" id="raidSlider" min="3" max="30" step="1" value="${settings.raid_threshold || 5}" oninput="document.getElementById('raidThresholdNum').innerText = this.value" class="w-full accent-purple-600">
                                    </div>
                                    <div class="bg-[#0b0d14] border border-purple-500/40 text-purple-300 font-black text-lg font-mono px-4 py-2 rounded-xl min-w-[52px] text-center">
                                        <span id="raidThresholdNum">${settings.raid_threshold || 5}</span>
                                    </div>
                                </div>
                                <p class="text-[11px] text-gray-500 text-right">���� ��� ����� ���ѡ ���� ��� ������ ���� ������ �����</p>
                            </div>
                        </div>

                        <!-- Action & Options Row -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

                            <!-- Raid Action -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-3 shadow-xl">
                                <div class="flex items-center justify-between mb-2">
                                    <div class="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-sm border border-purple-500/30">??</div>
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">����� ������ �����</h4>
                                        <p class="text-gray-400 text-[11px] mt-0.5">������� �������� ��� ��� ��� �� ���� �����</p>
                                    </div>
                                </div>
                                <input type="hidden" name="antiraid_action" id="inpAntiraidAction" value="${settings.antiraid_action || 'kick'}">
                                <div class="grid grid-cols-3 gap-2">
                                    <button type="button" onclick="selectRaidAction('kick', this)" class="raid-action-btn py-3 rounded-2xl border text-xs font-bold transition ${(settings.antiraid_action || 'kick') === 'kick' ? 'bg-purple-900/40 border-purple-500 text-white' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white'}">
                                        ?? ���
                                    </button>
                                    <button type="button" onclick="selectRaidAction('ban', this)" class="raid-action-btn py-3 rounded-2xl border text-xs font-bold transition ${settings.antiraid_action === 'ban' ? 'bg-purple-900/40 border-purple-500 text-white' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white'}">
                                        ?? ���
                                    </button>
                                    <button type="button" onclick="selectRaidAction('timeout', this)" class="raid-action-btn py-3 rounded-2xl border text-xs font-bold transition ${settings.antiraid_action === 'timeout' ? 'bg-purple-900/40 border-purple-500 text-white' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white'}">
                                        ? ���
                                    </button>
                                </div>
                            </div>

                            <!-- Toggles: Anti-Bot & DM Notify & Log Channel -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-3 shadow-xl">
                                <h4 class="font-black text-white text-sm text-right border-b border-white/5 pb-3">������ ������</h4>
                                <div class="space-y-2.5">
                                    <div class="flex items-center justify-between p-3 bg-[#0b0d14] border border-white/5 rounded-xl">
                                        <label class="toggle"><input type="checkbox" name="anti_bot" value="1" ${settings.anti_bot ? 'checked' : ''}><span class="slider"></span></label>
                                        <div class="text-right">
                                            <h5 class="text-xs font-bold text-white">��� ����� ����� ����� (Anti-Bot)</h5>
                                            <p class="text-[10px] text-gray-500">����� ����� �� ����� ��� �� ���� ������ �� ������ ���</p>
                                        </div>
                                    </div>
                                    <div class="flex items-center justify-between p-3 bg-[#0b0d14] border border-white/5 rounded-xl">
                                        <label class="toggle"><input type="checkbox" name="antiraid_dm_notify" value="1" ${settings.antiraid_dm_notify !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                                        <div class="text-right">
                                            <h5 class="text-xs font-bold text-white">����� ������ ��� DM</h5>
                                            <p class="text-[10px] text-gray-500">����� ����� ��� ����� ������� ��� ��� �� ���</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Log Channel & Whitelist Roles -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-3 shadow-xl text-right">
                                <h4 class="font-black text-white text-sm">���� ����� ������ �����</h4>
                                <p class="text-gray-400 text-[11px]">����� ���� ������� �������� ���������� �������</p>
                                ${renderChannelSelect('antiraid_log_channel', settings.antiraid_log_channel)}
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-3 shadow-xl text-right">
                                <h4 class="font-black text-white text-sm">���� ������� �� ������� (Whitelist)</h4>
                                <p class="text-gray-400 text-[11px]">��� ������ �� ���� ����� ��� ������ �� �� �����</p>
                                ${renderRoleSelect('antiraid_whitelist_roles', settings.antiraid_whitelist_roles)}
                            </div>
                        </div>

                    </div>

                    <script>
                    function selectAltDays(days, btn) {
                        document.getElementById('inpAltDays').value = days;
                        document.querySelectorAll('.alt-days-btn').forEach(b => {
                            b.className = 'alt-days-btn py-2 px-3 rounded-xl border text-xs font-bold transition bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white';
                        });
                        btn.className = 'alt-days-btn py-2 px-3 rounded-xl border text-xs font-bold transition bg-purple-900/40 border-purple-500 text-white';
                    }
                    function selectRaidAction(action, btn) {
                        document.getElementById('inpAntiraidAction').value = action;
                        document.querySelectorAll('.raid-action-btn').forEach(b => {
                            b.className = 'raid-action-btn py-3 rounded-2xl border text-xs font-bold transition bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white';
                        });
                        btn.className = 'raid-action-btn py-3 rounded-2xl border text-xs font-bold transition bg-purple-900/40 border-purple-500 text-white';
                    }
                    </script>`;
            } else if (section === 'tempvoice') {
                const activeTempVoices = (rawDb ? rawDb.prepare('SELECT * FROM temp_voices WHERE guild_id = ?').all(guildId) : []) || [];

                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <!-- Header Banner -->
                        <div class="bg-gradient-to-r from-[#1a132e] via-[#12141f] to-[#1a132e] border border-purple-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
                            <label class="toggle"><input type="checkbox" name="temp_voice_enabled" value="1" ${settings.temp_voice_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-xl flex items-center gap-2 justify-end"><span>������� ������� ������� (Temp Voice)</span><span>???</span></h4>
                                    <p class="text-gray-400 text-xs mt-0.5">����� ��� ����� ���� �������� ��� ���� ������� ������ ��� ������</p>
                                </div>
                                <div class="w-10 h-10 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-xl border border-purple-500/30">??</div>
                            </div>
                        </div>

                        <!-- Quick Stats -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
                                <div class="text-2xl font-black text-purple-400 font-mono">${activeTempVoices.length}</div>
                                <div class="text-xs text-gray-400 font-bold mt-1">������� ������� ������ ������</div>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
                                <div class="text-2xl font-black text-emerald-400 font-mono">${settings.temp_voice_channel ? '���� ?' : '��� ����'}</div>
                                <div class="text-xs text-gray-400 font-bold mt-1">���� ��� ������� (Join-to-Create)</div>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
                                <div class="text-2xl font-black text-white font-mono">${settings.temp_voice_user_limit || '��� �����'}</div>
                                <div class="text-xs text-gray-400 font-bold mt-1">���� ������ ���������</div>
                            </div>
                        </div>

                        <!-- Settings Form -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl">
                            <h4 class="text-sm font-black text-white border-b border-white/5 pb-3 flex items-center gap-2 justify-end">
                                <span>������� ����� ������� �����������</span>
                                <span>??</span>
                            </h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">��� ������ ������� (Join-to-Create Channel)</label>
                                    ${renderChannelSelect('temp_voice_channel', settings.temp_voice_channel || '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">��� ������� ������� (Category ID)</label>
                                    <input type="text" name="temp_voice_category" value="${settings.temp_voice_category || ''}" placeholder="���� ���������� ���� ����� ���� �������..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">����� ��������� ����� ������</label>
                                    <input type="text" name="temp_voice_name_template" value="${settings.temp_voice_name_template || '?? | {username}'}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-mono">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">���� ������ ���������� ���������</label>
                                    <input type="number" name="temp_voice_user_limit" value="${settings.temp_voice_user_limit || 0}" placeholder="0 = ��� �����" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                            </div>
                        </div>

                        <!-- Active Temp Channels Table -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-3 shadow-xl">
                            <h4 class="text-sm font-black text-white flex items-center justify-between pb-3 border-b border-white/5">
                                <span class="text-xs text-purple-400 font-bold">${activeTempVoices.length} ��� ���</span>
                                <span class="flex items-center gap-2"><span>������� ������� ������� ����</span><span>???</span></span>
                            </h4>
                            ${activeTempVoices.length === 0 ? `
                                <p class="text-center py-6 text-gray-500 text-xs font-bold">�� ���� �� ����� ����� ����� ������ ������ ��������</p>
                            ` : activeTempVoices.map(tv => `
                                <div class="bg-[#0b0d14] p-3 rounded-2xl border border-white/5 flex items-center justify-between">
                                    <span class="text-xs text-gray-500 font-mono">ID: ${tv.channel_id}</span>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-white block">���� �����: <@${tv.owner_id}></span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>`;
            } else if (section === 'colors') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <label class="toggle"><input type="checkbox" name="colors_enabled" value="1" ${settings.colors_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">���� ��� ������� ������� (Color Roles)</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">���� ������ ������� ������ ������� �� ������ ������� �������</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-pink-600/20 text-pink-400 flex items-center justify-center text-lg border border-pink-500/30">??</div>
                            </div>
                        </div>

                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <h4 class="text-xs font-black text-white border-b border-white/5 pb-3">������� ��� ���� �������</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">���� ���� �������</label>
                                    ${renderChannelSelect('color_picker_channel', settings.color_picker_channel || '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">������ �������� ������� ������� (�������)</label>
                                    ${renderRoleSelect('colors_required_role', settings.colors_required_role || '')}
                                </div>
                            </div>
                            <div class="pt-2">
                                <label class="block text-xs font-bold text-gray-300 mb-2">��� ������� ������� (Role IDs ������ ������)</label>
                                <textarea name="color_role_ids" rows="3" placeholder="����_����_1, ����_����_2, ����_����_3..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl p-3 text-xs text-white outline-none font-mono text-right leading-relaxed">${settings.color_role_ids || ''}</textarea>
                            </div>
                        </div>
                    </div>`;
            } else if (section === 'boost') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <label class="toggle"><input type="checkbox" name="boost_msg_enabled" value="1" ${settings.boost_msg_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">���� ������� �������� ������ (Server Boost)</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">������� ������� �� ����� ���� �������� ������ ����� ���������</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-pink-600/20 text-pink-400 flex items-center justify-center text-lg border border-pink-500/30">??</div>
                            </div>
                        </div>

                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-2xl space-y-4 shadow-xl">
                            <h4 class="text-xs font-black text-white border-b border-white/5 pb-3">������� ����� ������</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">���� ������� ������</label>
                                    ${renderChannelSelect('boost_channel', settings.boost_channel || '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">���� ������ ������� ���������</label>
                                    ${renderRoleSelect('booster_reward_role', settings.booster_reward_role || '')}
                                </div>
                            </div>
                            <div class="pt-2">
                                <label class="block text-xs font-bold text-gray-300 mb-2">�� ����� ������ (���� {user} � {count})</label>
                                <textarea name="boost_message" rows="3" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl p-3 text-xs text-white outline-none text-right leading-relaxed">${settings.boost_message || '����� �� {user} ��� ����� ������� ??! ���� ��� �������� ���� {count} ����!'}</textarea>
                            </div>
                        </div>
                    </div>`;
            } else if (section === 'logs') {
                const logsConfig = (function() {
                    try {
                        return settings.logs_config ? (typeof settings.logs_config === 'string' ? JSON.parse(settings.logs_config) : settings.logs_config) : {};
                    } catch(e) { return {}; }
                })();

                formFieldsHtml = `
                    <input type="hidden" name="logs_config" id="hidden_logs_config" value="">

                    <!-- Toast Notification Container -->
                    <div id="logs-toast-container" class="fixed top-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none w-full max-w-md px-4"></div>

                    <!-- Confirmation Modal -->
                    <div id="logs-confirm-modal" class="hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
                        <div class="bg-[#121620] border border-[#1e2638] rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl text-right" dir="rtl">
                            <div class="flex items-center gap-3 mb-4">
                                <div class="w-10 h-10 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center shrink-0">
                                    <i class="fa-solid fa-triangle-exclamation"></i>
                                </div>
                                <h3 class="text-lg font-bold text-white">����� �������</h3>
                            </div>
                            <p id="logs-confirm-msg" class="text-sm text-gray-300 mb-6"></p>
                            <div class="flex gap-3 justify-start">
                                <button type="button" id="logs-confirm-ok" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition flex items-center gap-2 cursor-pointer">
                                    <span>�����</span>
                                </button>
                                <button type="button" id="logs-confirm-cancel" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-bold transition cursor-pointer">
                                    �����
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Top Logs Action Bar -->
                    <div class="bg-[#121620]/90 backdrop-blur-md border border-[#1e2638] rounded-2xl px-5 py-3 flex items-center justify-between gap-4 shadow-xl mb-2" dir="rtl">
                        <div class="flex items-center gap-3">
                            <button type="button" id="logs-btn-undo" class="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition cursor-pointer disabled:opacity-40" disabled title="������� �� ��� �����">
                                <i class="fa-solid fa-rotate-left text-xs"></i>
                                <span class="text-xs font-bold">�����</span>
                            </button>
                            <div class="h-4 w-px bg-gray-700"></div>
                            <button type="button" id="logs-btn-export" class="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition cursor-pointer" title="����� ������� �������">
                                <i class="fa-solid fa-download text-xs"></i>
                                <span class="text-xs font-bold">�����</span>
                            </button>
                            <div class="h-4 w-px bg-gray-700"></div>
                            <button type="button" id="logs-btn-theme" class="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition cursor-pointer" title="����� ������">
                                <i class="fa-solid fa-moon text-xs"></i>
                                <span class="text-xs font-bold">����</span>
                            </button>
                        </div>
                        <div class="flex items-center gap-2 text-xs text-gray-500">
                            <i class="fa-solid fa-shield-halved text-violet-400"></i>
                            <span>������� ������� �������</span>
                        </div>
                    </div>

                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Global Master Logs Header Card -->
                        <div class="bg-[#121620] border border-[#1e2638] rounded-2xl p-6 shadow-xl relative overflow-hidden">
                            <div class="absolute top-0 right-0 w-32 h-32 bg-violet-600/10 rounded-full blur-3xl pointer-events-none"></div>
                            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div class="space-y-1">
                                    <div class="flex items-center gap-3">
                                        <div class="p-2.5 bg-violet-500/10 text-violet-400 rounded-xl">
                                            <i class="fa-solid fa-book-bookmark text-xl"></i>
                                        </div>
                                        <h1 class="text-2xl font-black text-white">����� ������� �������</h1>
                                    </div>
                                    <p class="text-sm text-gray-400 pr-11">��� ����� �� ��������� ������ ������ �� ����� ��������� ������ ���� ����� �����.</p>
                                </div>
                                <label class="toggle relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="logsMasterToggle" name="logs_enabled" value="1" ${settings.logs_enabled !== 0 ? 'checked' : ''} onchange="window.saveLogsSetting('logs_enabled', this.checked)">
                                    <span class="slider"></span>
                                </label>
                            </div>

                            <!-- Sub Logs Section Switcher Card -->
                            <div class="mt-6 bg-[#0b0e14] border border-[#1e2638] rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                                        <i class="fa-solid fa-shield-halved text-lg"></i>
                                    </div>
                                    <div>
                                        <h3 class="font-bold text-white text-base">�������</h3>
                                        <p class="text-xs text-gray-400">���� ���� ������� �� ������� �� ������ ��������� ������</p>
                                    </div>
                                </div>
                                <label class="toggle relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="sub-logs-switch" ${settings.logs_enabled !== 0 ? 'checked' : ''} onchange="window.saveLogsSetting('logs_enabled', this.checked); document.getElementById('logsMasterToggle').checked = this.checked;">
                                    <span class="slider"></span>
                                </label>
                            </div>

                            <!-- Master Stats and Controls Bar -->
                            <div class="mt-6 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[#1e2638]">
                                <div class="flex items-center gap-2">
                                    <button type="button" onclick="window.toggleAllLogsGlobally(false)" class="px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer">
                                        <i class="fa-solid fa-xmark"></i>
                                        <span>����� ���� (�� �������)</span>
                                    </button>
                                    <button type="button" onclick="window.toggleAllLogsGlobally(true)" class="px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer">
                                        <i class="fa-solid fa-check"></i>
                                        <span>����� ���� (�� �������)</span>
                                    </button>
                                </div>

                                <div class="flex flex-wrap items-center gap-3 text-xs">
                                    <span class="px-3 py-1.5 bg-[#1e2638] rounded-xl text-gray-300 font-medium flex items-center gap-1.5">
                                        <i class="fa-solid fa-network-wired text-purple-400"></i>
                                        <span id="statChannelsUsed">0</span>
                                        <span>������� ���������</span>
                                    </span>
                                    <span class="px-3 py-1.5 bg-[#1e2638] rounded-xl text-gray-300 font-medium flex items-center gap-1.5">
                                        <i class="fa-solid fa-folder-tree text-amber-400"></i>
                                        <span>13 �������</span>
                                    </span>
                                    <span class="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl font-medium flex items-center gap-1.5">
                                        <i class="fa-solid fa-circle-check"></i>
                                        <span id="statEnabledLogs">0</span>
                                        <span>������� �������</span>
                                    </span>
                                    <span class="px-3 py-1.5 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-xl font-medium flex items-center gap-1.5">
                                        <i class="fa-solid fa-bars-progress"></i>
                                        <span>105 ������ �������</span>
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- Auto Setup Channels Card -->
                        <div class="bg-[#121620] border border-[#1e2638] rounded-2xl p-6 shadow-xl">
                            <div class="flex items-center justify-between mb-4">
                                <div class="flex items-center gap-2">
                                    <i class="fa-solid fa-gear text-violet-400"></i>
                                    <h2 class="font-bold text-white text-base">����� ������ �������</h2>
                                </div>
                                <span class="text-xs text-gray-400">����� ����� ������� �������� ����� ������� ����� �����</span>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <!-- Normal Channels Setup -->
                                <button type="button" onclick="window.autoSetupLogsChannels('grouped')" class="group bg-[#0b0e14] hover:bg-[#181e2c] border border-[#1e2638] hover:border-violet-500/50 rounded-xl p-4 text-right transition flex flex-col justify-between gap-3 relative overflow-hidden cursor-pointer">
                                    <div class="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/15 transition"></div>
                                    <div class="flex items-center justify-between w-full">
                                        <div class="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center group-hover:scale-110 transition">
                                            <i class="fa-solid fa-thumbtack"></i>
                                        </div>
                                        <span class="text-xs font-semibold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-lg">����</span>
                                    </div>
                                    <div>
                                        <h3 class="font-bold text-white text-sm">����� ����� �����</h3>
                                        <p class="text-xs text-gray-400 mt-1">���� ����� ��� ��� (������ ����� �����...) � ����� ����� ���������</p>
                                    </div>
                                </button>

                                <!-- Detailed Channels Setup -->
                                <button type="button" onclick="window.autoSetupLogsChannels('detailed')" class="group bg-[#0b0e14] hover:bg-[#181e2c] border border-[#1e2638] hover:border-violet-500/50 rounded-xl p-4 text-right transition flex flex-col justify-between gap-3 relative overflow-hidden cursor-pointer">
                                    <div class="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-xl group-hover:bg-purple-500/15 transition"></div>
                                    <div class="flex items-center justify-between w-full">
                                        <div class="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center group-hover:scale-110 transition">
                                            <i class="fa-solid fa-folder-open"></i>
                                        </div>
                                        <span class="text-xs font-semibold text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-lg">�����</span>
                                    </div>
                                    <div>
                                        <h3 class="font-bold text-white text-sm">����� ����� �����</h3>
                                        <p class="text-xs text-gray-400 mt-1">���� ������ ��� ��� ��� � ��������� ������� ���� ����� ����� ����</p>
                                    </div>
                                </button>

                                <!-- Delete Channels Setup -->
                                <button type="button" onclick="window.deleteLogsChannels()" class="group bg-[#0b0e14] hover:bg-red-500/10 border border-[#1e2638] hover:border-red-500/40 rounded-xl p-4 text-right transition flex flex-col justify-between gap-3 relative overflow-hidden cursor-pointer">
                                    <div class="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-xl group-hover:bg-red-500/15 transition"></div>
                                    <div class="flex items-center justify-between w-full">
                                        <div class="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center group-hover:scale-110 transition">
                                            <i class="fa-solid fa-trash-can"></i>
                                        </div>
                                        <span class="text-xs font-semibold text-red-400 bg-red-500/10 px-2.5 py-1 rounded-lg">�����</span>
                                    </div>
                                    <div>
                                        <h3 class="font-bold text-white text-sm">��� ����� �������</h3>
                                        <p class="text-xs text-gray-400 mt-1">��� �������� ZENO Server Logs ����� ������� ������ ������ �������</p>
                                    </div>
                                </button>
                            </div>
                        </div>

                        <!-- Search and Filter Bar -->
                        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#121620] border border-[#1e2638] p-4 rounded-2xl">
                            <!-- Filter Tabs -->
                            <div class="flex items-center gap-1.5 bg-[#0b0e14] p-1.5 rounded-xl border border-[#1e2638] w-full sm:w-auto">
                                <button type="button" id="btnLogFilterDisabled" onclick="window.filterLogsByStatus('disabled')" class="filter-tab px-4 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer">�������</button>
                                <button type="button" id="btnLogFilterEnabled" onclick="window.filterLogsByStatus('enabled')" class="filter-tab px-4 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer">�������</button>
                                <button type="button" id="btnLogFilterAll" onclick="window.filterLogsByStatus('all')" class="filter-tab px-4 py-2 rounded-lg text-xs font-bold bg-violet-600 text-white shadow-md transition cursor-pointer">����</button>
                            </div>

                            <!-- Search Bar -->
                            <div class="relative w-full sm:w-72">
                                <span class="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-gray-400">
                                    <i class="fa-solid fa-magnifying-glass text-sm"></i>
                                </span>
                                <input type="text" id="logSearchInput" placeholder="���� �� ���..." oninput="window.searchLogsItems()" class="w-full bg-[#0b0e14] border border-[#1e2638] rounded-xl py-2.5 pr-10 pl-4 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition">
                            </div>
                        </div>

                        <!-- Main Two-Column View: Categories Sidebar + Active Category Content -->
                        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">

                            <!-- Sidebar: 13 Categories -->
                            <div class="lg:col-span-1 space-y-1 bg-[#121620] border border-[#1e2638] p-3 rounded-2xl shadow-xl h-fit">
                                <button type="button" onclick="window.toggleLogsCategoriesDropdown()" class="w-full flex items-center justify-between text-xs font-black text-white px-2 py-2 border-b border-[#1e2638] mb-1 cursor-pointer hover:text-violet-300 transition">
                                    <i id="logsCategoriesDropdownArrow" class="fa-solid fa-chevron-down text-gray-400 text-xs"></i>
                                    <span class="flex items-center gap-2">
                                        <span>������� (13 ���)</span>
                                        <i class="fa-solid fa-folder text-amber-400"></i>
                                    </span>
                                </button>
                                <div id="logsCategoriesList" class="space-y-1 transition-all"></div>
                            </div>

                            <!-- Right Display Area: Active Category Header + Section Default Channel/Color + Logs Grid -->
                            <div class="lg:col-span-3 space-y-6">

                                <!-- Active Category Card Header -->
                                <div class="bg-[#121620] border border-[#1e2638] rounded-2xl p-6 shadow-xl space-y-6">
                                    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                        <div class="flex items-center gap-3.5">
                                            <div id="activeCatIconBox" class="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-600/20 border border-pink-500/30 text-pink-400 flex items-center justify-center shadow-lg text-xl">
                                                <span id="activeCatIcon">??</span>
                                            </div>
                                            <div>
                                                <h2 id="activeCatTitle" class="text-lg font-black text-white">�������</h2>
                                                <span id="activeCatCount" class="text-xs text-gray-400">17 ���</span>
                                            </div>
                                        </div>

                                        <!-- Category Actions: Enable All / Disable All -->
                                        <div class="flex items-center gap-2">
                                            <button type="button" onclick="window.toggleActiveCategoryLogs(false)" class="px-3.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer">
                                                <i class="fa-solid fa-xmark"></i>
                                                <span>����� ����</span>
                                            </button>
                                            <button type="button" onclick="window.toggleActiveCategoryLogs(true)" class="px-3.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer">
                                                <i class="fa-solid fa-check"></i>
                                                <span>����� ����</span>
                                            </button>
                                        </div>
                                    </div>

                                    <!-- Section Settings Form Block -->
                                    <div class="bg-[#0b0e14] border border-[#1e2638] rounded-2xl p-5 space-y-5">
                                        <div class="flex items-center justify-between border-b border-[#1e2638] pb-3">
                                            <div class="flex items-center gap-2 text-white font-bold text-sm">
                                                <i class="fa-solid fa-gear text-violet-400"></i>
                                                <span>������� �����</span>
                                            </div>
                                            <span class="text-xs text-gray-500">��� ��� ��������� ��� ���� ������� ������� ������</span>
                                        </div>

                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <!-- Default Channel Dropdown -->
                                            <div class="space-y-2">
                                                <label class="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                                                    <i class="fa-solid fa-bullhorn text-pink-400 text-sm"></i>
                                                    <span>������ ����������</span>
                                                </label>
                                                <div class="relative">
                                                    ${renderChannelSelect('catDefaultChannel', settings.log_channel_members || settings.log_channel || '')}
                                                </div>
                                            </div>

                                            <!-- Default Color Picker Input -->
                                            <div class="space-y-2">
                                                <label class="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                                                    <i class="fa-solid fa-palette text-pink-400 text-sm"></i>
                                                    <span>����� ���������</span>
                                                </label>
                                                <div class="flex items-center gap-3">
                                                    <div class="relative w-10 h-10 rounded-xl overflow-hidden border border-[#1e2638] cursor-pointer shrink-0">
                                                        <input type="color" id="catColorPicker" value="#5865F2" class="absolute -top-2 -right-2 w-16 h-16 cursor-pointer opacity-0" onchange="document.getElementById('catColorHex').value = this.value; document.getElementById('catColorPreviewBox').style.backgroundColor = this.value;">
                                                        <div id="catColorPreviewBox" class="w-full h-full bg-[#5865F2]"></div>
                                                    </div>
                                                    <input type="text" id="catColorHex" value="#5865F2" class="w-full bg-[#121620] border border-[#1e2638] focus:border-violet-500 rounded-xl py-2.5 px-3.5 text-xs text-white font-mono focus:outline-none transition" dir="ltr" onchange="document.getElementById('catColorPicker').value = this.value; document.getElementById('catColorPreviewBox').style.backgroundColor = this.value;">
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Apply to All Enabled Logs Button -->
                                        <div class="pt-2">
                                            <button type="button" onclick="window.applyCatSettingsToAll()" class="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-violet-600/20 transition flex items-center justify-center gap-2 cursor-pointer">
                                                <i class="fa-solid fa-wand-magic-sparkles"></i>
                                                <span>����� ��� ���� ������� �������</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <!-- Logs Cards 2-Column Grid -->
                                <div id="logsCardsGrid" class="grid grid-cols-1 md:grid-cols-2 gap-3"></div>

                            </div>
                        </div>

                    </div>

                    <!-- Individual Log Edit Modal -->
                    <div id="editLogModal" class="fixed inset-0 bg-black/80 backdrop-blur-md z-50 hidden flex items-center justify-center p-4">
                        <div class="bg-[#121620] border border-[#1e2638] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl text-right" dir="rtl">
                            <div class="flex items-center justify-between border-b border-[#1e2638] pb-3">
                                <button type="button" onclick="window.closeEditLogModal()" class="text-gray-400 hover:text-white text-lg font-bold">?</button>
                                <div class="flex items-center gap-2">
                                    <h5 class="text-white font-black text-sm" id="modalLogTitle">����� �����</h5>
                                    <span id="modalLogIcon" class="text-base">??</span>
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-1.5 flex items-center gap-1.5">
                                    <i class="fa-solid fa-bullhorn text-violet-400 text-xs"></i>
                                    <span>������ ������� ���� �����</span>
                                </label>
                                ${renderChannelSelect('modalLogChannel', '')}
                                <p class="text-[10px] text-gray-500 mt-1">������ ����� �������� ������ ���������� �����</p>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-1.5 flex items-center gap-1.5">
                                    <i class="fa-solid fa-palette text-violet-400 text-xs"></i>
                                    <span>��� ������� (Hex Color)</span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <div class="relative w-10 h-10 rounded-xl overflow-hidden border border-[#1e2638] cursor-pointer shrink-0">
                                        <input type="color" id="modalLogColorPicker" value="#5865F2" class="absolute -top-2 -right-2 w-16 h-16 cursor-pointer opacity-0" onchange="document.getElementById('modalLogColorHex').value = this.value; document.getElementById('modalColorPreviewBox').style.backgroundColor = this.value;">
                                        <div id="modalColorPreviewBox" class="w-full h-full bg-[#5865F2]"></div>
                                    </div>
                                    <input type="text" id="modalLogColorHex" value="#5865F2" class="w-full bg-[#0b0e14] border border-[#1e2638] focus:border-violet-500 rounded-xl py-2 px-3 text-xs text-white font-mono outline-none text-center" dir="ltr" onchange="document.getElementById('modalLogColorPicker').value = this.value; document.getElementById('modalColorPreviewBox').style.backgroundColor = this.value;">
                                </div>
                            </div>

                            <div class="flex items-center justify-end gap-2 pt-3 border-t border-[#1e2638]">
                                <button type="button" onclick="window.closeEditLogModal()" class="px-4 py-2 bg-[#1e2638] hover:bg-[#28324a] text-gray-300 rounded-xl text-xs font-bold transition">�����</button>
                                <button type="button" onclick="window.saveModalLogConfig()" class="px-5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2">
                                    <i class="fa-solid fa-floppy-disk"></i>
                                    <span>��� ���������</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Bottom Sticky Save Bar -->
                    <div class="sticky bottom-0 z-40 bg-[#121620]/95 backdrop-blur-md border-t border-[#1e2638] p-4 mt-4 rounded-2xl shadow-2xl" dir="rtl">
                        <div class="flex items-center justify-between gap-4">
                            <div class="flex items-center gap-2 text-xs text-gray-400">
                                <i class="fa-solid fa-shield-check text-emerald-400"></i>
                                <span>��������� ����� �������� �� ����� ��������</span>
                            </div>
                            <button type="button" id="logs-btn-save" onclick="window.saveLogsConfigToServer(null, '? �� ��� ���� ��������� �� ����� ��������')" class="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-violet-600/20 transition flex items-center gap-2 cursor-pointer">
                                <i class="fa-solid fa-floppy-disk"></i>
                                <span>��� ���������</span>
                            </button>
                        </div>
                    </div>
                `;

                // Scripts MUST be outside the <form> tag to execute in modern browsers
                embedScriptHtml = `
// ===== ZENO LOGS SCRIPT - FULL REWRITE =====
// =============================================

// ---- Server-injected state ----
var _logsGuildId = '${guildId}';
var logsState = ${JSON.stringify((() => { try { const raw = settings.logs_config; const parsed = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {}; return (parsed && typeof parsed === 'object') ? parsed : {}; } catch(e) { return {}; } })())};
var categoryChannels = ${JSON.stringify({
    members: settings.log_channel_members || settings.log_channel || '',
    roles: settings.log_channel_roles || settings.log_channel || '',
    channels: settings.log_channel_channels || settings.log_channel || '',
    messages: settings.log_channel_messages || settings.log_channel || '',
    voice: settings.log_channel_voice || settings.log_channel || '',
    moderation: settings.log_channel_moderation || settings.log_channel || '',
    server: settings.log_channel_server || settings.log_channel || '',
    invites: settings.log_channel_invites || settings.log_channel || '',
    emojis: settings.log_channel_emojis || settings.log_channel || '',
    events: settings.log_channel_events || settings.log_channel || '',
    integrations: settings.log_channel_integrations || settings.log_channel || '',
    automod: settings.log_channel_automod || settings.log_channel || '',
    stage: settings.log_channel_stage || settings.log_channel || ''
})};

// ---- UI state ----
var currentCategory = 'members';
var currentFilter = 'all';
var currentEditModalLogId = null;
var logsHistory = [];
var logsConfirmCallback = null;

// ---- LOG_CATEGORIES (defined FIRST so all functions below can use it) ----
var LOG_CATEGORIES = {
    members: {
        title: '�������', icon: '??', desc: '����� ���� ����� ���� ������� �������', defaultColor: '#5865F2',
        items: [
            { id: 'member_join', title: '���� ���', desc: '��� ���� ��� ���� �������', icon: '??' },
            { id: 'member_leave', title: '���� ���', desc: '��� ���� ��� �� �������', icon: '??' },
            { id: 'member_ban', title: '��� ���', desc: '��� ��� ��� �� �������', icon: '??' },
            { id: 'member_unban', title: '�� ��� ���', desc: '��� �� ��� ���', icon: '??' },
            { id: 'member_kick', title: '��� ���', desc: '��� ��� ��� �� �������', icon: '??' },
            { id: 'member_prison', title: '��� ���', desc: '��� ��� ���', icon: '??' },
            { id: 'member_unprison', title: '����� �� �����', desc: '��� ����� ��� �� �����', icon: '??' },
            { id: 'member_timeout', title: '��� ���', desc: '��� ��� ��� (���� ���)', icon: '?' },
            { id: 'member_untimeout', title: '����� �����', desc: '��� ����� ����� �� ���', icon: '?' },
            { id: 'member_mute', title: '����� �����', desc: '��� ����� ��� �������', icon: '??' },
            { id: 'member_unmute', title: '����� ����� �����', desc: '��� ����� ������� �������', icon: '??' },
            { id: 'member_nick_change', title: '����� ����� ��������', desc: '��� ����� ����� �������� �����', icon: '??' },
            { id: 'member_avatar_change', title: '����� ������', desc: '��� ����� ���� �����', icon: '???', isSpecial: true },
            { id: 'member_username_change', title: '����� ��� ��������', desc: '��� ����� ��� �������� �����', icon: '??', isSpecial: true },
            { id: 'member_boost_add', title: '���� �������', desc: '��� ���� ������� �� ��� ���', icon: '??' },
            { id: 'member_boost_remove', title: '����� ������', desc: '��� ����� ������ �� �������', icon: '???' },
            { id: 'member_suspicious', title: '���� �����', desc: '��� ����� ���� ����� ���� ���� ��� ������', icon: '??' }
        ]
    },
    roles: {
        title: '�����', icon: '???', desc: '����� ����� ������ ���� ������ �����', defaultColor: '#5865F2',
        items: [
            { id: 'role_create', title: '����� ����', desc: '��� ����� ���� �����', icon: '?' },
            { id: 'role_delete', title: '��� ����', desc: '��� ��� ����', icon: '???' },
            { id: 'role_update', title: '����� ����', desc: '��� ����� ����', icon: '??' },
            { id: 'role_give_member', title: '����� ���� ����', desc: '��� ����� ���� ����', icon: '??' },
            { id: 'role_remove_member', title: '����� ���� �� ���', desc: '��� ����� ���� �� ���', icon: '?' },
            { id: 'role_custom_manage', title: '���� ����', desc: '�����/��� ���� ���� (��� ��� rlog)', icon: '??' }
        ]
    },
    channels: {
        title: '�������', icon: '??', desc: '����� ����� ������ ���� ������� ���������', defaultColor: '#5865F2',
        items: [
            { id: 'channel_create', title: '����� ����', desc: '��� ����� ���� �����', icon: '?' },
            { id: 'channel_delete', title: '��� ����', desc: '��� ��� ����', icon: '???' },
            { id: 'channel_update', title: '����� ����', desc: '��� ����� ����', icon: '??' },
            { id: 'channel_perms_update', title: '����� ������� ����', desc: '��� ����� ������� ����', icon: '??' },
            { id: 'thread_create', title: '����� ����', desc: '��� ����� ���� ����', icon: '??' },
            { id: 'thread_delete', title: '��� ����', desc: '��� ��� ����', icon: '???' },
            { id: 'thread_update', title: '����� ����', desc: '��� ����� ����', icon: '??' }
        ]
    },
    messages: {
        title: '�������', icon: '??', desc: '����� ��� ������ ������ ���� �������', defaultColor: '#5865F2',
        items: [
            { id: 'msg_delete', title: '��� �����', desc: '��� ��� �����', icon: '???' },
            { id: 'msg_image_delete', title: '��� ����', desc: '��� ��� ����� ����� ��� ����', icon: '???' },
            { id: 'msg_update', title: '����� �����', desc: '��� ����� �����', icon: '??' },
            { id: 'msg_purge', title: '��� ����� �����', desc: '��� ��� ��� �����', icon: '??' },
            { id: 'msg_pin', title: '����� �����', desc: '��� ����� �����', icon: '??' },
            { id: 'msg_unpin', title: '����� ����� �����', desc: '��� ����� ����� �����', icon: '??' },
            { id: 'msg_reaction_add', title: '����� �����', desc: '��� ����� ����� ��� �����', icon: '??' },
            { id: 'msg_reaction_remove', title: '����� �����', desc: '��� ����� ����� �� �����', icon: '??' },
            { id: 'msg_reaction_remove_all', title: '��� ���� ���������', desc: '��� ��� ���� ���������', icon: '??' }
        ]
    },
    voice: {
        title: '�����', icon: '???', desc: '����� ������� ������� ������ ����� ���������', defaultColor: '#5865F2',
        items: [
            { id: 'vc_join', title: '���� ��� ����', desc: '��� ���� ��� ���� ����', icon: '??', isSpecial: true },
            { id: 'vc_leave', title: '���� �� ��� ����', desc: '��� ���� ��� �� ��� ����', icon: '??', isSpecial: true },
            { id: 'vc_switch', title: '��� ��� �������', desc: '��� ��� ��� ��� �������', icon: '??', isSpecial: true },
            { id: 'vc_mute_server', title: '��� ���', desc: '��� ��� ��� �� ������', icon: '??', isSpecial: true },
            { id: 'vc_unmute_server', title: '����� ��� ���', desc: '��� ����� ��� ���', icon: '??', isSpecial: true },
            { id: 'vc_deafen_server', title: '����� ���', desc: '��� ����� ���', icon: '??', isSpecial: true },
            { id: 'vc_undeafen_server', title: '����� �����', desc: '��� ����� ����� ���', icon: '??', isSpecial: true },
            { id: 'vc_self_mute', title: '���� ����', desc: '��� ����� ����� ���� ����', icon: '??', isSpecial: true },
            { id: 'vc_self_unmute', title: '����� ������ ����', desc: '��� ����� ����� ������ ����', icon: '??', isSpecial: true },
            { id: 'vc_self_deaf', title: '���� ����', desc: '��� ����� ����� ���� ����', icon: '??', isSpecial: true },
            { id: 'vc_self_undeaf', title: '����� ������ ����', desc: '��� ����� ����� ������ ����', icon: '??', isSpecial: true },
            { id: 'vc_stream_start', title: '��� ��', desc: '��� ��� ��� �� �����', icon: '???', isSpecial: true },
            { id: 'vc_stream_stop', title: '����� ��', desc: '��� ����� ����', icon: '???', isSpecial: true },
            { id: 'vc_video_start', title: '����� ��������', desc: '��� ����� ��������', icon: '???', isSpecial: true },
            { id: 'vc_video_stop', title: '����� ��������', desc: '��� ����� ��������', icon: '??', isSpecial: true },
            { id: 'vc_disconnect', title: '��� �� �������', desc: '��� ��� ��� �� ���� ����� (������ ����)', icon: '??', isSpecial: true }
        ]
    },
    moderation: {
        title: '�������', icon: '???', desc: '����� ��������� ������� ������� ���', defaultColor: '#5865F2',
        items: [
            { id: 'mod_warn_add', title: '����� �����', desc: '��� ����� ��� �����', icon: '??' },
            { id: 'mod_warn_remove', title: '����� �����', desc: '��� ����� ����� ���� �� ���', icon: '??' },
            { id: 'mod_warn_clear', title: '��� ���������', desc: '��� ��� ���� ������� ��� �� �������', icon: '??' },
            { id: 'mod_block_add', title: '����� ����', desc: '��� ����� ��� ���� ��� ����', icon: '???' },
            { id: 'mod_blacklist_add', title: '����� ���� ���', desc: '��� ����� ��� ��� ������ ���', icon: '??' },
            { id: 'mod_blacklist_remove', title: '����� ���� ���', desc: '��� ����� ��� �� ������ ���', icon: '?' }
        ]
    },
    server: {
        title: '�������', icon: '??', desc: '����� ����� ������� ���� ������� �������', defaultColor: '#5865F2',
        items: [
            { id: 'server_update', title: '����� �������', desc: '��� ����� ������� �������', icon: '??', isSpecial: true },
            { id: 'server_name_change', title: '����� ��� �������', desc: '��� ����� ��� �������', icon: '??', isSpecial: true },
            { id: 'server_icon_change', title: '����� ������ �������', desc: '��� ����� ������ �������', icon: '???', isSpecial: true },
            { id: 'server_banner_change', title: '����� ���� �������', desc: '��� ����� ���� �������', icon: '??', isSpecial: true },
            { id: 'server_vanity_change', title: '����� ���� ��������', desc: '��� ����� ���� ������ ������', icon: '??', isSpecial: true },
            { id: 'server_boost_level_up', title: '��� ����� ������', desc: '��� ��� ����� ���� �������', icon: '??', isSpecial: true },
            { id: 'server_boost_level_down', title: '������ ����� ������', desc: '��� ������ ����� ������', icon: '??', isSpecial: true }
        ]
    },
    invites: {
        title: '�������', icon: '??', desc: '����� ����� ���� �������� ����� ������', defaultColor: '#5865F2',
        items: [
            { id: 'invite_create', title: '����� ����', desc: '��� ����� ���� ����', icon: '?' },
            { id: 'invite_delete', title: '��� ����', desc: '��� ��� ���� ����', icon: '???' },
            { id: 'invite_used', title: '������� ����', desc: '��� ������� ���� ����', icon: '???' }
        ]
    },
    emojis: {
        title: '�������� ���������', icon: '??', desc: '����� ����� ������ ���� ���������� ����������', defaultColor: '#5865F2',
        items: [
            { id: 'emoji_create', title: '����� ������', desc: '��� ����� ������ ����', icon: '?', isSpecial: true },
            { id: 'emoji_delete', title: '��� ������', desc: '��� ��� ������', icon: '???', isSpecial: true },
            { id: 'emoji_update', title: '����� ������', desc: '��� ����� ������', icon: '??', isSpecial: true },
            { id: 'sticker_create', title: '����� �����', desc: '��� ����� ����� ����', icon: '???', isSpecial: true },
            { id: 'sticker_delete', title: '��� �����', desc: '��� ��� �����', icon: '???', isSpecial: true },
            { id: 'sticker_update', title: '����� �����', desc: '��� ����� �����', icon: '??', isSpecial: true }
        ]
    },
    events: {
        title: '�������', icon: '??', desc: '����� ����� ������� ���� ������� �������� ��������', defaultColor: '#5865F2',
        items: [
            { id: 'event_create', title: '����� ���', desc: '��� ����� ��� �����', icon: '?', isSpecial: true },
            { id: 'event_delete', title: '��� ���', desc: '��� ��� ���', icon: '???', isSpecial: true },
            { id: 'event_update', title: '����� ���', desc: '��� ����� ���', icon: '??', isSpecial: true },
            { id: 'event_start', title: '��� ���', desc: '��� ��� ���', icon: '??', isSpecial: true },
            { id: 'event_end', title: '������ ���', desc: '��� ������ ���', icon: '??', isSpecial: true },
            { id: 'event_user_interested', title: '������ �� ���', desc: '��� ������ ��� �� ���', icon: '??', isSpecial: true }
        ]
    },
    integrations: {
        title: '���������', icon: '??', desc: '����� ��������� ������ ��� ��������', defaultColor: '#5865F2',
        items: [
            { id: 'integration_create', title: '����� �����', desc: '��� ����� ����� ����', icon: '?' },
            { id: 'integration_delete', title: '��� �����', desc: '��� ��� �����', icon: '???' },
            { id: 'integration_update', title: '����� �����', desc: '��� ����� �����', icon: '??' },
            { id: 'webhook_create', title: '����� ��� ���', desc: '��� ����� ��� ���', icon: '??' },
            { id: 'webhook_delete', title: '��� ��� ���', desc: '��� ��� ��� ���', icon: '???' },
            { id: 'webhook_update', title: '����� ��� ���', desc: '��� ����� ��� ���', icon: '??' },
            { id: 'bot_add', title: '����� ���', desc: '��� ����� ��� �������', icon: '??' },
            { id: 'bot_remove', title: '����� ���', desc: '��� ����� ��� �� �������', icon: '???' }
        ]
    },
    automod: {
        title: '������ ���', icon: '??', desc: '����� ������ ������ ��� ���� ������� �������', defaultColor: '#5865F2',
        items: [
            { id: 'automod_rule_create', title: '����� �����', desc: '��� ����� ����� ���� ���', icon: '?' },
            { id: 'automod_rule_delete', title: '��� �����', desc: '��� ��� ����� ���� ���', icon: '???' },
            { id: 'automod_rule_update', title: '����� �����', desc: '��� ����� ����� ���� ���', icon: '??' },
            { id: 'automod_action_trigger', title: '����� ���� ���', desc: '��� ����� ����� ���� ���', icon: '??' },
            { id: 'automod_content_block', title: '��� �����', desc: '��� ��� ����� ��������', icon: '???' },
            { id: 'automod_timeout', title: '��� ������', desc: '��� ��� ��� ��������', icon: '??' },
            { id: 'automod_spam_detect', title: '����� ������', desc: '��� ������ ���� �� ����� ����� �� �� �����', icon: '??' }
        ]
    },
    stage: {
        title: '������', icon: '??', desc: '����� ������� ��������� ������� ����������', defaultColor: '#5865F2',
        items: [
            { id: 'stage_create', title: '����� ����', desc: '��� ����� ���� �����', icon: '?', isSpecial: true },
            { id: 'stage_delete', title: '��� ����', desc: '��� ��� ����', icon: '???', isSpecial: true },
            { id: 'stage_update', title: '����� ����', desc: '��� ����� ����', icon: '??', isSpecial: true },
            { id: 'stage_speaker_add', title: '����� �����', desc: '��� ����� ����� ������', icon: '??', isSpecial: true },
            { id: 'stage_speaker_remove', title: '����� �����', desc: '��� ����� �����', icon: '??', isSpecial: true },
            { id: 'stage_hand_raise', title: '��� ������', desc: '��� ��� ��� ������', icon: '??', isSpecial: true }
        ]
    }
};

// ================================================================
// HELPER FUNCTIONS
// ================================================================

function isLogEnabled(logId) {
    var s = logsState[logId];
    if (!s) return false;
    return s.enabled === true || s.enabled === 1 || s.enabled === '1';
}

function showToast(message, type) {
    var container = document.getElementById('logs-toast-container');
    if (!container) return;
    var bgMap = {
        success: 'bg-emerald-900/90 border-emerald-500/50 text-emerald-200',
        danger:  'bg-red-900/90 border-red-500/50 text-red-200',
        info:    'bg-violet-900/90 border-violet-500/50 text-violet-200'
    };
    var iconMap = {
        success: 'fa-circle-check',
        danger:  'fa-triangle-exclamation',
        info:    'fa-circle-info'
    };
    var t = type || 'success';
    var toast = document.createElement('div');
    toast.className = 'pointer-events-auto border rounded-xl p-4 shadow-2xl flex items-center justify-between gap-3 backdrop-blur-md transition-all duration-300 transform translate-y-2 opacity-0 ' + (bgMap[t] || bgMap.info);
    toast.innerHTML = '<div class="flex items-center gap-3"><i class="fa-solid ' + (iconMap[t] || 'fa-circle-info') + ' text-lg"></i><span class="text-xs font-bold">' + message + '</span></div><button type="button" class="text-xs opacity-70 hover:opacity-100 transition">?</button>';
    container.appendChild(toast);
    setTimeout(function() { toast.classList.remove('translate-y-2', 'opacity-0'); }, 10);
    var removeToast = function() {
        toast.classList.add('translate-y-2', 'opacity-0');
        setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    };
    toast.querySelector('button').addEventListener('click', removeToast);
    setTimeout(removeToast, 3500);
}

function showSavedBanner(msg) {
    showToast(msg || '? ����� ��������� �� ����� ��������� �����', 'success');
}

function saveToLogsHistory(action, data) {
    logsHistory.push({ action: action, data: data, timestamp: Date.now() });
    if (logsHistory.length > 20) logsHistory.shift();
    updateUndoBtn();
}

function updateUndoBtn() {
    var btn = document.getElementById('logs-btn-undo');
    if (btn) btn.disabled = logsHistory.length === 0;
}

function showLogsConfirm(message, callback) {
    var modal = document.getElementById('logs-confirm-modal');
    var msgEl = document.getElementById('logs-confirm-msg');
    if (!modal) { if (confirm(message)) callback(); return; }
    if (msgEl) msgEl.textContent = message;
    logsConfirmCallback = callback;
    modal.classList.remove('hidden');
}

function hideLogsConfirm() {
    var modal = document.getElementById('logs-confirm-modal');
    if (modal) modal.classList.add('hidden');
    logsConfirmCallback = null;
}

function syncHiddenInput() {
    var hiddenInp = document.getElementById('hidden_logs_config');
    if (hiddenInp) hiddenInp.value = JSON.stringify(logsState);
}

function saveLogsConfigToServer(extraPayload, successMsg) {
    syncHiddenInput();
    if (!_logsGuildId) return;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/guild/' + _logsGuildId + '/settings', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
        try { if (JSON.parse(xhr.responseText).success) showSavedBanner(successMsg); } catch(e) {}
    };
    var body = { logs_config: JSON.stringify(logsState) };
    if (extraPayload && typeof extraPayload === 'object') Object.assign(body, extraPayload);
    xhr.send(JSON.stringify(body));
}

function updateGlobalStats() {
    var total = 0, enabled = 0, channelsSet = [];
    var catKeys = Object.keys(LOG_CATEGORIES);
    for (var i = 0; i < catKeys.length; i++) {
        var items = LOG_CATEGORIES[catKeys[i]].items || [];
        total += items.length;
        for (var j = 0; j < items.length; j++) {
            var id = items[j].id;
            if (isLogEnabled(id)) enabled++;
            if (logsState[id] && logsState[id].channel_id && channelsSet.indexOf(logsState[id].channel_id) === -1) {
                channelsSet.push(logsState[id].channel_id);
            }
        }
    }
    var e1 = document.getElementById('statEnabledLogs');
    var e2 = document.getElementById('statChannelsUsed');
    if (e1) e1.textContent = enabled;
    if (e2) e2.textContent = channelsSet.length;
}

function renderCategoriesSidebar() {
    var container = document.getElementById('logsCategoriesList');
    if (!container) return;
    var catKeys = Object.keys(LOG_CATEGORIES);
    var html = '';
    var visibleCats = 0;
    for (var k = 0; k < catKeys.length; k++) {
        var key = catKeys[k];
        var cat = LOG_CATEGORIES[key];
        var isSel = (key === currentCategory);
        var totalItems = cat.items ? cat.items.length : 0;
        var enabledItems = 0;
        for (var j = 0; j < (cat.items || []).length; j++) {
            if (isLogEnabled(cat.items[j].id)) enabledItems++;
        }
        if (currentFilter === 'enabled' && enabledItems === 0) continue;
        if (currentFilter === 'disabled' && enabledItems === totalItems && totalItems > 0) continue;
        visibleCats++;
        var badgeClass = enabledItems === 0
            ? 'px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-[10px] font-mono'
            : (enabledItems === totalItems
                ? 'px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-mono'
                : 'px-2 py-0.5 bg-violet-500/10 text-violet-300 border border-violet-500/20 rounded-lg text-[10px] font-mono');
        html += '<button type="button" onclick="window.switchLogsCategory(\\'' + key + '\\')" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ' + (isSel ? 'bg-violet-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-[#181e2c]') + '">';
        html += '<span class="' + badgeClass + '">' + enabledItems + '/' + totalItems + '</span>';
        html += '<span class="flex items-center gap-2"><span>' + cat.title + '</span><span>' + cat.icon + '</span></span>';
        html += '</button>';
    }
    if (visibleCats === 0) {
        html = '<div class="py-4 text-center text-xs text-gray-500 font-bold">�� ���� ����� ������ ������ ??</div>';
    }
    container.innerHTML = html;
    updateGlobalStats();
}

function renderLogsGrid() {
    var container = document.getElementById('logsCardsGrid');
    if (!container) { console.warn('[LOGS] logsCardsGrid not found'); return; }
    var cat = LOG_CATEGORIES[currentCategory] || LOG_CATEGORIES.members;
    var titleEl = document.getElementById('activeCatTitle');
    var iconEl  = document.getElementById('activeCatIcon');
    var countEl = document.getElementById('activeCatCount');
    if (titleEl) titleEl.textContent = cat.title;
    if (iconEl)  iconEl.textContent  = cat.icon;
    if (countEl) countEl.textContent = (cat.items ? cat.items.length : 0) + ' ���';
    var searchInp = document.getElementById('logSearchInput');
    var searchVal = (searchInp && searchInp.value) ? searchInp.value.toLowerCase().trim() : '';
    var itemsList = cat.items || [];
    var filtered = [];
    for (var fi = 0; fi < itemsList.length; fi++) {
        var itm = itemsList[fi];
        var en = isLogEnabled(itm.id);
        if (currentFilter === 'enabled' && !en) continue;
        if (currentFilter === 'disabled' && en) continue;
        if (searchVal) {
            var tMatch = itm.title && itm.title.toLowerCase().indexOf(searchVal) !== -1;
            var dMatch = itm.desc  && itm.desc.toLowerCase().indexOf(searchVal) !== -1;
            if (!tMatch && !dMatch) continue;
        }
        filtered.push(itm);
    }
    if (!filtered.length) {
        container.innerHTML = '<div class="col-span-full py-12 bg-[#0b0d14] border border-white/5 rounded-3xl text-center text-xs text-gray-500 font-bold">�� ���� ����� ������ ����� �� ������ ??</div>';
        return;
    }
    var html = '';
    for (var i = 0; i < filtered.length; i++) {
        var item = filtered[i];
        var enabled = isLogEnabled(item.id);
        var customCfg   = logsState[item.id] || {};
        var customChan  = customCfg.channel_id || '';
        var customColor = customCfg.color || cat.defaultColor || '#5865F2';
        html += '<div class="bg-[#121620] border border-[#1e2638] hover:border-violet-500/40 p-4 rounded-2xl flex items-center justify-between transition shadow-md ' + (enabled ? '' : 'opacity-40') + '" data-log-id="' + item.id + '">';
        html += '<div class="flex items-center gap-2.5">';
        html += '<label class="toggle"><input type="checkbox" data-log-checkbox="' + item.id + '" ' + (enabled ? 'checked' : '') + ' data-logid="' + item.id + '"><span class="slider"></span></label>';
        html += '<button type="button" data-action="editlog" data-logid="' + item.id + '" data-logtitle="' + encodeURIComponent(item.title || '') + '" data-logicon="' + encodeURIComponent(item.icon || '') + '" title="����� ������ ������" class="w-8 h-8 rounded-xl bg-[#1e2638] hover:bg-violet-600/30 text-violet-400 border border-[#1e2638] hover:border-violet-500/30 flex items-center justify-center text-xs font-bold transition shadow cursor-pointer"><i class="fa-solid fa-gear"></i></button>';
        html += '</div>';
        html += '<div class="flex items-center gap-3">';
        html += '<div class="text-right">';
        html += '<div class="flex items-center justify-end gap-2">';
        if (item.isSpecial) html += '<span class="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-[9px] font-bold flex items-center gap-1"><span>����� ���� ���</span><i class="fa-solid fa-lock text-[8px]"></i></span>';
        if (customChan)     html += '<span class="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-[9px] font-bold flex items-center gap-1"><span>���� �����</span><i class="fa-solid fa-hashtag text-[8px]"></i></span>';
        html += '<span class="font-bold text-white text-xs">' + item.title + '</span>';
        html += '<span class="w-2.5 h-2.5 rounded-full shadow-sm" style="background-color:' + customColor + '" title="��� �������"></span>';
        html += '</div>';
        html += '<p class="text-[10px] text-gray-400 mt-0.5">' + item.desc + '</p>';
        html += '</div>';
        html += '<div class="w-10 h-10 rounded-xl bg-[#0b0e14] border border-[#1e2638] text-gray-200 flex items-center justify-center text-base shadow-inner flex-shrink-0">' + item.icon + '</div>';
        html += '</div>';
        html += '</div>';
    }
    container.innerHTML = html;
}

// ================================================================
// WINDOW FUNCTIONS (callable from onclick attributes)
// ================================================================

window.switchLogsCategory = function(catKey) {
    currentCategory = catKey;
    var chanSelect = document.getElementById('catDefaultChannel');
    if (chanSelect && categoryChannels[catKey] !== undefined) {
        chanSelect.value = categoryChannels[catKey];
    }
    var catDefColor = (LOG_CATEGORIES[catKey] && LOG_CATEGORIES[catKey].defaultColor) ? LOG_CATEGORIES[catKey].defaultColor : '#5865F2';
    var hexEl   = document.getElementById('catColorHex');
    var pickEl  = document.getElementById('catColorPicker');
    var prevBox = document.getElementById('catColorPreviewBox');
    if (hexEl)   hexEl.value = catDefColor;
    if (pickEl)  pickEl.value = catDefColor;
    if (prevBox) prevBox.style.backgroundColor = catDefColor;
    renderCategoriesSidebar();
    renderLogsGrid();
};

window.toggleLogsCategoriesDropdown = function() {
    var list  = document.getElementById('logsCategoriesList');
    var arrow = document.getElementById('logsCategoriesDropdownArrow');
    if (!list) return;
    if (list.classList.contains('hidden')) {
        list.classList.remove('hidden');
        if (arrow) arrow.className = 'fa-solid fa-chevron-down text-gray-400 text-xs';
    } else {
        list.classList.add('hidden');
        if (arrow) arrow.className = 'fa-solid fa-chevron-left text-gray-400 text-xs';
    }
};

window.filterLogsByStatus = function(status) {
    currentFilter = status;
    var btnAll = document.getElementById('btnLogFilterAll');
    var btnEn  = document.getElementById('btnLogFilterEnabled');
    var btnDis = document.getElementById('btnLogFilterDisabled');
    var ac = 'filter-tab px-4 py-2 rounded-lg text-xs font-bold bg-violet-600 text-white shadow-md transition cursor-pointer';
    var ic = 'filter-tab px-4 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer';
    if (btnAll) btnAll.className = (status === 'all')      ? ac : ic;
    if (btnEn)  btnEn.className  = (status === 'enabled')  ? ac : ic;
    if (btnDis) btnDis.className = (status === 'disabled') ? ac : ic;
    renderCategoriesSidebar();
    renderLogsGrid();
};

window.searchLogsItems = function() {
    renderLogsGrid();
};

window.toggleSingleLogEvent = function(logId, enable) {
    var was = isLogEnabled(logId);
    saveToLogsHistory('toggleLog', { id: logId, was: was, is: enable });
    if (!logsState[logId]) logsState[logId] = {};
    logsState[logId].enabled = enable;
    var card = document.querySelector('div[data-log-id="' + logId + '"]');
    if (card) {
        if (enable) card.classList.remove('opacity-40');
        else        card.classList.add('opacity-40');
    }
    renderCategoriesSidebar();
    saveLogsConfigToServer();
};

window.toggleActiveCategoryLogs = function(enable) {
    var cat = LOG_CATEGORIES[currentCategory];
    if (!cat || !cat.items) return;
    saveToLogsHistory('toggleCat', { snapshot: JSON.parse(JSON.stringify(logsState)) });
    for (var i = 0; i < cat.items.length; i++) {
        var id = cat.items[i].id;
        if (!logsState[id]) logsState[id] = {};
        logsState[id].enabled = enable;
    }
    renderCategoriesSidebar();
    renderLogsGrid();
    saveLogsConfigToServer();
};

window.toggleAllLogsGlobally = function(enable) {
    saveToLogsHistory('toggleAll', { snapshot: JSON.parse(JSON.stringify(logsState)) });
    var catKeys = Object.keys(LOG_CATEGORIES);
    for (var i = 0; i < catKeys.length; i++) {
        var items = LOG_CATEGORIES[catKeys[i]].items || [];
        for (var j = 0; j < items.length; j++) {
            var id = items[j].id;
            if (!logsState[id]) logsState[id] = {};
            logsState[id].enabled = enable;
        }
    }
    renderCategoriesSidebar();
    renderLogsGrid();
    saveLogsConfigToServer();
};

window.applyCatSettingsToAll = function() {
    var cat = LOG_CATEGORIES[currentCategory];
    if (!cat || !cat.items) return;
    var colorInp = document.getElementById('catColorHex');
    var color = colorInp ? colorInp.value : '#5865F2';
    var chanInp = document.getElementById('catDefaultChannel');
    var chan = chanInp ? chanInp.value : '';
    var appliedCount = 0;
    for (var i = 0; i < cat.items.length; i++) {
        var id = cat.items[i].id;
        if (!isLogEnabled(id)) continue;
        if (!logsState[id]) logsState[id] = { enabled: true };
        if (color) logsState[id].color = color;
        if (chan)  logsState[id].channel_id = chan;
        appliedCount++;
    }
    if (chan) categoryChannels[currentCategory] = chan;
    if (appliedCount === 0) {
        showToast('?? �� ���� ����� ����� �� ����� ������ ������ ��������� �����!', 'danger');
        return;
    }
    showToast('? �� ����� ������ ������ ����� ��� ' + appliedCount + ' ���', 'success');
    renderCategoriesSidebar();
    renderLogsGrid();
    var extra = {};
    if (chan) extra['log_channel_' + currentCategory] = chan;
    saveLogsConfigToServer(extra);
};

window.openEditLogModal = function(logId, title, icon) {
    currentEditModalLogId = logId;
    var modal    = document.getElementById('editLogModal');
    var titleEl  = document.getElementById('modalLogTitle');
    var iconEl   = document.getElementById('modalLogIcon');
    var chanEl   = document.getElementById('modalLogChannel');
    var colorHex = document.getElementById('modalLogColorHex');
    var colorPkr = document.getElementById('modalLogColorPicker');
    var prevBox  = document.getElementById('modalColorPreviewBox');
    if (titleEl) titleEl.textContent = title || '����� �����';
    if (iconEl)  iconEl.textContent  = icon  || '??';
    var cfg = logsState[logId] || {};
    if (chanEl)   chanEl.value = cfg.channel_id || '';
    var col = cfg.color || '#5865F2';
    if (colorHex) colorHex.value = col;
    if (colorPkr) colorPkr.value = col;
    if (prevBox)  prevBox.style.backgroundColor = col;
    if (modal) modal.classList.remove('hidden');
};

window.closeEditLogModal = function() {
    var modal = document.getElementById('editLogModal');
    if (modal) modal.classList.add('hidden');
    currentEditModalLogId = null;
};

window.saveModalLogConfig = function() {
    if (!currentEditModalLogId) return;
    var chanEl   = document.getElementById('modalLogChannel');
    var colorHex = document.getElementById('modalLogColorHex');
    if (!logsState[currentEditModalLogId]) logsState[currentEditModalLogId] = { enabled: true };
    logsState[currentEditModalLogId].channel_id = chanEl ? chanEl.value : '';
    logsState[currentEditModalLogId].color = colorHex ? colorHex.value : '#5865F2';
    saveLogsConfigToServer(null, '? �� ��� ����� ����� �����');
    window.closeEditLogModal();
    renderCategoriesSidebar();
    renderLogsGrid();
};

window.saveLogsSetting = function(key, val) {
    if (!_logsGuildId) return;
    var body = {};
    body[key] = (typeof val === 'boolean') ? (val ? 1 : 0) : val;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/guild/' + _logsGuildId + '/settings', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
        try {
            if (JSON.parse(xhr.responseText).success) {
                showToast(val ? '? �� ����� ������� �����' : '? �� ����� �������', val ? 'success' : 'danger');
            }
        } catch(e) {}
    };
    xhr.send(JSON.stringify(body));
};

window.saveLogsConfigToServer = saveLogsConfigToServer;

window.autoSetupLogsChannels = function(mode) {
    var modeTitle = mode === 'grouped' ? '������� ������� (��� ��� ����)' : '������� ������� (���� ��� ��� ���)';
    showLogsConfirm('�� ���� ����� ����� ������� �������� �������� �����: ' + modeTitle + '�', function() {
        showToast('?? ���� ����� ����� ������� �������� �� �������...', 'info');
        fetch('/api/guild/' + _logsGuildId + '/logs/auto-setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: mode })
        }).then(function(res) { return res.json(); }).then(function(d) {
            if (d.success) {
                showToast('? �� ����� ������ ����� ������� ����� �� �������!', 'success');
                setTimeout(function() { location.reload(); }, 1200);
            } else {
                showToast('? ' + (d.error || '��� ����� �������'), 'danger');
            }
        }).catch(function() { showToast('? ��� ��� �� ������� �������', 'danger'); });
    });
};

window.deleteLogsChannels = function() {
    showLogsConfirm('�� ��� ����� �� ��� �������� ������ ����� ZENO ������� ��� ������� �� ���� ������� ����.', function() {
        showToast('??? ���� ��� �������� ������ �������...', 'danger');
        fetch('/api/guild/' + _logsGuildId + '/logs/delete-channels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }).then(function(res) { return res.json(); }).then(function(d) {
            if (d.success) {
                showToast('? �� ��� ����� ������� �����', 'success');
                setTimeout(function() { location.reload(); }, 1200);
            } else {
                showToast('? ' + (d.error || '��� �����'), 'danger');
            }
        }).catch(function() { showToast('? ��� ��� �� �������', 'danger'); });
    });
};

// ================================================================
// EVENT LISTENERS (attached via JS, not onclick attributes)
// ================================================================

// Confirmation modal buttons
(function() {
    var ok     = document.getElementById('logs-confirm-ok');
    var cancel = document.getElementById('logs-confirm-cancel');
    if (ok)     ok.addEventListener('click', function() { if (logsConfirmCallback) logsConfirmCallback(); hideLogsConfirm(); });
    if (cancel) cancel.addEventListener('click', hideLogsConfirm);
})();

// Undo button
(function() {
    var undoBtn = document.getElementById('logs-btn-undo');
    if (undoBtn) {
        undoBtn.addEventListener('click', function() {
            if (logsHistory.length === 0) return;
            var last = logsHistory.pop();
            updateUndoBtn();
            if (last.action === 'toggleLog' && last.data) {
                var id = last.data.id;
                if (!logsState[id]) logsState[id] = {};
                logsState[id].enabled = last.data.was;
                var cb = document.querySelector('input[data-log-checkbox="' + id + '"]');
                if (cb) cb.checked = last.data.was;
                renderCategoriesSidebar();
                renderLogsGrid();
                saveLogsConfigToServer();
            } else if (last.action === 'toggleAll' || last.action === 'toggleCat') {
                if (last.data && last.data.snapshot) {
                    logsState = last.data.snapshot;
                    renderCategoriesSidebar();
                    renderLogsGrid();
                    saveLogsConfigToServer();
                }
            }
            showToast('? �� ������� ��: ' + last.action, 'info');
        });
    }
})();

// Export button
(function() {
    var exportBtn = document.getElementById('logs-btn-export');
    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            try {
                var exportData = { timestamp: new Date().toISOString(), guildId: _logsGuildId, logsState: logsState, categoryChannels: categoryChannels };
                var dataStr = JSON.stringify(exportData, null, 2);
                var blob = new Blob([dataStr], { type: 'application/json' });
                var url = URL.createObjectURL(blob);
                var link = document.createElement('a');
                link.href = url;
                link.download = 'zeno-logs-settings-' + Date.now() + '.json';
                link.click();
                URL.revokeObjectURL(url);
                showToast('?? �� ����� ������� ������� �����', 'success');
            } catch(e) {
                showToast('��� �� �������', 'danger');
            }
        });
    }
})();

// Channel select per category
(function() {
    var chanSelect = document.getElementById('catDefaultChannel');
    if (chanSelect) {
        chanSelect.addEventListener('change', function() {
            var val = this.value;
            categoryChannels[currentCategory] = val;
            window.saveLogsSetting('log_channel_' + currentCategory, val);
        });
    }
})();

// Color pickers sync
(function() {
    var catColorPicker = document.getElementById('catColorPicker');
    var catColorHex    = document.getElementById('catColorHex');
    var catColorPrev   = document.getElementById('catColorPreviewBox');
    if (catColorPicker) {
        catColorPicker.addEventListener('input', function() {
            if (catColorHex)  catColorHex.value = this.value;
            if (catColorPrev) catColorPrev.style.backgroundColor = this.value;
        });
    }
    if (catColorHex) {
        catColorHex.addEventListener('input', function() {
            if (catColorPicker) catColorPicker.value = this.value;
            if (catColorPrev)   catColorPrev.style.backgroundColor = this.value;
        });
    }
    var modalColorPicker = document.getElementById('modalLogColorPicker');
    var modalColorHex    = document.getElementById('modalLogColorHex');
    var modalColorPrev   = document.getElementById('modalColorPreviewBox');
    if (modalColorPicker) {
        modalColorPicker.addEventListener('input', function() {
            if (modalColorHex)  modalColorHex.value = this.value;
            if (modalColorPrev) modalColorPrev.style.backgroundColor = this.value;
        });
    }
    if (modalColorHex) {
        modalColorHex.addEventListener('input', function() {
            if (modalColorPicker) modalColorPicker.value = this.value;
            if (modalColorPrev)   modalColorPrev.style.backgroundColor = this.value;
        });
    }
})();

// ================================================================
// INITIAL RENDER
// ================================================================
syncHiddenInput();
window.switchLogsCategory('members');
console.log('[ZENO LOGS] Script loaded successfully. logsState keys:', Object.keys(logsState).length, '| LOG_CATEGORIES keys:', Object.keys(LOG_CATEGORIES).length);

// ---- BACKUP: Event Delegation System ----
(function() {
    // Attach named element listeners
    var searchInput = document.getElementById('logSearchInput');
    if (searchInput) { searchInput.removeAttribute('oninput'); searchInput.addEventListener('input', function() { renderLogsGrid(); }); }

    var masterToggle = document.getElementById('logsMasterToggle');
    if (masterToggle) {
        masterToggle.removeAttribute('onchange');
        masterToggle.addEventListener('change', function() { window.saveLogsSetting('logs_enabled', this.checked); });
    }
    var subLogsToggle = document.getElementById('sub-logs-switch');
    if (subLogsToggle) {
        subLogsToggle.removeAttribute('onchange');
        subLogsToggle.addEventListener('change', function() {
            window.saveLogsSetting('logs_enabled', this.checked);
            if (masterToggle) masterToggle.checked = this.checked;
        });
    }
    var saveBtn = document.getElementById('logs-btn-save');
    if (saveBtn) {
        saveBtn.removeAttribute('onclick');
        saveBtn.addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            window.saveLogsConfigToServer(null, '�� ��� ���� ��������� �� ����� ��������');
        });
    }

    // Global click delegation (useCapture=true = runs before form submit)
    document.addEventListener('click', function(e) {
        var btn = e.target.tagName === 'BUTTON' ? e.target : e.target.closest('button');
        if (!btn) return;
        var oc = btn.getAttribute('onclick') || '';
        if (!oc) return;
        if (oc.indexOf('toggleAllLogsGlobally(false)') >= 0) { e.preventDefault(); e.stopPropagation(); window.toggleAllLogsGlobally(false); return; }
        if (oc.indexOf('toggleAllLogsGlobally(true)')  >= 0) { e.preventDefault(); e.stopPropagation(); window.toggleAllLogsGlobally(true);  return; }
        if (oc.indexOf('toggleActiveCategoryLogs(false)') >= 0) { e.preventDefault(); e.stopPropagation(); window.toggleActiveCategoryLogs(false); return; }
        if (oc.indexOf('toggleActiveCategoryLogs(true)')  >= 0) { e.preventDefault(); e.stopPropagation(); window.toggleActiveCategoryLogs(true);  return; }
        if (oc.indexOf('applyCatSettingsToAll') >= 0)      { e.preventDefault(); e.stopPropagation(); window.applyCatSettingsToAll(); return; }
        if (oc.indexOf('toggleLogsCategoriesDropdown') >= 0) { e.preventDefault(); e.stopPropagation(); window.toggleLogsCategoriesDropdown(); return; }
        if (oc.indexOf('autoSetupLogsChannels') >= 0 && oc.indexOf('grouped') >= 0)  { e.preventDefault(); e.stopPropagation(); window.autoSetupLogsChannels('grouped'); return; }
        if (oc.indexOf('autoSetupLogsChannels') >= 0 && oc.indexOf('detailed') >= 0) { e.preventDefault(); e.stopPropagation(); window.autoSetupLogsChannels('detailed'); return; }
        if (oc.indexOf('deleteLogsChannels') >= 0)         { e.preventDefault(); e.stopPropagation(); window.deleteLogsChannels(); return; }
        if (oc.indexOf('filterLogsByStatus') >= 0 && oc.indexOf('disabled') >= 0)    { e.preventDefault(); e.stopPropagation(); window.filterLogsByStatus('disabled'); return; }
        if (oc.indexOf('filterLogsByStatus') >= 0 && oc.indexOf('enabled') >= 0)     { e.preventDefault(); e.stopPropagation(); window.filterLogsByStatus('enabled'); return; }
        if (oc.indexOf('filterLogsByStatus') >= 0 && oc.indexOf('all') >= 0)         { e.preventDefault(); e.stopPropagation(); window.filterLogsByStatus('all'); return; }
        if (oc.indexOf('closeEditLogModal') >= 0)  { e.preventDefault(); e.stopPropagation(); window.closeEditLogModal(); return; }
        if (oc.indexOf('saveModalLogConfig') >= 0) { e.preventDefault(); e.stopPropagation(); window.saveModalLogConfig(); return; }
        if (oc.indexOf('saveLogsConfigToServer') >= 0) { e.preventDefault(); e.stopPropagation(); window.saveLogsConfigToServer(null, '�� ��� ���� ���������'); return; }
        if (oc.indexOf('switchLogsCategory') >= 0) {
            var m = oc.match(/switchLogsCategory\('([^']+)'\)/);
            if (m) { e.preventDefault(); e.stopPropagation(); window.switchLogsCategory(m[1]); return; }
        }
        if (oc.indexOf('openEditLogModal') >= 0) {
            var m2 = oc.match(/openEditLogModal\('([^']+)',\s*'([^']*)',\s*'([^']*)'\)/);
            if (m2) { e.preventDefault(); e.stopPropagation(); window.openEditLogModal(m2[1], m2[2], m2[3]); return; }
        }
        // data-action="editlog" buttons (no inline onclick needed)
        var editBtn = e.target.closest('[data-action="editlog"]');
        if (editBtn) {
            e.preventDefault(); e.stopPropagation();
            var lid = editBtn.getAttribute('data-logid') || '';
            var ltitle = decodeURIComponent(editBtn.getAttribute('data-logtitle') || '');
            var licon  = decodeURIComponent(editBtn.getAttribute('data-logicon')  || '');
            window.openEditLogModal(lid, ltitle, licon);
            return;
        }
    }, true);

    // Checkbox change delegation
    document.addEventListener('change', function(e) {
        var el = e.target;
        if (!el || el.tagName !== 'INPUT') return;
        // data-logid checkboxes (new approach)
        var lid = el.getAttribute('data-logid') || el.getAttribute('data-log-checkbox');
        if (lid) { e.stopPropagation(); window.toggleSingleLogEvent(lid, el.checked); return; }
        // Legacy onchange attribute approach
        var oc = el.getAttribute('onchange') || '';
        if (oc.indexOf('toggleSingleLogEvent') >= 0) {
            var m = oc.match(/toggleSingleLogEvent\('([^']+)',\s*this\.checked\)/);
            if (m) { e.stopPropagation(); window.toggleSingleLogEvent(m[1], el.checked); return; }
        }
        if (oc.indexOf('saveLogsSetting') >= 0) {
            var m2 = oc.match(/saveLogsSetting\('([^']+)',\s*this\.checked\)/);
            if (m2) { e.stopPropagation(); window.saveLogsSetting(m2[1], el.checked); return; }
        }
    }, true);

    console.log('[ZENO LOGS] Delegation READY. toggleAllLogsGlobally type:', typeof window.toggleAllLogsGlobally);
})();
// ===== END LOGS SECTION SCRIPT =====

                `;


            } else if (section === 'help') {
                title = '����� ������� ������� ??';
                // All commands data for the help page
                const helpCommands = [
                    // ??? �������
                    { name: 'ban',              cat: 'mod',        catLabel: '??? �������',          desc: '����� ��� ���� �� ������' },
                    { name: 'unban',            cat: 'mod',        catLabel: '??? �������',          desc: '�� ��� ���' },
                    { name: 'unbanall',         cat: 'mod',        catLabel: '??? �������',          desc: '�� ��� ���� ������� ��������� �� �������' },
                    { name: 'kick',             cat: 'mod',        catLabel: '??? �������',          desc: '����� ��� ���� �� ������' },
                    { name: 'mute',             cat: 'mod',        catLabel: '??? �������',          desc: '����� ���� ���� �� ������' },
                    { name: 'timeout',          cat: 'mod',        catLabel: '??? �������',          desc: '����� ���� ��� ���� �� ������' },
                    { name: 'untimeout',        cat: 'mod',        catLabel: '??? �������',          desc: '����� ������ ��� �� ���' },
                    { name: 'untimeall',        cat: 'mod',        catLabel: '??? �������',          desc: '����� ������ ��� �� ���� �������' },
                    { name: 'warn',             cat: 'mod',        catLabel: '??? �������',          desc: '����� ���' },
                    { name: 'unwarn',           cat: 'mod',        catLabel: '??? �������',          desc: '����� ����� �� ���' },
                    { name: 'warns',            cat: 'mod',        catLabel: '??? �������',          desc: '��� ������� ���' },
                    { name: 'clear',            cat: 'mod',        catLabel: '??? �������',          desc: '��� ��� �� �������' },
                    { name: 'lock',             cat: 'mod',        catLabel: '??? �������',          desc: '��� �����' },
                    { name: 'unlock',           cat: 'mod',        catLabel: '??? �������',          desc: '��� �����' },
                    { name: 'hide',             cat: 'mod',        catLabel: '??? �������',          desc: '����� �����' },
                    { name: 'show',             cat: 'mod',        catLabel: '??? �������',          desc: '����� ����� ���� �� ������' },
                    { name: 'unhide',           cat: 'mod',        catLabel: '??? �������',          desc: '����� �����' },
                    { name: 'nickname',         cat: 'mod',        catLabel: '??? �������',          desc: '����� ��� ������ ���� �� ������' },
                    { name: 'demote',           cat: 'mod',        catLabel: '??? �������',          desc: '����� ��� �� ���� ����� ���� ���� �������' },
                    { name: 'promote',          cat: 'mod',        catLabel: '??? �������',          desc: '����� ��� �������� ����� ���� (��� ����� �������)' },
                    { name: 'role',             cat: 'mod',        catLabel: '??? �������',          desc: '����� ���� ���� �� �������' },
                    { name: 'xroles',           cat: 'mod',        catLabel: '??? �������',          desc: '����� �� ����� ���� ���� �����' },
                    { name: 'come',             cat: 'mod',        catLabel: '??? �������',          desc: '������� ���' },
                    { name: 'snipe',            cat: 'mod',        catLabel: '??? �������',          desc: '��� ��� ����� ������ �� ������' },
                    // ?? �������
                    { name: 'anti-ban',             cat: 'protection', catLabel: '?? �������',           desc: '����� ���� ������� �� ������' },
                    { name: 'anti-bots',            cat: 'protection', catLabel: '?? �������',           desc: '����� ���� ������� �� �������' },
                    { name: 'anti-delete-roles',    cat: 'protection', catLabel: '?? �������',           desc: '����� ���� ������� �� ��� �����' },
                    { name: 'anti-delete-rooms',    cat: 'protection', catLabel: '?? �������',           desc: '����� ���� ������� �� ��� �������' },
                    { name: 'antilink',             cat: 'protection', catLabel: '?? �������',           desc: '����� ������� �� �������' },
                    { name: 'antispam',             cat: 'protection', catLabel: '?? �������',           desc: '����� ������� �� ������' },
                    { name: 'badwords',             cat: 'protection', catLabel: '?? �������',           desc: '����� ������� ��������' },
                    { name: 'protection-status',    cat: 'protection', catLabel: '?? �������',           desc: '��������� �� ���� ���� �������' },
                    { name: 'set-protect-logs',     cat: 'protection', catLabel: '?? �������',           desc: '������ ��� ��� �������' },
                    // ?? �������
                    { name: 'setup-ticket',         cat: 'tickets',    catLabel: '?? �������',           desc: '����� �������' },
                    { name: 'add-ticket-button',    cat: 'tickets',    catLabel: '?? �������',           desc: '����� ������� (�� �����)' },
                    { name: 'add-button',           cat: 'tickets',    catLabel: '?? �������',           desc: '����� �� ������ ����' },
                    { name: 'close',                cat: 'tickets',    catLabel: '?? �������',           desc: '����� ������� �������' },
                    { name: 'delete',               cat: 'tickets',    catLabel: '?? �������',           desc: '��� ������� �������' },
                    { name: 'rename',               cat: 'tickets',    catLabel: '?? �������',           desc: '����� ����� ������� �������' },
                    { name: 'add-user',             cat: 'tickets',    catLabel: '?? �������',           desc: '����� ������ �������' },
                    { name: 'remove-user',          cat: 'tickets',    catLabel: '?? �������',           desc: '����� ������ �� �������' },
                    { name: 'to-select',            cat: 'tickets',    catLabel: '?? �������',           desc: '����� ����� ��� ���� ����' },
                    { name: 'set-ticket-log',       cat: 'tickets',    catLabel: '?? �������',           desc: '����� ��� ����� �������' },
                    { name: 'setup-apply',          cat: 'tickets',    catLabel: '?? �������',           desc: '����� ���� �������' },
                    { name: 'new-apply',            cat: 'tickets',    catLabel: '?? �������',           desc: '����� ����� ����' },
                    { name: 'close-apply',          cat: 'tickets',    catLabel: '?? �������',           desc: '����� ������� �������' },
                    // ?? ����� ����
                    { name: 'gstart',   cat: 'giveaway', catLabel: '?? ����� ����', desc: '��� ��� ����' },
                    { name: 'gend',     cat: 'giveaway', catLabel: '?? ����� ����', desc: '����� ��� ����' },
                    { name: 'greroll',  cat: 'giveaway', catLabel: '?? ����� ����', desc: '����� ������ ��� ����' },
                    // ?? ��������
                    { name: 'daily',    cat: 'economy', catLabel: '?? ��������', desc: '������ ������ ������' },
                    { name: 'rovex',    cat: 'economy', catLabel: '?? ��������', desc: '����� ���� �� ��� �����' },
                    { name: 'tax',      cat: 'economy', catLabel: '?? ��������', desc: '����� ����� ���' },
                    { name: 'profile',  cat: 'economy', catLabel: '?? ��������', desc: '��� ������� ����� �� ���� ��� ���' },
                    { name: 'rank',     cat: 'economy', catLabel: '?? ��������', desc: '��� ����� �� �������' },
                    { name: 'top',      cat: 'economy', catLabel: '?? ��������', desc: '��� ��� ������� (���� �� �����)' },
                    // ?? ����������
                    { name: 'add-autoline-channel',    cat: 'broadcast', catLabel: '?? ����������', desc: '����� ��� �� ������' },
                    { name: 'remove-autoline-channel', cat: 'broadcast', catLabel: '?? ����������', desc: '����� ��� �� ������' },
                    { name: 'set-autoline-line',       cat: 'broadcast', catLabel: '?? ����������', desc: '����� ���� ��������' },
                    { name: 'line-mode',               cat: 'broadcast', catLabel: '?? ����������', desc: '���� ��� ����� ���� �� ����' },
                    { name: 'add-nadeko-room',         cat: 'broadcast', catLabel: '?? ����������', desc: '����� ��� ��� ����� ������� ����' },
                    { name: 'remove-nadeko-room',      cat: 'broadcast', catLabel: '?? ����������', desc: '����� ��� ���� ������� ����' },
                    { name: 'send-broadcast-panel',    cat: 'broadcast', catLabel: '?? ����������', desc: '����� ���� ������ �� ����������' },
                    { name: 'remove-all-tokens',       cat: 'broadcast', catLabel: '?? ����������', desc: '����� ���� ����� ����������' },
                    { name: 'remove-token',            cat: 'broadcast', catLabel: '?? ����������', desc: '����� ���� ��������' },
                    { name: 'set-feedback-line',       cat: 'broadcast', catLabel: '?? ����������', desc: '����� �� ������' },
                    { name: 'set-feedback-room',       cat: 'broadcast', catLabel: '?? ����������', desc: '����� ��� ������' },
                    { name: 'set-suggestions-line',    cat: 'broadcast', catLabel: '?? ����������', desc: '����� �� ����������' },
                    { name: 'set-suggestions-room',    cat: 'broadcast', catLabel: '?? ����������', desc: '����� ��� ����������' },
                    { name: 'suggestion-mode',         cat: 'broadcast', catLabel: '?? ����������', desc: '����� �� �������� ����������' },
                    { name: 'set-tax-line',            cat: 'broadcast', catLabel: '?? ����������', desc: '����� �� �������' },
                    { name: 'set-tax-room',            cat: 'broadcast', catLabel: '?? ����������', desc: '����� ��� ������� ���������' },
                    { name: 'tax-mode',                cat: 'broadcast', catLabel: '?? ����������', desc: '������ ��� ������� ���� �� ����� �����' },
                    // ?? ��������� �������
                    { name: 'greet',            cat: 'settings', catLabel: '?? ���������', desc: '������� �������' },
                    { name: 'setup-welcome',    cat: 'settings', catLabel: '?? ���������', desc: '������� ������� ���������' },
                    { name: 'set-message',      cat: 'settings', catLabel: '?? ���������', desc: '����� ������� ��� ������' },
                    { name: 'autorole',         cat: 'settings', catLabel: '?? ���������', desc: '����� ����� ��������� ��� ���� �������' },
                    { name: 'settempvoice',     cat: 'settings', catLabel: '?? ���������', desc: '����� ����� ������� ������� �������' },
                    { name: 'setup-rating',     cat: 'settings', catLabel: '?? ���������', desc: '����� ������� �������' },
                    { name: 'setcommandrole',   cat: 'settings', catLabel: '?? ���������', desc: '��� ���� ����� ���� ����' },
                    { name: 'setup-logs',       cat: 'settings', catLabel: '?? ���������', desc: '����� ���� �����' },
                    { name: 'logs-info',        cat: 'settings', catLabel: '?? ���������', desc: '������� ���� ����� �� �������' },
                    { name: 'alias',            cat: 'settings', catLabel: '?? ���������', desc: '����� �������� �������' },
                    { name: 'set-shortcut',     cat: 'settings', catLabel: '?? ���������', desc: '����� ������ ���� ����' },
                    { name: 'autoreply-add',    cat: 'settings', catLabel: '?? ���������', desc: '������ �� ������' },
                    { name: 'autoreply-list',   cat: 'settings', catLabel: '?? ���������', desc: '����� ���� ������ ���������' },
                    { name: 'autoreply-remove', cat: 'settings', catLabel: '?? ���������', desc: '������ �� ������' },
                    { name: 'avatar',           cat: 'settings', catLabel: '?? ���������', desc: '���� ������� �� ��� ���' },
                    { name: 'banner',           cat: 'settings', catLabel: '?? ���������', desc: '���� ����� �� ��� ���' },
                    { name: 'user',             cat: 'settings', catLabel: '?? ���������', desc: '���� ������� ����� �� ��� ���' },
                    { name: 'server',           cat: 'settings', catLabel: '?? ���������', desc: '���� ������� �������' },
                    { name: 'inrole',           cat: 'settings', catLabel: '?? ���������', desc: '��� ���� ������� ����� ������� ���� �����' },
                    { name: 'roles',            cat: 'settings', catLabel: '?? ���������', desc: '��������� �� ��� �������' },
                    { name: 'embed',            cat: 'settings', catLabel: '?? ���������', desc: '��� ���� �� �����' },
                    { name: 'say',              cat: 'settings', catLabel: '?? ���������', desc: '��� ����' },
                    { name: 'send',             cat: 'settings', catLabel: '?? ���������', desc: '������ ����� ���� ��' },
                    { name: 'ai',               cat: 'settings', catLabel: '?? ���������', desc: '������ �� ������ ��������� (ZENO)' },
                    { name: 'ask',              cat: 'settings', catLabel: '?? ���������', desc: '���� ���� ZENO ��������� �� ����!' },
                    { name: 'ping',             cat: 'settings', catLabel: '?? ���������', desc: '������ ���� �����' },
                    { name: 'help',             cat: 'settings', catLabel: '?? ���������', desc: '����� ����� �����' },
                ];

                const catColors = {
                    mod:        { bg: 'bg-red-950/40',    border: 'border-red-500/30',    text: 'text-red-400',    badge: 'bg-red-950/60 text-red-400' },
                    protection: { bg: 'bg-orange-950/40', border: 'border-orange-500/30', text: 'text-orange-400', badge: 'bg-orange-950/60 text-orange-400' },
                    tickets:    { bg: 'bg-violet-950/40', border: 'border-violet-500/30', text: 'text-violet-400', badge: 'bg-violet-950/60 text-violet-400' },
                    giveaway:   { bg: 'bg-pink-950/40',   border: 'border-pink-500/30',   text: 'text-pink-400',   badge: 'bg-pink-950/60 text-pink-400' },
                    economy:    { bg: 'bg-yellow-950/40', border: 'border-yellow-500/30', text: 'text-yellow-400', badge: 'bg-yellow-950/60 text-yellow-400' },
                    broadcast:  { bg: 'bg-cyan-950/40',   border: 'border-cyan-500/30',   text: 'text-cyan-400',   badge: 'bg-cyan-950/60 text-cyan-400' },
                    settings:   { bg: 'bg-emerald-950/40',border: 'border-emerald-500/30',text: 'text-emerald-400',badge: 'bg-emerald-950/60 text-emerald-400' },
                };

                const cmdCards = helpCommands.map(cmd => {
                    const c = catColors[cmd.cat] || catColors.settings;
                    return '<div class="help-card border ' + c.border + ' ' + c.bg + ' rounded-2xl p-4 flex flex-col gap-2 hover:scale-[1.02] transition-transform cursor-default" data-cat="' + cmd.cat + '" data-name="' + cmd.name + '" data-desc="' + cmd.desc.replace(/"/g, '&quot;') + '">'
                        + '<div class="flex items-center justify-between gap-2">'
                        + '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full ' + c.badge + '">' + cmd.catLabel + '</span>'
                        + '<code class="' + c.text + ' font-bold text-sm font-mono">/' + cmd.name + '</code>'
                        + '</div>'
                        + '<p class="text-gray-300 text-xs leading-relaxed text-right">' + cmd.desc + '</p>'
                        + '</div>';
                }).join('');

                const totalCount = helpCommands.length;
                const catCounts = {};
                helpCommands.forEach(c => { catCounts[c.cat] = (catCounts[c.cat] || 0) + 1; });

                formFieldsHtml = '<div class="space-y-6 text-right" dir="rtl">'
                    + '<div class="bg-gradient-to-r from-[#1a132e] via-[#12141f] to-[#1a132e] border border-purple-500/20 p-6 rounded-3xl shadow-2xl">'
                    + '<div class="flex items-center justify-between flex-wrap gap-4">'
                    + '<div class="flex items-center gap-3 flex-wrap">'
                    + '<span class="bg-purple-950/60 text-purple-300 text-xs font-bold px-3 py-1.5 rounded-full border border-purple-500/30">' + totalCount + ' ���</span>'
                    + '<span class="bg-slate-900/60 text-gray-300 text-xs px-3 py-1.5 rounded-full border border-white/10">7 ����</span>'
                    + '</div><div>'
                    + '<h1 class="text-2xl font-black text-white">?? ����� ������� �������</h1>'
                    + '<p class="text-gray-400 text-xs mt-1">���� ����� ��� ZENO ����� ��������</p>'
                    + '</div></div></div>'
                    + '<div class="flex flex-col sm:flex-row gap-3">'
                    + '<input id="help-search" type="text" placeholder="?? ���� �� ���..." dir="rtl" class="flex-1 bg-[#0e1420] border border-[#1e2638] rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-purple-500 transition" />'
                    + '<select id="help-filter" dir="rtl" class="bg-[#0e1420] border border-[#1e2638] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500 transition">'
                    + '<option value="all">���� ������ (' + totalCount + ')</option>'
                    + '<option value="mod">??? ������� (' + (catCounts.mod || 0) + ')</option>'
                    + '<option value="protection">?? ������� (' + (catCounts.protection || 0) + ')</option>'
                    + '<option value="tickets">?? ������� (' + (catCounts.tickets || 0) + ')</option>'
                    + '<option value="giveaway">?? ����� ���� (' + (catCounts.giveaway || 0) + ')</option>'
                    + '<option value="economy">?? �������� (' + (catCounts.economy || 0) + ')</option>'
                    + '<option value="broadcast">?? ���������� (' + (catCounts.broadcast || 0) + ')</option>'
                    + '<option value="settings">?? ��������� (' + (catCounts.settings || 0) + ')</option>'
                    + '</select></div>'
                    + '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">'
                    + '<div class="bg-[#121620] border border-[#1e2638] rounded-2xl p-3 text-center"><div class="text-2xl font-black text-white">' + totalCount + '</div><div class="text-gray-400 text-xs mt-0.5">��� ������</div></div>'
                    + '<div class="bg-red-950/30 border border-red-500/20 rounded-2xl p-3 text-center"><div class="text-2xl font-black text-red-400">' + (catCounts.mod || 0) + '</div><div class="text-gray-400 text-xs mt-0.5">�����</div></div>'
                    + '<div class="bg-violet-950/30 border border-violet-500/20 rounded-2xl p-3 text-center"><div class="text-2xl font-black text-violet-400">' + (catCounts.tickets || 0) + '</div><div class="text-gray-400 text-xs mt-0.5">�����</div></div>'
                    + '<div class="bg-cyan-950/30 border border-cyan-500/20 rounded-2xl p-3 text-center"><div class="text-2xl font-black text-cyan-400">' + (catCounts.broadcast || 0) + '</div><div class="text-gray-400 text-xs mt-0.5">��������</div></div>'
                    + '</div>'
                    + '<div id="help-results-info" class="text-gray-400 text-xs text-right hidden"></div>'
                    + '<div id="help-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">' + cmdCards + '</div>'
                    + '<div id="help-empty" class="hidden text-center py-16 text-gray-500"><div class="text-4xl mb-3">??</div><p class="text-sm">�� ���� ����� ������ �����</p></div>'
                    + '</div>';

                embedScriptHtml = '(function() {'
                    + 'var searchEl = document.getElementById("help-search");'
                    + 'var filterEl = document.getElementById("help-filter");'
                    + 'var grid = document.getElementById("help-grid");'
                    + 'var empty = document.getElementById("help-empty");'
                    + 'var info = document.getElementById("help-results-info");'
                    + 'var cards = Array.from(grid ? grid.querySelectorAll(".help-card") : []);'
                    + 'function filterCards() {'
                    + '  var q = (searchEl ? searchEl.value : "").trim().toLowerCase().replace(/^\\//, "");'
                    + '  var cat = filterEl ? filterEl.value : "all";'
                    + '  var shown = 0;'
                    + '  cards.forEach(function(card) {'
                    + '    var name = (card.dataset.name || "").toLowerCase();'
                    + '    var desc = (card.dataset.desc || "").toLowerCase();'
                    + '    var cardCat = card.dataset.cat || "";'
                    + '    var matchQ = !q || name.includes(q) || desc.includes(q);'
                    + '    var matchCat = cat === "all" || cardCat === cat;'
                    + '    if (matchQ && matchCat) { card.style.display = ""; shown++; }'
                    + '    else { card.style.display = "none"; }'
                    + '  });'
                    + '  if (empty) empty.classList.toggle("hidden", shown > 0);'
                    + '  if (grid) grid.classList.toggle("hidden", shown === 0);'
                    + '  if (info) {'
                    + '    if (q || cat !== "all") {'
                    + '      info.textContent = "��� " + shown + " �� " + cards.length + " ���";'
                    + '      info.classList.remove("hidden");'
                    + '    } else { info.classList.add("hidden"); }'
                    + '  }'
                    + '}'
                    + 'if (searchEl) searchEl.addEventListener("input", filterCards);'
                    + 'if (filterEl) filterEl.addEventListener("change", filterCards);'
                    + '})();';
            } else if (section === 'ai') {
                title = '������ ��������� (ZENO AI & Web) ??';

                formFieldsHtml = '<div class="space-y-6 text-right" dir="rtl">'
                    + '<div class="bg-gradient-to-r from-[#1c0f38] via-[#12141f] to-[#0d1527] border border-purple-500/30 p-6 rounded-3xl shadow-2xl relative overflow-hidden">'
                    + '<div class="flex items-center justify-between flex-wrap gap-4 relative z-10">'
                    + '<div class="flex items-center gap-2 flex-wrap">'
                    + '<span class="bg-purple-600/30 border border-purple-500/50 text-purple-300 text-xs font-bold px-3 py-1 rounded-full">ZENO AI</span>'
                    + '<span class="bg-emerald-600/30 border border-emerald-500/50 text-emerald-300 text-xs font-bold px-3 py-1 rounded-full">?? ���� ���������</span>'
                    + '<span class="bg-indigo-600/30 border border-indigo-500/50 text-indigo-300 text-xs font-bold px-3 py-1 rounded-full">���� ��</span>'
                    + '</div>'
                    + '<div>'
                    + '<h3 class="text-2xl font-black text-white flex items-center gap-2 justify-end"><span>������ ��������� ������� �����</span><span>??</span></h3>'
                    + '<p class="text-gray-400 text-xs mt-1">���� ������ �� ZENO AI� ������ ����� ������ ���� ������ �� ��������.</p>'
                    + '</div>'
                    + '</div>'
                    + '</div>'
                    + '<div class="grid grid-cols-1 md:grid-cols-3 gap-4">'
                    + '<div class="bg-[#12141f] border border-white/5 rounded-2xl p-4 text-right">'
                    + '<div class="text-purple-400 text-xl mb-1">?</div>'
                    + '<h4 class="text-white font-bold text-sm">������� �������� �� �������</h4>'
                    + '<p class="text-gray-400 text-xs mt-1 leading-relaxed">�� ��� ���� <code class="text-purple-300 bg-purple-950/60 px-1 py-0.5 rounded">zeno</code> �� <code class="text-purple-300 bg-purple-950/60 px-1 py-0.5 rounded">����</code> �� ����� ����� ���� ���� ������ ��������� �����.</p>'
                    + '</div>'
                    + '<div class="bg-[#12141f] border border-white/5 rounded-2xl p-4 text-right">'
                    + '<div class="text-cyan-400 text-xl mb-1">??</div>'
                    + '<h4 class="text-white font-bold text-sm">���� ����� �������</h4>'
                    + '<p class="text-gray-400 text-xs mt-1 leading-relaxed">����� �� Google Search Grounding ����� ��� �� ������� �� ���� ������� �������� ��������.</p>'
                    + '</div>'
                    + '<div class="bg-[#12141f] border border-white/5 rounded-2xl p-4 text-right">'
                    + '<div class="text-amber-400 text-xl mb-1">??</div>'
                    + '<h4 class="text-white font-bold text-sm">����� ������� �������</h4>'
                    + '<p class="text-gray-400 text-xs mt-1 leading-relaxed">������ ����� ������ <code class="text-amber-300 bg-amber-950/60 px-1 py-0.5 rounded">/ai</code> � <code class="text-amber-300 bg-amber-950/60 px-1 py-0.5 rounded">/ask</code> �� ������� <code class="text-amber-300 bg-amber-950/60 px-1 py-0.5 rounded">#ai</code> ��� ����.</p>'
                    + '</div>'
                    + '</div>'
                    + '<div class="bg-[#12141f] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4">'
                    + '<div class="flex items-center justify-between border-b border-white/5 pb-3">'
                    + '<span class="text-xs text-gray-400">������ ������� ������ �� ���������</span>'
                    + '<h4 class="text-white font-black text-sm flex items-center gap-2"><span>����� ������ ��������� ���� (Live Chat)</span><span>??</span></h4>'
                    + '</div>'
                    + '<div id="ai-chat-box" class="h-80 overflow-y-auto space-y-3 p-4 bg-[#0a0c13] border border-white/5 rounded-2xl text-xs custom-scrollbar">'
                    + '<div class="flex items-start gap-2.5 justify-start flex-row-reverse">'
                    + '<div class="w-7 h-7 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-sm shrink-0">??</div>'
                    + '<div class="bg-[#161928] border border-white/10 text-gray-200 p-3 rounded-2xl max-w-[80%] leading-relaxed text-right">'
                    + '������ �� �� ���� ���� ZENO! ��� ������ ����� ������ ��������ʡ ������ �� �� ��� �� ������ �� ���� �� ���� ������� ���������� ������� �����.'
                    + '</div>'
                    + '</div>'
                    + '</div>'
                    + '<div class="flex items-center gap-2">'
                    + '<button type="button" id="ai-send-btn" class="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shrink-0 shadow-lg shadow-purple-900/30">'
                    + '<span>�����</span><span>??</span>'
                    + '</button>'
                    + '<input type="text" id="ai-input" placeholder="���� ZENO �� ���� �� ���� �� �����..." dir="rtl" class="flex-1 bg-[#0a0c13] border border-white/10 focus:border-purple-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none transition">'
                    + '</div>'
                    + '</div>'
                    + '</div>';

                embedScriptHtml = '(function() {'
                    + 'var input = document.getElementById("ai-input");'
                    + 'var btn = document.getElementById("ai-send-btn");'
                    + 'var box = document.getElementById("ai-chat-box");'
                    + 'function appendMsg(text, isUser) {'
                    + '  var wrap = document.createElement("div");'
                    + '  wrap.className = "flex items-start gap-2.5 " + (isUser ? "justify-end" : "justify-start flex-row-reverse");'
                    + '  var avatar = document.createElement("div");'
                    + '  avatar.className = "w-7 h-7 rounded-xl flex items-center justify-center text-sm shrink-0 " + (isUser ? "bg-indigo-600/30 border border-indigo-500/40" : "bg-purple-600/30 border border-purple-500/40");'
                    + '  avatar.textContent = isUser ? "??" : "??";'
                    + '  var bubble = document.createElement("div");'
                    + '  bubble.className = "p-3 rounded-2xl max-w-[80%] leading-relaxed text-right whitespace-pre-wrap " + (isUser ? "bg-purple-600/20 border border-purple-500/30 text-white" : "bg-[#161928] border border-white/10 text-gray-200");'
                    + '  bubble.textContent = text;'
                    + '  wrap.appendChild(bubble); wrap.appendChild(avatar);'
                    + '  box.appendChild(wrap);'
                    + '  box.scrollTop = box.scrollHeight;'
                    + '}'
                    + 'async function send() {'
                    + '  var val = (input.value || "").trim();'
                    + '  if (!val || btn.disabled) return;'
                    + '  input.value = "";'
                    + '  appendMsg(val, true);'
                    + '  btn.disabled = true;'
                    + '  btn.innerHTML = "<span>���� �������...</span><span>?</span>";'
                    + '  try {'
                    + '    var res = await fetch("/api/guild/' + guildId + '/ai/chat", {'
                    + '      method: "POST",'
                    + '      headers: { "Content-Type": "application/json" },'
                    + '      body: JSON.stringify({ prompt: val })'
                    + '    });'
                    + '    var data = await res.json();'
                    + '    if (data && data.success) {'
                    + '      appendMsg(data.response, false);'
                    + '    } else {'
                    + '      appendMsg("? " + (data.error || "��� ���"), false);'
                    + '    }'
                    + '  } catch(err) {'
                    + '    appendMsg("? ���� ������� ������� ���� �������� ������.", false);'
                    + '  } finally {'
                    + '    btn.disabled = false;'
                    + '    btn.innerHTML = "<span>�����</span><span>??</span>";'
                    + '  }'
                    + '}'
                    + 'if (btn) btn.onclick = send;'
                    + 'if (input) input.onkeydown = function(e) { if (e.key === "Enter") { e.preventDefault(); send(); } };'
                    + '})();';
            } else if (section === 'analytics' || section === 'stats') {
                const totalMembers = guild.memberCount || 0;
                const textChCount = (guildTextChannels || []).length;
                const voiceChCount = (guildVoiceChannels || []).length;
                const rolesCount = (guildRoles || []).length;
                const suggestionsCount = (guildSuggestionsList || []).length;

                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <!-- Header -->
                        <div class="bg-gradient-to-r from-[#1a132e] via-[#12141f] to-[#1a132e] border border-purple-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
                            <div class="flex items-center gap-2">
                                <a href="/dashboard/${guildId}/stat-channels" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition shadow">
                                    ����� ����� �������� ??
                                </a>
                            </div>
                            <div class="text-right">
                                <h4 class="font-black text-white text-xl flex items-center gap-2 justify-end"><span>���� ���������� ���������� ��������</span><span>??</span></h4>
                                <p class="text-gray-400 text-xs mt-0.5">����� ���� ����� ������� ����� ������ ������� ��������</p>
                            </div>
                        </div>

                        <!-- Top Metric Cards -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div class="bg-[#12141f] border border-white/5 hover:border-purple-500/30 p-5 rounded-3xl text-center space-y-1 shadow-xl transition">
                                <div class="w-10 h-10 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg mx-auto mb-2">??</div>
                                <span class="text-3xl font-black text-white font-mono">${totalMembers}</span>
                                <span class="text-xs font-bold text-gray-400 block">������ �������</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 hover:border-purple-500/30 p-5 rounded-3xl text-center space-y-1 shadow-xl transition">
                                <div class="w-10 h-10 rounded-2xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center text-lg mx-auto mb-2">??</div>
                                <span class="text-3xl font-black text-emerald-400 font-mono">${textChCount}</span>
                                <span class="text-xs font-bold text-gray-400 block">������� ������</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 hover:border-purple-500/30 p-5 rounded-3xl text-center space-y-1 shadow-xl transition">
                                <div class="w-10 h-10 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center text-lg mx-auto mb-2">??</div>
                                <span class="text-3xl font-black text-blue-400 font-mono">${voiceChCount}</span>
                                <span class="text-xs font-bold text-gray-400 block">������� �������</span>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 hover:border-purple-500/30 p-5 rounded-3xl text-center space-y-1 shadow-xl transition">
                                <div class="w-10 h-10 rounded-2xl bg-amber-600/20 text-amber-400 flex items-center justify-center text-lg mx-auto mb-2">???</div>
                                <span class="text-3xl font-black text-amber-400 font-mono">${rolesCount}</span>
                                <span class="text-xs font-bold text-gray-400 block">����� �������</span>
                            </div>
                        </div>

                        <!-- Server Health and Activity Indicators -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl">
                                <h4 class="text-sm font-black text-white border-b border-white/5 pb-3 flex items-center gap-2 justify-end">
                                    <span>������ ����� �������</span>
                                    <span>?</span>
                                </h4>
                                <div class="space-y-3">
                                    <div>
                                        <div class="flex items-center justify-between text-xs mb-1">
                                            <span class="text-purple-400 font-bold">${suggestionsCount} ������</span>
                                            <span class="text-gray-300 font-bold">���������� ��������</span>
                                        </div>
                                        <div class="w-full bg-[#0b0d14] h-2 rounded-full overflow-hidden">
                                            <div class="bg-purple-600 h-full rounded-full" style="width: ${Math.min(100, (suggestionsCount / 20) * 100)}%"></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div class="flex items-center justify-between text-xs mb-1">
                                            <span class="text-emerald-400 font-bold">${textChCount + voiceChCount} ����</span>
                                            <span class="text-gray-300 font-bold">������ ����� �������</span>
                                        </div>
                                        <div class="w-full bg-[#0b0d14] h-2 rounded-full overflow-hidden">
                                            <div class="bg-emerald-500 h-full rounded-full" style="width: ${Math.min(100, ((textChCount + voiceChCount) / 50) * 100)}%"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl">
                                <h4 class="text-sm font-black text-white border-b border-white/5 pb-3 flex items-center gap-2 justify-end">
                                    <span>����� ������ ��������</span>
                                    <span>??</span>
                                </h4>
                                <p class="text-xs text-gray-400 leading-relaxed">
                                    ����� ���� ����� **9 ����� ������** �� ����� ���������� (������ ��ѡ ����ʡ ������ ����ɡ ���...) ����� �������� �� 10 ����� �� ��� ����� ����������.
                                </p>
                                <a href="/dashboard/${guildId}/stat-channels" class="block text-center py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg">
                                    ��� ���� ����� ���������� (9 �����) ??
                                </a>
                            </div>
                        </div>
                    </div>`;
            } else if (section === 'stat-channels') {
                // Load current stat channels for this guild
                let statChannelsRows = [];
                try {
                    rawDb.exec(`CREATE TABLE IF NOT EXISTS stat_channels (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        guild_id TEXT NOT NULL,
                        channel_id TEXT NOT NULL,
                        stat_type TEXT NOT NULL,
                        custom_prefix TEXT DEFAULT '',
                        enabled INTEGER DEFAULT 1,
                        UNIQUE(guild_id, channel_id)
                    )`);
                    statChannelsRows = rawDb.prepare('SELECT * FROM stat_channels WHERE guild_id = ?').all(guildId);
                } catch(e) {}

                const STAT_TYPES_DEF = {
                    total_members:  { label: '������ �������', icon: '??', desc: '��� ���� ������� �� �������' },
                    humans:         { label: '�����', icon: '??', desc: '��� ������� �������� ���' },
                    bots:           { label: '�������', icon: '??', desc: '��� ������� �� �������' },
                    online:         { label: '������� ���������', icon: '??', desc: '��� ������� �������� ������' },
                    voice:          { label: '�������� ������', icon: '???', desc: '��� ������� �� ������� �������' },
                    text_channels:  { label: '������� ������', icon: '#??', desc: '��� ������� ������' },
                    voice_channels: { label: '������� �������', icon: '??', desc: '��� ������� �������' },
                    total_channels: { label: '��� ������� �����', icon: '??', desc: '������ ��� ���� �������' },
                    roles:          { label: '����� ������', icon: '???', desc: '��� ����� �� �������' },
                    boosts:         { label: '��� ��������', icon: '??', desc: '������ ��� ������ ������� �������' },
                    boost_level:    { label: '����� ������', icon: '??', desc: '����� ����� ������� ������ (Tier)' },
                };

                const configuredMap = {};
                for (const row of statChannelsRows) {
                    configuredMap[row.stat_type] = row;
                }

                const statRowsHtml = Object.entries(STAT_TYPES_DEF).map(([type, def]) => {
                    const configured = configuredMap[type];
                    const hasChannel = !!configured;
                    return `
                    <div class="bg-[#12141f] border ${hasChannel ? 'border-purple-500/40' : 'border-white/5'} rounded-2xl p-4 flex items-center justify-between gap-4 hover:border-purple-500/30 transition" id="stat-row-${type}">
                        <div class="flex items-center gap-3">
                            ${hasChannel ? `
                            <form method="POST" action="/api/guild/${guildId}/stat-channels/${configured.id}/delete" class="inline">
                                <button type="submit" class="px-3 py-2 bg-rose-900/40 hover:bg-rose-700/50 text-rose-300 rounded-xl text-xs font-bold border border-rose-800/30 transition" title="��� ��� ������">???</button>
                            </form>
                            ` : `
                            <button onclick="openAddStatChannel('${type}', '${def.label}')" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow transition">�����</button>
                            `}
                        </div>
                        <div class="flex-1 text-right">
                            <div class="flex items-center justify-end gap-2">
                                <span class="text-sm font-black text-white">${def.label}</span>
                                <div class="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/30 text-base flex items-center justify-center">${def.icon}</div>
                            </div>
                            <p class="text-[11px] text-gray-400 mt-0.5">${def.desc}</p>
                            ${hasChannel ? `<p class="text-[10px] text-purple-400 font-mono mt-1">?? ������ ��: <code class="bg-purple-950/40 px-1.5 py-0.5 rounded">${configured.channel_id}</code></p>` : ''}
                        </div>
                    </div>
                    `;
                }).join('');

formFieldsHtml = `<div class="space-y-6 text-right" dir="rtl">

    <!-- Header -->
    <div class="bg-gradient-to-r from-[#1a132e] via-[#12141f] to-[#1a132e] border border-purple-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
        <div class="flex items-center gap-3">
            <div class="text-left">
                <div class="text-xs text-purple-400 font-bold font-mono">����� �� 10 �����</div>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center text-2xl shadow-lg">??</div>
        </div>
        <div class="text-right">
            <h3 class="font-black text-white text-xl">����� ����������</h3>
            <p class="text-gray-400 text-xs mt-0.5">���� �������� ������ �� ����� ����� ����� �� ������ �������.</p>
            <p class="text-gray-500 text-[10px] mt-0.5">?? ���� �� ����� ���� ������ ����� ������� (Manage Channels)</p>
        </div>
    </div>

    <!-- Stats Counter -->
    <div class="grid grid-cols-3 gap-3">
        <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
            <div class="text-2xl font-black text-white">${statChannelsRows.length}</div>
            <div class="text-xs text-gray-400 font-bold mt-1">���� �������</div>
        </div>
        <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
            <div class="text-2xl font-black text-purple-400">${Object.keys(STAT_TYPES_DEF).length}</div>
            <div class="text-xs text-gray-400 font-bold mt-1">��� ����</div>
        </div>
        <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
            <div class="text-2xl font-black text-emerald-400">10</div>
            <div class="text-xs text-gray-400 font-bold mt-1">����� �������</div>
        </div>
    </div>

    <!-- Stat Channels List -->
    <div class="bg-[#12141f] border border-white/5 rounded-3xl p-6 shadow-xl space-y-3">
        <div class="flex items-center justify-between pb-3 border-b border-white/5">
            <span class="text-xs text-purple-400 font-bold">${statChannelsRows.length}/9 �����</span>
            <h4 class="text-sm font-black text-white">�������� ��������</h4>
        </div>
        ${statRowsHtml}
    </div>

    <!-- Add Modal -->
    <div id="addStatChannelModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div class="bg-[#10121b] border border-purple-500/30 rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl space-y-5">
            <div class="text-center">
                <h3 class="text-lg font-black text-white" id="addStatModalTitle">����� ���� �������</h3>
                <p class="text-gray-400 text-xs mt-1">����� ����� ������ ��� ��� ������ �������� �� 10 �����</p>
            </div>
            <form id="addStatChannelForm" class="space-y-4 text-right">
                <input type="hidden" id="addStatType" name="stat_type">
                <div>
                    <label class="text-xs font-bold text-gray-300 block mb-1.5">���� (ID) ������ �������</label>
                    <input type="text" name="channel_id" id="addStatChannelId" placeholder="����: 123456789012345678" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none font-mono text-right" required>
                    <p class="text-[10px] text-gray-500 mt-1">���� ID ������ ������� �� ������� (���� ���� ? ��� ������)</p>
                </div>
                <div>
                    <label class="text-xs font-bold text-gray-300 block mb-1.5">�� ���� ������� (�������)</label>
                    <input type="text" name="custom_prefix" id="addStatPrefix" placeholder="����: ?? �������" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">
                    <p class="text-[10px] text-gray-500 mt-1">��� ����� ������ ������� ����� ���� ���������</p>
                </div>
                <div class="flex gap-3 pt-2">
                    <button type="button" onclick="closeAddStatChannel()" class="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-xs font-bold transition">�����</button>
                    <button type="submit" class="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow transition">��� ������</button>
                </div>
            </form>
        </div>
    </div>

    <script>
    function openAddStatChannel(type, label) {
        document.getElementById('addStatType').value = type;
        document.getElementById('addStatModalTitle').textContent = '����� ����: ' + label;
        document.getElementById('addStatChannelModal').classList.remove('hidden');
    }
    function closeAddStatChannel() {
        document.getElementById('addStatChannelModal').classList.add('hidden');
    }
    document.getElementById('addStatChannelForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const data = {
            stat_type: document.getElementById('addStatType').value,
            channel_id: document.getElementById('addStatChannelId').value.trim(),
            custom_prefix: document.getElementById('addStatPrefix').value.trim()
        };
        if (!data.channel_id) return alert('���� ���� ������ �����');
        try {
            const res = await fetch('/api/guild/${guildId}/stat-channels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const json = await res.json();
            if (json.success) {
                alert('? �� ����� ���� ����������! ���� ������� ���� �����.');
                location.reload();
            } else {
                alert('? ' + (json.error || '��� ���'));
            }
        } catch(err) {
            alert('? ��� �� �������');
        }
    });
    </script>

</div>`;
            } else if (section === 'appearance') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">
                        
                        <!-- Header Banner -->
                        <div class="bg-gradient-to-r from-[#141724] via-[#1c1f2e] to-[#141724] border border-white/5 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-2xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center text-xl shadow-lg">?</div>
                                <div class="text-right">
                                    <h3 class="font-black text-white text-lg">����� �����</h3>
                                    <p class="text-gray-400 text-xs mt-0.5">��� ��� ����� ������ ����� ��� �����</p>
                                </div>
                            </div>
                            <!-- Server selector pill (Exact to image) -->
                            <div class="bg-[#0b0d14] border border-white/5 px-4 py-2 rounded-2xl flex items-center gap-2.5 shadow-inner">
                                <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                                <span class="text-xs font-bold text-white">${guild.name || "ZENO'BOT"}</span>
                                <div class="w-6 h-6 rounded-lg bg-purple-950/60 text-purple-300 text-xs font-black flex items-center justify-center border border-purple-500/30">Z</div>
                            </div>
                        </div>

                        <!-- Live Preview Card (Exact to Image 1 & 2) -->
                        <div class="bg-[#12141f] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                            <!-- Banner area -->
                            <div id="prevBannerBox" class="h-32 bg-cover bg-center relative transition-all flex items-center justify-center" style="background-image: url('${settings.bot_banner || ''}'); background-color: #1c1f2e;">
                                ${!settings.bot_banner ? `
                                    <div class="text-center">
                                        <h2 class="text-2xl font-black text-amber-100 tracking-wider shadow-sm">Best System Bot</h2>
                                        <p class="text-xs text-amber-200/80 font-mono mt-0.5">discord.gg/zeno</p>
                                    </div>
                                ` : ''}
                                <!-- Avatar Overlap -->
                                <div class="absolute -bottom-6 right-8 flex items-center gap-3">
                                    <div class="relative group">
                                        <img id="prevAvatarImg" src="${settings.bot_avatar || (botGuild?.members?.me?.user?.displayAvatarURL() || userAvatar)}" class="w-16 h-16 rounded-2xl bg-[#0b0d14] object-cover ring-4 ring-[#12141f] shadow-xl">
                                        <span class="w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-[#12141f] absolute -bottom-0.5 -right-0.5"></span>
                                    </div>
                                </div>
                            </div>
                            <div class="pt-8 pb-5 px-8 flex items-center justify-between">
                                <div class="text-left">
                                    <span class="text-[10px] text-gray-500 font-mono">ID: ${client?.user?.id || 'BOT_ID'}</span>
                                </div>
                                <div class="text-right">
                                    <h4 id="prevNickText" class="font-black text-white text-base">${settings.bot_nickname || client?.user?.username || 'ZENO'}</h4>
                                    <span class="text-[11px] text-gray-400 font-mono">@${client?.user?.username || 'zeno'}</span>
                                </div>
                            </div>
                        </div>

                        <!-- 1. ��� ����� �� ������� (Bot Nickname) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-3 shadow-xl">
                            <div class="flex items-center justify-between">
                                <div class="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-sm border border-purple-500/30">??</div>
                                <div class="text-right">
                                    <h4 class="font-black text-white text-sm">��� ����� �� �������</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">����� ��� ����� ������� �� ��� ������� ���</p>
                                </div>
                            </div>
                            <input type="text" name="bot_nickname" id="inpBotNick" value="${settings.bot_nickname || ''}" placeholder="${client?.user?.username || 'ZENO'}" oninput="document.getElementById('prevNickText').innerText = this.value || '${client?.user?.username || 'ZENO'}'" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-2xl px-5 py-3.5 text-xs text-white outline-none text-right font-bold transition">
                        </div>

                        <!-- 2. ��� ����� �� ������� (About Me) -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-3 shadow-xl">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <span id="aboutCount" class="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-lg">${(settings.bot_about || '').length}/190</span>
                                    <div class="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-sm border border-purple-500/30">??</div>
                                </div>
                                <div class="text-right">
                                    <h4 class="font-black text-white text-sm">��� ����� �� �������</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">����� ��� ����� (About Me) ������� �� ��� ������� ���</p>
                                </div>
                            </div>
                            <textarea name="bot_about" id="inpBotAbout" rows="3" maxlength="190" placeholder="���� ����� ����� �� ��� �������..." oninput="document.getElementById('aboutCount').innerText = this.value.length + '/190'" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-2xl px-5 py-3.5 text-xs text-white outline-none text-right leading-relaxed transition">${settings.bot_about || ''}</textarea>
                        </div>

                        <!-- 3. ���� ���� ����� �� ������� (Avatar & Banner 2-Grid) -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            
                            <!-- ���� ����� �� ������� -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl text-right">
                                <div class="flex items-center justify-between">
                                    <div class="w-8 h-8 rounded-xl bg-rose-600/20 text-rose-400 flex items-center justify-center text-sm border border-rose-500/30">??</div>
                                    <div>
                                        <h4 class="font-black text-white text-sm">���� ����� �� �������</h4>
                                        <p class="text-gray-400 text-[11px] mt-0.5">����� ���� ����� �������� �� ��� ������� ��� (Per-Server Avatar)</p>
                                    </div>
                                </div>

                                <div class="flex items-center justify-between p-4 bg-[#0b0d14] border border-white/5 rounded-2xl">
                                    <button type="button" onclick="document.getElementById('inpAvatarUrl').focus()" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5">
                                        <span>???</span>
                                        <span>���� ����</span>
                                    </button>
                                    <div class="flex items-center gap-3">
                                        <span class="text-[11px] text-gray-400">���� �� ���� ���� ���� �����</span>
                                        <img id="cardAvatarPreview" src="${settings.bot_avatar || (botGuild?.members?.me?.user?.displayAvatarURL() || userAvatar)}" class="w-10 h-10 rounded-xl object-cover ring-2 ring-purple-600/50">
                                    </div>
                                </div>
                                <input type="url" name="bot_avatar" id="inpAvatarUrl" value="${settings.bot_avatar || ''}" placeholder="https://i.imgur.com/... (���� ������ �������)" oninput="updateAvatarPreview(this.value)" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-left font-mono">
                            </div>

                            <!-- ��� ����� �� ������� -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl text-right">
                                <div class="flex items-center justify-between">
                                    <div class="w-8 h-8 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center text-sm border border-amber-500/30">???</div>
                                    <div>
                                        <h4 class="font-black text-white text-sm">��� ����� �� �������</h4>
                                        <p class="text-gray-400 text-[11px] mt-0.5">����� ��� ����� ������� �� ��� ������� ��� (Per-Server Banner)</p>
                                    </div>
                                </div>

                                <div class="flex items-center justify-between p-4 bg-[#0b0d14] border border-white/5 rounded-2xl">
                                    <button type="button" onclick="document.getElementById('inpBannerUrl').focus()" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5">
                                        <span>???</span>
                                        <span>���� ���</span>
                                    </button>
                                    <span class="text-[11px] text-gray-400">���� ���� ���� ����� �������</span>
                                </div>
                                <input type="url" name="bot_banner" id="inpBannerUrl" value="${settings.bot_banner || ''}" placeholder="https://i.imgur.com/... (���� ����� �������)" oninput="updateBannerPreview(this.value)" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-left font-mono">
                            </div>

                        </div>

                        <!-- Important Notes Alert (Exact to Image 2) -->
                        <div class="bg-[#12141f] border border-white/5 p-5 rounded-3xl space-y-2 text-right shadow-lg">
                            <div class="flex items-center justify-end gap-2 text-amber-400 font-bold text-xs">
                                <span>������� ����</span>
                                <span>??</span>
                            </div>
                            <ul class="text-[11px] text-gray-400 space-y-1 pr-2 list-none">
                                <li>� ����� ����� ������� ������ ���� ��� ��� ������� ������.</li>
                                <li>� �� ������ ���� ��������� ��� ����� �� ������� ��� ����� ��� ���.</li>
                                <li>� ����� ��� �� ���� ������ ������ ����� PNG �� JPG �� WEBP �� GIF.</li>
                            </ul>
                        </div>

                    </div>

                    <script>
                    function updateAvatarPreview(url) {
                        if (url) {
                            document.getElementById('prevAvatarImg').src = url;
                            document.getElementById('cardAvatarPreview').src = url;
                        }
                    }
                    function updateBannerPreview(url) {
                        const box = document.getElementById('prevBannerBox');
                        if (url) {
                            box.style.backgroundImage = 'url(' + url + ')';
                        }
                    }
                    </script>`;
            } else if (section === 'settings') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">
                        
                        <!-- Top Header Title -->
                        <div class="bg-gradient-to-r from-[#141724] via-[#1c1f2e] to-[#141724] border border-white/5 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-2xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center text-xl shadow-lg">??</div>
                                <div class="text-right">
                                    <h3 class="font-black text-white text-lg">��������� ������</h3>
                                    <p class="text-gray-400 text-xs mt-0.5">������� ����� ������ ${guild.name || "ZENO'BOT"}</p>
                                </div>
                            </div>
                            <div class="bg-[#0b0d14] border border-white/5 px-4 py-2 rounded-2xl flex items-center gap-2.5 shadow-inner">
                                <span class="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
                                <span class="text-xs font-bold text-white">${guild.name || "ZENO'BOT"}</span>
                                <div class="w-6 h-6 rounded-lg bg-purple-950/60 text-purple-300 text-xs font-black flex items-center justify-center border border-purple-500/30">Z</div>
                            </div>
                        </div>

                        <!-- Top 2-Grid: ������� (Prefix) & ��� ����� (Bot Language) - Exact to Image -->
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            
                            <!-- 1. ������� (Prefix) Card -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl flex flex-col justify-between shadow-xl">
                                <div>
                                    <div class="flex items-center justify-between mb-4">
                                        <span class="text-[10px] text-gray-500">Command Prefix</span>
                                        <h4 class="font-black text-white text-sm">������� (Prefix)</h4>
                                    </div>
                                    <input type="text" name="prefix" id="inpPrefix" value="${settings.prefix || '!'}" placeholder="!" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-2xl px-6 py-4 text-center text-xl text-white font-mono font-black outline-none shadow-inner transition">
                                </div>
                                <p class="text-[11px] text-gray-500 text-right mt-4">����� �������� ��� ������� ������</p>
                            </div>

                            <!-- 2. ��� ����� (Bot Language) Card with Flag Grid - Exact to Image -->
                            <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl shadow-xl space-y-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-[10px] text-purple-400 font-bold bg-purple-950/60 px-2 py-0.5 rounded-lg font-mono">LANG</span>
                                    <h4 class="font-black text-white text-sm">��� �����</h4>
                                </div>

                                <input type="hidden" name="bot_language" id="inpHiddenLang" value="${settings.bot_language || 'AR'}">

                                <div class="grid grid-cols-3 gap-2.5 text-center">
                                    <!-- IQ / AR -->
                                    <button type="button" onclick="selectBotLanguage('AR', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${(settings.bot_language || 'AR') === 'AR' ? 'bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10'}">
                                        <span class="text-xs font-black">IQ</span>
                                        <span class="text-[10px] font-bold text-gray-400">AR</span>
                                    </button>

                                    <!-- US / EN -->
                                    <button type="button" onclick="selectBotLanguage('EN', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'EN' ? 'bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10'}">
                                        <span class="text-xs font-black">US</span>
                                        <span class="text-[10px] font-bold text-gray-400">EN</span>
                                    </button>

                                    <!-- TR -->
                                    <button type="button" onclick="selectBotLanguage('TR', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'TR' ? 'bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10'}">
                                        <span class="text-xs font-black">TR</span>
                                        <span class="text-[10px] font-bold text-gray-400">TR</span>
                                    </button>

                                    <!-- RU -->
                                    <button type="button" onclick="selectBotLanguage('RU', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'RU' ? 'bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10'}">
                                        <span class="text-xs font-black">RU</span>
                                        <span class="text-[10px] font-bold text-gray-400">RU</span>
                                    </button>

                                    <!-- ES -->
                                    <button type="button" onclick="selectBotLanguage('ES', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'ES' ? 'bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10'}">
                                        <span class="text-xs font-black">ES</span>
                                        <span class="text-[10px] font-bold text-gray-400">ES</span>
                                    </button>

                                    <!-- FR -->
                                    <button type="button" onclick="selectBotLanguage('FR', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'FR' ? 'bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10'}">
                                        <span class="text-xs font-black">FR</span>
                                        <span class="text-[10px] font-bold text-gray-400">FR</span>
                                    </button>

                                    <!-- DE -->
                                    <button type="button" onclick="selectBotLanguage('DE', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'DE' ? 'bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10'}">
                                        <span class="text-xs font-black">DE</span>
                                        <span class="text-[10px] font-bold text-gray-400">DE</span>
                                    </button>

                                    <!-- BR / PT -->
                                    <button type="button" onclick="selectBotLanguage('PT', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'PT' ? 'bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10'}">
                                        <span class="text-xs font-black">BR</span>
                                        <span class="text-[10px] font-bold text-gray-400">PT</span>
                                    </button>

                                    <!-- JP / JA -->
                                    <button type="button" onclick="selectBotLanguage('JA', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'JA' ? 'bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10'}">
                                        <span class="text-xs font-black">JP</span>
                                        <span class="text-[10px] font-bold text-gray-400">JA</span>
                                    </button>
                                </div>
                            </div>

                        </div>

                        <!-- 3. ����� ����� �������� �������� (Auto-Clear Infractions) - Exact to Image -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-5 shadow-xl">
                            
                            <!-- Master Header & Switch -->
                            <div class="flex items-center justify-between border-b border-white/5 pb-4">
                                <label class="toggle">
                                    <input type="checkbox" name="auto_clear_punishments" value="1" ${settings.auto_clear_punishments ? 'checked' : ''} onchange="document.getElementById('autoClearContent').classList.toggle('opacity-40', !this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">����� ����� �������� ��������</h4>
                                        <p class="text-gray-400 text-xs mt-0.5">��� ���� ������ �������� �������� / ������� � �������� ������ �� ����� �������.</p>
                                    </div>
                                    <div class="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-sm border border-purple-500/30">??</div>
                                </div>
                            </div>

                            <div id="autoClearContent" class="space-y-4 ${settings.auto_clear_punishments ? '' : 'opacity-40'} transition-opacity">
                                <!-- ���� ������� (Clear Period Buttons) -->
                                <div>
                                    <span class="block text-xs font-bold text-gray-400 mb-2.5 text-right">���� �������</span>
                                    <input type="hidden" name="auto_clear_period" id="inpClearPeriod" value="${settings.auto_clear_period || 'week'}">
                                    
                                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <button type="button" onclick="selectClearPeriod('week', this)" class="period-btn py-3 px-4 rounded-2xl border text-xs font-bold transition ${(settings.auto_clear_period || 'week') === 'week' ? 'bg-purple-900/40 border-purple-500 text-white shadow-md' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white'}">
                                            �� �����
                                        </button>
                                        <button type="button" onclick="selectClearPeriod('2weeks', this)" class="period-btn py-3 px-4 rounded-2xl border text-xs font-bold transition ${settings.auto_clear_period === '2weeks' ? 'bg-purple-900/40 border-purple-500 text-white shadow-md' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white'}">
                                            �� �������
                                        </button>
                                        <button type="button" onclick="selectClearPeriod('3weeks', this)" class="period-btn py-3 px-4 rounded-2xl border text-xs font-bold transition ${settings.auto_clear_period === '3weeks' ? 'bg-purple-900/40 border-purple-500 text-white shadow-md' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white'}">
                                            �� 3 ������
                                        </button>
                                        <button type="button" onclick="selectClearPeriod('month', this)" class="period-btn py-3 px-4 rounded-2xl border text-xs font-bold transition ${settings.auto_clear_period === 'month' ? 'bg-purple-900/40 border-purple-500 text-white shadow-md' : 'bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white'}">
                                            �� ���
                                        </button>
                                    </div>
                                </div>

                                <!-- ����� �������� �������� (Punishment Types Pills) -->
                                <div>
                                    <span class="block text-xs font-bold text-gray-400 mb-2.5 text-right">����� �������� ��������</span>
                                    <div class="flex flex-wrap items-center gap-2 justify-end">
                                        <span class="px-3 py-1.5 rounded-xl bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-bold">�� �������</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">���</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">��� ����</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">����</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">���� ����</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">���</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">�����</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">���</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">����</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">����</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">���� ���</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#0b0d14] text-gray-400 border border-white/5 text-xs font-medium">���� ���</span>
                                    </div>
                                </div>
                            </div>

                        </div>

                        <!-- 4. ����� ����� (Danger Zone) - Exact to Image -->
                        <div class="bg-rose-950/20 border border-rose-500/30 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
                            <button type="button" onclick="confirmResetGuildData()" class="px-6 py-3 bg-gradient-to-r from-rose-700 to-red-600 hover:from-rose-600 hover:to-red-500 text-white rounded-2xl text-xs font-black transition shadow-lg flex items-center gap-2 shrink-0">
                                <span>??</span>
                                <span>����� ����� ������ �������</span>
                            </button>
                            <div class="text-right space-y-1">
                                <div class="flex items-center justify-end gap-2 text-rose-400 font-black text-sm">
                                    <span>����� �����</span>
                                    <span>??</span>
                                </div>
                                <p class="text-[11px] text-rose-300/80 leading-relaxed">
                                    ���� ������� �����. ���� �� ������ ����� ���� ������� ������� � ��������ʡ ������ɡ ��� �������ʡ �� ��� (��� ����� �������/������ �������ʡ ����� ������ ��� ��� reset).
                                </p>
                            </div>
                        </div>

                    </div>

                    <script>
                    function selectBotLanguage(lang, btn) {
                        document.getElementById('inpHiddenLang').value = lang;
                        document.querySelectorAll('.lang-btn').forEach(b => {
                            b.className = 'lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white hover:border-white/10';
                        });
                        btn.className = 'lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 bg-purple-900/30 border-purple-500 text-white font-black shadow-lg shadow-purple-950/50';
                    }

                    function selectClearPeriod(period, btn) {
                        document.getElementById('inpClearPeriod').value = period;
                        document.querySelectorAll('.period-btn').forEach(b => {
                            b.className = 'period-btn py-3 px-4 rounded-2xl border text-xs font-bold transition bg-[#0b0d14] border-white/5 text-gray-400 hover:text-white';
                        });
                        btn.className = 'period-btn py-3 px-4 rounded-2xl border text-xs font-bold transition bg-purple-900/40 border-purple-500 text-white shadow-md';
                    }

                    async function confirmResetGuildData() {
                        if (!confirm('?? ����� ���� �������:\\n�� ��� ����� ������ �� ����� ���� ������� ������ ������ ��� ������ѿ\\n�� ���� ������� �� ��� �������!')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/reset-data', { method: 'POST' });
                            const d = await res.json();
                            if (d.success) {
                                alert('? �� ����� ������ �������� ������� �����!');
                                location.reload();
                            } else {
                                alert('? ��� �������: ' + (d.error || '��� ���'));
                            }
                        } catch(e) {
                            alert('��� ��� �� �������');
                        }
                    }
                    </script>`;

            } else if (section === 'backup') {
                // Load backups from DB
                let backupsList = [];
                try {
                    rawDb.exec(`CREATE TABLE IF NOT EXISTS guild_backups (
                        id TEXT PRIMARY KEY,
                        guild_id TEXT NOT NULL,
                        created_by TEXT NOT NULL,
                        label TEXT DEFAULT '',
                        channels_count INTEGER DEFAULT 0,
                        roles_count INTEGER DEFAULT 0,
                        settings_snapshot TEXT,
                        channels_snapshot TEXT,
                        roles_snapshot TEXT,
                        created_at INTEGER DEFAULT (strftime('%s','now'))
                    )`);
                    backupsList = rawDb.prepare('SELECT id, guild_id, created_by, label, channels_count, roles_count, created_at FROM guild_backups WHERE guild_id = ? ORDER BY created_at DESC LIMIT 10').all(guildId);
                } catch(e) {}

                const backupRowsHtml = backupsList.length === 0 ? `
                    <div class="py-16 text-center space-y-3">
                        <div class="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center text-3xl mx-auto opacity-40">??</div>
                        <p class="text-gray-400 text-sm font-bold">�� ���� ��� �������� ���</p>
                        <p class="text-gray-600 text-xs">���� ����� ���� ������� ��� ����� �������</p>
                    </div>
                ` : backupsList.map(b => {
                    const date = new Date(b.created_at * 1000);
                    const dateStr = date.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    return `
                    <div class="bg-[#12141f] border border-white/5 hover:border-purple-500/30 rounded-2xl p-4 flex items-center justify-between gap-4 transition">
                        <div class="flex items-center gap-2">
                            <button onclick="restoreBackup('${b.id}', this)" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow transition">�������</button>
                            <button onclick="deleteBackup('${b.id}')" class="px-3 py-2 bg-rose-900/40 hover:bg-rose-700/50 text-rose-300 rounded-xl text-xs font-bold border border-rose-800/30 transition">???</button>
                        </div>
                        <div class="flex-1 text-right">
                            <div class="font-bold text-white text-sm">${b.label || ('���� ' + dateStr)}</div>
                            <div class="text-[11px] text-gray-400 mt-0.5 flex items-center justify-end gap-3">
                                <span>?? ${b.channels_count} ����</span>
                                <span>??? ${b.roles_count} ����</span>
                                <span class="text-gray-600 font-mono">${dateStr}</span>
                            </div>
                        </div>
                        <div class="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400 flex items-center justify-center text-lg">??</div>
                    </div>
                    `;
                }).join('');

formFieldsHtml = `<div class="space-y-6 text-right" dir="rtl">

    <!-- Header -->
    <div class="bg-gradient-to-r from-[#1a132e] via-[#12141f] to-[#1a132e] border border-purple-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
        <div class="flex items-center gap-3">
            <button onclick="createBackupNow(this)" class="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-lg transition">
                ����� ���� ���� ??
            </button>
        </div>
        <div class="text-right">
            <h3 class="font-black text-white text-xl">������� / ����� ����������</h3>
            <p class="text-gray-400 text-xs mt-0.5">����� ����� �� ����� ���� ������ ������ ����� ��</p>
        </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-3 gap-3">
        <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
            <div class="text-2xl font-black text-white">${backupsList.length}</div>
            <div class="text-xs text-gray-400 font-bold mt-1">����� �������</div>
        </div>
        <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
            <div class="text-2xl font-black text-purple-400">30</div>
            <div class="text-xs text-gray-400 font-bold mt-1">��� ������</div>
        </div>
        <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
            <div class="text-2xl font-black text-emerald-400">10</div>
            <div class="text-xs text-gray-400 font-bold mt-1">���� ����</div>
        </div>
    </div>

    <!-- Backups List -->
    <div class="bg-[#12141f] border border-white/5 rounded-3xl p-6 shadow-xl space-y-3">
        <div class="flex items-center justify-between pb-3 border-b border-white/5">
            <span class="text-xs text-purple-400 font-bold">${backupsList.length} ����</span>
            <h4 class="text-sm font-black text-white">?? ����� �������</h4>
        </div>
        ${backupRowsHtml}
    </div>

    <!-- Info Box -->
    <div class="bg-indigo-950/30 border border-indigo-800/30 rounded-2xl p-4 space-y-2">
        <div class="flex items-center justify-end gap-2">
            <h5 class="text-sm font-black text-indigo-300">������� ����</h5>
            <span class="text-indigo-400">??</span>
        </div>
        <ul class="space-y-1.5 text-right">
            <li class="text-xs text-gray-400 flex items-center justify-end gap-2"><span>��� �������� ������ ���� 30 ��� �� ���� ��������</span><span class="text-indigo-400">�</span></li>
            <li class="text-xs text-gray-400 flex items-center justify-end gap-2"><span>��������� �� ���� �������/����� ������ɡ �� ���� �������� ���</span><span class="text-indigo-400">�</span></li>
            <li class="text-xs text-gray-400 flex items-center justify-end gap-2"><span>��� ���� ������� �������� ��������� ������ ������� ��� ���������</span><span class="text-indigo-400">�</span></li>
        </ul>
    </div>

    <script>
    async function createBackupNow(btn) {
        const label = prompt('���� ����� ������ (�������):', '');
        if (label === null) return;
        const orig = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = '���� �������... ?'; }
        try {
            const r = await fetch('/api/guild/${guildId}/backup/create', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ label })
            });
            const d = await r.json();
            if (d.success) { alert('? �� ����� ������ ���������� �����!\n?? ' + d.channels_count + ' ���ɡ ??? ' + d.roles_count + ' ����'); location.reload(); }
            else alert('? ' + (d.error || '��� �������'));
        } catch(e) { alert('? ��� �� �������'); }
        if (btn) { btn.disabled = false; btn.textContent = orig; }
    }
    async function restoreBackup(id, btn) {
        if (!confirm('�� ��� ����� �� ������� ��� ������ ���������ɿ ���� ����� ������� �������� ���.')) return;
        const orig = btn ? btn.textContent : '�������';
        if (btn) { btn.disabled = true; btn.textContent = '���� ���������... ?'; }
        try {
            const r = await fetch('/api/guild/${guildId}/backup/' + id + '/restore', { method: 'POST' });
            const d = await r.json();
            if (d.success) alert('? ��� ��������� �����!\n' + (d.message || ''));
            else alert('? ' + (d.error || '���'));
        } catch(e) { alert('? ���'); }
        if (btn) { btn.disabled = false; btn.textContent = orig; }
    }
    async function deleteBackup(id) {
        if (!confirm('��� ��� ������ ���������ɿ')) return;
        try {
            const r = await fetch('/api/guild/${guildId}/backup/' + id + '/delete', { method: 'POST' });
            const d = await r.json();
            if (d.success) location.reload();
            else alert('? ' + (d.error || '��� �����'));
        } catch(e) { alert('? ���'); }
    }
    </script>

</div>`;
            } else if (section === 'staff-activity') {
                const staffList = (() => {
                    try {
                        return rawDb.prepare(`
                            SELECT user_id, tickets_closed, mod_actions, bans_count, kicks_count,
                                   mutes_count, warns_count, messages_count, voice_seconds,
                                   shift_seconds, total_shifts, points,
                                   (tickets_closed*10 + warns_count*3 + bans_count*5 + kicks_count*4 + 
                                    (voice_seconds/60) + messages_count + points) as total_points
                            FROM staff_activity WHERE guild_id = ?
                            ORDER BY shift_seconds DESC, total_points DESC LIMIT 50
                        `).all(guildId);
                    } catch(e) { return []; }
                })();

                const activeShifts = (() => {
                    try {
                        return rawDb.prepare("SELECT * FROM staff_shifts WHERE guild_id = ? AND status = 'active'").all(guildId);
                    } catch(e) { return []; }
                })();

                const totalShiftSeconds = staffList.reduce((s, x) => s + (x.shift_seconds || 0), 0);
                const totalShiftHours = (totalShiftSeconds / 3600).toFixed(1);
                const totalStaffActions = staffList.reduce((s, x) => s + (x.mod_actions || 0), 0);
                const totalStaffTickets = staffList.reduce((s, x) => s + (x.tickets_closed || 0), 0);
                const topPoints = staffList.reduce((m, x) => Math.max(m, x.points || 0), 0);

                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <!-- Header Banner -->
                        <div class="bg-gradient-to-r from-[#1a132e] via-[#12141f] to-[#1a132e] border border-purple-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl flex-wrap gap-3">
                            <div class="flex items-center gap-2">
                                <button type="button" onclick="sendStaffPanelDirect()" class="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-emerald-950/40 flex items-center gap-1.5 cursor-pointer">
                                    <span>?? ����� ���� ������ (Login/Logout)</span>
                                </button>
                                <button type="button" onclick="resetAllStaffStats()" class="px-4 py-2 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 rounded-xl text-xs font-bold transition cursor-pointer">
                                    ?? ����� ����������
                                </button>
                                <button type="button" onclick="location.reload()" class="px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 rounded-xl text-xs font-bold transition cursor-pointer">
                                    ? �����
                                </button>
                            </div>
                            <div class="text-right">
                                <h4 class="font-black text-white text-xl flex items-center gap-2 justify-end"><span>���� ��������� ���� �������</span><span>??</span></h4>
                                <p class="text-gray-400 text-xs mt-0.5">������ ����� ������ ����� �������ʡ ����� ������ ��������ݡ ����� ������� ������ ������</p>
                            </div>
                        </div>

                        <!-- Shift Control & Settings Form Card -->
                        <div class="bg-[#12141f] border border-white/5 p-6 rounded-3xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between pb-3 border-b border-white/5">
                                <span class="text-xs text-purple-400 font-bold">������� ������ ���������</span>
                                <h4 class="text-sm font-black text-white flex items-center gap-2"><span>��� ����� ����� �������</span><span>??</span></h4>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-1">���� ������� ������� �������� <span class="text-gray-400 font-normal">(������� - ���� ��� ������� ��������)</span></label>
                                    <select name="staff_role" id="staff_role" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer">
                                        <option value="">?? ���� ����� ������� ��������� (������)</option>
                                        ${guildRoles.map(r => `<option value="${r.id}" ${String(settings.staff_role) === String(r.id) ? 'selected' : ''}>@ ${r.name}</option>`).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-1">���� ���� ����� ������ ���������</label>
                                    ${renderChannelSelect('staff_login_channel', settings.staff_login_channel)}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-1">���� ����� ����� ������ (Logs)</label>
                                    ${renderChannelSelect('staff_log_channel', settings.staff_log_channel)}
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-1">���� ������ ������� �������� (��������)</label>
                                    <select name="staff_max_shift_hours" id="staff_max_shift_hours" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right cursor-pointer">
                                        <option value="1" ${Number(settings.staff_max_shift_hours) === 1 ? 'selected' : ''}>���� �����</option>
                                        <option value="2" ${Number(settings.staff_max_shift_hours) === 2 ? 'selected' : ''}>������</option>
                                        <option value="4" ${Number(settings.staff_max_shift_hours) === 4 ? 'selected' : ''}>4 �����</option>
                                        <option value="6" ${Number(settings.staff_max_shift_hours) === 6 ? 'selected' : ''}>6 �����</option>
                                        <option value="8" ${!settings.staff_max_shift_hours || Number(settings.staff_max_shift_hours) === 8 ? 'selected' : ''}>8 ����� (�������)</option>
                                        <option value="12" ${Number(settings.staff_max_shift_hours) === 12 ? 'selected' : ''}>12 ����</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-1">���� ��� ������� (���/�����)</label>
                                    <select name="staff_inactivity_minutes" id="staff_inactivity_minutes" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right cursor-pointer">
                                        <option value="15" ${Number(settings.staff_inactivity_minutes) === 15 ? 'selected' : ''}>15 �����</option>
                                        <option value="30" ${!settings.staff_inactivity_minutes || Number(settings.staff_inactivity_minutes) === 30 ? 'selected' : ''}>30 ����� (������)</option>
                                        <option value="45" ${Number(settings.staff_inactivity_minutes) === 45 ? 'selected' : ''}>45 �����</option>
                                        <option value="60" ${Number(settings.staff_inactivity_minutes) === 60 ? 'selected' : ''}>60 ����� (����)</option>
                                        <option value="0" ${Number(settings.staff_inactivity_minutes) === 0 ? 'selected' : ''}>���� (��� ���� ������ ���)</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-1">���� ���� ���� ������ (�������)</label>
                                    <input type="text" name="staff_banner_url" id="staff_banner_url" value="${settings.staff_banner_url || ''}" placeholder="https://..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-left font-mono">
                                </div>
                            </div>

                            <div class="pt-2">
                                <div class="flex items-center justify-between bg-[#0b0d14] border border-white/5 p-4 rounded-2xl">
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white flex items-center gap-2">
                                            <span>? ����� ������ �������� (Auto Logout)</span>
                                        </h5>
                                        <p class="text-[11px] text-gray-400 mt-0.5">���� ���� ������� �������� ��� ������ (AFK) �� ������ ������� �� ����� ������� ������� �� ������ ���� ������ �����</p>
                                    </div>
                                    <label class="toggle flex-shrink-0 mr-4">
                                        <input type="checkbox" name="staff_auto_logout" value="1" ${settings.staff_auto_logout !== 0 ? 'checked' : ''} onchange="saveProtectionSetting('staff_auto_logout', this.checked)">
                                        <span class="slider"></span>
                                    </label>
                                </div>
                            </div>

                            <div class="flex justify-end pt-2">
                                <button type="button" onclick="saveStaffSettingsQuick()" class="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black transition shadow-lg">
                                    ��� ������� ������� ??
                                </button>
                            </div>
                        </div>

                        <!-- Active Shifts Live Alert Card -->
                        ${activeShifts.length > 0 ? `
                        <div class="bg-gradient-to-r from-emerald-950/40 via-[#12141f] to-emerald-950/40 border border-emerald-500/30 p-4 rounded-3xl flex items-center justify-between shadow-xl flex-wrap gap-3">
                            <div class="flex items-center gap-2 flex-wrap">
                                ${activeShifts.map(s => {
                                    const mObj = botGuild?.members?.cache?.get(s.user_id);
                                    const dName = mObj ? mObj.user.tag : s.user_id;
                                    return `<span class="px-2.5 py-1 bg-emerald-900/50 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-1">?? ${dName} (<t:${s.start_time}:R>)</span>`;
                                }).join('')}
                            </div>
                            <div class="text-right flex items-center gap-2">
                                <div>
                                    <h5 class="text-xs font-black text-emerald-400">�� ������ ������ (${activeShifts.length} �����)</h5>
                                    <p class="text-[10px] text-gray-400">������� ������ ���� ��������� ������� ����� ������� ����</p>
                                </div>
                                <span class="w-3 h-3 rounded-full bg-emerald-400 animate-ping"></span>
                            </div>
                        </div>
                        ` : ''}

                        <!-- Stats Overview Cards -->
                        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div class="bg-[#12141f] border border-purple-500/20 p-5 rounded-2xl text-right">
                                <div class="text-2xl font-black text-purple-400">${staffList.length}</div>
                                <div class="text-xs text-gray-400 font-bold mt-1">������� ������</div>
                            </div>
                            <div class="bg-[#12141f] border border-emerald-500/20 p-5 rounded-2xl text-right">
                                <div class="text-2xl font-black text-emerald-400">${totalShiftHours} ����</div>
                                <div class="text-xs text-gray-400 font-bold mt-1">������ ����� ����� �������</div>
                            </div>
                            <div class="bg-[#12141f] border border-amber-500/20 p-5 rounded-2xl text-right">
                                <div class="text-2xl font-black text-amber-400">${totalStaffActions}</div>
                                <div class="text-xs text-gray-400 font-bold mt-1">������� ������</div>
                            </div>
                            <div class="bg-[#12141f] border border-cyan-500/20 p-5 rounded-2xl text-right">
                                <div class="text-2xl font-black text-cyan-400">${totalStaffTickets}</div>
                                <div class="text-xs text-gray-400 font-bold mt-1">����� �����</div>
                            </div>
                            <div class="bg-[#12141f] border border-blue-500/20 p-5 rounded-2xl text-right">
                                <div class="text-2xl font-black text-blue-400">${topPoints}</div>
                                <div class="text-xs text-gray-400 font-bold mt-1">���� ���� ����</div>
                            </div>
                        </div>

                        <!-- Staff Leaderboard Table -->
                        <div class="bg-[#12141f] border border-white/5 rounded-3xl p-6 shadow-xl space-y-4">
                            <div class="flex items-center justify-between pb-3 border-b border-white/5">
                                <span class="text-xs text-purple-400 font-bold">${staffList.length} ����� ����</span>
                                <h4 class="text-sm font-black text-white flex items-center gap-2"><span>���� ����� ������ ��������</span><span>??</span></h4>
                            </div>

                            ${staffList.length === 0 ? `
                                <div class="py-12 text-center space-y-3">
                                    <div class="text-5xl">??</div>
                                    <p class="text-gray-400 text-sm font-bold">�� ���� ���� ���� �������� ��� ����</p>
                                    <p class="text-gray-500 text-xs">���� ���� ������ ��� ���� ������� ������ ���� ������� ��� ����� ���������</p>
                                </div>
                            ` : `
                                <div class="overflow-x-auto">
                                    <table class="w-full text-right text-xs min-w-[750px]">
                                        <thead>
                                            <tr class="text-gray-500 border-b border-white/5">
                                                <th class="pb-3 pr-3 font-bold">#</th>
                                                <th class="pb-3 font-bold">������</th>
                                                <th class="pb-3 text-center font-bold text-emerald-400">?? ����� �������</th>
                                                <th class="pb-3 text-center font-bold">?? �������</th>
                                                <th class="pb-3 text-center font-bold">?? �����</th>
                                                <th class="pb-3 text-center font-bold">?? �������</th>
                                                <th class="pb-3 text-center font-bold text-purple-400">? ���� ������</th>
                                                <th class="pb-3 text-center font-bold">�������</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-white/5">
                                            ${staffList.map((st, i) => {
                                                const activeObj = activeShifts.find(as => as.user_id === st.user_id);
                                                const currentLiveSeconds = activeObj ? Math.max(0, Math.floor(Date.now() / 1000) - activeObj.start_time) : 0;
                                                const effectiveSeconds = (st.shift_seconds || 0) + currentLiveSeconds;
                                                const sHours = Math.floor(effectiveSeconds / 3600);
                                                const sMins = Math.floor((effectiveSeconds % 3600) / 60);
                                                const memberObj = botGuild?.members?.cache?.get(st.user_id);
                                                const displayName = memberObj ? memberObj.user.tag : st.user_id;
                                                const badge = i === 0 ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : i === 1 ? 'bg-gray-300/20 text-gray-300 border-gray-400/30' : i === 2 ? 'bg-orange-700/20 text-orange-400 border-orange-600/30' : 'bg-purple-600/20 text-purple-300 border-purple-500/30';
                                                const isOnline = !!activeObj;
                                                return `
                                                <tr class="hover:bg-white/5 transition">
                                                    <td class="py-3.5 pr-3"><span class="w-7 h-7 rounded-lg border ${badge} flex items-center justify-center font-mono text-[11px] font-black">${i + 1}</span></td>
                                                    <td class="py-3.5 font-bold text-white font-mono text-[11px]">
                                                        <div class="flex items-center gap-2">
                                                            <div class="relative">
                                                                <div class="w-7 h-7 rounded-full bg-purple-900/50 flex items-center justify-center text-[10px]">??</div>
                                                                ${isOnline ? '<span class="w-2.5 h-2.5 rounded-full bg-emerald-400 absolute -bottom-0.5 -right-0.5 ring-2 ring-[#12141f]"></span>' : ''}
                                                            </div>
                                                            <div>
                                                                <span>${displayName}</span>
                                                                ${isOnline ? '<span class="text-[9px] text-emerald-400 block">?? �� ������ ����</span>' : ''}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td class="py-3.5 text-center font-mono font-black text-emerald-400 text-sm">${sHours}� ${sMins}�</td>
                                                    <td class="py-3.5 text-center font-mono font-bold text-gray-300">${st.total_shifts || 0}</td>
                                                    <td class="py-3.5 text-center font-mono font-bold text-cyan-400">${st.tickets_closed || 0}</td>
                                                    <td class="py-3.5 text-center font-mono font-bold text-amber-400">${st.mod_actions || 0}</td>
                                                    <td class="py-3.5 text-center font-mono font-black text-purple-400 text-sm">${Number(st.points || 0).toLocaleString()}</td>
                                                    <td class="py-3.5 text-center">
                                                        <button type="button" onclick="modifyStaffPointsPrompt('${st.user_id}', '${displayName}')" class="px-2.5 py-1 bg-purple-600/30 hover:bg-purple-600 text-purple-200 rounded-lg text-[10px] font-bold transition">
                                                            ? ����� ������
                                                        </button>
                                                    </td>
                                                </tr>
                                                `;
                                            }).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            `}
                        </div>
                    </div>

                    <script>
                    async function saveStaffSettingsQuick() {
                        const role = document.getElementById('staff_role')?.value;
                        const loginCh = document.getElementById('staff_login_channel')?.value;
                        const logCh = document.getElementById('staff_log_channel')?.value;
                        const bannerUrl = document.querySelector('input[name="staff_banner_url"]')?.value;

                        const maxHours = document.getElementById('staff_max_shift_hours')?.value;
                        const inactMins = document.getElementById('staff_inactivity_minutes')?.value;

                        try {
                            const r = await fetch('/api/guild/${guildId}/settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    staff_role: role,
                                    staff_login_channel: loginCh,
                                    staff_log_channel: logCh,
                                    staff_banner_url: bannerUrl,
                                    staff_max_shift_hours: parseInt(maxHours, 10) || 8,
                                    staff_inactivity_minutes: parseInt(inactMins, 10) ?? 30
                                })
                            });
                            const d = await r.json();
                            if (d.success) alert('? �� ��� ������� ���� ������� �����!');
                            else alert('? ' + (d.error || '��� �����'));
                        } catch(e) { alert('��� �� �������'); }
                    }

                    async function sendStaffPanelDirect() {
                        const loginCh = document.getElementById('staff_login_channel')?.value;
                        if (!loginCh) return alert('���� ����� ���� ���� ����� ������ ����� ������.');
                        if (!confirm('�� ���� ����� ���� ������ ��������� ���� �� ������ ������ɿ')) return;

                        try {
                            const r = await fetch('/api/guild/${guildId}/staff/send-panel', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ channelId: loginCh })
                            });
                            const d = await r.json();
                            if (d.success) alert('? �� ����� ���� ������ ��������� ����� �� ������!');
                            else alert('? ' + (d.error || '��� �������'));
                        } catch(e) { alert('��� �� ������� �������'); }
                    }

                    async function modifyStaffPointsPrompt(userId, name) {
                        const pts = prompt('���� ��� ������ ������ ������� ' + name + ':', '100');
                        if (pts === null || isNaN(pts)) return;

                        try {
                            const r = await fetch('/api/guild/${guildId}/staff/set-points', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId, points: parseInt(pts, 10) })
                            });
                            const d = await r.json();
                            if (d.success) { alert('? �� ����� ���� ������� �����'); location.reload(); }
                            else alert('? ' + (d.error || '��� �������'));
                        } catch(e) { alert('��� �� �������'); }
                    }

                    async function resetAllStaffStats() {
                        if (!confirm('�� ��� ����� �� ����� ���� �������� ������ ���� ������ɿ �� ���� ������� �� ��� �������.')) return;
                        try {
                            const r = await fetch('/api/guild/${guildId}/staff/reset', { method: 'POST' });
                            const d = await r.json();
                            if (d.success) { alert('? �� ����� �������� ������ �������� �����'); location.reload(); }
                            else alert('? ' + (d.error || '���'));
                        } catch(e) { alert('��� �� ������� ��������'); }
                    }
                    </script>
                `;
            } else if (section === 'applications') {
                const appsList = database.getApplications(guildId) || [];
                const pendingSubmissions = database.getPendingSubmissions(guildId) || [];

                const appsCardsHtml = appsList.length === 0 ? `
                    <div class="py-12 text-center space-y-3 bg-[#12141f] border border-white/5 rounded-3xl">
                        <div class="w-16 h-16 rounded-2xl bg-purple-600/10 text-purple-400 flex items-center justify-center text-3xl mx-auto border border-purple-500/20">??</div>
                        <h4 class="text-white font-bold text-sm">�� ���� ����� ����� ������</h4>
                        <p class="text-gray-400 text-xs">���� ��� �� "����� ����� ����" ������� ������ ��� ������� �����</p>
                    </div>
                ` : appsList.map(a => {
                    let questions = [];
                    try { questions = typeof a.questions === 'string' ? JSON.parse(a.questions) : a.questions; } catch(e) { questions = []; }
                    const logChanName = botGuild?.channels?.cache?.get(a.log_channel)?.name || '��� �����';
                    const roleName = botGuild?.roles?.cache?.get(a.accepted_role)?.name || '���� ���� �������';
                    const reviewerRoleName = botGuild?.roles?.cache?.get(a.reviewer_role)?.name || '������� (Manage Server)';

                    return `
                    <div class="bg-[#12141f] border border-white/5 hover:border-purple-500/30 rounded-3xl p-6 transition space-y-4 shadow-xl">
                        <div class="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-white/5">
                            <div class="flex items-center gap-2">
                                <button type="button" onclick="sendAppPanel('${a.id}', this)" class="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow">
                                    <span>?? ����� ������ �� ������</span>
                                </button>
                                <button type="button" onclick="editAppForm('${a.id}')" class="px-3 py-1.5 bg-[#1a1d2d] hover:bg-[#23273c] text-purple-300 border border-purple-500/30 rounded-xl text-xs font-bold transition">
                                    ?? �����
                                </button>
                                <button type="button" onclick="deleteAppForm('${a.id}')" class="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 rounded-xl text-xs font-bold transition">
                                    ??? ���
                                </button>
                            </div>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">${a.title}</h4>
                                    <p class="text-gray-400 text-xs mt-0.5">${a.description || '���� ���'}</p>
                                </div>
                                <div class="w-10 h-10 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-xl border border-purple-500/30">??</div>
                            </div>
                        </div>

                        <!-- Meta Info Grid -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-right">
                            <div class="bg-[#0b0d14] p-3 rounded-2xl border border-white/5">
                                <span class="text-[10px] text-gray-500 block font-bold">���� ������� �������</span>
                                <span class="text-xs font-black text-purple-300">#${logChanName}</span>
                            </div>
                            <div class="bg-[#0b0d14] p-3 rounded-2xl border border-white/5">
                                <span class="text-[10px] text-gray-500 block font-bold">���� ��������� ���������</span>
                                <span class="text-xs font-black text-emerald-400">@${roleName}</span>
                            </div>
                            <div class="bg-[#0b0d14] p-3 rounded-2xl border border-white/5">
                                <span class="text-[10px] text-gray-500 block font-bold">���� ������ ��������</span>
                                <span class="text-xs font-black text-amber-400">@${reviewerRoleName}</span>
                            </div>
                        </div>

                        <!-- Questions List preview -->
                        <div class="space-y-1.5 pt-1">
                            <span class="text-[11px] font-bold text-gray-400 block text-right">������� ������� (${questions.length}/5):</span>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                                ${questions.map((q, idx) => {
                                    const qText = typeof q === 'object' ? q.text : q;
                                    const qType = typeof q === 'object' && q.type === 'short' ? '����� �����' : '����';
                                    return `
                                    <div class="bg-[#0b0d14]/70 p-2.5 rounded-xl border border-white/5 text-right flex items-center justify-between">
                                        <span class="text-[10px] bg-purple-950/60 text-purple-300 px-2 py-0.5 rounded-lg border border-purple-800/30">${qType}</span>
                                        <span class="text-xs text-gray-300 font-bold truncate max-w-[200px]">${idx + 1}. ${qText}</span>
                                    </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                    `;
                }).join('');

                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <!-- Top Header Banner -->
                        <div class="bg-gradient-to-r from-[#1a132e] via-[#12141f] to-[#1a132e] border border-purple-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl flex-wrap gap-4">
                            <div class="flex items-center gap-3">
                                <button type="button" onclick="openCreateAppModal()" class="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-2">
                                    <span>+ ����� ����� ����</span>
                                </button>
                            </div>
                            <div class="text-right">
                                <h3 class="font-black text-white text-xl flex items-center gap-2 justify-end"><span>���� ��������� ��������</span><span>??</span></h3>
                                <p class="text-gray-400 text-xs mt-0.5">���� ����� ����� ����ɡ ��� ������ɡ ������� ������� �� ���� ����� �� ������� ������ ������ ���������</p>
                            </div>
                        </div>

                        <!-- Quick Stats -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
                                <div class="text-2xl font-black text-white">${appsList.length}</div>
                                <div class="text-xs text-gray-400 font-bold mt-1">������ �������</div>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
                                <div class="text-2xl font-black text-purple-400">${pendingSubmissions.length}</div>
                                <div class="text-xs text-gray-400 font-bold mt-1">����� ������� ��������</div>
                            </div>
                            <div class="bg-[#12141f] border border-white/5 p-4 rounded-2xl text-center">
                                <div class="text-2xl font-black text-emerald-400">${appsList.filter(a => a.status === 'open').length}</div>
                                <div class="text-xs text-gray-400 font-bold mt-1">������� ��������</div>
                            </div>
                        </div>

                        <!-- Application Forms List -->
                        <div class="space-y-4">
                            <div class="flex items-center justify-between">
                                <span class="text-xs text-purple-400 font-bold">${appsList.length} ����� ���</span>
                                <h4 class="text-sm font-black text-white">?? ����� ������� �������</h4>
                            </div>
                            ${appsCardsHtml}
                        </div>

                        <!-- Create/Edit Form Modal Overlay -->
                        <div id="appModalOverlay" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
                            <div class="bg-[#12141f] border border-purple-500/30 rounded-3xl w-full max-w-2xl p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto text-right" dir="rtl">
                                <div class="flex items-center justify-between pb-3 border-b border-white/5">
                                    <button type="button" onclick="closeAppModal()" class="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center text-sm font-bold">?</button>
                                    <h4 id="appModalTitle" class="text-base font-black text-white">����� ����� ����� ���� ??</h4>
                                </div>

                                <input type="hidden" id="modalAppId" value="">

                                <div class="space-y-3">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1">��� ������� (�������) <span class="text-purple-400">*</span></label>
                                        <input type="text" id="appTitleInput" placeholder="����: ����� ������� / ����� ����� �����" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-bold">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1">��� ������� (�������)</label>
                                        <input type="text" id="appDescInput" placeholder="��� ����� �� ������ �� ������ ��������..." class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                    </div>
                                </div>

                                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1">���� ������� ������� <span class="text-purple-400">*</span></label>
                                        ${renderChannelSelect('appLogChannel', '')}
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1">���� ������ ��������</label>
                                        ${renderRoleSelect('appAcceptedRole', '')}
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1">���� ������ ��������</label>
                                        ${renderRoleSelect('appReviewerRole', '')}
                                    </div>
                                </div>

                                <!-- ���� ���� ������� (Wicks-Style) -->
                                <div class="bg-[#0b0d14] border border-white/5 rounded-2xl p-4 space-y-3">
                                    <div class="flex items-center justify-between">
                                        <button type="button" onclick="clearUploadedImageInDOM('app_panel_image')" class="text-[11px] text-rose-400 hover:text-rose-300 font-bold">??? ����� ������</button>
                                        <div class="flex items-center gap-1.5">
                                            <span class="text-xs font-bold text-white">���� ���� ����� ������� (�������)</span>
                                            <span class="text-purple-400">???</span>
                                        </div>
                                    </div>
                                    <div class="flex flex-col sm:flex-row items-center gap-3">
                                        <div class="w-full sm:w-44 h-20 rounded-xl border border-white/10 bg-[#12141f] overflow-hidden flex items-center justify-center relative">
                                            <img id="img_app_panel_image" src="" class="w-full h-full object-cover hidden">
                                            <div id="placeholder_app_panel_image" class="text-gray-500 text-xs flex flex-col items-center">
                                                <span class="text-xl">???</span>
                                                <span class="text-[10px]">�� ���� ����</span>
                                            </div>
                                        </div>
                                        <div class="flex-1 space-y-2 w-full">
                                            <input type="hidden" id="input_app_panel_image" value="">
                                            <input type="file" id="file_app_panel_image" accept="image/*" class="hidden" onchange="uploadImageFile(this, 'app_panel_image')">
                                            <button type="button" onclick="document.getElementById('file_app_panel_image').click()" class="w-full px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5">
                                                <span>??</span>
                                                <span id="btn_text_app_panel_image">��� ���� �������</span>
                                            </button>
                                            <p class="text-[10px] text-gray-500 text-right">���� ����� ������ ���� ��� ������� �� ������</p>
                                        </div>
                                    </div>
                                </div>

                                <!-- Questions Builder (Up to 5) -->
                                <div class="space-y-3 pt-2">
                                    <div class="flex items-center justify-between">
                                        <button type="button" onclick="addQuestionField()" id="btnAddQ" class="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 rounded-xl text-xs font-bold transition">
                                            + ����� ���� (��� 5)
                                        </button>
                                        <span class="text-xs font-bold text-white">����� ����� ������� (Discord Modal)</span>
                                    </div>
                                    <div id="modalQuestionsContainer" class="space-y-2.5"></div>
                                </div>

                                <div class="flex items-center justify-end gap-3 pt-3 border-t border-white/5">
                                    <button type="button" onclick="closeAppModal()" class="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl text-xs font-bold transition">�����</button>
                                    <button type="button" onclick="saveAppForm()" id="btnSaveApp" class="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition shadow-lg">��� ������� ??</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <script>
                    let currentQuestions = [];
                    const allAppsData = ${JSON.stringify(appsList)};

                    function openCreateAppModal() {
                        document.getElementById('modalAppId').value = '';
                        document.getElementById('appModalTitle').textContent = '����� ����� ����� ���� ??';
                        document.getElementById('appTitleInput').value = '';
                        document.getElementById('appDescInput').value = '';
                        document.getElementById('appLogChannel').value = '';
                        document.getElementById('appAcceptedRole').value = '';
                        document.getElementById('appReviewerRole').value = '';
                        clearUploadedImageInDOM('app_panel_image');
                        currentQuestions = [
                            { text: '�� �� ���� ������� ������', type: 'short' },
                            { text: '�� �� ������ ������� �� ������� �� ������', type: 'paragraph' },
                            { text: '����� ���� ��������� ��� ���� �����', type: 'paragraph' }
                        ];
                        renderModalQuestions();
                        document.getElementById('appModalOverlay').classList.remove('hidden');
                    }

                    function editAppForm(id) {
                        const app = allAppsData.find(a => String(a.id) === String(id));
                        if (!app) return alert('������� ��� �����');

                        document.getElementById('modalAppId').value = app.id;
                        document.getElementById('appModalTitle').textContent = '����� �����: ' + app.title;
                        document.getElementById('appTitleInput').value = app.title;
                        document.getElementById('appDescInput').value = app.description || '';
                        document.getElementById('appLogChannel').value = app.log_channel || '';
                        document.getElementById('appAcceptedRole').value = app.accepted_role || '';
                        document.getElementById('appReviewerRole').value = app.reviewer_role || '';

                        const panelImg = app.panel_image || '';
                        document.getElementById('input_app_panel_image').value = panelImg;
                        const imgEl = document.getElementById('img_app_panel_image');
                        const phEl = document.getElementById('placeholder_app_panel_image');
                        if (panelImg) {
                            if (imgEl) { imgEl.src = panelImg; imgEl.classList.remove('hidden'); }
                            if (phEl) phEl.classList.add('hidden');
                        } else {
                            if (imgEl) { imgEl.src = ''; imgEl.classList.add('hidden'); }
                            if (phEl) phEl.classList.remove('hidden');
                        }

                        try {
                            const parsed = typeof app.questions === 'string' ? JSON.parse(app.questions) : app.questions;
                            currentQuestions = parsed.map(q => typeof q === 'object' ? q : { text: String(q), type: 'paragraph' });
                        } catch(e) {
                            currentQuestions = [{ text: '������ �����', type: 'paragraph' }];
                        }

                        renderModalQuestions();
                        document.getElementById('appModalOverlay').classList.remove('hidden');
                    }

                    function closeAppModal() {
                        document.getElementById('appModalOverlay').classList.add('hidden');
                    }

                    function addQuestionField() {
                        if (currentQuestions.length >= 5) return alert('���� �� ������ ������� �� ������� �� 5 �����');
                        currentQuestions.push({ text: '', type: 'paragraph' });
                        renderModalQuestions();
                    }

                    function removeQuestionField(idx) {
                        currentQuestions.splice(idx, 1);
                        renderModalQuestions();
                    }

                    function updateQuestionText(idx, val) {
                        if (currentQuestions[idx]) currentQuestions[idx].text = val;
                    }

                    function updateQuestionType(idx, val) {
                        if (currentQuestions[idx]) currentQuestions[idx].type = val;
                    }

                    function renderModalQuestions() {
                        const container = document.getElementById('modalQuestionsContainer');
                        if (currentQuestions.length === 0) {
                            container.innerHTML = '<p class="text-xs text-gray-500 text-center py-2">�� ���� ����� �����. ���� ��� "+ ����� ����"</p>';
                            return;
                        }

                        let html = '';
                        for (let i = 0; i < currentQuestions.length; i++) {
                            const q = currentQuestions[i];
                            html += '<div class="bg-[#0b0d14] border border-white/5 p-3 rounded-2xl space-y-2">' +
                                '<div class="flex items-center justify-between">' +
                                '<div class="flex items-center gap-2">' +
                                '<select onchange="updateQuestionType(' + i + ', this.value)" class="bg-[#12141f] border border-white/5 text-purple-300 text-[11px] font-bold rounded-xl px-2.5 py-1 outline-none">' +
                                '<option value="paragraph" ' + (q.type === 'paragraph' ? 'selected' : '') + '>���� ����� (Paragraph)</option>' +
                                '<option value="short" ' + (q.type === 'short' ? 'selected' : '') + '>����� ����� (Short Answer)</option>' +
                                '</select>' +
                                '<button type="button" onclick="removeQuestionField(' + i + ')" class="text-rose-400 hover:text-rose-300 text-xs px-2 py-0.5 rounded bg-rose-950/40">? ���</button>' +
                                '</div>' +
                                '<span class="text-xs font-bold text-gray-300">������ #' + (i + 1) + '</span>' +
                                '</div>' +
                                '<input type="text" placeholder="���� �� ������ ���..." value="' + (q.text || '') + '" oninput="updateQuestionText(' + i + ', this.value)" class="w-full bg-[#12141f] border border-white/5 focus:border-purple-600 rounded-xl px-3 py-2 text-xs text-white text-right outline-none">' +
                                '</div>';
                        }
                        container.innerHTML = html;
                    }

                    async function saveAppForm() {
                        const id = document.getElementById('modalAppId').value;
                        const title = document.getElementById('appTitleInput').value.trim();
                        const desc = document.getElementById('appDescInput').value.trim();
                        const logChannel = document.getElementById('appLogChannel').value;
                        const acceptedRole = document.getElementById('appAcceptedRole').value;
                        const reviewerRole = document.getElementById('appReviewerRole').value;
                        const panelImage = document.getElementById('input_app_panel_image') ? document.getElementById('input_app_panel_image').value : '';

                        if (!title) return alert('���� ����� ����� �������');
                        if (!logChannel) return alert('���� ������ ���� ������� �������');
                        const validQuestions = currentQuestions.filter(q => q.text.trim());
                        if (validQuestions.length === 0) return alert('���� ����� ���� ���� ��� ����� �������');

                        const btn = document.getElementById('btnSaveApp');
                        btn.disabled = true; btn.textContent = '���� �����...';

                        try {
                            const endpoint = id ? ('/api/guild/${guildId}/applications/' + id + '/update') : '/api/guild/${guildId}/applications/create';
                            const r = await fetch(endpoint, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    title, description: desc,
                                    log_channel: logChannel,
                                    accepted_role: acceptedRole,
                                    reviewer_role: reviewerRole,
                                    questions: validQuestions,
                                    panel_image: panelImage
                                })
                            });
                            const d = await r.json();
                            if (d.success) {
                                alert('? �� ��� ����� ������� �����!');
                                location.reload();
                            } else {
                                alert('? ���: ' + (d.error || '��� �����'));
                            }
                        } catch(e) {
                            alert('��� ��� �� ������� �������');
                        } finally {
                            btn.disabled = false; btn.textContent = '��� ������� ??';
                        }
                    }

                    async function deleteAppForm(id) {
                        if (!confirm('�� ��� ����� �� ��� ����� ������� ��ǿ ���� ��� ���� ������� �������� ��.')) return;
                        try {
                            const r = await fetch('/api/guild/${guildId}/applications/' + id + '/delete', { method: 'POST' });
                            const d = await r.json();
                            if (d.success) {
                                alert('? �� ��� ������� �����');
                                location.reload();
                            } else {
                                alert('? ���: ' + (d.error || '��� �����'));
                            }
                        } catch(e) {
                            alert('��� ��� �� �������');
                        }
                    }

                    async function sendAppPanel(id, btn) {
                        if (btn) {
                            btn.disabled = true;
                            btn.innerHTML = '���� �������... ?';
                        }
                        try {
                            const r = await fetch('/api/guild/${guildId}/applications/' + id + '/send-panel', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({})
                            });
                            const d = await r.json();
                            if (d.success) {
                                if (btn) {
                                    btn.innerHTML = '�� ������� ������ �����! ?';
                                    btn.classList.remove('bg-purple-600', 'hover:bg-purple-500');
                                    btn.classList.add('bg-emerald-600');
                                    setTimeout(() => {
                                        btn.innerHTML = '����� ����� �� ��� ??';
                                        btn.classList.remove('bg-emerald-600');
                                        btn.classList.add('bg-purple-600', 'hover:bg-purple-500');
                                        btn.disabled = false;
                                    }, 3000);
                                } else {
                                    alert('? �� ����� ����� ��� ������� �� ������ ����� �����!');
                                }
                            } else {
                                alert('? ' + (d.error || '��� ������� ���� �� ��� ������ �� �������'));
                                if (btn) {
                                    btn.innerHTML = '����� ����� �� ��� ??';
                                    btn.disabled = false;
                                }
                            }
                        } catch(e) {
                            alert('��� �� ������� ��������');
                            if (btn) {
                                btn.innerHTML = '����� ����� �� ��� ??';
                                btn.disabled = false;
                            }
                        }
                    }
                    </script>
                `;
            } else if (section === 'embed') {
                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <!-- Top Toolbar & Status -->
                        <div class="bg-gradient-to-r from-[#12141f] via-[#161828] to-[#12141f] border border-purple-500/30 p-4 sm:p-5 rounded-3xl shadow-xl flex flex-wrap items-center justify-between gap-4">
                            <div class="flex items-center gap-2.5 flex-wrap">
                                <button type="button" id="btnSendEmbed" onclick="if(window.sendEmbedDirect)window.sendEmbedDirect()"
                                    class="px-6 py-3 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs rounded-2xl shadow-lg shadow-purple-950/60 border border-purple-400/40 flex items-center gap-2 cursor-pointer transition active:scale-95">
                                    <span class="text-base">??</span>
                                    <span>����� ������ ����</span>
                                </button>
                                <button type="button" id="btnSaveEmbedDraft" onclick="if(window.saveEmbedDraft)window.saveEmbedDraft()"
                                    class="px-4 py-3 bg-[#0b0d14] hover:bg-white/5 text-gray-300 hover:text-white font-bold text-xs rounded-2xl border border-white/10 flex items-center gap-1.5 cursor-pointer transition active:scale-95">
                                    <span>??</span>
                                    <span>��� �����</span>
                                </button>
                                <button type="button" id="btnClearEmbed" onclick="if(window.clearEmbedFields)window.clearEmbedFields()"
                                    class="px-4 py-3 bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 font-bold text-xs rounded-2xl border border-rose-800/40 flex items-center gap-1.5 cursor-pointer transition active:scale-95">
                                    <span>???</span>
                                    <span>��� ����</span>
                                </button>
                            </div>

                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h3 class="font-black text-white text-base sm:text-lg flex items-center gap-2 justify-end">
                                        <span>���� ����� ������� �������</span>
                                        <span class="text-purple-400">?</span>
                                    </h3>
                                    <p class="text-[11px] text-gray-400">��� ����� ����� ���� �� ������ ������� ����� ���� �����</p>
                                </div>
                                <div class="w-11 h-11 rounded-2xl bg-purple-600/20 border border-purple-500/30 text-purple-300 flex items-center justify-center text-xl shadow-inner">
                                    ??
                                </div>
                            </div>
                        </div>

                        <!-- 2-Column Responsive Layout: Left Editor, Right Sticky Preview -->
                        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                            
                            <!-- Left: Editor Controls (7 Cols on desktop) -->
                            <div class="lg:col-span-7 space-y-5">

                                <!-- Target Channel Box -->
                                <div class="bg-[#12141f] border border-white/5 p-5 rounded-3xl space-y-2 shadow-lg">
                                    <div class="flex items-center justify-between mb-1">
                                        <span class="text-[10px] text-purple-400 font-mono bg-purple-950/40 px-2.5 py-0.5 rounded-full border border-purple-800/40">�����</span>
                                        <label class="block text-xs font-black text-white flex items-center gap-1.5">
                                            <span>���� ��� ������</span>
                                            <span class="text-purple-400">#</span>
                                        </label>
                                    </div>
                                    ${renderChannelSelect('embedChannel', '')}
                                    <p class="text-[10px] text-gray-500">���� ����� ����� ���� ����� ����� ������ ������� ����� �����</p>
                                </div>

                                <!-- Color Palette Box -->
                                <div class="bg-[#12141f] border border-white/5 p-5 rounded-3xl space-y-3 shadow-lg">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <input type="text" id="embHexInput" value="#9333ea" oninput="if(window.setCustomHex)window.setCustomHex(this.value)" class="w-24 bg-[#0b0d14] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white text-center font-mono focus:border-purple-500 outline-none uppercase">
                                            <input type="color" id="embColor" value="#9333ea" oninput="if(window.onColorPickerChange)window.onColorPickerChange(this.value)" class="w-9 h-9 rounded-xl border border-white/10 bg-[#0b0d14] cursor-pointer p-0.5">
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <span class="text-xs font-black text-white">��� ���� �������</span>
                                            <span class="text-purple-400 text-sm">??</span>
                                        </div>
                                    </div>

                                    <div class="flex items-center justify-end gap-2 flex-wrap pt-2 border-t border-white/5">
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#10b981')" title="Emerald" class="w-7 h-7 rounded-full bg-[#10b981] hover:scale-110 transition border border-white/20 shadow cursor-pointer"></button>
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#06b6d4')" title="Cyan" class="w-7 h-7 rounded-full bg-[#06b6d4] hover:scale-110 transition border border-white/20 shadow cursor-pointer"></button>
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#3b82f6')" title="Blue" class="w-7 h-7 rounded-full bg-[#3b82f6] hover:scale-110 transition border border-white/20 shadow cursor-pointer"></button>
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#8b5cf6')" title="Violet" class="w-7 h-7 rounded-full bg-[#8b5cf6] hover:scale-110 transition border border-white/20 shadow cursor-pointer"></button>
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#9333ea')" title="Purple" class="w-7 h-7 rounded-full bg-[#9333ea] hover:scale-110 transition border-2 border-white shadow-lg ring-2 ring-purple-500/50 cursor-pointer"></button>
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#f97316')" title="Orange" class="w-7 h-7 rounded-full bg-[#f97316] hover:scale-110 transition border border-white/20 shadow cursor-pointer"></button>
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#ef4444')" title="Red" class="w-7 h-7 rounded-full bg-[#ef4444] hover:scale-110 transition border border-white/20 shadow cursor-pointer"></button>
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#ec4899')" title="Pink" class="w-7 h-7 rounded-full bg-[#ec4899] hover:scale-110 transition border border-white/20 shadow cursor-pointer"></button>
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#eab308')" title="Yellow" class="w-7 h-7 rounded-full bg-[#eab308] hover:scale-110 transition border border-white/20 shadow cursor-pointer"></button>
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#2b2d31')" title="Dark" class="w-7 h-7 rounded-full bg-[#2b2d31] hover:scale-110 transition border border-white/20 shadow cursor-pointer"></button>
                                    </div>
                                </div>

                                <!-- Text Content Box -->
                                <div class="bg-[#12141f] border border-white/5 p-5 rounded-3xl space-y-4 shadow-lg">
                                    <div class="flex items-center justify-between pb-3 border-b border-white/5">
                                        <span class="text-[11px] text-gray-500 font-mono">Content</span>
                                        <h4 class="text-xs font-black text-white flex items-center gap-1.5">
                                            <span>����� ������� �����</span>
                                            <span>??</span>
                                        </h4>
                                    </div>

                                    <!-- Author Name -->
                                    <div>
                                        <input type="hidden" id="embAuthorIcon" value="">
                                        <label class="block text-xs font-bold text-gray-300 mb-1">��� ������ �� ������ (Author)</label>
                                        <input type="text" id="embAuthor" oninput="if(window.updateEmbedPreview)window.updateEmbedPreview()" placeholder="����: ����� ������� / ZENO Support" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">
                                        <p class="text-[10px] text-gray-500 mt-1">���� ������ ���� ���� �������</p>
                                    </div>

                                    <!-- Main Title -->
                                    <input type="hidden" id="embTitleUrl" value="">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1">������� ������� (Title)</label>
                                        <input type="text" id="embTitle" oninput="if(window.updateEmbedPreview)window.updateEmbedPreview()" placeholder="����: ������ ��� �� �������!" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-bold">
                                        <p class="text-[10px] text-gray-500 mt-1">����� ���� ����� ��� ����</p>
                                    </div>

                                    <!-- Description -->
                                    <div>
                                        <div class="flex items-center justify-between mb-1">
                                            <span class="text-[10px] text-gray-500 font-mono">Markdown Supported</span>
                                            <label class="block text-xs font-bold text-gray-300">
                                                ����� �������� ������� <span class="text-purple-400">*</span>
                                            </label>
                                        </div>
                                        <textarea id="embDesc" rows="5" oninput="if(window.updateEmbedPreview)window.updateEmbedPreview()" placeholder="���� �� ������� ���... ���� ������� ��������: **����**� *����*� __����__� > �����ӡ ������ [���](https://...)" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right leading-relaxed"></textarea>
                                    </div>
                                </div>

                                <!-- Images (Thumbnail & Main Banner) -->
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <!-- Thumbnail -->
                                    <div class="bg-[#12141f] border border-white/5 rounded-3xl p-4 space-y-3 shadow-lg">
                                        <div class="flex items-center justify-between">
                                            <button type="button" onclick="if(window.clearEmbedImageField)window.clearEmbedImageField('embThumbnail')" class="text-[11px] text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 cursor-pointer">
                                                <span>?</span><span>���</span>
                                            </button>
                                            <span class="text-xs font-bold text-gray-300">������ ������� (Thumbnail)</span>
                                        </div>
                                        <div class="flex items-center gap-3">
                                            <div class="w-14 h-14 rounded-2xl border border-white/10 bg-[#0b0d14] overflow-hidden flex items-center justify-center shrink-0">
                                                <img id="prev_embThumbnail_box" src="" class="w-full h-full object-cover hidden">
                                                <span id="ph_embThumbnail" class="text-lg text-gray-600">???</span>
                                            </div>
                                            <div class="flex-1 space-y-1">
                                                <input type="hidden" id="embThumbnail" value="">
                                                <input type="file" id="file_embThumbnail" accept="image/*" onchange="if(window.uploadEmbedImageFile)window.uploadEmbedImageFile(this,'embThumbnail')" class="hidden">
                                                <button type="button" onclick="document.getElementById('file_embThumbnail').click()" class="w-full px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95">
                                                    <span>??</span><span id="btn_text_embThumbnail">��� ���� �����</span>
                                                </button>
                                                <p class="text-[9px] text-gray-500">���� �� ������� ������� �������</p>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Main Banner -->
                                    <div class="bg-[#12141f] border border-white/5 rounded-3xl p-4 space-y-3 shadow-lg">
                                        <div class="flex items-center justify-between">
                                            <button type="button" onclick="if(window.clearEmbedImageField)window.clearEmbedImageField('embImage')" class="text-[11px] text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 cursor-pointer">
                                                <span>?</span><span>���</span>
                                            </button>
                                            <span class="text-xs font-bold text-gray-300">������ ������� (Main Image)</span>
                                        </div>
                                        <div class="flex items-center gap-3">
                                            <div class="w-14 h-14 rounded-2xl border border-white/10 bg-[#0b0d14] overflow-hidden flex items-center justify-center shrink-0">
                                                <img id="prev_embImage_box" src="" class="w-full h-full object-cover hidden">
                                                <span id="ph_embImage" class="text-lg text-gray-600">???</span>
                                            </div>
                                            <div class="flex-1 space-y-1">
                                                <input type="hidden" id="embImage" value="">
                                                <input type="file" id="file_embImage" accept="image/*" onchange="if(window.uploadEmbedImageFile)window.uploadEmbedImageFile(this,'embImage')" class="hidden">
                                                <button type="button" onclick="document.getElementById('file_embImage').click()" class="w-full px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95">
                                                    <span>??</span><span id="btn_text_embImage">��� ���� ����</span>
                                                </button>
                                                <p class="text-[9px] text-gray-500">���� ����� ����� ���� �������</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Custom Fields Container -->
                                <div class="bg-[#12141f] border border-white/5 p-5 rounded-3xl space-y-3 shadow-lg">
                                    <div class="flex items-center justify-between pb-2 border-b border-white/5">
                                        <button type="button" onclick="if(window.addEmbedField)window.addEmbedField()" class="px-3.5 py-1.5 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/40 text-purple-300 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer active:scale-95">
                                            <span>+</span><span>����� ��� ����</span>
                                        </button>
                                        <h4 class="text-xs font-black text-white flex items-center gap-1.5">
                                            <span>���� ������ ����� (Fields)</span>
                                            <span>??</span>
                                        </h4>
                                    </div>
                                    <div id="fieldsContainer" class="space-y-2.5"></div>
                                </div>

                                <!-- Footer & Timestamp Box -->
                                <div class="bg-[#12141f] border border-white/5 p-5 rounded-3xl space-y-3 shadow-lg">
                                    <div class="flex items-center justify-between pb-2 border-b border-white/5">
                                        <div class="flex items-center gap-2">
                                            <label class="relative inline-flex items-center cursor-pointer">
                                                <input type="checkbox" id="embTimestampToggle" checked onchange="if(window.updateEmbedPreview)window.updateEmbedPreview()" class="sr-only peer">
                                                <div class="w-10 h-5 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600 cursor-pointer"></div>
                                            </label>
                                            <span class="text-[11px] text-gray-400 font-bold">����� �����</span>
                                        </div>
                                        <h4 class="text-xs font-black text-white flex items-center gap-1.5">
                                            <span>������� ������ (Footer)</span>
                                            <span>?</span>
                                        </h4>
                                    </div>

                                    <div>
                                        <input type="hidden" id="embFooterIcon" value="">
                                        <label class="block text-xs font-bold text-gray-300 mb-1">�� ������� (Footer Text)</label>
                                        <input type="text" id="embFooter" oninput="if(window.updateEmbedPreview)window.updateEmbedPreview()" placeholder="����: ZENO Bot � ���� ����� ��������" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                    </div>
                                </div>

                            </div>

                            <!-- Right: Sticky Discord Live Preview (5 Cols on desktop) -->
                            <div class="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
                                <div class="bg-[#12141f] border border-purple-500/30 p-5 rounded-3xl shadow-2xl space-y-3">
                                    <div class="flex items-center justify-between pb-3 border-b border-white/5">
                                        <span class="text-[10px] bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-full font-bold border border-emerald-500/30 flex items-center gap-1.5">
                                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                            <span>������ ��� �������</span>
                                        </span>
                                        <h4 class="text-xs font-black text-white flex items-center gap-1.5">
                                            <span>��� ������� �������</span>
                                            <span>???</span>
                                        </h4>
                                    </div>

                                    <!-- Discord Bubble Simulation -->
                                    <div class="bg-[#313338] p-4 rounded-2xl text-right font-sans shadow-2xl border border-black/40 space-y-2 select-none">
                                        <!-- Header: Avatar + Bot tag -->
                                        <div class="flex items-center justify-end gap-2.5 pb-1">
                                            <div class="flex items-center gap-1.5">
                                                <span class="text-[10px] text-gray-400 font-medium">����� �� 12:00 �</span>
                                                <span class="bg-[#5865f2] text-white text-[9px] font-extrabold px-1 py-0.5 rounded leading-none">BOT</span>
                                                <span class="font-bold text-white text-xs">ZENO</span>
                                            </div>
                                            <img src="${botAvatarUrl}" class="w-8 h-8 rounded-full object-cover shadow">
                                        </div>

                                        <!-- Embed Card -->
                                        <div class="bg-[#2b2d31] p-3.5 rounded-lg border-l-4 shadow transition-all text-right" id="previewEmbedBox" style="border-left-color: #9333ea; border-right: none;">
                                            <div class="flex items-start gap-3">
                                                <!-- Thumbnail -->
                                                <div id="prevThumbnailWrap" class="hidden shrink-0 order-first">
                                                    <img id="prevThumbnailImg" class="w-16 h-16 rounded-lg object-cover shadow border border-white/10" src="" alt="">
                                                </div>

                                                <!-- Body -->
                                                <div class="flex-1 min-w-0 space-y-1.5">
                                                    <!-- Author -->
                                                    <div id="prevAuthorRow" class="hidden items-center justify-end gap-1.5">
                                                        <span id="prevAuthorText" class="text-[11px] font-bold text-gray-200"></span>
                                                    </div>

                                                    <!-- Title -->
                                                    <div id="prevTitle" class="text-sm font-bold text-white leading-snug break-words"></div>

                                                    <!-- Desc -->
                                                    <div id="prevDesc" class="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed break-words">����� ������� ����� ��� ������...</div>

                                                    <!-- Fields -->
                                                    <div id="prevFieldsGrid" class="grid grid-cols-2 gap-2 pt-1 hidden"></div>
                                                </div>
                                            </div>

                                            <!-- Main Image -->
                                            <div id="prevImageRow" class="mt-2.5 hidden">
                                                <img id="prevMainImg" class="rounded-lg max-h-60 w-full object-cover shadow" src="" alt="">
                                            </div>

                                            <!-- Footer -->
                                            <div id="prevFooterRow" class="mt-2.5 pt-2 flex items-center justify-end gap-1.5 text-[10px] text-gray-400">
                                                <span id="prevTimestamp" class="text-gray-400"></span>
                                                <span id="prevFooterDot" class="hidden font-bold">�</span>
                                                <span id="prevFooterText"></span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                `;

            // Embed page script
            embedScriptHtml = `
                    let embedFields = [];

                    function showFixedToast(msg, isSuccess) {
                        if (isSuccess === undefined) isSuccess = true;
                        var toast = document.getElementById('embedFixedToast');
                        if (!toast) {
                            toast = document.createElement('div');
                            toast.id = 'embedFixedToast';
                            toast.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:999999;padding:12px 24px;border-radius:16px;font-size:13px;font-weight:bold;display:flex;align-items:center;gap:10px;box-shadow:0 12px 40px rgba(0,0,0,0.6);transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);min-width:280px;justify-content:center;text-align:center;direction:rtl;';
                            document.body.appendChild(toast);
                        }
                        toast.textContent = msg;
                        toast.style.background = isSuccess ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)';
                        toast.style.color = '#ffffff';
                        toast.style.border = isSuccess ? '1px solid #34d399' : '1px solid #f87171';
                        toast.style.opacity = '1';
                        toast.style.display = 'flex';
                        clearTimeout(toast._t);
                        toast._t = setTimeout(function() {
                            toast.style.opacity = '0';
                            setTimeout(function() { toast.style.display = 'none'; }, 300);
                        }, 4000);
                    }

                    function selectColor(hex) {
                        var c = document.getElementById('embColor');
                        var h = document.getElementById('embHexInput');
                        if (c) c.value = hex;
                        if (h) h.value = hex.toUpperCase();
                        updateEmbedPreview();
                    }

                    function onColorPickerChange(hex) {
                        var h = document.getElementById('embHexInput');
                        if (h) h.value = hex.toUpperCase();
                        updateEmbedPreview();
                    }

                    function setCustomHex(hex) {
                        if (/^#[0-9A-F]{6}$/i.test(hex)) {
                            var c = document.getElementById('embColor');
                            if (c) c.value = hex;
                            updateEmbedPreview();
                        }
                    }

                    function addEmbedField() {
                        var id = 'f_' + Date.now();
                        embedFields.push({ id: id, name: '', value: '', inline: false });
                        renderFieldsEditor();
                        updateEmbedPreview();
                        showFixedToast('\u2705 \u062a\u0645 \u0625\u0636\u0627\u0641\u0629 \u062d\u0642\u0644 \u0645\u062e\u0635\u0635 \u062c\u062f\u064a\u062f', true);
                    }

                    function removeEmbedField(id) {
                        embedFields = embedFields.filter(function(f) { return f.id !== id; });
                        renderFieldsEditor();
                        updateEmbedPreview();
                        showFixedToast('\uD83D\uDDD1\uFE0F \u062a\u0645 \u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u062d\u0642\u0644', false);
                    }

                    function updateFieldData(id, key, val) {
                        var field = embedFields.find(function(f) { return f.id === id; });
                        if (field) {
                            field[key] = val;
                            updateEmbedPreview();
                        }
                    }

                    function renderFieldsEditor() {
                        var c = document.getElementById('fieldsContainer');
                        if (!c) return;
                        if (embedFields.length === 0) {
                            c.innerHTML = '<div class=\"text-[11px] text-gray-500 text-center py-3 bg-[#0b0d14]/40 rounded-2xl border border-dashed border-white/5\">' +
                                '\u0644\u0627 \u062a\u0648\u062c\u062f \u062d\u0642\u0648\u0644 \u0625\u0636\u0627\u0641\u064a\u0629 \u062d\u0627\u0644\u064a\u0627\u064b\u060c \u0627\u0636\u063a\u0637 \u0022+ \u0625\u0636\u0627\u0641\u0629 \u062d\u0642\u0644 \u062c\u062f\u064a\u062f\u0022 \u0644\u0625\u0636\u0627\u0641\u0629 \u062d\u0642\u0648\u0644 \u0645\u062e\u0635\u0635\u0629</div>';
                            return;
                        }
                        var html = '';
                        for (var i = 0; i < embedFields.length; i++) {
                            var f = embedFields[i];
                            html += '<div class=\"bg-[#0b0d14] border border-white/10 p-3.5 rounded-2xl space-y-2.5\">' +
                                '<div class=\"flex items-center justify-between\">' +
                                '<div class=\"flex items-center gap-2\">' +
                                '<label class=\"text-[11px] text-gray-300 font-bold flex items-center gap-1.5 cursor-pointer bg-[#12141f] px-2.5 py-1 rounded-xl border border-white/5\">' +
                                '<input type=\"checkbox\" ' + (f.inline ? 'checked' : '') + ' onchange=\"window.updateFieldData(\\\'' + f.id + '\\\', \\\'inline\\\', this.checked)\" class=\"rounded bg-[#151724] border-white/10 text-purple-600 focus:ring-0 cursor-pointer\">' +
                                '<span>\u062c\u0646\u0628\u0627\u064b \u0644\u062c\u0646\u0628 (Inline)</span>' +
                                '</label>' +
                                '<button type=\"button\" onclick=\"window.removeEmbedField(\\\'' + f.id + '\\\');\" class=\"text-rose-400 hover:text-rose-300 text-xs px-2.5 py-1 rounded-xl bg-rose-950/40 border border-rose-800/40 font-bold cursor-pointer transition\">\u2715 \u062d\u0630\u0641</button>' +
                                '</div>' +
                                '<span class=\"text-xs font-black text-purple-400 font-mono\">\u0627\u0644\u062d\u0642\u0644 #' + (i + 1) + '</span>' +
                                '</div>' +
                                '<div class=\"grid grid-cols-1 md:grid-cols-2 gap-2\">' +
                                '<div><input type=\"text\" placeholder=\"\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062d\u0642\u0644...\" value=\"' + (f.name || '').replace(/"/g, '&quot;') + '\" oninput=\"window.updateFieldData(\\\'' + f.id + '\\\', \\\'name\\\', this.value)\" class=\"w-full bg-[#12141f] border border-white/5 focus:border-purple-600 rounded-xl px-3 py-2 text-xs text-white text-right outline-none font-bold\"></div>' +
                                '<div><input type=\"text\" placeholder=\"\u0645\u062d\u062a\u0648\u0649 \u0627\u0644\u062d\u0642\u0644...\" value=\"' + (f.value || '').replace(/"/g, '&quot;') + '\" oninput=\"window.updateFieldData(\\\'' + f.id + '\\\', \\\'value\\\', this.value)\" class=\"w-full bg-[#12141f] border border-white/5 focus:border-purple-600 rounded-xl px-3 py-2 text-xs text-white text-right outline-none\"></div>' +
                                '</div>' +
                                '</div>';
                        }
                        c.innerHTML = html;
                    }

                    function updateEmbedPreview() {
                        var embColor = document.getElementById('embColor');
                        var color = embColor ? embColor.value : '#9333ea';
                        var embAuthor = document.getElementById('embAuthor');
                        var author = embAuthor ? (embAuthor.value || '').trim() : '';
                        var embTitle = document.getElementById('embTitle');
                        var title = embTitle ? (embTitle.value || '').trim() : '';
                        var embDesc = document.getElementById('embDesc');
                        var desc = embDesc ? (embDesc.value || '').trim() : '';
                        var embImage = document.getElementById('embImage');
                        var image = embImage ? (embImage.value || '').trim() : '';
                        var embThumbnail = document.getElementById('embThumbnail');
                        var thumbnail = embThumbnail ? (embThumbnail.value || '').trim() : '';
                        var embFooter = document.getElementById('embFooter');
                        var footer = embFooter ? (embFooter.value || '').trim() : '';
                        var embTimestampToggle = document.getElementById('embTimestampToggle');
                        var showTimestamp = embTimestampToggle ? embTimestampToggle.checked : false;

                        var previewBox = document.getElementById('previewEmbedBox');
                        if (previewBox) {
                            previewBox.style.borderLeftColor = color;
                            previewBox.style.borderRightColor = color;
                        }

                        var prevAuthorRow = document.getElementById('prevAuthorRow');
                        var prevAuthorText = document.getElementById('prevAuthorText');
                        if (prevAuthorRow) {
                            if (author) {
                                prevAuthorRow.classList.remove('hidden');
                                prevAuthorRow.classList.add('flex');
                                if (prevAuthorText) prevAuthorText.textContent = author;
                            } else {
                                prevAuthorRow.classList.add('hidden');
                                prevAuthorRow.classList.remove('flex');
                            }
                        }

                        var prevTitle = document.getElementById('prevTitle');
                        if (prevTitle) {
                            if (title) { prevTitle.style.display = 'block'; prevTitle.textContent = title; }
                            else { prevTitle.style.display = 'none'; prevTitle.textContent = ''; }
                        }

                        var prevThumbnailWrap = document.getElementById('prevThumbnailWrap');
                        var prevThumbnailImg = document.getElementById('prevThumbnailImg');
                        if (prevThumbnailWrap && prevThumbnailImg) {
                            if (thumbnail) { prevThumbnailImg.src = thumbnail; prevThumbnailWrap.classList.remove('hidden'); }
                            else { prevThumbnailImg.src = ''; prevThumbnailWrap.classList.add('hidden'); }
                        }

                        var prevDesc = document.getElementById('prevDesc');
                        if (prevDesc) prevDesc.textContent = desc || '\u0645\u062d\u062a\u0648\u0649 \u0627\u0644\u0625\u064a\u0645\u0628\u062f \u0633\u064a\u0638\u0647\u0631 \u0647\u0646\u0627 \u0645\u0628\u0627\u0634\u0631\u0629...';

                        var prevFieldsGrid = document.getElementById('prevFieldsGrid');
                        if (prevFieldsGrid) {
                            var validFields = embedFields.filter(function(f) { return f.name || f.value; });
                            if (validFields.length > 0) {
                                prevFieldsGrid.classList.remove('hidden');
                                var fieldsHtml = '';
                                for (var fi = 0; fi < validFields.length; fi++) {
                                    var ff = validFields[fi];
                                    fieldsHtml += '<div class=\"' + (ff.inline ? 'col-span-1' : 'col-span-2') + ' bg-black/20 p-2 rounded-lg text-right\">' +
                                        '<div class=\"text-[11px] font-bold text-gray-300\">' + (ff.name || '\u062d\u0642\u0644') + '</div>' +
                                        '<div class=\"text-[11px] text-gray-400\">' + (ff.value || '...') + '</div>' +
                                        '</div>';
                                }
                                prevFieldsGrid.innerHTML = fieldsHtml;
                            } else { prevFieldsGrid.classList.add('hidden'); }
                        }

                        var prevImageRow = document.getElementById('prevImageRow');
                        var prevMainImg = document.getElementById('prevMainImg');
                        if (prevImageRow && prevMainImg) {
                            if (image) { prevMainImg.src = image; prevImageRow.classList.remove('hidden'); }
                            else { prevImageRow.classList.add('hidden'); }
                        }

                        var prevFooterText = document.getElementById('prevFooterText');
                        var prevTimestamp = document.getElementById('prevTimestamp');
                        var prevFooterDot = document.getElementById('prevFooterDot');
                        if (prevFooterText) prevFooterText.textContent = footer || '';
                        if (prevTimestamp) {
                            if (showTimestamp) {
                                prevTimestamp.textContent = '\u0627\u0644\u064a\u0648\u0645 \u0641\u064a ' + new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
                                if (prevFooterDot) prevFooterDot.classList.toggle('hidden', !footer);
                            } else {
                                prevTimestamp.textContent = '';
                                if (prevFooterDot) prevFooterDot.classList.add('hidden');
                            }
                        }
                    }

                    function clearEmbedFields() {
                        ['embTitle','embDesc','embAuthor','embImage','embThumbnail','embFooter'].forEach(function(id) {
                            var el = document.getElementById(id); if (el) el.value = '';
                        });
                        var ts = document.getElementById('embTimestampToggle');
                        if (ts) ts.checked = true;
                        ['embThumbnail','embImage'].forEach(function(id) {
                            var boxImg = document.getElementById('prev_' + id + '_box');
                            var ph = document.getElementById('ph_' + id);
                            if (boxImg) { boxImg.src = ''; boxImg.classList.add('hidden'); }
                            if (ph) ph.classList.remove('hidden');
                            var fileInp = document.getElementById('file_' + id);
                            if (fileInp) fileInp.value = '';
                        });
                        embedFields = [];
                        renderFieldsEditor();
                        selectColor('#9333ea');
                        updateEmbedPreview();
                        showFixedToast('\uD83D\uDDD1\uFE0F \u062a\u0645 \u0645\u0633\u062d \u062c\u0645\u064a\u0639 \u0645\u062d\u062a\u0648\u064a\u0627\u062a \u0627\u0644\u0625\u064a\u0645\u0628\u062f', true);
                    }

                    function saveEmbedDraft() {
                        var payload = getEmbedPayload();
                        try {
                            localStorage.setItem('zeno_embed_draft_${guildId}', JSON.stringify(payload));
                            showFixedToast('\uD83D\uDCBE \u062a\u0645 \u062d\u0641\u0638 \u0627\u0644\u0645\u0633\u0648\u062f\u0629 \u0641\u064a \u0627\u0644\u0645\u062a\u0635\u0641\u062d \u0628\u0646\u062c\u0627\u062d!', true);
                        } catch(e) {
                            showFixedToast('\u274C \u0641\u0634\u0644 \u062d\u0641\u0638 \u0627\u0644\u0645\u0633\u0648\u062f\u0629', false);
                        }
                    }

                    function getEmbedPayload() {
                        function g(id) { return document.getElementById(id); }
                        return {
                            channelId: (g('embedChannel') || {}).value || '',
                            color: (g('embColor') || {}).value || '#9333ea',
                            title: ((g('embTitle') || {}).value || '').trim(),
                            titleUrl: '',
                            desc: ((g('embDesc') || {}).value || '').trim(),
                            author: ((g('embAuthor') || {}).value || '').trim(),
                            authorIcon: '',
                            image: ((g('embImage') || {}).value || '').trim(),
                            thumbnail: ((g('embThumbnail') || {}).value || '').trim(),
                            footer: ((g('embFooter') || {}).value || '').trim(),
                            footerIcon: '',
                            timestamp: (g('embTimestampToggle') || {}).checked !== false,
                            fields: embedFields.filter(function(f) { return f.name || f.value; })
                        };
                    }

                    async function sendEmbedDirect() {
                        var payload = getEmbedPayload();
                        if (!payload.channelId) {
                            showFixedToast('\u26A0\uFE0F \u064a\u0631\u062c\u0649 \u0627\u062e\u062a\u064a\u0627\u0631 \u0627\u0644\u0642\u0646\u0627\u0629 \u0627\u0644\u0645\u0633\u062a\u0647\u062f\u0641\u0629 \u0623\u0648\u0644\u0627\u064b \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629!', false);
                            return;
                        }
                        if (!payload.desc && !payload.title) {
                            showFixedToast('\u26A0\uFE0F \u064a\u0631\u062c\u0649 \u0643\u062a\u0627\u0628\u0629 \u0639\u0646\u0648\u0627\u0646 \u0623\u0648 \u0645\u062d\u062a\u0648\u0649 \u0642\u0628\u0644 \u0627\u0644\u0625\u0631\u0633\u0627\u0644!', false);
                            return;
                        }
                        var btn = document.getElementById('btnSendEmbed');
                        var origHtml = btn ? btn.innerHTML : '';
                        if (btn) { btn.disabled = true; btn.innerHTML = '<span>\u23F3</span><span>\u062c\u0627\u0631\u064a \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0625\u064a\u0645\u0628\u062f...</span>'; }
                        try {
                            var res = await fetch('/api/guild/${guildId}/send-embed', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                            var data = await res.json();
                            if (data.success) {
                                showFixedToast('\u2705 \u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0625\u064a\u0645\u0628\u062f \u0628\u0646\u062c\u0627\u062d!', true);
                            } else {
                                showFixedToast('\u274C ' + (data.error || '\u0641\u0634\u0644 \u0627\u0644\u0625\u0631\u0633\u0627\u0644'), false);
                            }
                        } catch(e) {
                            console.error('[sendEmbedDirect] error:', e);
                            showFixedToast('\u274C \u062e\u0637\u0623 \u0641\u064a \u0627\u0644\u0627\u062a\u0635\u0627\u0644', false);
                        } finally {
                            if (btn) { btn.disabled = false; btn.innerHTML = origHtml || '<span>\uD83D\uDE80</span><span>\u0625\u0631\u0633\u0627\u0644 \u0644\u0644\u0642\u0646\u0627\u0629 \u0627\u0644\u0622\u0646</span>'; }
                        }
                    }

                    async function uploadEmbedImageFile(input, targetId) {
                        var file = input.files && input.files[0];
                        if (!file) return;
                        if (!file.type.startsWith('image/')) {
                            showFixedToast('\u274C \u064a\u0631\u062c\u0649 \u0627\u062e\u062a\u064a\u0627\u0631 \u0645\u0644\u0641 \u0635\u0648\u0631\u0629 \u0635\u0627\u0644\u062d', false);
                            return;
                        }
                        if (file.size > 15 * 1024 * 1024) {
                            showFixedToast('\u274C \u062d\u062c\u0645 \u0627\u0644\u0635\u0648\u0631\u0629 \u0643\u0628\u064a\u0631 \u062c\u062f\u0627\u064b', false);
                            return;
                        }
                        // Instant local preview
                        var localUrl = URL.createObjectURL(file);
                        var boxImg = document.getElementById('prev_' + targetId + '_box');
                        var ph = document.getElementById('ph_' + targetId);
                        if (boxImg) { boxImg.src = localUrl; boxImg.classList.remove('hidden'); }
                        if (ph) ph.classList.add('hidden');
                        var hiddenInput = document.getElementById(targetId);
                        if (hiddenInput) hiddenInput.value = localUrl;
                        updateEmbedPreview();

                        var btnText = document.getElementById('btn_text_' + targetId);
                        var origText = btnText ? btnText.innerText : '\u0631\u0641\u0639';
                        if (btnText) btnText.innerText = '\u062c\u0627\u0631\u064a \u0627\u0644\u0631\u0641\u0639... \u23F3';

                        var reader = new FileReader();
                        reader.onload = async function(e) {
                            try {
                                var res = await fetch('/api/guild/${guildId}/upload-image', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ imageBase64: e.target.result, fieldName: targetId })
                                });
                                var data = await res.json();
                                if (data.success && data.url) {
                                    if (hiddenInput) hiddenInput.value = data.url;
                                    if (boxImg) boxImg.src = data.url;
                                    updateEmbedPreview();
                                    if (btnText) btnText.innerText = '\u2705 \u062a\u0645 \u0627\u0644\u0631\u0641\u0639';
                                    showFixedToast('\u2705 \u062a\u0645 \u0631\u0641\u0639 \u0627\u0644\u0635\u0648\u0631\u0629 \u0628\u0646\u062c\u0627\u062d!', true);
                                    setTimeout(function() { if (btnText) btnText.innerText = origText; }, 2000);
                                    URL.revokeObjectURL(localUrl);
                                } else {
                                    showFixedToast('\u26A0\uFE0F \u062a\u0639\u0630\u0651\u0631 \u0631\u0641\u0639 \u0627\u0644\u0635\u0648\u0631\u0629: ' + (data.error || '\u062e\u0637\u0623'), false);
                                    if (btnText) btnText.innerText = origText;
                                }
                            } catch(err) {
                                showFixedToast('\u26A0\uFE0F \u062e\u0637\u0623 \u0641\u064a \u0627\u0644\u0627\u062a\u0635\u0627\u0644 \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u0631\u0641\u0639', false);
                                if (btnText) btnText.innerText = origText;
                            }
                        };
                        reader.readAsDataURL(file);
                    }

                    function clearEmbedImageField(targetId) {
                        var el = document.getElementById(targetId);
                        if (el) el.value = '';
                        var fileInp = document.getElementById('file_' + targetId);
                        if (fileInp) fileInp.value = '';
                        var boxImg = document.getElementById('prev_' + targetId + '_box');
                        var ph = document.getElementById('ph_' + targetId);
                        if (boxImg) { boxImg.src = ''; boxImg.classList.add('hidden'); }
                        if (ph) ph.classList.remove('hidden');
                        updateEmbedPreview();
                        showFixedToast('\uD83D\uDDD1\uFE0F \u062a\u0645 \u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0635\u0648\u0631\u0629', true);
                    }

                    function initEmbedEditor() {
                        console.log('[Embed Editor] Initializing...');
                        renderFieldsEditor();
                        try {
                            var saved = localStorage.getItem('zeno_embed_draft_${guildId}');
                            if (saved) {
                                var d = JSON.parse(saved);
                                function setVal(id, val) { var el = document.getElementById(id); if (el && val !== undefined) el.value = val; }
                                setVal('embTitle', d.title);
                                setVal('embDesc', d.desc);
                                setVal('embAuthor', d.author);
                                setVal('embFooter', d.footer);
                                if (d.image) {
                                    setVal('embImage', d.image);
                                    var bi = document.getElementById('prev_embImage_box');
                                    var pi = document.getElementById('ph_embImage');
                                    if (bi) { bi.src = d.image; bi.classList.remove('hidden'); }
                                    if (pi) pi.classList.add('hidden');
                                }
                                if (d.thumbnail) {
                                    setVal('embThumbnail', d.thumbnail);
                                    var bt = document.getElementById('prev_embThumbnail_box');
                                    var pt = document.getElementById('ph_embThumbnail');
                                    if (bt) { bt.src = d.thumbnail; bt.classList.remove('hidden'); }
                                    if (pt) pt.classList.add('hidden');
                                }
                                if (d.color) selectColor(d.color);
                                if (Array.isArray(d.fields)) { embedFields = d.fields; renderFieldsEditor(); }
                            }
                        } catch(e) { console.warn('[Embed Editor] Draft load error:', e); }
                        updateEmbedPreview();

                        var btnSend = document.getElementById('btnSendEmbed');
                        var btnSave = document.getElementById('btnSaveEmbedDraft');
                        var btnClear = document.getElementById('btnClearEmbed');
                        if (btnSend) btnSend.onclick = function(ev) { ev.preventDefault(); ev.stopPropagation(); sendEmbedDirect(); return false; };
                        if (btnSave) btnSave.onclick = function(ev) { ev.preventDefault(); ev.stopPropagation(); saveEmbedDraft(); return false; };
                        if (btnClear) btnClear.onclick = function(ev) { ev.preventDefault(); ev.stopPropagation(); clearEmbedFields(); return false; };

                        ['embTitle','embDesc','embAuthor','embFooter'].forEach(function(id) {
                            var el = document.getElementById(id);
                            if (el) el.addEventListener('input', updateEmbedPreview);
                        });
                        var colorInput = document.getElementById('embColor');
                        if (colorInput) colorInput.addEventListener('input', function(ev) { onColorPickerChange(ev.target.value); });
                        var hexInput = document.getElementById('embHexInput');
                        if (hexInput) hexInput.addEventListener('input', function(ev) { setCustomHex(ev.target.value); });
                        var tsToggle = document.getElementById('embTimestampToggle');
                        if (tsToggle) tsToggle.addEventListener('change', updateEmbedPreview);
                        var fThumb = document.getElementById('file_embThumbnail');
                        if (fThumb) fThumb.addEventListener('change', function() { uploadEmbedImageFile(this, 'embThumbnail'); });
                        var fImg = document.getElementById('file_embImage');
                        if (fImg) fImg.addEventListener('change', function() { uploadEmbedImageFile(this, 'embImage'); });
                        console.log('[Embed Editor] Ready \u2705');
                    }

                    // ? CRITICAL: expose to window IMMEDIATELY
                    window.selectColor = selectColor;
                    window.onColorPickerChange = onColorPickerChange;
                    window.setCustomHex = setCustomHex;
                    window.addEmbedField = addEmbedField;
                    window.removeEmbedField = removeEmbedField;
                    window.updateFieldData = updateFieldData;
                    window.renderFieldsEditor = renderFieldsEditor;
                    window.updateEmbedPreview = updateEmbedPreview;
                    window.clearEmbedFields = clearEmbedFields;
                    window.saveEmbedDraft = saveEmbedDraft;
                    window.getEmbedPayload = getEmbedPayload;
                    window.sendEmbedDirect = sendEmbedDirect;
                    window.uploadEmbedImageFile = uploadEmbedImageFile;
                    window.clearEmbedImageField = clearEmbedImageField;
                    window.initEmbedEditor = initEmbedEditor;

                    if (document.readyState === 'loading') {
                        window.addEventListener('DOMContentLoaded', initEmbedEditor);
                    } else {
                        initEmbedEditor();
                    }
                `
            } else {
                formFieldsHtml = `
                    <div class="space-y-5 text-right" dir="rtl">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2">����� ������� (Prefix)</label>
                                <input type="text" name="prefix" value="${settings.prefix || '#'}" class="w-full bg-[#0b0d14] border border-white/5 focus:border-purple-600 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2">���� ������� (Log Channel)</label>
                                ${renderChannelSelect('log_channel', settings.log_channel || '')}
                            </div>
                        </div>
                    </div>
                `;
            }

            res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${guild.name} | ZENO Dashboard</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                
                <style>
                    :root {
                        --bg-main: #0b0d14;
                        --bg-sidebar: #10121b;
                        --bg-card: #151722;
                        --bg-card-hover: #1c1f2e;
                        --primary: #9333ea;
                        --border: rgba(255, 255, 255, 0.05);
                    }
                    body { background-color: var(--bg-main) !important; color: #ffffff !important; font-family: 'Cairo', sans-serif !important; }
                    ::-webkit-scrollbar { width: 6px; height: 6px; }
                    ::-webkit-scrollbar-track { background: #0b0d14; }
                    ::-webkit-scrollbar-thumb { background: #2f3146; border-radius: 10px; }
                    .probot-card { background: var(--bg-card) !important; border: 1px solid var(--border) !important; border-radius: 16px !important; }
                    .toggle { position: relative; display: inline-block; width: 44px; height: 24px; }
                    .toggle input { opacity: 0; width: 0; height: 0; }
                    .slider { position: absolute; cursor: pointer; inset: 0; background: #2f3146; border-radius: 24px; transition: .3s; }
                    .slider:before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .3s; }
                    input:checked + .slider { background: #9333ea; }
                    input:checked + .slider:before { transform: translateX(20px); }
                </style>
                <script src="/i18n.js"></script>
            </head>
            <body class="min-h-screen flex flex-col bg-[#0b0d14] text-gray-200">
                <header class="h-16 bg-[#10121b]/95 backdrop-blur-md border-b border-white/5 px-6 flex items-center justify-between sticky top-0 z-40">
                    <div class="flex items-center gap-3">
                        <button type="button" onclick="window.zenoI18n.toggleLang()" class="zeno-lang-toggle-btn px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer text-xs">
                            <span class="text-sm">??</span>
                            <span class="font-black text-xs uppercase tracking-wider">EN</span>
                        </button>
                        <span class="text-gray-700">|</span>
                        <a href="/dashboard/manage" data-i18n="back_to_dashboard" class="text-xs text-purple-400 font-bold hover:text-purple-300 transition">������ ����� ������</a>
                        <span class="text-gray-700">|</span>
                        <a href="https://discord.gg/zduGPYv7pE" target="_blank" data-i18n="support_server" class="text-xs text-gray-400 hover:text-gray-200 transition">����� �����</a>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-black text-sm text-white tracking-wide">ZENO</span>
                        <img src="${botAvatarUrl}" class="w-8 h-8 rounded-xl object-cover ring-2 ring-purple-500/40 shadow-md shadow-purple-900/30">
                    </div>
                </header>

                <div class="flex-1 flex overflow-hidden">
                    
                    <!-- Main Content Form Area -->
                    <main class="flex-1 p-8 overflow-y-auto ${section === 'embed' ? 'max-w-7xl' : 'max-w-4xl'} mx-auto">
                        <div class="${section === 'logs' ? '' : 'probot-card border border-white/5 rounded-3xl p-8 shadow-2xl mb-8'}">
                            <div class="flex items-center justify-between pb-6 mb-6 border-b border-white/5${section === 'logs' ? ' hidden' : ''}">
                                <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', '${section === 'levels' ? 'leveling_enabled' : section + '_enabled'}', this.checked)" ${section === 'levels' ? (settings.leveling_enabled !== 0 ? 'checked' : '') : 'checked'}><span class="slider"></span></label>
                                <div class="text-right">
                                    <h2 class="text-2xl font-black text-white">${title}</h2>
                                    <p class="text-gray-400 text-xs mt-1">��� ����� �� ��������� ������ ������ �� ����� ��������� ������ ���� ����� �����.</p>
                                </div>
                            </div>


                            <form id="settingsForm" class="space-y-6">
                                ${formFieldsHtml}

                                <div class="pt-6 border-t border-white/5 flex items-center justify-between flex-row-reverse${(section === 'embed' || section === 'logs') ? ' hidden' : ''}">
                                    <button type="submit" class="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-black/20 flex items-center gap-2">
                                        <span>??</span>
                                        <span>��� ���������</span>
                                    </button>
                                    <span id="saveStatus" class="text-xs text-emerald-400 font-bold hidden flex items-center gap-1.5">
                                        <span>?</span>
                                        <span>�� ����� ������ ��������� �� ������� �����!</span>
                                    </span>
                                </div>
                            </form>
                        </div>
                    </main>

                    <!-- Server Settings Navigation Sidebar (Novax Style) -->
                    <aside class="w-72 bg-[#090a10] border-l border-white/5 flex flex-col shrink-0 h-full select-none">
                        
                        <!-- Server Card Top -->
                        <div class="p-3">
                            <div class="bg-[#12141f] border border-white/5 rounded-2xl p-3 flex items-center justify-between shadow-lg">
                                <div class="text-gray-400 text-xs">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/></svg>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <h3 class="font-bold text-white text-xs truncate max-w-[130px]">${guild.name}</h3>
                                        <span class="text-[10px] text-gray-400">�������: ${guild.memberCount || botGuild?.memberCount || 0}</span>
                                    </div>
                                    <div class="relative">
                                        <img src="${guildIcon}" class="w-10 h-10 rounded-xl bg-[#1c1f2e] object-cover ring-2 ring-purple-600/50 shadow-md">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Categorized Scrollable Nav Menu -->
                        <div class="flex-1 overflow-y-auto px-3 py-2 space-y-4 text-xs text-right custom-scrollbar">

                            <!-- ������� -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_recent')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_recent" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>�������</span><span>??</span></span>
                                </button>
                                <div id="grp_sub_recent" class="space-y-1">
                                    <a href="/dashboard/${guildId}/welcome" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'welcome' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">?</span>
                                        <span class="flex items-center gap-2"><span>������� & ��������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/autoresponder" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'autoresponder' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">?</span>
                                        <span class="flex items-center gap-2"><span>���� ��������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/tickets" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'tickets' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">?</span>
                                        <span class="flex items-center gap-2"><span>���� �������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- ��� -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_general')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_general" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>���</span></span>
                                </button>
                                <div id="grp_sub_general" class="space-y-1">
                                    <a href="/dashboard/${guildId}" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'overview' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>���� ����</span><span class="text-gray-400 group-hover:text-purple-400">???</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/appearance" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'appearance' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>���� �����</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/settings" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'settings' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>���������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/analytics" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'analytics' || section === 'stats' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>����������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/general" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'general' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-rose-400 bg-rose-950/60 px-1.5 py-0.2 rounded">����</span>
                                        <span class="flex items-center gap-2"><span>�������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/help" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'help' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>����� �������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/ai" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'ai' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-purple-300 bg-purple-950/70 border border-purple-500/30 px-1.5 py-0.2 rounded">ZENO</span>
                                        <span class="flex items-center gap-2"><span>������ ���������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- ������� ������� -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_messages')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_messages" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>������� �������</span></span>
                                </button>
                                <div id="grp_sub_messages" class="space-y-1">
                                    <a href="/dashboard/${guildId}/embed" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'embed' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>����� ������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/broadcast" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'broadcast' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-cyan-400 bg-cyan-950/60 px-1.5 py-0.2 rounded">����</span>
                                        <span class="flex items-center gap-2"><span>���� ���������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- ������� �������� -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_core')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_core" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>������� ��������</span></span>
                                </button>
                                <div id="grp_sub_core" class="space-y-1">
                                    <a href="/dashboard/${guildId}/moderation" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'moderation' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded">�����</span>
                                        <span class="flex items-center gap-2"><span>�������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/levels" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'levels' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">?</span>
                                        <span class="flex items-center gap-2"><span>��������� & XP</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/welcome" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'welcome' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">?</span>
                                        <span class="flex items-center gap-2"><span>������� & ��������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/autoroles" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'autoroles' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">?</span>
                                        <span class="flex items-center gap-2"><span>����� ���������</span><span class="text-gray-400 group-hover:text-purple-400">???</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/giveaways" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'giveaways' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">?</span>
                                        <span class="flex items-center gap-2"><span>��� ����</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/invites" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'invites' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">?</span>
                                        <span class="flex items-center gap-2"><span>Invite Tracker</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- ��������� ������ -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_automations')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_automations" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>��������� ������</span></span>
                                </button>
                                <div id="grp_sub_automations" class="space-y-1">
                                    <a href="/dashboard/${guildId}/autoresponder" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'autoresponder' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">?</span>
                                        <span class="flex items-center gap-2"><span>���� ��������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/applications" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'applications' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-rose-400 bg-rose-950/60 px-1.5 py-0.2 rounded">����</span>
                                        <span class="flex items-center gap-2"><span>���������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/suggestions" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'suggestions' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded">����</span>
                                        <span class="flex items-center gap-2"><span>���������� ��������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- ������ �������� -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_security')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_security" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>������� �������</span><span class="text-purple-400">???</span></span>
                                </button>
                                <div id="grp_sub_security" class="space-y-1">
                                    <a href="/dashboard/${guildId}/protection" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'protection' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="flex items-center gap-1">
                                            <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">?</span>
                                            <span class="text-amber-400 text-xs">??</span>
                                        </span>
                                        <span class="flex items-center gap-2"><span>Anti Nuke (�������)</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/whitelist" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'whitelist' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">?</span>
                                        <span class="flex items-center gap-2"><span>������� �������</span><span class="text-gray-400 group-hover:text-purple-400">?</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/protection-logs" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'protection-logs' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded">�����</span>
                                        <span class="flex items-center gap-2"><span>����� ������ ��������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/backup" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'backup' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-cyan-400 bg-cyan-950/60 px-1.5 py-0.2 rounded">���</span>
                                        <span class="flex items-center gap-2"><span>����� ����������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/automod" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'automod' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">?</span>
                                        <span class="flex items-center gap-2"><span>������� ���������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/antiraid" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'antiraid' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">?</span>
                                        <span class="flex items-center gap-2"><span>������ �����</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/staff-activity" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'staff-activity' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">?</span>
                                        <span class="flex items-center gap-2"><span>���� �������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- ����� ������� -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_management')" class="w-full flex items-center justify-between text-gray-400 hover:text-white px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_management" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>����� �������</span></span>
                                </button>
                                <div id="grp_sub_management" class="space-y-1">
                                    <a href="/dashboard/${guildId}/tempvoice" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'tempvoice' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">?</span>
                                        <span class="flex items-center gap-2"><span>������� �������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/boost" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'boost' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">?</span>
                                        <span class="flex items-center gap-2"><span>��������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/colors" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'colors' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">?</span>
                                        <span class="flex items-center gap-2"><span>�������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/logs" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'logs' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded">�����</span>
                                        <span class="flex items-center gap-2"><span>�������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/tickets" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'tickets' ? 'bg-purple-600 text-white font-bold shadow-md' : 'text-gray-300 hover:text-white hover:bg-[#151724]'} transition group">
                                        <span class="flex items-center gap-1">
                                            <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">?</span>
                                            <span class="text-amber-400 text-xs">??</span>
                                        </span>
                                        <span class="flex items-center gap-2"><span>�������</span><span class="text-gray-400 group-hover:text-purple-400">??</span></span>
                                    </a>
                                </div>
                            </div>

                            

                        <!-- User Profile Bottom Bar -->
                        <div class="p-3 border-t border-white/5">
                            <div class="bg-gradient-to-r from-purple-700 to-indigo-700 rounded-2xl p-2.5 flex items-center justify-between shadow-lg shadow-purple-950/40">
                                <div class="text-white/80 hover:text-white cursor-pointer px-1">
                                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z"/></svg>
                                </div>
                                <div class="flex items-center gap-2.5">
                                    <div class="text-right">
                                        <span class="text-xs font-black text-white block leading-tight truncate max-w-[110px]">${user.username}</span>
                                    </div>
                                    <img src="${userAvatar}" class="w-8 h-8 rounded-xl object-cover ring-2 ring-white/20 shadow-md">
                                </div>
                            </div>
                        </div>

                    </aside>

                    <!-- Server Rail (Far Right - Novax Style) -->
                    <div class="w-18 bg-[#05060a] border-l border-white/5 py-4 px-2 flex flex-col items-center gap-3 shrink-0 overflow-y-auto select-none">
                        <!-- Home Icon Button -->
                        <a href="/dashboard" title="������ ��������" class="w-12 h-12 rounded-2xl bg-[#12141f] hover:bg-purple-600/30 border border-white/5 hover:border-purple-500/50 flex items-center justify-center text-gray-300 hover:text-white transition shadow-lg mb-1 group">
                            <svg class="w-6 h-6 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                        </a>
                        <div class="w-8 h-[1px] bg-white/5"></div>
                        <!-- Active Server List Icons -->
                        ${serverRailHtml}
                    </div>

                </div>

                <script>
                function toggleNavGroup(groupId) {
                    const el = document.getElementById(groupId);
                    const arrow = document.getElementById('arrow_' + groupId);
                    if (!el) return;
                    el.classList.toggle('hidden');
                    if (arrow) arrow.classList.toggle('rotate-180');
                }

                async function toggleModule(gId, key, isEnabled) {
                    try {
                        await fetch('/api/guild/' + gId + '/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ [key]: isEnabled ? 1 : 0 })
                        });
                        showSaveStatus();
                    } catch (e) {
                        console.error('Error updating module toggle:', e);
                    }
                }

                function showSaveStatus() {
                    const status = document.getElementById('saveStatus');
                    if (status) {
                        status.classList.remove('hidden');
                        setTimeout(() => status.classList.add('hidden'), 4000);
                    }
                }

                document.getElementById('settingsForm')?.addEventListener('submit', async function(e) {
                    e.preventDefault();
                    const formData = new FormData(this);
                    const payload = {};
                    
                    for (let [k, v] of formData.entries()) {
                        if (payload[k]) {
                            if (Array.isArray(payload[k])) {
                                payload[k].push(v);
                            } else {
                                payload[k] = [payload[k], v];
                            }
                        } else {
                            payload[k] = v;
                        }
                    }

                    this.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                        if (cb.name) {
                            payload[cb.name] = cb.checked ? 1 : 0;
                        }
                    });

                    try {
                        const btn = this.querySelector('button[type="submit"]');
                        if (btn) {
                            btn.disabled = true;
                            btn.innerHTML = '<span>?</span><span>���� �����...</span>';
                        }

                        const targetGuildId = window.location.pathname.split('/')[2];
                        const res = await fetch('/api/guild/' + targetGuildId + '/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        const data = await res.json();
                        if (data.success) {
                            showSaveStatus();
                        } else {
                            alert('? ��� ����� �����: ' + (data.error || '��� ��� ��� �����'));
                        }

                        if (btn) {
                            btn.disabled = false;
                            btn.innerHTML = '<span>??</span><span>��� ���������</span>';
                        }
                    } catch (err) {
                        alert('��� ��� �� ������� �������');
                    }
                });

                // ? FIX: ��� �� �� ��� submit �� ����� ��� form
                document.addEventListener('DOMContentLoaded', () => {
                    const form = document.getElementById('settingsForm');
                    if (form) {
                        form.querySelectorAll('button:not([type="submit"])').forEach(btn => {
                            if (!btn.hasAttribute('type')) {
                                btn.setAttribute('type', 'button');
                            }
                        });
                    }
                });

                // ����� ������� ����� ����� (��� buttons �������� ������)
                setTimeout(() => {
                    const form = document.getElementById('settingsForm');
                    if (form) {
                        form.querySelectorAll('button:not([type="submit"])').forEach(btn => {
                            if (!btn.getAttribute('type') || btn.getAttribute('type') !== 'submit') {
                                btn.type = 'button';
                            }
                        });
                    }
                }, 100);
                // ����� ��� ���� ����� ������� ���� Wicks ����� �������
                // ? ���� ����� �������� (���� �� ���� �������)
                const _dashGuildId = window.location.pathname.split('/')[2];
                async function saveProtectionSetting(key, value) {
                    if (typeof updateProtectionBadges === 'function') updateProtectionBadges();
                    try {
                        await fetch('/api/guild/' + _dashGuildId + '/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ [key]: value ? 1 : 0 })
                        });
                        showSaveStatus();
                    } catch(e) { console.error('saveProtectionSetting error', e); }
                }
                async function saveAutomodSetting(key, value) {
                    try {
                        await fetch('/api/guild/' + _dashGuildId + '/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ [key]: value ? 1 : 0 })
                        });
                        showSaveStatus();
                    } catch(e) { console.error('saveAutomodSetting error', e); }
                }
                async function toggleModule(guildId, key, enabled) {
                    try {
                        const res = await fetch('/api/guild/' + guildId + '/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ [key]: enabled ? 1 : 0 })
                        });
                        const data = await res.json();
                        if (data.success) {
                            showSaveStatus();
                        } else {
                            console.error('toggleModule error:', data.error);
                        }
                    } catch(e) {
                        console.error('toggleModule error', e);
                    }
                }
async function uploadImageFile(input, fieldName, onDone) {
                    const file = input.files && input.files[0];
                    if (!file) return;

                    if (!file.type.startsWith('image/')) {
                        alert('? ���� ������ ��� ���� ���� (PNG, JPG, WEBP, GIF)');
                        return;
                    }

                    if (file.size > 15 * 1024 * 1024) {
                        alert('? ��� ������ ������ 15 ��������. ���� ������ ���� ����.');
                        return;
                    }

                    const btnText = document.getElementById('btn_text_' + fieldName);
                    const origText = btnText ? btnText.innerText : '��� ������';
                    if (btnText) btnText.innerText = '���� �����... ?';

                    const reader = new FileReader();
                    reader.onload = async function(e) {
                        try {
                            const res = await fetch('/api/guild/${guildId}/upload-image', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    imageBase64: e.target.result,
                                    fieldName: fieldName
                                })
                            });
                            const data = await res.json();
                            if (data.success && data.url) {
                                const hiddenInput = document.getElementById('input_' + fieldName);
                                if (hiddenInput) hiddenInput.value = data.url;

                                const imgElem = document.getElementById('img_' + fieldName);
                                const placeholderElem = document.getElementById('placeholder_' + fieldName);
                                if (imgElem) {
                                    imgElem.src = data.url;
                                    imgElem.classList.remove('hidden');
                                }
                                if (placeholderElem) {
                                    placeholderElem.classList.add('hidden');
                                }
                                if (btnText) btnText.innerText = '? �� �����';
                                setTimeout(() => { if (btnText) btnText.innerText = origText; }, 2500);
                                if (typeof onDone === 'function') onDone(data.url);
                            } else {
                                alert('? ��� ��� ������: ' + (data.error || '��� ��� �����'));
                                if (btnText) btnText.innerText = origText;
                            }
                        } catch(err) {
                            alert('? ��� ��� �� ������� ����� ��� ������');
                            if (btnText) btnText.innerText = origText;
                        }
                    };
                    reader.readAsDataURL(file);
                }

                function clearUploadedImageInDOM(fieldName, onDone) {
                    const hiddenInput = document.getElementById('input_' + fieldName);
                    if (hiddenInput) hiddenInput.value = '';

                    const imgElem = document.getElementById('img_' + fieldName);
                    const placeholderElem = document.getElementById('placeholder_' + fieldName);
                    if (imgElem) {
                        imgElem.src = '';
                        imgElem.classList.add('hidden');
                    }
                    if (placeholderElem) {
                        placeholderElem.classList.remove('hidden');
                    }
                    const fileInput = document.getElementById('file_' + fieldName);
                    if (fileInput) fileInput.value = '';
                    if (typeof onDone === 'function') onDone();
                }
                </script>
                ${embedScriptHtml ? `<script>
${embedScriptHtml}
</script>` : ''}

            </body>
            </html>
            `);
        } catch (error) {
            console.error("Guild dashboard error:", error);
            res.status(500).send(`<pre style="color:red;background:#111;padding:20px;font-family:monospace">${error.stack || error.message || error}</pre>`);
        }
    });

    // 5. REST APIs
    app.post('/api/guild/:guildId/upload-image', express.json({ limit: '20mb' }), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { imageBase64, fieldName } = req.body;
            if (!imageBase64) return res.status(400).json({ success: false, error: '�� ��� ����� �� ����' });

            // Base64 regex parsing
            const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            let ext = 'png';
            let dataBuffer = null;

            if (matches && matches.length === 3) {
                const mime = matches[1];
                if (mime === 'image/jpeg' || mime === 'image/jpg') ext = 'jpg';
                else if (mime === 'image/gif') ext = 'gif';
                else if (mime === 'image/webp') ext = 'webp';
                else ext = 'png';
                dataBuffer = Buffer.from(matches[2], 'base64');
            } else {
                dataBuffer = Buffer.from(imageBase64, 'base64');
            }

            if (dataBuffer.length > 15 * 1024 * 1024) {
                return res.status(400).json({ success: false, error: '��� ������ ���� ���� (���� ������ 15 ��������)' });
            }

            const fs = require('fs');
            const path = require('path');
            const uploadDir = path.join(__dirname, 'public', 'uploads');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            const cleanField = (fieldName || 'img').replace(/[^a-zA-Z0-9_-]/g, '_');
            const fileName = `${cleanField}_${req.params.guildId}_${Date.now()}.${ext}`;
            const filePath = path.join(uploadDir, fileName);
            fs.writeFileSync(filePath, dataBuffer);

            const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
            const host = req.get('host');
            const fullUrl = `${protocol}://${host}/uploads/${fileName}`;

            res.json({ success: true, url: fullUrl });
        } catch (e) {
            console.error('Upload image error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/settings', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const settings = req.body;
            if (database.updateGuildSettings) {
                database.updateGuildSettings(guildId, settings);
            }
            // ����� ��� ����� �� ������� �� ������� �����
            if (settings.bot_nickname !== undefined && client?.guilds?.cache) {
                const targetGuild = client.guilds.cache.get(guildId);
                if (targetGuild?.members?.me) {
                    targetGuild.members.me.setNickname(settings.bot_nickname || null).catch(() => {});
                }
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // Logs Auto-Setup & Delete-Channels API
    // =============================================
    app.post('/api/guild/:guildId/logs/auto-setup', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { mode } = req.body;
            if (!['grouped', 'detailed'].includes(mode)) {
                return res.status(400).json({ success: false, error: 'Invalid mode. Use grouped or detailed.' });
            }
            const guild = client?.guilds?.cache?.get(guildId);
            if (!guild) return res.status(404).json({ success: false, error: '������� ��� ���� ������ ������' });
            const logsCmd = require('../commands/admin/logs');
            const runSetupFn = logsCmd._runSetup;
            if (typeof runSetupFn !== 'function') return res.status(500).json({ success: false, error: '���� ����� ����� �������' });
            const created = await runSetupFn(guild, mode);
            res.json({ success: true, created: created.length, message: '�� ����� ' + created.length + ' ���� ����� �����' });
        } catch (e) {
            console.error('Logs auto-setup error:', e);
            res.status(500).json({ success: false, error: e.message || '��� ��� ����� �������' });
        }
    });

    app.post('/api/guild/:guildId/logs/delete-channels', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const guild = client?.guilds?.cache?.get(guildId);
            if (!guild) return res.status(404).json({ success: false, error: '������� ��� ���� ������ ������' });
            const logsCmd = require('../commands/admin/logs');
            const deleteFn = logsCmd._deleteLogsChannels;
            if (typeof deleteFn !== 'function') return res.status(500).json({ success: false, error: '���� ����� ����� �����' });
            const deleted = await deleteFn(guild);
            res.json({ success: true, deleted, message: '�� ��� ' + deleted + ' ���� ������ �������' });
        } catch (e) {
            console.error('Logs delete-channels error:', e);
            res.status(500).json({ success: false, error: e.message || '��� ��� ����� �����' });
        }
    });

    // =============================================
    // Whitelist & AntiMod API
    // =============================================
    app.post('/api/guild/:guildId/whitelist', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { userId, type } = req.body;
            if (!userId) return res.status(400).json({ success: false, error: 'User ID is required' });

            if (database.addProtectionWhitelist) {
                database.addProtectionWhitelist(guildId, String(userId).trim(), type || 'whitelist', req.session.user.id);
            } else {
                rawDb.prepare(`
                    INSERT OR REPLACE INTO protection_whitelist (guild_id, user_id, type, added_by, created_at)
                    VALUES (?, ?, ?, ?, strftime('%s','now'))
                `).run(guildId, String(userId).trim(), type || 'whitelist', req.session.user.id);
            }

            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.delete('/api/guild/:guildId/whitelist', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { userId, type } = req.body;
            if (!userId) return res.status(400).json({ success: false, error: 'User ID is required' });

            if (database.removeProtectionWhitelist) {
                database.removeProtectionWhitelist(guildId, String(userId).trim(), type || 'whitelist');
            } else {
                rawDb.prepare(`
                    DELETE FROM protection_whitelist 
                    WHERE guild_id = ? AND user_id = ? AND type = ?
                `).run(guildId, String(userId).trim(), type || 'whitelist');
            }

            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // Autoresponder API
    // =============================================
    app.post('/api/guild/:guildId/autoresponder', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const payload = req.body;
            if (!payload || !payload.trigger_word || !payload.reply_text) {
                return res.status(400).json({ success: false, error: '������ ����� �������' });
            }

            if (database.addAutoResponder) {
                const inserted = database.addAutoResponder(guildId, payload);
                return res.json({ success: true, item: inserted });
            }

            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.delete('/api/guild/:guildId/autoresponder/:id', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, id } = req.params;

            if (database.deleteAutoResponder) {
                database.deleteAutoResponder(guildId, id);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // Warn Punishments API
    // =============================================
    app.post('/api/guild/:guildId/warn-punishments', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { warnCount, actionType } = req.body;
            if (!warnCount || !actionType) return res.status(400).json({ success: false, error: '��� ��������� ���� ������� �������' });

            if (database.addWarnPunishment) {
                const inserted = database.addWarnPunishment(guildId, parseInt(warnCount), actionType);
                return res.json({ success: true, item: inserted });
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.delete('/api/guild/:guildId/warn-punishments/:id', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, id } = req.params;

            if (database.deleteWarnPunishment) {
                database.deleteWarnPunishment(id, guildId);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // Level Rewards API
    // =============================================
    app.post('/api/guild/:guildId/level-reward', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { level, roleId, rewardType, voiceLevel } = req.body;
            if (!level || !roleId) return res.status(400).json({ success: false, error: '������� ������� �������' });

            if (database.addLevelReward) {
                const inserted = database.addLevelReward(guildId, parseInt(level), String(roleId).trim(), rewardType || 'text', parseInt(voiceLevel) || 0);
                return res.json({ success: true, item: inserted });
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.delete('/api/guild/:guildId/level-reward/:id', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, id } = req.params;

            if (database.removeLevelReward) {
                database.removeLevelReward(guildId, id);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/clear-all-warnings', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            rawDb.prepare('DELETE FROM warnings WHERE guild_id = ?').run(guildId);
            rawDb.prepare('UPDATE users SET warnings = 0 WHERE guild_id = ?').run(guildId);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/reset-data', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            rawDb.prepare('DELETE FROM guild_settings WHERE guild_id = ?').run(guildId);
            rawDb.prepare('DELETE FROM warnings WHERE guild_id = ?').run(guildId);
            rawDb.prepare('DELETE FROM autoresponders WHERE guild_id = ?').run(guildId);
            rawDb.prepare('DELETE FROM tickets WHERE guild_id = ?').run(guildId);
            rawDb.prepare('DELETE FROM giveaways WHERE guild_id = ?').run(guildId);
            rawDb.prepare('DELETE FROM suggestions WHERE guild_id = ?').run(guildId);
            rawDb.prepare('DELETE FROM security_logs WHERE guild_id = ?').run(guildId);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/broadcast-now', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const settings = database.getGuildSettings(guildId);
            const channelId = settings.broadcast_channel;
            if (!channelId) return res.status(400).json({ success: false, error: '�� ��� ����� ���� ����' });

            let msgs = [];
            try { msgs = JSON.parse(settings.broadcast_messages || '[]'); } catch(e) {}
            if (msgs.length === 0) return res.status(400).json({ success: false, error: '�� ���� ����� ����� �� �������' });

            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return res.status(404).json({ success: false, error: '������ ��� �����' });

            const randomMsg = msgs[Math.floor(Math.random() * msgs.length)];
            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setColor('#9333ea')
                .setDescription(randomMsg)
                .setTimestamp()
                .setFooter({ text: '?? ����� ������ � ZENO BOT' });

            if (settings.broadcast_image) {
                embed.setImage(settings.broadcast_image);
            }

            const mentionContent = settings.broadcast_mention_role ? `<@&${settings.broadcast_mention_role}>` : '';
            await channel.send({ content: mentionContent || undefined, embeds: [embed] });
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/send-embed', express.json(), async (req, res) => {
        try {
            console.log('[send-embed] session user:', req.session?.user?.id, 'guildId:', req.params.guildId);
            if (!req.session?.user) return res.status(401).json({ success: false, error: '��� ���� ���� ���� ����� ������ ������' });
            const { guildId } = req.params;
            const { channelId, color, title, titleUrl, desc, author, authorIcon, image, thumbnail, footer, footerIcon, timestamp, fields } = req.body;

            console.log('[send-embed] body:', JSON.stringify({ channelId, title: title?.substring(0,30), desc: desc?.substring(0,30), color }));

            if (!channelId) return res.status(400).json({ success: false, error: '���� ����� ������ ���������' });
            if (!title && !desc) return res.status(400).json({ success: false, error: '���� ����� ����� �� ����� �������' });

            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch((e) => {
                console.error('[send-embed] fetch channel error:', e.message);
                return null;
            });

            console.log('[send-embed] channel found:', channel?.id, channel?.type, channel?.isTextBased?.());

            if (!channel) return res.status(404).json({ success: false, error: '�� ��� ������ ��� ������ � ���� �� ����� ����� �� �������' });
            if (!channel.isTextBased()) return res.status(400).json({ success: false, error: '������ �������� ���� ���� ����' });

            const { EmbedBuilder, PermissionsBitField } = require('discord.js');

            // ������ �� ������ �������
            const botMember = channel.guild?.members?.me;
            if (botMember) {
                const perms = channel.permissionsFor(botMember);
                if (!perms?.has(PermissionsBitField.Flags.SendMessages)) {
                    return res.status(403).json({ success: false, error: '����� �� ���� ������ ������� �� ��� ������' });
                }
                if (!perms?.has(PermissionsBitField.Flags.EmbedLinks)) {
                    return res.status(403).json({ success: false, error: '����� �� ���� ������ ����� Embed �� ��� ������ � ���� ������ Embed Links' });
                }
            }

            const embed = new EmbedBuilder();

            if (color) embed.setColor(color);
            if (title) embed.setTitle(title);
            if (titleUrl) embed.setURL(titleUrl);
            if (desc) embed.setDescription(desc);
            if (author) embed.setAuthor({ name: author, iconURL: authorIcon || undefined });
            if (image) embed.setImage(image);
            if (thumbnail) embed.setThumbnail(thumbnail);
            if (footer) embed.setFooter({ text: footer, iconURL: footerIcon || undefined });
            if (timestamp) embed.setTimestamp();
            if (Array.isArray(fields) && fields.length > 0) {
                embed.addFields(fields.map(f => ({ name: f.name || '\u200b', value: f.value || '\u200b', inline: !!f.inline })));
            }

            await channel.send({ embeds: [embed] });
            console.log('[send-embed] ? sent successfully to', channelId);
            res.json({ success: true });
        } catch (e) {
            console.error('[send-embed] Error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/giveaways', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { prize, channelId, duration, winners, desc, color, image, emoji, reqRole } = req.body;
            if (!prize || !channelId) return res.status(400).json({ success: false, error: 'Missing prize or channel' });

            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return res.status(404).json({ success: false, error: 'Channel not found' });

            let durationMs = 24 * 60 * 60 * 1000;
            if (duration === '10m') durationMs = 10 * 60 * 1000;
            else if (duration === '1h') durationMs = 60 * 60 * 1000;
            else if (duration === '6h') durationMs = 6 * 60 * 60 * 1000;
            else if (duration === '12h') durationMs = 12 * 60 * 60 * 1000;
            else if (duration === '3d') durationMs = 3 * 24 * 60 * 60 * 1000;
            else if (duration === '7d') durationMs = 7 * 24 * 60 * 60 * 1000;

            const endTime = Date.now() + durationMs;
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

            let descText = '**�������:** ' + prize + (desc ? ('\n\n' + desc) : '') + '\n\n**��� ��������:** ' + (winners || 1) + '\n**����� ��:** <t:' + Math.floor(endTime / 1000) + ':R>';
            if (reqRole) {
                descText += '\n\n??? **������ ������� ��� ��������� ���:** <@&' + reqRole + '>';
            }

            const gwEmbed = new EmbedBuilder()
                .setTitle('?? ��� ��� ���� ����!')
                .setDescription(descText)
                .setColor(color || '#ef5700')
                .setFooter({ text: reqRole ? '���� ����� ����� � ���� ��������' : '���� ��� ���� ����� ��������!' })
                .setTimestamp(endTime);

            if (image) gwEmbed.setImage(image);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('gw_enter_btn')
                    .setLabel('������ �� ����� ����')
                    .setEmoji(emoji || '??')
                    .setStyle(ButtonStyle.Primary)
            );

            const msg = await channel.send({ embeds: [gwEmbed], components: [row] });

            if (database.createGiveaway) {
                // ������� ������: (messageId, channelId, guildId, prize, winnersCount, endTime, hostId, reqRole)
                database.createGiveaway(msg.id, channel.id, guildId, prize, winners || 1, endTime, req.session.user.id, reqRole);
            }

            res.json({ success: true, messageId: msg.id });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/suggestions', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { title, category, content } = req.body;
            if (!content) return res.status(400).json({ success: false, error: 'Content is required' });

            const settings = database.getGuildSettings(guildId);
            const channelId = settings.suggestions_channel;
            let msgId = null;

            if (channelId) {
                const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
                if (channel && channel.isTextBased()) {
                    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                    const avatarURL = req.session.user.avatar
                        ? `https://cdn.discordapp.com/avatars/${req.session.user.id}/${req.session.user.avatar}.png`
                        : `https://cdn.discordapp.com/embed/avatars/0.png`;

                    const suggEmbed = new EmbedBuilder()
                        .setColor(0x9333ea)
                        .setAuthor({ name: req.session.user.username + ' � ������ ����', iconURL: avatarURL })
                        .setTitle(title ? ('?? ' + title) : '?? ������ ����')
                        .setDescription(content)
                        .addFields(
                            { name: '?? �������', value: category || '���', inline: true },
                            { name: '? ������', value: '��� ��������', inline: true },
                            { name: '?? ������� | 0%', value: '??????????\n?? 0  |  ?? 0', inline: false }
                        )
                        .setFooter({ text: '���� ��������: ' + req.session.user.username + ' � �� ���������' })
                        .setTimestamp();

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('sugg_upvote').setLabel('0').setEmoji('??').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('sugg_downvote').setLabel('0').setEmoji('??').setStyle(ButtonStyle.Danger)
                    );

                    const sentMsg = await channel.send({ embeds: [suggEmbed], components: [row] });
                    msgId = sentMsg.id;

                    if (settings.suggestions_auto_thread !== 0) {
                        sentMsg.startThread({
                            name: title ? ('������: ' + title).slice(0, 95) : '������ ��������',
                            autoArchiveDuration: 1440
                        }).catch(() => {});
                    }
                }
            }

            const newSugg = database.createSuggestion({
                guild_id: guildId,
                channel_id: channelId,
                message_id: msgId,
                user_id: req.session.user.id,
                title: title,
                content: content,
                category: category || '���'
            });

            res.json({ success: true, suggestion: newSugg });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.patch('/api/guild/:guildId/suggestions/:id/status', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, id } = req.params;
            const { status, reason } = req.body;

            const updated = database.updateSuggestionStatus(id, status, reason, req.session.user.id);

            // ? ����� embed ������� ��� ���� ������� ������
            if (updated && updated.message_id && updated.channel_id) {
                try {
                    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                    const ch = client.channels.cache.get(updated.channel_id) || await client.channels.fetch(updated.channel_id).catch(() => null);
                    if (ch && ch.isTextBased()) {
                        const msg = await ch.messages.fetch(updated.message_id).catch(() => null);
                        if (msg) {
                            let upCount = 0, downCount = 0;
                            try { upCount = JSON.parse(updated.upvotes || '[]').length; } catch(e) {}
                            try { downCount = JSON.parse(updated.downvotes || '[]').length; } catch(e) {}
                            const total = upCount + downCount || 1;
                            const pct = Math.round((upCount / total) * 100);
                            const bar = '?'.repeat(Math.round(pct / 10)) + '?'.repeat(10 - Math.round(pct / 10));

                            const statusMap = {
                                pending: { label: '? ��� ��������', color: 0xf59e0b },
                                accepted: { label: '? �����', color: 0x22c55e },
                                rejected: { label: '? �����', color: 0xef4444 },
                                implemented: { label: '?? �� �������', color: 0x6366f1 }
                            };
                            const sm = statusMap[status] || statusMap.pending;

                            const newEmbed = new EmbedBuilder()
                                .setColor(sm.color)
                                .setTitle(updated.title ? ('?? ' + updated.title) : '?? ������')
                                .setDescription(updated.content)
                                .addFields(
                                    { name: '?? �������', value: updated.category || '���', inline: true },
                                    { name: '?? ������', value: sm.label, inline: true },
                                    { name: `?? ������� | ${pct}%`, value: `${bar}\n?? ${upCount}  |  ?? ${downCount}`, inline: false }
                                )
                                .setFooter({ text: `���� ��������: ${updated.user_id} � �����: ${req.session.user.username}` })
                                .setTimestamp();

                            if (reason) newEmbed.addFields({ name: '?? �� �������', value: reason });

                            const row = new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId('sugg_upvote').setLabel(String(upCount)).setEmoji('??').setStyle(ButtonStyle.Success),
                                new ButtonBuilder().setCustomId('sugg_downvote').setLabel(String(downCount)).setEmoji('??').setStyle(ButtonStyle.Danger)
                            );

                            await msg.edit({ embeds: [newEmbed], components: [row] });
                        }
                    }
                } catch(embedErr) {
                    console.error('[Suggestions] Failed to update Discord embed:', embedErr.message);
                }
            }

            res.json({ success: true, updated });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    
    // =============================================
    // Tickets Panel API (����� ���� ������� ����� ������)
    // =============================================
    app.post('/api/guild/:guildId/tickets/send-panel', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const settings = database.getGuildSettings(guildId);
            const channelId = req.body.channelId || settings.ticket_panel_channel;

            if (!channelId) return res.status(400).json({ success: false, error: '�� ��� ����� ��� ����� ���� �������' });

            const channel = client?.channels?.cache?.get(channelId) || await client?.channels?.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return res.status(400).json({ success: false, error: '������ ��� ������ �� ���� ����' });

            const guildObj = client?.guilds?.cache?.get(guildId);
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

            const title = req.body.ticket_panel_title || settings.ticket_panel_title || '?? ����� ����� �����';
            const bannerUrl = req.body.ticket_panel_banner || settings.ticket_panel_banner || null;
            const desc = req.body.ticket_panel_desc || settings.ticket_panel_desc || '���� �������� �� ��������� �� ����� ������� ���� ��� ���� ����� ���� ����� ���� �� ���� �����.';

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(title)
                .setDescription(desc)
                .setFooter({ text: guildObj?.name || 'ZENO Tickets', iconURL: guildObj?.iconURL({ dynamic: true }) || undefined })
                .setTimestamp();

            if (bannerUrl) {
                try {
                    embed.setImage(bannerUrl);
                } catch(e) {}
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('open_ticket')
                    .setLabel('��� ����� | Open Ticket')
                    .setEmoji('??')
                    .setStyle(ButtonStyle.Primary)
            );

            await channel.send({ embeds: [embed], components: [row] });

            res.json({ success: true });
        } catch(e) {
            console.error('Error sending ticket panel:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // Staff Activity & Shift API (���� ������� �������)
    // =============================================
    app.post('/api/guild/:guildId/staff/send-panel', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const settings = database.getGuildSettings(guildId);
            const channelId = req.body.channelId || settings.staff_login_channel;

            if (!channelId) return res.status(400).json({ success: false, error: '�� ��� ����� ���� ���� ������ ���������' });

            const channel = client?.channels?.cache?.get(channelId) || await client?.channels?.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return res.status(400).json({ success: false, error: '������ ��� ������ �� ���� ����' });

            const guildObj = client?.guilds?.cache?.get(guildId);
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

            const bannerImg = settings.staff_banner_url && settings.staff_banner_url.trim() !== '' ? settings.staff_banner_url.trim() : null;
            const embed = new EmbedBuilder()
                .setColor('#7c3aed')
                .setTitle('?? ���� ����� ���� ������� ������� | Staff Shift')
                .setDescription(
                    '������ ��� �� ����� ���� ������� ??\n\n' +
                    '� ���� ����� ������ �� ������� �������� ����� ������ ����� ���� ��� �� **����� ������ (Login)** ??\n' +
                    '� ��� ������ ���� �����ߡ ���� ��� �� **����� ������ (Logout)** ?? ���� ������ ������ ����.\n\n' +
                    '?? **������:** ��� ����� ����� �������� ��� ���� �� ��������� ���� ������� �������.'
                )
                .setFooter({ text: guildObj?.name || 'ZENO Bot', iconURL: guildObj?.iconURL({ dynamic: true }) || undefined })
                .setTimestamp();

            if (bannerImg) {
                embed.setImage(bannerImg);
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('staff_login_btn')
                    .setLabel('����� ������ | Login')
                    .setEmoji('??')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('staff_logout_btn')
                    .setLabel('����� ������ | Logout')
                    .setEmoji('??')
                    .setStyle(ButtonStyle.Danger)
            );

            await channel.send({ embeds: [embed], components: [row] });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.post('/api/guild/:guildId/staff/set-points', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { userId, points } = req.body;
            if (!userId || points === undefined) return res.status(400).json({ success: false, error: 'Missing parameters' });

            if (database.setStaffPoints) {
                database.setStaffPoints(guildId, userId, parseInt(points, 10) || 0);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/staff/add-points', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { userId, points } = req.body;
            if (!userId || !points) return res.status(400).json({ success: false, error: 'Missing parameters' });

            if (database.addStaffPoints) {
                database.addStaffPoints(guildId, userId, parseInt(points, 10) || 0);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/staff/reset', (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            if (database.resetStaffStats) {
                database.resetStaffStats(guildId);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // Backup System API
    // =============================================
    app.post('/api/guild/:guildId/backup/create', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { label } = req.body;

            rawDb.exec(`CREATE TABLE IF NOT EXISTS guild_backups (
                id TEXT PRIMARY KEY,
                guild_id TEXT NOT NULL,
                created_by TEXT NOT NULL,
                label TEXT DEFAULT '',
                channels_count INTEGER DEFAULT 0,
                roles_count INTEGER DEFAULT 0,
                settings_snapshot TEXT,
                channels_snapshot TEXT,
                roles_snapshot TEXT,
                created_at INTEGER DEFAULT (strftime('%s','now'))
            )`);

            const guild = client?.guilds?.cache?.get(guildId);
            if (!guild) return res.status(404).json({ success: false, error: '������� ��� ����� �� ����� ��� ����' });

            // Snapshot channels
            const channelsSnapshot = guild.channels.cache.map(ch => ({
                id: ch.id, name: ch.name, type: ch.type,
                parentId: ch.parentId, position: ch.position,
                topic: ch.topic || null, nsfw: ch.nsfw || false,
                bitrate: ch.bitrate || null, userLimit: ch.userLimit || null,
            }));

            // Snapshot roles
            const rolesSnapshot = guild.roles.cache
                .filter(r => !r.managed && r.id !== guildId)
                .map(r => ({
                    id: r.id, name: r.name, color: r.hexColor,
                    hoist: r.hoist, mentionable: r.mentionable,
                    permissions: r.permissions.bitfield.toString(),
                    position: r.position,
                }));

            // Snapshot settings
            let settingsSnapshot = {};
            try { settingsSnapshot = database.getGuildSettings(guildId); } catch(e) {}

            const backupId = 'bk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            rawDb.prepare(
                'INSERT INTO guild_backups (id, guild_id, created_by, label, channels_count, roles_count, settings_snapshot, channels_snapshot, roles_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).run(
                backupId, guildId, req.session.user.id,
                label || '',
                channelsSnapshot.length, rolesSnapshot.length,
                JSON.stringify(settingsSnapshot),
                JSON.stringify(channelsSnapshot),
                JSON.stringify(rolesSnapshot)
            );

            // Auto-delete backups older than 30 days or exceeding 10 total
            try {
                const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
                rawDb.prepare('DELETE FROM guild_backups WHERE guild_id = ? AND created_at < ?').run(guildId, thirtyDaysAgo);
                const allBackups = rawDb.prepare('SELECT id FROM guild_backups WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
                if (allBackups.length > 10) {
                    const toDelete = allBackups.slice(10).map(b => b.id);
                    for (const id of toDelete) rawDb.prepare('DELETE FROM guild_backups WHERE id = ?').run(id);
                }
            } catch(e) {}

            res.json({ success: true, id: backupId, channels_count: channelsSnapshot.length, roles_count: rolesSnapshot.length });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/backup/:backupId/restore', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, backupId } = req.params;

            const backup = rawDb.prepare('SELECT * FROM guild_backups WHERE id = ? AND guild_id = ?').get(backupId, guildId);
            if (!backup) return res.status(404).json({ success: false, error: '������ ���������� ��� ������' });

            const guild = client?.guilds?.cache?.get(guildId);
            if (!guild) return res.status(404).json({ success: false, error: '������� ��� ����' });

            let rolesRestored = 0, channelsRestored = 0;

            // Restore missing roles
            try {
                const savedRoles = JSON.parse(backup.roles_snapshot || '[]');
                const existingRoleNames = new Set(guild.roles.cache.map(r => r.name.toLowerCase()));
                for (const role of savedRoles) {
                    if (!existingRoleNames.has(role.name.toLowerCase())) {
                        try {
                            await guild.roles.create({
                                name: role.name,
                                color: role.color,
                                hoist: role.hoist,
                                mentionable: role.mentionable,
                                permissions: BigInt(role.permissions),
                                reason: 'ZENO Backup Restore'
                            });
                            rolesRestored++;
                        } catch(e) {}
                    }
                }
            } catch(e) {}

            // Restore missing channels
            try {
                const savedChannels = JSON.parse(backup.channels_snapshot || '[]');
                const existingChannelNames = new Set(guild.channels.cache.map(c => c.name.toLowerCase()));
                for (const ch of savedChannels) {
                    if (!existingChannelNames.has(ch.name.toLowerCase())) {
                        try {
                            await guild.channels.create({
                                name: ch.name,
                                type: ch.type,
                                topic: ch.topic,
                                nsfw: ch.nsfw,
                                bitrate: ch.bitrate,
                                userLimit: ch.userLimit,
                                reason: 'ZENO Backup Restore'
                            });
                            channelsRestored++;
                        } catch(e) {}
                    }
                }
            } catch(e) {}

            res.json({ success: true, message: `��� ���������: ${rolesRestored} ���� �${channelsRestored} ���� ��� �������` });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/backup/:backupId/delete', (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, backupId } = req.params;
            rawDb.prepare('DELETE FROM guild_backups WHERE id = ? AND guild_id = ?').run(backupId, guildId);
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.get('/api/guild/:guildId/backups', (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const rows = rawDb.prepare('SELECT id, guild_id, created_by, label, channels_count, roles_count, created_at FROM guild_backups WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
            res.json({ success: true, data: rows });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // Stat Channels API
    // =============================================
    app.post('/api/guild/:guildId/stat-channels', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { stat_type, channel_id, custom_prefix } = req.body;

            if (!stat_type || !channel_id) return res.status(400).json({ success: false, error: 'stat_type and channel_id are required' });

            const VALID_TYPES = ['total_members','humans','bots','online','voice','text_channels','voice_channels','total_channels','roles','boosts','boost_level'];
            if (!VALID_TYPES.includes(stat_type)) return res.status(400).json({ success: false, error: 'Invalid stat_type' });

            rawDb.exec(`CREATE TABLE IF NOT EXISTS stat_channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                stat_type TEXT NOT NULL,
                custom_prefix TEXT DEFAULT '',
                enabled INTEGER DEFAULT 1,
                UNIQUE(guild_id, channel_id)
            )`);

            rawDb.prepare('INSERT OR REPLACE INTO stat_channels (guild_id, channel_id, stat_type, custom_prefix, enabled) VALUES (?, ?, ?, ?, 1)')
                .run(guildId, channel_id.trim(), stat_type, custom_prefix || '');

            // Trigger immediate update
            try {
                const StatChannelsService = require('./services/statChannels');
                // Force update by running the service tick
                const tempSvc = new StatChannelsService(client);
                tempSvc._updateChannel({ guild_id: guildId, channel_id: channel_id.trim(), stat_type, custom_prefix: custom_prefix || '', enabled: 1 }).catch(() => {});
            } catch(e) {}

            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/stat-channels/:id/delete', (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, id } = req.params;
            rawDb.prepare('DELETE FROM stat_channels WHERE id = ? AND guild_id = ?').run(id, guildId);
            // Redirect back to stat-channels page
            res.redirect('/dashboard/' + guildId + '/stat-channels');
        } catch(e) {
            res.status(500).send('Error: ' + e.message);
        }
    });

    app.get('/api/guild/:guildId/stat-channels', (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const rows = rawDb.prepare('SELECT * FROM stat_channels WHERE guild_id = ?').all(guildId);
            res.json({ success: true, data: rows });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/stat-channels/update-now', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const StatChannelsService = require('./services/statChannels');
            const svc = new StatChannelsService(client);
            await svc.forceUpdateGuild(guildId);
            res.json({ success: true, message: '�� ����� ����� ���������� ����!' });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ===================== Guild Settings API (��� ������� ������� �������� �����) =====================
    app.post('/api/guild/:guildId/settings', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const payload = req.body;
            if (!payload || typeof payload !== 'object') {
                return res.status(400).json({ success: false, error: 'Invalid payload' });
            }

            database.updateGuildSettings(guildId, payload);
            res.json({ success: true, message: '�� ��� ��������� ����� �� ����� ��������' });
        } catch (err) {
            console.error('[SETTINGS API] Error updating settings:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ===================== Logs System API (����� ������� ������� ??) =====================
    const { PermissionFlagsBits } = require('discord.js');
    const logsCommand = require('../commands/admin/logs');

    // ����� ����� ������� �������� (grouped = ���� ��� ��� / detailed = ���� ��� ��� ���)
    app.post('/api/guild/:guildId/logs/auto-setup', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const mode = req.body?.mode === 'detailed' ? 'detailed' : 'grouped';

            const guild = client?.guilds?.cache?.get(guildId);
            if (!guild) return res.status(404).json({ success: false, error: '����� ��� ����� �� ��� �������' });

            const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
            if (!botMember?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
                return res.status(400).json({ success: false, error: '����� �� ���� ������ ����� �������' });
            }

            const created = await logsCommand._runSetup(guild, mode);
            res.json({ success: true, created: created.length });
        } catch (e) {
            console.error('[LOGS API] auto-setup error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ��� �������� ����� ZENO ����� ������� ������� ������ �������
    app.post('/api/guild/:guildId/logs/delete-channels', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;

            const guild = client?.guilds?.cache?.get(guildId);
            if (!guild) return res.status(404).json({ success: false, error: '����� ��� ����� �� ��� �������' });

            const deleted = await logsCommand._deleteLogsChannels(guild);
            res.json({ success: true, deleted });
        } catch (e) {
            console.error('[LOGS API] delete-channels error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // User Economy API
    app.post('/api/user/daily', (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: '��� ����� ������ �����' });
            const userId = req.session.user.id;
            const now = Date.now();
            
            const userRow = rawDb.prepare('SELECT SUM(coins) as coins, MAX(last_daily) as last_daily FROM users WHERE user_id = ?').get(userId);
            const lastDaily = userRow?.last_daily || 0;
            
            if ((now - lastDaily) < 24 * 60 * 60 * 1000) {
                const remaining = Math.ceil((24 * 60 * 60 * 1000 - (now - lastDaily)) / (1000 * 60));
                return res.status(400).json({ success: false, error: '��� ������ ����� ������ ���� �������� ������ ��� ' + remaining + ' �����' });
            }

            // Random reward between 500 and 1000 Gold
            const reward = Math.floor(Math.random() * (1000 - 500 + 1)) + 500;
            const guilds = req.session.guilds || [];
            const primaryGuildId = guilds.length > 0 ? guilds[0].id : 'global';

            rawDb.prepare('INSERT OR IGNORE INTO users (user_id, guild_id, coins, last_daily) VALUES (?, ?, 0, 0)').run(userId, primaryGuildId);
            rawDb.prepare('UPDATE users SET coins = coins + ?, last_daily = ? WHERE user_id = ? AND guild_id = ?').run(reward, now, userId, primaryGuildId);

            const updatedRow = rawDb.prepare('SELECT SUM(coins) as coins FROM users WHERE user_id = ?').get(userId);
            res.json({ success: true, amount: reward, newBalance: updatedRow?.coins || reward });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/user/buy', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: '��� ����� ������ �����' });
            const userId = req.session.user.id;
            const { type, name, price } = req.body;

            const userRow = rawDb.prepare('SELECT SUM(coins) as coins FROM users WHERE user_id = ?').get(userId);
            const coins = userRow?.coins || 0;

            if (coins < price) {
                return res.status(400).json({ success: false, error: '����� ������ (' + coins.toLocaleString() + ') �� ���� ����� ��� ������ (' + price.toLocaleString() + ' ??)' });
            }

            const guilds = req.session.guilds || [];
            const primaryGuildId = guilds.length > 0 ? guilds[0].id : 'global';

            rawDb.prepare('INSERT OR IGNORE INTO users (user_id, guild_id, coins) VALUES (?, ?, 0)').run(userId, primaryGuildId);
            rawDb.prepare('UPDATE users SET coins = MAX(0, coins - ?) WHERE user_id = ? AND guild_id = ?').run(price, userId, primaryGuildId);
            rawDb.prepare('UPDATE users SET wallpaper = ? WHERE user_id = ?').run(name, userId);
            
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });


    // =============================================
    // Applications & Hiring System API
    // =============================================
    app.post('/api/guild/:guildId/applications/create', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { title, description, log_channel, accepted_role, reviewer_role, questions, panel_image } = req.body;

            if (!title) return res.status(400).json({ success: false, error: '����� ������� �����' });
            if (!log_channel) return res.status(400).json({ success: false, error: '���� ������� ������� ������' });

            const newApp = database.createApplication(guildId, title, description, questions || [], log_channel, accepted_role, reviewer_role, panel_image || null);
            res.json({ success: true, app: newApp });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/applications/:appId/update', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { appId } = req.params;
            const { title, description, log_channel, accepted_role, reviewer_role, questions, status, panel_image } = req.body;

            const updated = database.updateApplication(appId, title, description, questions || [], log_channel, accepted_role, reviewer_role, status || 'open', panel_image || null);
            res.json({ success: true, app: updated });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/applications/:appId/delete', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { appId } = req.params;
            database.deleteApplication(appId);
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/applications/:appId/send-panel', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, appId } = req.params;
            let { channelId } = req.body;

            const appData = database.getApplication(appId);
            if (!appData) return res.status(404).json({ success: false, error: '������� ��� �����' });

            if (!channelId) channelId = appData.log_channel;
            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return res.status(404).json({ success: false, error: '�� ��� ������ ��� ������ �������' });

            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const panelEmbed = new EmbedBuilder()
                .setColor('#9333ea')
                .setTitle(`?? �����: ${appData.title}`)
                .setDescription(appData.description || '���� ��� ���� ������� ������ ������� ������� ��������� ����� �����.')
                .setFooter({ text: channel.guild.name, iconURL: channel.guild.iconURL({ dynamic: true }) || undefined })
                .setTimestamp();

            if (appData.panel_image) {
                panelEmbed.setImage(appData.panel_image);
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`btn_apply_${appData.id}`)
                    .setLabel('����� ���� ??')
                    .setStyle(ButtonStyle.Primary)
            );

            await channel.send({ embeds: [panelEmbed], components: [row] });
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });



    // =============================================
    // Staff Activity Reset API
    // =============================================
    app.post('/api/guild/:guildId/staff/reset', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            if (database.resetStaffStats) database.resetStaffStats(guildId);
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // Invites API (Add Bonus & Reset)
    // =============================================
    app.post('/api/guild/:guildId/invites/add-bonus', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { userId, amount } = req.body;
            const cleanId = String(userId || '').replace(/[^0-9]/g, '');
            const bonusAmount = parseInt(amount, 10);
            if (!cleanId || isNaN(bonusAmount)) {
                return res.status(400).json({ success: false, error: 'Invalid user ID or amount' });
            }
            if (database.addBonusInvites) {
                database.addBonusInvites(guildId, cleanId, bonusAmount);
            }
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/invites/reset', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            if (database.resetInvites) {
                database.resetInvites(guildId);
            }
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // ZENO AI Live Chat API for Dashboard
    // =============================================
    app.post('/api/guild/:guildId/ai/chat', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: '��� ����� ������ �����' });
            const { prompt } = req.body;
            if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
                return res.status(400).json({ success: false, error: '���� ����� ����� �����' });
            }
            const aiResponse = await askAI(prompt.trim());
            res.json({ success: true, response: aiResponse });
        } catch (e) {
            console.error('[Dashboard AI API Error]:', e);
            res.status(500).json({ success: false, error: e.message || '��� ��� ����� ������ �����' });
        }
    });

};

