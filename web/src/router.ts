import { createRouter, createWebHashHistory } from 'vue-router'
import Overview from '@/views/Overview.vue'
import Hourly from '@/views/Hourly.vue'
import Cells from '@/views/Cells.vue'
import Realtime from '@/views/Realtime.vue'
import Pipeline from '@/views/Pipeline.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/overview' },
    {
      path: '/loading-motion', name: 'loading-motion', component: () => import('@/views/LoadingMotion.vue'),
      meta: { title: '液态加载动效', subtitle: '液滴聚合、轮廓延展、数据归位', group: '设计预览', hideFilters: true, modeLabel: '动效预览' },
    },
    {
      path: '/overview',
      name: 'overview',
      component: Overview,
      meta: {
        title: '运营总览',
        subtitle: '全国流量、用户与网络负载的一站式视图',
        group: '分析',
        compareable: true
      }
    },
    {
      path: '/hourly',
      name: 'hourly',
      component: Hourly,
      meta: {
        title: '时段分析',
        subtitle: '先观察整周规律，选择日期查看当天的流量详情',
        group: '分析',
        hideRange: true
      }
    },
    {
      path: '/region',
      name: 'region',
      component: () => import('@/views/Region.vue'),
      meta: {
        title: '区域分布',
        subtitle: '省市级流量分布与增长差异，定位资源热点',
        group: '分析'
      }
    },
    {
      path: '/cells',
      name: 'cells',
      component: Cells,
      meta: {
        title: '资源与扩容',
        subtitle: '小区级利用率、拥塞清单与扩容建议',
        group: '运营'
      }
    },
    {
      path: '/realtime',
      name: 'realtime',
      component: Realtime,
      meta: {
        title: '实时监控',
        subtitle: 'Kafka 实时流、消费组分区与秒级告警',
        group: '运营',
        hideFilters: true,
        modeLabel: '实时视图'
      }
    },
    {
      path: '/pipeline',
      name: 'pipeline',
      component: Pipeline,
      meta: {
        title: '数据任务',
        subtitle: '分布式作业、数据链路与口径说明',
        group: '系统',
        hideFilters: true,
        modeLabel: '批处理视图'
      }
    }
  ],
  scrollBehavior: () => ({ top: 0 })
})

export default router
