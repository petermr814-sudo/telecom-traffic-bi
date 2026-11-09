<script setup lang="ts">
import Icon from './Icon.vue'
import SkeletonLoader from './SkeletonLoader.vue'

withDefaults(defineProps<{
  title: string
  sub?: string
  loading?: boolean
  error?: string
  flush?: boolean
}>(), { loading: false, error: '', flush: false })

defineEmits<{ (e: 'retry'): void }>()
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <div>
        <h3 class="panel-title">
          <slot name="icon" />
          {{ title }}
          <span v-if="$slots.tag" class="panel-tag"><slot name="tag" /></span>
        </h3>
        <p v-if="sub" class="panel-sub">{{ sub }}</p>
      </div>
      <div class="panel-actions"><slot name="actions" /></div>
    </header>
    <div class="panel-body" :class="{ 'is-flush': flush }" :aria-busy="loading">
      <div v-if="error" class="state">
        <Icon name="alert" :size="22" />
        <p>{{ error }}</p>
        <button class="btn btn--sm" @click="$emit('retry')">重试</button>
      </div>
      <div v-else-if="loading" class="state state--loading">
        <SkeletonLoader variant="chart" />
      </div>
      <slot v-else />
    </div>
  </section>
</template>

<style scoped>
.panel-tag {
  font-weight: 400;
}

.is-flush {
  padding: 10px 0 0;
}

.state {
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-3);
  font-size: 12.5px;
  text-align: center;
}

.state--loading {
  gap: 12px;
}

</style>
