/**
 * Adapts raw Discord interaction payload to a Discord.js-like interface
 * so existing handlers can work with Firebase Functions (HTTP-only)
 */

import * as discordApi from './discordApi.js';

/** SUB_COMMAND / SUB_COMMAND_GROUP wrap leaf options; Discord.js resolves them flat. */
function flattenSlashOptions(options) {
  if (!options?.length) return [];
  const out = [];
  for (const opt of options) {
    if (opt.type === 1 || opt.type === 2) {
      out.push(...flattenSlashOptions(opt.options));
    } else {
      out.push(opt);
    }
  }
  return out;
}

function findFocusedOption(options) {
  if (!options || !Array.isArray(options)) return null;
  for (const opt of options) {
    if (opt.focused) {
      return {
        name: opt.name,
        value: opt.value != null ? String(opt.value) : '',
        type: opt.type,
      };
    }
    if (opt.options?.length) {
      const inner = findFocusedOption(opt.options);
      if (inner) return inner;
    }
  }
  return null;
}

export function createInteractionAdapter(body, sendResponse) {
  const { id, application_id, token, type, data, guild_id, channel_id, member } = body;
  const user = member?.user || body.user;
  
  const adapter = {
    type,
    data,
    id,
    token,
    applicationId: application_id,
    guildId: guild_id,
    channelId: channel_id,
    deferred: false,
    replied: false,
    
    get user() {
      return {
        id: user?.id,
        username: user?.username,
        globalName: user?.global_name || user?.username,
        ...user,
      };
    },
    
    get guild() {
      return guild_id ? { id: guild_id } : null;
    },
    
    get channel() {
      return { id: channel_id, type: 0 };
    },
    
    get message() {
      return body.message;
    },
    
    get options() {
      const opts = flattenSlashOptions(data?.options || []);
      return {
        getUser: (name) => {
          const opt = opts.find(o => o.name === name);
          if (!opt || opt.type !== 6) return null;
          const resolved = data?.resolved?.users?.[opt.value];
          return resolved ? { id: opt.value, username: resolved.username, globalName: resolved.global_name || resolved.username, ...resolved } : { id: opt.value, username: 'Unknown' };
        },
        getString: (name) => {
          const v = opts.find(o => o.name === name)?.value;
          if (v == null) return null;
          return typeof v === 'string' ? v : String(v);
        },
        getInteger: (name) => {
          const opt = opts.find(o => o.name === name);
          if (!opt || opt.type !== 4) return null;
          return opt.value ?? null;
        },
        getBoolean: (name) => {
          const opt = opts.find(o => o.name === name);
          if (!opt || opt.type !== 5) return null;
          return opt.value ?? null;
        },
        getAttachment: (name) => {
          const opt = opts.find(o => o.name === name);
          if (!opt) return null;
          const resolved = data?.resolved?.attachments?.[opt.value];
          return resolved ? { id: opt.value, url: resolved.url, filename: resolved.filename } : null;
        },
        getChannel: (name) => {
          const opt = opts.find(o => o.name === name);
          if (!opt || opt.type !== 7) return null;
          const resolved = data?.resolved?.channels?.[opt.value];
          return resolved ? { id: opt.value, name: resolved.name, type: resolved.type, ...resolved } : { id: opt.value };
        },
      };
    },
    
    get commandName() {
      return data?.name;
    },
    
    isChatInputCommand: () => type === 2,
    isAutocomplete: () => type === 4,
    isStringSelectMenu: () => type === 3 && data?.component_type === 3,
    isButton: () => type === 3 && data?.component_type === 2,

    getFocusedOption() {
      return findFocusedOption(data?.options);
    },
    
    get customId() {
      return data?.custom_id;
    },
    
    get values() {
      return data?.values || [];
    },

    /** Get text input value from modal submit (type 5). Pass the custom_id of the text input. */
    getModalValue(inputCustomId) {
      if (type !== 5 || !data?.components) return null;
      for (const row of data.components) {
        const comps = row.components || [];
        for (const c of comps) {
          if (c.type === 4 && c.custom_id === inputCustomId) return c.value ?? null;
        }
      }
      return null;
    },
    
    _response: null,
    
    async deferReply({ ephemeral = false } = {}) {
      if (adapter.replied || adapter.deferred) return;
      adapter.deferred = true;
      adapter.replied = true; // We're "responding" with the deferred ack
      adapter._ephemeral = ephemeral;
      const deferredPayload = { type: 5, data: ephemeral ? { flags: 64 } : {} };
      adapter._response = deferredPayload;
      if (sendResponse) sendResponse(deferredPayload);
    },

    /** Slash command autocomplete (interaction type 4). Max 25 choices; name/value max 100 chars each. */
    respondAutocomplete(choices) {
      if (adapter.replied) return;
      adapter.replied = true;
      const safe = (choices || []).slice(0, 25).map((c) => ({
        name: String(c.name != null ? c.name : 'Choice').slice(0, 100),
        value: String(c.value != null ? c.value : '').slice(0, 100),
      }));
      adapter._response = { type: 8, data: { choices: safe } };
      if (sendResponse) sendResponse(adapter._response);
    },

    /** Acknowledge component interaction without changing the message (type 6). */
    async deferUpdate() {
      if (adapter.replied || adapter.deferred) return;
      adapter.deferred = true;
      adapter.deferredUpdate = true;
      adapter.replied = true;
      adapter._response = { type: 6 };
      if (sendResponse) sendResponse(adapter._response);
    },

    /** Show a modal (type 9). Must be the first response to the interaction. */
    async showModal({ customId, title, components }) {
      if (adapter.replied || adapter.deferred) return;
      adapter.replied = true;
      adapter._response = {
        type: 9,
        data: {
          custom_id: customId,
          title: title || 'Form',
          components: components || [],
        },
      };
      if (sendResponse) sendResponse(adapter._response);
      return adapter._response;
    },
    
    async reply({ content, embeds, components, ephemeral = false }) {
      if (adapter.replied || adapter.deferred) {
        return adapter.followUp({ content, embeds, components, ephemeral });
      }
      adapter.replied = true;
      const data = { content: content || undefined };
      if (embeds?.length) data.embeds = embeds.map(e => discordApi.embedToApi(e));
      if (components?.length) data.components = components;
      if (ephemeral) data.flags = 64;
      adapter._response = { type: 4, data };
      if (sendResponse) sendResponse(adapter._response);
      return adapter._response;
    },
    
    async update({ content, components = [] }) {
      if (adapter.replied || adapter.deferred) return;
      adapter.replied = true;
      adapter._response = { type: 7, data: { content: content || undefined, components } };
      if (sendResponse) sendResponse(adapter._response);
      return adapter._response;
    },
    
    async followUp({ content, embeds, components, ephemeral = false }) {
      const payload = { content: content || undefined };
      if (embeds?.length) payload.embeds = embeds.map(e => discordApi.embedToApi(e));
      if (components?.length) payload.components = components;
      if (ephemeral && !adapter.deferred) payload.flags = 64;
      // Deferred slash reply: edit the "thinking" / deferred message
      if (adapter.deferred && !adapter.deferredUpdate) {
        await discordApi.interactionEditReply(application_id, token, payload);
        return;
      }
      // deferUpdate, reply(), or update() already consumed the single HTTP response — use webhook
      if (adapter.replied) {
        await discordApi.interactionFollowUp(application_id, token, payload);
        return;
      }
      if (sendResponse) {
        sendResponse({ type: 4, data: payload });
        return;
      }
      return discordApi.interactionFollowUp(application_id, token, payload);
    },
    
    async editReply({ content, embeds, components }) {
      const payload = {};
      if (content !== undefined) payload.content = content;
      if (embeds?.length) payload.embeds = embeds.map(e => discordApi.embedToApi(e));
      if (components !== undefined) payload.components = components;
      // After deferReply or deferUpdate, we must use the webhook to edit
      if (adapter.deferred) {
        return discordApi.interactionEditReply(application_id, token, payload);
      }
      if (sendResponse) {
        sendResponse({ type: 4, data: payload });
        return;
      }
      return discordApi.interactionEditReply(application_id, token, payload);
    },
  };
  
  return adapter;
}
