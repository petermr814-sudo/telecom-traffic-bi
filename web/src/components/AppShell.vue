<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Icon from './Icon.vue'
import { loadAlerts, pendingAlerts } from '@/stores/alerts'
import {
  isLoading, RANGE_OPTIONS, REGIONS, refresh, setRange, setRegion, toast, ui
} from '@/stores/ui'

const route = useRoute()
const meta = computed(() => route.meta as { title: string; subtitle: string; group: string; hideFilters?: boolean; modeLabel?: string; compareable?: boolean })
const regionLabel = computed(() => (ui.region === 'all' ? '全国' : ui.region))

const regionOpen = ref(false)
const exportOpen = ref(false)
const moreOpen = ref(false)
const isFull = ref(false)

const nav = [
  { group: '分析', items: [
    { to: '/overview', label: '运营总览', icon: 'overview' },
    { to: '/hourly', label: '时段分析', icon: 'clock' },
    { to: '/region', label: '区域分布', icon: 'map' }
  ] },
  { group: '运营', items: [
    { to: '/cells', label: '资源与扩容', icon: 'tower' },
    { to: '/realtime', label: '实时监控', icon: 'activity', live: true }
  ] },
  { group: '系统', items: [
    { to: '/pipeline', label: '数据任务', icon: 'database' }
  ] }
]

function closeMenus() {
  regionOpen.value = false
  exportOpen.value = false
  moreOpen.value = false
}

function onRefresh() {
  refresh()
  toast('info', '数据已刷新', '已按当前筛选条件重新拉取')
}

function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen()
}

function onFullscreenChange() {
  isFull.value = Boolean(document.fullscreenElement)
}

function exportCurrent() {
  closeMenus()
  window.dispatchEvent(new CustomEvent('telco:export'))
}

function printPage() {
  closeMenus()
  window.print()
}

async function copyLink() {
  closeMenus()
  try {
    await navigator.clipboard.writeText(window.location.href)
    toast('success', '链接已复制', '当前筛选条件不在链接中，仅复制页面地址')
  } catch {
    toast('error', '复制失败', '浏览器未授权剪贴板')
  }
}

let alertTimer = 0

onMounted(() => {
  loadAlerts()
  alertTimer = window.setInterval(() => loadAlerts(true), 60_000)
  document.addEventListener('fullscreenchange', onFullscreenChange)
})

watch(
  () => ui.tick,
  () => loadAlerts(true)
)

onUnmounted(() => {
  window.clearInterval(alertTimer)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
})
</script>

