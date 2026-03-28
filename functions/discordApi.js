/**
 * Discord REST API helpers for Firebase Functions (no gateway/client)
 */

const DISCORD_API = 'https://discord.com/api/v10';

export async function discordFetch(path, options = {}) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN not set');
  
  const url = path.startsWith('http') ? path : `${DISCORD_API}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // cold starts + Firestore can delay webhook edits
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Discord API ${res.status}: ${text}`);
    }
    if (res.status === 204) return null;
    return res.json();
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error(`Discord API timeout: ${url}`);
    throw err;
  }
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

/** Bot adds a unicode/custom reaction to a message (emoji URL-encoded, e.g. 1️⃣) */
export async function addReaction(channelId, messageId, emoji) {
  const enc = encodeURIComponent(emoji);
  return discordFetch(`/channels/${channelId}/messages/${messageId}/reactions/${enc}/@me`, {
    method: 'PUT',
  });
}

/** All users who reacted with this emoji (paginated). */
export async function listReactionUsers(channelId, messageId, emoji) {
  const enc = encodeURIComponent(emoji);
  const out = [];
  let after;
  for (;;) {
    const qs = after ? `?limit=100&after=${after}` : '?limit=100';
    const batch = await discordFetch(
      `/channels/${channelId}/messages/${messageId}/reactions/${enc}${qs}`
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 100) break;
    after = batch[batch.length - 1].id;
  }
  return out;
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

/** Create a scheduled event in a guild (appears in the server's Events tab) — external / "Somewhere else" */
export async function createScheduledEvent(guildId, { name, description, startTime, endTime, location }) {
  return discordFetch(`/guilds/${guildId}/scheduled-events`, {
    method: 'POST',
    body: JSON.stringify({
      entity_type: 3, // EXTERNAL
      privacy_level: 2, // GUILD_ONLY
      name: name.substring(0, 100),
      description: description ? description.substring(0, 1000) : undefined,
      scheduled_start_time: startTime instanceof Date ? startTime.toISOString() : startTime,
      scheduled_end_time: endTime instanceof Date ? endTime.toISOString() : endTime,
      entity_metadata: { location: (location || name).substring(0, 100) },
    }),
  });
}

/** Voice channel scheduled event */
export async function createVoiceScheduledEvent(guildId, { name, description, startTime, endTime, channelId }) {
  return discordFetch(`/guilds/${guildId}/scheduled-events`, {
    method: 'POST',
    body: JSON.stringify({
      entity_type: 2, // VOICE
      privacy_level: 2,
      channel_id: channelId,
      name: name.substring(0, 100),
      description: description ? description.substring(0, 1000) : undefined,
      scheduled_start_time: startTime instanceof Date ? startTime.toISOString() : startTime,
      scheduled_end_time: endTime instanceof Date ? endTime.toISOString() : endTime,
    }),
  });
}

/** Convert Discord.js ActionRow/Button to API format (for Link buttons, use custom_id: undefined and url) */
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

/** Update a scheduled event in a guild */
export async function updateScheduledEvent(guildId, eventId, data) {
  return discordFetch(`/guilds/${guildId}/scheduled-events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/** Start a scheduled event (set status to ACTIVE=2) */
export async function startScheduledEvent(guildId, eventId) {
  return updateScheduledEvent(guildId, eventId, { status: 2 });
}

/** End/complete a scheduled event (set status to COMPLETED=3) */
export async function endScheduledEvent(guildId, eventId) {
  return updateScheduledEvent(guildId, eventId, { status: 3 });
}

/** List scheduled events in a guild */
export async function getScheduledEvents(guildId) {
  return discordFetch(`/guilds/${guildId}/scheduled-events`);
}

/** Delete a scheduled event */
export async function deleteScheduledEvent(guildId, eventId) {
  return discordFetch(`/guilds/${guildId}/scheduled-events/${eventId}`, {
    method: 'DELETE',
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
