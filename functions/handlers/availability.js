import admin from 'firebase-admin';
import { EmbedBuilder } from 'discord.js';
import { getPlayerByDiscordId } from '../lib/firebase-helpers.js';
import * as discordApi from '../discordApi.js';

function getFirestore() {
  return admin.firestore();
}

/** Expand day range to slot strings (website format: "Monday-18") */
function rangesToSlotStrings(ranges) {
  const slotStrings = [];
  for (const r of ranges) {
    for (let h = r.startHour ?? 0; h < (r.endHour ?? 24); h++) {
      slotStrings.push(`${r.day}-${h}`);
    }
  }
  return slotStrings;
}

/** Preset availability options: value -> { ranges, label } - ranges match find-time format */
const AVAILABILITY_PRESETS = {
  weekdays_6_10: {
    label: 'Weekdays 6-10pm',
    ranges: ['Monday','Tuesday','Wednesday','Thursday','Friday'].map(d => ({ day: d, startHour: 18, endHour: 22 })),
  },
  weekdays_7_11: {
    label: 'Weekdays 7-11pm',
    ranges: ['Monday','Tuesday','Wednesday','Thursday','Friday'].map(d => ({ day: d, startHour: 19, endHour: 23 })),
  },
  weekends_anytime: {
    label: 'Weekends anytime',
    ranges: [
      { day: 'Saturday', startHour: 0, endHour: 23 },
      { day: 'Sunday', startHour: 0, endHour: 23 },
    ],
  },
  everyday_6_midnight: {
    label: 'Every day 6pm-midnight',
    ranges: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => ({ day: d, startHour: 18, endHour: 23 })),
  },
  mon_wed_fri_7_10: {
    label: 'Mon / Wed / Fri 7-10pm',
    ranges: ['Monday','Wednesday','Friday'].map(d => ({ day: d, startHour: 19, endHour: 22 })),
  },
  tue_thu_7_10: {
    label: 'Tue / Thu 7-10pm',
    ranges: ['Tuesday','Thursday'].map(d => ({ day: d, startHour: 19, endHour: 22 })),
  },
  weekends_evenings: {
    label: 'Weekends 6-10pm',
    ranges: [
      { day: 'Saturday', startHour: 18, endHour: 22 },
      { day: 'Sunday', startHour: 18, endHour: 22 },
    ],
  },
  anytime: {
    label: 'Any time (flexible)',
    ranges: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => ({ day: d, startHour: 0, endHour: 23 })),
  },
};

/** Parse natural language availability text into structured slots */
function parseAvailabilityText(text) {
  if (!text || typeof text !== 'string') return [];
  const slots = [];
  const lowerText = text.toLowerCase().trim();
  const dayMap = {
    monday: 'Monday', mon: 'Monday',
    tuesday: 'Tuesday', tue: 'Tuesday', tues: 'Tuesday',
    wednesday: 'Wednesday', wed: 'Wednesday',
    thursday: 'Thursday', thu: 'Thursday', thur: 'Thursday', thurs: 'Thursday',
    friday: 'Friday', fri: 'Friday',
    saturday: 'Saturday', sat: 'Saturday',
    sunday: 'Sunday', sun: 'Sunday',
  };
  const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const weekends = ['Saturday', 'Sunday'];

  let targetDays = [];
  if (lowerText.includes('weekday')) targetDays = weekdays;
  else if (lowerText.includes('weekend')) targetDays = weekends;
  else if (lowerText.includes('anytime') || lowerText.includes('any time') || lowerText.includes('always')) targetDays = allDays;
  else {
    for (const [key, day] of Object.entries(dayMap)) {
      if (lowerText.includes(key) && !targetDays.includes(day)) targetDays.push(day);
    }
  }
  if (targetDays.length === 0) targetDays = allDays;

  let startHour = 18, endHour = 22;
  const timeRangeMatch = lowerText.match(/(\d{1,2})(?::00)?(?:am|pm)?\s*-\s*(\d{1,2})(?::00)?(?:am|pm)?/);
  if (timeRangeMatch) {
    startHour = parseInt(timeRangeMatch[1]);
    endHour = parseInt(timeRangeMatch[2]);
    if (lowerText.includes('pm') && startHour < 12) startHour += 12;
    if (lowerText.includes('pm') && endHour < 12) endHour += 12;
  } else {
    const afterMatch = lowerText.match(/after\s+(\d{1,2})(?::00)?(?:am|pm)?/);
    if (afterMatch) {
      startHour = parseInt(afterMatch[1]);
      if (lowerText.includes('pm') && startHour < 12) startHour += 12;
      endHour = 23;
    } else {
      const untilMatch = lowerText.match(/(?:until|before)\s+(\d{1,2})(?::00)?(?:am|pm)?/);
      if (untilMatch) {
        endHour = parseInt(untilMatch[1]);
        if (lowerText.includes('pm') && endHour < 12) endHour += 12;
      }
    }
    if (lowerText.includes('anytime') || lowerText.includes('any time')) {
      startHour = 0;
      endHour = 23;
    }
  }

  for (const day of targetDays) slots.push({ day, startHour, endHour });
  return slots;
}

