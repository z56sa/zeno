// ========================================================
// FILE: src/utils/inviteTracker.js
// متتبع الدعوات المتقدم (Advanced Invite Tracker Cache & Resolver)
// ========================================================
const db = require('../database');
const logger = require('./logger');

class InviteTracker {
  constructor() {
    this.guildInvites = new Map(); // guildId -> Map(code, uses)
  }

  async init(client) {
    logger.info('تهيئة كاش متتبع الدعوات (Invite Tracker)...');
    try {
      for (const [guildId, guild] of client.guilds.cache) {
        await this.cacheGuild(guild);
      }
      logger.success(`تم كاش دعوات ${this.guildInvites.size} سيرفر بنجاح.`);
    } catch (e) {
      logger.error('خطأ أثناء تهيئة كاش الدعوات: ' + e.message);
    }
  }

  async cacheGuild(guild) {
    if (!guild || !guild.members?.me?.permissions?.has('ManageGuild')) return;
    try {
      const invites = await guild.invites.fetch().catch(() => null);
      if (!invites) return;
      const codeMap = new Map();
      for (const [code, inv] of invites) {
        codeMap.set(code, inv.uses || 0);
      }
      this.guildInvites.set(guild.id, codeMap);
    } catch (err) {}
  }

  async findInviter(member) {
    const guild = member.guild;
    if (!guild.members?.me?.permissions?.has('ManageGuild')) {
      return { inviter: null, code: null, isFake: false };
    }

    try {
      const cachedMap = this.guildInvites.get(guild.id) || new Map();
      const currentInvites = await guild.invites.fetch().catch(() => null);

      let usedInvite = null;

      if (currentInvites) {
        for (const [code, inv] of currentInvites) {
          const prevUses = cachedMap.get(code) || 0;
          if (inv.uses > prevUses) {
            usedInvite = inv;
            break;
          }
        }
        // تحديث الكاش
        const newCodeMap = new Map();
        for (const [code, inv] of currentInvites) {
          newCodeMap.set(code, inv.uses || 0);
        }
        this.guildInvites.set(guild.id, newCodeMap);
      }

      // فحص عمر الحساب لتحديد إن كان وهمياً (Fake: أقل من 3 أيام)
      const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
      const isFake = accountAgeDays < 3;

      let inviterUser = null;
      let codeUsed = null;

      if (usedInvite && usedInvite.inviter) {
        inviterUser = usedInvite.inviter;
        codeUsed = usedInvite.code;
        // حفظ في قاعدة البيانات
        db.addInviteRecord(guild.id, inviterUser.id, member.id, codeUsed, isFake ? 1 : 0);
      } else {
        // فحص الـ Vanity URL
        if (guild.vanityURLCode) {
          codeUsed = guild.vanityURLCode;
        }
        db.addInviteRecord(guild.id, null, member.id, codeUsed, isFake ? 1 : 0);
      }

      return {
        inviter: inviterUser,
        code: codeUsed,
        isFake,
        accountAgeDays
      };
    } catch (e) {
      logger.error(`خطأ في فحص دعوة العضو ${member.id}: ${e.message}`);
      return { inviter: null, code: null, isFake: false };
    }
  }

  handleMemberLeave(member) {
    try {
      return db.removeInviteMember(member.guild.id, member.id);
    } catch (e) {
      return null;
    }
  }

  onInviteCreate(invite) {
    if (!invite?.guild) return;
    const map = this.guildInvites.get(invite.guild.id) || new Map();
    map.set(invite.code, invite.uses || 0);
    this.guildInvites.set(invite.guild.id, map);
  }

  onInviteDelete(invite) {
    if (!invite?.guild) return;
    const map = this.guildInvites.get(invite.guild.id);
    if (map) {
      map.delete(invite.code);
    }
  }
}

const tracker = new InviteTracker();
module.exports = tracker;
