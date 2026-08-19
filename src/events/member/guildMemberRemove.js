const { AuditLogEvent } = require('discord.js');
const antiNuke = require('../../utils/antiNuke');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    if (!member.guild) return;
    await antiNuke.checkAction(member.guild, 'memberKick', AuditLogEvent.MemberKick);
  }
};
