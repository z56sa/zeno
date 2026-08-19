const { AuditLogEvent } = require('discord.js');
const antiNuke = require('../../utils/antiNuke');

module.exports = {
  name: 'roleCreate',
  async execute(role) {
    if (!role.guild) return;
    await antiNuke.checkAction(role.guild, 'roleCreate', AuditLogEvent.RoleCreate);
  }
};
