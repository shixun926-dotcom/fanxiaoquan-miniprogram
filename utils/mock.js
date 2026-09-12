/**
 * utils/mock.js —— 饭小圈静态数据目录（本地）
 *
 * 仅保留不随用户变化的静态内容：分类、菜品（含专属 emoji）、转盘配色、
 * 外卖平台、采样/随机选菜逻辑。
 * 用户数据（帖子/点赞/收藏/历史/登录）已迁到微信云开发，见 utils/api.js。
 */
const CATEGORIES = [
  { name: '火锅', emoji: '🍲' },
  { name: '烧烤', emoji: '🍖' },
  { name: '快餐', emoji: '🍔' },
  { name: '面食', emoji: '🍜' },
  { name: '日料', emoji: '🍣' },
  { name: '川湘菜', emoji: '🌶️' },
  { name: '甜品', emoji: '🍰' },
  { name: '轻食', emoji: '🥗' },
  { name: '麻辣烫', emoji: '🥘' },
  { name: '小吃', emoji: '🥟' }
]

// 每道菜配一个更贴切的专属 emoji（盲盒揭晓 / 结果弹层 / 收藏 / 历史 / 晒吃占位图都用它）
const DISHES = {
  火锅: [
    { dish: '重庆老火锅', emoji: '🍲' },
    { dish: '番茄牛腩锅', emoji: '🍲' },
    { dish: '寿喜烧', emoji: '🥘' },
    { dish: '椰子鸡火锅', emoji: '🍲' },
    { dish: '潮汕牛肉锅', emoji: '🍲' },
    { dish: '菌汤锅', emoji: '🍲' },
    { dish: '酸菜鱼锅', emoji: '🥘' },
    { dish: '九宫格火锅', emoji: '🍲' }
  ],
  烧烤: [
    { dish: '东北烤串', emoji: '🍢' },
    { dish: '韩式烤肉', emoji: '🍖' },
    { dish: '烤鱼', emoji: '🐟' },
    { dish: '铁板鱿鱼', emoji: '🦑' },
    { dish: '新疆羊肉串', emoji: '🍢' },
    { dish: '烤生蚝', emoji: '🦪' },
    { dish: '淄博烧烤', emoji: '🍢' },
    { dish: '烤茄子', emoji: '🍆' }
  ],
  快餐: [
    { dish: '香辣鸡腿堡', emoji: '🍔' },
    { dish: '黄焖鸡米饭', emoji: '🍗' },
    { dish: '卤肉饭', emoji: '🍛' },
    { dish: '煎饼果子', emoji: '🫓' },
    { dish: '酸辣粉', emoji: '🍜' },
    { dish: '麻辣香锅', emoji: '🥘' },
    { dish: '蛋炒饭', emoji: '🍚' },
    { dish: '鸡排饭', emoji: '🍛' }
  ],
  面食: [
    { dish: '牛肉拉面', emoji: '🍜' },
    { dish: '重庆小面', emoji: '🍜' },
    { dish: '葱油拌面', emoji: '🍝' },
    { dish: '炒面片', emoji: '🍝' },
    { dish: '刀削面', emoji: '🍜' },
    { dish: '云吞面', emoji: '🍜' },
    { dish: '热干面', emoji: '🍝' },
    { dish: '兰州牛肉面', emoji: '🍜' }
  ],
  日料: [
    { dish: '鳗鱼饭', emoji: '🍱' },
    { dish: '三文鱼刺身', emoji: '🍣' },
    { dish: '寿司拼盘', emoji: '🍣' },
    { dish: '日式叉烧拉面', emoji: '🍜' },
    { dish: '天妇罗', emoji: '🍤' },
    { dish: '亲子丼', emoji: '🍛' },
    { dish: '章鱼小丸子', emoji: '🐙' },
    { dish: '味噌汤', emoji: '🍵' }
  ],
  川湘菜: [
    { dish: '水煮鱼', emoji: '🐟' },
    { dish: '小炒黄牛肉', emoji: '🍖' },
    { dish: '剁椒鱼头', emoji: '🐟' },
    { dish: '辣子鸡丁', emoji: '🍗' },
    { dish: '毛血旺', emoji: '🥘' },
    { dish: '麻婆豆腐', emoji: '🥘' },
    { dish: '口水鸡', emoji: '🍗' },
    { dish: '回锅肉', emoji: '🍖' }
  ],
  甜品: [
    { dish: '杨枝甘露', emoji: '🍧' },
    { dish: '提拉米苏', emoji: '🍰' },
    { dish: '芋圆烧仙草', emoji: '🍧' },
    { dish: '豆乳盒子', emoji: '🍰' },
    { dish: '芒果班戟', emoji: '🥞' },
    { dish: '双皮奶', emoji: '🍮' },
    { dish: '冰粉', emoji: '🍧' },
    { dish: '舒芙蕾', emoji: '🥞' }
  ],
  轻食: [
    { dish: '鸡胸肉沙拉', emoji: '🥗' },
    { dish: '牛油果吐司', emoji: '🥑' },
    { dish: '藜麦能量碗', emoji: '🥗' },
    { dish: '缤纷蔬菜卷', emoji: '🥗' },
    { dish: '希腊酸奶杯', emoji: '🥛' },
    { dish: '三文鱼沙拉', emoji: '🥗' },
    { dish: '荞麦冷面', emoji: '🍜' },
    { dish: '蛋白能量碗', emoji: '🥣' }
  ],
  麻辣烫: [
    { dish: '骨汤麻辣烫', emoji: '🥘' },
    { dish: '干拌麻辣烫', emoji: '🥘' },
    { dish: '番茄麻辣烫', emoji: '🥘' },
    { dish: '冒菜', emoji: '🥘' },
    { dish: '冷锅串串', emoji: '🍢' },
    { dish: '麻辣拌', emoji: '🥘' },
    { dish: '关东煮', emoji: '🍢' },
    { dish: '酸汤麻辣烫', emoji: '🥘' }
  ],
  小吃: [
    { dish: '生煎包', emoji: '🥟' },
    { dish: '灌汤包', emoji: '🥟' },
    { dish: '韭菜盒子', emoji: '🫓' },
    { dish: '肉夹馍', emoji: '🫓' },
    { dish: '肠粉', emoji: '🍥' },
    { dish: '螺蛳粉', emoji: '🍜' },
    { dish: '臭豆腐', emoji: '🧆' },
    { dish: '炸串', emoji: '🍢' }
  ]
}

