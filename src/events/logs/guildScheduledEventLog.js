const { sendServerLog } = require('../../utils/serverLogger');

module.exports = [
  {
    name: 'guildScheduledEventCreate',
    async execute(scheduledEvent) {
      if (!scheduledEvent.guild) return;
      await sendServerLog(scheduledEvent.guild, 'event_create', 'events', {
        title: '➕ إنشاء حدث',
        desc: `تم إنشاء حدث مجدول جديد`,
        fields: [
          { name: '📅 اسم الحدث', value: scheduledEvent.name, inline: true },
          { name: '👤 المنشئ', value: scheduledEvent.creator ? `<@${scheduledEvent.creator.id}>` : 'غير معروف', inline: true },
          { name: '⏰ يبدأ في', value: scheduledEvent.scheduledStartAt ? `<t:${Math.floor(scheduledEvent.scheduledStartAt.getTime()/1000)}:F>` : 'غير محدد', inline: true }
        ]
      });
    }
  },
  {
    name: 'guildScheduledEventDelete',
    async execute(scheduledEvent) {
      if (!scheduledEvent.guild) return;
      await sendServerLog(scheduledEvent.guild, 'event_delete', 'events', {
        title: '🗑️ حذف حدث',
        desc: `تم حذف حدث مجدول`,
        fields: [
          { name: '📅 اسم الحدث', value: scheduledEvent.name, inline: true }
        ]
      });
    }
  },
  {
    name: 'guildScheduledEventUpdate',
    async execute(oldEvent, newEvent) {
      if (!newEvent.guild) return;
      const changes = [];
      if (oldEvent?.name !== newEvent.name) changes.push(`الاسم: \`${oldEvent?.name}\` → \`${newEvent.name}\``);
      if (oldEvent?.status !== newEvent.status) {
        const statusMap = { 1: 'مجدول', 2: 'نشط', 3: 'منتهي', 4: 'ملغي' };
        if (newEvent.status === 2) {
          await sendServerLog(newEvent.guild, 'event_start', 'events', {
            title: '⬇️ بدء حدث',
            desc: `بدأ الحدث **${newEvent.name}**`,
            fields: [{ name: '📅 الحدث', value: newEvent.name, inline: true }]
          });
          return;
        }
        if (newEvent.status === 3 || newEvent.status === 4) {
          await sendServerLog(newEvent.guild, 'event_end', 'events', {
            title: '⬆️ انتهاء حدث',
            desc: `انتهى الحدث **${newEvent.name}**`,
            fields: [{ name: '📅 الحدث', value: newEvent.name, inline: true }]
          });
          return;
        }
        changes.push(`الحالة: ${statusMap[oldEvent?.status] || oldEvent?.status} → ${statusMap[newEvent.status] || newEvent.status}`);
      }
      if (!changes.length) return;
      await sendServerLog(newEvent.guild, 'event_update', 'events', {
        title: '✏️ تعديل حدث',
        desc: `تم تعديل حدث`,
        fields: [
          { name: '📅 الحدث', value: newEvent.name, inline: true },
          { name: '📝 التغييرات', value: changes.join('\n'), inline: false }
        ]
      });
    }
  },
  {
    name: 'guildScheduledEventUserAdd',
    async execute(scheduledEvent, user) {
      if (!scheduledEvent.guild) return;
      await sendServerLog(scheduledEvent.guild, 'event_user_interested', 'events', {
        title: '⬇️ اشتراك في حدث',
        desc: `**${user.tag}** أبدى اهتماماً بالحدث`,
        fields: [
          { name: '👤 العضو', value: `<@${user.id}>`, inline: true },
          { name: '📅 الحدث', value: scheduledEvent.name, inline: true }
        ],
        thumbnail: user.displayAvatarURL({ dynamic: true })
      });
    }
  }
];
