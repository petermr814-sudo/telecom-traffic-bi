# -*- coding: utf-8 -*-
"""生成电信流量分析演示数据（固定种子，可复现）。

输出：web/public/data/dataset.json
说明：数据是按真实量级构造的模拟聚合结果，不含任何真实用户信息。
"""
import json
import math
import random
from datetime import date, timedelta
from pathlib import Path

SEED = 20261108
OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data" / "dataset.json"

REGIONS = ["华北", "东北", "华东", "华中", "华南", "西南", "西北"]

PROVINCES = [
    ("北京市", "华北", 2.8), ("天津市", "华北", 1.3), ("河北省", "华北", 5.0),
    ("山西省", "华北", 2.4), ("内蒙古自治区", "华北", 1.9),
    ("辽宁省", "东北", 2.9), ("吉林省", "东北", 1.6), ("黑龙江省", "东北", 2.0),
    ("上海市", "华东", 3.2), ("江苏省", "华东", 8.4), ("浙江省", "华东", 7.2),
    ("安徽省", "华东", 4.2), ("福建省", "华东", 3.8), ("江西省", "华东", 3.0),
    ("山东省", "华东", 6.9),
    ("河南省", "华中", 5.6), ("湖北省", "华中", 4.5), ("湖南省", "华中", 4.0),
    ("广东省", "华南", 10.8), ("广西壮族自治区", "华南", 3.2), ("海南省", "华南", 1.0),
    ("重庆市", "西南", 2.8), ("四川省", "西南", 5.8), ("贵州省", "西南", 2.6),
    ("云南省", "西南", 3.1), ("西藏自治区", "西南", 0.4),
    ("陕西省", "西北", 3.0), ("甘肃省", "西北", 1.8), ("青海省", "西北", 0.6),
    ("宁夏回族自治区", "西北", 0.7), ("新疆维吾尔自治区", "西北", 1.8),
]

CITIES = {
    "北京市": ["北京"], "天津市": ["天津"], "河北省": ["石家庄", "唐山", "保定"],
    "山西省": ["太原", "大同"], "内蒙古自治区": ["呼和浩特", "包头"],
    "辽宁省": ["沈阳", "大连"], "吉林省": ["长春", "吉林"], "黑龙江省": ["哈尔滨", "大庆"],
    "上海市": ["上海"], "江苏省": ["南京", "苏州", "无锡", "徐州"],
    "浙江省": ["杭州", "宁波", "温州"], "安徽省": ["合肥", "芜湖"],
    "福建省": ["福州", "厦门", "泉州"], "江西省": ["南昌", "赣州"],
    "山东省": ["济南", "青岛", "烟台"], "河南省": ["郑州", "洛阳"],
    "湖北省": ["武汉", "宜昌"], "湖南省": ["长沙", "株洲"],
    "广东省": ["广州", "深圳", "东莞", "佛山"], "广西壮族自治区": ["南宁", "桂林"],
    "海南省": ["海口", "三亚"], "重庆市": ["重庆"],
    "四川省": ["成都", "绵阳"], "贵州省": ["贵阳", "遵义"],
    "云南省": ["昆明", "大理"], "西藏自治区": ["拉萨"],
    "陕西省": ["西安", "咸阳"], "甘肃省": ["兰州"], "青海省": ["西宁"],
    "宁夏回族自治区": ["银川"], "新疆维吾尔自治区": ["乌鲁木齐", "喀什"],
}

AREAS = ["城区", "高新区", "大学城", "火车站", "商业中心", "住宅区", "工业园区", "机场"]

HOUR_BASE = [0.36, 0.30, 0.27, 0.25, 0.26, 0.33, 0.52, 0.72, 0.84, 0.80,
             0.78, 0.83, 0.94, 0.86, 0.80, 0.82, 0.88, 0.96, 1.02, 1.04,
             1.06, 0.99, 0.82, 0.58]

CELL_TYPES = [("5G宏站", "5G", 0.44), ("5G室分", "5G", 0.16),
              ("4G宏站", "4G", 0.30), ("4G室分", "4G", 0.10)]

NATIONAL_DAILY = 88e15  # 88 PB / 天
TODAY = date(2026, 11, 8)
DAYS = [TODAY - timedelta(days=i) for i in range(29, -1, -1)]

RANGES = {"today": DAYS[-1:], "7d": DAYS[-7:], "30d": DAYS}
PREV = {"today": [DAYS[-2]], "7d": DAYS[-14:-7], "30d": DAYS[:30]}


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def soften(u):
    """把高利用率平滑压到 100% 以下，避免大量小区堆在同一个上限值。"""
    if u <= 0.90:
        return u
    return 0.90 + (1 - math.exp(-(u - 0.90) / 0.07)) * 0.098


