<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Modal from './Modal.vue'
import Icon from './Icon.vue'
import NumberInput from './NumberInput.vue'
import { saveSettings, ui } from '@/stores/ui'
import { dataMode } from '@/api/client'

const warn = ref(ui.settings.warn)
const congest = ref(ui.settings.congest)
const auto = ref(ui.settings.autoRefresh)

const invalid = computed(() => warn.value >= congest.value || warn.value < 40 || congest.value > 99)

watch(
  () => ui.settingsOpen,
  (open) => {
    if (open) {
      warn.value = ui.settings.warn
      congest.value = ui.settings.congest
      auto.value = ui.settings.autoRefresh
    }
  }
)

const autoOptions = [
  { value: 0, label: '关闭' },
  { value: 30, label: '30 秒' },
  { value: 60, label: '1 分钟' },
  { value: 300, label: '5 分钟' }
]

function save() {
  if (invalid.value) return
  saveSettings({ warn: warn.value, congest: congest.value, autoRefresh: auto.value })
  ui.settingsOpen = false
}

function reset() {
  warn.value = 70
  congest.value = 85
  auto.value = 0
}
</script>

<template>
  <Modal
    :open="ui.settingsOpen"
    title="偏好设置"
    sub="阈值与刷新频率即时生效，并保存在本机浏览器"
    width="560px"
    @close="ui.settingsOpen = false"
  >
    <div class="section">
      <div class="section-head">
        <h4>数据连接</h4>
        <span class="chip" :class="dataMode === 'api' ? 'chip--green' : 'chip--blue'">
          <span class="dot" />
          {{ dataMode === 'api' ? '真实接口' : 'Mock 演示数据' }}
        </span>
      </div>
      <p class="hint">
        当前前端通过统一数据层读取数据。后端就绪后，在启动前设置
        <code>VITE_API_BASE</code> 与 <code>VITE_DATA_MODE=api</code> 即可切换，无需改页面。
      </p>
      <div class="code">
        <span>VITE_DATA_MODE=api</span>
        <span>VITE_API_BASE=http://192.168.10.101:8080</span>
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <h4>告警阈值</h4>
        <span class="hint">影响资源页状态与总览忙时占比</span>
      </div>
      <div class="field-row">
        <div class="field">
          <span>预警阈值</span>
          <NumberInput v-model="warn" :min="40" :max="95" :step="1" suffix="%" aria-label="预警阈值" />
        </div>
        <div class="field">
          <span>拥塞阈值</span>
          <NumberInput v-model="congest" :min="41" :max="99" :step="1" suffix="%" aria-label="拥塞阈值" />
        </div>
      </div>
      <p v-if="invalid" class="error">
        <Icon name="alert" :size="13" />
        预警阈值需小于拥塞阈值，且范围在 40% – 99%
      </p>
    </div>

    <div class="section">
      <div class="section-head">
        <h4>自动刷新</h4>
      </div>
      <div v-seg-mask class="seg">
        <button
          v-for="o in autoOptions"
          :key="o.value"
          class="seg__item"
          :class="{ 'is-active': auto === o.value }"
          @click="auto = o.value"
        >
          {{ o.label }}
        </button>
      </div>
    </div>

    <div class="section about">
      <div class="about-row"><span>前端版本</span><strong>1.0.0</strong></div>
      <div class="about-row"><span>接口契约</span><strong>v1 · /api/v1</strong></div>
      <div class="about-row"><span>数据口径</span><strong>全国 31 省 · 420 个重点小区</strong></div>
      <div class="about-row"><span>演示数据</span><strong>2026-10-10 至 2026-11-08</strong></div>
    </div>

    <template #footer>
      <button class="btn btn--ghost" @click="reset">恢复默认</button>
      <button class="btn" @click="ui.settingsOpen = false">取消</button>
      <button class="btn btn--primary" :disabled="invalid" @click="save">保存设置</button>
    </template>
  </Modal>
</template>

<style scoped>
.section {
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
}

.section:first-child {
  padding-top: 0;
}

.section:last-child {
  border-bottom: 0;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 9px;
}

h4 {
  font-size: 13px;
  font-weight: 600;
}

.hint {
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.6;
}

.hint code {
  font-family: var(--mono);
  font-size: 10.5px;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--surface-3);
  color: var(--text-2);
}

.code {
  margin-top: 9px;
  padding: 9px 11px;
  border-radius: 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-2);
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 11.5px;
  color: var(--text-3);
}

.error {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  color: var(--red);
  font-size: 11.5px;
}

.about {
  display: grid;
  gap: 6px;
  padding-bottom: 0;
}

.about-row {
  display: flex;
  justify-content: space-between;
  font-size: 11.5px;
  color: var(--text-3);
}

.about-row strong {
  font-weight: 500;
  color: var(--text-2);
}
</style>
