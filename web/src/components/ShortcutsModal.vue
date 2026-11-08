<script setup lang="ts">
import Modal from './Modal.vue'
import { ui } from '@/stores/ui'

const groups = [
  {
    title: '全局',
    items: [
      { keys: ['Ctrl', 'K'], desc: '打开全局搜索' },
      { keys: ['?'], desc: '查看快捷键' },
      { keys: ['Esc'], desc: '关闭弹层 / 搜索' }
    ]
  },
  {
    title: '数据',
    items: [
      { keys: ['R'], desc: '刷新当前数据' },
      { keys: ['C'], desc: '切换同比对比' },
      { keys: ['1', '2', '3'], desc: '切换今日 / 近 7 天 / 近 30 天' }
    ]
  },
  {
    title: '页面',
    items: [
      { keys: ['G', 'O'], desc: '运营总览' },
      { keys: ['G', 'H'], desc: '时段分析' },
      { keys: ['G', 'R'], desc: '区域分布' },
      { keys: ['G', 'C'], desc: '资源与扩容' }
    ]
  }
]
</script>

<template>
  <Modal :open="ui.shortcutsOpen" title="键盘快捷键" sub="答辩演示时可直接用键盘切换视图" width="520px" @close="ui.shortcutsOpen = false">
    <div class="grid">
      <section v-for="g in groups" :key="g.title">
        <h4>{{ g.title }}</h4>
        <div v-for="item in g.items" :key="item.desc" class="row">
          <span class="desc">{{ item.desc }}</span>
          <span class="keys">
            <span v-for="k in item.keys" :key="k" class="kbd">{{ k }}</span>
          </span>
        </div>
      </section>
    </div>
    <p class="tip">单键快捷键在输入框中不会触发；组合键请按顺序依次按下。</p>
    <template #footer>
      <button class="btn btn--primary" @click="ui.shortcutsOpen = false">知道了</button>
    </template>
  </Modal>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

h4 {
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--text-3);
  text-transform: uppercase;
  margin-bottom: 8px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--border);
}

.desc {
  font-size: 12px;
  color: var(--text-2);
}

.keys {
  display: inline-flex;
  gap: 4px;
}

.tip {
  margin-top: 16px;
  font-size: 11px;
  color: var(--text-3);
}
</style>
