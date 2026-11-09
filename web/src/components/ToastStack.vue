<script setup lang="ts">
import Icon from './Icon.vue'
import { dismissToast, ui, type Toast } from '@/stores/ui'

const icons: Record<Toast['type'], string> = {
  success: 'check',
  info: 'info',
  warn: 'alert',
  error: 'alert'
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-stack" aria-live="polite">
      <transition-group name="toast">
        <div v-for="t in ui.toasts" :key="t.id" class="toast" :class="`toast--${t.type}`" role="status">
          <span class="toast-icon"><Icon :name="icons[t.type]" :size="15" :stroke-width="2" /></span>
          <div class="toast-text">
            <strong>{{ t.title }}</strong>
            <p v-if="t.desc">{{ t.desc }}</p>
          </div>
          <button class="toast-close" aria-label="关闭提示" @click="dismissToast(t.id)">
            <Icon name="close" :size="13" />
          </button>
        </div>
      </transition-group>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(380px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  pointer-events: none;
  scrollbar-width: none;
}

.toast-stack::-webkit-scrollbar {
  display: none;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-pop);
  pointer-events: auto;
}

.toast-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: var(--primary-soft);
  color: var(--primary);
}

.toast--success .toast-icon {
  background: var(--green-soft);
  color: var(--green);
}

.toast--warn .toast-icon {
  background: var(--amber-soft);
  color: var(--amber);
}

.toast--error .toast-icon {
  background: var(--red-soft);
  color: var(--red);
}

.toast-text {
  min-width: 0;
  flex: 1;
}

.toast-text strong {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
}

.toast-text p {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.45;
}

.toast-close {
  color: var(--text-3);
  padding: 2px;
  border-radius: 4px;
  flex-shrink: 0;
}

.toast-close:hover {
  color: var(--text);
  background: var(--surface-2);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}

.toast-move {
  transition: transform 0.2s ease;
}
</style>