<template>
  <div class="shell" :class="{ 'is-collapsed': ui.sidebarCollapsed }">
    <aside class="sidebar no-print">
      <div
        class="brand"
        :class="{ 'brand--expandable': ui.sidebarCollapsed }"
        :title="ui.sidebarCollapsed ? '点击展开侧栏' : undefined"
        @click="ui.sidebarCollapsed && (ui.sidebarCollapsed = false)"
      >
        <div class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="white" stroke-width="2.1" stroke-linecap="round">
            <path d="M4 17v-4" />
            <path d="M8.6 17V9.5" />
            <path d="M13.2 17V6" />
            <path d="M17.8 17v-2.4" />
            <path d="M3 20h18" />
          </svg>
        </div>
        <div class="brand-text">
          <strong>TeleScope</strong>
          <span>电信流量运营平台</span>
        </div>
        <button class="collapse-btn" :aria-label="ui.sidebarCollapsed ? '展开侧栏' : '收起侧栏'" @click.stop="ui.sidebarCollapsed = !ui.sidebarCollapsed">
          <Icon :name="ui.sidebarCollapsed ? 'chevron-right' : 'chevron-left'" :size="15" />
        </button>
      </div>

      <nav class="nav" aria-label="主导航">
        <div v-for="g in nav" :key="g.group" class="nav-group">
          <div class="nav-label">{{ g.group }}</div>
          <RouterLink
            v-for="item in g.items"
            :key="item.to"
            :to="item.to"
            class="nav-item"
            :class="{ 'is-active': route.path === item.to }"
            :title="ui.sidebarCollapsed ? item.label : undefined"
            :data-label="item.label"
            :aria-label="item.label"
          >
            <Icon :name="item.icon" :size="17" />
            <span class="nav-text">{{ item.label }}</span>
            <span v-if="item.live" class="live-tag">LIVE</span>
          </RouterLink>
        </div>
      </nav>

      <div class="sidebar-foot">
        <button
          class="collapse-row"
          :title="ui.sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
          :aria-label="ui.sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
          @click="ui.sidebarCollapsed = !ui.sidebarCollapsed"
        >
          <Icon :name="ui.sidebarCollapsed ? 'chevron-right' : 'chevron-left'" :size="14" />
          <span>收起侧栏</span>
        </button>
        <div class="conn-card" role="status">
          <div class="conn-row">
            <span class="dot dot--pulse conn-dot" />
            <span class="conn-title">数据连接正常</span>
          </div>
          <p class="conn-meta">Mock 演示数据 · 契约 v1</p>
          <button class="conn-btn" @click="ui.settingsOpen = true">
            切换真实后端
            <Icon name="chevron-right" :size="13" />
          </button>
        </div>
        <div class="user">
          <div class="avatar">运</div>
          <div class="user-text">
            <strong>运营分析中心</strong>
            <span>全网视图 · 只读</span>
          </div>
          <button class="icon-mini" aria-label="设置" @click="ui.settingsOpen = true">
            <Icon name="settings" :size="15" />
          </button>
        </div>
      </div>
    </aside>

    <div class="main">
      <header class="topbar no-print">
        <div class="title-block">
          <div class="crumb">
            <span>{{ meta.group }}</span>
            <Icon name="chevron-right" :size="12" />
            <span class="crumb-cur">{{ meta.title }}</span>
          </div>
          <h1>{{ meta.title }}</h1>
          <p>{{ meta.subtitle }}</p>
        </div>

        <div class="actions">
          <template v-if="!meta.hideFilters">
            <div class="seg" role="group" aria-label="时间范围">
              <button
                v-for="r in RANGE_OPTIONS"
                :key="r.key"
                class="seg__item"
                :class="{ 'is-active': ui.range === r.key }"
                @click="setRange(r.key)"
              >
                {{ r.label }}
              </button>
            </div>

            <div class="dd">
              <button class="btn region-btn" :aria-expanded="regionOpen" @click="closeMenus(); regionOpen = !regionOpen">
                <span class="region-label">{{ regionLabel }}</span>
                <Icon name="chevron-down" :size="14" />
              </button>
              <div v-if="regionOpen" class="dd-backdrop" @click="regionOpen = false" />
              <transition name="fade">
                <div v-if="regionOpen" class="dd-menu dd-menu--region" role="menu">
                  <div class="dd-label">选择区域</div>
                  <button
                    v-for="r in REGIONS"
                    :key="r"
                    class="dd-item"
                    :class="{ 'is-selected': ui.region === r }"
                    role="menuitem"
                    @click="setRegion(r); regionOpen = false"
                  >
                    <span>{{ r === 'all' ? '全国' : r }}</span>
                    <Icon v-if="ui.region === r" name="check" :size="14" />
                  </button>
                </div>
              </transition>
            </div>

            <button
              v-if="meta.compareable"
              class="btn compare-btn"
              :class="{ 'is-on': ui.compare }"
              :aria-pressed="ui.compare"
              title="显示上期同口径数据，用于对比增长"
              @click="ui.compare = !ui.compare"
            >
              <Icon name="layers" :size="15" />
              对比上期
            </button>

            <span class="sync-time num">{{ ui.lastUpdated === '—' ? '尚未同步' : `更新 ${ui.lastUpdated}` }}</span>
          </template>
          <span v-else class="mode-chip">
            <span class="dot dot--pulse" />
            {{ meta.modeLabel }}
          </span>

          <button class="btn btn--icon" aria-label="刷新数据" :class="{ 'is-spinning': isLoading }" @click="onRefresh">
            <Icon name="refresh" :size="16" />
          </button>

          <div class="dd">
            <button class="btn" aria-expanded="exportOpen" @click="closeMenus(); exportOpen = !exportOpen">
              <Icon name="download" :size="15" />
              导出
              <Icon name="chevron-down" :size="13" />
            </button>
            <div v-if="exportOpen" class="dd-backdrop" @click="exportOpen = false" />
            <transition name="fade">
              <div v-if="exportOpen" class="dd-menu" role="menu">
                <button class="dd-item" @click="exportCurrent">
                  <Icon name="table" :size="15" />
                  <span>导出当前页 CSV</span>
                </button>
                <button class="dd-item" @click="printPage">
                  <Icon name="printer" :size="15" />
                  <span>打印 / 存为 PDF</span>
                </button>
                <button class="dd-item" @click="copyLink">
                  <Icon name="copy" :size="15" />
                  <span>复制页面链接</span>
                </button>
              </div>
            </transition>
          </div>

          <button class="btn btn--icon" :aria-label="isFull ? '退出全屏' : '全屏演示'" @click="toggleFull">
            <Icon :name="isFull ? 'compress' : 'expand'" :size="16" />
          </button>

          <button class="btn btn--icon bell" aria-label="告警中心" @click="ui.alertsOpen = true">
            <Icon name="bell" :size="16" />
            <span v-if="pendingAlerts" class="bell-badge num">{{ pendingAlerts }}</span>
          </button>

          <div class="dd">
            <button class="btn btn--icon" aria-label="更多" @click="closeMenus(); moreOpen = !moreOpen">
              <Icon name="more" :size="17" />
            </button>
            <div v-if="moreOpen" class="dd-backdrop" @click="moreOpen = false" />
            <transition name="fade">
              <div v-if="moreOpen" class="dd-menu dd-menu--right" role="menu">
                <button class="dd-item" @click="moreOpen = false; ui.settingsOpen = true">
                  <Icon name="settings" :size="15" />
                  <span>偏好设置</span>
                </button>
                <button class="dd-item" @click="moreOpen = false; ui.shortcutsOpen = true">
                  <Icon name="command" :size="15" />
                  <span>快捷键</span>
                  <span class="dd-kbd"><span class="kbd">?</span></span>
                </button>
                <button class="dd-item" @click="moreOpen = false; ui.commandOpen = true">
                  <Icon name="search" :size="15" />
                  <span>全局搜索</span>
                  <span class="dd-kbd"><span class="kbd">Ctrl K</span></span>
                </button>
              </div>
            </transition>
          </div>
        </div>
      </header>

      <main class="content">
        <div class="content-inner">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
  min-height: 100vh;
  transition: grid-template-columns 0.2s ease;
}

