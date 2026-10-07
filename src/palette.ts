export interface PaletteColor { id: string; name: string; rgb: [number, number, number]; css: string; group: string }

const mk = (group: string) => (id: string, name: string, r: number, g: number, b: number): PaletteColor =>
  ({ id, name, rgb: [r, g, b], css: `rgb(${r},${g},${b})`, group });

const w = mk('ขาว/ครีม'), g = mk('เทา/ดำ'), b = mk('น้ำตาล/ส้ม'), n = mk('เขียว/ฟ้า'), r = mk('ชมพู/แดง/เหลือง');

// Hex codes are never shown to users: only a visual chip + a friendly name.
export const PALETTE: PaletteColor[] = [
  w('white', 'ขาวสว่าง', 245, 245, 240), w('pearl', 'ขาวมุก', 232, 230, 224), w('cream', 'ครีม', 238, 222, 186),
  w('ivory', 'งาช้าง', 240, 232, 205), w('sand', 'ทรายอ่อน', 220, 200, 165), w('beige', 'เบจ', 205, 185, 150),
  w('latte', 'ลาเต้', 190, 160, 125), w('khaki', 'กากี', 175, 160, 115),

  g('concrete', 'ปูนเปลือย', 160, 160, 156), g('lightgray', 'เทาอ่อน', 200, 200, 200), g('silver', 'เทาเงิน', 178, 182, 186),
  g('smoke', 'เทาควันบุหรี่', 105, 108, 112), g('slate', 'เทาหินชนวน', 80, 88, 96), g('charcoal', 'เทาถ่าน', 60, 62, 66),
  g('black', 'ดำด้าน', 40, 40, 42), g('warmgray', 'เทาอบอุ่น', 140, 132, 124),

  b('brick', 'ส้มอิฐ', 190, 90, 55), b('terracotta', 'ดินเผา', 200, 110, 75), b('caramel', 'น้ำตาลคาราเมล', 160, 100, 55),
  b('teak', 'ไม้สัก', 140, 95, 55), b('walnut', 'วอลนัท', 95, 65, 45), b('chocolate', 'ช็อกโกแลต', 70, 45, 35),
  b('orange', 'ส้มสด', 225, 125, 50), b('rust', 'สนิม', 150, 70, 40), b('oak', 'ไม้โอ๊ค', 185, 145, 95),

  n('sage', 'เขียวเสจ', 140, 160, 125), n('mint', 'เขียวมิ้นต์', 170, 215, 190), n('olive', 'เขียวมะกอก', 110, 120, 70),
  n('forest', 'เขียวเข้ม', 50, 85, 60), n('sky', 'ฟ้าอ่อน', 160, 200, 225), n('teal', 'เขียวหัวเป็ด', 50, 130, 135),
  n('navy', 'น้ำเงินเข้ม', 45, 70, 110), n('denim', 'ยีนส์', 90, 120, 160), n('aqua', 'ฟ้าน้ำทะเล', 110, 185, 200),

  r('rose', 'ชมพูอิฐอ่อน', 215, 160, 150), r('blush', 'ชมพูพาสเทล', 235, 195, 195), r('red', 'แดงเข้ม', 150, 45, 45),
  r('wine', 'แดงไวน์', 110, 40, 55), r('yellow', 'เหลืองนวล', 240, 215, 120), r('mustard', 'เหลืองมัสตาร์ด', 205, 165, 55),
  r('peach', 'พีช', 240, 190, 160), r('lilac', 'ม่วงลาเวนเดอร์', 185, 170, 205),
];

export const GROUPS = [...new Set(PALETTE.map((p) => p.group))];
export const colorById = (id: string) => PALETTE.find((p) => p.id === id);

export interface ThemeSlot {
  role: 'ผนังหลัก' | 'ตัดขอบ/จั่ว' | 'เสา/รั้ว';
  colorId: string;
}

export interface ArchitecturalTheme {
  id: string;
  name: string;
  icon: string;
  desc: string;
  slots: ThemeSlot[];
}

export const ARCHITECTURAL_THEMES: ArchitecturalTheme[] = [
  {
    id: 'nordic',
    name: 'นอร์ดิกหรูหรา',
    icon: '🏛️',
    desc: 'โมเดิร์น เรียบหรู ไม่ตกยุค คุมโทนสไตล์บ้านโครงการชั้นนำ',
    slots: [
      { role: 'ผนังหลัก', colorId: 'smoke' },
      { role: 'ตัดขอบ/จั่ว', colorId: 'charcoal' },
      { role: 'เสา/รั้ว', colorId: 'black' },
    ],
  },
  {
    id: 'japandi',
    name: 'มูจิ เจแปนดิ',
    icon: '🌿',
    desc: 'อบอุ่น ละมุน ผสมผสานธรรมชาติ ปูนเปลือย และงานไม้',
    slots: [
      { role: 'ผนังหลัก', colorId: 'cream' },
      { role: 'ตัดขอบ/จั่ว', colorId: 'teak' },
      { role: 'เสา/รั้ว', colorId: 'concrete' },
    ],
  },
  {
    id: 'minimal_warm',
    name: 'มินิมอล เอิร์ธโทน',
    icon: '☕',
    desc: 'คลีน สว่าง อบอุ่น สไตล์คาเฟ่เกาหลีและบ้านมินิมอลโมเดิร์น',
    slots: [
      { role: 'ผนังหลัก', colorId: 'white' },
      { role: 'ตัดขอบ/จั่ว', colorId: 'beige' },
      { role: 'เสา/รั้ว', colorId: 'oak' },
    ],
  },
  {
    id: 'loft',
    name: 'โมเดิร์น ลอฟท์',
    icon: '🏢',
    desc: 'เท่ คม สไตล์ปูนเปลือย ตัดกับโครงสร้างเหล็กดำและหินชนวน',
    slots: [
      { role: 'ผนังหลัก', colorId: 'concrete' },
      { role: 'ตัดขอบ/จั่ว', colorId: 'slate' },
      { role: 'เสา/รั้ว', colorId: 'black' },
    ],
  },
  {
    id: 'terracotta',
    name: 'เอิร์ธโทน รีสอร์ต',
    icon: '🏡',
    desc: 'มีชีวิตชีวา อารมณ์วิลล่าตากอากาศสไตล์เมดิเตอร์เรเนียน',
    slots: [
      { role: 'ผนังหลัก', colorId: 'sand' },
      { role: 'ตัดขอบ/จั่ว', colorId: 'terracotta' },
      { role: 'เสา/รั้ว', colorId: 'walnut' },
    ],
  },
  {
    id: 'cottage',
    name: 'คลาสสิก คอทเทจ',
    icon: '🍃',
    desc: 'สงบ สดชื่น โทนเขียวเสจตัดขาวคลาสสิกสไตล์อังกฤษ',
    slots: [
      { role: 'ผนังหลัก', colorId: 'white' },
      { role: 'ตัดขอบ/จั่ว', colorId: 'sage' },
      { role: 'เสา/รั้ว', colorId: 'caramel' },
    ],
  },
  {
    id: 'coastal',
    name: 'โมเดิร์น โคสตัล',
    icon: '🌊',
    desc: 'สดชื่น โปร่ง เบาสบาย อารมณ์บ้านพักตากอากาศริมทะเล',
    slots: [
      { role: 'ผนังหลัก', colorId: 'pearl' },
      { role: 'ตัดขอบ/จั่ว', colorId: 'sky' },
      { role: 'เสา/รั้ว', colorId: 'navy' },
    ],
  },
];
