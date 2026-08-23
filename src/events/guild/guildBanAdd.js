const { AuditLogEvent } = require('discord.js');
const antiNuke = require('../../utils/antiNuke');

module.exports = {
  name: 'guildBanAdd',
  async execute(ban) {
    if (!ban.guild) return;
    await antiNuke.checkAction(ban.guild, 'banAdd', AuditLogEvent.MemberBanAdd);
  }
};
