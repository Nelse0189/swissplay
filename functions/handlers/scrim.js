import admin from 'firebase-admin';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getManagerTeams } from '../lib/firebase-helpers.js';
import { parseScrimTimeCSV, isValidScrimTimeCSV } from '../lib/scrim-parser.js';
import * as discordApi from '../discordApi.js';

function getFirestore() {
  return admin.firestore();
}

function parseFlexibleDate(dateStr) {
  const lower = (dateStr || '').toLowerCase().trim();
  const now = new Date();
  if (lower === 'today') return now.toISOString().split('T')[0];
  if (lower === 'tomorrow') {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    return t.toISOString().split('T')[0];
  }
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = dayNames.indexOf(lower);
  if (dayIndex !== -1) {
    const target = new Date(now);
    let daysToAdd = dayIndex - target.getDay();
    if (daysToAdd <= 0) daysToAdd += 7;
    target.setDate(target.getDate() + daysToAdd);
    return target.toISOString().split('T')[0];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return null;
}

function parseFlexibleTime(timeStr) {
  const lower = (timeStr || '').toLowerCase().trim();
  const m = lower.match(/(\d{1,2})(?::(\d{2}))?(?:am|pm)?/);
  if (!m) return null;
  let hour = parseInt(m[1]);
  const minute = m[2] ? parseInt(m[2]) : 0;
  if (lower.includes('pm') && hour < 12) hour += 12;
  else if (lower.includes('am') && hour === 12) hour = 0;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

async function scheduleScrimForTeam(db, team, date, time, notes, managerUser) {
  const pollRef = await db.collection('scrimPolls').add({
    teamId: team.id,
    teamName: team.name,
    managerId: managerUser.id,
    managerUsername: managerUser.username,
    date,
    time,
    notes,
    responses: {},
    createdAt: new Date(),
    status: 'active'
  });
  const pollId = pollRef.id;
  const members = team.members?.filter(m => m.discordId) || [];
  if (members.length === 0) {
    await discordApi.sendDM(managerUser.id, {
      embeds: [discordApi.embedToApi(new EmbedBuilder()
        .setTitle('⚠️ No Team Members')
        .setDescription('No team members have Discord linked. Link them first with /add-player.')
        .setColor(0xffaa00))]
    });
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle('📅 Scrim Scheduled!')
    .setDescription(`${managerUser.username} scheduled a scrim for **${team.name}**`)
    .addFields({ name: 'Date', value: date, inline: true }, { name: 'Time', value: time, inline: true })
    .setColor(0x7289da);
  if (notes) embed.addFields({ name: 'Notes', value: notes, inline: false });
  embed.addFields({ name: 'Can you make it?', value: 'Click a button below to respond:' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`scrim_yes_${pollId}`).setLabel('✅ Yes').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`scrim_no_${pollId}`).setLabel('❌ No').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`scrim_maybe_${pollId}`).setLabel('⏰ Maybe').setStyle(ButtonStyle.Secondary)
  );
  const components = discordApi.componentsToApi([row]);
  let successCount = 0;
  for (const member of members) {
    try {
      await discordApi.sendDM(member.discordId, { embeds: [discordApi.embedToApi(embed)], components });
      successCount++;
    } catch (e) {
      console.error('Failed to DM:', e.message);
    }
  }
  try {
    await discordApi.sendDM(managerUser.id, {
      embeds: [discordApi.embedToApi(new EmbedBuilder()
        .setTitle('✅ Scrim Poll Sent')
        .setDescription(`Sent availability poll to ${successCount}/${members.length} team members`)
        .addFields({ name: 'Date', value: date }, { name: 'Time', value: time }, { name: 'Poll ID', value: pollId })
        .setColor(0x00ff00)
        .setFooter({ text: 'You\'ll receive DMs as players respond.' }))]
    });
  } catch (e) {
    console.log('Could not DM manager:', e.message);
  }
}

export async function handleScrimPollResponse(interaction, pollId, responseType) {
  await interaction.deferReply({ ephemeral: true });
  const db = getFirestore();
  const pollRef = db.collection('scrimPolls').doc(pollId);
  const pollDoc = await pollRef.get();
  if (!pollDoc.exists) {
    await interaction.followUp({ content: '❌ Poll not found or expired.', ephemeral: true });
    return;
  }
  const poll = pollDoc.data();
  const responses = poll.responses || {};
  let responseText = '', responseEmoji = '';
  switch (responseType) {
    case 'yes': responseText = 'Available'; responseEmoji = '✅'; break;
    case 'no': responseText = 'Unavailable'; responseEmoji = '❌'; break;
    case 'maybe': responseText = 'Maybe'; responseEmoji = '⏰'; break;
  }
  responses[interaction.user.id] = { username: interaction.user.username, response: responseText, respondedAt: new Date() };
  await pollRef.update({ responses });
  await interaction.followUp({
    content: `${responseEmoji} Response recorded: **${responseText}**\n\nYour manager will be notified.`,
    ephemeral: true
  });
  try {
    const totalResponses = Object.keys(responses).length;
    const yesCount = Object.values(responses).filter(r => r.response === 'Available').length;
    const noCount = Object.values(responses).filter(r => r.response === 'Unavailable').length;
    const maybeCount = Object.values(responses).filter(r => r.response === 'Maybe').length;
    const notifyEmbed = new EmbedBuilder()
      .setTitle('📝 Scrim Poll Response')
      .setDescription(`${interaction.user.username} responded: **${responseText}**`)
      .addFields(
        { name: 'Scrim', value: `${poll.date} at ${poll.time}`, inline: false },
        { name: 'Response Summary', value: `✅ Yes: ${yesCount} | ❌ No: ${noCount} | ⏰ Maybe: ${maybeCount}`, inline: false },
        { name: 'Total Responses', value: `${totalResponses} player(s)`, inline: true }
      )
      .setColor(responseType === 'yes' ? 0x00ff00 : responseType === 'no' ? 0xff0000 : 0xffaa00);
    await discordApi.sendDM(poll.managerId, { embeds: [discordApi.embedToApi(notifyEmbed)] });
  } catch (e) {
    console.error('Failed to notify manager:', e);
  }
}

export async function handleScheduleScrimSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const db = getFirestore();
  const managerTeams = await getManagerTeams(db, interaction.user.id);
  if (managerTeams.length === 0) {
    await interaction.followUp({ content: '❌ You are not a verified manager.', ephemeral: true });
    return;
  }
  const dateStr = interaction.options.getString('date');
  const timeStr = interaction.options.getString('time');
  const notes = interaction.options.getString('notes') || '';
  const scrimDate = parseFlexibleDate(dateStr);
  const scrimTime = parseFlexibleTime(timeStr);
  if (!scrimDate || !scrimTime) {
    await interaction.followUp({
      content: '❌ Invalid date or time format.\n\n**Examples:**\n• Date: "tomorrow", "monday", "2024-03-15"\n• Time: "7pm", "19:00"',
      ephemeral: true
    });
    return;
  }
  if (managerTeams.length === 1) {
    await scheduleScrimForTeam(db, managerTeams[0], scrimDate, scrimTime, notes, interaction.user);
    await interaction.followUp({
      content: `✅ Scrim scheduled for **${scrimDate}** at **${scrimTime}**!\n\nPolling your team members via DM...`,
      ephemeral: true
    });
    return;
  }
  const sessionCode = Math.random().toString(36).slice(2, 10);
  await db.collection('scheduleScrimSessions').doc(sessionCode).set({
    managerId: interaction.user.id,
    guildId: interaction.guild?.id,
    teamIds: managerTeams.map(t => t.id),
    date: scrimDate,
    time: scrimTime,
    notes,
    createdAt: new Date()
  });
  const { StringSelectMenuBuilder } = await import('discord.js');
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`schedule_scrim_team_${sessionCode}`)
    .setPlaceholder('Choose which team this scrim is for')
    .addOptions(managerTeams.slice(0, 25).map(t => ({ label: (t.name || t.id).slice(0, 100), value: t.id })));
  const row = new ActionRowBuilder().addComponents(menu);
  await interaction.followUp({
    content: `Select which team to schedule the scrim for:\n📅 **${scrimDate}** at **${scrimTime}**`,
    components: [row],
    ephemeral: true
  });
}

