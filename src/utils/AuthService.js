/**
 * @module AuthService
 * @description وحدة خدمة مركزية لجميع التحققات الأمنية، صلاحيات الأدوار، وإجراءات الحماية المعيارية في البوت.
 * هذا الملف يهدف إلى عزل جميع المنطق الحساس (Critical Logic) وضمان أن لا أمر واحد يعمل بدون تمريره عبر فحص الأذونات الموحد.
 */

const { GuildMember, PermissionsBitField } = require('discord.js');

/**
 * التحقق الأساسي من الصلاحيات (Basic Permission Check).
 * @param {GuildMember} member - عضو السيرفر الذي يحاول تنفيذ الأمر.
 * @param {PermissionsBitField} requiredPerms - قائمة الأذونات المطلوبة (مثل: 'KickMembers', 'ManageRoles').
 * @returns {boolean} True إذا كان يمتلك كل الصلاحيات، False خلاف ذلك.
 */
function checkBasicPermissions(member, requiredPerms) {
    if (!member || !requiredPerms) return false;

    // التحقق من أن العضو لديه جميع الأذونات المطلوبة بشكل فردي
    let hasAll = true;
    for (const perm of requiredPerms.bitfield) {
        if (!member.permissions.has(perm)) {
            console.error(`[AuthService Error]: ${member.user.tag} lacks permission: ${perm}`);
            hasAll = false;
            break;
        }
    }
    return hasAll;
}

/**
 * التحقق من تدرج الأدوار (Role Hierarchy Check).
 * هذا هو الفحص الأمني الأكثر أهمية في بوتات الديسكورد.
 * @param {GuildMember} member - العضو المنفذ.
 * @param {string} targetRoleId - ID الدور الذي يحاول البوت تعديله أو التحقق منه (مثل دور Admin).
 * @returns {boolean} True إذا كان يمتلك دائمًا أدوار أعلى من الهدف، False خلاف ذلك.
 */
function hasSufficientRoleHierarchy(member, targetRoleId) {
    const targetRole = member.guild.roles.cache.get(targetRoleId);
    if (!targetRole) {
        console.warn(`[AuthService Warning]: Target Role ID ${targetRoleId} not found in guild.`);
        return false; // لا يمكن التحقق إذا لم نجد الدور المستهدف
    }

    // الأمان: يجب أن يكون دور البوت (Bot's role) أعلى من جميع الأدوار التي يتعامل معها.
    const botRole = member.guild.members.me.roles.highest();
    if (targetRole.position >= botRole.toString()) {
        console.error(`[AuthService CRITICAL FAILURE]: Bot Role is below or equal to Target Role (${targetRole.name}). Cannot guarantee actions.`);
        // في هذه الحالة، يجب إيقاف تشغيل البوت يدوياً وتحديث ترتيب الأدوار يدوياً.
        return false; 
    }

    // التحقق من أن المنفذ نفسه لديه دور أعلى من الهدف
    const executingRole = member.roles.highest();
    if (targetRole.position > executingRole.toString()) {
         console.error(`[AuthService Failure]: The executor's highest role is below the target role (${targetRole.name}).`);
        return false;
    }

    // إذا تجاوز البوت كل التوقعات، نعتبره آمنًا (لكن يجب على المستخدم مراجعة ترتيب الأدوار يدوياً)
    return true; 
}


/**
 * [WRAPPER] دالة غلاف آمنة لتعديل الأدوار.
 * تضمن أن لدينا الصلاحيات وتفحص التدرج الهرمي قبل محاولة أي تعديل حقيقي.
 * @param {GuildMember} member - العضو المنفذ.
 * @param {string} targetId - ID العضو المستهدف.
 * @param {PermissionsBitField} requiredPerms - الأذونات المطلوبة للعملية (مثل ManageRoles).
 * @returns {Promise<boolean>} True إذا كانت العملية آمنة وممكنة التنفيذ حاليًا.
 */
async function safeManageRole(member, targetId, requiredPerms) {
    const targetMember = member.guild.members.cache.get(targetId);
    if (!targetMember) return false;

    // 1. التحقق من الأذونات الأساسية (Basic Check)
    if (!checkBasicPermissions(member, requiredPerms)) {
        return false; // فشل في الأدوار المطلوبة مباشرة
    }

    // 2. التحقق المعماري (Hierarchy Check)
    const targetRole = member.guild.roles.cache.get('THE_ROLE_TO_MANAGE'); // يجب تمرير الدور المستهدف فعلاً!
    if (!targetRole || !hasSufficientRoleHierarchy(member, targetId)) {
        console.warn(`[SafeManage]: عملية تعديل الأدوار محظورة بسبب فشل التحقق من التدرج الهرمي.`);
        return false;
    }

    // إذا تجاوزنا كل الاختبارات، يمكننا تنفيذ الأمر الآمن.
    return true;
}


/**
 * [WRAPPER] دالة غلاف آمنة لعمليات الحظر (Ban).
 * @param {GuildMember} member - العضو المنفذ.
 * @param {string} targetId - ID المستخدم المراد حظره.
 * @returns {Promise<boolean>} True إذا كانت عملية الحظر ممكنة ومنطقية.
 */
async function safeBanUser(member, targetId) {
    const targetMember = member.guild.members.cache.get(targetId);
    if (!targetMember) return false;

    // التحقق من أن المنفذ يمتلك صلاحيات BanMembers
    if (!checkBasicPermissions(member, PermissionsBitField.Flags.BanMembers)) {
        return false; 
    }
    
    // يمكن إضافة منطق تدرج الأدوار هنا أيضاً (هل دور البوت أعلى من أدوار المستهدف؟)

    console.log(`[AuthService]: Passed all security checks for banning ${targetMember.user.tag}. Proceeding with action.`);
    return true; // جاهز للتنفيذ في الـ Command Handler
}

module.exports = {
    checkBasicPermissions,
    hasSufficientRoleHierarchy,
    safeManageRole,
    safeBanUser
};