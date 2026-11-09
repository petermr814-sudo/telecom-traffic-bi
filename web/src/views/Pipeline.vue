<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Panel from '@/components/Panel.vue'
import Disclosure from '@/components/Disclosure.vue'
import ProcessFlow from '@/components/ProcessFlow.vue'
import Icon from '@/components/Icon.vue'
import Modal from '@/components/Modal.vue'
import { useAsync } from '@/lib/useAsync'
import { api } from '@/api/client'
import type { Job } from '@/api/types'
import { fmtCount, fmtInt } from '@/lib/format'
import { downloadFile, toCsv, toast, ui } from '@/stores/ui'

const selected = ref<Job | null>(null)
const running = ref<string[]>([])
const busy = ref(false)

const { data, error, loading, run } = useAsync(
  () => Promise.all([api.jobs(), api.pipeline()]),
  () => [ui.tick]
)

const jobs = computed(() => data.value?.[0] ?? [])
const pipeline = computed(() => data.value?.[1] ?? null)

const stats = computed(() => {
  const list = jobs.value
  return {
    total: list.length,
    success: list.filter((j) => j.status === '成功').length,
    running: list.filter((j) => j.status === '运行中').length,
    failed: list.filter((j) => j.status === '失败').length
  }
})

const endpoints = [
  ['GET', '/api/v1/overview', '总览 KPI + 24h 序列 + 区域占比'],
  ['GET', '/api/v1/hourly', '24h 流量与上期对比'],
  ['GET', '/api/v1/heatmap', '7 天 × 24 小时热力'],
  ['GET', '/api/v1/provinces', '31 省流量 / 用户 / 增速'],
  ['GET', '/api/v1/cells', '小区利用率、状态、分页'],
  ['GET', '/api/v1/alerts', '告警列表与级别'],
  ['GET', '/api/v1/jobs', '作业列表与状态'],
  ['GET', '/api/v1/pipeline', '数据源与链路状态']
]

function runJob(j: Job) {
  if (running.value.includes(j.id)) return
  j.status = '运行中'
  running.value.push(j.id)
  toast('info', `已提交 ${j.name}`, '作业已进入 YARN 调度队列')
  window.setTimeout(() => {
    j.status = '成功'
    j.duration = '1m 08s'
    running.value = running.value.filter((x) => x !== j.id)
    toast('success', `${j.name} 执行成功`, '输出已写入 HDFS，可在作业详情查看')
  }, 1800)
}

async function runAll() {
  if (busy.value) return
  busy.value = true
  const failed = jobs.value.filter((j) => j.status === '失败')
  if (!failed.length) {
    toast('info', '没有待重跑的作业', '当前所有作业状态正常')
    busy.value = false
    return
  }
  failed.forEach((j, i) => window.setTimeout(() => runJob(j), i * 500))
  toast('info', '已批量提交', `${failed.length} 个失败作业重新入队`)
  window.setTimeout(() => (busy.value = false), 1200)
}

function openJob(j: Job) {
  selected.value = j
}

function exportCsv() {
  const header = ['作业ID', '作业名', '引擎', '状态', '开始时间', '耗时', '输入行数', '输出路径', '负责人']
  const body = jobs.value.map((j) => [j.id, j.name, j.engine, j.status, j.startTime, j.duration, j.rows, j.output, j.owner])
  downloadFile('数据任务.csv', toCsv([header, ...body]))
  toast('success', '已导出 CSV', `${body.length} 个作业`)
}

async function copyPath() {
  if (!selected.value) return
  try {
    await navigator.clipboard.writeText(selected.value.output)
    toast('success', '路径已复制', selected.value.output)
  } catch {
    toast('error', '复制失败', '浏览器未授权剪贴板')
  }
}

onMounted(() => window.addEventListener('telco:export', exportCsv))
onUnmounted(() => window.removeEventListener('telco:export', exportCsv))
</script>

