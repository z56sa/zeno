const { sendServerLog } = require('../../utils/serverLogger');

module.exports = [
  {
    name: 'emojiCreate',
    async execute(emoji) {
      await sendServerLog(emoji.guild, 'emoji_create', 'emojis', {
        title: '➕ إضافة إيموجي',
        desc: `تم إضافة إيموجي جديد`,
        fields: [
          { name: '😀 الإيموجي', value: `${emoji} (${emoji.name})`, inline: true },
          { name: '🆔 الأيدي', value: emoji.id, inline: true },
          { name: '🔒 مخصص لرتبة؟', value: emoji.roles?.cache.size > 0 ? 'نعم' : 'لا', inline: true }
        ],
        thumbnail: emoji.imageURL()
      });
    }
  },
  {
    name: 'emojiDelete',
    async execute(emoji) {
      await sendServerLog(emoji.guild, 'emoji_delete', 'emojis', {
        title: '🗑️ حذف إيموجي',
        desc: `تم حذف إيموجي`,
        fields: [
          { name: '😀 الاسم', value: emoji.name, inline: true },
          { name: '🆔 الأيدي', value: emoji.id, inline: true }
        ],
        thumbnail: emoji.imageURL()
      });
    }
  },
  {
    name: 'emojiUpdate',
    async execute(oldEmoji, newEmoji) {
      const changes = [];
      if (oldEmoji.name !== newEmoji.name) changes.push(`الاسم: \`${oldEmoji.name}\` → \`${newEmoji.name}\``);
      if (!changes.length) return;
      await sendServerLog(newEmoji.guild, 'emoji_update', 'emojis', {
        title: '✏️ تعديل إيموجي',
        desc: `تم تعديل إيموجي`,
        fields: [
          { name: '😀 الإيموجي', value: `${newEmoji} (${newEmoji.name})`, inline: true },
          { name: '📝 التغييرات', value: changes.join('\n'), inline: false }
        ],
        thumbnail: newEmoji.imageURL()
      });
    }
  },
  {
    name: 'stickerCreate',
    async execute(sticker) {
      if (!sticker.guild) return;
      await sendServerLog(sticker.guild, 'sticker_create', 'emojis', {
        title: '🖼️ إضافة ستيكر',
        desc: `تم إضافة ستيكر جديد`,
        fields: [
          { name: '🖼️ الاسم', value: sticker.name, inline: true },
          { name: '🆔 الأيدي', value: sticker.id, inline: true }
        ]
      });
    }
  },
  {
    name: 'stickerDelete',
    async execute(sticker) {
      if (!sticker.guild) return;
      await sendServerLog(sticker.guild, 'sticker_delete', 'emojis', {
        title: '🗑️ حذف ستيكر',
        desc: `تم حذف ستيكر`,
        fields: [
          { name: '🖼️ الاسم', value: sticker.name, inline: true },
          { name: '🆔 الأيدي', value: sticker.id, inline: true }
        ]
      });
    }
  },
  {
    name: 'stickerUpdate',
    async execute(oldSticker, newSticker) {
      if (!newSticker.guild) return;
      const changes = [];
      if (oldSticker.name !== newSticker.name) changes.push(`الاسم: \`${oldSticker.name}\` → \`${newSticker.name}\``);
      if (!changes.length) return;
      await sendServerLog(newSticker.guild, 'sticker_update', 'emojis', {
        title: '✏️ تعديل ستيكر',
        desc: `تم تعديل ستيكر`,
        fields: [
          { name: '🖼️ الاسم', value: newSticker.name, inline: true },
          { name: '📝 التغييرات', value: changes.join('\n'), inline: false }
        ]
      });
    }
  }
];
