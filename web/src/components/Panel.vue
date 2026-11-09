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
      <Transition name="skeleton-fade" :duration="250">
        <div v-if="error" class="state">
          <Icon name="alert" :size="22" />
          <p>{{ error }}</p>
          <button class="btn btn--sm" @click="$emit('retry')">重试</button>
        </div>
        <div v-else-if="loading" class="state state--loading">
          <SkeletonLoader variant="chart" />
        </div>
        <div v-else>
          <slot />
        </div>
      </Transition>
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

.panel-body {
  position: relative;
}

/* 退场骨架脱离文档流，避免占位把内容顶走、卸载帧回弹（跳变） */
.skeleton-fade-leave-active { transition: opacity .25s ease; position: absolute; left: 0; right: 0; top: 0; }
.skeleton-fade-leave-to { opacity: 0; }

</style>
