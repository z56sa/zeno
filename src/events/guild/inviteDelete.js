// ========================================================
// FILE: src/events/guild/inviteDelete.js
// إزالة رابط الدعوة من الكاش عند حذفه
// ========================================================
const tracker = require('../../utils/inviteTracker');

module.exports = {
  name: 'inviteDelete',
  async execute(invite) {
    tracker.onInviteDelete(invite);
  }
};
