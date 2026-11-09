<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { api } from '@/api/client'
import { REGIONS, refresh, toast, ui } from '@/stores/ui'
import { pendingAlerts } from '@/stores/alerts'

const regionOpen = ref(false)
const statusOpen = ref(true)
const actionsOpen = ref(true)
const isFull = ref(false)

// 折叠分区的高度补间：JS 驱动而非 CSS 过渡，避免系统「减少动画」偏好
// 把全局 transition-duration 归零导致拉伸消失（与遮罩动画同一套机制）
const statusWrap = ref<HTMLElement | null>(null)
const actionsWrap = ref<HTMLElement | null>(null)
const statusH = ref('auto')
const actionsH = ref('auto')
// 区域菜单同样由 JS 高度补间驱动；每个动画独立 RAF，互不打断
const regionWrap = ref<HTMLElement | null>(null)
const regionH = ref('0px')
const sectionRaf = { id: 0 }
const regionRaf = { id: 0 }

const quadEaseInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)

function tweenCollapse(wrap: HTMLElement, open: boolean, setH: (v: string) => void, rafBox: { id: number }) {
  cancelAnimationFrame(rafBox.id)
  const inner = wrap.querySelector<HTMLElement>('.info-section__inner, .region-grid__inner')
  if (!inner) return
  const from = wrap.offsetHeight
  const target = open ? inner.scrollHeight : 0
  if (Math.abs(from - target) < 1) {
    setH(open ? 'auto' : '0px')
    return
  }
  const start = performance.now()
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / 260)
    const eased = quadEaseInOut(p)
    setH(`${from + (target - from) * eased}px`)
    if (p < 1) rafBox.id = requestAnimationFrame(step)
    else setH(open ? 'auto' : '0px')
  }
  rafBox.id = requestAnimationFrame(step)
}
watch(statusOpen, open => { if (statusWrap.value) tweenCollapse(statusWrap.value, open, v => statusH.value = v, sectionRaf) })
watch(actionsOpen, open => { if (actionsWrap.value) tweenCollapse(actionsWrap.value, open, v => actionsH.value = v, sectionRaf) })
watch(regionOpen, open => { if (regionWrap.value) tweenCollapse(regionWrap.value, open, v => regionH.value = v, regionRaf) })

const regionLabel = computed(() => (ui.region === 'all' ? '全国' : ui.region))
const modeLabel = api.mode === 'api' ? '真实接口' : '本地模拟'

function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen()
}
function onFullscreenChange() {
  isFull.value = Boolean(document.fullscreenElement)
}
onMounted(() => document.addEventListener('fullscreenchange', onFullscreenChange))
onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  cancelAnimationFrame(sectionRaf.id)
  cancelAnimationFrame(regionRaf.id)
})

function close() {
  ui.infoOpen = false
}
function run(fn: () => void) {
  // 页面级操作（刷新/导出/打印等）执行后收起面板
  close()
  fn()
}
function openOver(fn: () => void) {
  // 抽屉/弹窗类操作：面板保留在下方，退出浮层后面板仍在
  fn()
}
function onRefresh() {
  refresh()
  toast('info', '数据已刷新', '已按当前筛选条件重新拉取')
}
function exportCurrent() {
  window.dispatchEvent(new CustomEvent('telco:export'))
}
function printPage() {
  window.print()
}
async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    toast('success', '链接已复制', '当前筛选条件不在链接中，仅复制页面地址')
  } catch {
    toast('error', '复制失败', '浏览器未授权剪贴板')
  }
}
</script>

