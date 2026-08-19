const logger = require('../../utils/logger');
const db = require('../../database');

module.exports = {
  name: 'guildCreate',
  async execute(guild) {
    logger.info(`🎉 تم إضافة البوت إلى سيرفر جديد: ${guild.name} (${guild.id}) - عدد الأعضاء: ${guild.memberCount}`);
    
    // تسجيل إعدادات السيرفر الافتراضية في قاعدة البيانات فوراً
    try {
      db.getGuildSettings(guild.id);
      await guild.members.fetch().catch(() => null);
    } catch (e) {}
  }
};
