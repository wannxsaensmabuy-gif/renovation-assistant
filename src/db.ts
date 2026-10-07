import { openDB, type DBSchema } from 'idb';

export interface PaintArea { mask: ArrayBuffer; colorId: string; finish?: 'matt' | 'sheen' }
export interface PlacedItem { itemId: string; x: number; y: number; scaleX: number; scaleY: number; rotation: number }

export interface Project {
  id: string;
  name: string;
  mode: 'paint' | 'room';
  created: number;
  updated: number;
  source: Blob;
  result: Blob;
  colors: string[];          // palette ids
  items: string[];           // item ids
  areas?: PaintArea[];       // paint mode
  placed?: PlacedItem[];     // room mode canvas state (order = z-order)
  magicBlend?: boolean;
  stageW?: number;
}

export interface Item {
  id: string;
  name: string;
  original: Blob;
  transparent: Blob;
  w: number;
  h: number;
  created: number;
}

interface Schema extends DBSchema {
  projects: { key: string; value: Project; indexes: { updated: number } };
  items: { key: string; value: Item; indexes: { created: number } };
}

const dbp = openDB<Schema>('renovation-assistant', 1, {
  upgrade(db) {
    db.createObjectStore('projects', { keyPath: 'id' }).createIndex('updated', 'updated');
    db.createObjectStore('items', { keyPath: 'id' }).createIndex('created', 'created');
  },
});

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

export async function saveProject(p: Project) { p.updated = Date.now(); await (await dbp).put('projects', p); }
export async function getProject(id: string) { return (await dbp).get('projects', id); }
export async function deleteProject(id: string) { await (await dbp).delete('projects', id); }
export async function listProjects() { return (await (await dbp).getAllFromIndex('projects', 'updated')).reverse(); }

export async function saveItem(i: Item) { await (await dbp).put('items', i); }
export async function getItem(id: string) { return (await dbp).get('items', id); }
export async function deleteItem(id: string) { await (await dbp).delete('items', id); }
export async function listItems() { return (await (await dbp).getAllFromIndex('items', 'created')).reverse(); }