export async function handleScheduleScrimTeamSelect(interaction, sessionCode, selectedTeamId) {
  await interaction.update({ content: '⏳ Scheduling scrim...', components: [] });
  const db = getFirestore();
  const sessionRef = db.collection('scheduleScrimSessions').doc(sessionCode);
  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) {
    await interaction.followUp({ content: '❌ Session expired. Please run `/schedule-scrim` again.', ephemeral: true });
    return;
  }
  const session = sessionDoc.data();
  if (session.managerId !== interaction.user.id) {
    await interaction.followUp({ content: '❌ This is not your schedule session.', ephemeral: true });
    return;
  }
  const teamDoc = await db.collection('teams').doc(selectedTeamId).get();
  if (!teamDoc.exists) {
    await interaction.followUp({ content: '❌ Team not found.', ephemeral: true });
    return;
  }
  const team = { id: teamDoc.id, ...teamDoc.data() };
  await scheduleScrimForTeam(db, team, session.date, session.time, session.notes || '', interaction.user);
  await sessionRef.delete().catch(() => {});
  await interaction.followUp({
    content: `✅ Scrim scheduled for **${team.name}** on **${session.date}** at **${session.time}**!\n\nPolling your team via DM...`,
    ephemeral: true
  });
}

export async function handleFindTimeSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const db = getFirestore();
  const managerTeams = await getManagerTeams(db, interaction.user.id);
  if (managerTeams.length === 0) {
    await interaction.followUp({ content: '❌ You are not a verified manager.', ephemeral: true });
    return;
  }
  const team = managerTeams[0];
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const slots = [];
  for (const day of days) {
    for (let hour = 18; hour <= 22; hour++) {
      let count = 0;
      for (const m of team.members || []) {
        if (!Array.isArray(m.availability)) continue;
        const slotKey = `${day}-${hour}`;
        const hasSlot = m.availability.some(s =>
          typeof s === 'string' ? s === slotKey : (s.day === day && hour >= (s.startHour || 0) && hour < (s.endHour || 24))
        );
        if (hasSlot) count++;
      }
      if (count > 0) slots.push({ day, hour, count });
    }
  }
  slots.sort((a, b) => b.count - a.count);
  const top = slots.slice(0, 5).map(s => `${s.day} ${s.hour}:00 (${s.count} available)`).join('\n');
  const embed = new EmbedBuilder()
    .setTitle(`📅 Best Times for ${team.name}`)
    .setDescription(top || 'No availability data. Ask players to set their availability with /my-availability.')
    .setColor(0x7289da);
  await interaction.followUp({ embeds: [embed], ephemeral: true });
}