def day_factor(d, rng):
    weekend = 1.08 if d.weekday() >= 5 else 1.0
    seasonal = 1 + 0.06 * math.sin((d - DAYS[0]).days / 30 * 2 * math.pi)
    return weekend * seasonal * rng.uniform(0.97, 1.03)


def hour_weights(weekend):
    w = list(HOUR_BASE)
    if weekend:
        for h in range(0, 7):
            w[h] *= 0.88
        for h in range(19, 24):
            w[h] *= 1.10
        for h in range(8, 11):
            w[h] *= 0.92
    s = sum(w)
    return [x / s for x in w]


def build_day_series(rng):
    """每天 24 小时的全国字节数。"""
    out = {}
    for d in DAYS:
        weights = hour_weights(d.weekday() >= 5)
        total = NATIONAL_DAILY * day_factor(d, rng)
        out[d.isoformat()] = [total * w * rng.uniform(0.97, 1.03) for w in weights]
    return out


def sum_hours(days, series):
    res = [0.0] * 24
    for d in days:
        for h in range(24):
            res[h] += series[d.isoformat()][h]
    return res


def main():
    rng = random.Random(SEED)
    daily = build_day_series(rng)

    total_weight = sum(p[2] for p in PROVINCES)
    shares = {p[0]: p[2] / total_weight for p in PROVINCES}

    user_shares = {p[0]: p[2] * rng.uniform(0.74, 1.32) for p in PROVINCES}
    total_user_weight = sum(user_shares.values())
    user_shares = {k: v / total_user_weight for k, v in user_shares.items()}
    region_user_share = {r: sum(user_shares[p[0]] for p in PROVINCES if p[1] == r) for r in REGIONS}

    # ---------- 小区 ----------
    cells = []
    for i in range(1, 421):
        province, region, weight = rng.choices(PROVINCES, weights=[p[2] for p in PROVINCES])[0]
        city = rng.choice(CITIES[province])
        area = rng.choice(AREAS)
        ctype, generation, _ = rng.choices(CELL_TYPES, weights=[c[2] for c in CELL_TYPES])[0]
        if generation == "5G":
            bandwidth = rng.choice([2000, 3000, 4000] if ctype == "5G宏站" else [1000, 1600])
        else:
            bandwidth = rng.choice([800, 1000] if ctype == "4G宏站" else [300, 500])
        base_util = rng.gauss(0.55, 0.19) + rng.uniform(-0.015, 0.02)
        base_util += 0.055 if generation == "4G" else -0.02
        base_util = soften(clamp(base_util, 0.10, 1.6))
        users = int(clamp(rng.gauss(4200, 2100), 600, 12000))
        trend = [round(clamp(base_util + rng.gauss(0, 0.055), 0.05, 0.99) * 100, 1) for _ in range(7)]
        util = {
            "today": round(base_util * 100, 1),
            "7d": round(soften(clamp(base_util * 1.03 + rng.uniform(-0.012, 0.012), 0.05, 1.6)) * 100, 1),
            "30d": round(soften(clamp(base_util * 1.06 + rng.uniform(-0.012, 0.012), 0.05, 1.6)) * 100, 1),
        }
        cells.append({
            "id": "C%04d" % i,
            "name": f"{city}{area}{ctype}",
            "city": city,
            "province": province,
            "region": region,
            "type": ctype,
            "generation": generation,
            "bandwidthMbps": bandwidth,
            "users": users,
            "baseUtil": round(base_util * 100, 1),
            "utilization": util,
            "trend": trend,
        })

    for c in cells:
        u = c["utilization"]["today"] / 100
        busy_bps = u * c["bandwidthMbps"] * 1e6
        day_bytes = busy_bps * 3600 / 0.092 / 8
        c["trafficBytes"] = int(day_bytes * rng.uniform(0.9, 1.12))
        c["busyMbps"] = round(busy_bps / 1e6, 1)

    # ---------- 每小时序列（分地区） ----------
    national_hourly = {k: sum_hours(v, daily) for k, v in RANGES.items()}
    prev_hourly = {k: sum_hours(v, daily) for k, v in PREV.items()}
    region_share = {r: sum(p[2] for p in PROVINCES if p[1] == r) / total_weight for r in REGIONS}

    hourly = {}
    compare = {}
    for k in RANGES:
        hourly[k] = {"all": [round(x) for x in national_hourly[k]]}
        compare[k] = {"all": [round(x) for x in prev_hourly[k]]}
        for r in REGIONS:
            jitter = [rng.uniform(0.96, 1.04) for _ in range(24)]
            hourly[k][r] = [round(national_hourly[k][h] * region_share[r] * jitter[h]) for h in range(24)]
            compare[k][r] = [round(prev_hourly[k][h] * region_share[r]) for h in range(24)]

    # ---------- KPI ----------
    active_by_range = {"today": 186_400_000, "7d": 201_800_000, "30d": 218_600_000}
    fiveg = {"today": 68.4, "7d": 67.2, "30d": 65.8}

    def kpi_block(range_key, region):
        h = hourly[range_key][region]
        ph = compare[range_key][region]
        total = sum(h)
        prev_total = sum(ph)
        peak_bps = max(h) * 8 / 3600
        prev_peak = max(ph) * 8 / 3600
        peak_hour = h.index(max(h))
        users = (active_by_range[range_key] * (region_user_share[region] if region != "all" else 1))
        prev_users = users / (1 + (0.012 if range_key == "today" else 0.021) + rng.uniform(-0.003, 0.003))
        busy = 0
        for c in cells:
            if region != "all" and c["region"] != region:
                continue
            if c["utilization"][range_key] >= 80:
                busy += 1
        busy_ratio = busy / len(cells) * 100 if region == "all" else busy / max(1, sum(1 for c in cells if c["region"] == region)) * 100
        return {
            "totalBytes": round(total),
            "activeUsers": round(users),
            "peakBps": round(peak_bps),
            "peakHour": peak_hour,
            "busyCellRatio": round(busy_ratio, 1),
            "fiveGShare": round(fiveg[range_key] + (0.8 if region in ("华东", "华南") else -0.3), 1),
            "perUserBytes": round(total / users) if users else 0,
            "delta": {
                "total": round((total / prev_total - 1) * 100, 1),
                "users": round((users / prev_users - 1) * 100, 1),
                "peak": round((peak_bps / prev_peak - 1) * 100, 1),
                "busy": round(rng.uniform(-4.5, 5.2), 1),
                "fiveG": round(rng.uniform(1.2, 3.6), 1),
                "perUser": round(rng.uniform(-2.0, 6.0), 1),
            },
        }

    kpis = {k: {r: kpi_block(k, r) for r in ["all"] + REGIONS} for k in RANGES}

    # ---------- 热力图：最近 7 天 × 24 小时 ----------
    heatmap = {}
    heat_days = DAYS[-7:]
    for region in ["all"] + REGIONS:
        points = []
        for di, d in enumerate(heat_days):
            for hh in range(24):
                v = daily[d.isoformat()][hh] * (region_share[region] if region != "all" else 1)
                points.append([hh, di, round(v * rng.uniform(0.97, 1.03))])
        heatmap[region] = points

    # ---------- 省份 ----------
    province_rows = {}
    region_bias = {"华东": 1.2, "华南": 0.8, "华北": 0.2, "华中": 0.5,
                   "西南": 0.9, "西北": -0.6, "东北": -1.1}
    for k in RANGES:
        rows = []
        national_total = sum(national_hourly[k])
        prev_total_all = sum(prev_hourly[k])
        base_growth = (national_total / prev_total_all - 1) * 100 if prev_total_all else 0
        for name, region, weight in PROVINCES:
            share = shares[name]
            traffic = national_total * share
            users = active_by_range[k] * user_shares[name]
            growth = base_growth + region_bias[region] + rng.gauss(0, 1.6)
            rows.append({
                "province": name,
                "region": region,
                "trafficBytes": round(traffic),
                "users": round(users),
                "perUserBytes": round(traffic / users),
                "share": round(share * 100, 2),
                "growth": round(growth, 1),
                "cells": sum(1 for c in cells if c["province"] == name),
            })
        province_rows[k] = sorted(rows, key=lambda x: -x["trafficBytes"])

    # ---------- 告警 ----------
    alerts = []
    hot = sorted(cells, key=lambda c: -c["utilization"]["today"])[:20]
    levels = ["严重", "警告", "提示"]
    msgs = ["忙时利用率超过 90%，出现排队", "忙时利用率超过 85%，需关注",
            "小区流量环比增长超过 30%", "上行速率低于门限", "基站退服告警"]
    for i, c in enumerate(hot[:14]):
        alerts.append({
            "id": "AL%04d" % (i + 1),
            "time": f"2026-11-08 {20 - i // 4:02d}:{(58 - i * 3) % 60:02d}",
            "level": levels[i % 3],
            "region": c["region"],
            "cellId": c["id"],
            "cellName": c["name"],
            "metric": "忙时利用率",
            "value": f"{c['utilization']['today']:.1f}%",
            "message": msgs[i % len(msgs)],
            "status": "待处理" if i < 9 else "已确认",
        })

    # ---------- 数据任务 ----------
    jobs = [
        ("JOB-2311", "traffic_hourly_agg", "Spark SQL", "运行中", 0.62, 428000000, "hdfs:///telco/agg/hourly"),
        ("JOB-2310", "province_traffic_rank", "MapReduce", "成功", 1.0, 562400000, "hdfs:///telco/agg/province"),
        ("JOB-2309", "cell_utilization", "Spark SQL", "成功", 1.0, 418600000, "hbase://cell_util"),
        ("JOB-2308", "fiveg_share_daily", "Spark SQL", "成功", 1.0, 286400000, "hdfs:///telco/agg/fiveg"),
        ("JOB-2307", "realtime_traffic_etl", "Flink", "运行中", 0.0, 0, "kafka://traffic-rt"),
        ("JOB-2306", "user_flow_profile", "MapReduce", "失败", 0.34, 128000000, "hdfs:///telco/dwd/user"),
        ("JOB-2305", "quickbi_export", "DataX", "成功", 1.0, 214000000, "mysql://bi_export"),
    ]
    job_rows = [{
        "id": j[0], "name": j[1], "engine": j[2], "status": j[3],
        "startTime": f"2026-11-08 {8 + i // 3:02d}:{(i * 11) % 60:02d}",
        "duration": ["2m 14s", "6m 41s", "3m 08s", "1m 52s", "—", "9m 30s", "4m 12s"][i],
        "rows": j[5], "output": j[6],
        "owner": ["etl", "warehouse", "warehouse", "etl", "realtime", "warehouse", "bi"][i],
    } for i, j in enumerate(jobs)]

    pipeline = {
        "sources": [
            {"name": "Kafka", "topic": "traffic-rt", "detail": "3 分区 · 2 副本", "status": "正常", "lag": 128},
            {"name": "HDFS", "topic": "hdfs:///telco/ods", "detail": "412 个块 · 1.8 TB", "status": "正常", "lag": None},
            {"name": "HBase", "topic": "traffic_hourly", "detail": "31 省 · 8,640 行", "status": "正常", "lag": None},
            {"name": "Spark", "topic": "thrift:10000", "detail": "3 executor · 12 core", "status": "正常", "lag": None},
        ],
        "stages": [
            {"name": "采集", "detail": "Kafka → HDFS", "status": "正常", "metric": "12.6 万条/秒"},
            {"name": "清洗", "detail": "Spark ETL", "status": "正常", "metric": "5.6 亿行/日"},
            {"name": "聚合", "detail": "按小时/省/小区", "status": "正常", "metric": "8 张结果表"},
            {"name": "服务", "detail": "HBase + API", "status": "正常", "metric": "P95 42ms"},
            {"name": "可视化", "detail": "Quick BI / 自研前端", "status": "正常", "metric": "6 个看板"},
        ],
    }

    meta = {
        "operator": "中国电信",
        "generatedAt": "2026-11-08T21:00:00+08:00",
        "dateStart": DAYS[0].isoformat(),
        "dateEnd": DAYS[-1].isoformat(),
        "provinceCount": len(PROVINCES),
        "cellCount": len(cells),
        "records": 562_400_000,
        "mode": "mock",
        "contractVersion": "v1",
        "lastSync": "2026-11-08 21:00:12",
    }

    data = {
        "meta": meta,
        "regions": REGIONS,
        "provinces": [{"name": p[0], "region": p[1]} for p in PROVINCES],
        "kpis": kpis,
        "hourly": hourly,
        "compare": compare,
        "heatmap": heatmap,
        "provinceRows": province_rows,
        "cells": cells,
        "alerts": alerts,
        "jobs": job_rows,
        "pipeline": pipeline,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("written", OUT, OUT.stat().st_size, "bytes")
    print("cells", len(cells), "alerts", len(alerts), "jobs", len(job_rows))
    print("today total PB", round(sum(hourly["today"]["all"]) / 1e15, 2))
    print("peak Tbps", round(kpis["today"]["all"]["peakBps"] / 1e12, 2), "peakHour", kpis["today"]["all"]["peakHour"])
    print("30d total EB", round(sum(hourly["30d"]["all"]) / 1e18, 2))


if __name__ == "__main__":
    main()
