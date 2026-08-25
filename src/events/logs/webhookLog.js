const { sendServerLog } = require('../../utils/serverLogger');
const { AuditLogEvent } = require('discord.js');

module.exports = {
  name: 'webhookUpdate',
  async execute(channel) {
    const guild = channel.guild;
    if (!guild) return;
    try {
      await new Promise(r => setTimeout(r, 600));
      const logs = await guild.fetchAuditLogs({ limit: 1 });
      const entry = logs.entries.first();
      if (!entry) return;
      
      let eventId, title;
      if (entry.action === AuditLogEvent.WebhookCreate) { eventId = 'webhook_create'; title = 'ℹ️ إنشاء ويب هوك'; }
      else if (entry.action === AuditLogEvent.WebhookDelete) { eventId = 'webhook_delete'; title = '🗑️ حذف ويب هوك'; }
      else if (entry.action === AuditLogEvent.WebhookUpdate) { eventId = 'webhook_update'; title = '✏️ تعديل ويب هوك'; }
      else return;

      await sendServerLog(guild, eventId, 'integrations', {
        title,
        desc: `${title} في <#${channel.id}>`,
        fields: [
          { name: '📌 القناة', value: `<#${channel.id}>`, inline: true },
          { name: '👮 المنفذ', value: entry.executor ? `<@${entry.executor.id}>` : 'غير معروف', inline: true }
        ]
      });
    } catch (e) {}
  }
};
