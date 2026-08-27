const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ComponentType, AttachmentBuilder
} = require('discord.js');

const activeGames = new Map();

const SLICE_COLORS = [
  '#9B59B6','#2ECC71','#E74C3C','#F39C12','#3498DB',
  '#1ABC9C','#E91E63','#FF5722','#8BC34A','#00BCD4',
  '#673AB7','#FF9800','#4CAF50','#F44336','#2196F3',
  '#9C27B0','#FFEB3B','#00E5FF','#76FF03','#FF4081'
];

async function drawWheel(players, highlightIndex = -1) {
  let createCanvas;
  try { ({ createCanvas } = require('@napi-rs/canvas')); } catch { return null; }
  const SIZE = 600, cx = 300, cy = 300, r = 270;
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b0d14';
  ctx.fillRect(0, 0, SIZE, SIZE);
  const n = players.length;
  const sliceAngle = (2 * Math.PI) / n;
  const startOffset = -Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const start = startOffset + i * sliceAngle;
    const end = start + sliceAngle;
    const mid = start + sliceAngle / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    if (i === highlightIndex) { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.95; }
    else { ctx.fillStyle = SLICE_COLORS[i % SLICE_COLORS.length]; ctx.globalAlpha = highlightIndex >= 0 && i !== highlightIndex ? 0.45 : 0.9; }
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#1a1d2e'; ctx.lineWidth = 2; ctx.stroke();
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(mid);
    ctx.textAlign = 'right';
    ctx.fillStyle = i === highlightIndex ? '#111' : '#fff';
    ctx.font = `bold ${Math.max(10, Math.min(16, 220 / n))}px Arial`;
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
    const lbl = players[i].name.length > 10 ? players[i].name.slice(0,9)+'...' : players[i].name;
    ctx.fillText(`${i+1}- ${lbl}`, r - 12, 5);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 55, 0, 2 * Math.PI);
  const grad = ctx.createRadialGradient(cx, cy, 5, cx, cy, 55);
  grad.addColorStop(0, '#1a0e2e'); grad.addColorStop(1, '#2d1060');
  ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = '#9B59B6'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#c084fc'; ctx.font = 'bold 15px Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('ROULETTE', cx, cy);
  const ax = cx + r + 15, ay = cy;
  ctx.beginPath(); ctx.moveTo(ax+20, ay); ctx.lineTo(ax-5, ay-14); ctx.lineTo(ax-5, ay+14); ctx.closePath();
  ctx.fillStyle = '#f97316'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  return canvas.toBuffer('image/png');
}

function buildPickRows(players, winnerId) {
  const others = players.filter(p => p.id !== winnerId);
  const rows = [];
  let cur = new ActionRowBuilder();
  for (let i = 0; i < others.length && rows.length < 4; i++) {
    if (cur.components.length === 4) { rows.push(cur); cur = new ActionRowBuilder(); }
    cur.addComponents(new ButtonBuilder().setCustomId(`rlt_pick_${others[i].id}`).setLabel(`${i+1} ${others[i].name.slice(0,12)}`).setStyle(ButtonStyle.Danger));
  }
  if (cur.components.length > 0) rows.push(cur);
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rlt_withdraw').setLabel('📤 السحب').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rlt_kick2x').setLabel('🔨 طرد مرتين').setStyle(ButtonStyle.Danger)
  ));
  return rows.slice(0, 5);
}

