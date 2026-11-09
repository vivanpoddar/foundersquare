// Every outside link in one place. Leave a value empty and the matching
// buttons stay hidden (the email fallbacks show instead).
const LINKS = {
  luma: 'https://luma.com/x63yuq1r',   // Agents After Dark Build Night, Mon Nov 16 2026
  partiful: '',       // the Partiful event page
  lumaCalendar: '',   // the Founder Square calendar on Luma
  instagram: '',
  x: '',
  linkedin: '',
};

(() => {
  'use strict';
  document.querySelectorAll('.section h2,.section p,.event-row,.event-row h3,.event-date,.event-info p,.event-aside,.band-inner h2,.band-inner p,.footer-top,.page-head h1,.page-head p,.sponsorship article,.sponsorship h2,.sponsorship h3,.sponsorship p,.contact-grid h2,.contact-grid>div p,.contact-grid label,.schedule li,.questions details').forEach(el => el.classList.add('reveal'));

})();
document.querySelectorAll('[data-copy]').forEach(button => {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('team@foundersquare.org');
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = 'Copy address'; }, 1600);
    } catch {
      button.textContent = 'team@foundersquare.org';
    }
  });
});

// Fill in the LINKS above; anything without a URL stays hidden.
(() => {
  'use strict';
  let anySocial = false, anyEvent = false;
  document.querySelectorAll('[data-link]').forEach(a => {
    const url = LINKS[a.dataset.link];
    if (url) {
      a.hidden = false;
      if (a.tagName === 'A') { a.href = url; a.target = '_blank'; a.rel = 'noopener'; }
      else { a.setAttribute('role', 'link'); a.tabIndex = 0; const go = e => { e.preventDefault(); e.stopPropagation(); window.open(url, '_blank', 'noopener'); }; a.addEventListener('click', go); a.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') go(e); }); }
    }
    else (a.closest('li') || a).remove();
    if (url && ['instagram', 'x', 'linkedin', 'lumaCalendar'].includes(a.dataset.link)) anySocial = true;
    if (url && ['luma', 'partiful'].includes(a.dataset.link)) anyEvent = true;
  });
  document.querySelectorAll('[data-socials-fallback]').forEach(p => { if (anySocial) p.remove(); });
  document.querySelectorAll('[data-when-links]').forEach(p => { if (!anyEvent) p.remove(); });
  document.querySelectorAll('[data-when-no-links]').forEach(p => { if (anyEvent) p.remove(); });
  // with a platform link in place the email button becomes the quiet alternative
  if (anyEvent) document.querySelectorAll('[data-link-fallback]').forEach(a => { if (a.dataset.linkFallback === 'hide') a.remove(); else a.className = 'text-link'; });
})();

// The sponsor contact form posts to /api/contact; if that fails, it falls back to email.
(() => {
  'use strict';
  const form = document.getElementById('contactForm');
  if (!form) return;
  const status = document.getElementById('form-status');
  const button = form.querySelector('button[type=submit]');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    data.interests = fd.getAll('interests');
    if (!data.name.trim() || !(data.company || '').trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      status.className = 'form-status err'; status.textContent = 'Please add your name, your company and a working email.'; return;
    }
    button.disabled = true; status.className = 'form-status'; status.textContent = 'Sending…';
    try {
      const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const out = await r.json().catch(() => ({}));
      if (r.ok && out.ok) {
        form.reset(); status.className = 'form-status ok';
        status.textContent = 'Got it. The whole team has your request and will reply from team@foundersquare.org within a few days.';
      } else throw new Error(out.error || 'Could not send');
    } catch (err) {
      const body = encodeURIComponent(`Name: ${data.name}${data.role ? ', ' + data.role : ''}\nCompany: ${data.company}\nWebsite: ${data.url || ''}\nEmail: ${data.email}\nEvent: ${data.event || ''}\nCould bring: ${data.interests.join(', ')}\nBudget: ${data.budget || ''}\n\n${data.message}`);
      status.className = 'form-status err';
      status.innerHTML = `${err.message.replace(/</g, '&lt;')} <a class="inline-link" href="mailto:team@foundersquare.org?subject=Founder%20Square%20sponsorship&body=${body}">Send it by email instead ↗</a>`;
    } finally { button.disabled = false; }
  });
})();

