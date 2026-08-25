const { sendServerLog } = require('../../utils/serverLogger');

module.exports = [
  {
    name: 'messageDelete',
    async execute(message) {
      if (!message.guild || message.author?.bot) return;
      const hasImage = message.attachments?.some(a => a.contentType?.startsWith('image'));
      const eventId = hasImage ? 'msg_image_delete' : 'msg_delete';
      await sendServerLog(message.guild, eventId, 'messages', {
        title: hasImage ? '🖼️ حذف صورة' : '🗑️ حذف رسالة',
        desc: `تم حذف رسالة في <#${message.channelId}>`,
        fields: [
          { name: '👤 الكاتب', value: message.author ? `<@${message.author.id}> (${message.author.tag})` : 'غير معروف', inline: true },
          { name: '📌 القناة', value: `<#${message.channelId}>`, inline: true },
          { name: '📝 المحتوى', value: message.content?.slice(0, 1000) || '*[لا يوجد محتوى]*', inline: false }
        ],
        thumbnail: message.author?.displayAvatarURL({ dynamic: true })
      });
    }
  },
  {
    name: 'messageUpdate',
    async execute(oldMessage, newMessage) {
      if (!newMessage.guild || newMessage.author?.bot) return;
      if (oldMessage.content === newMessage.content) return;
      await sendServerLog(newMessage.guild, 'msg_update', 'messages', {
        title: '✏️ تعديل رسالة',
        desc: `تم تعديل رسالة في <#${newMessage.channelId}>`,
        fields: [
          { name: '👤 الكاتب', value: `<@${newMessage.author.id}> (${newMessage.author.tag})`, inline: true },
          { name: '📌 القناة', value: `<#${newMessage.channelId}>`, inline: true },
          { name: '📝 قبل', value: oldMessage.content?.slice(0, 500) || '*[لا يوجد]*', inline: false },
          { name: '📝 بعد', value: newMessage.content?.slice(0, 500) || '*[لا يوجد]*', inline: false },
          { name: '🔗 الرابط', value: `[اضغط هنا](${newMessage.url})`, inline: true }
        ],
        thumbnail: newMessage.author?.displayAvatarURL({ dynamic: true })
      });
    }
  },
  {
    name: 'messageDeleteBulk',
    async execute(messages, channel) {
      if (!channel.guild) return;
      await sendServerLog(channel.guild, 'msg_purge', 'messages', {
        title: 'ℹ️ حذف رسائل جماعي',
        desc: `تم حذف **${messages.size}** رسالة دفعة واحدة`,
        fields: [
          { name: '📌 القناة', value: `<#${channel.id}>`, inline: true },
          { name: '🔢 عدد الرسائل المحذوفة', value: `${messages.size}`, inline: true }
        ]
      });
    }
  }
];
