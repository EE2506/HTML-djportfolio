import assert from 'node:assert/strict';

// Start Chrome with a temporary profile and --remote-debugging-port=9229.
const [tab] = await fetch('http://localhost:9229/json/list').then((response) => response.json());
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let sequence = 0;
const commands = new Map();
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  const pending = commands.get(message.id);
  if (!pending) return;
  commands.delete(message.id);
  if (message.error) pending.reject(new Error(message.error.message));
  else pending.resolve(message.result);
});

function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    commands.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description);
  return result.result.value;
}

const fixture = () => {
  const imageSource = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    ...imageSource,
    set(value) {
      if (String(value).endsWith('/media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp')) {
        value = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      }
      imageSource.set.call(this, value);
    },
  });
  const categories = [{ slug: 'websites', name: 'Websites' }, { slug: 'apps', name: 'Web apps' }];
  const items = categories.map((category, index) => ({
    category, id: 'custom-' + index, title: category.name + ' example',
    description: 'Test description', tags: ['PHP'], image: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp',
    imageAlt: 'Project screenshot', repoUrl: null, liveUrl: index === 0 ? 'https://example.com/demo' : null,
  }));
  const original = window.fetch;
  window.fetch = (input, options) => {
    const url = new URL(input);
    const feed = url.searchParams.get('feed');
    if (feed === 'contact') {
      return Promise.resolve(Response.json({ sent: !window.failContact }, { status: window.failContact ? 503 : 200 }));
    }
    if (feed !== 'projects') return original(input, options);
    const mode = new URLSearchParams(location.search).get('fixture');
    if (mode === 'down') return Promise.reject(new Error('Offline'));
    if (mode === 'empty') return Promise.resolve(Response.json({ items: [], categories: [], more: false }));
    const selected = url.searchParams.get('category');
    window.projectRequests ??= [];
    window.projectRequests.push({ selected, signal: options.signal });
    if (mode === 'loading' && selected) {
      return new Promise((resolve) => setTimeout(() => resolve(Response.json({
        items: items.filter((item) => item.category.slug === selected), categories, more: false,
      })), 600));
    }
    return Promise.resolve(Response.json({
      items: selected ? items.filter((item) => item.category.slug === selected) : items, categories, more: false,
    }));
  };
};

async function waitFor(expression) {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if (await evaluate(expression)) return;
    } catch {
      // Navigation can replace the execution context between polls.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(expression);
}

async function navigate(query) {
  await send('Page.navigate', { url: 'http://localhost:4173/' + query });
  await waitFor('document.readyState === "complete" && document.body.classList.contains("page-ready")');
}

try {
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + fixture + ')()' });
  await send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'light' },
  ] });
  for (const width of [390, 768, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await navigate('?width=' + width);
    await waitFor('document.querySelectorAll("#project-grid .project-card").length === 2');
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'No horizontal overflow');
    const layout = () => {
      const about = document.querySelector('.about-layout').getBoundingClientRect();
      const photo = document.querySelector('.about-portrait');
      photo.scrollIntoView();
      const image = photo.getBoundingClientRect();
      const bio = document.querySelector('.about-copy').getBoundingClientRect();
      return image.right <= about.right && (innerWidth <= 860 ? bio.top >= image.bottom : bio.left >= image.right);
    };
    assert.equal(await evaluate('(' + layout + ')()'), true, 'Portrait and bio fit at ' + width);
    await waitFor('document.querySelector(".about-portrait").naturalWidth === 720');
    assert.equal(await evaluate('document.querySelector("[data-carousel-position]").textContent.endsWith("06")'), true);
    await evaluate('document.querySelector("[data-carousel-next]").click()');
    await waitFor('document.querySelector("[data-carousel-position]").textContent.startsWith("02")');
    const before = await evaluate('document.querySelector("[data-theme-toggle]").getAttribute("aria-label")');
    await evaluate('document.querySelector("[data-theme-toggle]").click()');
    assert.notEqual(await evaluate('document.querySelector("[data-theme-toggle]").getAttribute("aria-label")'), before);
    await evaluate('document.querySelector("[data-category=apps]").click()');
    await waitFor('document.querySelectorAll("#project-grid .project-card").length === 1');
    assert.equal(await evaluate('document.querySelector("#project-grid h3").textContent'), 'Web apps example');
  }
  const submit = () => {
    const form = document.querySelector('[data-contact-form]');
    form.elements.name.value = 'Visitor';
    form.elements.email.value = 'visitor@example.com';
    form.elements.message.value = 'Project inquiry';
    window.failContact = true;
    form.requestSubmit();
  };
  await evaluate('(' + submit + ')()');
  await waitFor('document.querySelector("[data-form-status]").dataset.state === "error"');
  assert.equal(await evaluate('document.querySelector("[data-contact-form]").elements.message.value'), 'Project inquiry');
  await evaluate('window.failContact = false; document.querySelector("[data-contact-form]").requestSubmit()');
  await waitFor('document.querySelector("[data-form-status]").dataset.state === "success"');
  assert.equal(await evaluate('document.querySelector("[data-contact-form]").elements.message.value'), '');
  await navigate('?fixture=loading');
  await waitFor('document.querySelectorAll("#project-grid .project-card").length === 2');
  const actionLayout = () => {
    const both = document.querySelector('#custom-0');
    const sample = both.querySelector('.project-secondary a');
    const demo = both.querySelector('.project-demo');
    const sampleOnly = document.querySelector('#custom-1');
    return sample.href.endsWith('/media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp')
      && sample.getBoundingClientRect().right < demo.getBoundingClientRect().left
      && sampleOnly.querySelector('.project-secondary a') && !sampleOnly.querySelector('.project-demo');
  };
  assert.equal(await evaluate('(' + actionLayout + ')()'), true);
  await evaluate('document.querySelector("[data-category=apps]").click()');
  await waitFor('document.querySelector(".project-skeleton") && document.querySelector("#project-grid").getAttribute("aria-busy") === "true"');
  await evaluate('document.querySelector("[data-category=websites]").click()');
  await waitFor('window.projectRequests.some(r => r.selected === "apps" && r.signal.aborted)');
  await waitFor('document.querySelector("#project-grid h3")?.textContent === "Websites example"');
  await evaluate('document.querySelector("[data-project-filters] button").click()');
  await waitFor('document.querySelectorAll("#project-grid .project-card").length === 2');
  await evaluate('document.querySelector("[data-category=websites]").click()');
  assert.equal(await evaluate('document.querySelector("#project-grid h3").textContent'), 'Websites example');
  assert.equal(await evaluate('window.projectRequests.filter(r => r.selected === "websites").length'), 1);
  await navigate('?fixture=empty');
  await waitFor('document.querySelector("[data-project-status]").textContent.includes("No projects")');
  await navigate('?fixture=down');
  await waitFor('document.querySelector("[data-project-status]").textContent.includes("unavailable")');
  assert.equal(await evaluate('Boolean(document.querySelector("a[href^=mailto]"))'), true);
  console.log('Chrome checks passed at phone, tablet, and desktop widths.');
} finally {
  socket.close();
}
