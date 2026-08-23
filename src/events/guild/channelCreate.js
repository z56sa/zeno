const { AuditLogEvent } = require('discord.js');
const antiNuke = require('../../utils/antiNuke');

module.exports = {
  name: 'channelCreate',
  async execute(channel) {
    if (!channel.guild) return;
    await antiNuke.checkAction(channel.guild, 'channelCreate', AuditLogEvent.ChannelCreate);
  }
};
