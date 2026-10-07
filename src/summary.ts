import { h, topBar, compareView, toast, busy, type Screen } from './ui';
import { colorById } from './palette';
import { getItem, type Project, type Item } from './db';
import { loadImage, toBlob, shareImage } from './img';

async function renderSummaryImage(p: Project, items: Item[]): Promise<Blob> {
  const W = 1080, pad = 40;
  const [b, a] = await Promise.all([
    loadImage(URL.createObjectURL(p.source)), loadImage(URL.createObjectURL(p.result)),
  ]);
  const colW = (W - pad * 3) / 2;
  const imgH = Math.round(colW * Math.max(b.height / b.width, a.height / a.width));
  const colors = p.colors.map(colorById).filter(Boolean) as NonNullable<ReturnType<typeof colorById>>[];
  const thumbs = await Promise.all(items.map(async (i) => ({ i, img: await loadImage(URL.createObjectURL(i.transparent)) })));
  const rowsC = colors.length ? Math.ceil(colors.length / 2) : 0;
  const rowsI = thumbs.length ? Math.ceil(thumbs.length / 2) : 0;
  const H = 150 + imgH + 60 + (rowsC ? 70 + rowsC * 80 : 0) + (rowsI ? 70 + rowsI * 110 : 0) + pad;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#2b2622'; x.font = 'bold 52px sans-serif'; x.fillText(p.name, pad, 80);
  x.font = '28px sans-serif'; x.fillStyle = '#7a6f64'; x.fillText(new Date(p.updated).toLocaleDateString('th-TH'), pad, 122);
  let y = 150;
  x.drawImage(b, pad, y, colW, colW * b.height / b.width); x.drawImage(a, pad * 2 + colW, y, colW, colW * a.height / a.width);
  y += imgH + 10; x.font = 'bold 30px sans-serif'; x.fillStyle = '#2b2622';
  x.fillText('ก่อน', pad, y + 30); x.fillText('หลัง', pad * 2 + colW, y + 30); y += 60;
  if (rowsC) {
    x.font = 'bold 36px sans-serif'; x.fillText('สีที่ใช้', pad, y + 36); y += 60;
    colors.forEach((col, i) => {
      const cx = pad + (i % 2) * (colW + pad), cy = y + Math.floor(i / 2) * 80;
      x.fillStyle = col.css; x.beginPath(); x.roundRect(cx, cy, 60, 60, 12); x.fill();
      x.fillStyle = '#2b2622'; x.font = '30px sans-serif'; x.fillText(col.name, cx + 76, cy + 42);
    });
    y += rowsC * 80 + 10;
  }
  if (rowsI) {
    x.fillStyle = '#2b2622'; x.font = 'bold 36px sans-serif'; x.fillText('ของตกแต่ง', pad, y + 36); y += 60;
    thumbs.forEach(({ i, img }, k) => {
      const cx = pad + (k % 2) * (colW + pad), cy = y + Math.floor(k / 2) * 110;
      const s = Math.min(90 / img.width, 90 / img.height);
      x.drawImage(img, cx, cy, img.width * s, img.height * s);
      x.fillStyle = '#2b2622'; x.font = '30px sans-serif'; x.fillText(i.name, cx + 110, cy + 52);
    });
  }
  return toBlob(c, 'image/jpeg', 0.92);
}

export function summaryScreen(p: Project): Screen {
  const urls: string[] = [];
  const u = (b: Blob) => { const s = URL.createObjectURL(b); urls.push(s); return s; };
  const root = h('div', { class: 'screen' });
  const content = h('div', { class: 'content' });
  let items: Item[] = [];

  const share = async () => {
    const blob = await busy('กำลังเตรียมรูปสรุป...', () => renderSummaryImage(p, items));
    const r = await shareImage(blob, `${p.name} — สรุปงานรีโนเวท`, `${p.name}.jpg`);
    if (r === 'downloaded') {
      toast('บันทึกรูปแล้ว กำลังเปิด LINE');
      window.open('https://line.me/R/nv/chat', '_blank');
    }
  };

  (async () => {
    items = (await Promise.all(p.items.map(getItem))).filter(Boolean) as Item[];
    const colors = p.colors.map(colorById).filter(Boolean) as NonNullable<ReturnType<typeof colorById>>[];
    content.append(
      ...[
      compareView(u(p.source), u(p.result)),
      colors.length ? h('div', { class: 'sum-sec' }, h('h3', {}, 'สีที่ใช้'), h('div', { class: 'chips' },
        colors.map((c) => h('div', { class: 'chip-i' }, h('i', { style: { background: c.css } }), c.name)))) : null,
      items.length ? h('div', { class: 'sum-sec' }, h('h3', {}, 'ของตกแต่ง'), h('div', { class: 'chips' },
        items.map((i) => h('div', { class: 'chip-i' }, h('img', { src: u(i.transparent) }), i.name)))) : null,
      ].filter((x): x is HTMLElement => !!x));
  })();

  root.append(topBar('สรุปงาน'), content,
    h('div', { class: 'bottom' }, h('button', { class: 'btn line', onClick: share }, '💬 ส่งต่อเข้า LINE')));
  return { el: root, destroy: () => urls.forEach(URL.revokeObjectURL) };
}