// The Square: scroll progress through the pinned stage drives the zoom.
(() => {
  'use strict';
  const stage = document.querySelector('.sq-stage'), pin = document.querySelector('.sq-pin'), sq = document.querySelector('.sq');
  if (!stage || !pin || !sq) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const KEY = 'fs-entered';
  let entered = false;
  try { entered = localStorage.getItem(KEY) === '1'; } catch (e) {}
  if (entered) stage.classList.add('entered'); else { pin.classList.add('intro'); setTimeout(() => pin.classList.remove('intro'), 2400); }
  const replay = document.querySelector('[data-replay]');
  if (replay) { replay.hidden = !entered; replay.addEventListener('click', () => { try { localStorage.removeItem(KEY); } catch (e) {} scrollTo(0, 0); location.reload(); }); }
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let ticking = false;
  function update() {
    ticking = false;
    const rect = stage.getBoundingClientRect();
    const total = stage.offsetHeight - innerHeight;
    const p = total > 10 ? clamp(-rect.top / total, 0, 1) : 1;
    if (p > 0.78 && !entered) { entered = true; try { localStorage.setItem(KEY, '1'); } catch (e) {} if (replay) replay.hidden = false; }
    const side = sq.offsetWidth || 1;
    const cover = Math.hypot(innerWidth, innerHeight) / side * 1.04;   // enough to hide every corner
    const zoom = ease(clamp(p / 0.72, 0, 1));
    const scale = 1 + (cover - 1) * zoom;
    const front = 1 - clamp(p / 0.3, 0, 1);
    const inside = clamp((p - 0.5) / 0.3, 0, 1);
    pin.style.setProperty('--p', p.toFixed(4));
    pin.style.setProperty('--sq-scale', scale.toFixed(3));
    pin.style.setProperty('--front', front.toFixed(3));
    pin.style.setProperty('--inside', inside.toFixed(3));
    pin.style.setProperty('--inside-events', inside > 0.6 ? 'auto' : 'none');
    document.body.classList.toggle('in-space', inside > 0.5);
    // the space layer is clipped to the square's current footprint, so it stays crisp while the square grows
    const vis = (sq.offsetWidth - 10) * scale;
    pin.style.setProperty('--cx', Math.max(0, (pin.clientWidth - vis) / 2).toFixed(1) + 'px');
    pin.style.setProperty('--cy', Math.max(0, (pin.clientHeight - vis) / 2).toFixed(1) + 'px');
  }
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  update();
})();

// Space: a starfield behind the events, gentle flight, and a warp when an event is clicked.
(() => {
  'use strict';
  const space = document.querySelector('.space'), canvas = document.querySelector('.space-canvas'), pin = document.querySelector('.sq-pin');
  if (!space || !canvas || !pin) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, stars = [], fixed = [], speed = 0.0035, target = 0.0035, running = false, raf = 0;
  function size() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(520, (W * H) / 2600));
    stars = Array.from({ length: n }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random(), pz: 0 }));
    // a fixed, twinkling layer so the small window already reads as a night sky
    fixed = Array.from({ length: Math.round(n * 0.6) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 0.4 + Math.random() * 1.3, a: Math.random() * 6.28, s: 0.6 + Math.random() * 1.4 }));
  }
  function frame() {
    speed += (target - speed) * 0.08;
    ctx.fillStyle = speed > 0.02 ? 'rgba(7,3,4,0.35)' : 'rgba(7,3,4,0.9)';
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, f = Math.min(W, H) * 0.9, t = performance.now() / 1000;
    for (const k of fixed) {
      const tw = 0.55 + 0.45 * Math.sin(t * k.s + k.a);
      ctx.fillStyle = `rgba(255,240,236,${(tw * 0.9).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(k.x, k.y, k.r, 0, 6.283); ctx.fill();
    }
    for (const s of stars) {
      s.pz = s.z; s.z -= speed;
      if (s.z <= 0.02) { s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; s.z = 1; s.pz = 1; }
      const sx = cx + (s.x / s.z) * f, sy = cy + (s.y / s.z) * f;
      const px = cx + (s.x / s.pz) * f, py = cy + (s.y / s.pz) * f;
      const b = Math.min(1, (1 - s.z) * 1.4);
      ctx.strokeStyle = `rgba(255,236,232,${(0.25 + b * 0.75).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.6, (1 - s.z) * 2.2);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke();
    }
    raf = requestAnimationFrame(frame);
  }
  function setRunning(on) {
    if (on && !running) { running = true; raf = requestAnimationFrame(frame); }
    if (!on && running) { running = false; cancelAnimationFrame(raf); }
  }
  size(); addEventListener('resize', size);
  if (!reduced) {
    const visible = () => { const r = pin.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };
    const tick = () => setRunning(!document.hidden && visible());
    addEventListener('scroll', tick, { passive: true }); document.addEventListener('visibilitychange', tick); tick();
    // slight parallax from the pointer
    pin.addEventListener('pointermove', e => {
      const r = pin.getBoundingClientRect(), mx = (e.clientX - r.left) / r.width - 0.5, my = (e.clientY - r.top) / r.height - 0.5;
      document.querySelectorAll('.planet').forEach(p => { const d = parseFloat(p.dataset.depth || '1'); p.style.setProperty('--px', (-mx * 18 * d).toFixed(1) + 'px'); p.style.setProperty('--py', (-my * 14 * d).toFixed(1) + 'px'); });
    });
  }
  // warp: stars stretch, the chosen planet comes at you, white flash, then the event page
  document.querySelectorAll('.planet[data-warp]').forEach(p => {
    p.addEventListener('click', e => {
      if (e.target.closest('[data-stop]')) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      const href = p.getAttribute('href');
      if (reduced) { location.href = href; return; }
      space.classList.add('warping'); p.classList.add('target');
      target = 0.09; setRunning(true);
      setTimeout(() => { location.href = href; }, 950);
    });
  });
  addEventListener('pageshow', () => { space.classList.remove('warping'); document.querySelectorAll('.planet.target').forEach(p => p.classList.remove('target')); target = 0.0035; });
})();
