<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Drawer from './Drawer.vue'
import Icon from './Icon.vue'
import type { Alert } from '@/api/types'
import {
  ackAlert, ackAllAlerts, alertList, alertsError, alertsLoading, loadAlerts
} from '@/stores/alerts'
import { toast, ui } from '@/stores/ui'

const router = useRouter()
const alerts = computed(() => alertList.value)
const loading = alertsLoading
const error = alertsError
const tab = ref<'全部' | '待处理' | '已确认'>('全部')

const filtered = computed(() =>
  alerts.value.filter((a) => tab.value === '全部' || a.status === tab.value)
)

const counts = computed(() => ({
  全部: alerts.value.length,
  待处理: alerts.value.filter((a) => a.status === '待处理').length,
  已确认: alerts.value.filter((a) => a.status === '已确认').length
}))

function load() {
  loadAlerts(true)
}

watch(
  () => ui.alertsOpen,
  (open) => {
    if (open) load()
  }
)

function ack(a: Alert) {
  ackAlert(a.id)
  toast('success', '告警已确认', `${a.cellName} · ${a.metric}`)
}

function ackAll() {
  ackAllAlerts()
  toast('success', '已全部确认', '铃铛角标已同步为 0')
}

function gotoCell(a: Alert) {
  ui.alertsOpen = false
  router.push({ path: '/cells', query: { cell: a.cellId } })
}
</script>

<template>
  <Drawer :open="ui.alertsOpen" title="告警中心" sub="按忙时利用率与流量异常实时聚合" width="480px" @close="ui.alertsOpen = false">
    <div class="toolbar">
      <div class="seg">
        <button
          v-for="t in ['全部', '待处理', '已确认'] as const"
          :key="t"
          class="seg__item"
          :class="{ 'is-active': tab === t }"
          @click="tab = t"
        >
          {{ t }} <span class="count num">{{ counts[t] }}</span>
        </button>
      </div>
      <button class="btn btn--sm" @click="load"><Icon name="refresh" :size="13" />刷新</button>
    </div>

    <div v-if="loading" class="loading">
      <span class="spinner" />
      正在拉取告警…
    </div>
    <div v-else-if="error" class="empty">
      <Icon name="alert" :size="20" />
      {{ error }}
      <button class="btn btn--sm" @click="load">重试</button>
    </div>
    <div v-else class="list">
      <article v-for="a in filtered" :key="a.id" class="alert" :class="`alert--${a.level}`">
        <div class="alert-top">
          <span class="level">{{ a.level }}</span>
          <span class="time num">{{ a.time }}</span>
          <span class="status" :class="{ 'is-done': a.status === '已确认' }">{{ a.status }}</span>
        </div>
        <p class="msg">{{ a.message }}</p>
        <div class="alert-meta">
          <button class="cell-link" @click="gotoCell(a)">
            <Icon name="tower" :size="12" />
            {{ a.cellName }}
          </button>
          <span class="metric">{{ a.metric }} <strong class="num">{{ a.value }}</strong></span>
        </div>
        <div class="alert-foot">
          <span class="mono">{{ a.id }} · {{ a.region }}</span>
          <button v-if="a.status === '待处理'" class="btn btn--sm" @click="ack(a)">确认</button>
          <span v-else class="done"><Icon name="check" :size="12" />已处理</span>
        </div>
      </article>
      <div v-if="!filtered.length" class="empty">
        <Icon name="check" :size="20" />
        当前筛选下没有告警
      </div>
    </div>

    <template #footer>
      <button class="btn" @click="ui.alertsOpen = false">关闭</button>
      <button class="btn btn--primary" :disabled="!counts['待处理']" @click="ackAll">
        全部确认（{{ counts['待处理'] }}）
      </button>
    </template>
  </Drawer>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.count {
  font-size: 10.5px;
  color: var(--text-3);
  margin-left: 2px;
}

.seg__item.is-active .count {
  color: var(--primary);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.alert {
  border: 1px solid var(--border);
  border-left: 3px solid var(--amber);
  border-radius: 9px;
  padding: 11px 12px;
  background: var(--surface);
}

.alert--严重 {
  border-left-color: var(--red);
}

.alert--提示 {
  border-left-color: var(--primary);
}

.alert-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.level {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--amber);
  background: var(--amber-soft);
  padding: 1px 6px;
  border-radius: 4px;
}

.alert--严重 .level {
  color: var(--red);
  background: var(--red-soft);
}

.alert--提示 .level {
  color: var(--primary);
  background: var(--primary-soft);
}

.time {
  font-size: 10.5px;
  color: var(--text-3);
}

.status {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--amber);
}

.status.is-done {
  color: var(--text-3);
}

.msg {
  margin: 7px 0 8px;
  font-size: 12.5px;
  color: var(--text);
  line-height: 1.5;
}

.alert-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 11.5px;
  color: var(--text-2);
}

.cell-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--primary);
  font-size: 11.5px;
}

.cell-link:hover {
  text-decoration: underline;
}

.metric strong {
  color: var(--text);
  font-weight: 600;
}

.alert-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 9px;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
  font-size: 10.5px;
  color: var(--text-3);
}

.done {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--green);
}

.loading {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 30px 0;
  color: var(--text-3);
  font-size: 12px;
}

.spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--border-strong);
  border-top-color: var(--primary);
  animation: spin 0.8s linear infinite;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 34px 10px;
  color: var(--text-3);
  font-size: 12.5px;
}
</style>