export async function handleButtonAvailabilityResponse(interaction, requestId, responseType) {
  const db = getFirestore();
  const playerDiscordId = interaction.user.id;
  const requestRef = db.collection('availabilityRequests').doc(requestId);
  const requestDoc = await requestRef.get();
  if (!requestDoc.exists) {
    await interaction.reply({ content: '❌ Request not found.', ephemeral: true });
    return;
  }
  const requestData = requestDoc.data();
  const teamId = requestData.teamId;
  const player = await getPlayerByDiscordId(playerDiscordId, teamId);
  if (!player) {
    await interaction.reply({ content: '❌ You are not linked to this team.', ephemeral: true });
    return;
  }
  let responseText = '', responseValue = false;
  switch (responseType) {
    case 'yes': responseText = '✅ Available'; responseValue = true; break;
    case 'no': responseText = '❌ Unavailable'; responseValue = false; break;
    case 'maybe': responseText = '⏰ Maybe'; responseValue = null; break;
  }
  const responses = requestData.responses || {};
  responses[playerDiscordId] = {
    playerName: player.name || interaction.user.username,
    playerUid: player.uid,
    response: responseText,
    responseValue,
    respondedAt: new Date()
  };
  await requestRef.update({ responses });
  await interaction.reply({
    content: `✅ Response recorded: ${responseText}\n\nIf you selected "Maybe", you can send a follow-up message with your time constraints.`,
    ephemeral: true
  });
  try {
    const notifyEmbed = new EmbedBuilder()
      .setTitle('📝 Availability Response')
      .setDescription(`${player.name || interaction.user.username} responded: ${responseText}`)
      .addFields({ name: 'Request ID', value: requestId })
      .setColor(responseValue === true ? 0x00ff00 : responseValue === false ? 0xff0000 : 0xffaa00);
    await discordApi.sendDM(requestData.managerDiscordId, { embeds: [discordApi.embedToApi(notifyEmbed)] });
  } catch (error) {
    console.error('Failed to notify manager:', error);
  }
}