<template>
  <div v-if="error" class="card error-card">
    <Icon name="alert" :size="22" />
    <div><strong>任务数据加载失败</strong><p>{{ error }}</p></div>
    <button class="btn btn--primary" @click="run">重试</button>
  </div>

  <div v-else class="page">
    <section class="stats">
      <div class="stat">
        <span class="stat-icon"><Icon name="layers" :size="16" /></span>
        <div><span>今日作业</span><strong v-text-reveal="Boolean(data)" class="num">{{ data ? stats.total : '—' }}</strong></div>
        <span class="stat-sub">Spark / MR / Flink</span>
      </div>
      <div class="stat">
        <span class="stat-icon green"><Icon name="check" :size="16" /></span>
        <div><span>成功</span><strong v-text-reveal="Boolean(data)" class="num">{{ data ? stats.success : '—' }}</strong></div>
        <span class="stat-sub">最近一次 {{ jobs[1]?.startTime?.slice(11) }}</span>
      </div>
      <div class="stat">
        <span class="stat-icon blue"><Icon name="refresh" :size="16" /></span>
        <div><span>运行中</span><strong v-text-reveal="Boolean(data)" class="num">{{ data ? stats.running : '—' }}</strong></div>
        <span class="stat-sub">YARN 队列 normal</span>
      </div>
      <div class="stat">
        <span class="stat-icon red"><Icon name="alert" :size="16" /></span>
        <div><span>失败</span><strong v-text-reveal="Boolean(data)" class="num">{{ data ? stats.failed : '—' }}</strong></div>
        <span class="stat-sub">可重跑</span>
      </div>
    </section>

    <div class="section-heading"><h2>作业运行情况</h2><p>优先关注失败作业与运行中的任务</p></div>
    <div class="grid grid--mid">
      <Panel class="sources-panel" title="数据源状态" sub="存储与消息组件" :loading="loading && !data">
        <ul class="sources">
          <li v-for="s in pipeline?.sources" :key="s.name">
            <span class="src-icon"><Icon name="server" :size="15" /></span>
            <div class="src-body">
              <strong>{{ s.name }}</strong>
              <span class="mono">{{ s.topic }}</span>
              <span class="src-detail">{{ s.detail }}</span>
            </div>
            <span class="chip chip--green">{{ s.status }}</span>
          </li>
        </ul>
      </Panel>

      <Panel class="jobs-panel" title="作业列表" sub="点击查看输出与日志" :loading="loading && !data" flush>
        <template #actions>
          <button class="btn btn--sm" :disabled="busy" @click="runAll"><Icon name="play" :size="13" />重跑失败</button>
        </template>
        <div class="table-wrap" v-swap-reveal>
          <table class="table table--compact">
            <thead>
              <tr>
                <th>作业</th>
                <th>引擎</th>
                <th>状态</th>
                <th class="num">输入行数</th>
                <th class="num">耗时</th>
                <th class="w-70" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="j in jobs" :key="j.id" class="row-click" @click="openJob(j)">
                <td>
                  <div class="job-name">{{ j.name }}</div>
                  <div class="job-id mono">{{ j.id }} · {{ j.startTime }}</div>
                </td>
                <td>{{ j.engine }}</td>
                <td>
                  <span class="chip" :class="j.status === '成功' ? 'chip--green' : j.status === '运行中' ? 'chip--blue' : 'chip--red'">
                    {{ j.status }}
                  </span>
                </td>
                <td class="num">{{ fmtCount(j.rows) }}</td>
                <td class="num">{{ j.duration }}</td>
                <td>
                  <button v-if="j.status === '失败'" class="btn btn--sm" @click.stop="runJob(j)">重跑</button>
                  <Icon v-else name="chevron-right" :size="14" class="muted" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </div>

    <div class="section-heading"><h2>数据链路</h2><p>从采集到可视化的处理过程</p></div>
    <Panel title="分布式数据链路" sub="Kafka → HDFS → Spark/MapReduce → HBase → API → 可视化">
      <template #actions>
        <span class="chip chip--green"><span class="dot" />链路正常</span>
        <button class="btn btn--sm" @click="running.length ? null : (ui.tick += 1)"><Icon name="refresh" :size="13" />刷新</button>
      </template>
      <ProcessFlow :stages="pipeline?.stages ?? []" />
    </Panel>

    <Disclosure title="接口契约与指标说明" sub="需要联调或核对统计口径时展开">
    <div class="grid grid--bottom">
      <Panel title="接口契约" sub="后端联调参考">
        <template #actions>
          <span class="chip chip--blue">v1</span>
        </template>
        <ul class="endpoints">
          <li v-for="e in endpoints" :key="e[1]">
            <span class="method">{{ e[0] }}</span>
            <span class="path mono">{{ e[1] }}</span>
            <span class="desc">{{ e[2] }}</span>
          </li>
        </ul>
        <p class="contract-note">
          统一响应 <code>{ code, message, data }</code>；单位字节 / bps；时间 ISO 8601。Mock 与真实接口同构，切换只需改环境变量。
        </p>
      </Panel>

      <Panel title="指标口径" sub="主要指标的计算方式">
        <dl class="defs">
          <div><dt>忙时利用率</dt><dd>忙时下行速率 ÷ 小区带宽，≥ {{ ui.settings.warn }}% 预警，≥ {{ ui.settings.congest }}% 拥塞</dd></div>
          <div><dt>5G 分流比</dt><dd>5G 网络承载流量 ÷ 全网移动数据流量</dd></div>
          <div><dt>峰均比</dt><dd>峰值小时流量 ÷ 全天平均小时流量，衡量网络弹性</dd></div>
          <div><dt>活跃用户</dt><dd>当日产生上行或下行记录的去重用户数（已脱敏）</dd></div>
          <div><dt>数据规模</dt><dd>{{ fmtInt(562400000) }} 条记录 · 31 省 · 420 个重点小区</dd></div>
        </dl>
      </Panel>
    </div>
    </Disclosure>
  </div>


  <Modal :open="Boolean(selected)" :title="selected?.name ?? '作业详情'" :sub="selected ? `${selected.id} · ${selected.engine}` : ''" width="560px" @close="selected = null">
    <template v-if="selected">
      <div class="detail-rows">
        <div class="row"><span>状态</span><strong>{{ selected.status }}</strong></div>
        <div class="row"><span>开始时间</span><strong class="mono">{{ selected.startTime }}</strong></div>
        <div class="row"><span>耗时</span><strong>{{ selected.duration }}</strong></div>
        <div class="row"><span>输入行数</span><strong class="num">{{ fmtInt(selected.rows) }}</strong></div>
        <div class="row"><span>负责人</span><strong>{{ selected.owner }}</strong></div>
        <div class="row"><span>输出路径</span><strong class="mono path">{{ selected.output }}</strong></div>
      </div>
      <div class="log">
        <div class="log-head">运行日志（尾部）</div>
        <pre>2026-11-08 21:00:12 INFO  [main] {{ selected.name }} start
