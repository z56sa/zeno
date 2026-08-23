// ========================================================
// FILE: src/events/guild/inviteCreate.js
// تحديث كاش الدعوات عند إنشاء رابط دعوة جديد
// ========================================================
const tracker = require('../../utils/inviteTracker');

module.exports = {
  name: 'inviteCreate',
  async execute(invite) {
    tracker.onInviteCreate(invite);
  }
};