/** Build select menu components for flexible availability */
function getFlexibleAvailabilityComponents(state = { days: [], start: null, end: null }) {
  const daysOptions = [
    { label: 'Monday', value: 'Monday' },
    { label: 'Tuesday', value: 'Tuesday' },
    { label: 'Wednesday', value: 'Wednesday' },
    { label: 'Thursday', value: 'Thursday' },
    { label: 'Friday', value: 'Friday' },
    { label: 'Saturday', value: 'Saturday' },
    { label: 'Sunday', value: 'Sunday' }
  ].map(o => ({ ...o, default: state.days.includes(o.value) }));

  const timeOptions = [];
  for (let i = 0; i < 24; i++) {
    const ampm = i < 12 ? 'AM' : 'PM';
    const hour = i === 0 ? 12 : (i > 12 ? i - 12 : i);
    timeOptions.push({
      label: `${hour}:00 ${ampm}`,
      value: i.toString()
    });
  }

  // Encode state into a short string for the save button
  // Format: "flex_avail_save|Mo,Tu|18|22"
  const dayMap = { Monday: 'Mo', Tuesday: 'Tu', Wednesday: 'We', Thursday: 'Th', Friday: 'Fr', Saturday: 'Sa', Sunday: 'Su' };
  const daysStr = state.days.map(d => dayMap[d]).join(',');
  const startStr = state.start !== null ? state.start : 'null';
  const endStr = state.end !== null ? state.end : 'null';
  const saveCustomId = `flex_avail_save|${daysStr}|${startStr}|${endStr}`;

  return [
    {
      type: 1,
      components: [{
        type: 3,
        custom_id: 'flex_avail_days',
        placeholder: state.days.length > 0 ? `${state.days.length} days selected` : 'Select Days...',
        min_values: 1,
        max_values: 7,
        options: daysOptions
      }]
    },
    {
      type: 1,
      components: [{
        type: 3,
        custom_id: 'flex_avail_start',
        placeholder: state.start !== null ? `Start: ${timeOptions[state.start].label}` : 'Select Start Time...',
        options: timeOptions.map(o => ({ ...o, default: state.start === parseInt(o.value) }))
      }]
    },
    {
      type: 1,
      components: [{
        type: 3,
        custom_id: 'flex_avail_end',
        placeholder: state.end !== null ? `End: ${timeOptions[state.end].label}` : 'Select End Time...',
        options: timeOptions.map(o => ({ ...o, default: state.end === parseInt(o.value) }))
      }]
    },
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3, // Success
          label: 'Save Availability',
          custom_id: saveCustomId,
          disabled: state.days.length === 0 || state.start === null || state.end === null
        },
        {
          type: 2,
          style: 2, // Secondary
          label: '✏️ Type Custom Format',
          custom_id: 'flex_avail_custom'
        }
      ]
    }
  ];
}

export async function handleMyAvailabilitySlash(interaction) {
  const user = interaction.user;
  const db = getFirestore();
  const teamsSnapshot = await db.collection('teams').get();
  const userTeams = teamsSnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(t => t.members?.some(m => m.discordId === user.id));
  if (userTeams.length === 0) {
    await interaction.reply({
      content: '❌ You\'re not on any team. Ask a manager to add you using `/add-player`.',
      ephemeral: true,
    });
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle('📅 Set Your Availability')
    .setDescription('Select the days and times you are typically available for scrims.\n\n*If you have a complex schedule (e.g. different times on different days), click **Type Custom Format**.*')
    .setColor(0x7289da)
    .setFooter({ text: 'Your manager will see this on the team dashboard.' });
  await interaction.reply({
    embeds: [embed],
    components: getFlexibleAvailabilityComponents(),
    ephemeral: true,
  });
}

/** Handle select menu choice - either apply preset or show custom modal */
export async function handleAvailabilitySelect(interaction, selectedValue) {
  if (selectedValue === 'availability_custom') {
    const modalComponents = [
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: 'availability_input',
            label: 'When are you available?',
            style: 2,
            placeholder: 'e.g. Weekdays 6-10pm, Thu Sat 8-11pm',
            required: true,
            max_length: 500,
          },
        ],
      },
    ];
    await interaction.showModal({
      customId: 'availability_modal',
      title: 'Set Your Availability (Custom)',
      components: modalComponents,
    });
    return;
  }
  const preset = AVAILABILITY_PRESETS[selectedValue];
  if (!preset) return;
  await applyAvailabilityToTeams(interaction, preset.ranges, preset.label);
}

