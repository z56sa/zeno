const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

const embedUtil = {
  /**
   * إنشاء Embed رسالة نجاح
   */
  success(title, description) {
    return new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle(`${config.emojis.success} ${title}`)
      .setDescription(description)
      .setTimestamp();
  },

  /**
   * إنشاء Embed رسالة خطأ
   */
  error(title, description) {
    return new EmbedBuilder()
      .setColor(config.colors.danger)
      .setTitle(`${config.emojis.error} ${title}`)
      .setDescription(description)
      .setTimestamp();
  },

  /**
   * إنشاء Embed رسالة تحذير
   */
  warning(title, description) {
    return new EmbedBuilder()
      .setColor(config.colors.warning)
      .setTitle(`${config.emojis.warning} ${title}`)
      .setDescription(description)
      .setTimestamp();
  },

  /**
   * إنشاء Embed رسالة عادية / رئيسية
   */
  primary(title, description) {
    return new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp();
  },

  /**
   * إنشاء Embed مخصص للسجلات (Logs)
   */
  log(title, description, color = config.colors.info) {
    return new EmbedBuilder()
      .setColor(color)
      .setTitle(`📜 ${title}`)
      .setDescription(description)
      .setTimestamp();
  }
};

module.exports = embedUtil;
