const { AuditLogEvent } = require('discord.js');
const antiNuke = require('../../utils/antiNuke');

module.exports = {
  name: 'roleDelete',
  async execute(role) {
    if (!role.guild) return;
    await antiNuke.checkAction(role.guild, 'roleDelete', AuditLogEvent.RoleDelete);
  }
};