export async function handleUpcomingScrimsSlash(interaction) {
  await interaction.reply({ content: '📅 Check your DMs! I sent you the upcoming scrims.', ephemeral: true });
  const user = interaction.user;
  const db = getFirestore();
  const teamsSnapshot = await db.collection('teams').get();
  const userTeams = teamsSnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(t => t.members?.some(m => m.discordId === user.id));
  if (userTeams.length === 0) {
    await discordApi.sendDM(user.id, {
      embeds: [discordApi.embedToApi(new EmbedBuilder()
        .setTitle('❌ Not on a Team')
        .setDescription('You\'re not on any team.')
        .setColor(0xff0000))]
    });
    return;
  }
  const teamIds = userTeams.map(t => t.id);
  const allScrims = [];
  for (const teamId of teamIds) {
    const snap = await db.collection('scrimPolls').where('teamId', '==', teamId).where('status', '==', 'active').get();
    snap.docs.forEach(doc => allScrims.push({ id: doc.id, ...doc.data() }));
  }
  if (allScrims.length === 0) {
    await discordApi.sendDM(user.id, {
      embeds: [discordApi.embedToApi(new EmbedBuilder()
        .setTitle('📅 No Upcoming Scrims')
        .setDescription('Your team has no scheduled scrims yet.')
        .setColor(0xffaa00))]
    });
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle('📅 Upcoming Scrims')
    .setDescription(`You have ${allScrims.length} scheduled scrim(s)`)
    .setColor(0x7289da);
  for (const scrim of allScrims.slice(0, 10)) {
    const myResponse = scrim.responses?.[user.id];
    const statusEmoji = myResponse?.response === 'Available' ? '✅' : myResponse?.response === 'Unavailable' ? '❌' : myResponse?.response === 'Maybe' ? '⏰' : '❓';
    const yesCount = Object.values(scrim.responses || {}).filter(r => r.response === 'Available').length;
    const total = Object.keys(scrim.responses || {}).length;
    embed.addFields({
      name: `${statusEmoji} ${scrim.date} at ${scrim.time}`,
      value: `Team: **${scrim.teamName}**\nConfirmed: ${yesCount} (${total} responded)` + (scrim.notes ? `\nNotes: ${scrim.notes}` : ''),
      inline: false
    });
  }
  await discordApi.sendDM(user.id, { embeds: [discordApi.embedToApi(embed)] });
}

export async function handleUploadScrimSlash(interaction) {
  await interaction.deferReply();
  const attachment = interaction.options.getAttachment('logfile');
  if (!attachment) {
    await interaction.followUp({ content: '❌ No attachment found.' });
    return;
  }
  if (!attachment.filename?.endsWith('.csv') && !attachment.filename?.endsWith('.txt')) {
    await interaction.followUp({ content: '❌ Please upload a .csv or .txt file from ScrimTime.' });
    return;
  }
  const response = await fetch(attachment.url);
  const content = await response.text();
  if (!isValidScrimTimeCSV(content)) {
    await interaction.followUp({ content: '❌ Invalid ScrimTime format. Use workshop code **9GPA9**.' });
    return;
  }
  const scrimData = parseScrimTimeCSV(content);
  const db = getFirestore();
  const teamsSnapshot = await db.collection('teams').get();
  const userTeam = teamsSnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .find(t => t.members?.some(m => m.discordId === interaction.user.id));
  if (!userTeam) {
    await interaction.followUp({ content: '❌ You must have your Discord linked to a team. Ask your manager to add you via /add-player, or verify via the website (Team Management → Settings).' });
    return;
  }
  const member = userTeam.members.find(m => m.discordId === interaction.user.id);
  if (!member?.roles?.includes('Manager') && !member?.roles?.includes('Owner')) {
    await interaction.followUp({ content: '❌ Only team managers can upload scrim logs.' });
    return;
  }
  await db.collection('scrimLogs').add({
    teamId: userTeam.id,
    uploadedByDiscordId: interaction.user.id,
    uploadedAt: new Date(),
    matchMetadata: scrimData.metadata,
    playerStats: scrimData.players,
    teamStats: scrimData.teams,
    killLog: scrimData.kills,
    ultimateLog: scrimData.ultimates,
    roundStats: scrimData.rounds,
    source: 'discord'
  });
  const embed = new EmbedBuilder()
    .setTitle('✅ Scrim Data Uploaded')
    .setDescription(`Successfully parsed match: **${scrimData.metadata?.mapName || 'Unknown Map'}**`)
    .addFields(
      { name: 'Teams', value: `${scrimData.metadata?.team1Name || 'Team 1'} vs ${scrimData.metadata?.team2Name || 'Team 2'}` },
      { name: 'Score', value: `${scrimData.metadata?.score1 || 0} - ${scrimData.metadata?.score2 || 0}` },
      { name: 'Players', value: `${scrimData.players?.length || 0} operatives tracked` }
    )
    .setColor(0x00ff00);
  await interaction.followUp({ embeds: [embed] });
}
