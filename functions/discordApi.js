/**
 * Discord REST API helpers for Firebase Functions (no gateway/client)
 */

const DISCORD_API = 'https://discord.com/api/v10';

export async function discordFetch(path, options = {}) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN not set');
  
  const url = path.startsWith('http') ? path : `${DISCORD_API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bot ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord API ${res.status}: ${text}`);
  }
  
  if (res.status === 204) return null;
  return res.json();
}

/** Create DM channel with user */
export async function createDM(userId) {
  const channel = await discordFetch('/users/@me/channels', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: userId }),
  });
  return channel;
}

/** Send message to channel (DM or guild) */
export async function sendMessage(channelId, payload) {
  return discordFetch(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Send DM to user */
export async function sendDM(userId, payload) {
  const channel = await createDM(userId);
  return sendMessage(channel.id, payload);
}

/** Search guild members by username (REST API). Requires Server Members Intent. */
export async function searchGuildMembers(guildId, query, limit = 10) {
  const encoded = encodeURIComponent(query);
  const members = await discordFetch(`/guilds/${guildId}/members/search?query=${encoded}&limit=${limit}`);
  return Array.isArray(members) ? members : [];
}

/** Interaction webhook - for follow-up messages after initial response */
export async function interactionFollowUp(applicationId, token, payload) {
  return discordFetch(`/webhooks/${applicationId}/${token}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Interaction webhook - edit original response */
export async function interactionEditReply(applicationId, token, payload) {
  return discordFetch(`/webhooks/${applicationId}/${token}/messages/@original`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** Convert Discord.js ActionRow/Button to API format */
export function componentsToApi(rows) {
  if (!rows?.length) return undefined;
  return rows.map(row => {
    const comps = row.components || row;
    return {
      type: 1,
      components: (Array.isArray(comps) ? comps : [comps]).map(c => {
        const d = c.data ?? c;
        return {
          type: d.type ?? 2,
          style: d.style ?? 1,
          label: d.label,
          custom_id: d.custom_id,
          emoji: d.emoji,
        };
      }).filter(c => c.custom_id || c.url)
    };
  });
}

/** Convert Discord.js-style embed to API format */
export function embedToApi(embed) {
  if (!embed) return undefined;
  const data = embed.data ?? embed;
  const out = {};
  if (data.title) out.title = data.title;
  if (data.description) out.description = data.description;
  if (data.color != null) out.color = data.color;
  if (data.fields?.length) out.fields = data.fields;
  if (data.footer) out.footer = { text: data.footer.text };
  return out;
}
