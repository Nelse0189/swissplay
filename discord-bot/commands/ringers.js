import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { getFirestore } from '../firebase/config.js';
import { getTeamByManagerDiscordId, getManagerTeams } from '../utils/firebase-helpers.js';

const WEBSITE_URL = process.env.WEBSITE_URL || 'https://solaris-cd166.web.app';

/**
 * Handle /find-ringers - Managers browse ringers (LFR) from Firestore
 */
export async function handleFindRingersSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const roleFilter = interaction.options.getString('role') || null;
  const regionFilter = interaction.options.getString('region') || null;
  const minSr = interaction.options.getInteger('min_sr');

  const db = getFirestore();

  try {
    const snapshot = await db.collection('ringers').get();
    let ringers = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((r) => r.status !== 'signed');

    if (roleFilter) {
      ringers = ringers.filter(
        (r) =>
          (r.preferredRoles || []).includes(roleFilter) ||
          (r.preferredRoles || []).includes('Flex')
      );
    }
    if (regionFilter) {
      ringers = ringers.filter((r) => r.region === regionFilter);
    }
    if (minSr != null && minSr > 0) {
      ringers = ringers.filter((r) => (r.sr || 0) >= minSr);
    }

    ringers.sort((a, b) => {
      const aTime = a.updatedAt?.toMillis?.() || 0;
      const bTime = b.updatedAt?.toMillis?.() || 0;
      return bTime - aTime;
    });

    const displayCount = Math.min(ringers.length, 10);

    if (ringers.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('No Ringers Found')
        .setDescription(
          'No ringers match your filters. ' +
          `Try browsing on the website: ${WEBSITE_URL}/ringers`
        );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle(`🔔 Ringers - LFR (${displayCount} of ${ringers.length})`)
      .setDescription(
        `Browse all ringers: ${WEBSITE_URL}/ringers\n` +
        (roleFilter || regionFilter || minSr ? `Filters: ${[roleFilter, regionFilter, minSr ? `SR≥${minSr}` : null].filter(Boolean).join(', ')}` : '')
      );

    for (let i = 0; i < displayCount; i++) {
      const r = ringers[i];
      const roles = (r.preferredRoles || []).join(', ') || 'Flex';
      const meta = [r.sr ? `${r.sr} SR` : null, r.region].filter(Boolean).join(' · ');
      const bio = r.bio ? (r.bio.length > 80 ? r.bio.slice(0, 77) + '...' : r.bio) : '—';
      embed.addFields({
        name: `${r.displayName || 'Unknown'} — ${roles}`,
        value: `${meta || '—'}\n${bio}\n[View Profile](${WEBSITE_URL}/profile/${r.uid})`,
        inline: false,
      });
    }

    if (ringers.length > 10) {
      embed.setFooter({
        text: `Showing 10 of ${ringers.length} — Browse all on the website`,
      });
    }

    const managerTeams = await getManagerTeams(interaction.user.id);
    const components = [];

    if (managerTeams.length > 0 && ringers.length > 0) {
      const options = ringers.slice(0, 25).map((r) => ({
        label: `${(r.displayName || 'Unknown').substring(0, 80)}`,
        value: r.uid || r.id,
        description: (r.preferredRoles || []).join(', ') || 'Flex',
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('invite_ringer_select')
        .setPlaceholder('Invite a ringer to your team...')
        .addOptions(options);
      components.push(new ActionRowBuilder().addComponents(selectMenu));
    }

    await interaction.editReply({ embeds: [embed], components });
  } catch (error) {
    console.error('Error fetching ringers:', error);
    await interaction.editReply({
      content: `❌ Failed to load ringers: ${error.message}`,
      ephemeral: true,
    });
  }
}

/**
 * Handle invite_ringer_select - show team selection
 */
export async function handleInviteRingerSelect(interaction) {
  const ringerUid = interaction.values?.[0];
  if (!ringerUid) return false;

  const { getManagerTeams } = await import('../utils/firebase-helpers.js');
  const managerTeams = await getManagerTeams(interaction.user.id);
  if (managerTeams.length === 0) {
    await interaction.update({ content: '❌ No teams found.', components: [] });
    return true;
  }

  const options = managerTeams.slice(0, 25).map((t) => ({
    label: t.name,
    value: t.id,
    description: t.region || '',
  }));
  const select = new StringSelectMenuBuilder()
    .setCustomId(`invite_ringer_team_${ringerUid}`)
    .setPlaceholder('Select team to invite to...')
    .addOptions(options);
  await interaction.update({
    content: 'Select a team to invite this ringer to:',
    embeds: [],
    components: [new ActionRowBuilder().addComponents(select)],
  });
  return true;
}

/**
 * Handle invite_ringer_team_X - create lft_invite notification (same as LFT)
 */
export async function handleInviteRingerTeamSelect(interaction, customId) {
  if (!customId.startsWith('invite_ringer_team_')) return false;
  const ringerUid = customId.replace('invite_ringer_team_', '');
  const teamId = interaction.values?.[0];
  if (!teamId) return false;

  const db = getFirestore();
  const { getManagerTeams, getUserByDiscordId } = await import('../utils/firebase-helpers.js');
  const managerData = await getUserByDiscordId(interaction.user.id);
  const managerTeams = await getManagerTeams(interaction.user.id);
  const team = managerTeams.find((t) => t.id === teamId);
  if (!team || !managerData) {
    await interaction.update({ content: '❌ Team or manager not found.', components: [] });
    return true;
  }

  await db.collection('notifications').add({
    userId: ringerUid,
    type: 'lft_invite',
    title: 'Team Invitation',
    message: `${team.name} has invited you to join their team as a ringer!`,
    actionData: {
      teamId: team.id,
      teamName: team.name,
      managerId: managerData.uid,
      managerName: managerData.displayName || managerData.username || interaction.user.username,
    },
    read: false,
    createdAt: new Date(),
  });

  await interaction.update({
    content: `✅ Invite sent to **${team.name}**! They will receive a notification.`,
    components: [],
  });
  return true;
}
