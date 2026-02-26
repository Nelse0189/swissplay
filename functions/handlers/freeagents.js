import admin from 'firebase-admin';
import { EmbedBuilder } from 'discord.js';

const WEBSITE_URL = process.env.WEBSITE_URL || 'https://solaris-cd166.web.app';

function getFirestore() {
  return admin.firestore();
}

export async function handleFindFreeAgentsSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const db = getFirestore();
  const roleFilter = interaction.options.getString('role') || null;
  const regionFilter = interaction.options.getString('region') || null;
  const minSr = interaction.options.getInteger('min_sr');
  try {
    const snapshot = await db.collection('freeAgents').get();
    let agents = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(a => a.status !== 'signed');
    if (roleFilter) {
      agents = agents.filter(a =>
        (a.preferredRoles || []).includes(roleFilter) || (a.preferredRoles || []).includes('Flex')
      );
    }
    if (regionFilter) agents = agents.filter(a => a.region === regionFilter);
    if (minSr != null && minSr > 0) agents = agents.filter(a => (a.sr || 0) >= minSr);
    agents.sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
    const displayCount = Math.min(agents.length, 10);
    if (agents.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('No Free Agents Found')
        .setDescription(`No free agents match your filters. Try: ${WEBSITE_URL}/free-agents`);
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle(`🏃 Free Agents (${displayCount} of ${agents.length})`)
      .setDescription(
        `Browse all: ${WEBSITE_URL}/free-agents\n` +
        (roleFilter || regionFilter || minSr ? `Filters: ${[roleFilter, regionFilter, minSr ? `SR≥${minSr}` : null].filter(Boolean).join(', ')}` : '')
      );
    for (let i = 0; i < displayCount; i++) {
      const a = agents[i];
      const roles = (a.preferredRoles || []).join(', ') || 'Flex';
      const meta = [a.sr ? `${a.sr} SR` : null, a.region].filter(Boolean).join(' · ');
      const bio = a.bio ? (a.bio.length > 80 ? a.bio.slice(0, 77) + '...' : a.bio) : '—';
      embed.addFields({
        name: `${a.displayName || 'Unknown'} — ${roles}`,
        value: `${meta || '—'}\n${bio}\n[View Profile](${WEBSITE_URL}/profile/${a.uid})`,
        inline: false
      });
    }
    if (agents.length > 10) embed.setFooter({ text: `Showing 10 of ${agents.length} — Browse all on the website` });
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error fetching free agents:', error);
    await interaction.editReply({ content: `❌ Failed to load free agents: ${error.message}`, ephemeral: true });
  }
}
