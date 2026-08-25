const { sendServerLog } = require('../../utils/serverLogger');

module.exports = [
  {
    name: 'guildUpdate',
    async execute(oldGuild, newGuild) {
      const changes = [];
      let eventId = 'server_update';
      
      if (oldGuild.name !== newGuild.name) {
        eventId = 'server_name_change';
        changes.push(`الاسم: \`${oldGuild.name}\` → \`${newGuild.name}\``);
      }
      if (oldGuild.icon !== newGuild.icon) {
        eventId = 'server_icon_change';
        changes.push('تم تغيير أيقونة السيرفر');
      }
      if (oldGuild.banner !== newGuild.banner) {
        eventId = 'server_banner_change';
        changes.push('تم تغيير بانر السيرفر');
      }
      if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
        eventId = 'server_vanity_change';
        changes.push(`رابط الفانيتي: \`${oldGuild.vanityURLCode || 'لا يوجد'}\` → \`${newGuild.vanityURLCode || 'لا يوجد'}\``);
      }
      if (oldGuild.premiumTier !== newGuild.premiumTier) {
        eventId = newGuild.premiumTier > oldGuild.premiumTier ? 'server_boost_level_up' : 'server_boost_level_down';
        changes.push(`مستوى البوست: ${oldGuild.premiumTier} → ${newGuild.premiumTier}`);
      }
      if (!changes.length) return;

      await sendServerLog(newGuild, eventId, 'server', {
        title: '✏️ تعديل السيرفر',
        desc: `تم تعديل إعدادات السيرفر **${newGuild.name}**`,
        fields: [
          { name: '📝 التغييرات', value: changes.join('\n'), inline: false }
        ],
        thumbnail: newGuild.iconURL({ dynamic: true })
      });
    }
  },
  {
    name: 'inviteCreate',
    async execute(invite) {
      if (!invite.guild) return;
      await sendServerLog(invite.guild, 'invite_create', 'invites', {
        title: '➕ إنشاء دعوة',
        desc: `تم إنشاء رابط دعوة جديد`,
        fields: [
          { name: '🔗 الرمز', value: `\`${invite.code}\``, inline: true },
          { name: '👤 المنشئ', value: invite.inviter ? `<@${invite.inviter.id}>` : 'غير معروف', inline: true },
          { name: '⏰ تنتهي بعد', value: invite.maxAge ? `${Math.floor(invite.maxAge / 3600)} ساعة` : 'لا تنتهي', inline: true },
          { name: '🔢 الحد الأقصى للاستخدامات', value: `${invite.maxUses || 'لا يوجد'}`, inline: true }
        ]
      });
    }
  },
  {
    name: 'inviteDelete',
    async execute(invite) {
      if (!invite.guild) return;
      await sendServerLog(invite.guild, 'invite_delete', 'invites', {
        title: '🗑️ حذف دعوة',
        desc: `تم حذف رابط دعوة`,
        fields: [
          { name: '🔗 الرمز', value: `\`${invite.code}\``, inline: true },
          { name: '👤 المنشئ', value: invite.inviter ? `<@${invite.inviter.id}>` : 'غير معروف', inline: true }
        ]
      });
    }
  }
];
