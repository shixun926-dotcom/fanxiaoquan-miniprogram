/**
 * pages/docs —— 项目经理视角
 * 信息架构 + 外卖联动 L1~L3 方案（静态说明页，数据驱动渲染）
 */

// 把嵌套树拍平为带缩进的行，便于 WXML 渲染
function flatten(node, depth, out) {
  out.push({ name: node.name, meta: node.meta || '', depth })
  ;(node.children || []).forEach((c) => flatten(c, depth + 1, out))
}

const ARCH_TREE = {
  name: '饭小圈小程序',
  meta: '4 个页面 · 3 个 Tab',
  children: [
    {
      name: 'Tab · 饭小圈 pages/feed',
      children: [
        { name: '附近晒吃流（帖子卡片，mock + 用户发帖）' },
        { name: '点赞 / 复制菜名 → L1 提示层' },
        { name: '发帖：菜名（分类可选）+ 图片上传（阿里云 OSS）+ 展示登录头像' }
      ]
    },
    {
      name: 'Tab · 决定 pages/decide',
      children: [
        { name: '转转盘（canvas 动画，每盘 30 道菜 30 选 1，可剔除分类，每次打开自动刷新）' },
        { name: '开盲盒（震动开盒 + 翻牌）' },
        { name: '结果弹层：复制 / 收藏 / 去点外卖' }
      ]
    },
    {
      name: 'Tab · 我的 pages/profile',
      children: [
        { name: '微信授权登录（官方昵称头像填写能力，头像存 OSS）' },
        { name: '默认外卖平台偏好（决定页「去点外卖」生效）' },
        { name: '收藏 / 决定历史（可清空）' },
        { name: '重置演示数据' }
      ]
    },
    { name: '项目经理视角 pages/docs（本页）' },
    {
      name: '数据层：本地目录 + 微信云开发',
      meta: 'utils/mock.js 静态菜品目录 · cloudfunctions/api 云函数',
      children: [
        { name: '云数据库 posts 帖子（含 likers 点赞互通）/ favorites 收藏' },
        { name: 'history 决定记录 · users 用户（openid 身份 + 平台偏好）' },
        { name: '图片仍走阿里云 OSS（utils/oss.js）' }
      ]
    }
  ]
}

const TREE_ROWS = (() => {
  const rows = []
  flatten(ARCH_TREE, 0, rows)
  return rows
})()

const LEVELS = [
  {
    key: 'L1',
    title: '复制菜名 + 提示层',
    status: '原型已实现',
    statusClass: 'done',
    desc: '用户复制菜名后，小程序内提示层演示「打开外卖平台搜索」的交互路径，验证「决定吃什么 → 去下单」的需求与转化意愿。',
    detail: [
      '落地位置：饭小圈「复制菜名」、决定结果弹层「去点外卖」',
      '依赖：无平台合作，成本最低',
      '原型表现：order-hint 组件，step1 已复制菜名 → step2 模拟平台搜索页'
    ]
  },
  {
    key: 'L2',
    title: '平台小程序 path / 白名单 H5',
    status: '待调研',
    statusClass: 'todo',
    desc: '从提示层升级为真实跳转：唤起外卖平台小程序搜索页（小程序页面 path / URL Scheme），或接入其 H5 搜索页（需域名白名单）。',
    detail: [
      '调研：目标平台跳转协议（小程序跳转限制、URL Scheme、H5 白名单域名）',
      '透传：登录态、定位参数（就近门店）、菜名关键词',
      '风险：平台政策变化；真实跳转前需用户授权与二次确认'
    ]
  },
  {
    key: 'L3',
    title: '商务合作：精确跳转 + 回流数据',
    status: '商务阶段',
    statusClass: 'biz',
    desc: '与外卖平台商务对接，拿到精确商品 / 店铺跳转（直接进入目标菜品下单页），并接入回流数据做转化归因。',
    detail: [
      '合作：结算 / 分佣条款、接口权限、跳转能力',
      '回流：跳转量、下单转化、UV 归因（来源 = 饭小圈）',
      '价值：完整转化漏斗 + 商业化基础'
    ]
  }
]

const CHECKLIST = [
  '先跑通 L1：在决定结果页与饭小圈埋「去点外卖」点击埋点，验证真实转化意愿',
  '数据验证后再上 L2 真实跳转；真实跳转前保留复制菜名兜底，不依赖任何平台能力',
  'L3 需要商务与法务，提前对齐归因口径与结算方式',
  '每期验收对齐：跳转成功率、搜索页到达率、下单转化率、用户流失点'
]

Page({
  data: {
    overview: [
      { label: '产品一句话', value: '快速决定吃什么 + 看附近的人吃什么' },
      { label: '原型边界', value: '原生小程序 + 微信云开发：菜品目录与转盘采样在本地（utils/mock.js），帖子 / 点赞 / 收藏 / 历史 / 登录用户存云数据库，经 cloudfunctions/api 云函数读写' },
      { label: '核心体验路径', value: '决定（转盘 / 盲盒）→ 结果弹层 → 复制 / 收藏 / 去点外卖；饭小圈晒吃流 → 点赞 / 复制菜名 / 发帖' }
    ],
    tree: TREE_ROWS,
    levels: LEVELS,
    checklist: CHECKLIST
  }
})
