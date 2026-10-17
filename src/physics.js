/* 合成天下 · 圆形刚体物理
 * 无依赖的二维圆形碰撞：重力、冲量求解、位置修正、摩擦、同级合成。
 * 固定步长 1/120s，带累加器，保证不同刷新率下手感一致。
 */
window.SH = window.SH || {};

(function (SH) {
  'use strict';

  const STEP = 1 / 120;      // 固定物理步长
  const MAX_STEPS = 8;       // 单帧最多推进的步数（防止卡顿雪崩）
  const RESTITUTION = 0.07;  // 球与球之间的回弹
  const FRICTION = 0.38;     // 切向摩擦
  const SLOP = 0.25;         // 允许的穿透余量
  const CORRECTION = 0.72;   // 位置修正比例
  const ITERATIONS = 2;      // 每步碰撞迭代次数
  const MAX_SPEED = 3200;

  class Ball {
    constructor(x, y, level, r) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.level = level;
      this.r = r;
      this.m = r * r;          // 质量按面积
      this.invM = 1 / this.m;
      this.age = 0;
      this.dead = false;
      this.dangerTime = 0;
    }
  }

  class World {
    constructor(opts) {
      this.W = opts.W;
      this.H = opts.H;
      this.floorY = opts.floorY || opts.H;   // 落球地面（可略高于画布底边）
      this.gravity = opts.gravity ?? 2500;
      this.levels = opts.levels;
      this.onMerge = opts.onMerge || function () {};
      this.balls = [];
      this._acc = 0;
    }

    clear() {
      this.balls.length = 0;
      this._acc = 0;
    }

    add(x, y, level, opts) {
      opts = opts || {};
      const def = this.levels[level];
      const b = new Ball(x, y, level, def.r);
      b.vx = opts.vx || 0;
      b.vy = opts.vy || 0;
      b.angle = 0;
      b.spin = (Math.random() - 0.5) * 0.4;
      this.balls.push(b);
      return b;
    }

    /** 推进真实时间，内部固定步长积分 */
    advance(dt) {
      this._acc += Math.min(dt, 0.2);
      let n = 0;
      while (this._acc >= STEP && n < MAX_STEPS) {
        this._step(STEP);
        this._acc -= STEP;
        n++;
      }
      if (n >= MAX_STEPS) this._acc = 0;
    }

    _step(dt) {
      const balls = this.balls;

      // 1. 积分
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (b.dead) continue;
        b.vy += this.gravity * dt;
        b.vx *= 0.9995;
        b.vy *= 0.9995;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.age += dt;

        const sp2 = b.vx * b.vx + b.vy * b.vy;
        if (sp2 > MAX_SPEED * MAX_SPEED) {
          const s = MAX_SPEED / Math.sqrt(sp2);
          b.vx *= s;
          b.vy *= s;
        }
      }

      // 2. 碰撞迭代（松弛）
      for (let it = 0; it < ITERATIONS; it++) {
        for (let i = 0; i < balls.length; i++) {
          const a = balls[i];
          if (a.dead) continue;
          for (let j = i + 1; j < balls.length; j++) {
            const b = balls[j];
            if (b.dead) continue;
            this._collide(a, b);
          }
        }
        for (let i = 0; i < balls.length; i++) {
          if (!balls[i].dead) this._walls(balls[i]);
        }
      }

      // 3. 同级合成
      this._merge();
    }

    _walls(b) {
      const W = this.W;
      const H = this.floorY;

      if (b.x - b.r < 0) {
        b.x = b.r;
        if (b.vx < 0) b.vx = -b.vx * 0.32;
      } else if (b.x + b.r > W) {
        b.x = W - b.r;
        if (b.vx > 0) b.vx = -b.vx * 0.32;
      }

      if (b.y + b.r > H) {
        b.y = H - b.r;
        if (b.vy > 0) {
          b.vy = -b.vy * 0.16;
          if (Math.abs(b.vy) < 42) b.vy = 0;
        }
        b.vx *= 0.9;
      }
    }

    _collide(a, b) {
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const rr = a.r + b.r;
      let d2 = dx * dx + dy * dy;

      if (d2 >= rr * rr) return;
      if (d2 < 1e-6) {
        // 完全重合，给一点随机方向脱离
        dx = (Math.random() - 0.5) * 0.01;
        dy = -0.01;
        d2 = dx * dx + dy * dy;
      }

      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const overlap = rr - d;

      // 位置修正
      const invSum = a.invM + b.invM;
      const corr = Math.max(0, overlap - SLOP) * CORRECTION / invSum;
      a.x -= nx * corr * a.invM;
      a.y -= ny * corr * a.invM;
      b.x += nx * corr * b.invM;
      b.y += ny * corr * b.invM;

      // 法向冲量
      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const vn = rvx * nx + rvy * ny;
      if (vn > 0) return;

      const j = -(1 + RESTITUTION) * vn / invSum;
      a.vx -= nx * j * a.invM;
      a.vy -= ny * j * a.invM;
      b.vx += nx * j * b.invM;
      b.vy += ny * j * b.invM;

      // 切向摩擦
      const tx = -ny;
      const ty = nx;
      const vt = rvx * tx + rvy * ty;
      let jt = -vt / invSum;
      const maxF = j * FRICTION;
      jt = Math.max(-maxF, Math.min(maxF, jt));
      a.vx -= tx * jt * a.invM;
      a.vy -= ty * jt * a.invM;
      b.vx += tx * jt * b.invM;
      b.vy += ty * jt * b.invM;
    }

    _merge() {
      const list = this.balls.slice();
      const consumed = new Set();
      const born = [];

      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (a.dead || consumed.has(a)) continue;

        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          if (b.dead || consumed.has(b) || b.level !== a.level) continue;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const rr = a.r + b.r;
          if (dx * dx + dy * dy > rr * rr) continue;

          consumed.add(a);
          consumed.add(b);
          a.dead = true;
          b.dead = true;

          const cx = (a.x + b.x) / 2;
          const cy = (a.y + b.y) / 2;
          const next = a.level + 1;

          if (next > this.levels.length - 1) {
            // 已是最高阶：双双化作满天星火
            this.onMerge({ x: cx, y: cy, level: a.level, result: null, ball: null });
          } else {
            const nb = this.add(cx, cy, next, {
              vx: (a.vx + b.vx) * 0.3,
              vy: (a.vy + b.vy) * 0.3 - 60,
            });
            born.push(nb);
            this.onMerge({ x: cx, y: cy, level: a.level, result: next, ball: nb });
          }
          break;
        }
      }

      if (consumed.size) {
        this.balls = this.balls.filter((b) => !b.dead);
      }
      return born;
    }
  }

  SH.Ball = Ball;
  SH.World = World;
})(window.SH);
