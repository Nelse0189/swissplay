/**
 * Adapts raw Discord interaction payload to a Discord.js-like interface
 * so existing handlers can work with Firebase Functions (HTTP-only)
 */

import * as discordApi from './discordApi.js';

export function createInteractionAdapter(body) {
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
    
    _response: null,
    
    async deferReply({ ephemeral = false } = {}) {
      if (adapter.replied || adapter.deferred) return;
      adapter.deferred = true;
      adapter._response = { type: 5, data: { flags: ephemeral ? 64 : 0 } };
      return adapter._response;
    },
    
    async reply({ content, embeds, components, ephemeral = false }) {
      if (adapter.replied || adapter.deferred) return;
      adapter.replied = true;
      const data = { content: content || undefined };
      if (embeds?.length) data.embeds = embeds.map(e => discordApi.embedToApi(e));
      if (components?.length) data.components = components;
      if (ephemeral) data.flags = 64;
      adapter._response = { type: 4, data };
      return adapter._response;
    },
    
    async update({ content, components = [] }) {
      if (adapter.replied || adapter.deferred) return;
      adapter.replied = true;
      adapter._response = { type: 7, data: { content: content || undefined, components } };
      return adapter._response;
    },
    
    async followUp({ content, embeds, components, ephemeral = false }) {
      const payload = { content: content || undefined };
      if (embeds?.length) payload.embeds = embeds.map(e => discordApi.embedToApi(e));
      if (components?.length) payload.components = components;
      if (ephemeral) payload.flags = 64;
      return discordApi.interactionFollowUp(application_id, token, payload);
    },
    
    async editReply({ content, embeds, components }) {
      const payload = {};
      if (content !== undefined) payload.content = content;
      if (embeds?.length) payload.embeds = embeds.map(e => discordApi.embedToApi(e));
      if (components !== undefined) payload.components = components;
      return discordApi.interactionEditReply(application_id, token, payload);
    },
  };
  
  return adapter;
}
