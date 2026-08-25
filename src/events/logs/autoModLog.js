const { sendServerLog } = require('../../utils/serverLogger');

module.exports = [
  {
    name: 'autoModerationRuleCreate',
    async execute(rule) {
      if (!rule.guild) return;
      await sendServerLog(rule.guild, 'automod_rule_create', 'automod', {
        title: '➕ إنشاء قاعدة أوتو مود',
        desc: `تم إنشاء قاعدة حماية جديدة`,
        fields: [
          { name: '📋 اسم القاعدة', value: rule.name, inline: true },
          { name: '🆔 الأيدي', value: rule.id, inline: true }
        ]
      });
    }
  },
  {
    name: 'autoModerationRuleDelete',
    async execute(rule) {
      if (!rule.guild) return;
      await sendServerLog(rule.guild, 'automod_rule_delete', 'automod', {
        title: '🗑️ حذف قاعدة أوتو مود',
        desc: `تم حذف قاعدة حماية`,
        fields: [
          { name: '📋 اسم القاعدة', value: rule.name, inline: true }
        ]
      });
    }
  },
  {
    name: 'autoModerationRuleUpdate',
    async execute(oldRule, newRule) {
      if (!newRule.guild) return;
      const changes = [];
      if (oldRule?.name !== newRule.name) changes.push(`الاسم: \`${oldRule?.name}\` → \`${newRule.name}\``);
      if (oldRule?.enabled !== newRule.enabled) changes.push(`الحالة: ${oldRule?.enabled ? 'مفعل' : 'معطل'} → ${newRule.enabled ? 'مفعل' : 'معطل'}`);
      if (!changes.length) return;
      await sendServerLog(newRule.guild, 'automod_rule_update', 'automod', {
        title: '✏️ تعديل قاعدة أوتو مود',
        desc: `تم تعديل قاعدة حماية`,
        fields: [
          { name: '📋 القاعدة', value: newRule.name, inline: true },
          { name: '📝 التغييرات', value: changes.join('\n'), inline: false }
        ]
      });
    }
  },
  {
    name: 'autoModerationActionExecution',
    async execute(execution) {
      if (!execution.guild) return;
      const isSpam = execution.ruleTriggerType === 3;
      const isBlock = execution.action?.type === 1;
      const isTimeout = execution.action?.type === 3;

      let eventId = 'automod_action_trigger';
      let title = 'ℹ️ إجراء أوتو مود';
      if (isSpam) { eventId = 'automod_spam_detect'; title = 'ℹ️ رقابة السبام'; }
      else if (isBlock) { eventId = 'automod_content_block'; title = '🗑️ حظر محتوى'; }
      else if (isTimeout) { eventId = 'automod_timeout'; title = '🔒 عزل تلقائي'; }

      await sendServerLog(execution.guild, eventId, 'automod', {
        title,
        desc: `تم تنفيذ إجراء أوتو مود`,
        fields: [
          { name: '👤 العضو', value: `<@${execution.userId}>`, inline: true },
          { name: '📌 القناة', value: execution.channelId ? `<#${execution.channelId}>` : 'غير محدد', inline: true },
          { name: '📝 المحتوى المحظور', value: execution.content?.slice(0, 500) || '*[لا يوجد]*', inline: false }
        ]
      });
    }
  }
];
