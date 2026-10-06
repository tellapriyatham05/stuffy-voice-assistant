// Stuffy's little life: where it stands, which animation plays, and its idle routine.
// Usage: const stuffy = new Stuffy(svgElement); stuffy.show('listen'); stuffy.show('work', 'search');
(function () {
  const SPOT = {
    door: { x: 47, y: 52, s: 1 },
    centre: { x: 150, y: 52, s: 1 },
    seed: { x: 184, y: 52, s: 1 },
    wheel: { x: 254, y: 54, s: 0.8 }, // a bit smaller so it fits inside the wheel
  };
  const WALK_SPEED = 110; // px per second
  const MODES = ['home', 'paused', 'idle', 'listen', 'hearing', 'think', 'work', 'confirm', 'happy', 'jump',
    'confused', 'dictate', 'nibble', 'groom', 'walking'];
  const ACTS = ['act-search', 'act-box', 'act-type', 'act-music', 'act-antenna', 'act-bell', 'act-wheel'];

  class Stuffy {
    constructor(svg) {
      this.svg = svg;
      this.pos = svg.querySelector('#stuffy-pos');
      this.x = SPOT.centre.x;
      this.y = SPOT.centre.y;
      this.s = 1;
      this.atHome = true;
      this.gen = 0;          // bumps whenever a new mode is requested; older walks stop early
      this.mode = 'home';
      this.idleTimer = null;
      this.homeTimer = null;
      this.setClasses(['home']);
      this.scheduleIdleLife();
    }

    setClasses(list) {
      for (const c of [...MODES, ...ACTS]) this.svg.classList.remove(c);
      for (const c of list) if (c) this.svg.classList.add(c);
    }

    place(x, y, s = 1) {
      this.x = x;
      this.y = y;
      this.s = s;
      this.pos.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(3)})`);
    }

    // Walks to a spot. Resolves false if a newer request took over on the way.
    walkTo(spot, gen) {
      const from = { x: this.x, y: this.y, s: this.s };
      const dist = Math.hypot(spot.x - from.x, spot.y - from.y);
      if (dist < 1) return Promise.resolve(true);
      const ms = (dist / WALK_SPEED) * 1000;
      this.svg.classList.add('walking');
      return new Promise((resolve) => {
        const start = performance.now();
        const step = (now) => {
          if (gen !== this.gen) { this.svg.classList.remove('walking'); return resolve(false); }
          const t = Math.min(1, (now - start) / ms);
          const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          this.place(from.x + (spot.x - from.x) * e, from.y + (spot.y - from.y) * e, from.s + ((spot.s || 1) - from.s) * e);
          if (t < 1) requestAnimationFrame(step);
          else { this.svg.classList.remove('walking'); resolve(true); }
        };
        requestAnimationFrame(step);
      });
    }

    async comeOut(gen) {
      if (!this.atHome) return true;
      this.atHome = false;
      this.place(SPOT.door.x, SPOT.door.y, 1);
      this.setClasses(['idle']);
      return true;
    }

    async goHome() {
      const gen = ++this.gen;
      clearTimeout(this.homeTimer);
      if (this.atHome) { this.setClasses(['home']); this.mode = 'home'; return; }
      this.setClasses(['idle']);
      if (!(await this.walkTo(SPOT.door, gen))) return;
      this.atHome = true;
      this.mode = 'home';
      this.setClasses(['home']);
      this.scheduleIdleLife();
    }

    // The main entry point. mode: home | paused | listen | hearing | think | work | confirm | happy | confused | dictate | idle
    async show(mode, activity) {
      clearTimeout(this.homeTimer);
      clearTimeout(this.idleTimer);
      if (mode === 'home') return this.goHome();
      const gen = ++this.gen;
      this.mode = mode;
      if (mode === 'paused') {
        this.atHome = true;
        this.setClasses(['paused']);
        return;
      }
      await this.comeOut(gen);
      const target = mode === 'work' && activity === 'wheel' ? SPOT.wheel : SPOT.centre;
      if (Math.abs(this.x - target.x) > 1 || Math.abs(this.y - target.y) > 1) {
        this.setClasses([]);
        if (!(await this.walkTo(target, gen))) return;
      }
      if (gen !== this.gen) return;
      const classes = [];
      if (mode === 'hearing') classes.push('listen', 'hearing');
      else if (mode === 'work') classes.push('work', `act-${activity || 'wheel'}`);
      else if (mode === 'happy') classes.push('happy', 'jump');
      else classes.push(mode);
      this.setClasses(classes);
      if (mode === 'happy') setTimeout(() => { if (gen === this.gen) this.svg.classList.remove('jump'); }, 1200);
    }

    // After a result has been shown for a while: sit calmly, then wander back home.
    settle(afterMs = 9000) {
      const gen = this.gen;
      clearTimeout(this.homeTimer);
      this.homeTimer = setTimeout(async () => {
        if (gen !== this.gen) return;
        this.mode = 'idle';
        if (!this.atHome) {
          this.setClasses(['idle']);
          if (Math.abs(this.x - SPOT.centre.x) > 1) await this.walkTo(SPOT.centre, gen);
        }
        this.homeTimer = setTimeout(() => { if (gen === this.gen) this.goHome(); }, afterMs);
      }, 600);
    }

    setTalking(on) {
      this.svg.classList.toggle('talk', !!on);
    }

    // Every few minutes of quiet, Stuffy pops out for a snack or a quick groom.
    scheduleIdleLife() {
      clearTimeout(this.idleTimer);
      const wait = (3 + Math.random() * 4) * 60 * 1000;
      this.idleTimer = setTimeout(() => this.idleLife(), wait);
    }

    async idleLife() {
      if (this.mode !== 'home' || !this.atHome) return this.scheduleIdleLife();
      const gen = ++this.gen;
      this.mode = 'wander';
      await this.comeOut(gen);
      const snack = Math.random() < 0.6;
      if (!(await this.walkTo(snack ? SPOT.seed : SPOT.centre, gen))) return;
      this.setClasses([snack ? 'nibble' : 'groom']);
      await new Promise((r) => setTimeout(r, snack ? 4500 : 3500));
      if (gen !== this.gen) return;
      this.goHome();
    }
  }

  window.Stuffy = Stuffy;
})();
