window.loadPortfolioProjects = (request, api) => {
  const grid = document.querySelector('#project-grid');
  const filters = document.querySelector('[data-project-filters]');
  const status = document.querySelector('[data-project-status]');
  const moreButton = document.querySelector('[data-more-projects]');
  if (!grid || !filters || !status || !moreButton) return;

  let page = 1;
  let category = '';
  let filterSignature = '';
  let generation = 0;
  let pending;
  const cache = new Map();

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function safeLink(value) {
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function card(project) {
    const item = element('article', 'project-card project-blue');
    item.id = project.id;
    const visual = element('div', 'project-visual project-media');
    const placeholder = element('span', 'project-image-placeholder', project.category.name);
    visual.append(placeholder);
    const links = element('div', 'project-bottom');
    const secondary = element('div', 'project-secondary');
    if (/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(project.image)) {
      const image = element('img', 'project-image');
      image.alt = project.imageAlt;
      image.loading = 'lazy';
      image.decoding = 'async';
      const sample = element('a', 'project-link', 'View sample ↗');
      sample.href = new URL('media/' + project.image, api);
      sample.target = '_blank';
      sample.rel = 'noopener';
      sample.setAttribute('aria-label', 'View sample image for ' + project.title + ' (opens in a new tab)');
      secondary.append(sample);
      image.addEventListener('error', () => {
        image.remove();
        sample.remove();
        if (!secondary.children.length && links.children.length === 1) links.remove();
      }, { once: true });
      image.src = sample.href;
      visual.append(image);
    }
    const copy = element('div', 'project-copy');
    copy.append(element('p', 'project-type', project.category.name), element('h3', '', project.title));
    if (project.description) copy.append(element('p', '', project.description));
    if (project.tags.length) {
      const tags = element('ul', 'tag-list');
      for (const tag of project.tags) tags.append(element('li', '', tag));
      copy.append(tags);
    }
    for (const [url, label, group] of [
      [project.repoUrl, 'View on GitHub ↗', secondary],
      [project.liveUrl, 'View live demo ↗', links],
    ]) {
      const href = safeLink(url);
      if (!href) continue;
      const link = element('a', 'project-link', label);
      link.href = href;
      if (group === links) link.classList.add('project-demo');
      group.append(link);
    }
    if (secondary.children.length) links.prepend(secondary);
    if (links.children.length) copy.append(links);
    item.append(visual, copy);
    return item;
  }

  function drawFilters(categories) {
    const nextSignature = JSON.stringify(categories);
    if (nextSignature === filterSignature) return;
    filterSignature = nextSignature;
    filters.replaceChildren();
    if (!categories.length) return;
    for (const { slug, name } of [{ slug: '', name: 'All work' }, ...categories]) {
      const button = element('button', 'filter-button', name);
      button.type = 'button';
      button.dataset.category = slug;
      filters.append(button);
    }
    markActiveFilter();
  }

  function markActiveFilter() {
    for (const button of filters.children) {
      const active = button.dataset.category === category;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  function showResults(results, append = false) {
    const cards = results.flatMap(({ items }) => items.map(card));
    if (append) grid.append(...cards);
    else grid.replaceChildren(...cards);
    status.textContent = grid.childElementCount ? '' : 'No projects to show yet.';
    moreButton.hidden = !results.at(-1).more;
    moreButton.textContent = 'More projects';
  }

  async function load() {
    if (pending) return;
    const requestGeneration = generation;
    const controller = new AbortController();
    pending = controller;
    moreButton.disabled = true;
    grid.setAttribute('aria-busy', 'true');
    status.textContent = 'Loading projects…';
    if (page === 1) {
      const placeholder = element('div', 'project-skeleton');
      placeholder.setAttribute('aria-hidden', 'true');
      grid.replaceChildren(placeholder, placeholder.cloneNode());
    }
    try {
      const result = await request('projects', page, { signal: controller.signal }, category);
      if (requestGeneration !== generation) return;
      if (category && !result.categories.some(({ slug }) => slug === category)) {
        selectCategory('');
        return;
      }
      drawFilters(result.categories);
      if (!category && page === 1) {
        const slides = result.items.slice(0, 6).map((project) => ({
          ...project, href: safeLink(project.liveUrl) || safeLink(project.repoUrl) || '#work',
        }));
        document.dispatchEvent(new CustomEvent('portfolio:projects', { detail: slides }));
      }
      const pages = cache.get(category) ?? [];
      pages.push(result);
      cache.set(category, pages);
      showResults([result], page > 1);
      page++;
    } catch {
      if (requestGeneration !== generation) return;
      if (page === 1) grid.replaceChildren();
      status.textContent = 'Projects are temporarily unavailable.';
      moreButton.hidden = false;
      moreButton.textContent = 'Retry projects';
    } finally {
      if (requestGeneration === generation) {
        pending = undefined;
        moreButton.disabled = false;
        grid.removeAttribute('aria-busy');
      }
    }
  }

  function selectCategory(slug) {
    pending?.abort();
    pending = undefined;
    category = slug;
    generation++;
    markActiveFilter();
    const pages = cache.get(slug);
    page = (pages?.length ?? 0) + 1;
    if (pages) {
      grid.removeAttribute('aria-busy');
      moreButton.disabled = false;
      showResults(pages);
      return;
    }
    moreButton.hidden = true;
    load();
  }

  filters.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (button && button.dataset.category !== category) selectCategory(button.dataset.category);
  });
  moreButton.addEventListener('click', load);
  load();
};
