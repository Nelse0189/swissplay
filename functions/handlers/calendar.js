import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import admin from 'firebase-admin';
import { getTeamByManagerDiscordId } from '../lib/firebase-helpers.js';

const EVENT_TYPES = ['scrim', 'practice', 'tournament', 'meetup', 'custom'];
const EVENT_EMOJI = { scrim: '⚔️', practice: '🎯', tournament: '🏆', meetup: '👋', custom: '📌' };

/**
 * Handle /add-event - Manager adds a calendar event
 */
export async function handleAddEventSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const title = interaction.options.getString('title');
  const eventType = interaction.options.getString('type') || 'scrim';
  const dateStr = interaction.options.getString('date');
  const startTime = `${interaction.options.getString('start-hour')}:${interaction.options.getString('start-minute')}`;
  const endTime = `${interaction.options.getString('end-hour')}:${interaction.options.getString('end-minute')}`;
  const recurrence = interaction.options.getString('recurrence');

  const db = admin.firestore();

  try {
    const team = await getTeamByManagerDiscordId(interaction.user.id);
    if (!team) {
      await interaction.editReply({
        content: '❌ You must be a Manager or Owner to add events.',
        ephemeral: true
      });
      return;
    }

    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const startDate = new Date(dateStr);
    startDate.setHours(sh, sm, 0, 0);
    const endDate = new Date(dateStr);
    endDate.setHours(eh, em, 0, 0);

    if (endDate <= startDate) {
      await interaction.editReply({ content: '❌ End time must be after start time.', ephemeral: true });
      return;
    }

    let recurrenceRule = null;
    if (recurrence && recurrence !== 'none') {
      if (recurrence === 'weekly') {
        recurrenceRule = `RRULE:FREQ=WEEKLY;DTSTART=${startDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
      } else if (recurrence === 'daily') {
        recurrenceRule = `RRULE:FREQ=DAILY;DTSTART=${startDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
      }
    }

    const eventData = {
      title: title.trim(),
      description: null,
      eventType,
      startTime: startDate,
      endTime: endDate,
      recurrenceRule,
      teamId: team.id,
      discordGuildId: interaction.guildId || team.discordGuildId,
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      remindersSent: {},
      reminders: [60],
      colorEmoji: EVENT_EMOJI[eventType] || '📌'
    };

    await db.collection('calendarEvents').add(eventData);

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('Event Added!')
      .setDescription(`${EVENT_EMOJI[eventType] || '📌'} **${title}**`)
      .addFields(
        { name: 'Date', value: dateStr, inline: true },
        { name: 'Time', value: `${startTime} - ${endTime}`, inline: true },
        { name: 'Type', value: eventType, inline: true }
      );
    if (recurrenceRule) {
      embed.addFields({ name: 'Recurrence', value: recurrence, inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error adding event:', error);
    await interaction.editReply({
      content: `❌ Failed: ${error.message}`,
      ephemeral: true
    });
  }
}

/**
 * Handle /edit-event - Manager selects event to edit (simplified: change title or time)
 */
export async function handleEditEventSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const db = admin.firestore();

  try {
    const team = await getTeamByManagerDiscordId(interaction.user.id);
    if (!team) {
      await interaction.editReply({
        content: '❌ You must be a Manager or Owner to edit events.',
        ephemeral: true
      });
      return;
    }

    const snapshot = await db.collection('calendarEvents')
      .where('teamId', '==', team.id)
      .get();

    const events = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(e => {
        const end = e.endTime?.toDate ? e.endTime.toDate() : new Date(e.endTime);
        return end > new Date();
      })
      .sort((a, b) => {
        const aT = a.startTime?.toMillis?.() ?? new Date(a.startTime).getTime();
        const bT = b.startTime?.toMillis?.() ?? new Date(b.startTime).getTime();
        return aT - bT;
      });

    if (events.length === 0) {
      await interaction.editReply({ content: '❌ No upcoming events to edit.', ephemeral: true });
      return;
    }

    const options = events.slice(0, 25).map(e => {
      const st = e.startTime?.toDate ? e.startTime.toDate() : new Date(e.startTime);
      const dateStr = st.toLocaleDateString();
      const timeStr = st.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return {
        label: `${e.title || 'Event'} - ${dateStr} ${timeStr}`,
        value: e.id,
        description: e.eventType || 'event'
      };
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`edit_event_${team.id}`)
      .setPlaceholder('Select event to edit...')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.editReply({
      content: 'Select an event to edit (use website for full edit):',
      components: [row]
    });
  } catch (error) {
    console.error('Error in edit-event:', error);
    await interaction.editReply({
      content: `❌ Failed: ${error.message}`,
      ephemeral: true
    });
  }
}

/**
 * Handle /delete-event - Manager selects event to delete
 */
export async function handleDeleteEventSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const db = admin.firestore();

  try {
    const team = await getTeamByManagerDiscordId(interaction.user.id);
    if (!team) {
      await interaction.editReply({
        content: '❌ You must be a Manager or Owner to delete events.',
        ephemeral: true
      });
      return;
    }

    const snapshot = await db.collection('calendarEvents')
      .where('teamId', '==', team.id)
      .get();

    const events = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(e => {
        const end = e.endTime?.toDate ? e.endTime.toDate() : new Date(e.endTime);
        return end > new Date();
      })
      .sort((a, b) => {
        const aT = a.startTime?.toMillis?.() ?? new Date(a.startTime).getTime();
        const bT = b.startTime?.toMillis?.() ?? new Date(b.startTime).getTime();
        return aT - bT;
      });

    if (events.length === 0) {
      await interaction.editReply({ content: '❌ No upcoming events to delete.', ephemeral: true });
      return;
    }

    const options = events.slice(0, 25).map(e => {
      const st = e.startTime?.toDate ? e.startTime.toDate() : new Date(e.startTime);
      const dateStr = st.toLocaleDateString();
      return {
        label: `${e.title || 'Event'} - ${dateStr}`,
        value: e.id,
        description: e.eventType || 'event'
      };
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`delete_event_${team.id}`)
      .setPlaceholder('Select event to delete...')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.editReply({
      content: 'Select an event to delete:',
      components: [row]
    });
  } catch (error) {
    console.error('Error in delete-event:', error);
    await interaction.editReply({
      content: `❌ Failed: ${error.message}`,
      ephemeral: true
    });
  }
}

/**
 * Handle edit_event select menu
 */
export async function handleEditEventSelectMenu(interaction, customId) {
  if (!customId.startsWith('edit_event_')) return false;
  const eventId = interaction.values?.[0];
  if (!eventId) return false;

  const WEBSITE_URL = process.env.WEBSITE_URL || 'https://solaris-cd166.web.app';
  await interaction.update({
    content: `For full event editing, please use the website: ${WEBSITE_URL}/teams/overwatch (Calendar tab)`,
    components: []
  });
  return true;
}

/**
 * Handle delete_event select menu - show confirm buttons
 */
export async function handleDeleteEventSelectMenu(interaction, customId) {
  if (!customId.startsWith('delete_event_')) return false;
  const eventId = interaction.values?.[0];
  if (!eventId) return false;

  await interaction.update({
    content: 'Confirm delete?',
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`del_event_confirm_${eventId}`)
          .setLabel('Delete')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('del_event_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
  return true;
}

/**
 * Handle delete event confirm button
 */
export async function handleDeleteEventConfirm(interaction, customId) {
  if (!customId.startsWith('del_event_confirm_')) return false;
  const eventId = customId.replace('del_event_confirm_', '');

  await interaction.deferUpdate();

  const db = admin.firestore();

  try {
    const team = await getTeamByManagerDiscordId(interaction.user.id);
    if (!team) {
      await interaction.editReply({ content: '❌ Not authorized.', components: [] });
      return true;
    }

    const eventDoc = await db.collection('calendarEvents').doc(eventId).get();
    if (!eventDoc.exists || eventDoc.data().teamId !== team.id) {
      await interaction.editReply({ content: '❌ Event not found or not yours.', components: [] });
      return true;
    }

    await db.collection('calendarEvents').doc(eventId).delete();

    await interaction.editReply({
      content: '✅ Event deleted.',
      components: []
    });
  } catch (error) {
    console.error('Error deleting event:', error);
    await interaction.editReply({
      content: `❌ Failed: ${error.message}`,
      components: []
    });
  }

  return true;
}