2026-11-08 21:00:13 INFO  [main] input rows = {{ fmtInt(selected.rows) }}
2026-11-08 21:00:14 INFO  [main] output = {{ selected.output }}
2026-11-08 21:00:15 INFO  [main] job {{ selected.status === '成功' ? 'succeeded' : selected.status === '失败' ? 'failed: NoRouteToHost' : 'running' }}</pre>
      </div>
    </template>
    <template #footer>
      <button class="btn" @click="copyPath"><Icon name="copy" :size="14" />复制路径</button>
      <button class="btn" @click="selected = null">关闭</button>
      <button v-if="selected?.status === '失败'" class="btn btn--primary" @click="runJob(selected); selected = null">重新运行</button>
    </template>
  </Modal>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 24px; }

.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; }

.stat {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 13px 15px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  position: relative;
}

.stat-icon { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; background: var(--primary-soft); color: var(--primary); flex-shrink: 0; }
.stat-icon.green { background: var(--green-soft); color: var(--green); }
.stat-icon.blue { background: var(--primary-soft); color: var(--primary); }
.stat-icon.red { background: var(--red-soft); color: var(--red); }

.stat > div { display: flex; flex-direction: column; line-height: 1.25; }
.stat > div span { font-size: 10.5px; color: var(--text-3); }
.stat > div strong { font-size: 20px; font-weight: 650; }
.stat-sub { position: absolute; right: 13px; top: 14px; font-size: 9.5px; color: var(--text-3); }

.dag {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0 4px;
}

