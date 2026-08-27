# Public site source of truth — 2026-08-27

## Current production website

The modern public marketing/booking website at `https://www.autokorvtostuk.ee/` is **not** sourced from the repository `main` branch.

On 2026-08-19 the `www.autokorvtostuk.ee` DNS target was moved from the previous Google Sites target `ghs.googlehosted.com` to the ChatGPT Sites custom-domain target `custom-domains.chatgpt.site`.

The current public Site includes the online booking calculator/form, seasonal services, Multitel reach information, Resend booking emails and SEO landing pages such as `/korvtostuki-rent-tallinn`.

The root `main` branch static HTML is legacy reference content only. Do not deploy or merge it over the current public Site without first reconciling the modern Site source.

## Work app

The operational work app is a separate application under `work-app/` and is developed on `app-v1-build`. Cloudflare/Vercel Git checks named `autokorvtostuk-app` belong to that app deployment path and must not be treated as the public marketing-site deployment.

## Current Google visibility baseline

As of 2026-08-27:

- `korvtõstuk rent Tallinn` / related Tallinn intent: `https://www.autokorvtostuk.ee/korvtostuki-rent-tallinn` is indexed and appears prominently in fresh search results.
- exact spaced phrase `auto korvtõstuk`: the current Site is weak/not visible in the sampled top results; results are dominated by marketplace/machinery and established lift-rental pages.
- homepage is freshly indexed with the modern booking content.

## Live Site SEO change set

Apply these changes to the **modern ChatGPT Site**, not to legacy `main` HTML:

1. Add one natural exact phrase occurrence on the homepage: `auto korvtõstuk`, preferably in the services/SEO navigation section rather than rewriting the primary H1.
2. Add a dedicated landing page at `/auto-korvtostuk`.
   - `<title>`: `Auto korvtõstuk Tallinnas | 16,3 m koos operaatoriga`
   - H1: `Auto korvtõstuk Tallinnas koos operaatoriga`
   - Intro: explain naturally that “auto korvtõstuk” and “autokorvtõstuk” refer to a vehicle-mounted basket lift service.
   - Include factual service data: 16.3 m working height, 200 kg basket, 45 €/h, minimum 90 €, optional worker 35 €/h, outside Tallinn +1 €/km.
   - Include suitability/clearance guidance and a booking CTA.
   - Canonical: `https://www.autokorvtostuk.ee/auto-korvtostuk`
3. Link `/auto-korvtostuk` from the homepage section “Teenused ja piirkonnad” using anchor text `Auto korvtõstuk Tallinnas`.
4. Cross-link `/auto-korvtostuk` and `/korvtostuki-rent-tallinn` contextually, without keyword stuffing.
5. Include `/auto-korvtostuk` in the Site sitemap/indexable route set.
6. Keep the existing strong `/korvtostuki-rent-tallinn` page; do not create a competing near-duplicate for the same `korvtõstuk` Tallinn intent.
7. Maintain one canonical hostname (`www.autokorvtostuk.ee`) and redirect the apex host to it once DNS/redirect controls are accessible.

## Safety rule

Do not merge the legacy SEO PR/branch into `main` as a production-site release. Any future public-site change must first be applied/reviewed in ChatGPT Sites and then published to the existing Site/custom domain.
