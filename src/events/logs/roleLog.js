const { sendServerLog } = require('../../utils/serverLogger');

module.exports = [
  {
    name: 'roleCreate',
    async execute(role) {
      await sendServerLog(role.guild, 'role_create', 'roles', {
        title: '➕ إنشاء رتبة',
        desc: `تم إنشاء رتبة جديدة`,
        fields: [
          { name: '🎖️ الرتبة', value: `<@&${role.id}> (${role.name})`, inline: true },
          { name: '🎨 اللون', value: role.hexColor, inline: true },
          { name: '🆔 الأيدي', value: role.id, inline: true }
        ]
      });
    }
  },
  {
    name: 'roleDelete',
    async execute(role) {
      await sendServerLog(role.guild, 'role_delete', 'roles', {
        title: '🗑️ حذف رتبة',
        desc: `تم حذف رتبة`,
        fields: [
          { name: '🎖️ اسم الرتبة', value: role.name, inline: true },
          { name: '🎨 اللون', value: role.hexColor, inline: true },
          { name: '🆔 الأيدي', value: role.id, inline: true }
        ]
      });
    }
  },
  {
    name: 'roleUpdate',
    async execute(oldRole, newRole) {
      const changes = [];
      if (oldRole.name !== newRole.name) changes.push(`الاسم: \`${oldRole.name}\` → \`${newRole.name}\``);
      if (oldRole.hexColor !== newRole.hexColor) changes.push(`اللون: \`${oldRole.hexColor}\` → \`${newRole.hexColor}\``);
      if (oldRole.hoist !== newRole.hoist) changes.push(`الظهور المنفصل: ${oldRole.hoist ? 'نعم' : 'لا'} → ${newRole.hoist ? 'نعم' : 'لا'}`);
      if (oldRole.mentionable !== newRole.mentionable) changes.push(`القابلية للذكر: ${oldRole.mentionable ? 'نعم' : 'لا'} → ${newRole.mentionable ? 'نعم' : 'لا'}`);
      if (!changes.length) return;
      await sendServerLog(newRole.guild, 'role_update', 'roles', {
        title: '✏️ تعديل رتبة',
        desc: `تم تعديل رتبة **${newRole.name}**`,
        fields: [
          { name: '🎖️ الرتبة', value: `<@&${newRole.id}>`, inline: true },
          { name: '📝 التغييرات', value: changes.join('\n'), inline: false }
        ]
      });
    }
  }
];
