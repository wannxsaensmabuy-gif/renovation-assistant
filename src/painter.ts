import { h, back, go, replace, topBar, stepsBar, photoPicker, compareView, toast, busy, type Screen } from './ui';
import { PALETTE, GROUPS, colorById } from './palette';
import { loadCanvas, toBlob } from './img';
import { growFrom, paintDisc, recolor, emptyMask, maskCount, unionInto } from './engine';
import { saveProject, uid, type Project, type PaintArea } from './db';
import { summaryScreen } from './summary';

interface Area { mask: Uint8Array; colorId: string }

export function painterScreen(project?: Project): Screen {
  const root = h('div', { class: 'screen' });
  let step = 1;
  let base!: ImageData; let W = 0, H = 0;
  let areas: Area[] = [];
  let committed!: ImageData;
  let current = new Uint8Array(0);
  let undo: Uint8Array[] = [];
  let mode: 'tap' | 'add' | 'erase' = 'tap';
  let tol = 38; let brush = 14;
  let last: { x: number; y: number; before: Uint8Array } | null = null;
  let pendingColor: string | null = null;
  let proj: Project | undefined = project;
  let sourceBlob: Blob | undefined = project?.source;
  let resultBlob: Blob | undefined = project?.result;

  const bake = (list: Area[]) => {
    const d = new ImageData(new Uint8ClampedArray(base.data), W, H);
    for (const a of list) recolor(d.data, W, H, a.mask, colorById(a.colorId)!.rgb);
    return d;
  };

  async function setSource(blob: Blob) {
    await busy('กำลังเปิดรูป...', async () => {
      const c = await loadCanvas(blob);
      W = c.width; H = c.height;
      base = c.getContext('2d')!.getImageData(0, 0, W, H);
      sourceBlob = blob;
    });
    committed = bake(areas);
    current = emptyMask(W, H);
  }

  const header = (title: string, n: number, onBack?: () => void) => [topBar(title, onBack), stepsBar(n, 4)];

  function render() {
    root.replaceChildren();
    if (step === 1) {
      root.append(...header('ทาสีบ้าน', 1), h('div', { class: 'hint' }, '1 ใส่รูปบ้าน'),
        h('div', { class: 'content' }, photoPicker(async (f) => { await setSource(f); step = 2; render(); })));
    } else if (step === 2) stepSelect();
    else if (step === 3) stepColor();
    else stepResult();
  }

  // ---------- STEP 2 : choose area ----------
  function stepSelect() {
    const cv = h('canvas') as HTMLCanvasElement;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    const draw = () => {
      raf = 0;
      const d = new ImageData(new Uint8ClampedArray(committed.data), W, H);
      for (let i = 0; i < current.length; i++) if (current[i]) {
        const p = i * 4;
        d.data[p] = d.data[p] * 0.55 + 255 * 0.45; d.data[p + 1] = d.data[p + 1] * 0.55 + 40 * 0.45; d.data[p + 2] = d.data[p + 2] * 0.55 + 120 * 0.45;
      }
      ctx.putImageData(d, 0, 0);
    };
    const sched = () => { if (!raf) raf = requestAnimationFrame(draw); };
    const pos = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
    const BR = [4, 8, 14, 22, 32, 44, 60];
    let bIdx = 2;
    const R = () => BR[bIdx] * (Math.max(W, H) / 1000);
    const ring = h('div', { class: 'ring' });
    const dot = h('i', { class: 'size-dot' });
    const sizeTxt = h('span', {});
    const sizeInfo = h('div', { class: 'size-info' }, dot, sizeTxt);
    let ringTimer = 0;
    /** diameter of the brush in on-screen pixels */
    const ringPx = () => Math.max(6, 2 * R() * cv.getBoundingClientRect().width / W);
    const placeRing = (cx: number, cy: number) => {
      const d = ringPx(); ring.style.width = ring.style.height = d + 'px';
      ring.style.left = cx - d / 2 + 'px'; ring.style.top = cy - d / 2 + 'px'; ring.style.display = 'block';
    };
    const updateSize = (flash = false) => {
      if (mode === 'tap') {
        const lv = Math.round((tol - 14) / 12) + 1;
        dot.style.display = 'none';
        sizeTxt.textContent = `พื้นที่ที่เลือกต่อการแตะ: ระดับ ${lv}/9`;
        return;
      }
      const d = Math.min(ringPx(), 60);
      dot.style.display = 'block'; dot.style.width = dot.style.height = d + 'px';
      sizeTxt.textContent = `ขนาดแปรง: ระดับ ${bIdx + 1}/${BR.length}`;
      if (flash) {
        const r = cv.getBoundingClientRect();
        placeRing(r.width / 2, r.height / 2);
        clearTimeout(ringTimer); ringTimer = window.setTimeout(() => (ring.style.display = 'none'), 1600);
      }
    };
    let painting = false;
    const local = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      const { x, y } = pos(e);
      undo.push(current.slice()); if (undo.length > 30) undo.shift();
      if (mode === 'tap') {
        last = { x, y, before: current.slice() };
        const g = growFrom(base, x, y, tol);
        unionInto(current, g);
      } else {
        painting = true; paintDisc(current, W, H, x, y, R(), mode === 'add' ? 1 : 0);
        clearTimeout(ringTimer); const l = local(e); placeRing(l.x, l.y);
      }
      sched(); refresh();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!painting) return;
      const { x, y } = pos(e); paintDisc(current, W, H, x, y, R(), mode === 'add' ? 1 : 0); sched();
      const l = local(e); placeRing(l.x, l.y);
    });
    const end = () => { painting = false; ringTimer = window.setTimeout(() => (ring.style.display = 'none'), 500); refresh(); };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    setTimeout(() => updateSize(), 0);

    const nextBtn = h('button', { class: 'btn primary', onClick: () => { step = 3; render(); } }, 'ถัดไป →') as HTMLButtonElement;
    const modeBtns = (['tap', 'add', 'erase'] as const).map((m) => h('button', {
      class: mode === m ? 'on' : '', onClick: () => { mode = m; modeBtns.forEach((b, i) => b.classList.toggle('on', (['tap', 'add', 'erase'] as const)[i] === m)); updateSize(m !== 'tap'); },
    }, m === 'tap' ? '👆 แตะเลือก' : m === 'add' ? '🖌️ ระบายเพิ่ม' : '🧽 ลบออก'));

    const regrow = () => { if (last) { current = last.before.slice(); unionInto(current, growFrom(base, last.x, last.y, tol)); sched(); refresh(); } };
    const bigger = () => {
      if (mode === 'tap') { tol = Math.min(110, tol + 12); regrow(); }
      else bIdx = Math.min(BR.length - 1, bIdx + 1);
      updateSize(true);
    };
    const smaller = () => {
      if (mode === 'tap') { tol = Math.max(14, tol - 12); regrow(); }
      else bIdx = Math.max(0, bIdx - 1);
      updateSize(true);
    };
    const undoBtn = () => {
      if (undo.length) { current = undo.pop()! as typeof current; last = null; }
      else if (areas.length) { areas.pop(); committed = bake(areas); toast('ยกเลิกจุดล่าสุดแล้ว'); }
      sched(); refresh();
    };
    function refresh() { nextBtn.disabled = maskCount(current) === 0; }

    root.append(
      ...header('เลือกจุดที่จะทาสี', 2, async () => { if (resultBlob || areas.length) { await finish(); step = 4; } else step = 1; render(); }),
      h('div', { class: 'hint' }, '2 แตะที่ผนัง รั้ว หรือเสา'),
      h('div', { class: 'content' },
        h('div', { class: 'canvas-wrap' }, cv, ring),
        h('div', { class: 'row' }, h('div', { class: 'seg' }, modeBtns)),
        sizeInfo,
        h('div', { class: 'row' },
          h('button', { class: 'tool', onClick: bigger }, '➕ กว้างขึ้น'),
          h('button', { class: 'tool', onClick: smaller }, '➖ แคบลง'),
          h('button', { class: 'tool', onClick: undoBtn }, '↩️ ย้อนกลับ'))),
      h('div', { class: 'bottom' }, nextBtn));
    draw(); refresh();
  }

  // ---------- STEP 3 : pick color ----------
  function stepColor() {
    const cv = h('canvas') as HTMLCanvasElement;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d')!;
    const preview = () => {
      const d = pendingColor ? (() => { const x = new ImageData(new Uint8ClampedArray(committed.data), W, H);
        // recolor the new area relative to the ORIGINAL light, then paste over committed
        const o = new ImageData(new Uint8ClampedArray(base.data), W, H);
        recolor(o.data, W, H, current, colorById(pendingColor!)!.rgb);
        for (let i = 0; i < current.length; i++) if (current[i]) { const p = i * 4; x.data[p] = o.data[p]; x.data[p + 1] = o.data[p + 1]; x.data[p + 2] = o.data[p + 2]; }
        return x; })() : committed;
      ctx.putImageData(d, 0, 0);
    };
    const again = h('button', { class: 'btn', onClick: () => { if (commit()) { current = emptyMask(W, H); undo = []; last = null; pendingColor = null; step = 2; render(); } } }, '➕ ทาอีกจุด') as HTMLButtonElement;
    const done = h('button', { class: 'btn primary', onClick: async () => { if (commit()) { await finish(); step = 4; render(); } } }, 'ดูผลลัพธ์ →') as HTMLButtonElement;
    const sync = () => { again.disabled = done.disabled = !pendingColor; };
    let grp = (pendingColor && colorById(pendingColor)?.group) || GROUPS[0];
    const grid = h('div', { class: 'palette' });
    const tabs = h('div', { class: 'strip tabs' });
    const showGrid = () => {
      tabs.replaceChildren(...GROUPS.map((gname) => h('button', {
        class: 'tab' + (gname === grp ? ' on' : ''), onClick: () => { grp = gname; showGrid(); },
      }, gname)));
      grid.replaceChildren(...PALETTE.filter((c) => c.group === grp).map((c) => h('button', {
        class: 'swatch' + (pendingColor === c.id ? ' on' : ''),
        onClick: () => { pendingColor = c.id; showGrid(); preview(); sync(); },
      }, h('span', { class: 'chip', style: { background: c.css } }), h('span', { class: 'n' }, c.name))));
    };
    showGrid();

    root.append(
      ...header('เลือกสี', 3, () => { step = 2; render(); }),
      h('div', { class: 'preview-fix' }, h('canvas-holder', {}, cv)),
      h('div', { class: 'hint', style: { paddingTop: '10px' } }, '3 แตะสีที่ชอบ'),
      h('div', { style: { padding: '0 16px' } }, tabs),
      h('div', { class: 'content' }, grid),
      h('div', { class: 'bottom' }, again, done));
    preview(); sync();
  }

  function commit(): boolean {
    if (!pendingColor || maskCount(current) === 0) return false;
    areas.push({ mask: current.slice(), colorId: pendingColor });
    committed = bake(areas);
    return true;
  }

  async function finish() {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    c.getContext('2d')!.putImageData(committed, 0, 0);
    resultBlob = await toBlob(c);
  }

  // ---------- STEP 4 : result ----------
  function stepResult() {
    const beforeUrl = URL.createObjectURL(sourceBlob!);
    const afterUrl = URL.createObjectURL(resultBlob!);
    const build = (): Project => ({
      id: proj?.id ?? uid(), name: proj?.name ?? `ทาสีบ้าน ${new Date().toLocaleDateString('th-TH')}`,
      mode: 'paint', created: proj?.created ?? Date.now(), updated: Date.now(),
      source: sourceBlob!, result: resultBlob!, colors: [...new Set(areas.map((a) => a.colorId))], items: [],
      areas: areas.map<PaintArea>((a) => ({ mask: a.mask.slice().buffer, colorId: a.colorId })),
    });
    const save = async () => { proj = build(); await saveProject(proj); toast('บันทึกแล้ว ✓'); return proj; };
    root.append(
      ...header('ผลลัพธ์', 4, () => { back(); }),
      h('div', { class: 'hint' }, '4 ลากดูก่อน/หลัง'),
      h('div', { class: 'content' }, compareView(beforeUrl, afterUrl),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onClick: () => { current = emptyMask(W, H); undo = []; last = null; pendingColor = null; step = 2; render(); } }, '✏️ แก้ไข'),
          h('button', { class: 'btn', onClick: save }, '💾 บันทึก'))),
      h('div', { class: 'bottom' }, h('button', { class: 'btn primary', onClick: async () => { const p = await save(); go(() => summaryScreen(p)); } }, 'สรุปงาน / ส่งต่อ →')));
  }

  // ---------- boot ----------
  if (project) {
    (async () => {
      await busy('กำลังเปิดงาน...', async () => {
        const c = await loadCanvas(project.source);
        W = c.width; H = c.height; base = c.getContext('2d')!.getImageData(0, 0, W, H);
      });
      areas = (project.areas ?? []).map((a) => ({ mask: new Uint8Array(a.mask), colorId: a.colorId }));
      committed = bake(areas); current = emptyMask(W, H); step = 4; render();
    })();
  } else render();

  return { el: root };
}

void replace;
