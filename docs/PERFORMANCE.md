# Performance (Lighthouse)

Audited with Lighthouse 12.8 on 29 Sep 2026: the Vercel build output (`node scripts/build-vercel.mjs`) served by
`scripts/serve-vercel-output.mjs` behind a local HTTP/2 + TLS front, like Vercel's CDN. Phone runs use
Lighthouse's default mobile emulation (mid-range phone, slow 4G); PC runs use `--preset=desktop`. "Before" is
commit `570a612`, measured the same way.

## Results

| Page | Phone perf | Phone first paint | Phone largest paint | PC perf | Accessibility | Best practices | SEO |
|---|---|---|---|---|---|---|---|
| Landing | 99 → 100 | 1.7 → 1.3 s | 1.8 → 1.5 s | 100 | 100 | 100 | 91 → 100 |
| Login | 99 → 100 | 1.7 → 1.3 s | 1.8 → 1.5 s | 100 | 100 | 100 | 91 → 100 |
| Sign-up | 99 → 100 | 1.7 → 1.3 s | 1.8 → 1.5 s | 100 | 100 | 100 | 91 → 100 |
| Class invite | 99 → 100 | 1.7 → 1.3 s | 1.8 → 1.7 s | 100 | 100 | 100 | 63 (not indexed) |
| Student home | 99 → 99 | 1.7 → 1.5 s | 1.8 → 1.9 s | 100 | 100 | 100 | 63 (not indexed) |
| Tutor | 99 → 99 | 1.4 → 1.5 s | 1.7 → 1.9 s | 100 | 100 | 96 → 100 | 63 (not indexed) |
| Teacher overview | 98 → 99 | 1.7 → 1.4 s | 1.8 → 1.8 s | 100 | 100 | 100 | 63 (not indexed) |
| Class page | 98 → 99 | 1.5 → 1.5 s | 1.6 → 1.9 s | 100 | 100 | 100 | 66 (not indexed) |

- **SEO on signed-in pages** is lower on purpose: `robots.txt` keeps homework, the teacher area and invite links
  out of search engines, and Lighthouse counts "blocked from indexing" against SEO. Public pages score 100.
- **Signed-in pages** paint 0.1–0.3 s later than before on phones: the signed-in layout now loads on demand, which
  cut the startup download from 122 KB to about 80 KB (gzip) for everyone. `warmUp()` in `client/src/app/App.tsx`
  loads the layout, page code and data in parallel when a signed-in page is opened directly.
- Over plain HTTP/1.1 (no multiplexing), phone scores are 90–98 because each of the many small code files costs
  a round trip; production is served over HTTP/2.

## Budgets to keep

- Startup JavaScript (gzip): about 80 KB. Signed-in screens, dialogs and menus load on demand.
- Glass blur only on floating chrome (top bar, tab bar, tutor dock); cards are translucent without blur.
- One inline script (theme), allowed by its hash in the CSP (`shared/theme-init.ts`).
- Phone inputs are 16 px (no iOS zoom); no layout shift (CLS 0 on every audited page).

## Reproduce

```bash
npm run build && node scripts/build-vercel.mjs
PORT=5300 NODE_ENV=test VERCEL=1 AI_PROVIDER=mock DATABASE_URL=... node scripts/serve-vercel-output.mjs
npx lighthouse http://localhost:5300/ --output=html --output-path=./lh-landing.html
```

For HTTP/2 numbers put a TLS/HTTP/2 proxy in front, or run Lighthouse against the deployed site
(<https://pagespeed.web.dev/>). Signed-in pages need `--extra-headers='{"Cookie":"learnify_session=..."}'`.
