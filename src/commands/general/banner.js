const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');

module.exports = {
  name: 'banner',
  description: 'عرض بنر حساب المستخدم',
  aliases: ['بنر'],
  data: new SlashCommandBuilder()
    .setName('banner')
    .setDescription('عرض بنر حسابك أو حساب عضو آخر')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('العضو المراد عرض بنره')
        .setRequired(false)
    ),

  async execute(interaction, client) {
    const user = interaction.options.getUser('user') || interaction.user;
    const fetchedUser = await client.users.fetch(user.id, { force: true });
    const bannerURL = fetchedUser.bannerURL({ dynamic: true, size: 1024 });

    if (!bannerURL) {
      return interaction.reply({
        content: `❌ المستخدم **${user.username}** لا يملك بنر مخصص.`,
        flags: 64
      });
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`🎨 بنر المستخدم: ${user.username}`)
      .setImage(bannerURL)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  async executePrefix(message, args, client) {
    const user = message.mentions.users.first() ||
                 (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null) ||
                 message.author;

    const fetchedUser = await client.users.fetch(user.id, { force: true });
    const bannerURL = fetchedUser.bannerURL({ dynamic: true, size: 1024 });

    if (!bannerURL) {
      return message.reply(`❌ المستخدم **${user.username}** لا يملك بنر مخصص.`);
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`🎨 بنر المستخدم: ${user.username}`)
      .setImage(bannerURL)
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
};
