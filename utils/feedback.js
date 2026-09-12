/**
 * utils/feedback.js —— 意见反馈类型 / 状态常量
 * 与云函数 FEEDBACK_TYPES / FEEDBACK_STATUS 同步维护（云函数无法 require 包外文件，需两边一致）
 * 状态徽章配色与 UI/图标更换设计规格.md 5.4 一致：待处理=灰 #A8A19A、处理中=暖橙 #FFB020、已处理=葱绿 #73B84B（与「我的反馈」图标内状态色一一对应）
 */
const TYPES = [
  { key: 'bug', label: '问题反馈' },
  { key: 'suggestion', label: '功能建议' },
  { key: 'report', label: '内容举报' },
  { key: 'other', label: '其他' }
]

const STATUS = {
  pending: { label: '已收到', cls: 'pending' }, // 灰 #A8A19A
  processing: { label: '处理中', cls: 'processing' }, // 暖橙 #FFB020
  resolved: { label: '已解决', cls: 'resolved' } // 葱绿 #73B84B
}

// 联系方式校验（前端体验层；云函数会再校验一遍）
const CONTACT_RULES = {
  wechat: { placeholder: '微信号（6-20 位字母数字下划线）', pattern: /^[a-zA-Z0-9_]{6,20}$/, tip: '微信号格式：6-20 位字母、数字或下划线' },
  phone: { placeholder: '手机号（11 位）', pattern: /^1\d{10}$/, tip: '手机号格式：11 位数字' },
  email: { placeholder: '邮箱（含 @）', pattern: /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/, tip: '邮箱格式不正确' }
}

module.exports = { TYPES, STATUS, CONTACT_RULES }
