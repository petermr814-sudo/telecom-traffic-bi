<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from './components/AppShell.vue'
import ToastStack from './components/ToastStack.vue'
import CommandPalette from './components/CommandPalette.vue'
import SettingsModal from './components/SettingsModal.vue'
import AlertsDrawer from './components/AlertsDrawer.vue'
import CellDrawer from './components/CellDrawer.vue'
import ShortcutsModal from './components/ShortcutsModal.vue'
import { refresh, setRange, toast, ui } from './stores/ui'

const router = useRouter()
let lastG = 0

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable))
}

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    ui.commandOpen = !ui.commandOpen
    return
  }
  if (isTyping(e)) return

  if (e.key === 'Escape') {
    ui.infoOpen = false
    ui.alertsOpen = false
    ui.settingsOpen = false
    ui.shortcutsOpen = false
    ui.cellDetail = null
    return
  }
  if (e.key === '?') {
    ui.shortcutsOpen = true
    return
  }
  if (e.key === 'r' || e.key === 'R') {
    refresh()
    toast('info', '数据已刷新')
    return
  }
  if (e.key === 'c' || e.key === 'C') {
    ui.compare = !ui.compare
    toast('info', ui.compare ? '已开启对比' : '已关闭对比')
    return
  }
  if (['1', '2', '3'].includes(e.key)) {
    setRange(e.key === '1' ? 'today' : e.key === '2' ? '7d' : '30d')
    return
  }
  if (e.key === 'g' || e.key === 'G') {
    lastG = Date.now()
    return
  }
  if (Date.now() - lastG < 900) {
    const map: Record<string, string> = { o: '/overview', h: '/hourly', r: '/region', c: '/cells', p: '/pipeline' }
    const target = map[e.key.toLowerCase()]
    if (target) {
      router.push(target)
      lastG = 0
    }
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <AppShell>
    <RouterView v-slot="{ Component }">
      <transition name="page" mode="out-in">
        <component :is="Component" />
      </transition>
    </RouterView>
  </AppShell>
  <ToastStack />
  <CommandPalette />
  <SettingsModal />
  <AlertsDrawer />
  <CellDrawer />
  <ShortcutsModal />
</template>
