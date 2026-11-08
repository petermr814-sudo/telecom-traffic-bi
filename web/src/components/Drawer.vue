<script setup lang="ts">
import { watch } from 'vue'
import Icon from './Icon.vue'

const props = withDefaults(defineProps<{ open: boolean; title: string; sub?: string; width?: string }>(), {
  sub: '',
  width: '460px'
})
const emit = defineEmits<{ (e: 'close'): void }>()

watch(
  () => props.open,
  (v) => {
    document.body.style.overflow = v ? 'hidden' : ''
  }
)
</script>

<template>
  <Teleport to="body">
    <transition name="fade">
      <div v-if="open" class="mask" @click.self="emit('close')">
        <aside class="drawer" :style="{ width }" role="dialog" aria-modal="true" :aria-label="title">
          <header class="drawer-head">
            <div>
              <h2>{{ title }}</h2>
              <p v-if="sub">{{ sub }}</p>
            </div>
            <button class="btn btn--icon btn--ghost" aria-label="关闭" @click="emit('close')">
              <Icon name="close" :size="17" />
            </button>
          </header>
          <div class="drawer-body"><slot /></div>
          <footer v-if="$slots.footer" class="drawer-foot"><slot name="footer" /></footer>
        </aside>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(8, 15, 30, 0.4);
  backdrop-filter: blur(2px);
  display: flex;
  justify-content: flex-end;
}

.drawer {
  height: 100%;
  max-width: 100%;
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: -20px 0 60px rgba(8, 15, 30, 0.18);
  display: flex;
  flex-direction: column;
  animation: slide-in 0.22s ease;
}

@keyframes slide-in {
  from {
    transform: translateX(24px);
    opacity: 0.4;
  }
}

.drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border);
}

h2 {
  font-size: 16px;
  font-weight: 600;
}

.drawer-head p {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-3);
}

.drawer-body {
  padding: 18px 20px;
  overflow-y: auto;
  flex: 1;
}

.drawer-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 13px 20px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}
</style>
