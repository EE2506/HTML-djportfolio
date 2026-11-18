# DJ Punzalan portfolio

## Goal

Publish DJ's portrait, GitHub projects, and selected case studies on the free GitHub Pages site at https://ee2506.github.io/djportfolio/. DJ manages projects, categories, tags, and images from the private admin on shotiii.pawt-services.com. Visitors can send inquiries from the website.

## Hosting

GitHub Actions publishes the static frontend from master. The PHP API runs at /portfolio-api/ on Hostinger with a dedicated MySQL database. The Pages artifact contains only public frontend files. The admin, private configuration, data, and migrations are deployed separately. DJ creates the database, enters secrets on Hostinger, and configures Pages and the repository topics.

## Projects and admin

- Show only public, owned, non-fork, non-archived GitHub repos tagged portfolio and visible custom case studies. Store overrides by numeric GitHub ID. Keep GitHub results for 30 minutes and use the last successful result during GitHub outages.
- Let DJ edit project titles, descriptions, category, tags, image, image alt text, demo URL, visibility, pinned state, and sort order. Support adding and deleting custom case studies. Remove an old image after a successful replacement or deletion.
- Seed Websites, Web apps, and AI automation. Admins can add, rename, reorder, and delete categories, and add, rename, or remove tags. Require projects in use to be reassigned before deleting their category.
- Serve merged projects 20 at a time. Filters reflect visible projects. Show the empty state and image placeholders as needed. Keep the About portrait, carousel, theme, and navigation.
- Apply admin edits on the next feed request without waiting for a GitHub refresh. Save a public snapshot for database outages and clear stale snapshots before committing admin changes.

## Contact and security

- Keep Gmail SMTP with PHPMailer. Fix the recipient and subject server-side and set Reply-To from the validated visitor address. Keep the draft and direct email link available when sending fails.
- Use HTTPS, a hashed admin password, rate limits, secure HttpOnly SameSite cookies, CSRF protection, and output escaping. Require PDO prepared statements. Keep the admin out of the public navigation and mark it noindex.
- Restrict public CORS to the GitHub Pages origin and localhost during local development. Restrict uploads to JPEG, PNG, and WebP, enforce size and dimension limits, generate names server-side, and re-encode and resize where GD supports it.
- Keep credentials outside the web root and version control. Apply each database migration once and maintain a backup of the database and uploaded media.

## Acceptance

1. The published site works at phone, tablet, and desktop widths in light and dark mode, with no sample project cards.
2. Admin project and taxonomy changes appear on the public site. Images render with alt text. Invalid and oversized images are rejected.
3. Invalid passwords and missing CSRF tokens are rejected. An in-use category cannot be deleted until its projects are reassigned.
4. The last saved public projects load when MySQL is down. The rest of the portfolio and the direct email link remain usable when the backend is unavailable.
5. A valid live inquiry arrives in DJ's inbox and Reply addresses the visitor. Invalid and rate-limited submissions send no mail.
