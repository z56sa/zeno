const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'setwallpaper',
  description: 'تعيين خلفية مخصصة لبطاقة البروفايل والهوية من رابط مباشر',
  aliases: ['setbg', 'خلفية', 'تعيين_خلفية'],
  data: new SlashCommandBuilder()
    .setName('setwallpaper')
    .setDescription('تعيين خلفية مخصصة لبطاقة البروفايل')
    .addStringOption(opt =>
      opt.setName('url')
        .setDescription('رابط الصورة المباشر (https://...)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const url = interaction.options.getString('url').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return interaction.reply({ content: '❌ يرجى إدخال رابط صورة صالح يبدأ بـ `https://`', ephemeral: true });
    }

    db.setWallpaper(interaction.user.id, interaction.guild.id, url);

    await interaction.reply({
      content: `🖼️ **${interaction.user.username}**, تم تعيين خلفية بروفايلك بنجاح! 🎉\nاكتب **\`#star\`** أو **\`#profile\`** لمشاهدة بطاقتك الجديدة.`
    });
  },

  async executePrefix(message, args) {
    let url = args[0];
    if (message.attachments.size > 0) {
      url = message.attachments.first().url;
    }

    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      return message.reply('❌ يرجى إدخال رابط الصورة بعد الأمر أو إرفاق صورة مع الرسالة!\nمثال: `#setwallpaper https://...`');
    }

    db.setWallpaper(message.author.id, message.guild.id, url);

    await message.reply({
      content: `🖼️ **${message.author.username}**, تم تعيين خلفية بروفايلك بنجاح! 🎉\nاكتب **\`#star\`** أو **\`#profile\`** لمشاهدة بطاقتك الجديدة.`
    });
  }
};