<template>
  <div class="info-bar">
    <button
      class="info-toggle"
      :aria-expanded="ui.infoOpen"
      aria-label="信息栏"
      title="信息栏"
      @click="ui.infoOpen = !ui.infoOpen"
    >
      <Icon name="info" :size="16" />
      <span v-if="pendingAlerts" class="info-toggle__badge num">{{ pendingAlerts }}</span>
    </button>

    <div v-if="ui.infoOpen" class="info-backdrop" @click="close" />
    <transition name="info-panel">
      <div v-if="ui.infoOpen" class="info-panel" role="dialog" aria-label="信息栏">
        <div class="info-panel__head">
          <strong>信息栏</strong>
          <button class="info-panel__close" aria-label="收起信息栏" @click="close"><Icon name="close" :size="14" /></button>
        </div>        <section class="info-section">
          <button class="info-section__head" :aria-expanded="statusOpen" @click="statusOpen = !statusOpen">
            <Icon name="activity" :size="14" />
            <span>运行状态</span>
            <Icon class="info-section__chevron" name="chevron-down" :size="14" />
          </button>
          <div ref="statusWrap" class="info-section__collapse" :style="{ height: statusH }">
            <div class="info-section__inner">
              <div class="info-section__body">
                <div class="info-row">
                  <span class="info-row__label"><Icon name="server" :size="13" />数据模式</span>
                  <span class="info-row__value"><i class="dot dot--green" />{{ modeLabel }}</span>
                </div>
                <div class="info-row">
                  <span class="info-row__label"><Icon name="globe" :size="13" />当前区域</span>
                  <button class="info-row__value info-row__value--btn" @click="regionOpen = !regionOpen">
                    {{ regionLabel }}<Icon name="chevron-down" :size="12" />
                  </button>
                </div>
                <div ref="regionWrap" class="region-grid__collapse" :style="{ height: regionH }">
                  <div class="region-grid__inner">
                    <div class="region-grid" role="listbox">
                      <button
                        v-for="r in REGIONS"
                        :key="r"
                        class="region-grid__item"
                        :class="{ 'is-selected': ui.region === r }"
                        role="option"
                        :aria-selected="ui.region === r"
                        @click="ui.region = r; regionOpen = false; close()"
                      >
                        {{ r === 'all' ? '全国' : r }}
                      </button>
                    </div>
                  </div>
                </div>
                <div class="info-row">
                  <span class="info-row__label"><Icon name="clock" :size="13" />数据更新</span>
                  <span class="info-row__value">{{ ui.lastUpdated === '—' ? '演示数据' : `更新于 ${ui.lastUpdated}` }}</span>
                </div>
                <button class="info-row" @click="openOver(() => { ui.alertsOpen = true })">
                  <span class="info-row__label"><Icon name="bell" :size="13" />待处理告警</span>
                  <span class="info-row__value"><b v-if="pendingAlerts" class="info-badge num">{{ pendingAlerts }}</b><span v-else class="info-ok">暂无</span></span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="info-section">
          <button class="info-section__head" :aria-expanded="actionsOpen" @click="actionsOpen = !actionsOpen">
            <Icon name="zap" :size="14" />
            <span>快捷操作</span>
            <Icon class="info-section__chevron" name="chevron-down" :size="14" />
          </button>
          <div ref="actionsWrap" class="info-section__collapse" :style="{ height: actionsH }">
            <div class="info-section__inner">
              <div class="info-section__body">
                <button class="info-row" @click="run(onRefresh)"><span class="info-row__label"><Icon name="refresh" :size="13" />刷新数据</span><span class="info-row__hint">R</span></button>
                <button class="info-row" @click="run(exportCurrent)"><span class="info-row__label"><Icon name="download" :size="13" />导出当前页 CSV</span><span class="info-row__hint" /></button>
                <button class="info-row" @click="run(printPage)"><span class="info-row__label"><Icon name="printer" :size="13" />打印 / 存为 PDF</span><span class="info-row__hint" /></button>
                <button class="info-row" @click="run(copyLink)"><span class="info-row__label"><Icon name="copy" :size="13" />复制页面链接</span><span class="info-row__hint" /></button>
                <button class="info-row" @click="run(toggleFull)"><span class="info-row__label"><Icon :name="isFull ? 'compress' : 'expand'" :size="13" />{{ isFull ? '退出全屏' : '全屏演示' }}</span><span class="info-row__hint" /></button>
                <button class="info-row" @click="openOver(() => { ui.settingsOpen = true })"><span class="info-row__label"><Icon name="settings" :size="13" />偏好设置</span><span class="info-row__hint" /></button>
                <button class="info-row" @click="openOver(() => { ui.shortcutsOpen = true })"><span class="info-row__label"><Icon name="command" :size="13" />快捷键</span><span class="info-row__hint"><span class="kbd">?</span></span></button>
                <button class="info-row" @click="openOver(() => { ui.commandOpen = true })"><span class="info-row__label"><Icon name="search" :size="13" />全局搜索</span><span class="info-row__hint"><span class="kbd">Ctrl K</span></span></button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.info-bar {
  position: relative;
  display: inline-flex;
}

