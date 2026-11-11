(() => {
  const api = new URL(location.hostname === 'localhost' && location.port === '4173'
    ? 'http://localhost:8417/feed.php'
    : 'https://shotiii.pawt-services.com/portfolio-api/feed.php');

  async function request(feed, page, options, category = '') {
    const url = new URL(api);
    url.search = new URLSearchParams({ feed, page, category });
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Request failed: ' + response.status);
    return response.json();
  }

  window.loadPortfolioProjects?.(request, api);

  const form = document.querySelector('[data-contact-form]');
  const button = form.querySelector('[type="submit"]');
  const status = form.querySelector('[data-form-status]');
  button.disabled = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    status.dataset.state = '';
    status.textContent = 'Sending…';
    try {
      const result = await request('contact', 1, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      if (result.sent !== true) throw new Error('Send not confirmed');
      form.reset();
      status.dataset.state = 'success';
      status.textContent = 'Thanks. Your message was sent.';
    } catch {
      status.dataset.state = 'error';
      status.textContent = 'Could not confirm delivery. Your message is still here. You can also email me directly.';
    } finally {
      button.disabled = false;
    }
  });
})();
