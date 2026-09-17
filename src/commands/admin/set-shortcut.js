const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'set-shortcut',
  description: 'وضع اختصار لامر معين',
  aliases: ['اختصار-امر'],
  data: new SlashCommandBuilder()
    .setName('set-shortcut')
    .setDescription('وضع اختصار لأمر معين')
    .addStringOption(opt => opt.setName('command').setDescription('الأمر').setRequired(true))
    .addStringOption(opt => opt.setName('alias').setDescription('الاختصار').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية الأدمن.', flags: 64 });
    }
    const cmd = interaction.options.getString('command').toLowerCase();
    const alias = interaction.options.getString('alias').toLowerCase();
    const s = db.getGuildSettings(interaction.guild.id);
    let configs = {};
    try { configs = JSON.parse(s.command_configs || '{}'); } catch(e) {}
    if (!configs[cmd]) configs[cmd] = {};
    configs[cmd].alias = alias;
    db.updateGuildSetting(interaction.guild.id, 'command_configs', JSON.stringify(configs));
    return interaction.reply({ content: '✅ تم وضع الاختصار بنجاح!' });
  }
};
