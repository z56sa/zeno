const { ActivityType, Events } = require('discord.js');
const logger = require('../../utils/logger');
const inviteTracker = require('../../utils/inviteTracker');

module.exports = {
  name: 'clientReady', // استبدلناه بالنص الصريح عشان يتوافق مع الإصدارات الحديثة
  once: true,
  async execute(client) {
    // ... باقي الكود بدون تغيير
    logger.success(`🎉 تم تسجيل الدخول بنجاح باسم البوت: ${client.user.tag}`);
    // جلب جميع أعضاء السيرفرات لملء الكاش وحساب العدد الفعلي بدقة 100%
    try {
      for (const [_, guild] of client.guilds.cache) {
        await guild.members.fetch().catch(() => null);
      }
    } catch (e) { }

    // تهيئة متتبع الدعوات
    await inviteTracker.init(client);

    const totalMembers = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || g.members.cache.size || 0), 0);
    logger.info(`البوت متواجد في ${client.guilds.cache.size} سيرفر(ات) ويخدم ${totalMembers} مستخدم.`);

    // تعيين الحالة والنشاط باسم البوت الحقيقي
    client.user.setPresence({
      activities: [
        {
          name: `/help | ${client.user.username}`,
          type: ActivityType.Playing
        }
      ],
      status: 'online'
    });
  }
};
