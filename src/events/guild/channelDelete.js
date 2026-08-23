const { AuditLogEvent } = require('discord.js');
const antiNuke = require('../../utils/antiNuke');

module.exports = {
  name: 'channelDelete',
  async execute(channel) {
    if (!channel.guild) return;
    await antiNuke.checkAction(channel.guild, 'channelDelete', AuditLogEvent.ChannelDelete);
  }
};
