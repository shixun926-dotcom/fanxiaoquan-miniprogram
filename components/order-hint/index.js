/**
 * components/order-hint —— 外卖联动 L1 提示层
 *
 * 原型阶段用「复制菜名 + 提示层」演示「决定吃什么 → 去外卖平台下单」的交互路径。
 * step 1：已复制菜名，说明正式版将唤起目标外卖平台搜索；
 * step 2：模拟目标平台搜索页（正式版由 L2/L3 的跳转能力承接）。
 */
const mock = require('../../utils/mock')

Component({
  properties: {
    show: { type: Boolean, value: false },
    dish: { type: String, value: '' },
    platformKey: { type: String, value: 'meituan' }
  },

  data: {
    step: 1,
    platformLabel: ''
  },

  observers: {
    show(v) {
      if (v) {
        this.setData({
          step: 1,
          platformLabel: mock.getPlatformLabel(this.properties.platformKey)
        })
      }
    }
  },

  methods: {
    noop() {},
    close() {
      this.triggerEvent('close')
    },
    next() {
      this.setData({ step: 2 })
    },
    done() {
      this.triggerEvent('close')
    }
  }
})
