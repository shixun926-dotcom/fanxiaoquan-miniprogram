/**
 * utils/badges.js —— 成就徽章目录（成就徽章设计文档.md）
 *
 * 15 枚徽章，图标按文档末尾「全套徽章精准开发描述」手工绘制 SVG：
 *   - 全局统一：正圆双层金边（暖金 #D4AF37 主色）、底色柔和高饱和哑光径向渐变（圆心亮边缘暗）、
 *     图标线条统一哑光金色描边 + 顶部高光/底部浅阴影的微浮雕、图标与金边预留 8% 空白
 *   - 稀有度外环 + 「流光划过闪烁」动效（3s/圈、常规 25% 亮度、划过图标峰值 55%）由 WXSS 实现
 *     （组件 components/badge-* / 页面样式），本文件只负责目录与图标
 *
 * 关键字段与云函数 cloudfunctions/api/index.js 的 BADGES 保持同步
 * （key / name / rarity / type / target，云函数无法 require 包外文件）。
 * 类别 / 描述文案 / 图标只在小程序端，避免同步负担。
 */
const GOLD = '#D4AF37' // 暖金主色（高光 #FFF1B8、阴影 #9B7B29 由组件样式处理）

/* ---------- base64（SVG → data URI，手工编码不依赖运行环境） ---------- */

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function b64Encode(str) {
  // 先 UTF-8 编码，再转 base64
  const bytes = []
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i)
    if (c < 0x80) bytes.push(c)
    else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    } else {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    }
  }
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    out += B64_CHARS[b0 >> 2]
    out += B64_CHARS[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)]
    out += b1 === undefined ? '=' : B64_CHARS[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)]
    out += b2 === undefined ? '=' : B64_CHARS[b2 & 63]
  }
  return out
}

// SVG → 可直接给 <image src> 用的 data URI
function iconUri(svg) {
  return 'data:image/svg+xml;base64,' + b64Encode(svg)
}

/* ---------- 稀有度元信息（设计文档 3.2） ---------- */

// color 用于外环细圈；'rainbow' 为虹彩 conic 渐变（特殊类）
// pillBg / pillTx 为详情弹层/墙上的稀有度小标签配色（UI/mockups/badges.html 同款）
const RARITY_META = {
  普通: { color: '#A8B4C4', label: '普通', pillBg: '#EEF1F5', pillTx: '#5A6B7C' },
  稀有: { color: '#5CBF7A', label: '稀有', pillBg: '#E3F5E8', pillTx: '#2E9E44' },
  史诗: { color: '#8B7CF0', label: '史诗', pillBg: '#ECE8FB', pillTx: '#6C5CE7' },
  传说: { color: '#FFB400', label: '传说', pillBg: '#FFF1D6', pillTx: '#E8432E' },
  特殊: { color: 'rainbow', label: '特殊', pillBg: '#FFF1E6', pillTx: '#C2410C' }
}

/* ---------- 徽章目录（15 枚，按「全套徽章精准开发描述」4行×5列分位图标） ----------
 * bg: 底色径向渐变两色（圆心亮 → 边缘暗）
 * icon: 居中图案 SVG（透明底，仅图标：金描边 + 主题色填充 + 左上高光浮雕）
 * desc: 解锁条件文案（详情弹层展示）；target 与云函数 BADGES.target 一致
 */