.shell.is-collapsed {
  --sidebar-w: 76px;
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--border);
  z-index: 30;
}

.brand {
  height: var(--topbar-h);
  padding: 0 14px 0 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--border);
  overflow: hidden;
}

.brand--expandable {
  cursor: pointer;
}

.brand--expandable:hover .brand-mark {
  transform: scale(1.08);
}

.brand-mark {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--primary);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  box-shadow: 0 6px 14px rgba(31, 94, 255, 0.28);
  transition: transform 0.16s ease;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  white-space: nowrap;
}

.brand-text strong {
  font-size: 15px;
  letter-spacing: -0.02em;
}

.brand-text span {
  font-size: 10.5px;
  color: var(--text-3);
  margin-top: 2px;
  letter-spacing: 0.02em;
}

.collapse-btn {
  margin-left: auto;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  color: var(--text-3);
  flex-shrink: 0;
}

.collapse-btn:hover {
  background: var(--surface-3);
  color: var(--text);
}

.nav {
  flex: 1;
  padding: 14px 10px;
  overflow: visible;
}

.nav-group + .nav-group {
  margin-top: 18px;
}

.nav-label {
  padding: 0 10px 6px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--text-3);
  text-transform: uppercase;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 38px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s ease, color 0.15s ease;
}

.nav-item:hover {
  background: var(--surface-2);
  color: var(--text);
}

.nav-item.is-active {
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 600;
}

.nav-item.is-active::before {
  content: "";
  position: absolute;
  left: -10px;
  top: 9px;
  bottom: 9px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--primary);
}

.is-collapsed .nav-item::after {
  content: attr(data-label);
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%) translateX(-4px);
  padding: 5px 9px;
  border-radius: 6px;
  background: #0c1526;
  color: #fff;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
  box-shadow: 0 8px 22px rgba(8, 15, 30, 0.28);
  z-index: 80;
}

.is-collapsed .nav-item:hover::after,
.is-collapsed .nav-item:focus-visible::after {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
}

.nav-text {
  white-space: nowrap;
}

.live-tag {
  margin-left: auto;
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--green);
  background: var(--green-soft);
  padding: 2px 5px;
  border-radius: 4px;
}

.nav-item.is-active .live-tag {
  color: var(--green);
}

.sidebar-foot {
  padding: 10px;
  border-top: 1px solid var(--border);
}

.collapse-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  margin-bottom: 8px;
  border-radius: 6px;
  color: var(--text-3);
  font-size: 11.5px;
}

.collapse-row:hover {
  background: var(--surface-2);
  color: var(--text);
}

.is-collapsed .collapse-row {
  justify-content: center;
  padding: 0;
}

