import { h, back, go, replace, topBar, stepsBar, photoPicker, compareView, toast, busy, type Screen } from './ui';
import { PALETTE, GROUPS, ARCHITECTURAL_THEMES, colorById } from './palette';
import { loadCanvas, toBlob } from './img';
import { growFrom, paintDisc, recolor, emptyMask, maskCount, unionInto } from './engine';
import { saveProject, uid, type Project, type PaintArea } from './db';
import { summaryScreen } from './summary';

interface Area { mask: Uint8Array; colorId: string; finish?: 'matt' | 'sheen' }

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
  let pendingFinish: 'matt' | 'sheen' = 'matt';
  let proj: Project | undefined = project;
  let sourceBlob: Blob | undefined = project?.source;
  let resultBlob: Blob | undefined = project?.result;

  const bake = (list: Area[]) => {
    const d = new ImageData(new Uint8ClampedArray(base.data), W, H);
    for (const a of list) recolor(d.data, W, H, a.mask, colorById(a.colorId)!.rgb, a.finish ?? 'matt');
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
    const cv = h('canvas', {
      style: { width: '100%', height: 'auto', aspectRatio: `${W} / ${H}`, display: 'block' },
    }) as HTMLCanvasElement;
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

    // Zoom & Pan state
    let zoom = 1.0;
    let panX = 0;
    let panY = 0;
    let startDist = 0;
    let startZoom = 1.0;
    let startMid = { x: 0, y: 0 };
    let startPan = { x: 0, y: 0 };
    const pointers = new Map<number, { clientX: number; clientY: number }>();

    const zoomStage = h('div', { class: 'zoom-stage' }, cv, ring);
    const resetZoomBtn = h('button', {
      class: 'zoom-reset-btn',
      onClick: () => resetZoom(),
    }, '🔍 1.0x · รีเซ็ต');

    const loupe = h('div', { class: 'loupe' });
    const loupeCv = h('canvas', { width: 120, height: 120 }) as HTMLCanvasElement;
    const loupeCtx = loupeCv.getContext('2d')!;
    loupe.append(loupeCv);

    const wrap = h('div', { class: 'canvas-wrap' }, zoomStage, loupe, resetZoomBtn);

    const updateTransform = () => {
      const r = wrap.getBoundingClientRect();
      const stageW = r.width;
      const stageH = stageW * H / W;
      const minX = Math.min(0, stageW - stageW * zoom);
      const minY = Math.min(0, stageH - stageH * zoom);
      panX = Math.max(minX, Math.min(0, panX));
      panY = Math.max(minY, Math.min(0, panY));

      zoomStage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
      if (zoom > 1.05) {
        resetZoomBtn.style.display = 'block';
        resetZoomBtn.textContent = `🔍 ${zoom.toFixed(1)}x · แตะรีเซ็ต`;
      } else {
        resetZoomBtn.style.display = 'none';
      }
    };

    const resetZoom = () => {
      zoom = 1.0; panX = 0; panY = 0;
      updateTransform();
    };

    const updateLoupe = (clientX: number, clientY: number, imgX: number, imgY: number) => {
      const wrapRect = wrap.getBoundingClientRect();
      let lx = clientX - wrapRect.left - 55;
      let ly = clientY - wrapRect.top - 125;
      if (ly < 10) ly = clientY - wrapRect.top + 45;
      lx = Math.max(8, Math.min(wrapRect.width - 118, lx));
      loupe.style.left = `${lx}px`;
      loupe.style.top = `${ly}px`;
      loupe.style.display = 'block';

      const winW = Math.max(24, Math.round(W * 0.14));
      const winH = Math.max(24, Math.round(H * 0.14));
      loupeCtx.clearRect(0, 0, 120, 120);
      loupeCtx.drawImage(cv, imgX - winW / 2, imgY - winH / 2, winW, winH, 0, 0, 120, 120);

      if (mode === 'add' || mode === 'erase') {
        const brushRInLoupe = (R() / winW) * 120;
        loupeCtx.beginPath();
        loupeCtx.arc(60, 60, Math.max(4, brushRInLoupe), 0, Math.PI * 2);
        loupeCtx.strokeStyle = mode === 'add' ? '#e0642b' : '#b42318';
        loupeCtx.lineWidth = 2.5;
        loupeCtx.stroke();
      } else {
        loupeCtx.beginPath();
        loupeCtx.arc(60, 60, 5, 0, Math.PI * 2);
        loupeCtx.fillStyle = '#e0642b';
        loupeCtx.fill();
      }
      loupeCtx.fillStyle = '#ffffff';
      loupeCtx.fillRect(59, 59, 2, 2);
    };

    const hideLoupe = () => {
      loupe.style.display = 'none';
    };

    const ringPx = () => Math.max(6, 2 * R() * cv.getBoundingClientRect().width / (W * zoom));
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
        placeRing((r.width / zoom) / 2, (r.height / zoom) / 2);
        clearTimeout(ringTimer); ringTimer = window.setTimeout(() => (ring.style.display = 'none'), 1600);
      }
    };

    let painting = false;
    const local = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
    };

    wrap.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
      wrap.setPointerCapture(e.pointerId);

      if (pointers.size >= 2) {
        painting = false;
        hideLoupe();
        ring.style.display = 'none';
        const [p1, p2] = Array.from(pointers.values());
        startDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        startZoom = zoom;
        startMid = { x: (p1.clientX + p2.clientX) / 2, y: (p1.clientY + p2.clientY) / 2 };
        startPan = { x: panX, y: panY };
        return;
      }

      if (pointers.size === 1) {
        const { x, y } = pos(e);
        undo.push(current.slice()); if (undo.length > 30) undo.shift();
        if (mode === 'tap') {
          last = { x, y, before: current.slice() };
          const g = growFrom(base, x, y, tol);
          unionInto(current, g);
        } else {
          painting = true;
          paintDisc(current, W, H, x, y, R(), mode === 'add' ? 1 : 0);
          clearTimeout(ringTimer); const l = local(e); placeRing(l.x, l.y);
        }
        updateLoupe(e.clientX, e.clientY, x, y);
        sched(); refresh();
      }
    });

    wrap.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

      if (pointers.size >= 2) {
        const [p1, p2] = Array.from(pointers.values());
        const dist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        if (startDist > 0) {
          zoom = Math.min(3.5, Math.max(1.0, startZoom * (dist / startDist)));
          const currentMid = { x: (p1.clientX + p2.clientX) / 2, y: (p1.clientY + p2.clientY) / 2 };
          panX = startPan.x + (currentMid.x - startMid.x);
          panY = startPan.y + (currentMid.y - startMid.y);
          updateTransform();
        }
        return;
      }

      if (painting) {
        const { x, y } = pos(e);
        paintDisc(current, W, H, x, y, R(), mode === 'add' ? 1 : 0);
        sched();
        const l = local(e); placeRing(l.x, l.y);
        updateLoupe(e.clientX, e.clientY, x, y);
      }
    });

    const onPointerEnd = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        painting = false;
        hideLoupe();
        ringTimer = window.setTimeout(() => (ring.style.display = 'none'), 400);
        refresh();
      } else if (pointers.size === 1) {
        startDist = 0;
      }
    };
    wrap.addEventListener('pointerup', onPointerEnd);
    wrap.addEventListener('pointercancel', onPointerEnd);
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
        wrap,
        h('div', { class: 'row' }, h('div', { class: 'seg' }, modeBtns)),
        sizeInfo,
        h('div', { class: 'zoom-hint' }, '💡 ใช้ 2 นิ้วซูม/เลื่อนภาพได้ • มีแว่นขยายช่วยดูขอบขณะระบาย'),
        h('div', { class: 'row' },
          h('button', { class: 'tool', onClick: bigger }, '➕ กว้างขึ้น'),
          h('button', { class: 'tool', onClick: smaller }, '➖ แคบลง'),
          h('button', { class: 'tool', onClick: undoBtn }, '↩️ ย้อนกลับ'))),
      h('div', { class: 'bottom' }, nextBtn));
    draw(); refresh();
  }

  // ---------- STEP 3 : pick color ----------
  function stepColor() {
    const cv = h('canvas', {
      style: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
    }) as HTMLCanvasElement;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d')!;

    let currentFinish: 'matt' | 'sheen' = pendingFinish;
    let viewMode: 'themes' | 'palette' = 'themes';
    let grp = (pendingColor && colorById(pendingColor)?.group) || GROUPS[0];

    const preview = () => {
      const d = pendingColor ? (() => {
        const x = new ImageData(new Uint8ClampedArray(committed.data), W, H);
        const o = new ImageData(new Uint8ClampedArray(base.data), W, H);
        recolor(o.data, W, H, current, colorById(pendingColor!)!.rgb, currentFinish);
        for (let i = 0; i < current.length; i++) if (current[i]) {
          const p = i * 4;
          x.data[p] = o.data[p]; x.data[p + 1] = o.data[p + 1]; x.data[p + 2] = o.data[p + 2];
        }
        return x;
      })() : committed;
      ctx.putImageData(d, 0, 0);
    };

    const again = h('button', { class: 'btn', onClick: () => { if (commit()) { current = emptyMask(W, H); undo = []; last = null; pendingColor = null; step = 2; render(); } } }, '➕ ทาอีกจุด') as HTMLButtonElement;
    const done = h('button', { class: 'btn primary', onClick: async () => { if (commit()) { await finish(); step = 4; render(); } } }, 'ดูผลลัพธ์ →') as HTMLButtonElement;
    const sync = () => { again.disabled = done.disabled = !pendingColor; };

    // Finish options
    const mattBtn = h('button', { class: 'finish-btn' + (currentFinish === 'matt' ? ' on' : ''), onClick: () => setFinish('matt') }, '⚪ ผิวด้าน');
    const sheenBtn = h('button', { class: 'finish-btn' + (currentFinish === 'sheen' ? ' on' : ''), onClick: () => setFinish('sheen') }, '✨ กึ่งเงา');
    const setFinish = (f: 'matt' | 'sheen') => {
      currentFinish = pendingFinish = f;
      mattBtn.classList.toggle('on', f === 'matt');
      sheenBtn.classList.toggle('on', f === 'sheen');
      preview();
    };
    const finishOptions = h('div', { class: 'finish-options' }, mattBtn, sheenBtn);

    // Mode toggle: Themes vs All Palette
    const themeTab = h('button', { class: 'on', onClick: () => setMode('themes') }, '🌟 สไตล์สถาปนิก');
    const paletteTab = h('button', { onClick: () => setMode('palette') }, '🎨 สีทั้งหมด');
    const modeToggle = h('div', { class: 'main-mode-toggle' }, themeTab, paletteTab);

    // Category tabs bar (fixed, only visible in palette mode)
    const categoryTabsBar = h('div', { class: 'category-tabs-bar', style: { display: 'none' } });

    // Sub-bar showing section title + finish toggle
    const subBar = h('div', { class: 'sub-bar' });

    // Scrolling container for themes or palette swatches
    const scrollContent = h('div', { class: 'content picker-scroll' });

    const setMode = (m: 'themes' | 'palette') => {
      viewMode = m;
      renderMode();
    };

    const renderCategoryTabs = () => {
      categoryTabsBar.replaceChildren(...GROUPS.map((gname) => h('button', {
        class: 'tab' + (gname === grp ? ' on' : ''),
        onClick: () => {
          grp = gname;
          renderCategoryTabs();
          renderPaletteGrid();
          scrollContent.scrollTop = 0;
        },
      }, gname)));
    };

    const themesList = h('div', { class: 'themes-list' });
    const renderThemesList = () => {
      themesList.replaceChildren();
      ARCHITECTURAL_THEMES.forEach((thm) => {
        const hasSelectedColor = thm.slots.some((s) => s.colorId === pendingColor);
        const slotsRow = h('div', { class: 'theme-slots' },
          thm.slots.map((s, idx) => {
            const c = colorById(s.colorId)!;
            const isSlotActive = pendingColor === s.colorId;
            const pct = idx === 0 ? '60%' : idx === 1 ? '30%' : '10%';
            return h('div', {
              class: 'theme-slot' + (isSlotActive ? ' on' : ''),
              onClick: () => {
                pendingColor = s.colorId;
                grp = c.group;
                renderThemesList();
                preview();
                sync();
              },
            },
              h('div', { class: 'chip', style: { background: c.css } }),
              h('span', { class: 'role' }, `${s.role} (${pct})`),
              h('span', { class: 'cname' }, c.name),
              isSlotActive ? h('span', { class: 'slot-badge' }, '✓ เลือกอยู่') : null);
          }));

        // 60-30-10 preview bar
        const propBar = h('div', { class: 'proportion-bar' },
          h('div', { class: 'prop-seg p60', style: { background: colorById(thm.slots[0].colorId)!.css } }),
          h('div', { class: 'prop-seg p30', style: { background: colorById(thm.slots[1].colorId)!.css } }),
          h('div', { class: 'prop-seg p10', style: { background: colorById(thm.slots[2].colorId)!.css } }));

        const card = h('div', { class: 'theme-card' + (hasSelectedColor ? ' on' : '') },
          h('div', { class: 'theme-head' },
            h('span', { class: 'ico' }, thm.icon),
            h('b', {}, thm.name),
            h('span', { class: 'theme-tag' }, thm.tag)),
          h('p', { class: 'theme-desc' }, thm.desc),
          propBar,
          slotsRow);
        themesList.append(card);
      });
    };

    const paletteGrid = h('div', { class: 'palette' });
    const renderPaletteGrid = () => {
      paletteGrid.replaceChildren(...PALETTE.filter((c) => c.group === grp).map((c) => {
        const isSel = pendingColor === c.id;
        return h('button', {
          class: 'swatch' + (isSel ? ' on' : ''),
          onClick: () => {
            pendingColor = c.id;
            renderPaletteGrid();
            preview();
            sync();
          },
        },
          h('span', { class: 'chip', style: { background: c.css } },
            isSel ? h('span', { class: 'swatch-check' }, '✓') : null),
          h('span', { class: 'n' }, c.name));
      }));
    };

    const renderMode = () => {
      themeTab.classList.toggle('on', viewMode === 'themes');
      paletteTab.classList.toggle('on', viewMode === 'palette');

      if (viewMode === 'themes') {
        categoryTabsBar.style.display = 'none';
        subBar.replaceChildren(
          h('span', { class: 'sub-title' }, '🏡 ธีมคู่สี 60-30-10'),
          h('div', { class: 'finish-wrap' }, h('span', {}, 'มิติ:'), finishOptions));
        renderThemesList();
        scrollContent.replaceChildren(themesList);
      } else {
        categoryTabsBar.style.display = 'flex';
        renderCategoryTabs();
        subBar.replaceChildren(
          h('span', { class: 'sub-title' }, `หมวด${grp}`),
          h('div', { class: 'finish-wrap' }, h('span', {}, 'มิติ:'), finishOptions));
        renderPaletteGrid();
        scrollContent.replaceChildren(paletteGrid);
      }
    };

    renderMode();

    root.append(
      ...header('เลือกสี', 3, () => { step = 2; render(); }),
      h('div', { class: 'preview-fix' }, h('canvas-holder', {}, cv)),
      modeToggle,
      categoryTabsBar,
      subBar,
      scrollContent,
      h('div', { class: 'bottom' }, again, done));
    preview(); sync();
  }

  function commit(): boolean {
    if (!pendingColor || maskCount(current) === 0) return false;
    areas.push({ mask: current.slice(), colorId: pendingColor, finish: pendingFinish });
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
      areas: areas.map<PaintArea>((a) => ({ mask: a.mask.slice().buffer, colorId: a.colorId, finish: a.finish })),
    });
    const save = async () => { proj = build(); await saveProject(proj); toast('บันทึกแล้ว ✓'); return proj; };
    const chipsRow = areas.length ? h('div', { class: 'sum-sec' },
      h('h3', {}, '🎨 เฉดสีที่ทาในภาพนี้:'),
      h('div', { class: 'chips' },
        ...areas.map((a, i) => {
          const c = colorById(a.colorId)!;
          const finishTxt = a.finish === 'sheen' ? 'กึ่งเงาซาติน' : 'ผิวด้าน';
          return h('div', { class: 'chip-i' },
            h('i', { style: { background: c.css } }),
            h('span', {}, `จุดที่ ${i + 1}: ${c.name} (${finishTxt})`));
        }))) : null;

    root.append(
      ...header('ภาพเปรียบเทียบ ก่อน/หลัง', 4, () => { back(); }),
      h('div', { class: 'hint' }, 'ลากแถบตรงกลาง เพื่อดูผลลัพธ์'),
      h('div', { class: 'content' },
        compareView(beforeUrl, afterUrl),
        chipsRow,
        h('div', { class: 'row' },
          h('button', { class: 'btn', onClick: () => { current = emptyMask(W, H); undo = []; last = null; pendingColor = null; step = 2; render(); } }, '✏️ ปรับแก้จุดทา'),
          h('button', { class: 'btn', onClick: save }, '💾 บันทึกรูป'))),
      h('div', { class: 'bottom' }, h('button', { class: 'btn primary', onClick: async () => { const p = await save(); go(() => summaryScreen(p)); } }, '📱 สรุปงาน / ส่งต่อ LINE →')));
  }

  // ---------- boot ----------
  if (project) {
    (async () => {
      await busy('กำลังเปิดงาน...', async () => {
        const c = await loadCanvas(project.source);
        W = c.width; H = c.height; base = c.getContext('2d')!.getImageData(0, 0, W, H);
      });
      areas = (project.areas ?? []).map((a) => ({ mask: new Uint8Array(a.mask), colorId: a.colorId, finish: a.finish }));
      committed = bake(areas); current = emptyMask(W, H); step = 4; render();
    })();
  } else render();

  return { el: root };
}

void replace;
