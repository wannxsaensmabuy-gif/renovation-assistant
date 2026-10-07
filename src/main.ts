import './style.css';
import { h, goHome, go, type Screen } from './ui';
import { painterScreen } from './painter';
import { composerScreen } from './composer';
import { libraryScreen } from './library';
import { projectsScreen } from './projects';

function homeScreen(): Screen {
  return {
    el: h('div', { class: 'screen home-screen' },
      h('header', { class: 'home-header' },
        h('div', { class: 'home-brand' },
          h('span', { class: 'brand-badge' }, '✨ RENOVATION STUDIO'),
          h('h1', { class: 'home-title' }, 'ช่วยรีโนเวทบ้าน'),
          h('p', { class: 'home-sub' }, 'เปลี่ยนสีบ้าน & แต่งห้องเสมือนจริง ง่าย สวย ชัดเจน'))),
      h('div', { class: 'content home-content' },
        // Hero Card 1: Exterior Painter
        h('div', {
          class: 'hero-action-card paint-hero',
          onClick: () => go(() => painterScreen()),
        },
          h('div', { class: 'card-badge' }, '🔥 แนะนำอันดับ 1'),
          h('div', { class: 'card-body' },
            h('div', { class: 'card-icon-wrap' }, '🎨'),
            h('div', { class: 'card-text' },
              h('h2', {}, 'ทาสีบ้านภายนอก'),
              h('p', {}, 'แตะเปลี่ยนสีผนัง คุมโทนสไตล์สถาปนิก 60-30-10'))),
          h('div', { class: 'card-footer' },
            h('span', {}, 'แตะเพื่อเริ่มทำสีบ้าน'),
            h('span', { class: 'arrow' }, '→'))),

        // Hero Card 2: Room Composer
        h('div', {
          class: 'hero-action-card room-hero',
          onClick: () => go(() => composerScreen()),
        },
          h('div', { class: 'card-badge secondary' }, '🛋️ จัดวางห้อง'),
          h('div', { class: 'card-body' },
            h('div', { class: 'card-icon-wrap' }, '🪴'),
            h('div', { class: 'card-text' },
              h('h2', {}, 'แต่งห้อง & วางของ'),
              h('p', {}, 'วางเฟอร์นิเจอร์ ตัดพื้นหลัง AI และเบลนด์แสงเงา'))),
          h('div', { class: 'card-footer' },
            h('span', {}, 'แตะเพื่อเริ่มแต่งห้อง'),
            h('span', { class: 'arrow' }, '→'))),

        // Hub Buttons
        h('div', { class: 'home-hub-row' },
          h('button', { class: 'hub-btn', onClick: () => go(projectsScreen) },
            h('span', { class: 'hub-icon' }, '📁'),
            h('div', { class: 'hub-info' },
              h('b', {}, 'โปรเจกต์ของฉัน'),
              h('small', {}, 'ดูงานที่บันทึกไว้'))),
          h('button', { class: 'hub-btn', onClick: () => go(() => libraryScreen()) },
            h('span', { class: 'hub-icon' }, '📦'),
            h('div', { class: 'hub-info' },
              h('b', {}, 'คลังของแต่งบ้าน'),
              h('small', {}, 'ของที่ไดคัทแล้ว')))),

        // Simple Help Card
        h('div', { class: 'home-tip-box' },
          h('span', { class: 'tip-ico' }, '💡'),
          h('p', {}, 'แนะนำ: ถ่ายรูปตอนกลางวันที่มีแสงสว่างชัดเจน จะเห็นมิติสีและเงาเสมือนจริงที่สุด')))),
  };
}

goHome(homeScreen);
