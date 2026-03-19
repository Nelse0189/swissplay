/**
 * Adapts raw Discord interaction payload to a Discord.js-like interface
 * so existing handlers can work with Firebase Functions (HTTP-only)
 */

import * as discordApi from './discordApi.js';

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
      const opts = data?.options || [];
      return {
        getUser: (name) => {
          const opt = opts.find(o => o.name === name);
          if (!opt || opt.type !== 6) return null;
          const resolved = data?.resolved?.users?.[opt.value];
          return resolved ? { id: opt.value, username: resolved.username, globalName: resolved.global_name || resolved.username, ...resolved } : { id: opt.value, username: 'Unknown' };
        },
        getString: (name) => opts.find(o => o.name === name)?.value ?? null,
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
      };
    },
    
    get commandName() {
      return data?.name;
    },
    
    isChatInputCommand: () => type === 2,
    isStringSelectMenu: () => type === 3 && data?.component_type === 3,
    isButton: () => type === 3 && data?.component_type === 2,
    
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
      console.log('followUp called, deferred=', adapter.deferred, 'hasSendResponse=', !!sendResponse);
      const payload = { content: content || undefined };
      if (embeds?.length) payload.embeds = embeds.map(e => discordApi.embedToApi(e));
      if (components?.length) payload.components = components;
      if (ephemeral && !adapter.deferred) payload.flags = 64;
      // After deferReply, HTTP response was already sent - MUST use webhook to edit, not sendResponse
      if (adapter.deferred) {
        try {
          console.log('followUp: using webhook to edit deferred reply');
          await discordApi.interactionEditReply(application_id, token, payload);
        } catch (err) {
          console.error('followUp: webhook edit failed:', err.message);
          throw err;
        }
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
      // After deferReply, we must use the webhook to edit (can't send HTTP again)
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