export async function handleFlexibleAvailability(interaction) {
  const customId = interaction.customId;
  
  if (customId === 'flex_avail_custom') {
    const modalComponents = [
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: 'availability_input',
            label: 'When are you available?',
            style: 2,
            placeholder: 'e.g. Weekdays 6-10pm, Thu Sat 8-11pm',
            required: true,
            max_length: 500,
          },
        ],
      },
    ];
    await interaction.showModal({
      customId: 'availability_modal',
      title: 'Set Your Availability (Custom)',
      components: modalComponents,
    });
    return;
  }

  if (customId.startsWith('flex_avail_save')) {
    const parts = customId.split('|');
    if (parts.length < 4) return;
    const daysStr = parts[1];
    const startStr = parts[2];
    const endStr = parts[3];
    
    const dayMap = { Mo: 'Monday', Tu: 'Tuesday', We: 'Wednesday', Th: 'Thursday', Fr: 'Friday', Sa: 'Saturday', Su: 'Sunday' };
    const days = daysStr ? daysStr.split(',').map(d => dayMap[d]).filter(Boolean) : [];
    const start = startStr !== 'null' ? parseInt(startStr) : null;
    const end = endStr !== 'null' ? parseInt(endStr) : null;
    
    if (days.length === 0 || start === null || end === null) {
      await interaction.reply({ content: '❌ Please select days, start time, and end time.', ephemeral: true });
      return;
    }
    
    if (start >= end) {
      await interaction.reply({ content: '❌ Start time must be before end time.', ephemeral: true });
      return;
    }
    
    const ranges = days.map(day => ({ day, startHour: start, endHour: end }));
    
    const formatTime = (h) => {
      const ampm = h < 12 ? 'am' : 'pm';
      const hr = h === 0 ? 12 : (h > 12 ? h - 12 : h);
      return `${hr}${ampm}`;
    };
    
    const text = `${days.join(', ')} ${formatTime(start)}-${formatTime(end)}`;
    await applyAvailabilityToTeams(interaction, ranges, text);
    return;
  }

  // Handle select menu changes
  let state = { days: [], start: null, end: null };
  const message = interaction.message;
  if (message && message.components && message.components.length >= 4) {
    const saveBtn = message.components[3].components.find(c => c.custom_id?.startsWith('flex_avail_save'));
    if (saveBtn) {
      const parts = saveBtn.custom_id.split('|');
      if (parts.length === 4) {
        const dayMap = { Mo: 'Monday', Tu: 'Tuesday', We: 'Wednesday', Th: 'Thursday', Fr: 'Friday', Sa: 'Saturday', Su: 'Sunday' };
        if (parts[1]) state.days = parts[1].split(',').map(d => dayMap[d]).filter(Boolean);
        if (parts[2] !== 'null') state.start = parseInt(parts[2]);
        if (parts[3] !== 'null') state.end = parseInt(parts[3]);
      }
    }
  }

  if (customId === 'flex_avail_days') {
    state.days = interaction.values || [];
  } else if (customId === 'flex_avail_start') {
    state.start = parseInt(interaction.values[0]);
  } else if (customId === 'flex_avail_end') {
    state.end = parseInt(interaction.values[0]);
  }

  // Update the message with the new state
  await interaction.update({
    components: getFlexibleAvailabilityComponents(state)
  });
}

/** Save availability. Supports both range format (for find-time) and slot strings (for website grid). */
async function applyAvailabilityToTeams(interaction, rangesOrSlots, availabilityText) {
  await interaction.deferReply({ ephemeral: true });
  const userId = interaction.user.id;
  const db = getFirestore();
  const teamsSnapshot = await db.collection('teams').get();
  const userTeams = teamsSnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(t => t.members?.some(m => m.discordId === userId));

  // Website uses slot strings ("Monday-18"); find-time uses ranges. Store slot strings for grid compatibility.
  const slotStrings = Array.isArray(rangesOrSlots) && rangesOrSlots.length > 0
    ? (typeof rangesOrSlots[0] === 'string'
        ? rangesOrSlots
        : rangesToSlotStrings(rangesOrSlots))
    : [];

  let updatedCount = 0;
  for (const team of userTeams) {
    const memberIndex = team.members?.findIndex(m => m.discordId === userId);
    if (memberIndex === -1) continue;
    const updatedMembers = [...team.members];
    updatedMembers[memberIndex] = {
      ...updatedMembers[memberIndex],
      availability: slotStrings,
      availabilityText,
    };
    await db.collection('teams').doc(team.id).update({ members: updatedMembers });
    updatedCount++;
  }

  await interaction.editReply({
    content: `✅ **Availability updated!**\n\nYour availability: **${availabilityText}**\nUpdated for ${updatedCount} team(s).`,
  });
}

export async function handleAvailabilityModalSubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const input = interaction.getModalValue('availability_input')?.trim() || '';
  if (!input) {
    await interaction.editReply({
      content: '❌ No availability text provided. Try again with `/my-availability`.',
    });
    return;
  }
  const parsed = parseAvailabilityText(input);
  if (!parsed || parsed.length === 0) {
    await interaction.editReply({
      content:
        '❌ I couldn\'t understand that format.\n\n**Try:** "Weekdays 6-10pm", "Mon Wed Fri 7-9pm", "Weekends anytime"',
    });
    return;
  }
  await applyAvailabilityToTeams(interaction, parsed, input);
}


