<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import Icon from './Icon.vue'
import InfoBar from './InfoBar.vue'
import { loadAlerts } from '@/stores/alerts'
import {
  RANGE_OPTIONS, setRange, ui
} from '@/stores/ui'

const route = useRoute()
const meta = computed(() => route.meta as { title: string; subtitle: string; group: string; hideFilters?: boolean; hideRange?: boolean; modeLabel?: string; compareable?: boolean })

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

let alertTimer = 0

onMounted(() => {
  loadAlerts()
  alertTimer = window.setInterval(() => loadAlerts(true), 60_000)
})

watch(
  () => ui.tick,
  () => loadAlerts(true)
)

onUnmounted(() => {
  window.clearInterval(alertTimer)
})
</script>

<template>
  <div class="shell">
    <aside class="sidebar no-print">
      <div class="brand">
        <img class="brand-mark" src="/brand/telescope-mark-128.png" width="34" height="34" alt="" decoding="async" />
        <div class="brand-text">
          <strong><span class="brand-tele">Tele</span><span class="brand-scope">Scope</span></strong>
          <span>电信流量运营平台</span>
        </div>
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
            :data-label="item.label"
            :aria-label="item.label"
          >
            <Icon :name="item.icon" :size="17" />
            <span class="nav-text">{{ item.label }}</span>
            <span v-if="item.live" class="live-tag">LIVE</span>
          </RouterLink>
        </div>
      </nav>
    </aside>

    <div class="main">
      <header class="topbar no-print">
        <div class="title-block">
          <div class="crumb">
            <span>{{ meta.group }}</span>
            <Icon name="chevron-right" :size="12" />
            <span class="crumb-cur">{{ meta.title }}</span>
          </div>
        </div>

        <div class="actions">
          <template v-if="!meta.hideFilters">
            <div v-if="!meta.hideRange" v-seg-mask class="seg" role="group" aria-label="时间范围">
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

          </template>
          <span v-else class="mode-chip">
            <span class="dot dot--pulse" />
            {{ meta.modeLabel }}
          </span>

          <InfoBar />
        </div>
      </header>

      <main class="content">
        <div class="content-inner">
          <div class="page-heading">
            <div><h1>{{ meta.title }}</h1><p>{{ meta.subtitle }}</p></div>
            <span class="page-status"><span class="dot" />{{ ui.lastUpdated === '—' ? '演示数据' : `更新于 ${ui.lastUpdated}` }}</span>
          </div>
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

.brand-mark {
  width: 34px;
  height: 34px;
  display: block;
  flex-shrink: 0;
  object-fit: contain;
  filter: drop-shadow(0 2px 5px rgba(20, 130, 145, 0.14));
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  white-space: nowrap;
}

.brand-text strong {
  display: flex;
  align-items: baseline;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.012em;
  color: var(--brand-ink);
}

.brand-tele {
  color: var(--brand-ink);
}

.brand-scope {
  color: var(--brand-teal);
}

.brand-text span {
  font-size: 10.5px;
  color: var(--text-3);
  margin-top: 2px;
  letter-spacing: 0.02em;
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
  font-size: 12px;
  color: var(--text-3);
  letter-spacing: 0.01em;
}

.crumb-cur {
  color: var(--text-2);
}

h1 {
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.25;
  margin-top: 0;
}

.page-heading p {
  font-size: 13px;
  color: var(--text-3);
  margin-top: 1px;
  line-height: 1.6;
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
  padding: 32px 40px 56px;
}

.content-inner {
  max-width: 1480px;
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

@media (max-width: 1280px) {
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
  .live-tag {
    display: none;
  }

  .brand,
  .nav-item {
    justify-content: center;
    padding: 0;
  }

  /* 窄屏只剩图标，悬停/键盘聚焦时用 data-label 补出模块名 */
  .nav-item::after {
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

  .nav-item:hover::after,
  .nav-item:focus-visible::after {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
  }

  .content {
    padding: 16px;
  }
}

.page-heading { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
.page-heading p { margin-top: 8px; }
.page-status { display: flex; align-items: center; gap: 7px; color: var(--text-3); font-size: 12px; white-space: nowrap; }
.page-status .dot { color: var(--green); }
.topbar { background: var(--surface); backdrop-filter: none; }
@media (max-width: 1180px) { .content { padding: 28px; } }
@media (max-width: 900px) {
  .topbar { height: auto; min-height: var(--topbar-h); padding: 16px 22px; flex-wrap: wrap; }
  .actions { flex: 1; justify-content: flex-end; flex-wrap: wrap; }
  .title-block { display: none; }
  .content { padding: 24px; }
}
@media (max-width: 680px) {
  .shell { --sidebar-w: 60px; }
  .brand { padding: 0; }
  .nav { padding: 16px 6px; }
  .nav-item { padding: 0; }
  .topbar { padding: 12px; }
  .actions { justify-content: flex-start; gap: 6px; }
  .seg__item { padding: 0 7px; font-size: 11px; }
  .region-btn { min-width: 70px; }
  .content { padding: 24px 16px 40px; }
  .page-heading { margin-bottom: 24px; align-items: flex-start; }
  .page-heading h1 { font-size: 24px; }
  .page-status { display: none; }
}

</style>
