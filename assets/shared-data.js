/* Read-only activity projection. Employee IDs, personnel records and source rows
 * never travel in a share response. The editable backup is a separate payload. */
'use strict';
(() => {
  const H = HP;
  const FORMAT = 'huangpu-activity-share-v1';
  const KEYS = ['house', 'owner', 'hmall', 'channel', 'entered', 'rate', 'view'];
  const localView = H.monthlyView;
  const localRanking = H.monthlyRanking;
  let shared = null;
  const text = (value, limit = 4096) => typeof value === 'string' ? value.slice(0, limit) : '';
  const list = (values, limit = 200) => Array.isArray(values) ? values.slice(0, limit).filter(v => typeof v === 'string').map(v => text(v)) : [];
  const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const month = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : '';
  const order = values => [...new Set([...(Array.isArray(values) ? values : []), ...KEYS])].filter(v => KEYS.includes(v));
  const cellStatus = value => ['ok', 'partial', 'missing', 'conflict', 'unconfirmed', 'assumed-zero', 'not-imported', 'zero-denominator'].includes(value) ? value : 'missing';
  const rankStatus = value => ['none', 'select-store', 'tied', 'small', 'overlap', 'separate'].includes(value) ? value : 'none';
  const values = source => Object.fromEntries(KEYS.map(key => [key, number(source?.[key])]));
  const safeNote = source => source?.status === 'conflict' ? '来源数值存在冲突，请维护人核对。' :
    source?.status === 'not-imported' ? '本月未导入此指标，0仅供显示，不参与排名。' :
    source?.status === 'unconfirmed' ? '来源统计范围待核对，按已提供记录展示。' :
    source?.status === 'zero-denominator' ? '新增与进入带看均为0，按约定显示0.0%。' :
    source?.assumedZero ? '未记录活动量，按已确认口径记0。' : '';
  const metadata = source => ({
    status: cellStatus(source?.status), note: safeNote(source), asterisk: source?.asterisk === true,
    observedThrough: date(source?.observedThrough), comparable: source?.comparable === true,
    sourceCovered: source?.sourceCovered === true, assumedZero: source?.assumedZero === true,
    sourcePeriods: list(source?.sourcePeriods, 60).filter(v => /^\d{4}-\d{2}-\d{2}至\d{4}-\d{2}-\d{2}$/.test(v))
  });
  const rankPerson = source => ({
    name: text(source?.name, 100), group: text(source?.group, 150),
    values: {view: number(source?.values?.view), channel: number(source?.values?.channel)},
    parts: Object.fromEntries(['view', 'channel'].map(key => [key, {
      percentile: number(source?.parts?.[key]?.percentile), rank: number(source?.parts?.[key]?.rank),
      tied: source?.parts?.[key]?.tied === true, median: number(source?.parts?.[key]?.median)
    }])),
    score: number(source?.score), rank: number(source?.rank), bottomRank: number(source?.bottomRank),
    ties: number(source?.ties), missing: list(source?.missing, 10)
  });
  const ranking = (source, store, selectedMonth) => ({
    store, month: selectedMonth, count: number(source?.count) || 0,
    eligible: number(source?.eligible) || 0, eligibleCount: number(source?.eligibleCount) || 0,
    status: rankStatus(source?.status), through: date(source?.through), tieNote: '第三位并列全部保留，人数可能超过3人',
    notJoined: list(source?.notJoined, 1000),
    ...Object.fromEntries(['all', 'top', 'bottom', 'missing'].map(key => [key,
      Array.isArray(source?.[key]) ? source[key].slice(0, 2000).map(rankPerson) : []]))
  });
  function project(view) {
    if (!view || !Array.isArray(view.months) || !view.months.length || view.months.length > 24 ||
        !view.months.every(month) || !Array.isArray(view.nodes) || view.nodes.length > 5000 ||
        !Array.isArray(view.stores) || view.stores.length > 100) throw new Error('共享看板内容不完整，请刷新重试');
    const months = [...new Set(view.months)], stores = list(view.stores, 100);
    const ids = new Map(view.nodes.map((node, index) => [node.id, 'n' + index]));
    if (ids.size !== view.nodes.length) throw new Error('共享看板存在重复对象，请重新同步');
    const nodes = view.nodes.map(node => {
      if (!['region', 'store', 'group', 'person'].includes(node.level)) throw new Error('共享看板对象类型不正确');
      return {
        id: ids.get(node.id), parent: ids.get(node.parent) || null, level: node.level,
        store: text(node.store, 150), group: text(node.group, 150), person: text(node.person, 100),
        label: text(node.label, 150), managerNames: list(node.managerNames, 10),
        months: Object.fromEntries(months.map(m => [m, values(node.months?.[m])])),
        cellMeta: Object.fromEntries(months.map(m => [m,
          Object.fromEntries(KEYS.map(key => [key, metadata(node.cellMeta?.[m]?.[key])]))]))
      };
    });
    const columnOrder = order(view.columnOrder);
    return {
      months, endMonth: months.at(-1), stores, nodes, columnOrder,
      columns: columnOrder.map(key => ({...H.monthlyColumns.find(column => column.key === key)})),
      rankings: Object.fromEntries(stores.map(store => [store, Object.fromEntries(months.map(m => [m, ranking(view.rankings?.[store]?.[m], store, m)]))])),
      displayCounts: Object.fromEntries(stores.map(store => [store, {
        personRows: number(view.displayCounts?.[store]?.personRows) || 0,
        uniqueConsultants: number(view.displayCounts?.[store]?.uniqueConsultants) || 0,
        groups: number(view.displayCounts?.[store]?.groups) || 0
      }])),
      organizationTotalsNote: '门店、店组保留当期历史合计；个人仅显示当前在职顾问。', notes: [],
      sourceCutoff: date(view.sourceCutoff), coverage: {sourceCutoff: date(view.sourceCutoff),
        weekMonth: view.coverage?.weekMonth === 'end' ? 'end' : 'start',
        organizationTotals: 'historical-source', people: 'current-consultants'}, selectedStore: ''
    };
  }
  H.buildSharedActivity = data => {
    const oldData = H.data, oldBoard = H.ui.monthlyBoard, hadBoard = Object.hasOwn(H.ui, 'monthlyBoard');
    try {
      H.data = data;
      // Publishing is independent of the owner's current store/month filters.
      H.ui.monthlyBoard = {};
      const view = project(localView({store: ''}));
      return {format: FORMAT, generatedAt: new Date().toISOString(), view};
    } finally {
      H.data = oldData;
      if (hadBoard) H.ui.monthlyBoard = oldBoard;
      else delete H.ui.monthlyBoard;
    }
  };
  H.useSharedActivity = payload => {
    if (payload?.format !== FORMAT) throw new Error('共享看板版本不匹配，请刷新页面');
    if (JSON.stringify(payload).length > 2 * 1024 * 1024) throw new Error('共享看板过大，请联系维护人重新同步');
    // Reconstruct from an explicit allowlist even when the backend is trusted.
    shared = project(payload.view);
    if (!H.data.monthlyBoard) H.data.monthlyBoard = {columnOrder: shared.columnOrder.slice()};
    H.ui.monthlyBoard = {...H.ui.monthlyBoard, endMonth: shared.endMonth};
    H.monthlyView = (options = {}) => {
      const selectedStore = options.store ?? H.ui.monthlyBoard?.store ?? '';
      const nodes = shared.nodes.filter(node => node.level === 'region' || !selectedStore || node.store === selectedStore);
      return {...shared, nodes, rows: nodes, selectedStore};
    };
    H.monthlyRanking = ({store = H.ui.monthlyBoard?.store || '', month: m} = {}) =>
      shared.rankings[store]?.[m || shared.endMonth] || null;
    return shared;
  };
  H.clearSharedActivity = () => { shared = null; H.monthlyView = localView; H.monthlyRanking = localRanking; };
})();
