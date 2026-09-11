// ========================================================
// FILE: src/utils/inviteTracker.js
// متتبع الدعوات المتقدم (Advanced Invite Tracker Cache & Resolver)
// ========================================================
const db = require('../database');
const logger = require('./logger');
const { PermissionFlagsBits } = require('discord.js');

class InviteTracker {
  constructor() {
    // guildId -> Map(code, { uses, maxUses, inviterId, inviterUser })
    this.guildInvites = new Map();
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

  hasPermission(guild) {
    if (!guild) return false;
    const me = guild.members?.me;
    if (!me) return true;
    return me.permissions.has(PermissionFlagsBits.ManageGuild) || me.permissions.has(PermissionFlagsBits.Administrator);
  }

  async cacheGuild(guild) {
    if (!guild || !this.hasPermission(guild)) return;
    try {
      const invites = await guild.invites.fetch().catch(() => null);
      if (!invites) return;
      const codeMap = new Map();
      for (const [code, inv] of invites) {
        codeMap.set(code, {
          uses: inv.uses || 0,
          maxUses: inv.maxUses || 0,
          inviterId: inv.inviter?.id || null,
          inviterUser: inv.inviter || null
        });
      }
      this.guildInvites.set(guild.id, codeMap);
    } catch (err) {}
  }

  async findInviter(member) {
    const guild = member.guild;
    if (!this.hasPermission(guild)) {
      return { inviter: null, code: null, isFake: false };
    }

    try {
      const cachedMap = this.guildInvites.get(guild.id) || new Map();
      const currentInvites = await guild.invites.fetch().catch(() => null);

      let usedInvite = null;
      let usedInviterUser = null;
      let usedCode = null;

      if (currentInvites) {
        const currentCodeMap = new Map();

        // 1. فحص الروابط التي زاد عدد استخداماتها
        for (const [code, inv] of currentInvites) {
          const cachedData = cachedMap.get(code);
          const prevUses = cachedData ? (typeof cachedData === 'object' ? cachedData.uses : cachedData) : 0;
          if (inv.uses > prevUses) {
            usedInvite = inv;
            usedInviterUser = inv.inviter || null;
            usedCode = code;
          }
          currentCodeMap.set(code, {
            uses: inv.uses || 0,
            maxUses: inv.maxUses || 0,
            inviterId: inv.inviter?.id || null,
            inviterUser: inv.inviter || null
          });
        }

        // 2. فحص الروابط ذات الاستخدام الواحد (تُحذف فوراً من ديسكورد عند استخدامها)
        if (!usedInvite) {
          for (const [code, cachedData] of cachedMap.entries()) {
            if (!currentCodeMap.has(code)) {
              const maxUses = cachedData.maxUses || 0;
              const prevUses = cachedData.uses || 0;
              if (maxUses === 1 || (maxUses > 0 && prevUses + 1 >= maxUses)) {
                usedCode = code;
                usedInviterUser = cachedData.inviterUser || (cachedData.inviterId ? await member.client.users.fetch(cachedData.inviterId).catch(() => null) : null);
                break;
              }
            }
          }
        }

        // تحديث الكاش بالبيانات الجديدة
        this.guildInvites.set(guild.id, currentCodeMap);
      }

      // فحص عمر الحساب لتحديد إن كان وهمياً (Fake: أقل من 3 أيام)
      const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
      const isFake = accountAgeDays < 3;

      if (usedInviterUser && usedCode) {
        // حفظ السجل في قاعدة البيانات
        db.addInviteRecord(guild.id, usedInviterUser.id, member.id, usedCode, isFake ? 1 : 0);
      } else {
        // فحص الـ Vanity URL أو Direct
        if (guild.vanityURLCode) {
          usedCode = guild.vanityURLCode;
        }
        db.addInviteRecord(guild.id, null, member.id, usedCode, isFake ? 1 : 0);
      }

      return {
        inviter: usedInviterUser,
        code: usedCode,
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
    map.set(invite.code, {
      uses: invite.uses || 0,
      maxUses: invite.maxUses || 0,
      inviterId: invite.inviter?.id || null,
      inviterUser: invite.inviter || null
    });
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
