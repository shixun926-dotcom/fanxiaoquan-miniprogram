/**
 * utils/util.js —— 通用小工具
 */

// 格式化为 YYYY-MM-DD HH:mm
function formatTime(date) {
  const p = (n) => (n < 10 ? '0' + n : '' + n)
  return (
    date.getFullYear() +
    '-' + p(date.getMonth() + 1) +
    '-' + p(date.getDate()) +
    ' ' + p(date.getHours()) +
    ':' + p(date.getMinutes())
  )
}

module.exports = {
  formatTime
}
