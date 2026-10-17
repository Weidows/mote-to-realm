/* 合成天下 · 造物等级表
 * 从「微尘」到「天下」，共十一阶。
 * r 为画布逻辑半径（逻辑画布 460 × 640）。
 */
window.SH = window.SH || {};

(function (SH) {
  'use strict';

  const LEVELS = [
    { name: '微尘', glyph: '尘', r: 13,  c: ['#eef4f8', '#a9bcc9', '#5d6f7c'], glow: '#cfe3f2', fg: '#31414d' },
    { name: '石砾', glyph: '砂', r: 18,  c: ['#e2d8c7', '#a2947f', '#5b4f42'], glow: '#e8d8bd', fg: '#3b3128' },
    { name: '岩块', glyph: '岩', r: 24,  c: ['#c6a688', '#8d6f57', '#4b382a'], glow: '#e0b995', fg: '#fff6ec' },
    { name: '丘陵', glyph: '丘', r: 32,  c: ['#bcdd9a', '#7ba95c', '#3b5d2c'], glow: '#cdf0a3', fg: '#f6ffe9' },
    { name: '山岳', glyph: '山', r: 41,  c: ['#adcfe1', '#6b98b0', '#2f5165'], glow: '#bfe4f7', fg: '#f2fbff' },
    { name: '湖海', glyph: '海', r: 52,  c: ['#86d8f0', '#2f8cba', '#0d4666'], glow: '#95eaff', fg: '#effcff' },
    { name: '沃野', glyph: '野', r: 64,  c: ['#c8e87c', '#79a834', '#3a5d10'], glow: '#ddff94', fg: '#f8ffe9' },
    { name: '城邦', glyph: '城', r: 77,  c: ['#f6d494', '#c08e42', '#6b4417'], glow: '#ffe3a5', fg: '#4a2f0f' },
    { name: '王国', glyph: '国', r: 91,  c: ['#ffb56e', '#d0712f', '#76340c'], glow: '#ffc885', fg: '#fff4e6' },
    { name: '神州', glyph: '州', r: 106, c: ['#f79482', '#c4473f', '#681a1d'], glow: '#ffb2a0', fg: '#fff2ee' },
    { name: '天下', glyph: '天', r: 122, c: ['#fff6d2', '#e8bb52', '#946609'], glow: '#fff0b0', fg: '#5a3c05' },
  ];

  /* 出生权重：越靠后的等级越少见 */
  const SPAWN = [
    { level: 0, w: 30 },
    { level: 1, w: 26 },
    { level: 2, w: 20 },
    { level: 3, w: 15 },
    { level: 4, w: 9 },
  ];
  const SPAWN_TOTAL = SPAWN.reduce((s, o) => s + o.w, 0);

  SH.LEVELS = LEVELS;
  SH.MAX_LEVEL = LEVELS.length - 1;

  /** 合成两个 level 级造物所得的分数 */
  SH.mergePoints = function (level) {
    return 10 * (level + 1) * (level + 2) / 2;
  };

  /** 按权重抽一个出生等级 */
  SH.pickSpawn = function () {
    let r = Math.random() * SPAWN_TOTAL;
    for (let i = 0; i < SPAWN.length; i++) {
      r -= SPAWN[i].w;
      if (r <= 0) return SPAWN[i].level;
    }
    return 0;
  };
})(window.SH);
