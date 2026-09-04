(() => {
  "use strict";

  const data = window.BI_DATA;
  if (!data || !Array.isArray(data.events)) {
    document.body.innerHTML = '<main><section class="panel"><h1>数据文件未生成</h1><p>请先运行“刷新BI.command”。</p></section></main>';
    return;
  }

  if (!Array.isArray(data.trends) && Array.isArray(data.trendsPacked)) {
    const dictionaries = data.trendDictionaries || {};
    const platforms = dictionaries.platforms || [];
    const products = dictionaries.products || [];
    const markets = dictionaries.markets || [];
    const sources = dictionaries.sources || [];
    data.trends = data.trendsPacked.map((row) => ({
      platform: platforms[row[0]] || "ios",
      productKey: products[row[1]] || "",
      marketCode: markets[row[2]] || "",
      date: row[3] || "",
      free: row[4],
      grossing: row[5],
      freeSource: row[6] >= 0 ? sources[row[6]] || "" : "",
      grossingSource: row[7] >= 0 ? sources[row[7]] || "" : "",
    }));
    delete data.trendsPacked;
  }
  if (!Array.isArray(data.trends)) data.trends = [];

  const regionByCode = new Map(data.regions.map((region) => [region.code, region.name]));
  const productByKey = new Map(data.products.map((product) => [product.key, product.name]));
  const platformByCode = new Map((data.meta.platforms || []).map((platform) => [platform.code, platform.name]));
  const versionByPair = new Map(data.versions.map((version) => [
    `${version.platform || "ios"}|${version.productKey}|${version.marketCode}`,
    version,
  ]));
  for (const point of data.trends) {
    point.platform = point.platform || "ios";
    const version = versionByPair.get(`${point.platform}|${point.productKey}|${point.marketCode}`);
    point.product = version?.product || productByKey.get(point.productKey) || point.productKey;
    point.region = version?.region || regionByCode.get(point.marketCode) || point.marketCode;
  }

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    platform: $("#platform-filter"),
    region: $("#region-filter"),
    product: $("#product-filter"),
    ip: $("#ip-filter"),
    startDate: $("#start-date-filter"),
    endDate: $("#end-date-filter"),
    startRange: $("#start-date-range"),
    endRange: $("#end-date-range"),
    rangeTrack: $("#date-range-track"),
    rangeLabel: $("#date-range-label"),
    rangeMin: $("#date-range-min"),
    rangeMax: $("#date-range-max"),
    search: $("#search-filter"),
    reset: $("#reset-filters"),
    summary: $("#filter-summary"),
    eventBody: $("#event-table-body"),
    eventEmpty: $("#event-empty"),
    eventCount: $("#event-count"),
    coverageBody: $("#coverage-table-body"),
    coverageEmpty: $("#coverage-empty"),
    coverageCount: $("#coverage-count"),
    impactList: $("#impact-list"),
    ipRankingList: $("#ip-ranking-list"),
    rankingScope: $("#ranking-scope"),
    trendProductSelector: $("#trend-product-selector"),
    trendPlatformSelector: $("#trend-platform-selector"),
    trendRegionSelector: $("#trend-region-selector"),
    trendChart: $("#trend-chart"),
    trendSubtitle: $("#trend-subtitle"),
    trendEventSummary: $("#trend-event-summary"),
    trendTooltip: $("#trend-tooltip"),
    scoreSecondaryLabel: $("#score-secondary-label"),
    trendSecondaryLabel: $("#trend-secondary-label"),
    eventSecondaryLabel: $("#event-secondary-label"),
    coverageSecondaryLabel: $("#coverage-secondary-label"),
  };

  const observedDates = [
    ...data.events.map((event) => firstIsoDate(event.start)),
    ...data.trends.map((point) => point.date),
  ].filter(Boolean).sort();
  const minimumDate = observedDates[0] || "";
  const maximumDate = observedDates.at(-1) || data.meta.latestRankDate || "";
  const recentStart = maximumDate ? new Date(`${maximumDate}T00:00:00Z`) : null;
  if (recentStart) recentStart.setUTCDate(recentStart.getUTCDate() - 89);
  const recentStartText = recentStart ? recentStart.toISOString().slice(0, 10) : "";
  const defaultStartDate = minimumDate && recentStartText ? (minimumDate > recentStartText ? minimumDate : recentStartText) : minimumDate;
  const defaultEndDate = maximumDate;
  const dayMilliseconds = 24 * 60 * 60 * 1000;
  const minimumTime = minimumDate ? Date.parse(`${minimumDate}T00:00:00Z`) : 0;
  const maximumTime = maximumDate ? Date.parse(`${maximumDate}T00:00:00Z`) : minimumTime;
  const dateRangeDays = Math.max(0, Math.round((maximumTime - minimumTime) / dayMilliseconds));
  const state = {
    platform: "all", region: "all", product: "all", ip: "all", search: "", trendKey: "",
    startDate: defaultStartDate, endDate: defaultEndDate,
  };
  const numberFormat = new Intl.NumberFormat("zh-CN");

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function firstIsoDate(value) {
    return String(value || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
  }

  function dateToRangeValue(value) {
    if (!value || !minimumTime) return 0;
    return Math.max(0, Math.min(dateRangeDays, Math.round((Date.parse(`${value}T00:00:00Z`) - minimumTime) / dayMilliseconds)));
  }

  function rangeValueToDate(value) {
    return new Date(minimumTime + Number(value) * dayMilliseconds).toISOString().slice(0, 10);
  }

  function syncRangeControls() {
    const startValue = dateToRangeValue(state.startDate || minimumDate);
    const endValue = dateToRangeValue(state.endDate || maximumDate);
    elements.startRange.value = startValue;
    elements.endRange.value = endValue;
    elements.startDate.value = state.startDate;
    elements.endDate.value = state.endDate;
    elements.rangeLabel.textContent = `${state.startDate || minimumDate || "最早"} — ${state.endDate || maximumDate || "最新"}`;
    elements.rangeMin.textContent = minimumDate || "—";
    elements.rangeMax.textContent = maximumDate || "—";
    const startPercent = dateRangeDays ? startValue / dateRangeDays * 100 : 0;
    const endPercent = dateRangeDays ? endValue / dateRangeDays * 100 : 100;
    elements.rangeTrack.style.background = `linear-gradient(to right, #dce4ee 0%, #dce4ee ${startPercent}%, var(--blue) ${startPercent}%, var(--teal) ${endPercent}%, #dce4ee ${endPercent}%, #dce4ee 100%)`;
    elements.startRange.style.zIndex = startValue >= dateRangeDays - 1 ? "4" : "3";
  }

  function eventInPeriod(event) {
    const start = firstIsoDate(event.start);
    const end = firstIsoDate(event.end) || start;
    if (!start) return !state.startDate && !state.endDate;
    if (state.endDate && start > state.endDate) return false;
    if (state.startDate && end < state.startDate) return false;
    return true;
  }

  function platformName(code) {
    return platformByCode.get(code || "ios") || code || "iOS";
  }

  function secondaryMetricLabel(platform) {
    if (platform === "wechat_minigame") return "人气榜";
    if (platform === "douyin_minigame") return "热门榜";
    if (platform === "all") return "免费下载 / 小游戏人气热门榜";
    return "免费下载榜·游戏榜";
  }

  function updateMetricLabels() {
    const label = secondaryMetricLabel(state.platform);
    elements.scoreSecondaryLabel.textContent = `榜单表现内部：畅销榜80%＋${label}20%`;
    elements.trendSecondaryLabel.innerHTML = `<i class="legend-line free"></i>${escapeHtml(label)}`;
    elements.eventSecondaryLabel.textContent = label;
    elements.coverageSecondaryLabel.textContent = label;
  }

  function formatTimestamp(value) {
    if (!value) return "暂无刷新时间";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return `数据生成 ${new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).format(parsed)}（日本时间）`;
  }

  function eventStatusKind(event) {
    return /进行中|预告/.test(event.status) ? "active" : "ended";
  }

  function statusClass(value) {
    if (String(value).startsWith("已读取")) return "read";
    if (String(value).startsWith("未入榜")) return "unranked";
    if (String(value).startsWith("未读取")) return "unread";
    if (String(value).startsWith("未提供")) return "unread";
    if (String(value).startsWith("公开范围外")) return "pending";
    if (String(value).startsWith("待抓取") || String(value).startsWith("待配置")) return "pending";
    return "";
  }

  function rankChangeHtml(change) {
    if (typeof change?.delta === "number") {
      const direction = change.delta < 0 ? "up" : change.delta > 0 ? "down" : "";
      const arrow = change.delta < 0 ? "↑" : change.delta > 0 ? "↓" : "→";
      return `<span class="rank-change ${direction}">${arrow}${Math.abs(change.delta)} 位</span><span class="table-secondary">${escapeHtml(change.display)}</span>`;
    }
    return `<span class="rank-change missing">${escapeHtml(change?.display || "—")}</span>`;
  }

  function populateFilters() {
    for (const input of [elements.startDate, elements.endDate]) {
      input.min = minimumDate;
      input.max = maximumDate;
    }
    for (const input of [elements.startRange, elements.endRange]) {
      input.min = 0;
      input.max = dateRangeDays;
      input.step = 1;
    }
    syncRangeControls();
  }

  function eventMatches(event, ignoredDimension = "") {
    const query = state.search.trim().toLocaleLowerCase("zh-CN");
    if (ignoredDimension !== "platform" && state.platform !== "all" && (event.platform || "ios") !== state.platform) return false;
    if (ignoredDimension !== "region" && state.region !== "all" && event.region !== state.region) return false;
    if (ignoredDimension !== "product" && state.product !== "all" && event.productKey !== state.product) return false;
    if (ignoredDimension !== "ip" && state.ip !== "all" && (event.ipFamily || event.ip) !== state.ip) return false;
    if (!eventInPeriod(event)) return false;
    if (query && !`${event.product} ${event.ip} ${event.ipFamily || ""}`.toLocaleLowerCase("zh-CN").includes(query)) return false;
    return true;
  }

  function facetOptions(dimension) {
    const values = new Set();
    for (const event of data.events) {
      if (!eventMatches(event, dimension)) continue;
      if (dimension === "platform") values.add(event.platform || "ios");
      if (dimension === "region") values.add(event.region);
      if (dimension === "product") values.add(event.productKey);
      if (dimension === "ip") values.add(event.ipFamily || event.ip);
    }

    if (dimension === "platform") {
      const order = new Map((data.meta.platforms || []).map((platform, index) => [platform.code, index]));
      return [...values].filter(Boolean).sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b));
    }
    if (dimension === "region") {
      const order = new Map(data.regions.map((region, index) => [region.name, index]));
      return [...values].filter(Boolean).sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b));
    }
    if (dimension === "product") {
      return [...values].filter(Boolean).sort((a, b) => (productByKey.get(a) || a).localeCompare(productByKey.get(b) || b));
    }
    return [...values].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }

  function facetLabel(dimension, value) {
    if (dimension === "platform") return platformName(value);
    if (dimension === "product") return productByKey.get(value) || value;
    return value;
  }

  function syncFacetFilters() {
    const definitions = [
      ["platform", elements.platform, "全部平台"],
      ["region", elements.region, "全部地区"],
      ["product", elements.product, "全部产品"],
      ["ip", elements.ip, "全部IP"],
    ];

    // Date and keyword changes can invalidate several active facets at once.
    // Repeat until every retained selection exists in the same result set.
    for (let pass = 0; pass < definitions.length; pass += 1) {
      let changed = false;
      for (const [dimension] of definitions) {
        if (state[dimension] === "all") continue;
        if (!facetOptions(dimension).includes(state[dimension])) {
          state[dimension] = "all";
          changed = true;
        }
      }
      if (!changed) break;
    }

    for (const [dimension, select, allLabel] of definitions) {
      const options = facetOptions(dimension);
      select.innerHTML = `<option value="all">${allLabel}</option>${options.map((value) => (
        `<option value="${escapeHtml(value)}">${escapeHtml(facetLabel(dimension, value))}</option>`
      )).join("")}`;
      select.value = state[dimension];
    }
  }

  function filteredEvents() {
    return data.events.filter((event) => eventMatches(event));
  }

  function filteredVersions() {
    const combinations = new Set(filteredEvents().map((event) => (
      `${event.platform || "ios"}|${event.productKey}|${event.region}`
    )));
    return data.versions.filter((version) => combinations.has(
      `${version.platform || "ios"}|${version.productKey}|${version.region}`
    ));
  }

  function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function impactMetric(deltas) {
    if (!deltas.length) return null;
    const lifts = deltas.map((delta) => -delta);
    const best = Math.max(...lifts);
    const mean = average(lifts);
    return { best, mean, score: clamp(best * 0.55 + mean * 0.45, 0, 100) };
  }

  function scoreGrade(score) {
    if (score === null) return { label: "数据不足", className: "insufficient" };
    if (score >= 75) return { label: "现象级", className: "phenomenon" };
    if (score >= 55) return { label: "强势", className: "strong" };
    if (score >= 30) return { label: "有效", className: "effective" };
    return { label: "一般", className: "ordinary" };
  }

  function buildIpRankings(events) {
    const groups = new Map();
    for (const event of events) {
      const ip = event.ipFamily || event.ip;
      if (!groups.has(ip)) groups.set(ip, []);
      groups.get(ip).push(event);
    }
    return [...groups.entries()].map(([ip, ipEvents]) => {
      const scoringEvents = ipEvents.filter((event) => event.scoreEligible !== false);
      const projects = new Set(ipEvents.map((event) => `${event.productKey || event.product}|${firstIsoDate(event.start)}|${ip}`));
      const scoringProjects = new Set(scoringEvents.map((event) => `${event.productKey || event.product}|${firstIsoDate(event.start)}|${ip}`));
      const regions = new Set(ipEvents.map((event) => event.region));
      const regionPlatforms = new Set(ipEvents.map((event) => `${event.platform || "ios"}|${event.region}`));
      const grossingDeltas = scoringEvents.map((event) => event.grossing?.delta).filter((value) => typeof value === "number");
      const freeDeltas = scoringEvents.map((event) => event.free?.delta).filter((value) => typeof value === "number");
      const grossingMetric = impactMetric(grossingDeltas);
      const freeMetric = impactMetric(freeDeltas);
      const availableWeight = (grossingMetric ? 0.8 : 0) + (freeMetric ? 0.2 : 0);
      const rawEffect = availableWeight
        ? ((grossingMetric?.score || 0) * 0.8 + (freeMetric?.score || 0) * 0.2) / availableWeight
        : null;
      const effectSamples = scoringEvents.filter((event) => typeof event.grossing?.delta === "number" || typeof event.free?.delta === "number").length;
      const confidence = Math.min(1, effectSamples / 3);
      const effectScore = rawEffect === null ? null : rawEffect * (0.75 + 0.25 * confidence);
      const activityScore = Math.min(1, scoringProjects.size / 3) * 100;
      const score = effectScore === null ? null : Math.round(effectScore * 0.70 + activityScore * 0.30);
      const grade = scoreGrade(score);

      const regionHighlights = [...regionPlatforms].map((value) => {
        const [platform, region] = value.split("|");
        const regionEvents = ipEvents.filter((event) => (event.platform || "ios") === platform && event.region === region);
        const grossing = regionEvents.map((event) => event.grossing?.delta).filter((value) => typeof value === "number").sort((a, b) => a - b)[0];
        const free = regionEvents.map((event) => event.free?.delta).filter((value) => typeof value === "number").sort((a, b) => a - b)[0];
        const delta = typeof grossing === "number" ? grossing : free;
        return { platform, region, delta, metric: typeof grossing === "number" ? "畅销" : "免费" };
      }).sort((a, b) => {
        if (typeof a.delta !== "number") return 1;
        if (typeof b.delta !== "number") return -1;
        return a.delta - b.delta;
      });

      return {
        ip,
        score,
        grade,
        projects: projects.size,
        regions: regions.size,
        samples: effectSamples,
        effectScore: effectScore === null ? null : Math.round(effectScore),
        activityScore: Math.round(activityScore),
        bestGrossingLift: grossingMetric?.best ?? null,
        averageGrossingLift: grossingMetric?.mean ?? null,
        bestFreeLift: freeMetric?.best ?? null,
        regionHighlights,
      };
    }).sort((a, b) => {
      if (a.score === null && b.score !== null) return 1;
      if (a.score !== null && b.score === null) return -1;
      if (a.score !== b.score) return (b.score || 0) - (a.score || 0);
      return b.projects - a.projects || (b.effectScore || 0) - (a.effectScore || 0) || a.ip.localeCompare(b.ip);
    });
  }

  function renderKpis(events, versions, rankings) {
    const projects = new Set(events.map((event) => `${event.productKey || event.product}|${firstIsoDate(event.start)}|${event.ipFamily || event.ip}`));
    const readVersions = versions.filter((version) => {
      const statuses = [version.freeStatus, version.grossingStatus];
      return statuses.some((status) => /^已读取|^未入榜/.test(status));
    });
    const best = rankings.find((ranking) => ranking.score !== null);

    $("#kpi-events").textContent = numberFormat.format(rankings.length);
    const platformScope = state.platform === "all" ? "全部平台" : platformName(state.platform);
    $("#kpi-events-note").textContent = `${platformScope} · ${state.region === "all" ? "全部地区" : state.region} · 按IP家族去重`;
    $("#kpi-products").textContent = numberFormat.format(projects.size);
    $("#kpi-read").textContent = numberFormat.format(readVersions.length);
    $("#kpi-read-note").textContent = `筛选内共 ${versions.length} 个配置`;
    $("#kpi-best").textContent = best ? `${best.score}` : "—";
    $("#kpi-best-note").textContent = best ? `${best.ip} · ${best.grade.label}` : "暂无可评分IP";
  }

  function liftLabel(value) {
    if (typeof value !== "number") return "—";
    return value > 0 ? `↑${Math.round(value)}` : value < 0 ? `↓${Math.abs(Math.round(value))}` : "持平";
  }

  function renderIpRankings(rankings) {
    const scope = state.region === "all" ? "全部地区" : state.region;
    const platformScope = state.platform === "all" ? "全部平台" : platformName(state.platform);
    elements.rankingScope.textContent = `${platformScope} · ${scope} · ${state.startDate || minimumDate || "最早"} 至 ${state.endDate || maximumDate || "最新"} · 综合榜单表现和筛选期联动活跃度`;
    if (!rankings.length) {
      elements.ipRankingList.innerHTML = '<div class="empty-state">当前筛选条件下没有可排行的IP。</div>';
      return;
    }
    elements.ipRankingList.innerHTML = rankings.slice(0, 10).map((ranking, index) => {
      const score = ranking.score === null ? "—" : ranking.score;
      const barWidth = ranking.score === null ? 3 : Math.max(3, ranking.score);
      const regions = ranking.regionHighlights.slice(0, 4).map((item) => {
        const effect = typeof item.delta === "number"
          ? `${item.delta < 0 ? "↑" : item.delta > 0 ? "↓" : "→"}${Math.abs(item.delta)}`
          : "无数字";
        return `<span>${escapeHtml(item.region)} · ${escapeHtml(platformName(item.platform))} ${effect}</span>`;
      }).join("");
      return `
        <article class="ip-rank-row">
          <div class="ip-rank-position">${index + 1}</div>
          <div class="ip-rank-main">
            <div class="ip-rank-head">
              <button type="button" class="ip-rank-name" data-ip-filter="${escapeHtml(ranking.ip)}">${escapeHtml(ranking.ip)}</button>
              <span class="grade ${ranking.grade.className}">${ranking.grade.label}</span>
            </div>
            <div class="ip-rank-meta">${ranking.projects} 个项目 · ${ranking.regions} 个地区 · ${ranking.samples} 个有效效果样本</div>
            <div class="ip-score-track"><div class="ip-score-bar ${ranking.grade.className}" style="width:${barWidth}%"></div></div>
            <div class="ip-region-effects">${regions || '<span>地区榜单数据不足</span>'}</div>
          </div>
          <div class="ip-rank-metrics">
            <div class="ip-score"><strong>${score}</strong><span>影响力分</span></div>
            <dl>
              <div><dt>畅销最佳</dt><dd>${liftLabel(ranking.bestGrossingLift)}</dd></div>
              <div><dt>畅销均值</dt><dd>${liftLabel(ranking.averageGrossingLift)}</dd></div>
              <div><dt>${escapeHtml(secondaryMetricLabel(state.platform))}最佳</dt><dd>${liftLabel(ranking.bestFreeLift)}</dd></div>
            </dl>
          </div>
        </article>`;
    }).join("");
    elements.ipRankingList.querySelectorAll("[data-ip-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.ip = button.dataset.ipFilter;
        elements.ip.value = state.ip;
        render();
        elements.ip.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  function renderImpact(events) {
    const ranked = events
      .filter((event) => typeof event.grossing?.delta === "number")
      .sort((a, b) => a.grossing.delta - b.grossing.delta)
      .slice(0, 7);
    if (!ranked.length) {
      elements.impactList.innerHTML = '<div class="empty-state">当前范围没有可计算的畅销榜差值。</div>';
      return;
    }
    const max = Math.max(...ranked.map((event) => Math.abs(event.grossing.delta)), 1);
    elements.impactList.innerHTML = ranked.map((event) => {
      const delta = event.grossing.delta;
      const decline = delta > 0;
      const width = Math.max(5, Math.round(Math.abs(delta) / max * 100));
      return `
        <div class="impact-row">
          <div class="impact-label">
            <div class="impact-name">
              <strong>${escapeHtml(event.product)}</strong>
              <span>${escapeHtml(platformName(event.platform))} · ${escapeHtml(event.region)} · ${escapeHtml(event.ip)}</span>
            </div>
            <span class="impact-delta ${decline ? "decline" : ""}">${decline ? "↓" : "↑"}${Math.abs(delta)} 位</span>
          </div>
          <div class="impact-track"><div class="impact-bar ${decline ? "decline" : ""}" style="width:${width}%"></div></div>
        </div>`;
    }).join("");
  }

  function renderEvents(events) {
    const sorted = [...events].sort((a, b) => firstIsoDate(b.start).localeCompare(firstIsoDate(a.start)) || a.product.localeCompare(b.product));
    elements.eventCount.textContent = `${sorted.length} 条`;
    elements.eventEmpty.hidden = sorted.length > 0;
    elements.eventBody.innerHTML = sorted.map((event) => {
      const kind = eventStatusKind(event);
      return `
        <tr>
          <td><span class="table-primary">${escapeHtml(platformName(event.platform))} · ${escapeHtml(event.region)}</span><span class="table-secondary">${escapeHtml(event.serverVersion)}</span></td>
          <td><span class="table-primary">${escapeHtml(event.product)}</span><span class="table-secondary">${escapeHtml(event.ip)}</span></td>
          <td><span class="table-primary">${escapeHtml(event.start)}</span><span class="table-secondary">${event.end ? `至 ${escapeHtml(event.end)}` : "结束日待补"}</span></td>
          <td><span class="status-chip ${kind}">${escapeHtml(event.status)}</span></td>
          <td>${rankChangeHtml(event.free)}</td>
          <td>${rankChangeHtml(event.grossing)}</td>
        </tr>`;
    }).join("");
  }

  function renderCoverage(versions) {
    const sorted = [...versions].sort((a, b) => (a.platform || "ios").localeCompare(b.platform || "ios") || a.region.localeCompare(b.region) || a.product.localeCompare(b.product));
    elements.coverageCount.textContent = `${sorted.length} 项`;
    elements.coverageEmpty.hidden = sorted.length > 0;
    elements.coverageBody.innerHTML = sorted.map((version) => `
      <tr>
        <td><span class="table-primary">${escapeHtml(version.product)}</span><span class="table-secondary">${escapeHtml(version.productKey)}</span></td>
        <td><span class="table-primary">${escapeHtml(version.region)}</span><span class="table-secondary">${escapeHtml(version.serverVersion)}</span></td>
        <td><span class="table-primary">${escapeHtml(platformName(version.platform))}</span><span class="table-secondary">${escapeHtml(version.storeId || version.appId || "—")}</span></td>
        <td><span class="status-chip ${statusClass(version.freeStatus)}">${escapeHtml(version.freeStatus || "待抓取")}</span></td>
        <td><span class="status-chip ${statusClass(version.grossingStatus)}">${escapeHtml(version.grossingStatus || "待抓取")}</span></td>
        <td><div class="source-links">${version.qimaiUrl ? `<a href="${escapeHtml(version.qimaiUrl)}" target="_blank" rel="noopener">七麦</a>` : ""}${version.appMagicUrl ? `<a href="${escapeHtml(version.appMagicUrl)}" target="_blank" rel="noopener">AppMagic</a>` : ""}${version.popularityUrl ? `<a href="${escapeHtml(version.popularityUrl)}" target="_blank" rel="noopener">${version.platform === "wechat_minigame" ? "人气榜" : "热门榜"}</a>` : ""}${version.rankUrl ? `<a href="${escapeHtml(version.rankUrl)}" target="_blank" rel="noopener">渠道畅销榜</a>` : ""}${version.storeUrl ? `<a href="${escapeHtml(version.storeUrl)}" target="_blank" rel="noopener">${String(version.platform).endsWith("_minigame") ? "小游戏页" : (version.platform === "android" ? "Google Play" : "App Store")}</a>` : ""}${!version.qimaiUrl && !version.appMagicUrl && !version.popularityUrl && !version.rankUrl && !version.storeUrl ? "—" : ""}</div></td>
      </tr>`).join("");
  }

  function trendGroups() {
    const groups = new Map();
    const relatedCombinations = new Set(filteredEvents().map((event) => (
      `${event.platform || "ios"}|${event.productKey}|${event.region}`
    )));
    for (const point of data.trends) {
      if (state.platform !== "all" && point.platform !== state.platform) continue;
      if (state.region !== "all" && point.region !== state.region) continue;
      if (state.product !== "all" && point.productKey !== state.product) continue;
      if (state.startDate && point.date < state.startDate) continue;
      if (state.endDate && point.date > state.endDate) continue;
      const key = `${point.platform}|${point.productKey}|${point.region}`;
      if (!relatedCombinations.has(key)) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(point);
    }
    return [...groups.entries()]
      .map(([key, points]) => {
        const sorted = points.sort((a, b) => a.date.localeCompare(b.date));
        const freeCount = sorted.filter((point) => typeof point.free === "number").length;
        const grossingCount = sorted.filter((point) => typeof point.grossing === "number").length;
        return {
          key,
          points: sorted,
          seriesCount: Number(freeCount > 0) + Number(grossingCount > 0),
          numericCount: freeCount + grossingCount,
        };
      })
      .sort((a, b) => b.seriesCount - a.seriesCount || b.numericCount - a.numericCount || b.points.length - a.points.length || a.key.localeCompare(b.key));
  }

  function rebuildTrendSelectors() {
    const groups = trendGroups();
    if (!groups.length) {
      state.trendKey = "";
      elements.trendProductSelector.innerHTML = '<option value="">当前筛选没有产品</option>';
      elements.trendPlatformSelector.innerHTML = '<option value="">当前筛选没有平台</option>';
      elements.trendRegionSelector.innerHTML = '<option value="">当前筛选没有地区</option>';
      elements.trendProductSelector.disabled = true;
      elements.trendPlatformSelector.disabled = true;
      elements.trendRegionSelector.disabled = true;
      renderTrend();
      return;
    }

    const currentGroup = groups.find((group) => group.key === state.trendKey);
    let selectedProduct = currentGroup?.points[0]?.productKey || "";
    const productGroups = new Map();
    for (const group of groups) {
      const first = group.points[0];
      if (!productGroups.has(first.productKey)) productGroups.set(first.productKey, group);
    }
    if (!productGroups.has(selectedProduct)) selectedProduct = productGroups.keys().next().value || "";

    elements.trendProductSelector.innerHTML = [...productGroups.entries()].map(([productKey, group]) => {
      const product = group.points[0].product;
      return `<option value="${escapeHtml(productKey)}" ${productKey === selectedProduct ? "selected" : ""}>${escapeHtml(product)}</option>`;
    }).join("");

    const platformGroups = groups.filter((group) => group.points[0].productKey === selectedProduct);
    let selectedPlatform = currentGroup?.points[0]?.productKey === selectedProduct ? currentGroup.points[0].platform : "";
    if (!platformGroups.some((group) => group.points[0].platform === selectedPlatform)) {
      selectedPlatform = platformGroups[0]?.points[0]?.platform || "";
    }
    const platformOptions = [...new Map(platformGroups.map((group) => [group.points[0].platform, group])).entries()];
    elements.trendPlatformSelector.innerHTML = platformOptions.map(([platform]) => (
      `<option value="${escapeHtml(platform)}" ${platform === selectedPlatform ? "selected" : ""}>${escapeHtml(platformName(platform))}</option>`
    )).join("");

    const regionGroups = platformGroups.filter((group) => group.points[0].platform === selectedPlatform);
    let selectedRegion = currentGroup?.points[0]?.productKey === selectedProduct && currentGroup?.points[0]?.platform === selectedPlatform ? currentGroup.points[0].region : "";
    if (!regionGroups.some((group) => group.points[0].region === selectedRegion)) {
      selectedRegion = regionGroups[0]?.points[0]?.region || "";
    }
    const selectedGroup = regionGroups.find((group) => group.points[0].region === selectedRegion);
    state.trendKey = selectedGroup?.key || "";
    elements.trendRegionSelector.innerHTML = regionGroups.map((group) => {
      const region = group.points[0].region;
      return `<option value="${escapeHtml(region)}" ${region === selectedRegion ? "selected" : ""}>${escapeHtml(region)}</option>`;
    }).join("");
    elements.trendProductSelector.disabled = false;
    elements.trendPlatformSelector.disabled = !platformOptions.length;
    elements.trendRegionSelector.disabled = !regionGroups.length;
    renderTrend(selectedGroup);
  }

  function lineSegments(points, field, x, y) {
    const segments = [];
    let current = [];
    let previousDate = null;
    for (const point of points) {
      const value = point[field];
      const day = new Date(`${point.date}T00:00:00Z`);
      const gap = previousDate ? (day - previousDate) / 86400000 : 0;
      if (typeof value !== "number" || gap > 5) {
        if (current.length) segments.push(current);
        current = [];
      }
      if (typeof value === "number") current.push(`${x(day).toFixed(1)},${y(value).toFixed(1)}`);
      previousDate = day;
    }
    if (current.length) segments.push(current);
    return segments;
  }

  function renderTrend(group) {
    const container = elements.trendChart;
    elements.trendTooltip.hidden = true;
    if (!group?.points?.length) {
      elements.trendSubtitle.textContent = "当前筛选范围没有可绘制的趋势点";
      elements.trendEventSummary.innerHTML = "";
      container.innerHTML = `<svg viewBox="0 0 720 320" aria-label="没有趋势数据"><text class="empty-label" x="360" y="160" text-anchor="middle">暂无${escapeHtml(secondaryMetricLabel(state.platform))}或畅销榜排名</text></svg>`;
      return;
    }

    const points = group.points;
    const first = points[0];
    const secondaryLabel = secondaryMetricLabel(first.platform);
    const sources = [...new Set(points.flatMap((point) => [point.freeSource, point.grossingSource]).filter(Boolean))].join(" + ") || "待核验";
    const selectedEvents = filteredEvents()
      .filter((event) => (event.platform || "ios") === first.platform && event.productKey === first.productKey && event.region === first.region)
      .sort((a, b) => firstIsoDate(a.start).localeCompare(firstIsoDate(b.start)) || a.ip.localeCompare(b.ip));
    elements.trendSubtitle.textContent = `${first.product} · ${platformName(first.platform)} · ${first.region} · ${points[0].date} 至 ${points.at(-1).date} · ${selectedEvents.length} 个联动 · 数据源：${sources}`;
    elements.trendEventSummary.innerHTML = selectedEvents.length
      ? `<strong>联动时间</strong>${selectedEvents.map((event, index) => {
        const start = firstIsoDate(event.start) || event.start || "开始日待补";
        const end = firstIsoDate(event.end) || event.end || "结束日待补";
        return `<span><b>${index + 1}</b>${escapeHtml(event.ip)}：${escapeHtml(start)} — ${escapeHtml(end)}</span>`;
      }).join("")}`
      : '<span>当前趋势范围没有对应联动记录</span>';
    const width = Math.max(container.clientWidth || 720, 360);
    const height = width < 560 ? 300 : 330;
    const margin = { top: selectedEvents.length ? 46 : 18, right: 18, bottom: 36, left: 54 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const dates = points.map((point) => new Date(`${point.date}T00:00:00Z`));
    const ranks = points.flatMap((point) => [point.free, point.grossing]).filter((value) => typeof value === "number");
    if (!ranks.length) {
      container.innerHTML = `<svg viewBox="0 0 720 320" aria-label="没有趋势数据"><text class="empty-label" x="360" y="160" text-anchor="middle">所选项目没有可绘制的榜单排名</text></svg>`;
      return;
    }
    const minTime = Math.min(...dates.map(Number));
    const maxTime = Math.max(...dates.map(Number));
    const minRank = Math.max(1, Math.floor(Math.min(...ranks) * 0.9));
    const maxRank = Math.max(minRank + 10, Math.ceil(Math.max(...ranks) * 1.08));
    const x = (day) => margin.left + ((Number(day) - minTime) / Math.max(1, maxTime - minTime)) * plotWidth;
    const y = (rank) => margin.top + ((rank - minRank) / Math.max(1, maxRank - minRank)) * plotHeight;

    const yTicks = Array.from({ length: 5 }, (_, index) => Math.round(minRank + (maxRank - minRank) * index / 4));
    const xTickCount = Math.min(points.length, width < 560 ? 3 : 5);
    const xTicks = [...new Set(Array.from({ length: xTickCount }, (_, index) => (
      Math.round((points.length - 1) * index / Math.max(1, xTickCount - 1))
    )))].map((pointIndex) => points[pointIndex]);
    const formatDay = (value) => value.slice(5).replace("-", "/");

    const bands = selectedEvents.map((event, index) => {
      const start = firstIsoDate(event.start);
      const end = firstIsoDate(event.end) || start;
      if (!start) return "";
      const bandStart = Math.max(minTime, Number(new Date(`${start}T00:00:00Z`)));
      const bandEnd = Math.min(maxTime, Number(new Date(`${end}T00:00:00Z`)));
      if (bandEnd < minTime || bandStart > maxTime) return "";
      const left = x(new Date(bandStart));
      const right = x(new Date(bandEnd));
      const labelY = 15 + (index % 2) * 15;
      const startInside = Number(new Date(`${start}T00:00:00Z`)) >= minTime && Number(new Date(`${start}T00:00:00Z`)) <= maxTime;
      const endInside = firstIsoDate(event.end) && Number(new Date(`${firstIsoDate(event.end)}T00:00:00Z`)) >= minTime && Number(new Date(`${firstIsoDate(event.end)}T00:00:00Z`)) <= maxTime;
      const startMarker = startInside
        ? `<line class="event-boundary start" x1="${left.toFixed(1)}" x2="${left.toFixed(1)}" y1="${margin.top}" y2="${margin.top + plotHeight}"></line><text class="event-marker-label" x="${Math.min(width - margin.right - 42, left + 4).toFixed(1)}" y="${labelY}">#${index + 1} 开始</text>`
        : "";
      const endMarker = endInside && right - left > 1
        ? `<line class="event-boundary end" x1="${right.toFixed(1)}" x2="${right.toFixed(1)}" y1="${margin.top}" y2="${margin.top + plotHeight}"></line><text class="event-marker-label end" x="${Math.max(margin.left + 42, right - 4).toFixed(1)}" y="${labelY}" text-anchor="end">#${index + 1} 结束</text>`
        : "";
      return `<rect class="event-band" x="${left.toFixed(1)}" y="${margin.top}" width="${Math.max(2, right - left).toFixed(1)}" height="${plotHeight}"><title>#${index + 1} ${escapeHtml(event.ip)}：${escapeHtml(start)} — ${escapeHtml(firstIsoDate(event.end) || "结束日待补")}</title></rect>${startMarker}${endMarker}`;
    }).join("");

    const grid = yTicks.map((tick) => `
      <line class="grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${y(tick)}" y2="${y(tick)}"></line>
      <text class="axis-label" x="${margin.left - 10}" y="${y(tick) + 4}" text-anchor="end">${tick}</text>`).join("");
    const xLabels = xTicks.map((point) => `
      <text class="axis-label" x="${x(new Date(`${point.date}T00:00:00Z`))}" y="${height - 10}" text-anchor="middle">${formatDay(point.date)}</text>`).join("");
    const freeLines = lineSegments(points, "free", x, y).map((segment) => `<polyline class="series-free" points="${segment.join(" ")}"></polyline>`).join("");
    const grossingLines = lineSegments(points, "grossing", x, y).map((segment) => `<polyline class="series-grossing" points="${segment.join(" ")}"></polyline>`).join("");
    const showPoints = points.length <= 35;
    const marks = showPoints ? points.map((point) => {
      const px = x(new Date(`${point.date}T00:00:00Z`));
      return `${typeof point.free === "number" ? `<circle class="point-free" cx="${px}" cy="${y(point.free)}" r="2.5"></circle>` : ""}${typeof point.grossing === "number" ? `<circle class="point-grossing" cx="${px}" cy="${y(point.grossing)}" r="2.5"></circle>` : ""}`;
    }).join("") : "";

    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(first.product)} ${escapeHtml(first.region)} 榜单趋势">
        <text class="axis-title" x="${margin.left}" y="10">RANK</text>
        ${grid}${bands}${freeLines}${grossingLines}${marks}${xLabels}
        <line id="trend-hover-line" class="hover-line" x1="0" x2="0" y1="${margin.top}" y2="${margin.top + plotHeight}" visibility="hidden"></line>
        <circle id="trend-hover-free" class="hover-dot-free" r="4" visibility="hidden"></circle>
        <circle id="trend-hover-grossing" class="hover-dot-grossing" r="4" visibility="hidden"></circle>
        <rect id="trend-hit" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" fill="transparent"></rect>
      </svg>`;

    const svg = container.querySelector("svg");
    const hit = container.querySelector("#trend-hit");
    const hoverLine = container.querySelector("#trend-hover-line");
    const hoverFree = container.querySelector("#trend-hover-free");
    const hoverGrossing = container.querySelector("#trend-hover-grossing");
    hit.addEventListener("pointermove", (event) => {
      const rect = svg.getBoundingClientRect();
      const cursor = (event.clientX - rect.left) / rect.width * width;
      const nearest = points.reduce((best, point) => {
        const distance = Math.abs(x(new Date(`${point.date}T00:00:00Z`)) - cursor);
        return !best || distance < best.distance ? { point, distance } : best;
      }, null).point;
      const px = x(new Date(`${nearest.date}T00:00:00Z`));
      hoverLine.setAttribute("x1", px); hoverLine.setAttribute("x2", px); hoverLine.setAttribute("visibility", "visible");
      for (const [element, field] of [[hoverFree, "free"], [hoverGrossing, "grossing"]]) {
        if (typeof nearest[field] === "number") {
          element.setAttribute("cx", px); element.setAttribute("cy", y(nearest[field])); element.setAttribute("visibility", "visible");
        } else {
          element.setAttribute("visibility", "hidden");
        }
      }
      elements.trendTooltip.innerHTML = `<strong>${escapeHtml(nearest.date)}</strong><span><b>${escapeHtml(secondaryLabel)}</b><em>${nearest.free ?? "未入榜"}</em></span><span><b>畅销榜</b><em>${nearest.grossing ?? "未入榜"}</em></span>`;
      elements.trendTooltip.hidden = false;
      const panelRect = container.closest(".trend-panel").getBoundingClientRect();
      const tooltipX = Math.min(event.clientX - panelRect.left + 12, panelRect.width - 200);
      const tooltipY = Math.max(92, event.clientY - panelRect.top - 30);
      elements.trendTooltip.style.left = `${Math.max(12, tooltipX)}px`;
      elements.trendTooltip.style.top = `${tooltipY}px`;
    });
    hit.addEventListener("pointerleave", () => {
      hoverLine.setAttribute("visibility", "hidden");
      hoverFree.setAttribute("visibility", "hidden");
      hoverGrossing.setAttribute("visibility", "hidden");
      elements.trendTooltip.hidden = true;
    });
  }

  function updateFilterSummary(events, versions) {
    const platform = state.platform === "all" ? "全部平台" : platformName(state.platform);
    const region = state.region === "all" ? "全部地区" : state.region;
    const product = state.product === "all" ? "全部产品" : (productByKey.get(state.product) || state.product);
    const ip = state.ip === "all" ? "全部IP" : state.ip;
    const period = `${state.startDate || minimumDate || "最早"} 至 ${state.endDate || maximumDate || "最新"}`;
    elements.summary.textContent = `${period} · ${platform} · ${region} · ${product} · ${ip} · ${events.length} 条平台×地区联动记录 · ${versions.length} 个平台×地区版本配置`;
  }

  function render() {
    syncFacetFilters();
    const events = filteredEvents();
    const versions = filteredVersions();
    const rankings = buildIpRankings(events);
    updateMetricLabels();
    renderKpis(events, versions, rankings);
    renderIpRankings(rankings);
    renderImpact(events);
    renderEvents(events);
    renderCoverage(versions);
    rebuildTrendSelectors();
    updateFilterSummary(events, versions);
  }

  function bindControls() {
    elements.platform.addEventListener("change", () => { state.platform = elements.platform.value; state.trendKey = ""; render(); });
    elements.region.addEventListener("change", () => { state.region = elements.region.value; state.trendKey = ""; render(); });
    elements.product.addEventListener("change", () => { state.product = elements.product.value; state.trendKey = ""; render(); });
    elements.ip.addEventListener("change", () => { state.ip = elements.ip.value; state.trendKey = ""; render(); });
    elements.startDate.addEventListener("change", () => {
      state.startDate = elements.startDate.value;
      if (state.endDate && state.startDate > state.endDate) {
        state.endDate = state.startDate;
        elements.endDate.value = state.endDate;
      }
      state.trendKey = "";
      syncRangeControls();
      render();
    });
    elements.endDate.addEventListener("change", () => {
      state.endDate = elements.endDate.value;
      if (state.startDate && state.endDate < state.startDate) {
        state.startDate = state.endDate;
        elements.startDate.value = state.startDate;
      }
      state.trendKey = "";
      syncRangeControls();
      render();
    });
    let rangeRenderTimer = 0;
    const handleRangeInput = (changed) => {
      let startValue = Number(elements.startRange.value);
      let endValue = Number(elements.endRange.value);
      if (startValue > endValue) {
        if (changed === "start") startValue = endValue;
        else endValue = startValue;
      }
      state.startDate = rangeValueToDate(startValue);
      state.endDate = rangeValueToDate(endValue);
      state.trendKey = "";
      syncRangeControls();
      window.clearTimeout(rangeRenderTimer);
      rangeRenderTimer = window.setTimeout(render, 90);
    };
    elements.startRange.addEventListener("input", () => handleRangeInput("start"));
    elements.endRange.addEventListener("input", () => handleRangeInput("end"));
    elements.startRange.addEventListener("change", render);
    elements.endRange.addEventListener("change", render);
    elements.search.addEventListener("input", () => { state.search = elements.search.value; render(); });
    elements.trendProductSelector.addEventListener("change", () => {
      const selectedProduct = elements.trendProductSelector.value;
      state.trendKey = trendGroups().find((group) => group.points[0].productKey === selectedProduct)?.key || "";
      rebuildTrendSelectors();
    });
    elements.trendPlatformSelector.addEventListener("change", () => {
      const selectedProduct = elements.trendProductSelector.value;
      const selectedPlatform = elements.trendPlatformSelector.value;
      state.trendKey = trendGroups().find((group) => {
        const first = group.points[0];
        return first.productKey === selectedProduct && first.platform === selectedPlatform;
      })?.key || "";
      rebuildTrendSelectors();
    });
    elements.trendRegionSelector.addEventListener("change", () => {
      const selectedProduct = elements.trendProductSelector.value;
      const selectedPlatform = elements.trendPlatformSelector.value;
      const selectedRegion = elements.trendRegionSelector.value;
      const group = trendGroups().find((candidate) => {
        const first = candidate.points[0];
        return first.productKey === selectedProduct && first.platform === selectedPlatform && first.region === selectedRegion;
      });
      state.trendKey = group?.key || "";
      renderTrend(group);
    });
    elements.reset.addEventListener("click", () => {
      Object.assign(state, { platform: "all", region: "all", product: "all", ip: "all", search: "", trendKey: "", startDate: defaultStartDate, endDate: defaultEndDate });
      elements.platform.value = "all";
      elements.region.value = "all";
      elements.product.value = "all";
      elements.ip.value = "all";
      elements.startDate.value = defaultStartDate;
      elements.endDate.value = defaultEndDate;
      elements.search.value = "";
      syncRangeControls();
      render();
    });
    let resizeTimer = 0;
    new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => renderTrend(trendGroups().find((group) => group.key === state.trendKey)), 80);
    }).observe(elements.trendChart);
  }

  $("#generated-at").textContent = formatTimestamp(data.meta.generatedAt);
  $("#latest-rank-date").textContent = data.meta.latestRankDate || "暂无";
  $("#definition-text").textContent = `${data.meta.definitions.delta}；${data.meta.definitions.missing}`;
  $("#history-coverage-text").textContent = `${data.meta.definitions.historyCoverage} ${data.meta.definitions.historyRankPolicy} ${data.meta.definitions.historyRankComparison || ""} ${data.meta.definitions.historyRankAttribution || ""}`;
  $("#minigame-coverage-text").textContent = data.meta.definitions.minigameCoverage || "小游戏渠道数据尚未接入。";
  populateFilters();
  bindControls();
  render();
})();
