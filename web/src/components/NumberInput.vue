<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from './Icon.vue'

const props = withDefaults(
  defineProps<{
    modelValue: number
    min?: number
    max?: number
    step?: number
    suffix?: string
    ariaLabel?: string
    disabled?: boolean
  }>(),
  { min: -Infinity, max: Infinity, step: 1, suffix: '', ariaLabel: '数值输入', disabled: false }
)

const emit = defineEmits<{ (e: 'update:modelValue', value: number): void }>()

const text = ref(String(props.modelValue))
const focused = ref(false)

const atMin = computed(() => props.modelValue <= props.min)
const atMax = computed(() => props.modelValue >= props.max)

watch(
  () => props.modelValue,
  (v) => {
    if (!focused.value) text.value = String(v)
    else if (parse(text.value) === v) text.value = String(v)
  }
)

function parse(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed || !/^-?\d+(\.\d+)?$/.test(trimmed)) return null
  return Number(trimmed)
}

function clamp(n: number): number {
  return Math.min(props.max, Math.max(props.min, n))
}

function commitRaw() {
  const n = parse(text.value)
  if (n === null) {
    text.value = String(props.modelValue)
    return
  }
  const next = clamp(n)
  text.value = String(next)
  if (next !== props.modelValue) emit('update:modelValue', next)
}

function bump(delta: number) {
  if (props.disabled) return
  const next = clamp(props.modelValue + delta * props.step)
  if (next === props.modelValue) return
  text.value = String(next)
  emit('update:modelValue', next)
}

function onInput(e: Event) {
  text.value = (e.target as HTMLInputElement).value
}

function onFocus(e: Event) {
  focused.value = true
  ;(e.target as HTMLInputElement).select()
}

function onBlur() {
  focused.value = false
  commitRaw()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    bump(1)
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    bump(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    commitRaw()
    ;(e.target as HTMLInputElement).blur()
  }
}
</script>

<template>
  <div class="stepper" :class="{ 'is-focused': focused, 'is-disabled': disabled }">
    <button
      type="button"
      class="stepper__btn"
      :disabled="disabled || atMin"
      :aria-label="`${ariaLabel}减少`"
      tabindex="-1"
      @click="bump(-1)"
    >
      <Icon name="minus" :size="13" />
    </button>
    <input
      class="stepper__input"
      type="text"
      inputmode="numeric"
      :value="text"
      :aria-label="ariaLabel"
      :disabled="disabled"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
    />
    <span v-if="suffix" class="stepper__suffix">{{ suffix }}</span>
    <button
      type="button"
      class="stepper__btn"
      :disabled="disabled || atMax"
      :aria-label="`${ariaLabel}增加`"
      tabindex="-1"
      @click="bump(1)"
    >
      <Icon name="plus" :size="13" />
    </button>
  </div>
</template>

<style scoped>
.stepper {
  display: inline-flex;
  align-items: center;
  width: 100%;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.stepper:hover {
  border-color: var(--border-strong);
}

.stepper.is-focused {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(31, 94, 255, 0.12);
}

.stepper.is-disabled {
  opacity: 0.5;
}

.stepper__btn {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 32px;
  height: 100%;
  color: var(--text-2);
  background: var(--surface-2);
  transition: background 0.14s ease, color 0.14s ease;
}

.stepper__btn:first-child {
  border-right: 1px solid var(--border);
}

.stepper__btn:last-child {
  border-left: 1px solid var(--border);
}

.stepper__btn:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--primary);
}

.stepper__btn:active:not(:disabled) {
  background: var(--primary-soft);
}

.stepper__btn:disabled {
  color: var(--text-3);
  opacity: 0.45;
  cursor: not-allowed;
}

.stepper__input {
  flex: 1;
  min-width: 0;
  width: 100%;
  height: 100%;
  padding: 0 6px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  outline: none;
}

.stepper__suffix {
  flex-shrink: 0;
  padding-right: 2px;
  color: var(--text-3);
  font-size: 11px;
}
</style>
