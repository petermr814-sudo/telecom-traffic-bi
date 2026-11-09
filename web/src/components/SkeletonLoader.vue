<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'chart' | 'rows' | 'stats' | 'num'; label?: string; compact?: boolean }>(), {
  variant: 'chart', label: '', compact: false,
})

// 表行位的列宽（百分比），错落排布模拟真实表格的列分布
const rowWidths = [
  ['32%', '18%', '14%', '10%'],
  ['28%', '20%', '12%', '12%'],
  ['34%', '16%', '15%', '9%'],
  ['26%', '19%', '13%', '11%'],
]
</script>

<template>
  <div class="skel" :class="[`skel--${variant}`, { 'is-compact': compact }]" role="status" :aria-label="label || '正在加载…'">
    <div class="skel-body" aria-hidden="true">
      <!-- 图表位：绘图区 + 轴标，不画假数据 -->
      <template v-if="variant === 'chart'">
        <div class="skel-plot">
          <span v-for="n in 3" :key="n" class="skel-grid" />
        </div>
        <div class="skel-axis">
          <span v-for="n in 5" :key="n" class="skel-tick" />
        </div>
      </template>

      <!-- 表行位：行 × 列药丸 -->
      <template v-else-if="variant === 'rows'">
        <div v-for="(row, i) in rowWidths" :key="i" class="skel-row">
          <span v-for="(w, j) in row" :key="j" class="skel-pill" :style="{ width: w }" />
        </div>
      </template>

      <!-- 指标位：标签 / 数值 / 注脚 三段 -->
      <template v-else-if="variant === 'stats'">
        <div v-for="n in 4" :key="n" class="skel-stat">
          <span class="skel-pill skel-pill--tag" />
          <span class="skel-pill skel-pill--figure" />
          <span class="skel-pill skel-pill--sub" />
        </div>
      </template>

      <!-- 数字位：数值块 + 单位块 -->
      <template v-else>
        <div class="skel-kpi">
          <span class="skel-pill skel-pill--value" />
          <span class="skel-pill skel-pill--unit" />
        </div>
      </template>
    </div>
    <span v-if="label" class="skel-label">{{ label }}</span>
  </div>
</template>

<style scoped>
/* 填充用半透明墨色而非 surface-3：KPI 英雄卡等自定义底色上也能看清；
   网格线走 border-strong 令牌，扫光两套主题分别调透明度 */
.skel {
  --skel-fill: color-mix(in srgb, var(--text-2) 13%, transparent);
  --skel-sheen: rgba(255, 255, 255, 0.55);
  --skel-line: var(--border-strong);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
  width: 100%;
  min-height: 110px;
  color: var(--text-3);
}

.theme-dark .skel {
  --skel-sheen: rgba(255, 255, 255, 0.07);
}

.is-compact {
  min-height: 0;
  height: 100%;
}

.skel-body {
  position: relative;
  overflow: hidden;
  display: flex;
  flex: 1;
  min-height: 0;
}

/* 一道扫光掠过整组占位块，而非逐块闪烁 */
.skel-body::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(105deg, transparent 35%, var(--skel-sheen) 50%, transparent 65%);
  transform: translateX(-100%);
  animation: skel-sweep 1.7s ease-in-out infinite;
  pointer-events: none;
}

.skel-label {
  font-size: 12px;
  text-align: center;
}

.skel-pill {
  display: block;
  flex: none;
  height: 12px;
  border-radius: 6px;
  background: var(--skel-fill);
}

/* ---------- 图表位 ---------- */
.skel--chart .skel-body {
  flex-direction: column;
  gap: 10px;
}

.skel--chart:not(.is-compact) .skel-body {
  padding: 20px;
}

.skel-plot {
  position: relative;
  flex: 1;
  min-height: 64px;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  padding: 14px 0;
  border-radius: 10px;
  background: var(--skel-fill);
}

.skel-grid {
  height: 1px;
  background: var(--skel-line);
}

.skel-axis {
  display: flex;
  justify-content: space-between;
  padding: 0 6px;
}

.skel-tick {
  width: 18px;
  height: 6px;
  border-radius: 3px;
  background: var(--skel-fill);
}

/* ---------- 表行位 ---------- */
.skel--rows .skel-body {
  flex-direction: column;
  justify-content: center;
  gap: 20px;
  padding: 4px 2px;
}

.skel-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* ---------- 指标位 ---------- */
.skel--stats {
  min-height: 0;
}

.skel--stats .skel-body {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.skel-stat {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  min-width: 0;
  padding: 24px;
}

.skel-stat + .skel-stat {
  border-left: 1px solid var(--border);
}

.skel-pill--tag { width: 44px; height: 8px; border-radius: 4px; }
.skel-pill--figure { width: 72px; height: 22px; border-radius: 7px; }
.skel-pill--sub { width: 56px; height: 7px; border-radius: 4px; }

/* ---------- 数字位 ---------- */
.skel--num {
  min-height: 0;
  height: auto;
  width: auto;
  align-self: center;
}

.skel--num .skel-body {
  flex: none;
}

.skel-kpi {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.skel-pill--value { width: 132px; height: 36px; border-radius: 10px; }
.skel-pill--unit { width: 22px; height: 12px; border-radius: 4px; margin-bottom: 5px; }

@keyframes skel-sweep {
  0% { transform: translateX(-100%); }
  55% { transform: translateX(100%); }
  100% { transform: translateX(100%); }
}

@media (prefers-reduced-motion: reduce) {
  .skel-body::after {
    animation: none;
    opacity: 0;
  }
}
</style>