.info-toggle {
  position: relative;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  color: var(--text-2);
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface);
  transition: border-color 0.15s ease, color 0.15s ease, transform 0.15s ease;
}
.info-toggle:hover {
  color: var(--text);
  border-color: var(--border-strong);
}
.info-toggle:active {
  transform: scale(0.96);
}
.info-toggle[aria-expanded='true'] {
  color: var(--primary);
  border-color: var(--primary-border);
  background: var(--primary-soft);
}
.info-toggle__badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  display: grid;
  place-items: center;
  font-size: 10px;
  line-height: 1;
  color: #fff;
  background: var(--red, #d64545);
  border-radius: 9px;
  box-shadow: 0 0 0 2px var(--bg);
}

.info-backdrop {
  position: fixed;
  inset: 0;
  z-index: 59;
  background: transparent;
}

.info-panel {
  position: fixed;
  top: calc(var(--topbar-h) + 10px);
  right: 24px;
  width: 320px;
  max-width: calc(100vw - 24px);
  z-index: 60;
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  backdrop-filter: saturate(160%) blur(14px);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 14px 40px rgba(13, 22, 41, 0.14);
  overflow: hidden;
}

.info-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px 9px;
}
.info-panel__head strong {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.info-panel__close {
  color: var(--text-3);
  padding: 3px;
  border-radius: 5px;
  display: grid;
  place-items: center;
}
.info-panel__close:hover {
  color: var(--text);
  background: var(--surface-2);
}

.info-section + .info-section {
  border-top: 1px solid var(--border);
}
.info-section__head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 16px;
  font-size: 11.5px;
  font-weight: 550;
  color: var(--text-2);
  letter-spacing: 0.03em;
}
.info-section__head:hover {
  color: var(--text);
  background: var(--surface-2);
}
.info-section__head > svg:first-child {
  color: var(--primary);
}
.info-section__chevron {
  margin-left: auto;
  color: var(--text-3);
  transition: transform 0.2s ease;
}
.info-section__head[aria-expanded='false'] .info-section__chevron {
  transform: rotate(-90deg);
}
/* 折叠分区与区域菜单：高度由 JS 补间驱动，这里只负责裁切 */
.info-section__collapse,
.region-grid__collapse {
  overflow: hidden;
}
.info-section__inner {
  overflow: hidden;
  min-height: 0;
}
.info-section__body {
  padding: 2px 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 8px 8px;
  border-radius: 7px;
  font-size: 12px;
  color: var(--text-2);
  text-align: left;
}
.info-row:hover {
  background: var(--surface-2);
  color: var(--text);
}
.info-row__label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  color: inherit;
}
.info-row__label svg {
  color: var(--text-3);
  flex-shrink: 0;
}
.info-row__value {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
  font-size: 11.5px;
  white-space: nowrap;
}
.info-row__value--btn {
  color: var(--primary);
  background: transparent;
}
.info-row__hint {
  color: var(--text-3);
  font-size: 11px;
  display: inline-flex;
  align-items: center;
}

.info-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: grid;
  place-items: center;
  font-size: 10.5px;
  color: #fff;
  background: var(--red, #d64545);
  border-radius: 9px;
}
.info-ok {
  color: var(--text-3);
}

.dot--green {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--green, #1d9e6f);
}

.region-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  padding: 2px 8px 8px;
}
.region-grid__item {
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 11.5px;
  color: var(--text-2);
  text-align: left;
}
.region-grid__item:hover {
  background: var(--surface-2);
}
.region-grid__item.is-selected {
  color: var(--primary);
  background: var(--primary-soft);
  font-weight: 550;
}

.info-panel-enter-active,
.info-panel-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.info-panel-enter-from,
.info-panel-leave-to {
  opacity: 0;
  transform: translateY(-5px) scale(0.98);
}

@media (max-width: 680px) {
  .info-panel {
    right: 12px;
  }
}
</style>
