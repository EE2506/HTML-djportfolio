(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  const header = document.querySelector('[data-header]');
  const themeToggle = document.querySelector('[data-theme-toggle]');
  const themeLabel = document.querySelector('[data-theme-label]');
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

  function currentTheme() { return root.dataset.theme || (systemTheme.matches ? 'dark' : 'light'); }
  function updateThemeButton() {
    if (!themeToggle) return;
    const isDark = currentTheme() === 'dark';
    const current = isDark ? 'Dark' : 'Light';
    const next = isDark ? 'light' : 'dark';
    themeToggle.setAttribute('aria-label', `${current} mode active. Switch to ${next} mode`);
    themeToggle.title = `Switch to ${next} mode`;
    if (themeLabel) themeLabel.textContent = `${current} mode`;
    const icon = themeToggle.querySelector('svg');
    if (icon) icon.innerHTML = isDark
      ? '<path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z"/>'
      : '<path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.36 5.64l-1.56 1.56M7.2 16.8l-1.56 1.56M18.36 18.36 16.8 16.8M7.2 7.2 5.64 5.64M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"/>';
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = isDark ? '#0d1428' : '#f6f6f2';
  }
  updateThemeButton();
  themeToggle?.addEventListener('click', () => { const next = currentTheme() === 'dark' ? 'light' : 'dark'; root.dataset.theme = next; try { localStorage.setItem('dj-theme', next); } catch (_) {} updateThemeButton(); });
  systemTheme.addEventListener?.('change', () => { if (!root.dataset.theme) updateThemeButton(); });

  const menuToggle = document.querySelector('[data-menu-toggle]');
  const mobileMenu = document.querySelector('[data-mobile-menu]');
  function closeMenu() { if (!mobileMenu || !menuToggle) return; mobileMenu.hidden = true; menuToggle.setAttribute('aria-expanded', 'false'); document.body.classList.remove('menu-open'); }
  menuToggle?.addEventListener('click', () => { const isOpen = menuToggle.getAttribute('aria-expanded') === 'true'; mobileMenu.hidden = isOpen; menuToggle.setAttribute('aria-expanded', String(!isOpen)); document.body.classList.toggle('menu-open', !isOpen); });
  mobileMenu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));

  const carouselTrack = document.querySelector('[data-carousel-track]');
  const carouselControls = document.querySelector('[data-carousel-controls]');
  const previousSlide = document.querySelector('[data-carousel-previous]');
  const nextSlide = document.querySelector('[data-carousel-next]');
  const playSlide = document.querySelector('[data-carousel-play]');
  const carouselPosition = document.querySelector('[data-carousel-position]');
  if (carouselTrack && carouselControls && previousSlide && nextSlide && playSlide && carouselPosition) {
    const projects = Array.isArray(window.PORTFOLIO_PROJECTS) ? window.PORTFOLIO_PROJECTS : [];
    const skillCount = carouselTrack.children.length;
    projects.forEach((project, index) => {
      const slide = document.createElement('li');
      slide.className = 'carousel-slide';
      const link = document.createElement('a');
      link.href = project.sample ? '#work' : project.url;
      const kind = document.createElement('span');
      kind.className = 'slide-kind';
      kind.textContent = `${project.sample ? 'Sample concept' : project.label} / ${String(skillCount + index + 1).padStart(2, '0')}`;
      const title = document.createElement('strong');
      title.textContent = project.title;
      const detail = document.createElement('span');
      detail.className = 'slide-detail';
      detail.textContent = project.carouselSummary || project.summary;
      const arrow = document.createElement('span');
      arrow.className = 'slide-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '↗';
      link.append(kind, title, detail, arrow);
      slide.append(link);
      carouselTrack.append(slide);
    });
    const slides = [...carouselTrack.children];
    const carouselRegion = carouselTrack.closest('.showcase-carousel');
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const hoverPreference = window.matchMedia('(hover: hover)');
    let autoFrame;
    let previousFrame = 0;
    let carouselVisible = !('IntersectionObserver' in window);
    let settleTimer;
    let movementTimer;
    let resumeTimer;
    let manualPaused = false;
    let step = 0;
    let cycleWidth = 0;
    let autoPosition = 0;
    const scrollSpeed = 38; // Pixels per second.
    function cloneSlide(slide) {
      const clone = slide.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.querySelectorAll('a').forEach((link) => { link.tabIndex = -1; });
      return clone;
    }
    carouselTrack.prepend(...slides.map(cloneSlide));
    carouselTrack.append(...slides.map(cloneSlide));
    carouselControls.hidden = false;
    function currentIndex() {
      if (!step) return 0;
      const index = Math.round((carouselTrack.scrollLeft - cycleWidth) / step);
      return ((index % slides.length) + slides.length) % slides.length;
    }
    function updateCarousel() {
      const positionText = `${String(currentIndex() + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
      if (carouselPosition.textContent !== positionText) carouselPosition.textContent = positionText;
    }
    function measureCarousel() {
      const progress = step ? (carouselTrack.scrollLeft - cycleWidth) / step : 0;
      const slideWidth = slides[0]?.getBoundingClientRect().width || carouselTrack.clientWidth;
      const gap = parseFloat(getComputedStyle(carouselTrack).columnGap) || 0;
      step = slideWidth + gap;
      cycleWidth = step * slides.length;
      carouselTrack.scrollLeft = cycleWidth + progress * step;
      autoPosition = carouselTrack.scrollLeft;
      updateCarousel();
    }
    function normalizeCarousel() {
      if (!cycleWidth) return;
      let target = carouselTrack.scrollLeft;
      while (target < cycleWidth - 1) target += cycleWidth;
      while (target >= 2 * cycleWidth - 1) target -= cycleWidth;
      if (Math.abs(target - carouselTrack.scrollLeft) < 1) { updateCarousel(); return; }
      carouselTrack.scrollLeft = target;
      if (autoFrame) autoPosition = target;
      updateCarousel();
    }
    function moveCarousel(direction) {
      pauseAutoAdvance();
      const roundedPosition = Math.round((carouselTrack.scrollLeft - cycleWidth) / step);
      const nextIndex = (currentIndex() + direction + slides.length) % slides.length;
      carouselPosition.textContent = `${String(nextIndex + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
      carouselTrack.scrollTo({ left: cycleWidth + (roundedPosition + direction) * step, behavior: motionPreference.matches ? 'auto' : 'smooth' });
      window.clearTimeout(movementTimer);
      movementTimer = window.setTimeout(normalizeCarousel, motionPreference.matches ? 0 : 800);
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => startAutoAdvance(), 1000);
    }
    function pauseAutoAdvance() {
      if (autoFrame) cancelAnimationFrame(autoFrame);
      autoFrame = undefined;
      previousFrame = 0;
      window.clearTimeout(resumeTimer);
    }
    function advanceFrame(now) {
      if (previousFrame) {
        const elapsed = Math.min(now - previousFrame, 64);
        autoPosition += elapsed * scrollSpeed / 1000;
        while (autoPosition >= 2 * cycleWidth) autoPosition -= cycleWidth;
        while (autoPosition < cycleWidth) autoPosition += cycleWidth;
        carouselTrack.scrollLeft = autoPosition;
        updateCarousel();
      }
      previousFrame = now;
      autoFrame = requestAnimationFrame(advanceFrame);
    }
    function startAutoAdvance(force = false) {
      pauseAutoAdvance();
      if (manualPaused || motionPreference.matches || document.hidden || !carouselVisible || !carouselRegion) return;
      if (!force && ((hoverPreference.matches && carouselRegion.matches(':hover')) || carouselRegion.contains(document.activeElement))) return;
      normalizeCarousel();
      autoPosition = carouselTrack.scrollLeft;
      autoFrame = requestAnimationFrame(advanceFrame);
    }
    function updatePlayButton() {
      playSlide.hidden = motionPreference.matches;
      playSlide.setAttribute('aria-pressed', String(manualPaused));
      playSlide.setAttribute('aria-label', manualPaused ? 'Resume automatic rotation' : 'Pause automatic rotation');
      playSlide.textContent = manualPaused ? '▶' : 'Ⅱ';
    }
    previousSlide.addEventListener('click', () => moveCarousel(-1));
    nextSlide.addEventListener('click', () => moveCarousel(1));
    playSlide.addEventListener('click', () => {
      manualPaused = !manualPaused;
      updatePlayButton();
      startAutoAdvance(!manualPaused);
    });
    carouselTrack.addEventListener('keydown', (event) => {
      if (event.target !== carouselTrack || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      moveCarousel(event.key === 'ArrowRight' ? 1 : -1);
    });
    carouselTrack.addEventListener('scroll', () => {
      if (autoFrame) return;
      updateCarousel();
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(normalizeCarousel, 180);
    }, { passive: true });
    carouselTrack.addEventListener('scrollend', normalizeCarousel);
    window.addEventListener('resize', measureCarousel);
    carouselRegion?.addEventListener('mouseenter', () => { if (hoverPreference.matches) pauseAutoAdvance(); });
    carouselRegion?.addEventListener('mouseleave', () => startAutoAdvance());
    carouselRegion?.addEventListener('focusin', pauseAutoAdvance);
    carouselRegion?.addEventListener('focusout', () => window.setTimeout(startAutoAdvance, 0));
    carouselTrack.addEventListener('pointerdown', pauseAutoAdvance);
    carouselTrack.addEventListener('pointerup', () => { window.clearTimeout(resumeTimer); resumeTimer = window.setTimeout(() => startAutoAdvance(), 1000); });
    carouselTrack.addEventListener('pointercancel', () => { window.clearTimeout(resumeTimer); resumeTimer = window.setTimeout(() => startAutoAdvance(), 1000); });
    document.addEventListener('visibilitychange', () => startAutoAdvance());
    motionPreference.addEventListener?.('change', () => { updatePlayButton(); startAutoAdvance(); });
    if ('IntersectionObserver' in window && carouselRegion) {
      const visibilityObserver = new IntersectionObserver(([entry]) => {
        carouselVisible = entry.isIntersecting;
        if (carouselVisible) startAutoAdvance();
        else pauseAutoAdvance();
      });
      visibilityObserver.observe(carouselRegion);
    }
    measureCarousel();
    updatePlayButton();
    startAutoAdvance();
  }

  function drawProjectVisual(kind) {
    const shapes = {
      grid: '<svg viewBox="0 0 420 270" aria-hidden="true"><path class="visual-line" d="M42 58h336M42 135h336M42 212h336M124 31v210M210 31v210M296 31v210"/><rect x="58" y="74" width="135" height="45" rx="12"/><rect x="226" y="151" width="135" height="45" rx="12"/><circle cx="210" cy="135" r="27"/><path class="visual-stroke" d="M195 135h30M210 120v30"/></svg>',
      bars: '<svg viewBox="0 0 420 270" aria-hidden="true"><path class="visual-line" d="M48 218h324M48 48v170"/><rect x="84" y="141" width="43" height="77" rx="8"/><rect x="155" y="97" width="43" height="121" rx="8"/><rect x="226" y="119" width="43" height="99" rx="8"/><rect x="297" y="70" width="43" height="148" rx="8"/><path class="visual-stroke" d="M76 82c41-30 57 23 95-5 33-25 42 7 71-17 22-18 41 13 93-29"/></svg>',
      flow: '<svg viewBox="0 0 420 270" aria-hidden="true"><circle cx="83" cy="135" r="32"/><circle cx="211" cy="76" r="32"/><circle cx="211" cy="194" r="32"/><circle cx="338" cy="135" r="32"/><path class="visual-stroke" d="m113 121 67-31M113 149l67 31M242 90l67 31M242 180l67-31"/><path class="visual-line" d="M74 135h18M202 76h18M202 194h18M329 135h18"/></svg>',
      wave: '<svg viewBox="0 0 420 270" aria-hidden="true"><path class="visual-stroke wide" d="M34 170c54-103 86 67 147-31 58-93 96 47 204-53"/><path class="visual-line" d="M34 203c54-103 86 67 147-31 58-93 96 47 204-53M34 137c54-103 86 67 147-31 58-93 96 47 204-53"/><circle cx="106" cy="82" r="18"/><circle cx="315" cy="197" r="12"/></svg>'
    };
    return shapes[kind] || shapes.grid;
  }
  function renderProjects(filter = 'all') {
    const grid = document.querySelector('#project-grid');
    if (!grid || !Array.isArray(window.PORTFOLIO_PROJECTS)) return;
    const projects = filter === 'all' ? window.PORTFOLIO_PROJECTS : window.PORTFOLIO_PROJECTS.filter((project) => project.type === filter);
    grid.innerHTML = projects.map((project, index) => `<article class="project-card project-${project.hue}" data-reveal style="--delay:${index * 70}ms"><a class="project-visual" href="${project.url}" aria-label="View ${project.sample ? 'sample concept' : 'project'}: ${project.title}">${drawProjectVisual(project.visual)}<span class="project-number">${String(index + 1).padStart(2, '0')}</span>${project.sample ? '<span class="sample-chip">Sample concept</span>' : ''}<span class="visual-arrow" aria-hidden="true">↗</span></a><div class="project-copy"><p class="project-type">${project.label}</p><h3><a href="${project.url}">${project.title}</a></h3><p>${project.summary}</p><div class="project-bottom"><ul class="tag-list">${project.tags.map((tag) => `<li>${tag}</li>`).join('')}</ul><a class="project-link" href="${project.url}">${project.sample ? 'View idea' : 'View project'} <span aria-hidden="true">↗</span></a></div></div></article>`).join('');
    activateReveals(grid);
  }
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('is-active', item === button)); renderProjects(button.dataset.filter); }));

  let revealObserver;
  function activateReveals(scope = document) {
    const elements = [...scope.querySelectorAll('[data-reveal]:not(.is-visible)')];
    if (reducedMotion || !('IntersectionObserver' in window)) { elements.forEach((element) => element.classList.add('is-visible')); return; }
    if (!revealObserver) revealObserver = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); } }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    elements.forEach((element) => revealObserver.observe(element));
  }
  renderProjects(); activateReveals(); requestAnimationFrame(() => document.body.classList.add('page-ready'));

  const navLinks = [...document.querySelectorAll('.desktop-nav a')];
  const sections = [...document.querySelectorAll('main section[id]')];
  if ('IntersectionObserver' in window) { const navObserver = new IntersectionObserver((entries) => { const current = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]; if (!current) return; const currentId = current.target.id === 'work' ? 'projects' : current.target.id; navLinks.forEach((link) => link.toggleAttribute('aria-current', link.getAttribute('href') === `#${currentId}`)); }, { rootMargin: '-30% 0px -58% 0px', threshold: [0.1, 0.3, 0.55] }); sections.forEach((section) => navObserver.observe(section)); }
  function updateHeader() { header?.classList.toggle('is-scrolled', window.scrollY > 10); } updateHeader(); window.addEventListener('scroll', updateHeader, { passive: true });

  const form = document.querySelector('[data-contact-form]'); const formStatus = document.querySelector('[data-form-status]');
  form?.addEventListener('submit', (event) => { event.preventDefault(); const values = new FormData(form); const name = String(values.get('name') || '').trim(); const email = String(values.get('email') || '').trim(); const message = String(values.get('message') || '').trim(); const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); if (!name || !validEmail || !message) { formStatus.textContent = 'Please add your name, a valid email address, and a message.'; formStatus.dataset.state = 'error'; return; } const subject = `Project enquiry from ${name}`; const body = `Name: ${name}\nEmail: ${email}\n\nProject details:\n${message}`; formStatus.textContent = 'Your email app should open with this message ready to send.'; formStatus.dataset.state = 'success'; window.location.href = `mailto:jeremiahdavidangpunzalan@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; });
  document.querySelector('[data-current-year]')?.replaceChildren(String(new Date().getFullYear()));
})();
