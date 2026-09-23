const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const db = require('../../database');
const canvasUtil = require('../../utils/canvas');

module.exports = {
  name: 'rank',
  description: 'عرض بطاقة مستواك ورتبتك ونقاط خبرتك (Rank Card)',
  aliases: ['level', 'لفل', 'بروفايل', 'رتبة'],
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('عرض بطاقة المستوى ونقاط الخبرة')
    .addUserOption(opt => opt.setName('user').setDescription('العضو المراد فحص مستواه').setRequired(false)),

  async execute(interaction) {
    const settings = db.getGuildSettings(interaction.guild.id);
    if (settings.leveling_enabled === 0) {
      return interaction.reply({ content: '❌ نظام المستويات واللفل معطل في هذا السيرفر حالياً.', ephemeral: true });
    }
    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return interaction.editReply('❌ العضو غير موجود في السيرفر.');

    const xpData = db.getUserRank(targetUser.id, interaction.guild.id);
    const cardBuffer = await canvasUtil.createRankCard(member, xpData || { xp: 0, level: 0, rank: 1 });
    const attachment = new AttachmentBuilder(cardBuffer, { name: 'rank.png' });

    await interaction.editReply({ files: [attachment] });
  },

  async executePrefix(message, args) {
    const settings = db.getGuildSettings(message.guild.id);
    if (settings.leveling_enabled === 0) {
      return message.reply('❌ نظام المستويات واللفل معطل في هذا السيرفر حالياً.');
    }
    const targetUser = message.mentions.users.first() ||
                       (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null) ||
                       message.author;

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply('❌ العضو غير موجود في السيرفر.');

    const loading = await message.reply('⏳ جاري تجهيز بطاقة المستوى...');
    const xpData = db.getUserRank(targetUser.id, message.guild.id);
    const cardBuffer = await canvasUtil.createRankCard(member, xpData || { xp: 0, level: 0, rank: 1 });
    const attachment = new AttachmentBuilder(cardBuffer, { name: 'rank.png' });

    await loading.edit({ content: null, files: [attachment] });
  }
};
