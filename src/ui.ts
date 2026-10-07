export type Child = Node | string | number | null | undefined | false;

export function h(tag: string, attrs: Record<string, any> = {}, ...kids: (Child | Child[])[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

export interface Screen { el: HTMLElement; destroy?: () => void }
export type ScreenFactory = () => Screen;

const app = () => document.getElementById('app')!;
const stack: ScreenFactory[] = [];
let current: Screen | null = null;

function mount(f: ScreenFactory) {
  current?.destroy?.();
  const s = f();
  current = s;
  app().replaceChildren(s.el);
}
export function go(f: ScreenFactory) { stack.push(f); mount(f); }
export function replace(f: ScreenFactory) { stack[stack.length - 1] = f; mount(f); }
export function back() { if (stack.length > 1) { stack.pop(); mount(stack[stack.length - 1]); } }
export function goHome(home: ScreenFactory) { stack.length = 0; go(home); }

export function topBar(title: string, onBack?: () => void) {
  return h('div', { class: 'top' },
    h('button', { class: 'back', onClick: onBack ?? back, 'aria-label': 'กลับ' }, '←'),
    h('h1', {}, title));
}

export function stepsBar(step: number, total: number) {
  return h('div', { class: 'steps' }, Array.from({ length: total }, (_, i) => h('i', { class: i < step ? 'on' : '' })));
}

export function toast(msg: string) {
  const t = h('div', { class: 'toast' }, msg);
  app().append(t);
  setTimeout(() => t.remove(), 2200);
}

export async function busy<T>(msg: string, job: (setMsg: (m: string) => void) => Promise<T>): Promise<T> {
  const label = h('div', {}, msg);
  const o = h('div', { class: 'overlay' }, h('div', { class: 'spin' }), label);
  app().append(o);
  try { return await job((m) => (label.textContent = m)); } finally { o.remove(); }
}

export function ask(title: string, def: string): Promise<string | null> {
  return new Promise((res) => {
    const input = h('input', { class: 'name-in', value: def }) as HTMLInputElement;
    const done = (v: string | null) => { o.remove(); res(v); };
    const o = h('div', { class: 'overlay' }, h('div', {}, title), input,
      h('div', { class: 'row', style: { width: '100%' } },
        h('button', { class: 'btn', onClick: () => done(null) }, 'ยกเลิก'),
        h('button', { class: 'btn primary', onClick: () => done(input.value.trim() || def) }, 'ตกลง')));
    app().append(o);
    input.select();
  });
}

export function confirmBox(msg: string): Promise<boolean> {
  return new Promise((res) => {
    const done = (v: boolean) => { o.remove(); res(v); };
    const o = h('div', { class: 'overlay' }, h('div', {}, msg),
      h('div', { class: 'row', style: { width: '100%' } },
        h('button', { class: 'btn', onClick: () => done(false) }, 'ไม่'),
        h('button', { class: 'btn danger', onClick: () => done(true) }, 'ลบเลย')));
    app().append(o);
  });
}

/** Big camera / gallery buttons with illustration and guidance. */
export function photoPicker(onPick: (f: File) => void, camLabel = 'ถ่ายรูปใหม่ทันที', galLabel = 'เลือกรูปจากเครื่อง') {
  const mk = (capture: boolean) => {
    const i = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } }) as HTMLInputElement;
    if (capture) i.setAttribute('capture', 'environment');
    i.addEventListener('change', () => { const f = i.files?.[0]; if (f) onPick(f); i.value = ''; });
    return i;
  };
  const cam = mk(true), gal = mk(false);
  return h('div', { class: 'photo-pick' },
    h('div', { class: 'upload-guide-card' },
      h('div', { class: 'upload-illustration' }, '📸'),
      h('h3', {}, 'ใส่รูปเพื่อเริ่มออกแบบ'),
      h('p', {}, 'แนะนำให้ถ่ายรูปมุมตรง แสงสว่างชัดเจน จะได้สีที่สมจริงที่สุด')),
    h('button', { class: 'btn primary upload-action-btn', onClick: () => cam.click() },
      h('span', { class: 'btn-ico' }, '📷'),
      h('span', {}, camLabel)),
    h('button', { class: 'btn upload-action-btn secondary-btn', onClick: () => gal.click() },
      h('span', { class: 'btn-ico' }, '🖼️'),
      h('span', {}, galLabel)),
    cam, gal);
}

/** Before / After slider using two image urls. */
export function compareView(beforeUrl: string, afterUrl: string) {
  const before = h('img', { src: beforeUrl });
  const after = h('div', { class: 'after' }, h('img', { src: afterUrl }));
  const bar = h('div', { class: 'bar' });
  const knob = h('div', { class: 'knob' }, '⇆');
  const root = h('div', { class: 'compare' }, before, after, bar, knob,
    h('div', { class: 'tag', style: { left: '8px' } }, 'ก่อน'),
    h('div', { class: 'tag', style: { right: '8px' } }, 'หลัง'));
  const set = (p: number) => {
    p = Math.min(1, Math.max(0, p));
    after.style.clipPath = `inset(0 0 0 ${p * 100}%)`;
    bar.style.left = `${p * 100}%`;
    knob.style.left = `${p * 100}%`;
  };
  set(0.5);
  const move = (e: PointerEvent) => { const r = root.getBoundingClientRect(); set((e.clientX - r.left) / r.width); };
  root.addEventListener('pointerdown', (e) => { root.setPointerCapture(e.pointerId); move(e); });
  root.addEventListener('pointermove', (e) => { if (root.hasPointerCapture(e.pointerId)) move(e); });
  return root;
}