async function runRound(channel, players, round) {
  if (players.length < 2) return players;
  const winnerIdx = Math.floor(Math.random() * players.length);
  const winner = players[winnerIdx];
  const wheelBefore = await drawWheel(players, -1);
  const wheelAfter = await drawWheel(players, winnerIdx);
  await channel.send({ content: `🎰 **الجولة ${round}** | تدور العجلة...`, files: wheelBefore ? [new AttachmentBuilder(wheelBefore, { name: 'wheel.png' })] : [] });
  await new Promise(r => setTimeout(r, 2500));
  await channel.send({ content: `🎯 **توقف السهم على:** <@${winner.id}>`, files: wheelAfter ? [new AttachmentBuilder(wheelAfter, { name: 'wheel_result.png' })] : [] });
  await new Promise(r => setTimeout(r, 1000));
  const remaining = players.filter(p => p.id !== winner.id);
  const pickRows = buildPickRows(players, winner.id);
  const mainEmbed = new EmbedBuilder()
    .setColor('#9B59B6').setTitle(`🎰 الجولة ${round} - اختر ضحيتك!`)
    .setDescription(`<@${winner.id}> **وقع عليك السهم!** 🎯\n\n⏳ **لديك 30 ثانية لاختيار لاعب لطرده!**\n\n👥 **اللاعبون المتبقون:**\n` + remaining.map((p,i)=>`\`${i+1}\` <@${p.id}>`).join('  '))
    .setFooter({ text: 'إذا لم تختر سيتم اختيار شخص عشوائياً' }).setTimestamp();
  const pickMsg = await channel.send({ content: `<@${winner.id}> اختر من تطرد!`, embeds: [mainEmbed], components: pickRows });
  return new Promise(async (resolve) => {
    let resolved = false;
    const timeout = setTimeout(async () => {
      if (resolved) return; resolved = true; collector.stop('timeout');
      const auto = remaining[Math.floor(Math.random() * remaining.length)];
      await channel.send({ content: `⏰ انتهى الوقت! تم اختيار <@${auto.id}> عشوائياً!\n🌐 سيتم بدء الجولة القادمة في بضع ثواني...` });
      await pickMsg.edit({ components: [] }).catch(() => {});
      resolve(players.filter(p => p.id !== auto.id));
    }, 30000);
    const collector = pickMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 31000 });
    collector.on('collect', async (btn) => {
      if (btn.user.id !== winner.id) return btn.reply({ content: '❌ فقط الفائز يستطيع الاختيار!', ephemeral: true });
      if (btn.customId === 'rlt_withdraw' && !resolved) {
        resolved = true; clearTimeout(timeout); collector.stop('withdraw');
        await btn.deferUpdate(); await pickMsg.edit({ components: [] }).catch(() => {});
        await channel.send({ content: `📤 <@${winner.id}> انسحب!\n🌐 سيتم بدء الجولة القادمة في بضع ثواني...` });
        return resolve(players.filter(p => p.id !== winner.id));
      }
      if (btn.customId === 'rlt_kick2x' && !resolved) {
        const auto2 = remaining[Math.floor(Math.random() * remaining.length)];
        resolved = true; clearTimeout(timeout); collector.stop('kick2x');
        await btn.deferUpdate(); await pickMsg.edit({ components: [] }).catch(() => {});
        await channel.send({ content: `💀 **طرد مزدوج!** <@${winner.id}> طرد نفسه وطرد <@${auto2.id}> معه!\n🌐 سيتم بدء الجولة القادمة في بضع ثواني...` });
        return resolve(players.filter(p => p.id !== winner.id && p.id !== auto2.id));
      }
      if (btn.customId.startsWith('rlt_pick_') && !resolved) {
        const pickedId = btn.customId.replace('rlt_pick_', '');
        const picked = players.find(p => p.id === pickedId);
        if (!picked) return btn.reply({ content: '❌ لاعب غير موجود!', ephemeral: true });
        resolved = true; clearTimeout(timeout); collector.stop('picked');
        await btn.deferUpdate(); await pickMsg.edit({ components: [] }).catch(() => {});
        await channel.send({ content: `💥 <@${winner.id}> طرد <@${picked.id}> من اللعبة!\n🌐 سيتم بدء الجولة القادمة في بضع ثواني...` });
        return resolve(players.filter(p => p.id !== picked.id));
      }
    });
  });
}

async function startGame(channel, players) {
  await channel.send({ embeds: [new EmbedBuilder().setColor('#9B59B6').setTitle('🎰 بدأت لعبة الروليت!').setDescription(`اللاعبون: ${players.map(p=>`<@${p.id}>`).join(', ')}\n\n🎡 تدور العجلة...`)] });
  let remaining = [...players], round = 1;
  while (remaining.length > 1) {
    await new Promise(r => setTimeout(r, 2000));
    remaining = await runRound(channel, remaining, round);
    round++;
    if (remaining.length > 1) await new Promise(r => setTimeout(r, 3000));
  }
  activeGames.delete(channel.id);
  if (remaining.length === 1) {
    const champion = remaining[0];
    const champWheel = await drawWheel([champion], 0);
    await channel.send({ content: `🏆 <@${champion.id}> **هو الفائز!**`, embeds: [new EmbedBuilder().setColor('#F1C40F').setTitle('🏆 الفائز بلعبة الروليت!').setDescription(`🎉 مبروك لـ <@${champion.id}>!\nنجح في البقاء آخر لاعب!`).setTimestamp()], files: champWheel ? [new AttachmentBuilder(champWheel, { name: 'champion.png' })] : [] });
  }
}

