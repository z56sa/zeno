const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'leaderboard',
  description: 'عرض قائمة المتصدرين في السيرفر (المستويات أو الكريدت)',
  aliases: ['top', 'توب', 'متصدرين'],
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('عرض قائمة المتصدرين')
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('نوع الترتيب')
        .setRequired(false)
        .addChoices(
          { name: '🏆 المستويات (XP)', value: 'xp' },
          { name: '💰 الكريدت (Credits)', value: 'credits' }
        )
    ),

  async execute(interaction) {
    const type = interaction.options.getString('type') || 'xp';
    const embed = await this.buildEmbed(interaction.guild, type);
    await interaction.reply({ embeds: [embed] });
  },

  async executePrefix(message, args) {
    const type = args[0]?.toLowerCase() === 'credits' || args[0]?.toLowerCase() === 'credit' ? 'credits' : 'xp';
    const embed = await this.buildEmbed(message.guild, type);
    await message.reply({ embeds: [embed] });
  },

  async buildEmbed(guild, type) {
    const embed = new EmbedBuilder().setColor(config.colors.primary).setTimestamp();

    if (type === 'xp') {
      const topUsers = db.getTopXp(guild.id, 10);
      embed.setTitle(`🏆 توب المتصدرين في المستويات | ${guild.name}`);

      if (topUsers.length === 0) {
        embed.setDescription('لا توجد بيانات تفاعل بعد في هذا السيرفر.');
        return embed;
      }

      const list = topUsers.map((u, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**#${i + 1}**`;
        return `${medal} <@${u.user_id}> • **المستوى ${u.level}** (${u.xp.toLocaleString()} XP)`;
      }).join('\n');

      embed.setDescription(list);
    } else {
      const topUsers = db.getTopCredits(guild.id, 10);
      embed.setTitle(`💰 توب الأثرياء في الكريدت | ${guild.name}`);

      if (topUsers.length === 0) {
        embed.setDescription('لا توجد بيانات أرصدة بعد.');
        return embed;
      }

      const list = topUsers.map((u, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**#${i + 1}**`;
        return `${medal} <@${u.user_id}> • **${u.credits.toLocaleString()}** كريدت 🪙`;
      }).join('\n');

      embed.setDescription(list);
    }

    return embed;
  }
};
