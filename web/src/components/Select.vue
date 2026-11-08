<script setup lang="ts" generic="T extends string | number">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'

const props = withDefaults(
  defineProps<{
    modelValue: T | null
    options: { value: T; label: string }[]
    placeholder?: string
    ariaLabel?: string
    size?: 'sm' | 'md'
    disabled?: boolean
  }>(),
  { placeholder: '请选择', ariaLabel: '下拉选择', size: 'md', disabled: false }
)

const emit = defineEmits<{ (e: 'update:modelValue', value: T): void }>()

const open = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const activeIndex = ref(-1)
const popupStyle = ref<Record<string, string>>({})
const above = ref(false)

const selectedLabel = computed(() => props.options.find((o) => o.value === props.modelValue)?.label ?? '')

function place() {
  const el = triggerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const gap = 6
  const margin = 12
  const viewportH = window.innerHeight
  const belowH = viewportH - rect.bottom - gap - margin
  const aboveH = rect.top - gap - margin
  const flip = belowH < 160 && aboveH > belowH
  const maxH = Math.max(120, Math.min(280, flip ? aboveH : belowH))
  above.value = flip
  popupStyle.value = {
    left: `${rect.left}px`,
    minWidth: `${rect.width}px`,
    maxHeight: `${maxH}px`,
    ...(flip ? { bottom: `${viewportH - rect.top + gap}px` } : { top: `${rect.bottom + gap}px` })
  }
}

function openMenu() {
  if (props.disabled) return
  open.value = true
  const idx = props.options.findIndex((o) => o.value === props.modelValue)
  activeIndex.value = idx
  nextTick(() => {
    place()
    listRef.value?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  })
}

function closeMenu(restoreFocus = false) {
  if (!open.value) return
  open.value = false
  activeIndex.value = -1
  if (restoreFocus) triggerRef.value?.focus()
}

function toggleMenu() {
  if (open.value) closeMenu()
  else openMenu()
}

function commit(index: number) {
  const option = props.options[index]
  if (!option) return
  emit('update:modelValue', option.value)
  closeMenu(true)
}

function onTriggerKeydown(e: KeyboardEvent) {
  if (props.disabled) return
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (!open.value) openMenu()
    else if (e.key === 'ArrowDown') moveActive(1)
    else moveActive(-1)
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    toggleMenu()
  } else if (e.key === 'Escape') {
    if (open.value) {
      e.stopPropagation()
      closeMenu(true)
    }
  }
}

function onListKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    moveActive(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveActive(-1)
  } else if (e.key === 'Home') {
    e.preventDefault()
    moveActiveTo(0)
  } else if (e.key === 'End') {
    e.preventDefault()
    moveActiveTo(props.options.length - 1)
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    commit(activeIndex.value)
  } else if (e.key === 'Escape' || e.key === 'Tab') {
    e.preventDefault()
    closeMenu(e.key === 'Escape')
  }
}

function moveActive(delta: number) {
  const len = props.options.length
  if (!len) return
  const next = activeIndex.value < 0 ? (delta > 0 ? 0 : len - 1) : (activeIndex.value + delta + len) % len
  moveActiveTo(next)
}

function moveActiveTo(index: number) {
  activeIndex.value = index
  nextTick(() => {
    listRef.value?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  })
}

function onOutsidePointer(e: PointerEvent) {
  const target = e.target as Node | null
  if (!target) return
  if (triggerRef.value?.contains(target) || listRef.value?.contains(target)) return
  closeMenu()
}

function onViewportChange() {
  if (open.value) place()
}

watch(open, (v) => {
  if (v) {
    document.addEventListener('pointerdown', onOutsidePointer, true)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
  } else {
    document.removeEventListener('pointerdown', onOutsidePointer, true)
    window.removeEventListener('resize', onViewportChange)
    window.removeEventListener('scroll', onViewportChange, true)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutsidePointer, true)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})
</script>

<template>
  <div class="sel" :class="[`sel--${size}`, { 'is-open': open, 'is-disabled': disabled }]">
    <button
      ref="triggerRef"
      type="button"
      class="sel__trigger"
      :disabled="disabled"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      <span class="sel__value" :class="{ 'is-placeholder': !selectedLabel }">
        {{ selectedLabel || placeholder }}
      </span>
      <Icon name="chevron-down" :size="13" class="sel__caret" />
    </button>
    <Teleport to="body">
      <transition name="sel-pop">
        <div
          v-if="open"
          ref="listRef"
          class="sel__menu"
          :class="{ 'is-above': above }"
          :style="popupStyle"
          role="listbox"
          :aria-label="ariaLabel"
          tabindex="-1"
          @keydown="onListKeydown"
        >
          <button
            v-for="(o, i) in options"
            :key="o.value"
            type="button"
            class="sel__option"
            :class="{ 'is-active': i === activeIndex, 'is-selected': o.value === modelValue }"
            :data-active="i === activeIndex"
            role="option"
            :aria-selected="o.value === modelValue"
            @mouseenter="activeIndex = i"
            @click="commit(i)"
          >
            <span>{{ o.label }}</span>
            <Icon v-if="o.value === modelValue" name="check" :size="13" class="sel__check" />
          </button>
          <p v-if="!options.length" class="sel__empty">暂无选项</p>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
.sel {
  position: relative;
  display: inline-flex;
  width: 100%;
  min-width: 0;
}

.sel__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-width: 0;
  height: 34px;
  padding: 0 10px 0 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  text-align: left;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.sel__trigger:hover {
  border-color: var(--border-strong);
}

.sel.is-open .sel__trigger {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(31, 94, 255, 0.12);
}

.sel.is-disabled .sel__trigger {
  opacity: 0.5;
  cursor: not-allowed;
}

.sel--sm .sel__trigger {
  height: 30px;
  padding: 0 8px 0 10px;
  font-size: 12px;
}

.sel__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.sel__value.is-placeholder {
  color: var(--text-3);
}

.sel__caret {
  flex-shrink: 0;
  color: var(--text-3);
  transition: transform 0.18s ease;
}

.sel.is-open .sel__caret {
  transform: rotate(180deg);
  color: var(--primary);
}
</style>

<style>
.sel__menu {
  position: fixed;
  z-index: 300;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-pop);
}

.sel__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 7px 9px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-2);
  font-size: 12.5px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}

.sel__option:hover,
.sel__option.is-active {
  background: var(--surface-hover);
  color: var(--text);
}

.sel__option.is-selected {
  color: var(--primary);
  font-weight: 500;
}

.sel__check {
  flex-shrink: 0;
  color: var(--primary);
}

.sel__empty {
  padding: 10px 9px;
  color: var(--text-3);
  font-size: 12px;
}

.sel-pop-enter-active,
.sel-pop-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.sel-pop-enter-from,
.sel-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.sel-pop-enter-from.is-above,
.sel-pop-leave-to.is-above {
  transform: translateY(4px);
}
</style>