// 发帖无图时的表情占位
const POST_EMOJIS = ['🍜', '🍔', '🍣', '🍛', '🥘', '🌮', '🍗', '🍰', '🥟', '🍕']

// 转盘扇区配色（大锅转盘：暖色循环 12 色，设计规范 4.2）
const WHEEL_COLORS = [
  '#E8432E', '#FF6B35', '#FFB400', '#FF8A3D', '#E85B3A', '#FFC46B',
  '#F4A261', '#D96A3F', '#E8734A', '#FFB27A', '#C96F3A', '#F2836B'
]

// 默认外卖平台偏好
const PLATFORMS = [
  { key: 'meituan', label: '美团外卖' },
  { key: 'eleme', label: '饿了么' },
  { key: 'jingdong', label: '京东外卖' },
  { key: 'none', label: '暂不设置' }
]

function getPlatformLabel(key) {
  const p = PLATFORMS.find((x) => x.key === key)
  return p ? p.label : '外卖平台'
}

/* ---------- 随机选菜 ---------- */

function pickDish(category) {
  const list = DISHES[category]
  if (!list || !list.length) return '随便吃点'
  return list[Math.floor(Math.random() * list.length)].dish
}

// segments 为空时从全部分类里随机；emoji 取菜品专属
function randomDish(segments) {
  const pool = segments && segments.length ? segments : CATEGORIES.map((c) => c.name)
  const cat = pool[Math.floor(Math.random() * pool.length)]
  const catInfo = CATEGORIES.find((c) => c.name === cat) || {}
  const list = DISHES[cat] || []
  const item = list.length ? list[Math.floor(Math.random() * list.length)] : { dish: '随便吃点' }
  return { dish: item.dish, category: cat, emoji: item.emoji || catInfo.emoji || '🍽️' }
}

// Fisher-Yates 洗牌
function shuffle(arr) {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = out[i]
    out[i] = out[j]
    out[j] = t
  }
  return out
}

// 为转盘采样 count 道菜（剔除指定分类），返回 [{ dish, category, emoji }]
function sampleWheelDishes(excludedNames, count) {
  const pool = []
  CATEGORIES.forEach((c) => {
    if (excludedNames.indexOf(c.name) > -1) return
    ;(DISHES[c.name] || []).forEach((item) =>
      pool.push({ dish: item.dish, category: c.name, emoji: item.emoji })
    )
  })
  return shuffle(pool).slice(0, count)
}

module.exports = {
  CATEGORIES,
  DISHES,
  POST_EMOJIS,
  WHEEL_COLORS,
  PLATFORMS,
  getPlatformLabel,
  pickDish,
  randomDish,
  shuffle,
  sampleWheelDishes
}
