/**
 * /my-timezone - Set timezone for event reminders
 * Stores in discordUserSettings keyed by Discord user ID for easy lookup.
 */
import { getFirestore } from '../firebase/config.js';

export async function handleMyTimezoneSlash(interaction) {
  const tz = interaction.options.getString('timezone')?.trim();
  if (!tz) {
    await interaction.reply({ content: 'Please provide a timezone (e.g. America/New_York).', ephemeral: true });
    return;
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz }).format(new Date());
  } catch (_) {
    await interaction.reply({ content: `Invalid timezone: "${tz}". Use IANA format (e.g. America/New_York, Europe/London).`, ephemeral: true });
    return;
  }

  const db = getFirestore();
  if (!db) {
    await interaction.reply({ content: 'Database unavailable. Try again later.', ephemeral: true });
    return;
  }

  const discordUserId = interaction.user.id;
  const settingsRef = db.collection('discordUserSettings').doc(discordUserId);

  await settingsRef.set({ timezone: tz, updatedAt: new Date() }, { merge: true });

  await interaction.reply({
    content: `Timezone set to **${tz}**. Event reminders will show times in your timezone.`,
    ephemeral: true
  });
}
