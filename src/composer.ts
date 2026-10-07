import Konva from 'konva';
import { h, go, back, topBar, stepsBar, photoPicker, compareView, toast, busy, type Screen } from './ui';
import { listItems, getItem, saveProject, uid, type Item, type Project, type PlacedItem } from './db';
import { loadCanvas, loadImage, toBlob } from './img';
import { addItemFlow, pickPhotoOverlay, libraryScreen } from './library';
import { summaryScreen } from './summary';

export function composerScreen(project?: Project): Screen {
  const root = h('div', { class: 'screen' });
  let step = 1;
  let roomBlob: Blob | undefined = project?.source;
  let resultBlob: Blob | undefined = project?.result;
  let proj = project;
  let placed: PlacedItem[] = project?.placed ? structuredClone(project.placed) : [];
  let magic = project?.magicBlend ?? false;
  let stageW0 = project?.stageW ?? 0;
  let stage: Konva.Stage | undefined;
  const urls: string[] = [];
  const imgs = new Map<string, HTMLImageElement>();
  const itemNames = new Map<string, string>();

  const header = (t: string, n: number, onBack?: () => void) => [topBar(t, onBack), stepsBar(n, 3)];

  async function imgFor(it: Item) {
    let i = imgs.get(it.id);
    if (!i) { const u = URL.createObjectURL(it.transparent); urls.push(u); i = await loadImage(u); imgs.set(it.id, i); }
    itemNames.set(it.id, it.name);
    return i;
  }

  function render() {
    stage?.destroy(); stage = undefined;
    root.replaceChildren();
    if (step === 1) {
      root.append(...header('แต่งห้อง', 1), h('div', { class: 'hint' }, '1 ใส่รูปห้อง'),
        h('div', { class: 'content' }, photoPicker((f) => { roomBlob = f; placed = []; stageW0 = 0; step = 2; render(); })));
    } else if (step === 2) stepPlace(); else stepResult();
  }

  async function stepPlace() {
    const roomCanvas = await loadCanvas(roomBlob!, 1400);
    const holder = h('div', { class: 'canvas-wrap', style: { touchAction: 'none' } });
    const strip = h('div', { class: 'strip' });
    const actions = h('div', { class: 'row' });
    const nextBtn = h('button', { class: 'btn primary', onClick: async () => { await busy('กำลังทำภาพ...', buildResult); step = 3; render(); } }, 'ดูผลลัพธ์ →');
    root.append(...header('วางของในห้อง', 2, () => { step = 1; render(); }),
      h('div', { class: 'hint' }, '2 แตะของ แล้วลากวาง'),
      h('div', { class: 'content' }, holder, actions, strip), h('div', { class: 'bottom' }, nextBtn));

    const width = holder.clientWidth || 358;
    const height = Math.round(width * roomCanvas.height / roomCanvas.width);
    holder.style.height = height + 'px';
    const st = new Konva.Stage({ container: holder as HTMLDivElement, width, height });
    stage = st;
    const layer = new Konva.Layer(); st.add(layer);
    const bg = new Konva.Image({ image: roomCanvas, width, height, listening: true }); layer.add(bg);
    const tr = new Konva.Transformer({
      rotateEnabled: true, keepRatio: true, enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      anchorSize: 28, anchorCornerRadius: 14, rotateAnchorOffset: 34, borderStroke: '#e0642b', anchorStroke: '#e0642b', borderStrokeWidth: 2,
      boundBoxFunc: (o, n) => (n.width < 24 ? o : n),
    });
    layer.add(tr);

    // average room brightness for "magic blend"
    const s = document.createElement('canvas'); s.width = 16; s.height = 16;
    s.getContext('2d')!.drawImage(roomCanvas, 0, 0, 16, 16);
    const sd = s.getContext('2d')!.getImageData(0, 0, 16, 16).data;
    let roomL = 0; for (let i = 0; i < sd.length; i += 4) roomL += 0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2];
    roomL /= 256;

    const itemNodes = () => layer.getChildren((n) => n.getAttr('itemId')) as Konva.Image[];
    let selected: Konva.Image | null = null;

    const lumOf = (img: HTMLImageElement) => {
      const c = document.createElement('canvas'); c.width = 24; c.height = 24;
      const x = c.getContext('2d')!; x.drawImage(img, 0, 0, 24, 24);
      const d = x.getImageData(0, 0, 24, 24).data; let l = 0, a = 0;
      for (let i = 0; i < d.length; i += 4) { l += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * d[i + 3]; a += d[i + 3]; }
      return a ? l / a : 128;
    };
    const applyBlend = (n: Konva.Image) => {
      if (magic) {
        const il = lumOf(n.image() as HTMLImageElement);
        const b = Math.max(-0.25, Math.min(0.25, (roomL - il) / 255 * 0.6));
        n.cache(); n.filters([Konva.Filters.Brighten]); n.brightness(b);
        n.shadowColor('#000'); n.shadowBlur(22); n.shadowOpacity(0.38); n.shadowOffset({ x: 6, y: 10 });
      } else { n.clearCache(); n.filters([]); n.shadowOpacity(0); }
    };

    const select = (n: Konva.Image | null) => { selected = n; tr.nodes(n ? [n] : []); renderActions(); layer.batchDraw(); };

    async function addNode(it: Item, a?: PlacedItem) {
      const img = await imgFor(it);
      const f = a ? width / (stageW0 || width) : 1;
      const w0 = width * 0.38, sc = w0 / img.width;
      const n = new Konva.Image({
        image: img, itemId: it.id, draggable: true, width: img.width, height: img.height,
        offsetX: img.width / 2, offsetY: img.height / 2,
        x: a ? a.x * f : width / 2, y: a ? a.y * f : height / 2,
        scaleX: a ? a.scaleX * f : sc, scaleY: a ? a.scaleY * f : sc, rotation: a?.rotation ?? 0,
      });
      n.on('pointerdown tap click', (e) => { e.cancelBubble = true; select(n); });
      n.on('dragstart', () => select(n));
      layer.add(n); tr.moveToTop(); applyBlend(n);
      if (!a) select(n);
      layer.batchDraw();
      return n;
    }

    st.on('pointerdown', (e) => { if (e.target === bg) select(null); });

    // two-finger pinch + rotate on the selected item
    let g: { d: number; a: number; sx: number; sy: number; r: number } | null = null;
    st.on('touchmove', (e) => {
      const t = e.evt.touches; if (t.length !== 2 || !selected) return;
      e.evt.preventDefault();
      const dx = t[1].clientX - t[0].clientX, dy = t[1].clientY - t[0].clientY;
      const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx) * 180 / Math.PI;
      selected.draggable(false);
      if (!g) { g = { d, a, sx: selected.scaleX(), sy: selected.scaleY(), r: selected.rotation() }; return; }
      const k = d / g.d;
      selected.scale({ x: g.sx * k, y: g.sy * k }); selected.rotation(g.r + (a - g.a));
      tr.forceUpdate(); layer.batchDraw();
    });
    st.on('touchend', () => { g = null; selected?.draggable(true); });

    function renderActions() {
      actions.replaceChildren();
      if (!selected) { actions.append(h('div', { class: 'seg', style: { padding: '0' } }, h('button', { class: magic ? 'on' : '', onClick: toggleMagic }, '✨ ปรับแสงให้กลมกลืน ' + (magic ? 'เปิด' : 'ปิด')))); return; }
      actions.append(
        h('button', { class: 'tool', onClick: async () => {
          const src = selected!; const it = await getItem(src.getAttr('itemId')); if (!it) return;
          const c = await addNode(it, { itemId: it.id, x: (src.x() + 24) * (stageW0 || width) / width, y: (src.y() + 24) * (stageW0 || width) / width, scaleX: src.scaleX() * (stageW0 || width) / width, scaleY: src.scaleY() * (stageW0 || width) / width, rotation: src.rotation() });
          select(c);
        } }, '📄 ก๊อปปี้'),
        h('button', { class: 'tool', onClick: () => { selected!.destroy(); select(null); } }, '🗑️ ลบ'),
        h('button', { class: 'tool' + (magic ? ' on' : ''), style: magic ? { background: '#ffe3d3' } : {}, onClick: toggleMagic }, '✨ ปรับแสง'));
    }
    function toggleMagic() { magic = !magic; itemNodes().forEach(applyBlend); renderActions(); layer.batchDraw(); toast(magic ? 'ปรับแสงและเงาให้แล้ว' : 'ปิดการปรับแสง'); }

    async function renderStrip() {
      strip.replaceChildren(h('button', { class: 't add', onClick: async () => {
        const f = await pickPhotoOverlay(); if (!f) return; const it = await addItemFlow(f); if (it) { await renderStrip(); addNode(it); }
      } }, '+'));
      const items = await listItems();
      items.forEach((it) => { const u = URL.createObjectURL(it.transparent); urls.push(u); itemNames.set(it.id, it.name);
        strip.append(h('button', { class: 't', onClick: () => addNode(it) }, h('img', { src: u }))); });
      if (!items.length) strip.append(h('div', { class: 'empty', style: { padding: '14px 4px', fontSize: '15px' } }, 'กด + เพื่อถ่ายรูปของเข้าคลัง'));
    }

    async function buildResult() {
      tr.nodes([]); layer.draw();
      const out = await toBlob(st.toCanvas({ pixelRatio: Math.min(3, 1280 / width) }) as HTMLCanvasElement);
      resultBlob = out;
      placed = itemNodes().map((n) => ({ itemId: n.getAttr('itemId'), x: n.x(), y: n.y(), scaleX: n.scaleX(), scaleY: n.scaleY(), rotation: n.rotation() }));
      stageW0 = width;
    }

    renderActions();
    await renderStrip();
    for (const a of placed) { const it = await getItem(a.itemId); if (it) await addNode(it, a); }
    stageW0 = width; placed = [];
  }

  function stepResult() {
    const bu = URL.createObjectURL(roomBlob!), au = URL.createObjectURL(resultBlob!);
    urls.push(bu, au);
    const build = (): Project => ({
      id: proj?.id ?? uid(), name: proj?.name ?? `แต่งห้อง ${new Date().toLocaleDateString('th-TH')}`, mode: 'room',
      created: proj?.created ?? Date.now(), updated: Date.now(), source: roomBlob!, result: resultBlob!,
      colors: [], items: [...new Set(placed.map((p) => p.itemId))], placed, magicBlend: magic, stageW: stageW0,
    });
    const save = async () => { proj = build(); await saveProject(proj); toast('บันทึกแล้ว ✓'); return proj; };
    root.append(...header('ผลลัพธ์', 3, () => { step = 2; render(); }),
      h('div', { class: 'hint' }, '3 ลากดูก่อน/หลัง'),
      h('div', { class: 'content' }, compareView(bu, au),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onClick: () => { step = 2; render(); } }, '✏️ แก้ไข'),
          h('button', { class: 'btn', onClick: save }, '💾 บันทึก'))),
      h('div', { class: 'bottom' }, h('button', { class: 'btn primary', onClick: async () => { const p = await save(); go(() => summaryScreen(p)); } }, 'สรุปงาน / ส่งต่อ →')));
  }

  if (project) { placed = project.placed ?? []; step = 3; }
  render();
  return { el: root, destroy: () => { stage?.destroy(); urls.forEach(URL.revokeObjectURL); } };
}

void back; void libraryScreen;
