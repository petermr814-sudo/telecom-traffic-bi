<script setup lang="ts">
import { watch } from 'vue'
import Icon from './Icon.vue'

const props = withDefaults(defineProps<{ open: boolean; title: string; sub?: string; width?: string }>(), {
  sub: '',
  width: '520px'
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
        <div class="modal" :style="{ width }" role="dialog" aria-modal="true" :aria-label="title">
          <header class="modal-head">
            <div>
              <h2>{{ title }}</h2>
              <p v-if="sub">{{ sub }}</p>
            </div>
            <button class="btn btn--icon btn--ghost" aria-label="关闭" @click="emit('close')">
              <Icon name="close" :size="17" />
            </button>
          </header>
          <div class="modal-body"><slot /></div>
          <footer v-if="$slots.footer" class="modal-foot"><slot name="footer" /></footer>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(8, 15, 30, 0.42);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 9vh 20px 40px;
  overflow-y: auto;
}

.modal {
  max-width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow-pop);
  display: flex;
  flex-direction: column;
  max-height: 82vh;
}

.modal-head {
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
  letter-spacing: -0.015em;
}

.modal-head p {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-3);
}

.modal-body {
  padding: 18px 20px;
  overflow-y: auto;
}

.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 13px 20px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
  border-radius: 0 0 14px 14px;
}
</style>
