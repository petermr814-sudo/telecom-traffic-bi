<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { lockPageScroll, unlockPageScroll } from '@/lib/scrollLock'
import { replayTextReveal } from '@/lib/textReveal'

const props = withDefaults(defineProps<{ open: boolean; title: string; sub?: string; width?: string; height?: string }>(), {
  sub: '',
  width: '520px',
  height: ''
})
const emit = defineEmits<{ (e: 'close'): void }>()

const lockHolder = {}
const head = ref<HTMLElement | null>(null)
let locked = false

watch(
  () => props.open,
  (v) => {
    if (v === locked) return
    locked = v
    if (v) lockPageScroll(lockHolder)
    else unlockPageScroll(lockHolder)
  },
  { immediate: true }
)

// 弹窗已打开时标题变化（例如切换省份），用同一套模糊浮现动画重播
watch(
  () => [props.open, props.title, props.sub] as const,
  ([open], [prevOpen]) => {
    if (!open || !prevOpen) return
    nextTick(() => {
      if (head.value) replayTextReveal(head.value)
    })
  }
)

onUnmounted(() => {
  if (locked) unlockPageScroll(lockHolder)
})
</script>

<template>
  <Teleport to="body">
    <transition name="dialog">
      <div v-if="open" class="mask" @click.self="emit('close')">
        <div class="modal" :style="{ width, height: height || undefined }" role="dialog" aria-modal="true" :aria-label="title">
          <header ref="head" class="modal-head">
            <div>
              <h2 v-text-reveal>{{ title }}</h2>
              <p v-if="sub" v-text-reveal>{{ sub }}</p>
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
.dialog-enter-active {
  transition: opacity 0.24s var(--ease-quad-out);
}

.dialog-leave-active {
  transition: opacity 0.16s var(--ease-quad-in);
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

/* 卡片与遮罩分层：卡片用二次贝塞尔曲线做轻微上浮，避免整块位移 */
.dialog-enter-active .modal {
  transition:
    opacity 0.24s var(--ease-quad-out),
    transform 0.24s var(--ease-quad-out);
}

.dialog-leave-active .modal {
  transition:
    opacity 0.16s var(--ease-quad-in),
    transform 0.16s var(--ease-quad-in);
}

.dialog-enter-from .modal {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
}

.dialog-leave-to .modal {
  opacity: 0;
  transform: translateY(6px) scale(0.99);
}

@media (prefers-reduced-motion: reduce) {
  .dialog-enter-active,
  .dialog-leave-active,
  .dialog-enter-active .modal,
  .dialog-leave-active .modal {
    transition: none;
  }

  .dialog-enter-from .modal,
  .dialog-leave-to .modal {
    transform: none;
  }
}

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
  border-radius: var(--radius);
  corner-shape: squircle;
  overflow: hidden;
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
  flex: 1 1 auto;
  min-height: 0;
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
}
</style>
