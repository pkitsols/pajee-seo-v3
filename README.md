# PajeeSEO.online — GitHub + Vercel SEO Tool V3

This version is fixed for Vercel deployment and live testing.

## Why your previous test was failing

The frontend/backend were running, but the keyword ranking module needs a SERP provider. If Google returns: `This project does not have access to Custom Search JSON API`, the issue is not the frontend button. It means the Google Cloud project is not allowed to use Custom Search JSON API, or the API is not enabled for that project.

## Recommended Vercel Environment Variables

Add these in Vercel → Project → Settings → Environment Variables:

```env
PAGESPEED_API_KEY=your_pagespeed_key
SERPAPI_KEY=your_serpapi_key
SERP_COUNTRY=pk
SERP_LANGUAGE=en
```

Then redeploy the project.

## Optional Google CSE variables

Use these only if your Google Cloud project already has Custom Search JSON API access:

```env
GOOGLE_CSE_API_KEY=your_google_api_key
GOOGLE_CSE_ID=your_programmable_search_engine_id
```

## Test URLs

After deployment, test these URLs:

```txt
https://your-domain.vercel.app/api/seo?action=health
https://your-domain.vercel.app/api/seo?action=diagnostics&url=https://example.com&keyword=seo%20agency
```

`diagnostics` will show whether PageSpeed, SERP provider and website fetching are working. It does not expose your API keys.

## Deploy steps

1. Upload this folder to GitHub.
2. Import GitHub repo in Vercel.
3. Add environment variables in Vercel.
4. Click Redeploy.
5. Open `/api/seo?action=diagnostics&url=https://example.com&keyword=seo%20agency`.

## Notes

- PageSpeed metrics are real from Google PageSpeed Insights.
- Website audit fetches title, meta, H1, canonical, schema, images, robots.txt and sitemap.xml from the live site.
- Keyword ranking checks use SERPAPI_KEY when available, otherwise Google CSE variables.
- Exact website traffic and Search Console top queries need Google Search Console OAuth access, so this public tool uses SERP visibility signals instead of fake traffic.
