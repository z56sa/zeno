const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

const COOLDOWNS = new Map();

module.exports = {
  name: 'daily',
  description: 'احصل على مكافأتك اليومية مع نظام الـ Streak',
  aliases: ['يومي', 'كريدت'],
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('احصل على مكافأتك اليومية'),

  async execute(interaction) {
    await interaction.deferReply();
    await this.handleDaily(interaction.user, interaction.guild.id, (opts) => interaction.editReply(opts));
  },

  async executePrefix(message) {
    await this.handleDaily(message.author, message.guild.id, (opts) => message.reply(opts));
  },

  async handleDaily(user, guildId, reply) {
    const userData = db.getUser(user.id, guildId);
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;
    const lastDaily = userData.last_daily || 0;

    if (now - lastDaily < cooldown) {
      const remaining = cooldown - (now - lastDaily);
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('⏰ انتهت مكافأتك اليومية!')
        .setDescription(`المكافأة التالية خلال:\n⌛ **${h} ساعة و${m} دقيقة**`)
        .setFooter({ text: 'عد قريباً!' })
        .setTimestamp();
      return reply({ embeds: [embed] });
    }

    // حساب الـ Streak
    const oneDayMs = 24 * 60 * 60 * 1000;
    const twoDaysMs = 48 * 60 * 60 * 1000;
    let streak = userData.streak || 0;
    if (now - lastDaily <= twoDaysMs && lastDaily > 0) {
      streak += 1;
    } else {
      streak = 1;
    }

    // حساب المكافأة
    let reward = 200;
    let bonusText = '';
    if (streak >= 100) { reward = 1200; bonusText = '🏆 **مكافأة 100 يوم متتالي!** (x6)'; }
    else if (streak >= 30) { reward = 700; bonusText = '🌟 **مكافأة 30 يوم متتالي!** (x3.5)'; }
    else if (streak >= 7) { reward = 500; bonusText = '🔥 **مكافأة 7 أيام متتالية!** (x2.5)'; }
    else if (streak >= 3) { reward = 300; bonusText = '✨ **مكافأة 3 أيام متتالية!** (+100)'; }

    // تحديث قاعدة البيانات
    db.addCoins(user.id, guildId, reward);
    db.setLastDaily(user.id, guildId, now);
    db.db.prepare('UPDATE users SET streak = ? WHERE user_id = ? AND guild_id = ?').run(streak, user.id, guildId);

    const newUserData = db.getUser(user.id, guildId);
    const nextStreakTarget = streak < 3 ? 3 : streak < 7 ? 7 : streak < 30 ? 30 : streak < 100 ? 100 : null;
    const streakBar = '🔥'.repeat(Math.min(streak, 10)) + (streak > 10 ? ` +${streak - 10}` : '');

    const embed = new EmbedBuilder()
      .setColor('#f1c40f')
      .setTitle('💰 مكافأتك اليومية!')
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '🎁 المكافأة', value: `\`+${reward}\` ⭐ Star Coin`, inline: true },
        { name: '💳 رصيدك الجديد', value: `\`${(newUserData.coins || newUserData.credits || 0).toLocaleString()}\` ⭐`, inline: true },
        { name: `🔥 الـ Streak: ${streak} يوم`, value: streakBar, inline: false }
      )
      .setFooter({ text: nextStreakTarget ? `🎯 ${nextStreakTarget - streak} يوم متبقٍ للمكافأة التالية` : '🏆 أنت على القمة!' })
      .setTimestamp();

    if (bonusText) embed.setDescription(bonusText);

    await reply({ embeds: [embed] });
  }
};