const BADGES = [
  {
    key: 'first-post', name: '初来乍到', category: '创作', rarity: '普通',
    bg: ['#A8E6A3', '#43A047'], target: 1,
    desc: '发布第 1 条晒吃帖',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="leaf" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#A5D6A7"/><stop offset="1" stop-color="#2E7D32"/></linearGradient></defs>
<path d="M50 88 C44 66 38 54 24 44" fill="none" stroke="${GOLD}" stroke-width="3" stroke-linecap="round"/>
<path d="M50 88 C56 66 62 54 76 44" fill="none" stroke="${GOLD}" stroke-width="3" stroke-linecap="round"/>
<path d="M24 44 C12 44 5 53 7 63 C16 63 22 56 27 46 Z" fill="url(#leaf)" stroke="${GOLD}" stroke-width="2.5"/>
<path d="M76 44 C88 44 95 53 93 63 C84 63 78 56 73 46 Z" fill="url(#leaf)" stroke="${GOLD}" stroke-width="2.5"/>
<ellipse cx="15" cy="51" rx="2" ry="3.5" fill="#E8F5E9" opacity=".8" transform="rotate(-35 15 51)"/>
<ellipse cx="85" cy="51" rx="2" ry="3.5" fill="#E8F5E9" opacity=".8" transform="rotate(35 85 51)"/>
</svg>`
  },
  {
    key: 'rice-master', name: '干饭达人', category: '创作', rarity: '稀有',
    bg: ['#FF9E62', '#E8432E'], target: 30,
    desc: '累计发布 30 条晒吃帖',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="bowl" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F0E2D2"/></linearGradient></defs>
<path d="M14 46 C14 74 32 88 50 88 C68 88 86 74 86 46 Z" fill="url(#bowl)" stroke="${GOLD}" stroke-width="3"/>
<ellipse cx="50" cy="46" rx="36" ry="8" fill="url(#bowl)" stroke="${GOLD}" stroke-width="2.5"/>
<ellipse cx="50" cy="42" rx="29" ry="17" fill="#FFF9EC" stroke="${GOLD}" stroke-width="2.5"/>
<circle cx="38" cy="38" r="2" fill="#F0DFBC"/><circle cx="50" cy="34" r="2" fill="#F0DFBC"/>
<circle cx="62" cy="38" r="2" fill="#F0DFBC"/><circle cx="44" cy="45" r="2" fill="#F0DFBC"/>
<circle cx="56" cy="45" r="2" fill="#F0DFBC"/>
<path d="M18 48 C21 41 31 37 41 37" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" opacity=".9"/>
</svg>`
  },
  {
    key: 'taotie', name: '饕餮', category: '创作', rarity: '传说',
    bg: ['#6D4C41', '#2E1B12'], target: 100,
    desc: '累计发布 100 条晒吃帖',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="bronze" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#D9B64A"/><stop offset="1" stop-color="#8B6914"/></linearGradient></defs>
<path d="M30 36 C21 24 22 10 36 7 C40 17 41 27 39 36 Z" fill="url(#bronze)" stroke="${GOLD}" stroke-width="2.5"/>
<path d="M70 36 C79 24 78 10 64 7 C60 17 59 27 61 36 Z" fill="url(#bronze)" stroke="${GOLD}" stroke-width="2.5"/>
<path d="M20 42 C28 33 40 35 48 41" fill="none" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>
<path d="M80 42 C72 33 60 35 52 41" fill="none" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>
<circle cx="34" cy="48" r="7" fill="#C0392B" stroke="${GOLD}" stroke-width="2.5"/>
<path d="M34 44 a4 4 0 1 0 4 4" fill="none" stroke="#FFD9A0" stroke-width="1.5"/>
<circle cx="66" cy="48" r="7" fill="#C0392B" stroke="${GOLD}" stroke-width="2.5"/>
<path d="M66 44 a4 4 0 1 0 4 4" fill="none" stroke="#FFD9A0" stroke-width="1.5"/>
<path d="M43 56 C43 50 57 50 57 56 L61 66 C61 71 39 71 39 66 Z" fill="url(#bronze)" stroke="${GOLD}" stroke-width="2.5"/>
<path d="M27 70 L34 79 L38 70" fill="none" stroke="${GOLD}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
<path d="M73 70 L66 79 L62 70" fill="none" stroke="${GOLD}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`
  },
  {
    key: 'chef-hat', name: '大厨之星', category: '创作', rarity: '普通',
    bg: ['#388E4A', '#1B4F2A'], target: 1,
    desc: '发布第 1 条大厨TV 教程',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="hat" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E4E4E4"/></linearGradient></defs>
<path d="M18 46 C16 20 30 12 40 22 C44 16 56 16 60 24 C68 14 84 18 82 46 Z" fill="url(#hat)" stroke="${GOLD}" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M22 46 C22 52 78 52 78 46 L78 60 C78 66 22 66 22 60 Z" fill="url(#hat)" stroke="${GOLD}" stroke-width="2.5"/>
<path d="M26 52 C34 55 66 55 74 52" fill="none" stroke="#C9C9C9" stroke-width="2"/>
<path d="M34 30 C40 26 60 26 66 30" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" opacity=".9"/>
</svg>`
  },
  {
    key: 'food-writer', name: '美食作家', category: '创作', rarity: '史诗',
    bg: ['#C9DCA0', '#93A966'], target: 20,
    desc: '累计发布 20 条大厨TV 教程',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<g transform="rotate(30 50 50)">
<polygon points="41,8 59,8 59,58 41,58" fill="#E0A96D" stroke="${GOLD}" stroke-width="2.5"/>
<line x1="47" y1="10" x2="47" y2="56" stroke="#C08457" stroke-width="2"/>
<line x1="53" y1="10" x2="53" y2="56" stroke="#C08457" stroke-width="2"/>
<line x1="41" y1="16" x2="59" y2="16" stroke="#F5D5AC" stroke-width="2" opacity=".8"/>
<polygon points="41,58 59,58 50,82" fill="#C9843A" stroke="${GOLD}" stroke-width="2.5" stroke-linejoin="round"/>
<polygon points="46.5,71 53.5,71 50,81" fill="#3E3A39" stroke="${GOLD}" stroke-width="1.5" stroke-linejoin="round"/>
</g>
</svg>`
  },
  {
    key: 'shutter', name: '快门美食家', category: '创作', rarity: '稀有',
    bg: ['#C7CFD8', '#8E9AA8'], target: 1,
    desc: '发布过 1 条带图晒吃帖',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="cam" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#8A97A5"/><stop offset="1" stop-color="#4E5B68"/></linearGradient></defs>
<path d="M35 40 L41 27 C43 23 57 23 59 27 L65 40 Z" fill="#5A6673" stroke="${GOLD}" stroke-width="2.5" stroke-linejoin="round"/>
<rect x="14" y="38" width="72" height="40" rx="8" fill="url(#cam)" stroke="${GOLD}" stroke-width="2.5"/>
<circle cx="50" cy="57" r="15" fill="#2F3640" stroke="${GOLD}" stroke-width="2.5"/>
<circle cx="50" cy="57" r="9" fill="url(#cam)" stroke="${GOLD}" stroke-width="2"/>
<circle cx="47" cy="54" r="3" fill="#FFFFFF" opacity=".65"/>
<circle cx="23" cy="48" r="3" fill="#FFE9A8" stroke="${GOLD}" stroke-width="1.5"/>
<circle cx="77" cy="48" r="3" fill="#FFE9A8" stroke="${GOLD}" stroke-width="1.5"/>
</svg>`
  },
  {
    key: 'heart-likes', name: '暖心点赞', category: '互动', rarity: '稀有',
    bg: ['#D6DCE4', '#9AA6B2'], target: 100,
    desc: '累计点赞 100 次（送出）',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="heart" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#FF9EB5"/><stop offset="1" stop-color="#F06292"/></linearGradient></defs>
<path d="M50 82 C46 78 26 62 18 48 C10 34 16 20 30 20 C40 20 46 28 50 35 C54 28 60 20 70 20 C84 20 90 34 82 48 C74 62 54 78 50 82 Z" fill="url(#heart)" stroke="${GOLD}" stroke-width="2.5" stroke-linejoin="round"/>
<ellipse cx="35" cy="30" rx="8" ry="5" fill="#FFD6E0" opacity=".75" transform="rotate(-20 35 30)"/>
<path d="M44 72 C48 77 52 80 50 82" fill="none" stroke="#B2455F" stroke-width="2.5" opacity=".45" stroke-linecap="round"/>
</svg>`
  },
  {
    key: 'gold-words', name: '金口玉言', category: '互动', rarity: '稀有',
    bg: ['#FFC4D6', '#F47AA0'], target: 50,
    desc: '累计评论 50 次',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="bubble" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F1F1F1"/></linearGradient></defs>
<path d="M16 26 C16 17 24 10 34 10 L66 10 C76 10 84 17 84 26 L84 52 C84 61 76 68 66 68 L46 68 L30 80 L35 68 C24 68 16 61 16 52 Z" fill="url(#bubble)" stroke="${GOLD}" stroke-width="2.5" stroke-linejoin="round"/>
<circle cx="50" cy="39" r="4" fill="#FFFFFF" stroke="${GOLD}" stroke-width="1.6"/>
<circle cx="34" cy="39" r="4" fill="#FFFFFF" stroke="${GOLD}" stroke-width="1.6"/>
<circle cx="66" cy="39" r="4" fill="#FFFFFF" stroke="${GOLD}" stroke-width="1.6"/>
</svg>`
  },
  {
    key: 'star-hot', name: '人气王', category: '互动', rarity: '传说',
    bg: ['#74C0FC', '#1E88E5'], target: 100,
    desc: '单条晒吃帖获赞达 100',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="core" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#FFB36B"/><stop offset="1" stop-color="#E8432E"/></linearGradient></defs>
<path d="M50 12 C66 30 78 44 78 60 C78 76 66 88 50 88 C34 88 22 76 22 60 C22 44 34 30 50 12 Z" fill="#BBDEFB" stroke="${GOLD}" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M50 30 C58 40 64 48 64 58 C64 68 58 76 50 76 C42 76 36 68 36 58 C36 48 42 40 50 30 Z" fill="url(#core)" stroke="${GOLD}" stroke-width="2" stroke-linejoin="round"/>
<ellipse cx="44" cy="40" rx="3" ry="6" fill="#FFD9B0" opacity=".85" transform="rotate(-15 44 40)"/>
</svg>`
  },
  {
    key: 'collector', name: '品味收藏家', category: '探索', rarity: '史诗',
    bg: ['#8B7CF0', '#5C46B8'], target: 20,
    desc: '累计收藏 20 道菜',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="gem" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#BDB0FB"/><stop offset="1" stop-color="#7C5CE0"/></linearGradient></defs>
<polygon points="50,14 88,44 50,90 12,44" fill="url(#gem)" stroke="${GOLD}" stroke-width="2.5" stroke-linejoin="round"/>
<polygon points="50,14 72,30 50,44 28,30" fill="#D9D0FC" stroke="${GOLD}" stroke-width="1.5"/>
<line x1="50" y1="14" x2="50" y2="44" stroke="${GOLD}" stroke-width="1.5"/>
<line x1="28" y1="30" x2="72" y2="30" stroke="${GOLD}" stroke-width="1.5"/>
<line x1="12" y1="44" x2="88" y2="44" stroke="${GOLD}" stroke-width="1.5"/>
<line x1="28" y1="30" x2="50" y2="90" stroke="${GOLD}" stroke-width="1.5"/>
<line x1="72" y1="30" x2="50" y2="90" stroke="${GOLD}" stroke-width="1.5"/>
<polygon points="42,18 58,18 58,25 42,25" fill="#F2EEFF" opacity=".95"/>
</svg>`
  },
  {
    key: 'wheel-fish', name: '饭桌锦鲤', category: '探索', rarity: '稀有',
    bg: ['#93A5FF', '#5A6BD8'], target: 200,
    desc: '累计决定 200 次（转盘 + 盲盒）',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="koi2" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#FF8A3D"/><stop offset="1" stop-color="#E8432E"/></linearGradient></defs>
<circle cx="50" cy="50" r="33" fill="none" stroke="#C9A227" stroke-width="6"/>
<circle cx="50" cy="50" r="33" fill="none" stroke="${GOLD}" stroke-width="1.5" opacity=".7"/>
<g stroke="#C9A227" stroke-width="4" stroke-linecap="round">
<line x1="50" y1="25" x2="50" y2="39"/><line x1="50" y1="61" x2="50" y2="75"/>
<line x1="25" y1="50" x2="39" y2="50"/><line x1="61" y1="50" x2="75" y2="50"/>
<line x1="32" y1="32" x2="42" y2="42"/><line x1="58" y1="58" x2="68" y2="68"/>
<line x1="68" y1="32" x2="58" y2="42"/><line x1="42" y1="58" x2="32" y2="68"/>
</g>
<circle cx="50" cy="50" r="12" fill="#FFFFFF" stroke="${GOLD}" stroke-width="2" opacity=".95"/>
<ellipse cx="48" cy="50" rx="7" ry="4.5" fill="url(#koi2)" stroke="${GOLD}" stroke-width="1.5"/>
<path d="M55 50 L60 47 L60 53 Z" fill="#E8432E" stroke="${GOLD}" stroke-width="1.2"/>
<circle cx="44" cy="49" r="1.2" fill="#FFFFFF"/><circle cx="44.6" cy="49" r="0.6" fill="#1B2A4A"/>
</svg>`
  },
  {
    key: 'fish-spirit', name: '锦鲤附体', category: '探索', rarity: '史诗',
    bg: ['#FFB95C', '#F0922B'], target: 50,
    desc: '累计开出 50 个盲盒',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="koi" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#FF8A3D"/><stop offset="1" stop-color="#4FC3F7"/></linearGradient></defs>
<path d="M26 52 C28 38 44 32 55 37 C66 42 72 52 68 61 C64 70 46 71 38 65 C28 60 26 58 26 52 Z" fill="url(#koi)" stroke="${GOLD}" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M64 58 C70 50 82 45 86 48 C84 54 76 60 68 63 Z" fill="#4FC3F7" stroke="${GOLD}" stroke-width="2" stroke-linejoin="round"/>
<path d="M50 36 C53 29 59 29 62 35" fill="none" stroke="${GOLD}" stroke-width="2.5" stroke-linecap="round"/>
<path d="M36 45 C43 42 49 44 53 48" fill="none" stroke="#FFFFFF" stroke-width="1.5" opacity=".7" stroke-linecap="round"/>
<path d="M40 56 C46 53 52 55 56 59" fill="none" stroke="#FFFFFF" stroke-width="1.5" opacity=".7" stroke-linecap="round"/>
<circle cx="33" cy="49" r="3" fill="#FFFFFF" stroke="${GOLD}" stroke-width="1.5"/>
<circle cx="34" cy="49" r="1.5" fill="#1B2A4A"/>
</svg>`
  },
  {
    key: 'ticket-king', name: '兑换收藏家', category: '荣誉', rarity: '史诗',
    bg: ['#E5484D', '#B3262F'], target: 3,
    desc: '累计兑换 3 个兑换码',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="ticket" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#F7DE9A"/><stop offset="1" stop-color="#E0BC5F"/></linearGradient></defs>
<path fill-rule="evenodd" d="M14 34 h72 a6 6 0 0 1 6 6 v24 a6 6 0 0 1 -6 6 h-72 a6 6 0 0 1 -6 -6 v-24 a6 6 0 0 1 6 -6 Z M14 46 a4 4 0 0 1 8 0 a4 4 0 0 1 -8 0 Z M14 58 a4 4 0 0 1 8 0 a4 4 0 0 1 -8 0 Z M86 46 a4 4 0 0 1 8 0 a4 4 0 0 1 -8 0 Z M86 58 a4 4 0 0 1 8 0 a4 4 0 0 1 -8 0 Z" fill="url(#ticket)" stroke="${GOLD}" stroke-width="2.5" stroke-linejoin="round"/>
<line x1="30" y1="46" x2="64" y2="46" stroke="#B8860B" stroke-width="3" stroke-linecap="round" opacity=".55"/>
<line x1="30" y1="57" x2="56" y2="57" stroke="#B8860B" stroke-width="3" stroke-linecap="round" opacity=".55"/>
<line x1="72" y1="38" x2="72" y2="66" stroke="#B8860B" stroke-width="1.5" stroke-dasharray="2 2" opacity=".6"/>
</svg>`
  },
  {
    key: 'max-level', name: '满级传说', category: '荣誉', rarity: '传说',
    bg: ['#FFE9A8', '#FFC46B'], target: 10,
    desc: '等级达到 Lv.10',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="crown" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#FFD97A"/><stop offset="1" stop-color="#FFB400"/></linearGradient></defs>
<circle cx="50" cy="48" r="37" fill="none" stroke="#E8432E" stroke-width="3" opacity=".45"/>
<circle cx="50" cy="48" r="32" fill="none" stroke="#FF6B35" stroke-width="3" opacity=".45"/>
<circle cx="50" cy="48" r="27" fill="none" stroke="#FFB400" stroke-width="3" opacity=".45"/>
<circle cx="50" cy="48" r="22" fill="none" stroke="#4FC3F7" stroke-width="3" opacity=".45"/>
<circle cx="50" cy="48" r="17" fill="none" stroke="#8B7CF0" stroke-width="3" opacity=".45"/>
<path d="M27 64 L23 34 L39 46 L50 26 L61 46 L77 34 L73 64 Z" fill="url(#crown)" stroke="${GOLD}" stroke-width="2.5" stroke-linejoin="round"/>
<rect x="24" y="60" width="52" height="13" rx="5" fill="url(#crown)" stroke="${GOLD}" stroke-width="2.5"/>
<circle cx="38" cy="66" r="2.5" fill="#E8432E" stroke="${GOLD}" stroke-width="1"/>
<circle cx="50" cy="66" r="2.5" fill="#4CAF50" stroke="${GOLD}" stroke-width="1"/>
<circle cx="62" cy="66" r="2.5" fill="#4FC3F7" stroke="${GOLD}" stroke-width="1"/>
</svg>`
  },
  {
    key: 'developer', name: '开发者', category: '特殊', rarity: '特殊',
    bg: ['#3360B8', '#16264D'], target: 1,
    desc: '开发者授予（内测 / 特殊身份）',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="metal" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#E6ECF2"/><stop offset=".5" stop-color="#B3BFCC"/><stop offset="1" stop-color="#8A98A8"/></linearGradient></defs>
<path d="M30 30 L30 16 C30 8 35 5 41 5 L59 5 C65 5 70 8 70 16 L70 30 L61 30 L61 17 L39 17 L39 30 Z" fill="url(#metal)" stroke="${GOLD}" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M35 30 L65 30 L69 76 C69 83 65 88 58 88 L42 88 C35 88 31 83 31 76 Z" fill="url(#metal)" stroke="${GOLD}" stroke-width="2.5" stroke-linejoin="round"/>
<line x1="34" y1="12" x2="38" y2="12" stroke="#FFFFFF" stroke-width="2.5" opacity=".85" stroke-linecap="round"/>
<line x1="40" y1="36" x2="36" y2="76" stroke="#FFFFFF" stroke-width="2" opacity=".6" stroke-linecap="round"/>
<circle cx="50" cy="82" r="3" fill="#1C2F66" stroke="${GOLD}" stroke-width="1.5"/>
</svg>`
  },
  {
    key: 'reward', name: '打赏开发者', category: '特殊', rarity: '特殊',
    // 饭碗小吉祥物抱着爱心（UI/打赏功能设计文档.md 3.2 定稿：左圆眼+右弧眼眯眼；完整奖章图见 images/brand/reward-badge-128.png）
    bg: ['#FFD97A', '#E96B0C'], target: 1,
    desc: '打赏开发者后凭兑换码解锁（更多 → 打赏开发者）',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="rwBowl" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#FFE08A"/><stop offset="1" stop-color="#F2B944"/></linearGradient></defs>
<ellipse cx="50" cy="33" rx="24" ry="12" fill="#FFFDF8" stroke="${GOLD}" stroke-width="2.5"/>
<circle cx="40" cy="29" r="1.8" fill="#FFC857"/><circle cx="50" cy="25" r="1.8" fill="#FFC857"/>
<circle cx="60" cy="29" r="1.8" fill="#FFC857"/><circle cx="45" cy="36" r="1.8" fill="#FFC857"/>
<circle cx="55" cy="36" r="1.8" fill="#FFC857"/>
<path d="M 26 36 A 24 18 0 0 0 74 36 Z" fill="url(#rwBowl)" stroke="${GOLD}" stroke-width="2.5" stroke-linejoin="round"/>
<ellipse cx="50" cy="36" rx="26" ry="8.5" fill="url(#rwBowl)" stroke="${GOLD}" stroke-width="2.5"/>
<circle cx="42" cy="31" r="2.4" fill="#5A3518"/><path d="M 55.5 31.5 Q 58 28.8 60.5 31.5" fill="none" stroke="#5A3518" stroke-width="2" stroke-linecap="round"/>
<path d="M 45 36 Q 50 39.5 55 36" fill="none" stroke="#5A3518" stroke-width="1.8" stroke-linecap="round"/>
<circle cx="33" cy="34" r="3" fill="#FF8B72" opacity=".85"/><circle cx="67" cy="34" r="3" fill="#FF8B72" opacity=".85"/>
<path d="M 50 84 c -5 -4.2 -8.2 -6.7 -8.2 -10.1 c 0 -2.6 2.1 -4.7 4.7 -4.7 c 1.4 0 2.6 0.6 3.5 1.6 c 0.9 -1 2.1 -1.6 3.5 -1.6 c 2.6 0 4.7 2.1 4.7 4.7 c 0 3.4 -3.2 5.9 -8.2 10.1 z" fill="#FF5364" stroke="${GOLD}" stroke-width="2"/>
<ellipse cx="41" cy="69" rx="3" ry="1.8" fill="#FFA9B5" opacity=".8" transform="rotate(-20 41 69)"/>
</svg>`
  }
]

/* ---------- 帮助函数 ---------- */

// 目录 key → 徽章（含预生成图标 URI）
const BY_KEY = {}
BADGES.forEach((b) => {
  BY_KEY[b.key] = Object.assign({}, b, { uri: iconUri(b.icon), color: RARITY_META[b.rarity].color })
})
// 移除原始 svg 文本减小运行时内存（页面只用 uri）
BADGES.forEach((b) => delete b.icon)

function getBadge(key) {
  return BY_KEY[key] || null
}

// 稀有度信息（color: 'rainbow' 时由组件生成 conic-gradient 环）
function getRarity(rarity) {
  return RARITY_META[rarity] || RARITY_META['普通']
}

// 徽章墙排序：已解锁在前、未解锁在后；组内按目录顺序（同类目相邻）
function sortForWall(progressList) {
  return progressList
    .slice()
    .sort((a, b) => (a.unlocked === b.unlocked ? 0 : a.unlocked ? -1 : 1))
}

// 进度文案（详情弹层）：已解锁 / 未解锁差异描述
function progressText(badge, current) {
  if (badge.target <= 1) return badge.desc
  const unit =
    badge.key === 'star-hot'
      ? '获赞'
      : badge.category === '创作'
        ? '发布'
        : badge.key === 'heart-likes'
          ? '点赞'
          : badge.key === 'gold-words'
            ? '评论'
            : badge.key === 'collector'
              ? '收藏'
              : badge.key === 'ticket-king'
                ? '兑换'
                : '次'
  return current + ' / ' + badge.target + ' ' + unit + ' · 还差 ' + Math.max(0, badge.target - current)
}

// 展示位（帖子昵称行 / 用户主页）：**仅展示已拥有的徽章**（产品要求，2026-08-09）
// 按目录顺序取前 count 枚（默认 5）；不补充未解锁的。点击展示位可展开查看全部徽章
// unlockedList: 云端返回的作者已解锁徽章 [{key, name, rarity, unlockTime}]
function buildDisplayBadges(unlockedList, count) {
  const n = count || 5
  const unlocked = unlockedList || []
  const unlockedSet = new Set(unlocked.map((b) => b.key))
  const timeMap = {}
  unlocked.forEach((b) => { timeMap[b.key] = b.unlockTime || 0 })
  return BADGES
    .filter((b) => unlockedSet.has(b.key)) // 仅已拥有，目录顺序
    .slice(0, n)
    .map((b) => ({
      key: b.key,
      name: b.name,
      rarity: b.rarity,
      unlocked: true,
      unlockTime: timeMap[b.key] || 0
    }))
}

// 全部徽章（展开面板）：全量目录顺序，带 unlocked 标记
function buildAllBadges(unlockedList) {
  const unlocked = unlockedList || []
  const unlockedSet = new Set(unlocked.map((b) => b.key))
  const timeMap = {}
  unlocked.forEach((b) => { timeMap[b.key] = b.unlockTime || 0 })
  return BADGES.map((b) => ({
    key: b.key,
    name: b.name,
    rarity: b.rarity,
    unlocked: unlockedSet.has(b.key),
    unlockTime: timeMap[b.key] || 0
  }))
}

// 头像框权益（2026-08-09）：传说徽章 → 金框；开发者徽章或集齐全部 → 虹彩框
// unlockedList: 作者已解锁徽章 [{key, ...}]；返回 ''（无框）| 'gold' | 'rainbow'
function avatarRingOf(unlockedList) {
  const unlocked = unlockedList || []
  const has = (key) => unlocked.some((b) => b.key === key)
  if (has('developer') || unlocked.length >= BADGES.length) return 'rainbow' // 特殊 / 全收集
  if (unlocked.some((b) => (BY_KEY[b.key] || {}).rarity === '传说')) return 'gold' // 饕餮 / 人气王 / 满级传说
  return ''
}

module.exports = {
  BADGES,
  RARITY_META,
  getBadge,
  getRarity,
  sortForWall,
  progressText,
  buildDisplayBadges,
  buildAllBadges,
  avatarRingOf
}