module.exports = {
  name: 'roulette',
  description: 'لعبة الروليت بعجلة دوران 🎰',
  aliases: ['روليت'],
  data: new SlashCommandBuilder().setName('roulette').setDescription('لعبة الروليت بعجلة دوران! 🎰'),

  async execute(interaction) {
    if (activeGames.has(interaction.channelId)) return interaction.reply({ content: '⚠️ يوجد لعبة روليت جارية!', ephemeral: true });
    const players = [{ id: interaction.user.id, name: interaction.member?.displayName || interaction.user.username }];
    activeGames.set(interaction.channelId, true);
    const buildEmbed = () => new EmbedBuilder().setColor('#9B59B6').setTitle('🎰 لعبة الروليت!').setDescription(`**${players[0].name}** فتح غرفة الروليت!\n\n🎯 اضغط **انضم** للمشاركة\n\n👥 **اللاعبون (${players.length}):**\n` + players.map((p,i)=>`\`${i+1}\` ${p.name}`).join('\n')).setFooter({ text: 'تنتهي الدعوة بعد 60 ثانية أو عند ضغط ابدأ' }).setTimestamp();
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rlt_join').setLabel('🎰 انضم للعبة').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('rlt_start').setLabel('▶️ ابدأ اللعبة').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('rlt_cancel').setLabel('❌ إلغاء').setStyle(ButtonStyle.Danger));
    const msg = await interaction.reply({ embeds: [buildEmbed()], components: [row], fetchReply: true });
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
    collector.on('collect', async (btn) => {
      if (btn.customId === 'rlt_join') {
        if (players.find(p=>p.id===btn.user.id)) return btn.reply({ content: '⚠️ أنت بالفعل في اللعبة!', ephemeral: true });
        players.push({ id: btn.user.id, name: btn.member?.displayName || btn.user.username });
        await msg.edit({ embeds: [buildEmbed()] }); await btn.reply({ content: `✅ انضممت! (${players.length} لاعبون)`, ephemeral: true });
      }
      if (btn.customId === 'rlt_start') {
        if (btn.user.id !== interaction.user.id) return btn.reply({ content: '❌ فقط صاحب الغرفة!', ephemeral: true });
        if (players.length < 2) return btn.reply({ content: '❌ يجب لاعبَيْن على الأقل!', ephemeral: true });
        await btn.deferUpdate(); collector.stop('start');
      }
      if (btn.customId === 'rlt_cancel') {
        if (btn.user.id !== interaction.user.id) return btn.reply({ content: '❌ فقط صاحب الغرفة!', ephemeral: true });
        await btn.deferUpdate(); collector.stop('cancel');
      }
    });
    collector.on('end', async (_, reason) => {
      if (reason !== 'start' || players.length < 2) {
        activeGames.delete(interaction.channelId);
        return msg.edit({ embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('❌ روليت - ' + (reason === 'cancel' ? 'ألغيت' : 'انتهت المهلة')).setDescription(reason === 'cancel' ? 'تم إلغاء اللعبة.' : 'لم يكفِ عدد اللاعبين!')], components: [] });
      }
      await msg.edit({ components: [] });
      await startGame(interaction.channel, players);
    });
  },

  async executePrefix(message, args) {
    if (activeGames.has(message.channelId)) return message.reply('⚠️ يوجد لعبة روليت جارية!');
    const players = [{ id: message.author.id, name: message.member?.displayName || message.author.username }];
    activeGames.set(message.channelId, true);
    const buildEmbed = () => new EmbedBuilder().setColor('#9B59B6').setTitle('🎰 لعبة الروليت!').setDescription(`**${players[0].name}** فتح غرفة الروليت!\n\n👥 **اللاعبون (${players.length}):**\n` + players.map((p,i)=>`\`${i+1}\` ${p.name}`).join('\n')).setFooter({ text: 'تنتهي الدعوة بعد 60 ثانية' }).setTimestamp();
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rlt_join_p').setLabel('🎰 انضم للعبة').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('rlt_start_p').setLabel('▶️ ابدأ اللعبة').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('rlt_cancel_p').setLabel('❌ إلغاء').setStyle(ButtonStyle.Danger));
    const msg = await message.reply({ embeds: [buildEmbed()], components: [row] });
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
    collector.on('collect', async (btn) => {
      if (btn.customId === 'rlt_join_p') {
        if (players.find(p=>p.id===btn.user.id)) return btn.reply({ content: '⚠️ أنت بالفعل في اللعبة!', ephemeral: true });
        players.push({ id: btn.user.id, name: btn.member?.displayName || btn.user.username });
        await msg.edit({ embeds: [buildEmbed()] }); await btn.reply({ content: `✅ انضممت! (${players.length} لاعبون)`, ephemeral: true });
      }
      if (btn.customId === 'rlt_start_p') {
        if (btn.user.id !== message.author.id) return btn.reply({ content: '❌ فقط صاحب الغرفة!', ephemeral: true });
        if (players.length < 2) return btn.reply({ content: '❌ يجب لاعبَيْن على الأقل!', ephemeral: true });
        await btn.deferUpdate(); collector.stop('start');
      }
      if (btn.customId === 'rlt_cancel_p') {
        if (btn.user.id !== message.author.id) return btn.reply({ content: '❌ فقط صاحب الغرفة!', ephemeral: true });
        await btn.deferUpdate(); collector.stop('cancel');
      }
    });
    collector.on('end', async (_, reason) => {
      if (reason !== 'start' || players.length < 2) {
        activeGames.delete(message.channelId);
        return msg.edit({ embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('❌ روليت').setDescription(reason === 'cancel' ? 'تم إلغاء اللعبة.' : 'لم يكفِ عدد اللاعبين!')], components: [] });
      }
      await msg.edit({ components: [] });
      await startGame(message.channel, players);
    });
  }
};
