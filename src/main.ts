import './style.css';
import { h, goHome, go, type Screen } from './ui';
import { painterScreen } from './painter';
import { composerScreen } from './composer';
import { libraryScreen } from './library';
import { projectsScreen } from './projects';

function homeScreen(): Screen {
  const card = (bg: string, ico: string, t: string, s: string, f: () => Screen) =>
    h('button', { class: 'big-card', style: { background: bg }, onClick: () => go(f) },
      h('span', { class: 'ico' }, ico), h('span', {}, t, h('small', {}, s)));
  return {
    el: h('div', { class: 'screen' },
      h('div', { class: 'top', style: { paddingTop: '24px' } }, h('h1', { style: { fontSize: '26px' } }, '🏠 ช่วยรีโนเวทบ้าน')),
      h('div', { class: 'content' },
        card('#e0642b', '🎨', 'ทาสีบ้าน', 'ถ่ายรูป แตะ เลือกสี', () => painterScreen()),
        card('#3a7ca5', '🛋️', 'แต่งห้อง', 'วางของลงบนรูปห้อง', () => composerScreen()),
        h('div', { class: 'row' },
          h('button', { class: 'btn', style: { minHeight: '84px' }, onClick: () => go(projectsScreen) }, '📁 โปรเจกต์ของฉัน'),
          h('button', { class: 'btn', style: { minHeight: '84px' }, onClick: () => go(() => libraryScreen()) }, '📦 คลังของฉัน')))),
  };
}

goHome(homeScreen);
