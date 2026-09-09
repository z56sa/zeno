/**
 * @module staffShiftService
 * @description خلفية مراقبة ساعات الإدارة وتسجيل الخروج التلقائي بعد مدة معينة
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../database');

class StaffShiftService {
    constructor(client) {
        this.client = client;
        this.running = false;
        this._interval = null;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this._interval = setInterval(() => this._tick(), 60 * 1000);
        console.log('[StaffShiftService] ✅ خدمة مراقبة شفتات الإدارة تعمل بنجاح (فحص كل دقيقة)');
    }

    stop() {
        if (this._interval) clearInterval(this._interval);
        this.running = false;
    }

    async _tick() {
        try {
            const activeShifts = db.getAllActiveShifts ? db.getAllActiveShifts() : [];
            if (!activeShifts || activeShifts.length === 0) return;

            const now = Math.floor(Date.now() / 1000);

            for (const shift of activeShifts) {
                const { guild_id, user_id, start_time } = shift;
                const settings = db.getGuildSettings(guild_id);
                if (settings.staff_auto_logout === 0) continue;

                const maxHours = Number(settings.staff_max_shift_hours) || 8;
                const maxSeconds = maxHours * 3600;
                const elapsed = now - start_time;

                const inactivityMins = Number(settings.staff_inactivity_minutes) || 30;
                const lastAction = shift.last_action_time || start_time;
                const inactiveSeconds = now - lastAction;

                if (elapsed >= maxSeconds) {
                    const result = db.endStaffShift(guild_id, user_id, 'auto_timeout');
                    if (result && result.success) {
                        const durationHours = Math.floor(result.duration / 3600);
                        const durationMins = Math.floor((result.duration % 3600) / 60);
                        const durationStr = durationHours + ' ساعة و ' + durationMins + ' دقيقة';

                        const guild = this.client.guilds.cache.get(guild_id);
                        const logChannelId = settings.staff_log_channel || settings.log_channel;
                        const logChannel = (guild && logChannelId) ? guild.channels.cache.get(logChannelId) : null;

                        if (logChannel && logChannel.isTextBased()) {
                            const embed = new EmbedBuilder()
                                .setColor('#e11d48')
                                .setTitle('⏰ تسجيل خروج تلقائي (انتهاء الحد الأقصى للشفت)')
                                .setDescription(`تم تسجيل خروج الإداري <@${user_id}> تلقائياً بعد بلوغ الحد الأقصى للمدة المسموحة (${maxHours} ساعات متواصلة) لحفظ الساعات بدقة.`)
                                .addFields(
                                    { name: '👤 الإداري', value: `<@${user_id}>`, inline: true },
                                    { name: '⏱️ المدة المحتسبة', value: `\`${durationStr}\``, inline: true },
                                    { name: '⭐ النقاط', value: `+${result.pointsEarned} نقطة`, inline: true }
                                )
                                .setFooter({ text: 'نظام حماية ساعات الإدارة • ZENO' })
                                .setTimestamp();

                            await logChannel.send({ embeds: [embed] }).catch(() => {});
                        }
                    }
                } else if (inactivityMins > 0 && inactiveSeconds >= (inactivityMins * 60)) {
                    // تسجيل خروج لعدم التفاعل (شات أو استلام تذاكر)
                    const result = db.endStaffShift(guild_id, user_id, 'auto_inactive');
                    if (result && result.success) {
                        const durationHours = Math.floor(result.duration / 3600);
                        const durationMins = Math.floor((result.duration % 3600) / 60);
                        const durationStr = durationHours > 0 
                            ? `${durationHours} ساعة و ${durationMins} دقيقة` 
                            : `${durationMins} دقيقة`;

                        const guild = this.client.guilds.cache.get(guild_id);
                        const logChannelId = settings.staff_log_channel || settings.log_channel;
                        const logChannel = (guild && logChannelId) ? guild.channels.cache.get(logChannelId) : null;

                        if (logChannel && logChannel.isTextBased()) {
                            const embed = new EmbedBuilder()
                                .setColor('#f59e0b')
                                .setTitle('💤 تسجيل خروج تلقائي (عدم تفاعل)')
                                .setDescription(`تم تسجيل خروج الإداري <@${user_id}> تلقائياً لعدم التفاعل في الشات أو استلام التذاكر لمدة (${inactivityMins} دقيقة).`)
                                .addFields(
                                    { name: '👤 الإداري', value: `<@${user_id}>`, inline: true },
                                    { name: '⏱️ المدة المحتسبة', value: `\`${durationStr}\``, inline: true },
                                    { name: '⭐ النقاط', value: `+${result.pointsEarned} نقطة`, inline: true }
                                )
                                .setFooter({ text: 'نظام حماية ساعات الإدارة • ZENO' })
                                .setTimestamp();

                            await logChannel.send({ embeds: [embed] }).catch(() => {});
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[StaffShiftService] Error in tick:', e.message);
        }
    }
}

module.exports = StaffShiftService;
