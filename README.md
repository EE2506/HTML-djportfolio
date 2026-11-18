# DJ Punzalan portfolio

The public site uses plain HTML, CSS, and JavaScript on GitHub Pages. A PHP API and private admin on Hostinger manage GitHub projects and case studies in MySQL. Gmail SMTP handles contact inquiries.

## Run locally

Requirements: PHP 8.2+ with PDO MySQL, cURL, OpenSSL, and Fileinfo; Composer; and a dedicated MySQL database. Enable GD with WebP support to resize and re-encode uploaded images. Use an empty database for the first setup. Never point the test suite at production.

1. Copy backend/private/.env.example to backend/private/.env. Fill in the dedicated database settings and an admin password hash. Keep SMTP credentials blank for local tests.
2. Run php backend/private/setup.php. Each SQL migration runs once. A second invocation with no pending migrations refuses to proceed. If initial setup stops halfway through, fix the cause and rerun it. The initial migration can resume safely.
3. For local mail testing, copy backend/composer.json into backend/private and run composer install --no-dev there. The autoloader must be at backend/private/vendor/autoload.php.
4. In separate terminals, run php -S localhost:8417 -t backend/public and python -m http.server 4173. Open http://localhost:4173 for the frontend and http://localhost:8417/admin/ for the admin. The PHP development server permits localhost CORS and local HTTP cookies.

Generate the admin password hash in a private terminal. Run php -a, then enter this expression with a strong password you have not used elsewhere. Set only the resulting hash in ADMIN_PASSWORD_HASH. The shell command itself does not contain the password.

    echo password_hash('REPLACE_WITH_YOUR_ADMIN_PASSWORD', PASSWORD_DEFAULT), PHP_EOL;

If PHP runs without a php.ini, enable the required extensions in the PHP configuration for your installation.

## Deploy

Use PHP 8.2 or later and HTTPS on shotiii.pawt-services.com. Create the dedicated portfolio MySQL database and user in Hostinger first. Grant that user access only to this database. The backend needs read and write access to the private directory for cache and login/contact rate limits.

- Copy backend/public/feed.php, backend/public/admin/, and backend/public/media/.htaccess into public_html/portfolio-api/. Ensure the media directory is writable by PHP. Keep Apache/LiteSpeed access controls enabled so only files matching the generated image names are served from it.
- Create portfolio-private/ next to public_html. Copy the contents of backend/private/ into it, along with backend/composer.json. Keep migrations, config, cached data, and dependencies in this private directory.
- Create portfolio-private/.env from the example. Configure DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, and ADMIN_PASSWORD_HASH. Add SMTP_USERNAME, SMTP_PASSWORD, CONTACT_TO, and SMTP_PORT. Quote passwords and the hash in the INI-style file. Port 587 uses STARTTLS and 465 uses implicit TLS.
- From portfolio-private/, run composer install --no-dev --optimize-autoloader followed by php setup.php. Verify the admin loads over HTTPS and the public project feed returns JSON before publishing.
- In GitHub, set Settings → Pages → Source to GitHub Actions. The workflow publishes the public site from master at https://ee2506.github.io/djportfolio/. It packages only the static files.

## Manage projects

Open https://shotiii.pawt-services.com/portfolio-api/admin/ directly and sign in. The admin is private and excluded from GitHub Pages. Five failed login attempts from the same IP within 15 minutes temporarily lock that IP out.

- Tag an owned public repository with portfolio to feature it. GitHub is refreshed every 30 minutes. An admin override is tied to the repository ID, so it follows renames. Untagged, private, archived, and forked repos are excluded on a successful GitHub refresh.
- Select a repository to override the title, description, category, tags, image, or demo URL. Use Hide to remove it from the public list. Add a case study for work without a public repo.
- Pin important projects. Smaller order numbers appear first within pinned and unpinned groups. Choose one category and any existing tags. Add, rename, or reorder categories in the admin. Move the projects assigned to a category before deleting it.
- Drop or select up to 10 JPEG, PNG, or WebP images per project, up to 5 MB and 16 megapixels each. Choose a cover or remove images when editing the project. GD resizes images to at most 1,600 px on the long edge and re-encodes them to WebP. Visitors can browse and download the images from **View samples**.
- Changes apply on the next public request. If GitHub is down, the API uses the last successful GitHub list. If MySQL is down, it uses the last saved public result. The direct email link works independently of the API.

## Database and backups

categories stores names, slugs, and ordering. projects stores custom entries, GitHub overrides, and cover images. project_samples stores additional images in order. tags and project_tags link reusable tags to projects. schema_migrations records applied versions. Login limits and public snapshots are stored in private JSON files.

Use Hostinger's database export or mysqldump to back up the dedicated portfolio database. Back up public_html/portfolio-api/media/ with the database so restored projects retain their images. Keep backups private and test restoring to a separate database.

## Verification

Run PHP lint for all backend PHP files and node --check on main.js, projects.js, and feeds.js. Run php backend/tests/catalog.php for the merge and file type checks.

For integration tests, use a fresh MySQL database named portfolio_test, a throwaway admin password of Portfolio integration test, and blank SMTP settings. Run setup, then seed backend/private/github-v2.json with a future Unix expires value and two items: IDs 101 and 102 as strings, different names, descriptions, and updated dates in descending order. Run the PHP server with upload_max_filesize=8M and post_max_size=10M so the app can reject files above its own 5 MB limit. Run python backend/tests/integration.py backend/public/media. The test writes records and uploads an image. Use a copy of the backend and a fresh database on each run.

For the browser checks, serve the frontend at http://localhost:4173 and launch Chrome with a temporary profile and --remote-debugging-port=9229. Run node backend/tests/browser.mjs with Node 22+ or node --experimental-websocket backend/tests/browser.mjs with Node 20. The browser uses fixture responses for projects and mail.

After deployment, tag a test repo, confirm it appears after a GitHub refresh, and use the admin to change its category. Submit a test inquiry from the live portfolio and verify that it reaches the configured inbox with Reply-To set to the visitor.
