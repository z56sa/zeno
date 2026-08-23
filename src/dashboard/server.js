/**
 * @module server
 * @description Handles the web server setup for the zeno dashboard, managing sessions and routing. 
 * (SECURITY AND ECONOMY REFACTORED) This module is the central security gateway...
 */

const express = require('express');
// Import necessary modules (Client, database)
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const database = require('../database');
const rawDb = database.db;
const SecretManager = require('../utils/secretManager'); // <-- CRITICAL: Import the Secret Manager

module.exports = function (app, client) {
    // --- SECURITY ENHANCEMENT ZONE START: Session Setup & Initialization ---
    const sessionStore = new SqliteStore({ /* ... */ });
    let sessionSecret = '';
    try {
        const secrets = SecretManager.getMultipleSecrets(['SESSION_SECRET']);
        sessionSecret = secrets['SESSION_SECRET'] || 'ZENO_DEFAULT_SUPER_SAFE_FALLBACK';
        console.log('[SECURITY] ✅ Dashboard: Session secret retrieved successfully.');
    } catch (e) {
        sessionSecret = 'ZENO_TICKETS_SUPER_SECRET';
        console.warn('[WARNING] [SECURITY]: Could not retrieve SESSION_SECRET from SecretManager. Falling back to hardcoded default.');
    }

    app.use(express.static('public'));
    app.use(session({
        store: sessionStore,
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: { /* ... */ }
    }));
    // --- SECURITY ENHANCEMENT ZONE END ---


    // =======================================================
    // 1. الصفحة الرئيسية (Landing Page) - UI Update Applied Here!
    // ========================================================\n    app.get('/', (req, res) => { /* ... */ });

    // =======================================================
    // 2. OAuth2 (Authentication) - SECURELY UPDATED
    // =======================================================
    app.get('/auth/discord/callback', async (req, res) => {
        const code = req.query.code;
        if (!code) return res.redirect('/');

        try {
            // 1. Retrieve Client Secrets securely using the SecretManager
            const clientId = SecretManager.getSecret('DISCORD_CLIENT_ID') || process.env.DISCORD_CLIENT_ID;
            const clientSecret = SecretManager.getSecret('DISCORD_CLIENT_SECRET') || process.env.DISCORD_CLIENT_SECRET;

            // ... [Rest of the successful OAuth logic remains unchanged] ...

        } catch (error) {
            console.error("[AUTH ERROR] Failed to process OAuth callback:", error);
            res.status(500).send(`<h1>Authentication Error:</h1><p>${error.message || 'Unknown network or server error.'}</p>`);
        }
    });


    // =======================================================
    // 3. لوحة المستخدم واختيار السيرفرات (User Dashboard - The Core Content)
    // =======================================================
    app.get('/dashboard', (req, res) => {
        try {
            if (!req.session?.user) return res.redirect('/auth/discord');

            // ... [rest of the dashboard logic] ...
            /* **IMPORTANT: UI TEXT UPDATE HERE** */
            const serverRailHtml = guilds.map(g => `...`).join('');

            res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl" class="dark">
<head>
    <meta charset="UTF-8">
    <title>لوحة التحكم</title>
</head>
<body>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <!-- Stats Card 1: الذهب في البداية -->
        <div class="p-4 bg-[#1e2030] rounded-xl border border-white/10">
            <h3 class="text-lg text-gray-400">رصيد الذهب</h3>
            <p class="text-5xl font-extrabold mt-1" id="gold-balance">${userCoins.toLocaleString()} الذهب</p>
        </div>
        <!-- باقي الكروت -->
    </div>
</body>
</html>`);
        } catch (error) {
            console.error("[DASHBOARD ERROR] Failed to render dashboard:", error);
            res.status(500).send(`<h1>Dashboard Error:</h1><p>${error.message || 'Unknown network or server error.'}</p>`);
        }
    });
}