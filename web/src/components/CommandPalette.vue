<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { refresh, setRange, setRegion, toast, ui } from '@/stores/ui'
import type { RangeKey, RegionKey } from '@/api/types'

interface Action {
  id: string
  label: string
  hint: string
  icon: string
  keywords?: string
  run: () => void
}

const router = useRouter()
const q = ref('')
const active = ref(0)
const input = ref<HTMLInputElement | null>(null)

const pages: { path: string; label: string; icon: string; group: string }[] = [
  { path: '/overview', label: '运营总览', icon: 'overview', group: '分析' },
  { path: '/hourly', label: '时段分析', icon: 'clock', group: '分析' },
  { path: '/region', label: '区域分布', icon: 'map', group: '分析' },
  { path: '/cells', label: '资源与扩容', icon: 'tower', group: '运营' },
  { path: '/realtime', label: '实时监控', icon: 'activity', group: '运营' },
  { path: '/pipeline', label: '数据任务', icon: 'database', group: '系统' }
]

const ranges: RangeKey[] = ['today', '7d', '30d']
const rangeLabels: Record<RangeKey, string> = { today: '今日', '7d': '近 7 天', '30d': '近 30 天' }
const regions: RegionKey[] = ['all', '华北', '东北', '华东', '华中', '华南', '西南', '西北']

const actions = computed<Action[]>(() => {
  const list: Action[] = pages.map((p) => ({
    id: `page:${p.path}`,
    label: `打开 ${p.label}`,
    hint: p.group,
    icon: p.icon,
    keywords: p.label,
    run: () => {
      router.push(p.path)
      close()
    }
  }))

  ranges.forEach((r) => {
    list.push({
      id: `range:${r}`,
      label: `时间范围：${rangeLabels[r]}`,
      hint: '筛选',
      icon: 'calendar',
      keywords: '时间 日期 范围 今日 近7天 近30天',
      run: () => {
        setRange(r)
        toast('info', `已切换到${rangeLabels[r]}`)
        close()
      }
    })
  })

  regions.forEach((r) => {
    list.push({
      id: `region:${r}`,
      label: `区域：${r === 'all' ? '全国' : r}`,
      hint: '筛选',
      icon: 'globe',
      keywords: '区域 省份 全国 华北 东北 华东 华中 华南 西南 西北',
      run: () => {
        setRegion(r)
        toast('info', `已切换到${r === 'all' ? '全国' : r}`)
        close()
      }
    })
  })

  list.push(
    {
      id: 'toggle-compare',
      label: ui.compare ? '关闭同比对比' : '开启同比对比',
      hint: '图表',
      icon: 'layers',
      keywords: '对比 同比 上期',
      run: () => {
        ui.compare = !ui.compare
        toast('info', ui.compare ? '已开启对比' : '已关闭对比')
        close()
      }
    },
    {
      id: 'refresh',
      label: '刷新数据',
      hint: 'R',
      icon: 'refresh',
      keywords: '刷新 重新加载',
      run: () => {
        refresh()
        toast('info', '数据已刷新')
        close()
      }
    },
    {
      id: 'alerts',
      label: '打开告警中心',
      hint: 'A',
      icon: 'bell',
      keywords: '告警 通知 预警',
      run: () => {
        ui.alertsOpen = true
        close()
      }
    },
    {
      id: 'settings',
      label: '偏好设置',
      hint: 'S',
      icon: 'settings',
      keywords: '设置 阈值 自动刷新',
      run: () => {
        ui.settingsOpen = true
        close()
      }
    },
    {
      id: 'shortcuts',
      label: '查看快捷键',
      hint: '?',
      icon: 'command',
      keywords: '快捷键 帮助',
      run: () => {
        ui.shortcutsOpen = true
        close()
      }
    }
  )
  return list
})

const filtered = computed(() => {
  const k = q.value.trim().toLowerCase()
  if (!k) return actions.value
  return actions.value.filter((a) =>
    `${a.label} ${a.hint} ${a.keywords ?? ''}`.toLowerCase().includes(k)
  )
})

watch(filtered, () => (active.value = 0))

function close() {
  ui.commandOpen = false
  q.value = ''
}

function exec(a?: Action) {
  const item = a ?? filtered.value[active.value]
  item?.run()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = (active.value + 1) % Math.max(1, filtered.value.length)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = (active.value - 1 + filtered.value.length) % Math.max(1, filtered.value.length)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    exec()
  } else if (e.key === 'Escape') {
    close()
  }
}

watch(
  () => ui.commandOpen,
  async (open) => {
    if (open) {
      q.value = ''
      active.value = 0
      await nextTick()
      input.value?.focus()
    }
  }
)
</script>

<template>
  <Teleport to="body">
    <transition name="fade">
      <div v-if="ui.commandOpen" class="mask" @click.self="close">
        <div class="palette" role="dialog" aria-modal="true" aria-label="全局搜索">
          <div class="search-row">
            <Icon name="search" :size="17" />
            <input
              ref="input"
              v-model="q"
              placeholder="搜索页面、区域或操作…"
              aria-label="搜索页面、区域或操作"
              @keydown="onKey"
            />
            <span class="kbd">ESC</span>
          </div>
          <div class="list">
            <button
              v-for="(a, i) in filtered"
              :key="a.id"
              class="item"
              :class="{ 'is-active': i === active }"
              @mouseenter="active = i"
              @click="exec(a)"
            >
              <span class="item-icon"><Icon :name="a.icon" :size="15" /></span>
              <span class="item-label">{{ a.label }}</span>
              <span class="item-hint">{{ a.hint }}</span>
              <Icon v-if="i === active" name="chevron-right" :size="13" class="item-arrow" />
            </button>
            <div v-if="!filtered.length" class="empty">
              <Icon name="search" :size="18" />
              没有匹配的页面或操作
            </div>
          </div>
          <div class="foot">
            <span><span class="kbd">↑</span><span class="kbd">↓</span> 选择</span>
            <span><span class="kbd">↵</span> 打开</span>
            <span class="foot-right">TeleScope 命令面板</span>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 120;
  background: rgba(8, 15, 30, 0.42);
  backdrop-filter: blur(3px);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh 20px 40px;
}

.palette {
  width: 580px;
  max-width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow-pop);
  overflow: hidden;
}

.search-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 15px;
  border-bottom: 1px solid var(--border);
  color: var(--text-3);
}

.search-row input {
  flex: 1;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--text);
}

.search-row input::placeholder {
  color: var(--text-3);
}

.list {
  max-height: 46vh;
  overflow-y: auto;
  padding: 6px;
}

.item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 38px;
  padding: 0 9px;
  border-radius: 7px;
  color: var(--text-2);
  font-size: 13px;
  text-align: left;
}

.item.is-active {
  background: var(--primary-soft);
  color: var(--primary);
}

.item-icon {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text-3);
}

.item.is-active .item-icon {
  background: var(--surface);
  color: var(--primary);
}

.item-label {
  flex: 1;
}

.item-hint {
  font-size: 11px;
  color: var(--text-3);
}

.item-arrow {
  color: var(--primary);
}

.foot {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 9px 14px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-3);
  font-size: 10.5px;
}

.foot span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.foot-right {
  margin-left: auto;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: 9.5px;
}

.empty {
  padding: 28px 16px;
  text-align: center;
  color: var(--text-3);
  font-size: 12.5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
</style>