.stage {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.stage-card {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 10px 11px;
  background: var(--surface-2);
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.stage-top { display: flex; align-items: center; justify-content: space-between; }
.stage-num { font-family: var(--mono); font-size: 9px; color: var(--border-strong); }
.stage-card strong { font-size: 12.5px; font-weight: 600; margin-top: 2px; }
.stage-detail { font-size: 9.5px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stage-metric { font-size: 10px; color: var(--primary); margin-top: 3px; }
.arrow { color: var(--border-strong); flex-shrink: 0; }

.grid { display: grid; gap: 24px; }
.grid--mid { grid-template-columns: minmax(0, 2.4fr) minmax(240px, 1fr); }
.grid--bottom { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); }

.sources { display: flex; flex-direction: column; gap: 4px; }
.sources li { display: flex; align-items: center; gap: 9px; padding: 8px 4px; border-bottom: 1px dashed var(--border); }
.sources li:last-child { border-bottom: 0; }
.src-icon { width: 28px; height: 28px; border-radius: 7px; background: var(--surface-2); display: grid; place-items: center; color: var(--text-2); flex-shrink: 0; }
.src-body { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.3; }
.src-body strong { font-size: 12px; font-weight: 600; }
.src-body .mono { font-size: 9.5px; color: var(--text-3); }
.src-detail { font-size: 9.5px; color: var(--text-3); }

.job-name { font-size: 12px; font-weight: 500; color: var(--text); }
.job-id { font-size: 9.5px; color: var(--text-3); margin-top: 1px; }
.row-click { cursor: pointer; }
.w-70 { width: 70px; }

.endpoints { display: flex; flex-direction: column; gap: 1px; }
.endpoints li { display: grid; grid-template-columns: 34px 210px minmax(0, 1fr); align-items: center; gap: 8px; padding: 5px 4px; border-bottom: 1px dashed var(--border); }
.endpoints li:last-child { border-bottom: 0; }
.method { font-size: 9px; font-weight: 700; color: var(--green); background: var(--green-soft); border-radius: 3px; text-align: center; padding: 1px 0; letter-spacing: .04em; }
.path { font-size: 10.5px; color: var(--text); }
.desc { font-size: 9.5px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.contract-note { margin-top: 9px; font-size: 10px; color: var(--text-3); line-height: 1.6; }
.contract-note code { font-family: var(--mono); background: var(--surface-3); padding: 1px 4px; border-radius: 3px; }

.defs { display: flex; flex-direction: column; gap: 8px; }
.defs div { display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 10px; }
.defs dt { font-size: 11px; color: var(--text); font-weight: 500; }
.defs dd { margin: 0; font-size: 10.5px; color: var(--text-3); line-height: 1.55; }

.detail-rows { display: flex; flex-direction: column; gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.detail-rows .row { display: flex; justify-content: space-between; gap: 14px; background: var(--surface); padding: 9px 12px; font-size: 11.5px; color: var(--text-3); }
.detail-rows .row strong { color: var(--text); font-weight: 500; text-align: right; }
.detail-rows .path { font-size: 10px; word-break: break-all; }

.log { margin-top: 14px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.log-head { padding: 6px 10px; background: var(--surface-2); border-bottom: 1px solid var(--border); font-size: 10px; color: var(--text-3); }
.log pre { margin: 0; padding: 10px; font-family: var(--mono); font-size: 10px; line-height: 1.7; color: var(--text-2); overflow-x: auto; background: var(--surface); }

.error-card { display: flex; align-items: center; gap: 14px; padding: 24px; color: var(--red); }
.error-card strong { color: var(--text); font-size: 13px; }
.error-card p { color: var(--text-3); font-size: 12px; margin-top: 2px; }
.error-card .btn { margin-left: auto; }

.skeleton-page { display: flex; flex-direction: column; gap: 24px; }
.stats-skel { height: 84px; }
.dag-skel { height: 150px; }
.table-skel { height: 380px; }

@media (max-width: 1180px) {
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid--mid, .grid--bottom { grid-template-columns: minmax(0, 1fr); }
  .dag { flex-wrap: wrap; }
  .arrow { display: none; }
  .endpoints li { grid-template-columns: 34px 1fr; }
  .desc { display: none; }
}

.stats { gap: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.stat { border: 0; border-radius: 0; box-shadow: none; background: transparent; padding: 24px; min-height: 122px; }
.stat + .stat { border-left: 1px solid var(--border); }
.stat:hover { transform: none; box-shadow: none; }
.stat-sub { font-size: 11px; }
@media (max-width: 1180px) {
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stat { padding: 20px 16px; }
  .stat:nth-child(3) { border-left: 0; border-top: 1px solid var(--border); }
  .stat:nth-child(4) { border-top: 1px solid var(--border); }
}

.stat { display: grid; grid-template-columns: 32px 1fr; align-content: center; gap: 8px 12px; }
.stat-icon { grid-row: 1 / 3; }
.stat-sub { position: static; grid-column: 2; }
.stat > div strong { font-size: 28px; margin-top: 5px; }
.stat > div span { font-size: 12px; }
.jobs-panel { order: 0; }
.sources-panel { order: 1; }
.stage-card { padding: 18px; background: var(--surface-2); border-color: transparent; border-radius: 12px; }
.stage-detail { font-size: 11px; margin-top: 6px; }
.stage-metric { font-size: 12px; margin-top: 12px; }
.src-body strong { font-size: 13px; }
.src-body .mono, .src-detail { font-size: 11px; }
.sources li { padding: 16px 0; }
/* .panel 默认带 filter 投影；两列仅隔 24px，投影会在间隙里叠成一条灰竖带，所以一并去掉 */
.disclosure :deep(.panel) { border: 0; border-radius: 0; box-shadow: none; filter: none; }
.disclosure :deep(.panel-head) { padding-left: 0; padding-right: 0; }
.disclosure :deep(.panel-body) { padding-left: 0; padding-right: 0; }
@media (max-width: 1120px) { .grid--mid { grid-template-columns: 1fr; } .dag { flex-wrap: wrap; gap: 14px; } .stage { flex-basis: 30%; min-width: 150px; } }
@media (max-width: 680px) { .grid--bottom { grid-template-columns: 1fr; } .stage { flex-basis: 100%; } .arrow { display: none; } }

</style>