.is-collapsed .collapse-row span {
  display: none;
}

.conn-card {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 11px;
  margin-bottom: 10px;
  overflow: hidden;
}

.conn-row {
  display: flex;
  align-items: center;
  gap: 7px;
}

.conn-dot {
  color: var(--green);
}

.conn-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
}

.conn-meta {
  margin: 4px 0 8px;
  font-size: 10.5px;
  color: var(--text-3);
  white-space: nowrap;
}

.conn-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--primary);
  font-weight: 500;
}

.user {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 4px 6px;
}

.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--surface-3);
  color: var(--text-2);
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.user-text {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  min-width: 0;
}

.user-text strong {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.user-text span {
  font-size: 10.5px;
  color: var(--text-3);
  white-space: nowrap;
}

.icon-mini {
  margin-left: auto;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  color: var(--text-3);
}

.icon-mini:hover {
  background: var(--surface-3);
  color: var(--text);
}

.main {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  height: var(--topbar-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 0 24px;
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  backdrop-filter: saturate(160%) blur(12px);
  border-bottom: 1px solid var(--border);
}

.title-block {
  min-width: 0;
}

.crumb {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--text-3);
  letter-spacing: 0.02em;
}

.crumb-cur {
  color: var(--text-2);
}

h1 {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.25;
  margin-top: 1px;
}

.title-block p {
  font-size: 11.5px;
  color: var(--text-3);
  margin-top: 1px;
  white-space: nowrap;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.sync-time {
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
  padding: 0 2px;
}

.mode-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 11px;
  border-radius: 999px;
  background: var(--green-soft);
  color: var(--green);
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
}

.region-btn {
  gap: 7px;
  min-width: 92px;
  justify-content: space-between;
}

.region-label {
  font-weight: 500;
}

.compare-btn {
  color: var(--text-3);
}

.compare-btn.is-on {
  color: var(--primary);
  background: var(--primary-soft);
  border-color: var(--primary-border);
}

.bell {
  position: relative;
}

.bell-badge {
  position: absolute;
  top: 2px;
  right: 1px;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--red);
  color: #fff;
  font-size: 9.5px;
  font-weight: 600;
  display: grid;
  place-items: center;
  border: 2px solid var(--bg);
}

.content {
  flex: 1;
  padding: 20px 24px 40px;
}

.content-inner {
  max-width: 1680px;
  margin: 0 auto;
}

.dd {
  position: relative;
}

.dd-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}

.dd-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 41;
  min-width: 190px;
  padding: 5px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-pop);
}

.dd-menu--right {
  left: auto;
  right: 0;
}

.dd-menu--region {
  min-width: 160px;
}

.dd-label {
  padding: 6px 9px 4px;
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--text-3);
  text-transform: uppercase;
}

.dd-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  height: 32px;
  padding: 0 9px;
  border-radius: 6px;
  color: var(--text-2);
  font-size: 12.5px;
  text-align: left;
}

.dd-item:hover {
  background: var(--surface-2);
  color: var(--text);
}

.dd-item.is-selected {
  color: var(--primary);
  background: var(--primary-soft);
  font-weight: 500;
}

.dd-item span:first-of-type {
  flex: 1;
}

.dd-kbd {
  margin-left: auto;
}

.is-collapsed .brand-text,
.is-collapsed .nav-label,
.is-collapsed .nav-text,
.is-collapsed .live-tag,
.is-collapsed .conn-card,
.is-collapsed .user-text,
.is-collapsed .collapse-btn {
  display: none;
}

.is-collapsed .brand {
  justify-content: center;
  padding: 0;
}

.is-collapsed .nav-item {
  justify-content: center;
  padding: 0;
}

.is-collapsed .nav-group + .nav-group {
  margin-top: 10px;
}

.is-collapsed .user {
  justify-content: center;
}

@media (max-width: 1440px) {
  .sync-time {
    display: none;
  }
}

@media (max-width: 1280px) {
  .title-block p {
    display: none;
  }

  .actions {
    gap: 6px;
  }

  .compare-btn {
    width: 34px;
    padding: 0;
    font-size: 0;
    gap: 0;
  }
}

@media (max-width: 1080px) {
  .shell {
    --sidebar-w: 76px;
  }

  .brand-text,
  .nav-label,
  .nav-text,
  .live-tag,
  .conn-card,
  .user-text {
    display: none;
  }

  .brand,
  .nav-item {
    justify-content: center;
    padding: 0;
  }

  .content {
    padding: 16px;
  }
}
</style>