export async function handleAvailabilityRequestSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const periodOption = interaction.options.getString('period');
  const playersOption = interaction.options.getString('players');

  const mentionedUserIds = [];
  if (playersOption) {
    const mentionRegex = /<@!?(\d+)>/g;
    let match;
    while ((match = mentionRegex.exec(playersOption)) !== null) {
      mentionedUserIds.push(match[1]);
    }
  }
  const sendToAll =
    !playersOption ||
    playersOption.toLowerCase().includes('all') ||
    mentionedUserIds.length === 0;

  const { getTeamByManagerDiscordId } = await import('../lib/firebase-helpers.js');
  const db = getFirestore();
  const team = await getTeamByManagerDiscordId(interaction.user.id);
  if (!team) {
    await interaction.followUp({ content: '❌ You are not a manager of any team.', ephemeral: true });
    return;
  }

  const allTeamPlayers =
    team.members?.filter(m => m.roles?.includes('Player') || m.roles?.includes('Coach')) || [];

  let targetPlayers = allTeamPlayers.filter(p => p.discordId);
  if (targetPlayers.length === 0) {
    await interaction.followUp({
      content: '❌ No players have linked their Discord accounts.',
      ephemeral: true,
    });
    return;
  }

  if (!sendToAll && mentionedUserIds.length > 0) {
    targetPlayers = targetPlayers.filter(p => mentionedUserIds.includes(p.discordId));
    if (targetPlayers.length === 0) {
      await interaction.followUp({
        content:
          '❌ None of the mentioned players are linked to your team. They must link Discord from the website first.',
        ephemeral: true,
      });
      return;
    }
  }

  const unlinkedIds = mentionedUserIds.filter(
    id => !allTeamPlayers.some(p => p.discordId === id)
  );
  let warnNote = '';
  if (unlinkedIds.length > 0) {
    warnNote = `\n⚠️ Skipped ${unlinkedIds.length} mention(s) not on your team.`;
  }

  const timePeriod = periodOption || null;
  const requestRef = await db.collection('availabilityRequests').add({
    teamId: team.id,
    managerDiscordId: interaction.user.id,
    managerName: interaction.user.username,
    timePeriod,
    createdAt: new Date(),
    responses: {},
    status: 'pending',
  });
  const requestId = requestRef.id;

  const embed = new EmbedBuilder()
    .setTitle('📅 Availability Request')
    .setDescription('Please respond with your availability for the upcoming scrim.')
    .setColor(0x00ff00)
    .addFields(
      { name: 'Team', value: team.name, inline: true },
      { name: 'Requested by', value: interaction.user.username, inline: true }
    );
  if (timePeriod) {
    embed.addFields({ name: 'Time Period', value: timePeriod, inline: true });
  }
  embed.addFields({
    name: 'Instructions',
    value:
      'Click the buttons below to respond:\n✅ Available\n❌ Unavailable\n⏰ Maybe (with time constraints)',
  });

  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`avail_yes_${requestId}`).setLabel('✅ Available').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`avail_no_${requestId}`).setLabel('❌ Unavailable').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`avail_maybe_${requestId}`).setLabel('⏰ Maybe').setStyle(ButtonStyle.Secondary)
  );
  const components = discordApi.componentsToApi([row]);

  let sent = 0;
  let failCount = 0;
  for (const p of targetPlayers) {
    try {
      await discordApi.sendDM(p.discordId, { embeds: [discordApi.embedToApi(embed)], components });
      sent++;
    } catch (e) {
      console.error('Failed to DM player:', e);
      failCount++;
    }
  }

  const scope = sendToAll ? `all ${sent} linked player(s)` : `${sent} selected player(s)`;
  await interaction.followUp({
    content: `✅ Sent availability request to ${scope}.${failCount > 0 ? ` ${failCount} failed (DM closed?).` : ''}${warnNote}`,
    ephemeral: true,
  });
}
