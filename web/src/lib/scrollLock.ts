// 用持有者集合而不是计数器：弹窗层叠或“关一个开一个”同帧发生时，
// 解锁顺序不会把仍然可见的弹窗的滚动锁误删。
const holders = new Set<object>()

function sync() {
  document.documentElement.classList.toggle('is-scroll-locked', holders.size > 0)
}

// 锁在 <html> 上而不是 <body>：body 高度 100%，改它的 overflow 会让 html 的
// 滚动高度塌陷、页面被强制滚回顶部，关闭后也回不到原位置。
export function lockPageScroll(holder: object) {
  holders.add(holder)
  sync()
}

export function unlockPageScroll(holder: object) {
  holders.delete(holder)
  sync()
}
