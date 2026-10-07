import { h, go, topBar, confirmBox, ask, toast, type Screen } from './ui';
import { listProjects, deleteProject, saveProject, type Project } from './db';
import { painterScreen } from './painter';
import { composerScreen } from './composer';

export function projectsScreen(): Screen {
  const root = h('div', { class: 'screen' });
  const urls: string[] = [];
  async function render() {
    urls.splice(0).forEach(URL.revokeObjectURL);
    const list = await listProjects();
    const body = list.length
      ? h('div', { class: 'grid' }, list.map((p) => {
        const u = URL.createObjectURL(p.result); urls.push(u);
        return h('div', { class: 'card proj', onClick: () => go(() => (p.mode === 'paint' ? painterScreen(p) : composerScreen(p))) },
          h('img', { src: u }), h('b', {}, p.name),
          h('small', {}, (p.mode === 'paint' ? '🎨 ทาสี · ' : '🛋️ แต่งห้อง · ') + new Date(p.updated).toLocaleDateString('th-TH')),
          h('button', { class: 'x', onClick: async (e: Event) => { e.stopPropagation(); if (await confirmBox(`ลบ "${p.name}" ?`)) { await deleteProject(p.id); render(); } } }, '🗑️'),
          h('button', { class: 'x', style: { right: '52px' }, onClick: async (e: Event) => {
            e.stopPropagation(); const n = await ask('ชื่องาน', p.name); if (n) { await saveProject({ ...p, name: n } as Project); toast('เปลี่ยนชื่อแล้ว'); render(); }
          } }, '✏️'));
      }))
      : h('div', { class: 'empty' }, 'ยังไม่มีงานที่บันทึก', h('br'), 'เริ่มทาสีบ้านหรือแต่งห้องได้เลย');
    root.replaceChildren(topBar('โปรเจกต์ของฉัน'), h('div', { class: 'content' }, body));
  }
  render();
  return { el: root, destroy: () => urls.forEach(URL.revokeObjectURL) };
}
