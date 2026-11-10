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
  const MAGNET_RANGE = 3.0;    // 磁吸范围：中心距 ≤ 半径和 × 3.0 时开始吸（约两倍球径的空隙）
  const MAGNET_SPEED = 0.7;    // 磁吸靠近速度上限（球半径/秒）：克制，看得出被"拽"，不瞬移

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
      this.magnet = opts.magnet !== false;   // 同级磁吸，默认开
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

      // 3. 同级磁吸：位置修正之后把同级球拉近，再走一遍碰撞，保证被拉进别的球里时会被挡开
      if (this.magnet) {
        for (let i = 0; i < balls.length; i++) {
          if (!balls[i].dead) this._pull(balls[i], balls, dt);
        }
        for (let i = 0; i < balls.length; i++) {
          const a = balls[i];
          if (a.dead) continue;
          for (let j = i + 1; j < balls.length; j++) {
            if (!balls[j].dead) this._collide(a, balls[j]);
          }
        }
        for (let i = 0; i < balls.length; i++) {
          if (!balls[i].dead) this._walls(balls[i]);
        }
      }

      // 4. 同级合成
      this._merge();
    }

    /** 同级磁吸：范围内同类越近吸力越强，近到相切时正好收手，交给碰撞与合成 */
    _pull(b, balls, dt) {
      for (let k = 0; k < balls.length; k++) {
        const o = balls[k];
        if (o === b || o.dead || o.level !== b.level) continue;
        const dx = o.x - b.x;
        const dy = o.y - b.y;
        const reach = (b.r + o.r) * MAGNET_RANGE;
        const d2 = dx * dx + dy * dy;
        if (d2 >= reach * reach) continue;
        const d = Math.sqrt(d2);
        const gap = d - (b.r + o.r);          // 间隙：负值即已接触
        if (gap <= 0.5) continue;
        const nx = dx / d;
        const ny = dy / d;
        const t = 1 - gap / (reach - (b.r + o.r));   // 0→1，越靠越强

        // 沿连线的靠近速度接近上限时收手，免得两球在磁力与碰撞间来回弹
        const closing = (o.vx - b.vx) * nx + (o.vy - b.vy) * ny;
        if (closing > MAGNET_SPEED * Math.min(b.r, o.r)) continue;

        // 借速度：沿连线给两者往彼此靠的速度。原地停住的球有静摩擦，等它自己滑过去是耗很久的
        const speed = Math.min(gap / (2 * dt), MAGNET_SPEED * Math.min(b.r, o.r) * (0.35 + t * 0.65));
        const gain = speed / (b.invM + o.invM);
        b.vx += nx * gain * b.invM;
        b.vy += ny * gain * b.invM;
        o.vx -= nx * gain * o.invM;
        o.vy -= ny * gain * o.invM;
      }
    }

    /** 正在互相吸引的同级球对（中点 + 强度），供渲染层在两者之间画一缕微光 */
    magnetLinks() {
      const out = [];
      const balls = this.balls;
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        for (let j = i + 1; j < balls.length; j++) {
          const o = balls[j];
          if (o.level !== a.level) continue;
          const dx = o.x - a.x;
          const dy = o.y - a.y;
          const reach = (a.r + o.r) * MAGNET_RANGE;
          const d2 = dx * dx + dy * dy;
          if (d2 >= reach * reach) continue;
          const d = Math.sqrt(d2);
          if (d - (a.r + o.r) <= 0.5) continue;
          out.push({ x: (a.x + o.x) / 2, y: (a.y + o.y) / 2, t: 1 - (d - (a.r + o.r)) / (reach - (a.r + o.r)) });
        }
      }
      return out;
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
        // 回弹后速度极小（< 8）才归零，算"贴地"；门限再高的话磁吸也拽不动埋在地里的球
        if (b.vy > 0) {
          b.vy = -b.vy * 0.16;
          if (b.vy < 8) b.vy = 0;
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
