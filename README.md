# DJ Punzalan portfolio

A responsive static portfolio for GitHub Pages. It uses plain HTML, CSS, JavaScript, inline SVG, and self-hosted WOFF2 fonts—there is no framework, build process, form service, analytics, or third-party runtime dependency.

## Folder structure

```text
.
├── index.html                 # Portfolio homepage
├── 404.html                   # GitHub Pages custom not-found page
├── robots.txt / sitemap.xml   # Search basics
├── blog/
│   ├── index.html             # Unlisted blog index (URL only)
│   └── posts/                 # Two clearly labelled sample posts
└── assets/
    ├── css/styles.css         # Shared design system and responsive styles
    ├── js/projects.js         # Single place to edit project cards
    ├── js/main.js             # Theme, motion, menu, filters, and mailto form
    ├── fonts/                 # Self-hosted WOFF2 font files
    └── img/                   # Local favicon and social-sharing image
```

## Run locally

Open `index.html` directly in a browser, or use a simple local server:

```powershell
python -m http.server 4173
```

Then open `http://localhost:4173`.

## Deploy free on GitHub Pages

1. Create a GitHub repository and push this folder to the `main` branch.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Choose `main` and `/(root)`, then save.
5. GitHub will publish the site at the URL it shows on that page.

The site uses relative asset and page paths, so it works at both `username.github.io` and `username.github.io/repository-name/`. If your GitHub username or repository name differs from `ee2506/djpfolio-Nicev`, update the four URLs in `sitemap.xml` and the URL in `robots.txt` after publishing.

## Add or replace a project

Edit `assets/js/projects.js`. Each object supplies both a project card and a rotating carousel slide. Change its title, description, short `carouselSummary`, category (`website`, `web-app`, or `ai`), tags, link, colour, and visual pattern. The homepage cards, carousel, and filters update automatically. The four skill slides are clearly marked in `index.html` if you want to edit those too.

When you have a real case-study page, set the project `url` to its relative location, for example `projects/my-project.html`, and set `sample: false`. This removes the **Sample concept** label and changes the carousel link from the work section to your project URL.

The carousel glides horizontally at 38 pixels per second and loops continuously. Visitors can pause it, swipe it, or use the arrow buttons. It pauses during interaction or when offscreen, and stays still when their device requests reduced motion. Change `scrollSpeed` in `assets/js/main.js` to adjust the pace.

## Add a blog post

The blog is intentionally absent from the site navigation and homepage. It remains available directly at `blog/index.html` and is marked `noindex` while it contains sample material.

1. Copy one of the clearly labelled sample posts to `blog/posts/my-post.html` and replace its content.
2. Add the title, description, social metadata, post meta, and article text.
3. Add a matching card and link in `blog/index.html`.
4. Add its full deployed URL to `sitemap.xml`.

## Contact form

The contact form validates the fields in the browser then opens a pre-addressed `mailto:` message. It does not submit information to a service or store visitor data. Visitors can also use the direct email, GitHub, or LinkedIn links.
