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
  let pending = false;

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
    if (/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(project.image)) {
      const image = element('img', 'project-image');
      image.alt = project.imageAlt;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.src = new URL('media/' + project.image, api);
      image.addEventListener('error', () => image.remove(), { once: true });
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
    const links = element('div', 'project-bottom');
    for (const [url, label] of [[project.repoUrl, 'View on GitHub ↗'], [project.liveUrl, 'View live demo ↗']]) {
      const href = safeLink(url);
      if (!href) continue;
      const link = element('a', 'project-link', label);
      link.href = href;
      links.append(link);
    }
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

  async function load() {
    if (pending) return;
    const requestGeneration = generation;
    pending = true;
    moreButton.disabled = true;
    status.textContent = 'Loading projects…';
    try {
      const result = await request('projects', page, undefined, category);
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
      grid.append(...result.items.map(card));
      status.textContent = grid.childElementCount ? '' : 'No projects to show yet.';
      page++;
      moreButton.hidden = !result.more;
      moreButton.textContent = 'More projects';
    } catch {
      if (requestGeneration !== generation) return;
      status.textContent = 'Projects are temporarily unavailable.';
      moreButton.hidden = false;
      moreButton.textContent = 'Retry projects';
    } finally {
      if (requestGeneration === generation) {
        pending = false;
        moreButton.disabled = false;
      }
    }
  }

  function selectCategory(slug) {
    category = slug;
    generation++;
    page = 1;
    pending = false;
    markActiveFilter();
    grid.replaceChildren();
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
