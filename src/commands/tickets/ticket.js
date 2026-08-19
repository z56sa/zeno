const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'ticket',
  description: 'إدارة التذكرة الحالية (إغلاق، إضافة/إزالة عضو)',
  aliases: ['تذكرة'],
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('أوامر إدارة التذاكر')
    .addSubcommand(sub =>
      sub.setName('close')
        .setDescription('إغلاق وحذف التذكرة الحالية')
    )
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('إضافة عضو للتذكرة الحالية')
        .addUserOption(opt => opt.setName('user').setDescription('العضو المراد إضافته').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('إزالة عضو من التذكرة الحالية')
        .addUserOption(opt => opt.setName('user').setDescription('العضو المراد إزالته').setRequired(true))
    ),

  async execute(interaction) {
    const ticket = db.getTicket(interaction.channel.id);
    if (!ticket) {
      return interaction.reply({ content: '❌ هذا الأمر يعمل فقط داخل قنوات التذاكر.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'close') {
      await interaction.reply('🔒 سيتم إغلاق وحذف التذكرة خلال 5 ثوانٍ...');
      db.closeTicket(interaction.channel.id);

      setTimeout(async () => {
        db.deleteTicket(interaction.channel.id);
        await interaction.channel.delete().catch(() => {});
      }, 5000);
    } else if (sub === 'add') {
      const user = interaction.options.getUser('user');
      await interaction.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        ReadMessageHistory: true
      });
      await interaction.reply(`✅ تمت إضافة ${user} إلى التذكرة.`);
    } else if (sub === 'remove') {
      const user = interaction.options.getUser('user');
      await interaction.channel.permissionOverwrites.delete(user.id);
      await interaction.reply(`✅ تمت إزالة ${user} من التذكرة.`);
    }
  },

  async executePrefix(message, args) {
    const ticket = db.getTicket(message.channel.id);
    if (!ticket) {
      return message.reply('❌ هذا الأمر يعمل فقط داخل قنوات التذاكر.');
    }

    const action = args[0]?.toLowerCase();
    if (action === 'close') {
      await message.reply('🔒 سيتم حذف التذكرة خلال 5 ثوانٍ...');
      db.closeTicket(message.channel.id);
      setTimeout(async () => {
        db.deleteTicket(message.channel.id);
        await message.channel.delete().catch(() => {});
      }, 5000);
    } else if (action === 'add') {
      const user = message.mentions.users.first();
      if (!user) return message.reply('❌ يرجى منشن العضو.');
      await message.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        ReadMessageHistory: true
      });
      await message.channel.send(`✅ تمت إضافة ${user} إلى التذكرة.`);
    } else if (action === 'remove') {
      const user = message.mentions.users.first();
      if (!user) return message.reply('❌ يرجى منشن العضو.');
      await message.channel.permissionOverwrites.delete(user.id);
      await message.channel.send(`✅ تمت إزالة ${user} من التذكرة.`);
    } else {
      message.reply('❌ الاستخدام: `#ticket close` أو `#ticket add @user` أو `#ticket remove @user`');
    }
  }
};
