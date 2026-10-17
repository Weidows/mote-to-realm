/* 和成天下 · 主题表
 * 一个页面两套皮：
 *   tianxia —— 「合成天下」，墨底金线、宋体，从微尘造到天下（默认）
 *   hecheng —— 「和成天下」，槟榔梗，朱红烫金、黑体，从青果嚼到龙腾盛世
 * 两套主题的造物半径完全一致，切换时不影响正在进行的这一局。
 */
window.SH = window.SH || {};

(function (SH) {
  'use strict';

  /* 槟榔主题的十一阶：青果 → 烟果 → 果片 → 点卤 → 各档价位的成袋装 →
   * 门店礼盒 → 1000 果 → 龙腾盛世限量版（和成天下真实产品价位的玩梗版） */
  const HECHENG_LEVELS = [
    { name: '青果',   glyph: '青', r: 13,  c: ['#dff29a', '#8ab63a', '#3f5f14'], glow: '#dcf7a6', fg: '#22330a' },
    { name: '烟果',   glyph: '烟', r: 18,  c: ['#cba77c', '#8a6237', '#43301b'], glow: '#e3c79c', fg: '#fdf3e3' },
    { name: '果片',   glyph: '片', r: 24,  c: ['#f2e2c0', '#c2a172', '#6d5233'], glow: '#f7e9cb', fg: '#42301a' },
    { name: '点卤',   glyph: '卤', r: 32,  c: ['#f4f1e6', '#c9c0a7', '#79705a'], glow: '#fdfaee', fg: '#3c3627' },
    { name: '三十元装', glyph: '三', r: 41,  c: ['#f77a63', '#bd3a2c', '#651512'], glow: '#ff9d86', fg: '#fff1ea' },
    { name: '五十元装', glyph: '五', r: 52,  c: ['#ff8f5e', '#cf4f22', '#6f1f08'], glow: '#ffae80', fg: '#fff3ea' },
    { name: '百元装',  glyph: '百', r: 64,  c: ['#f8cf7e', '#c78a2c', '#6b4407'], glow: '#ffe0a0', fg: '#41280a' },
    { name: '二百元装', glyph: '贰', r: 77,  c: ['#ffe89a', '#d9a733', '#7d5207'], glow: '#fff2b6', fg: '#4a3206' },
    { name: '门店礼盒', glyph: '礼', r: 91,  c: ['#e6cdf6', '#9a63c0', '#4a1f63'], glow: '#f0dcff', fg: '#fbf3ff' },
    { name: '1000果',  glyph: '千', r: 106, c: ['#cdf7d8', '#4aa86a', '#12472a'], glow: '#d7ffe4', fg: '#eafff1' },
    { name: '龙腾盛世', glyph: '龙', r: 122, c: ['#fff2c6', '#f0b93e', '#8c2a12'], glow: '#ffe9a8', fg: '#5a1e04' },
  ];

  const THEMES = [
    {
      id: 'tianxia',
      title: '合成天下',
      tag: '古韵',
      tagline: '微尘起于混沌 · 一念可造山河',
      seal: '造化<br>由心',
      glyphFont: '"Songti SC","STSong","SimSun","Noto Serif SC",serif',
      levels: SH.LEVELS,
      palette: {
        bg: ['#0b141b', '#0a1014', '#0c1013'],
        sky: '120,160,190',
        star: '#dce8f0',
        floor: '217,178,106',
        danger: '200,80,55',
      },
      copy: {
        startEyebrow: '混沌初开',
        startTitle: '合成天下',
        startDesc: '同物相触，化为更高之物。<br>从一粒微尘起，看看你能造到哪一步。',
        startBtn: '开始造物',
        overEyebrow: '造化止于此',
        overTitle: '乾坤已满',
        overDesc: '这一方天地，再也容不下一物。',
        overBtn: '再来一局',
        highestLabel: '最高造物',
        allPopup: '天下大同 +5000',
        allBanner: '天下大同 · 万象归一',
        maxBanner: '天下已成',
        newRealm: '新境 · ',
        hint: '移动瞄准 · 点击落下<br>← → 微调 · 空格落下',
      },
    },
    {
      id: 'hecheng',
      title: '和成天下',
      tag: '槟榔',
      tagline: '一粒青果 · 嚼出个天下',
      seal: '越嚼<br>越香',
      glyphFont: '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif',
      levels: HECHENG_LEVELS,
      palette: {
        bg: ['#150c07', '#110907', '#0e0705'],
        sky: '255,150,90',
        star: '#ffe2c2',
        floor: '224,164,90',
        danger: '224,72,50',
      },
      copy: {
        startEyebrow: '拆袋',
        startTitle: '和成天下',
        startDesc: '两枚同款，合成更高一档。<br>从一粒青果起，看看你能嚼到哪一层。',
        startBtn: '开嚼',
        overEyebrow: '袋子见底',
        overTitle: '嚼不动了',
        overDesc: '这一袋，再也塞不下一颗。',
        overBtn: '再开一袋',
        highestLabel: '最高一档',
        allPopup: '一嚼冲天 +5000',
        allBanner: '龙腾盛世 · 一嚼冲天',
        maxBanner: '龙腾盛世已成',
        newRealm: '新档 · ',
        hint: '移动瞄准 · 点击落下<br>← → 微调 · 空格落下<br>（玩梗主题 · 槟榔有害健康）',
      },
    },
  ];

  SH.THEMES = THEMES;
  SH.THEME_KEY = 'ht.theme';

  SH.findTheme = function (id) {
    for (let i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return THEMES[0];
  };
})(window.SH);
