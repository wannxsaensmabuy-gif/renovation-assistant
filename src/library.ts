import { h, back, topBar, photoPicker, toast, busy, ask, confirmBox, type Screen } from './ui';
import { listItems, saveItem, deleteItem, uid, type Item } from './db';
import { loadCanvas, toBlob, trimTransparent } from './img';

/** Cut the background out of a product photo (runs in the browser). */
export async function makeItem(file: File, setMsg: (m: string) => void): Promise<Item> {
  const original = file;
  let transparent: Blob;
  try {
    setMsg('กำลังตัดพื้นหลัง...\nครั้งแรกอาจใช้เวลาสักครู่');
    const { removeBackground } = await import('@imgly/background-removal');
    const small = await toBlob(await loadCanvas(file, 1024), 'image/png');
    transparent = await removeBackground(small, { model: 'isnet_quint8' });
  } catch (e) {
    console.error(e);
    toast('ตัดพื้นหลังไม่สำเร็จ ใช้รูปเดิมแทน');
    transparent = await toBlob(await loadCanvas(file, 1024), 'image/png');
  }
  const tc = document.createElement('canvas');
  const bmp = await createImageBitmap(transparent);
  tc.width = bmp.width; tc.height = bmp.height; tc.getContext('2d')!.drawImage(bmp, 0, 0);
  const trimmed = trimTransparent(tc);
  const png = await toBlob(trimmed, 'image/png');
  return { id: uid(), name: '', original, transparent: png, w: trimmed.width, h: trimmed.height, created: Date.now() };
}

export async function addItemFlow(file: File): Promise<Item | null> {
  const item = await busy('กำลังตัดพื้นหลัง...', (setMsg) => makeItem(file, setMsg));
  const n = (await listItems()).length + 1;
  const name = await ask('ตั้งชื่อของชิ้นนี้', `ของใหม่ ${n}`);
  if (name === null) return null;
  item.name = name;
  await saveItem(item);
  toast('เก็บเข้าคลังแล้ว ✓');
  return item;
}

export function pickPhotoOverlay(): Promise<File | null> {
  return new Promise((res) => {
    const o = h('div', { class: 'overlay' }, h('div', {}, 'เพิ่มรูปของ'),
      h('div', { style: { width: '100%' } }, photoPicker((f) => { o.remove(); res(f); })),
      h('button', { class: 'btn', style: { flex: 'none', width: '100%' }, onClick: () => { o.remove(); res(null); } }, 'ยกเลิก'));
    document.getElementById('app')!.append(o);
  });
}

export function libraryScreen(onPick?: (item: Item) => void): Screen {
  const root = h('div', { class: 'screen' });
  const urls: string[] = [];
  async function render() {
    urls.splice(0).forEach(URL.revokeObjectURL);
    const items = await listItems();
    const grid = items.length
      ? h('div', { class: 'grid' }, items.map((it) => {
        const u = URL.createObjectURL(it.transparent); urls.push(u);
        return h('div', { class: 'card', onClick: onPick ? () => { onPick(it); back(); } : undefined },
          h('img', { src: u }), h('b', {}, it.name),
          !onPick && h('button', { class: 'x', onClick: async (e: Event) => { e.stopPropagation(); if (await confirmBox(`ลบ "${it.name}" ?`)) { await deleteItem(it.id); render(); } } }, '🗑️'));
      }))
      : h('div', { class: 'empty' }, 'ยังไม่มีของในคลัง', h('br'), 'กดปุ่มด้านล่างเพื่อเพิ่ม');
    root.replaceChildren(topBar('คลังของฉัน'), h('div', { class: 'content' }, grid),
      h('div', { class: 'bottom' }, h('button', { class: 'btn primary', onClick: async () => {
        const f = await pickPhotoOverlay(); if (!f) return;
        const it = await addItemFlow(f); if (it) render();
      } }, '➕ เพิ่มของใหม่')));
  }
  render();
  return { el: root, destroy: () => urls.forEach(URL.revokeObjectURL) };
}
