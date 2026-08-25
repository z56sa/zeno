const { sendServerLog } = require('../../utils/serverLogger');

module.exports = [
  {
    name: 'channelCreate',
    async execute(channel) {
      if (!channel.guild) return;
      const typeNames = { 0: 'نصية', 2: 'صوتية', 4: 'فئة', 5: 'إعلانات', 13: 'منصة Stage', 15: 'منتدى' };
      await sendServerLog(channel.guild, 'channel_create', 'channels', {
        title: '➕ إنشاء قناة',
        desc: `تم إنشاء قناة جديدة`,
        fields: [
          { name: '📌 القناة', value: `<#${channel.id}> (${channel.name})`, inline: true },
          { name: '📂 النوع', value: typeNames[channel.type] || 'أخرى', inline: true },
          { name: '🆔 الأيدي', value: channel.id, inline: true }
        ]
      });
    }
  },
  {
    name: 'channelDelete',
    async execute(channel) {
      if (!channel.guild) return;
      await sendServerLog(channel.guild, 'channel_delete', 'channels', {
        title: '🗑️ حذف قناة',
        desc: `تم حذف قناة`,
        fields: [
          { name: '📌 اسم القناة', value: channel.name, inline: true },
          { name: '🆔 الأيدي', value: channel.id, inline: true }
        ]
      });
    }
  },
  {
    name: 'channelUpdate',
    async execute(oldChannel, newChannel) {
      if (!newChannel.guild) return;
      const changes = [];
      if (oldChannel.name !== newChannel.name) changes.push(`الاسم: \`${oldChannel.name}\` → \`${newChannel.name}\``);
      if (oldChannel.topic !== newChannel.topic) changes.push(`الموضوع: ${oldChannel.topic || 'لا يوجد'} → ${newChannel.topic || 'لا يوجد'}`);
      if (oldChannel.nsfw !== newChannel.nsfw) changes.push(`NSFW: ${oldChannel.nsfw ? 'نعم' : 'لا'} → ${newChannel.nsfw ? 'نعم' : 'لا'}`);
      if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) changes.push(`بطيء المحادثة: ${oldChannel.rateLimitPerUser}ث → ${newChannel.rateLimitPerUser}ث`);
      if (!changes.length) return;
      await sendServerLog(newChannel.guild, 'channel_update', 'channels', {
        title: '✏️ تعديل قناة',
        desc: `تم تعديل قناة **${newChannel.name}**`,
        fields: [
          { name: '📌 القناة', value: `<#${newChannel.id}>`, inline: true },
          { name: '📝 التغييرات', value: changes.join('\n'), inline: false }
        ]
      });
    }
  },
  {
    name: 'threadCreate',
    async execute(thread) {
      if (!thread.guild) return;
      await sendServerLog(thread.guild, 'thread_create', 'channels', {
        title: '💬 إنشاء ثريد',
        desc: `تم إنشاء ثريد جديد`,
        fields: [
          { name: '💬 الثريد', value: `<#${thread.id}> (${thread.name})`, inline: true },
          { name: '📌 القناة الأصلية', value: thread.parentId ? `<#${thread.parentId}>` : 'غير معروف', inline: true }
        ]
      });
    }
  },
  {
    name: 'threadDelete',
    async execute(thread) {
      if (!thread.guild) return;
      await sendServerLog(thread.guild, 'thread_delete', 'channels', {
        title: '🗑️ حذف ثريد',
        desc: `تم حذف ثريد`,
        fields: [
          { name: '💬 اسم الثريد', value: thread.name, inline: true },
          { name: '📌 القناة الأصلية', value: thread.parentId ? `<#${thread.parentId}>` : 'غير معروف', inline: true }
        ]
      });
    }
  }
];
