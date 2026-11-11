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
    const skills = [...carouselTrack.children];
    let slides = skills;
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
    document.addEventListener('portfolio:projects', ({ detail }) => {
      pauseAutoAdvance();
      const projectSlides = detail.map((project) => {
        const slide = document.createElement('li');
        slide.className = 'carousel-slide';
        const link = document.createElement('a');
        link.href = project.href;
        const kind = document.createElement('span');
        kind.className = 'slide-kind';
        kind.textContent = project.category.name;
        const title = document.createElement('strong');
        title.textContent = project.title;
        const description = document.createElement('span');
        description.className = 'slide-detail';
        description.textContent = project.description;
        link.append(kind, title, description);
        slide.append(link);
        return slide;
      });
      slides = [...skills, ...projectSlides];
      carouselTrack.replaceChildren(...slides.map(cloneSlide), ...slides, ...slides.map(cloneSlide));
      step = 0;
      measureCarousel();
      startAutoAdvance();
    });
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

  let revealObserver;
  function activateReveals(scope = document) {
    const elements = [...scope.querySelectorAll('[data-reveal]:not(.is-visible)')];
    if (reducedMotion || !('IntersectionObserver' in window)) { elements.forEach((element) => element.classList.add('is-visible')); return; }
    if (!revealObserver) revealObserver = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); } }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    elements.forEach((element) => revealObserver.observe(element));
  }
  activateReveals(); requestAnimationFrame(() => document.body.classList.add('page-ready'));

  const navLinks = [...document.querySelectorAll('.desktop-nav a')];
  const sections = [...document.querySelectorAll('main section[id]')];
  if ('IntersectionObserver' in window) { const navObserver = new IntersectionObserver((entries) => { const current = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]; if (!current) return; const currentId = current.target.id === 'work' ? 'projects' : current.target.id; navLinks.forEach((link) => link.toggleAttribute('aria-current', link.getAttribute('href') === `#${currentId}`)); }, { rootMargin: '-30% 0px -58% 0px', threshold: [0.1, 0.3, 0.55] }); sections.forEach((section) => navObserver.observe(section)); }
  function updateHeader() { header?.classList.toggle('is-scrolled', window.scrollY > 10); } updateHeader(); window.addEventListener('scroll', updateHeader, { passive: true });

  document.querySelector('[data-current-year]')?.replaceChildren(String(new Date().getFullYear()));
})();
