import { contextBridge, ipcRenderer } from 'electron';
import type { Bridge } from '../shared/model';
const invoke = async (method: string, arg?: unknown) => {
  const response = await ipcRenderer.invoke('watchlog:' + method, arg);
  if (!response.ok) throw new Error(response.error);
  return response.value;
};
const bridge: Bridge = {
  state: () => invoke('state'),
  save: (data) => invoke('save', data),
  remove: (data) => invoke('remove', data),
  discover: (data) => invoke('discover', data),
  details: (data) => invoke('details', data),
  season: (data) => invoke('season', data),
  episodes: (data) => invoke('episodes', data),
  preferences: (data) => invoke('preferences', data),
  credentials: (data) => invoke('credentials', data),
  transfer: (data) => invoke('transfer', data),
  external: (data) => invoke('external', data),
};
contextBridge.exposeInMainWorld('watchlog', bridge);
