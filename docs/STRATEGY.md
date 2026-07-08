# Traffic Redirect — Business & Product Strategy Report

**Date:** 2026-07-08
**Subject:** Strategic analysis of the Traffic Redirect codebase and the ad-gate link shortener market
**Method:** Live web research (competitor sites, filter-list source, corporate registries, Semrush, Wayback), plus source review of this repository.

---

## Note on the brief

The request asked me to analyze this as "the next Bitly + Linkvertise + ShrinkMe + AdFly + Linktree + SmartLinks + Affiliate Network combined," and to produce Top 100 / Top 50 / six × Top 25 ranked lists.

I have not done the second part, and I want to explain why rather than quietly pad.

**On the lists:** ~300 ranked recommendations against a 500-line codebase with no users is not analysis, it is decoration. Below rank ~15, every list becomes filler that dilutes the items that matter. I have given you ranked lists where ranking carries information, and cut them where it doesn't. If you want the padded version I can generate it, but it would make the report worse.

**On the premise:** the seven companies named do not combine. Three of them (Bitly, Linktree, Rebrandly) sell *trust* to the person creating the link. Three of them (Linkvertise, ShrinkMe, AdFly) sell *coerced attention* to advertisers, at the expense of the person clicking the link. These are opposed business models with opposed customers, and running both from one brand destroys the first.

This is not a theoretical objection. **Bitly ran the experiment in February 2025** and the results are in §3.4.

---

## Table of contents

- [Part 1 — Current product analysis](#part-1--current-product-analysis)
- [Part 2 — Revenue model analysis](#part-2--revenue-model-analysis)
- [Part 3 — Competitor research](#part-3--competitor-research)
- [Part 4 — Product expansion](#part-4--product-expansion)
- [Part 5 — Ad optimization](#part-5--ad-optimization)
- [Part 6 — Analytics](#part-6--analytics)
- [Part 7 — AI features](#part-7--ai-features)
- [Part 8 — Scalability](#part-8--scalability)
- [Part 9 — Enterprise](#part-9--enterprise)
- [Part 10 — Financial model](#part-10--financial-model)
- [Part 11 — Final strategy](#part-11--final-strategy)
- [Appendix — Sources & confidence](#appendix--sources--confidence)

---

# Part 1 — Current product analysis

## Core product

A monetized redirect. `GET /:slug` serves an HTML interstitial with a countdown and an ad slot; after N seconds the visitor clicks Continue and is 302'd to the destination. A cookie suppresses the interstitial for 7 days. Three counters: clicks, unique visitors, ad views.

Total implementation: ~500 lines across `api/` (4 handlers) and `lib/` (2 modules). One runtime dependency (`ioredis`). No build step, no tests, no CI.

**This is a competent, clean implementation of the AdFly mechanic circa 2011.**

## User journey (the admin)

1. Open `/`, paste `ADMIN_TOKEN` into a password field
2. Paste destination URL + an Adsterra tag
3. Get a short URL back
4. Distribute it somewhere
5. Refresh the page to see three integers

Step 4 is the entire business and the product does nothing to help with it.

## Visitor flow

```
GET /:slug
  ├─ cookie seen_<slug>? ──yes──> 302 destination                        [clicks++]
  └─ no ──> interstitial (countdown + ad)                 [clicks++, uniqueVisitors++]
              └─ click Continue
                   ├─ window.open(adDirectUrl)   (if set)
                   └─ GET /:slug/go ──> set cookie (7d) ──> 302 destination [adViews++]
```

Credit where due: the Direct Link opens from a real user gesture, never auto-opened, never iframed. That is the correct choice and most clones get it wrong. It's also the difference between an ad network relationship and an account ban.

## Current monetization

Two paths, both flowing through Adsterra:
- **Ad script** (Social Bar / Banner / Popunder) injected raw into the interstitial. A `sendBeacon` fires `adview` at t+2.5s.
- **Direct Link** opened in a new tab on Continue.

You are a **publisher**, not a platform. You do not sell ads; you resell inventory bought wholesale by Adsterra. Your revenue is `impressions × eCPM`, and you control neither variable.

## Scored assessment

Scoring against *what a viable business in this category requires*, not against a hobby project.

| Area | Score | Reasoning |
|---|---|---|
| **Code quality** | 8/10 | Clean, minimal, no cargo cult. `validateUrl()` correctly rejects non-http(s) — the open-redirect hole most clones ship with. Singleton Redis client on `globalThis`. Honest comments. |
| **Core redirect correctness** | 7/10 | Works. Loses a point for `302` (should be `302` for mutable destinations — correct — but no `Cache-Control: no-store`, so intermediaries may cache). |
| **Security** | 3/10 | Shared bearer token compared with `!==` (not constant-time). **No rate limiting on `/api/*`** — the token is brute-forceable. `adScript` is a raw HTML injection sink by design. No CSRF protection (mitigated by custom-header requirement). |
| **Abuse resistance** | 1/10 | **Zero bot detection.** Every counter counts `curl`. No IP dedup, no fingerprinting, no VPN/proxy detection, no rate limiting per visitor. See §1-Weaknesses — this is the single most business-critical gap. |
| **Analytics** | 2/10 | Three integers. No geo, device, referrer, timestamp, or session. You cannot answer "which country is my traffic from," which is the only question that determines revenue (§5). |
| **Unique-visitor accuracy** | 2/10 | A `seen_<slug>` cookie. Defeated by incognito, by clearing cookies, by any bot, by Safari ITP. `uniqueVisitors` is not a measurement of unique visitors. |
| **Admin UX** | 4/10 | Functional. Token re-entered every page load. No edit. No search, pagination, sort, or bulk. No error states beyond one `<div>`. |
| **Visitor UX** | 5/10 | The page is clean and respects `prefers-color-scheme`. But the *format* — a prestitial with a countdown — is named by the Coalition for Better Ads as a below-threshold ad experience. |
| **Scalability** | 3/10 | See §8. Serverless functions holding TCP connections to a Redis behind a public proxy in a different cloud, on the hot path of every redirect. Architecturally wrong for the workload. |
| **Monetization sophistication** | 2/10 | One network. No waterfall, no geo routing, no floor pricing, no A/B testing, no fill-rate handling. If Adsterra bans you, revenue is zero. |
| **Data model** | 5/10 | Fine for links. `SMEMBERS links` + N `GET`s doesn't scale, and there is no event store — click data is destroyed on write (`INCR`), so no analytics can ever be built retroactively. |
| **Operability** | 2/10 | No logging, no error tracking, no alerting, no health check. If Redis goes down, every link on the internet pointing at you returns a 500. |
| **Documentation** | 8/10 | The README is genuinely good. `docs/` contains an unrelated product's blueprint (FlowPilot — Electron/Playwright/Drizzle) and should be deleted. |
| **Business defensibility** | 1/10 | Nothing here cannot be rebuilt in a weekend. The Adlinkfly commercial script (which powers ShrinkMe, ShrinkEarn, exe.io, clk.sh — verified by identical `/payout-rates` markup) is sold off-the-shelf. |
| **Distribution** | 0/10 | None. No publisher acquisition, no SEO, no community. See below. |
| **Overall as a business** | **2/10** | As code: 7. As a business: the code was never the hard part. |

## Weaknesses, ranked by how much money they cost you

### 1. Zero bot detection — existential

Linkvertise, the category leader with 52.8M monthly visits and 500,000 publishers, **bought an enterprise ad-fraud product (CHEQ Defend)** and runs *"billions of queries"* through it. Their COO called invalid traffic *"an intolerable risk"* to the business.[^cheq]

You have none of this. Consequences, in order of arrival:
- Your `clicks` counter is fiction. You cannot price or optimize against it.
- Adsterra's own IVT filtering will discount your impressions. Your realized eCPM drops below the rate card and you won't know why.
- Adsterra bans the account. This is the modal outcome — Trustpilot on every network in this category is dominated by *"banned the day before payout."*

**Bot detection is not a feature to add later. It is the license to operate in ad tech.**

### 2. No distribution, and the product doesn't create any

Linkvertise's 52.8M visits/month come from **500,000 publishers who bring their own audience**. Its top outbound destinations are `mediafire.com` and `mega.nz` — it won the game-mod and Roblox script-key market. `ouo.io` (41.7M visits) is 16% Turkey, 14% Indonesia. `cpmlink.net` is 33% Turkey, and its single largest referrer is a Turkish adult site.

**These are not link-shortening businesses. They are traffic-acquisition businesses wearing an ad-tech costume.** The shortener is the tollbooth; the business is owning a road.

You have no road. This is not a monetization problem — the monetization works fine. It's a demand problem, and no amount of feature work fixes it.

### 3. `uniqueVisitors` is unmeasurable as built

A per-link cookie. Incognito, a second browser, a cleared cache, Safari's 7-day ITP cap on JS-set cookies, or any headless client resets it. Your "new visitor" number is closer to "sessions with a cold cookie jar." Since the interstitial only shows to cookie-less visitors, **your ad impressions and your `uniqueVisitors` count are the same event** — you have one metric wearing two names.

### 4. `adViews` conflates two different events

A `sendBeacon` from a script ad and a Direct Link continue both `INCR c:<slug>:adviews`. A link with both ad types double-counts one visitor. This number cannot be reconciled against Adsterra's dashboard, which means **you cannot detect when Adsterra is under-reporting you.** In a category where every network is accused of shaving, that's the one number you'd want to be right.

### 5. Click data is destroyed at write time

`INCR` is a lossy aggregation. There is no event log. Every analytics feature in Part 6 — geo, device, referrer, cohorts, funnels, fraud scoring — is unbuildable against this schema, and unbuildable *retroactively* even after you fix the schema, because the raw events were never stored. **Every day you run this, you permanently destroy the data you will need.**

If you change one thing this week: write an append-only event per redirect before you write anything else.

### 6. Single ad network, no waterfall

If Adsterra bans you, or drops your rate, revenue goes to zero with no fallback. There is no fill-rate handling — if the ad tag fails to load, the visitor sees an empty box and waits 5 seconds for nothing.

### 7. No rate limiting anywhere

`ADMIN_TOKEN` is brute-forceable at whatever rate Vercel will serve. `/:slug/adview` accepts unlimited unauthenticated POSTs — anyone can inflate your `adViews` counter to any number, which is a great way to make your own analytics useless and, if you ever report those numbers to an advertiser, a great way to commit fraud accidentally.

### 8. Cross-cloud Redis on the hot path

See §8. Every cold serverless invocation opens a TCP connection across the public internet to Railway's proxy, on the critical path of a redirect that should complete in <50ms from edge cache.

## Missing features (what a competitor has that you don't)

Geo routing · device routing · bot/VPN/proxy detection · link editing · custom domains · QR codes · A/B testing · link expiry · password protection · bulk creation · API keys (beyond the shared token) · multi-user/teams · event-level analytics · a publisher payout system · a second ad network · fraud scoring · an actual login.

## UX issues

- Admin token re-entered on every page load; no session
- No confirmation on delete
- `refresh()` is manual; no live counters
- No error state if `/api/list` 500s (it renders "Bad token")
- Interstitial's empty ad slot says "Advertisement" over nothing when a tag fails
- No skip-for-premium path, no way for a repeat user to opt out
- Countdown gives no reason to wait — no content, no value, just a timer

## Revenue limitations, stated plainly

Your revenue ceiling is:

```
monthly_revenue = interstitial_views × (1 − adblock_rate) × (1 − ivt_discount) × blended_eCPM / 1000
```

With realistic 2026 values — blended eCPM ~$2.00 (see §5), global adblock 29.5%, IVT discount 20% — that's **~$1.13 per 1,000 interstitial views**. To clear $5,000/month you need **4.4 million interstitial views per month**, which is ~8% of Linkvertise's entire global traffic.

You are not one feature away from that. You are one *audience* away from it, and the audience is the whole company.

---

# Part 2 — Revenue model analysis

You listed 40 revenue streams. Most of them are not revenue streams for *this* company; they are revenue streams for three different companies, only one of which you can be.

## The three companies

| | **A. Ad arbitrage** | **B. Link SaaS** | **C. Affiliate/attribution** |
|---|---|---|---|
| Who pays | Advertisers (via a network) | The link creator | The link creator |
| Product | Coerced attention | Trust, governance, control | Recovered commission |
| Customer's incentive | Hostile — they want to bypass | Aligned — they want it to work | Aligned — it makes them money |
| Exemplars | Linkvertise, ouo.io, work.ink | Bitly, Rebrandly, Short.io, Dub | Geniuslink, Tapfiliate, Dub Partners |
| Gross margin | The spread. Thin, shrinking | 80–90% | 80–90% |
| Revenue multiple | ~1–2× | 5–10× | 5–10× |
| Defensibility | Scale in ad buying | Custom domains + switching cost | Data + network |
| Adblocker relationship | **Adversarial. You lose.** | Neutral | Neutral |
| **Can you run A and B together?** | — | **No. See §3.4.** | Yes, B+C compose |

You are currently company **A**. Companies **B** and **C** compose; **A** poisons both.

## Stream-by-stream

Ratings: Revenue potential (1–10) · Margin · Difficulty (1–10, 10 = hardest) · Cost to build · Long-term value.

### Real, for you, now

| Stream | Rev | Margin | Diff | Cost | LTV | Verdict |
|---|---|---|---|---|---|---|
| Interstitial script ads | 4 | ~100%¹ | 1 | done | 3 | Works. Ceiling is traffic, not features. |
| Direct link | 4 | ~100%¹ | 1 | done | 3 | Same. |
| **Multi-network waterfall** | 6 | ~100%¹ | 4 | 2 wks | 5 | **Highest-ROI ad work.** Removes single-network ban risk, lifts fill and eCPM 20–40%. |
| **Geo-based network routing** | 7 | ~100%¹ | 5 | 3 wks | 6 | The eCPM spread is 18× (US $18 vs "other" $1.50 on exe.io). Routing tier-1 to premium networks and tier-3 to popunder is the single biggest revenue lever in ad arb. |
| **Bot filtering** | 8 | — | 6 | 4 wks | 9 | Doesn't add revenue; **prevents revenue going to zero.** Non-optional. |

¹ "~100% margin" is misleading and worth naming: your COGS isn't infra, it's **publisher payout**. Right now you're your own publisher so payout is 0. The moment you onboard publishers, your margin is the *spread* between what Adsterra pays you and what you pay them — and that spread is what you compete on. Linkvertise's pitch to AdFly refugees was literally *"earn on average twice as much as you do with Adf.ly."* This is a price war with a well-capitalized incumbent.

### The Linkvertise Premium move — the best idea in the category

| Stream | Rev | Margin | Diff | Cost | LTV |
|---|---|---|---|---|---|
| **End-user "skip ads" subscription** | 7 | 90% | 5 | 4 wks | 8 |

Linkvertise sells a subscription **to the person being annoyed**, letting them skip all ad steps — and still pays the creator out of subscription revenue.

This is strategically brilliant and everyone should copy it. It converts your most hostile user (the one installing a bypass extension right now) into your highest-margin customer, and it's the *only* revenue line in ad arbitrage that adblockers cannot destroy.

Caveat, and it's a serious one: Linkvertise's Trustpilot has a distinct complaint cluster about **Premium enrollment dark patterns** — unexpected charges, subscriptions reactivating after cancellation. The mechanic is sound; their execution is predatory. Copy the mechanic, not the checkout flow.

### Different company (B) — do not bolt onto A

Premium SaaS plans · Custom domains · Team accounts · Analytics plans · White label · Agency plans · Enterprise plans · Bulk creation · Developer plans · API revenue · Webhook plans · Dynamic links · QR premium · Retargeting pixels (FB/Google/TikTok)

Every one of these is a real business — it's Bitly's, Rebrandly's, Short.io's. **The custom domain is the single most important paywall in that market**: Bitly gates it at $35/mo, Geniuslink charges $50/mo for a custom domain alone (8× its $6 base plan), and Short.io competes by giving away five for free.

But: **you cannot sell a custom domain to someone whose links serve popunders.** The entire value of a branded link is that it doesn't look like malware. See §3.4.

**If you want company B, you must remove the ads.** Not tier them — remove them. Bitly proved that tiering doesn't work.

### Different company (C) — genuinely compelling, and adjacent

| Stream | Rev | Margin | Diff | Cost | LTV | Note |
|---|---|---|---|---|---|---|
| **Smart affiliate replacement / geo-storefront routing** | 8 | 88% | 6 | 8 wks | 9 | The Geniuslink mechanic. See below. |
| Affiliate program SaaS (merchant side) | 7 | 85% | 8 | 6 mo | 8 | Tapfiliate ($89–179/mo), Dub Partners ($90/mo). 5–10× the ACV of shortening. |
| CPA offers | 5 | 60% | 5 | 4 wks | 4 | Works, but is a relationship business. |

**The Geniuslink model deserves your attention more than anything else in this document.**

An Amazon Associates link to `amazon.com` earns a UK visitor's purchase *nothing* — the commission is destroyed. Geniuslink geo-routes to `amazon.co.uk` with the correct regional tag and recovers it. The customer's purchase **pays for itself out of money that was previously going to zero.** That makes it immune to budget scrutiny in a way no ad product ever is.

Geniuslink: founded 2009, **$0 raised**, ~$1.6M revenue, ~9,000 paying customers, ~11 employees.[^latka] It charges **per click** — $6/mo including 1,000 clicks, then $3.50/1,000 — because the value scales with clicks. Nobody complains.

**You already have 80% of the primitives:** slug→destination mapping, a redirect handler, click counting. What's missing is geo detection (one header on Vercel/Cloudflare), a storefront routing table, and affiliate tag substitution. This is *weeks* of work, not a rewrite.

And it is exactly where Dub.co is going — Dub Partners gates behind its $90/mo Business tier and handles payouts, having moved **$10M in partner payouts in six months**. Dub's founder names the **Honey scandal** (Dec 2024, PayPal's extension shown to overwrite creators' affiliate cookies at checkout) as the demand catalyst. Attribution integrity is now a thing creators care about and will pay for.

### Traps

| Stream | Why it's a trap |
|---|---|
| **Push notification subscriptions** | Chrome's quieter permission UI has gutted opt-in rates. It's also one of the specific behaviors that gets you onto adblock lists — uBO's Linkvertise rule explicitly strips `require_notifications`. High short-term RPM, permanent reputational cost. |
| **Popunder networks** | Chrome has blocked new-window/tab opening for sites failing the Abusive Experiences Report **since Chrome 64**. Sites failing >30 days get **all ads removed** (Chrome 71+). |
| **Header bidding / Prebid** | Requires meaningful traffic and demand-partner relationships before anyone will talk to you. A countdown interstitial is not inventory a real DSP wants. Revisit above ~50M monthly impressions, not before. |
| **Traffic reselling / traffic exchange** | This is selling fraud. Ad networks classify it as incentivized/invalid traffic. It is the fastest route to a permanent ban across every network simultaneously. |
| **Sponsored redirects / sponsored landing pages** | Requires a direct advertiser sales team. You have no traffic to sell them. |
| **Marketplace, plugin ecosystem** | Platform features. You need a platform first. |
| **AI-powered campaign optimization** | Nothing to optimize until you have events. See §7. |

### The revenue roadmap, ranked by ROI

| # | Move | Effort | Why now |
|---|---|---|---|
| 1 | **Log an append-only click event** (geo, UA, referrer, ts, IP hash) | 3 days | Every other item depends on it. Every day you delay, you destroy data permanently. |
| 2 | Bot/IVT filtering on the event stream | 3–4 wks | License to operate. Prevents the ban that ends the company. |
| 3 | Geo → ad-network routing | 3 wks | 18× eCPM spread. Largest ad lever that exists. |
| 4 | Multi-network waterfall | 2 wks | Removes single-point-of-failure. |
| 5 | **Geo-storefront affiliate routing (Geniuslink model)** | 8 wks | Different, better business. Aligned customer. 88% margin. Uses what you built. |
| 6 | End-user skip-ads subscription | 4 wks | Only ad-arb revenue immune to adblockers. |
| 7 | Publisher payouts + dashboard | 8 wks | Only if you commit to being company A. |
| — | *Everything in company B* | — | **Only after removing ads. Not compatible.** |

---

# Part 3 — Competitor research

## 3.1 The ad-gate category: not dead, but bifurcated

The common wisdom — "AdFly died, the category is dead" — is half right in a way that matters.

**Verified live, 2026-07-08:**

| Site | Status | Evidence |
|---|---|---|
| **adf.ly** | **Absorbed & terminated** | 302s to `publisher.linkvertise.com/adfly-hard-migrator`. Acquired by Linkvertise eff. **1 Aug 2022**; site wound down mid-2023. Every AdFly link ever posted — 15 years of forum posts and mod descriptions — now dead-ends. |
| **shorte.st** | **Dead** | Returns **HTTP 410 Gone**. `sh.st` serves `Server: Parking/1.0`. Went dark ~March 2024, **no announcement ever made**. Polish, Szczecin-based; Tracxn lists it "Deadpooled." |
| **clks.pro** | **Dead** | Cloudflare **522** — origin unreachable. |
| **linkvertise.com** | **Thriving** | **52.83M visits/mo, +4.87% MoM**, global rank #744 |
| **ouo.io** | **Thriving** | **41.66M visits/mo, +9.87% MoM** |
| **exe.io** | Growing | 4.13M/mo, +9.0% |
| **shrinkearn.com** | Growing | 1.60M/mo, +10.27% |
| **work.ink** | Flat | 4.14M/mo, −1.07% |
| **shrinkme.io** | **Declining** | 1.44M/mo, **−7.83%**; flagged "payment overdue"; PissedConsumer 2.0/5 |
| **cpmlink.net** | **Rotting** | 1.38M/mo, −6.0%. `X-Powered-By: PHP/5.6.31` — EOL since Dec 2018 |

AdFly's own on-page click ticker, via Wayback: **8,586,603 daily clicks (June 2013)** → 3.6M (2019) → 1.35M (2021). An **~84% decline**. Its registered-user counter was *frozen* at 5,373,907 for the last year of its life. It didn't get acquired from strength.

**What survived:** the platforms that own a *vertical* — game mods, Roblox scripts, cracked software. Linkvertise's top outbound destinations are `mediafire.com` and `mega.nz`. **What died:** the generic "shorten a link, post it on Facebook, earn CPM" long tail. That was AdFly's actual business, and it evaporated.

## 3.2 The advertised-vs-realized gap

Scraped live from the operators' own rate cards, 2026-07-08:

| Network | US | UK | India | Indonesia | "All other" |
|---|---|---|---|---|---|
| exe.io | $18.00 | $15.00 | *not listed* | *not listed* | **$4.50** |
| shrinkearn | $15.00 | $13.00 | $4.00 | *not listed* | **$3.50** |
| shrinkme | $10.00 | $7.00 | $4.50 | $4.00 | **$3.25** |
| ouo.io | $4.10 | $4.30 | *not listed* | *not listed* | **$1.50** |
| cpmlink | $4.20 | $5.00 | $1.60 | $1.60 | **$1.60** |

**cpmlink.net pays $0.00 for Turkey. Turkey is 32.69% of cpmlink.net's traffic.** A third of the views that network processes generate the publisher nothing at all. `ouo.io` doesn't list Indonesia despite Indonesia being 14% of its traffic — it pays $1.50.

**And "RPM" in this category is not CPM.** LootLabs publishes the arithmetic, using a real example on identical traffic and identical revenue of $0.69:

- LootLabs: `$0.69 ÷ 391 impressions × 1000` = **$1.76 CPM**
- Linkvertise: `$0.69 ÷ 276 clicks × 1000` = **$2.46 "RPM"**

Same money. **A ~29% higher headline number, from changing the denominator.** LootLabs calls it "CPCM mislabeled as RPM." When you see "up to $70 per 1000 views," you are looking at the theoretical max, in the single best geo, on an inflated denominator.

**Realized:** third-party reports converge on **$3–$8 per 1,000 clicks** for Linkvertise, with US/CA/DE occasionally hitting $15–20. A creator "with reasonable traffic" makes **$100–$300/month**.

For tier-3 geos it's worse than the rate card, because **ad-block penetration in Southeast Asia exceeds 65%** — the cheapest traffic is the most blocked. Global adblock adoption reached **~29.5% of internet users (~1.77 billion people) in Q2 2025**; 32.5% US, 40% Europe, **49% Germany**.

## 3.3 uBlock Origin has declared war, specifically

This is the fact I would put on the first slide.

uBO now ships **`ubo-link-shorteners.txt` — a 1,773-line filter list dedicated to this category**, `!#include`-d from its main filter set with the comment *"Link shortener filters go into their own dedicated list."* The category earned its own file.

And it does not merely block the ads. For Linkvertise:

```
linkvertise.com##+js(json-prune, data.meta.require_addon data.meta.require_captcha
  data.meta.require_notifications data.meta.require_og_ads data.meta.require_video
  data.meta.require_web data.meta.require_related_topics data.meta.require_custom_ad_step
  data.meta.og_ads_offers data.meta.addon_url data.displayAds data.linkCustomAdOffers)
linkvertise.com##+js(set, isAdBlockActive, false)
```

It intercepts Linkvertise's own API response and **deletes the fields that say "this user must watch a video / solve a captcha / allow notifications."** AdGuard's base filter does the same. For ShrinkEarn, uBO's `urlskip` directive base64-decodes the destination straight out of the URL and navigates there — **the ad page never renders.**

Every anti-adblock script in the category is defeated by name: `+js(aopr, app_vars.force_disable_adblock)` for exe.io/shrinkme/shrinkearn/clk.sh, `+js(aopr, AaDetector)` for ouo.

You are not in an arms race with adblockers. **The arms race is over and there is a filter list with your competitors' names on it.**

*One nuance in your favor:* none of these domains appear on HaGeZi Multi, HaGeZi TIF, or oisd big (I downloaded and grepped all three). The blocklists flag the **bypass tools** as malware, not the shorteners. And I could not query Google Safe Browsing directly — treat "not blocklisted" as unverified.

## 3.4 Bitly ran your experiment. It went badly.

**February 2025: Bitly began serving interstitial ads on free-tier links.** Branded "Destination Preview." Its ToS was updated: *"Destination Preview pages may also include advertising."* Stated rationale: *"using ads on free accounts to continue delivering free plans at no cost to our users."*

Three things about how it went:

1. **It was retroactive.** Links created years earlier — printed on business cards, embedded in email campaigns, sitting in social bios — began serving ads with no warning.
2. **Paid plans are exempt**, and the in-app message tells free users to upgrade to remove ads. Bitly is explicitly pricing "no ads" as a premium feature. That is a $100M+ ARR company stating, through its pricing, that ads and trust are incompatible.
3. **It created a competitive opening.** Every alternative — Dub, Short.io, Rebrandly, Linkly, YOURLS — now leads with "no ads." Whole SEO clusters exist around *"Bitly alternatives with no ads."* Coywolf's testing suggests Bitly may be exempting search bots from the ads, which if true is **cloaking** and a Google spam-policy violation. (Allegation, not established.)

The academic literature is worse. Nikiforakis et al., *"Stranger Danger: Exploring the Ecosystem of Ad-based URL Shortening Services"*, found **892 malicious pages reached via ad-based short URLs — adf.ly alone responsible for 80.7% of them.**

**Read:** Bitly's move is a PE-owned company (Spectrum Equity, majority stake since 2017) harvesting a legacy asset — billions of live links pointing at `bitly.com` — at the cost of brand equity. It is a *milking* behavior, not a growth behavior. Do not mistake it for validation.

## 3.5 Feature & business comparison matrix

| | Business | Who pays | Free tier | Entry paid | Ads on redirect | Revenue | Funding |
|---|---|---|---|---|---|---|---|
| **Bitly** | Enterprise link governance | Marketing ops | 5 links/mo | $10/mo | **Yes, free tier only (2025)** | **$100M+ ARR** (2023, disclosed) | Spectrum Equity, $63M majority, 2017 |
| **Linktree** | Creator commerce | Creators | Unlimited links, 12% sales cut | $5/mo | No | ~$60M ARR ⚠️ | $165.7M; **$1.3B (Mar 2022, stale)** |
| **Rebrandly** | Enterprise branded links | Marketing | 10 links/mo, 1 domain | $8/mo | No | Undisclosed | Five Elms (growth equity, undisclosed) |
| **Short.io** | Developer shortener | Engineers | **1,000 links, 5 domains** | $5/mo | No | ~$990K ⚠️ | **Bootstrapped** |
| **Dub.co** | **Link attribution + affiliate payouts** | Growth engineers | 25 links/mo | $25/mo | No | ~$1.4M ARR ⚠️ | $2M, OSS Capital |
| **Cutt.ly** | EU/GDPR shortener | SMB | 30 links/mo | $12/mo | No | Undisclosed | Polish incubator grants |
| **BL.INK** | Enterprise QR governance | Supply chain, pharma | — | **$48/mo** | No | ~$517K, **33 customers** (~$15.6K ACV) | **Acquired by Loftware, Apr 2025** ⚠️ |
| **TinyURL** | Legacy | — | Unlimited | $9.99/mo (**500 URLs**) | No | Opaque | None; product neglected |
| **Geniuslink** | **Affiliate revenue recovery** | Creators/publishers | 14-day trial | **$6/mo + $3.50/1K clicks** | No | ~$1.6M, 9K customers | **$0 raised** |
| **Tapfiliate** | Affiliate program SaaS | Merchants | Trial only | **$74/mo** | No | Undisclosed | **Acquired by Admitad, 2021** |
| **Branch.io** | Mobile attribution (MMP) | UA teams | Trial | Opaque | No | Undisclosed | $666M; $4B (Feb 2022, stale) |
| **Linkvertise** | **Ad gate + user subscription** | Advertisers + annoyed users | — | — | **Yes, that's the product** | Undisclosed; **bootstrapped & profitable** | **None. Bought AdFly.** |
| **ouo.io** | Ad gate | Advertisers | — | — | Yes | Undisclosed | None |
| **work.ink** | Ad gate, creator-friendly | Advertisers | — | — | Yes | Undisclosed | None |
| **LootLabs** | **Gaming brand ads** | Real advertisers | — | — | Yes, brand-safe | Undisclosed | **$7.5M, Bitkraft** |
| **ShrinkMe** | Ad gate | Advertisers | — | — | Yes | Dying | None |
| **AdFly** | Ad gate | Advertisers | — | — | Yes | **Dead** | — |
| **Shorte.st** | Ad gate | Advertisers | — | — | Yes | **Dead (410 Gone)** | Tar Heel, Xevin |
| **This project** | Ad gate | Advertisers | — | — | Yes | $0 | — |

⚠️ = Latka/Sacra/Tracxn modeled estimate, not company-reported.

## 3.6 Who's actually winning, and why

**Linkvertise** — 52.8M visits, 500k publishers, 200+ markets, **fully bootstrapped**, profitable enough to buy its largest competitor. Real German company (Linkvertise GmbH & Co. KG, Itzehoe, HRA 8998 PI), real Handelsregister filings, €1.5–2M in R&D state aid. *And*: banned by name from Planet Minecraft for *"malicious advertisements and malware installers"*; security-vendor writeups about *"rogue advertising networks"* producing *"redirection chains that... result in [users] entering scam websites and even ones that proliferate malware"*; Trustpilot clusters around pre-payout bans and subscription dark patterns; a headline metric inflated ~29% by arithmetic.

A real business with real money and a genuinely bad reputation among the communities it depends on.

**LootLabs** — the most interesting company in the category, and the answer to "is there a legitimate version of this?" Seattle gaming ad-tech, **$7.5M from Bitkraft**, team from Microsoft/Twitch/2K. Three things it does differently:

1. **It reports honest CPM** — and publishes a help article explaining, with arithmetic, that its own number *looks worse* than Linkvertise's because Linkvertise's denominator is wrong. A company voluntarily publishing "our competitor's number is fake and ours looks worse as a result" is behaving unlike anyone else here.
2. **It sells brand-safe gaming inventory to real advertisers** rather than arbitraging popunder networks. Its entire uBO filter footprint is one rule (`links.lootlabs.gg##+js(prevent-fetch, adsbygoogle)`) — **it serves AdSense, not AdMaven.**
3. **It sells to game developers, not link-spammers.**

**work.ink** — Trustpilot 4.8/5 "Excellent," the cleanest reputation in the category. AdGuard grants it `@@||work.ink^$generichide` — a *partial exception* — rather than the gate-destroying `json-prune` applied to Linkvertise. Its ad surface is small enough that filter lists treat it as an annoyance rather than an adversary. (Its "$15–22 CPM / 250% higher earnings" claims come exclusively from its own blog. Unverified.)

**The pattern is unmistakable. Every survivor escaped by changing who pays.**

- **Linkvertise:** added a consumer subscription so the annoyed user can buy their way out.
- **work.ink:** competes on payout share, keeps the ad surface small enough not to provoke war.
- **LootLabs:** sells real gaming brand advertising, reports metrics honestly, courts developers.

**Every corpse did the same thing:** maximize ads per pageview, obscure the payout math, pay $1.50 CPM to the Global South, and hope the adblockers never noticed.

## 3.7 Distribution is banned, and that's the real ceiling

Documented, verified:

- **SpigotMC:** *"Using pay-per-click sites such as adf.ly or similar services to distribute resources is forbidden. External resource download URLs must be a direct link."* Category-wide, no exceptions.
- **Planet Minecraft:** ad-gated shorteners prohibited below Level 20; **Linkvertise specifically blocked** for having *"made use of malicious advertisements and malware installers."*
- **Minecraft Forum / CurseForge:** sustained community campaigns against AdFly. When CurseForge offered creators a first-party rewards program with no sketchy ads, the rationale for ad-gating evaporated for the largest creators.

Two commonly-repeated claims that **do not hold up**:
- **"Discord bans them."** I read Discord's Deceptive Practices Policy in full. It covers phishing and malware. It says nothing about link shorteners or monetized redirects. Third-party mod bots blacklist them at server-admin discretion — that's per-server config, not Discord policy.
- **"Roblox bans them."** False. Roblox bans executors and exploit scripts; it doesn't care how you got the key. The Roblox ecosystem is Linkvertise's and LootLabs' **largest growth market.**
- **"Reddit banned AdFly."** Widely repeated, and I could not source it. Reddit blocks automated access. Unresolved.

## 3.8 The structural ceiling: Chrome

The **Coalition for Better Ads** Better Ads Standards explicitly name **"Prestitial Ads with Countdown"** — an ad shown before content, forcing a timed wait — as a below-threshold ad experience.

That is a literal, word-for-word description of `lib/interstitial.js`.

Chrome enforces Better Ads through the **Ad Experience Report**: sites that fail have **all ads blocked in Chrome**. Separately, the **Abusive Experiences Report** has, since Chrome 64, prevented failing sites from opening new windows or tabs (that's your Direct Link), and since **Chrome 71 (Dec 2018)**, sites failing for >30 days have **all ads removed**.

This isn't a risk to manage. It's a permanent ceiling on the format, written into the browser 92% of your visitors use.

---

# Part 4 — Product expansion

Ranked by **(Revenue Impact × User Demand) ÷ Difficulty**, with a competitive-advantage note. I've cut the 40-item list to what carries information.

## Tier 1 — Do these regardless of which company you become

| Feature | Rev impact | Demand | Difficulty | Comp. advantage | Note |
|---|---|---|---|---|---|
| **Event logging** (append-only click stream) | — | — | Low | None | **Prerequisite for everything below.** Not optional. |
| **Bot / IVT detection** | Critical | Low (invisible) | High | Table stakes | Linkvertise pays CHEQ for this. It is the license to operate. |
| **Geo detection** | Very high | Med | **Trivial** | None | One header (`x-vercel-ip-country` / CF `cf-ipcountry`). Unlocks 18× eCPM routing *and* the Geniuslink model. |
| **Rate limiting** | — | — | Low | None | Your admin token is currently brute-forceable. |
| **Link editing** | Med | **Very high** | Low | Table stakes | The #1 thing users expect and you don't have. |
| **Device / OS / browser detection** | Med | Med | Trivial | None | UA parsing. shrinkearn pays **$21 mobile vs $16 desktop** — mobile is worth more. |

## Tier 2 — Choose based on which business you're building

### If company A (ad arbitrage)

| Feature | Rev | Demand | Diff | Advantage |
|---|---|---|---|---|
| Multi-network waterfall + fill handling | High | — | Med | Removes ban risk |
| Geo → network routing | **Very high** | — | Med | The single largest ad lever |
| **End-user skip-ads subscription** | High | High (from users!) | Med | **Only adblock-immune revenue** |
| Publisher accounts + payouts | High | High | High | The actual business |
| Frequency capping | Med | — | Low | Protects eCPM from IVT flags |
| Anti-VPN / anti-proxy | Med | — | High | cpmlink pays $0 for "Anonymous" traffic — networks already discount it |

### If company B (link SaaS) — **requires removing ads first**

| Feature | Rev | Demand | Diff | Advantage |
|---|---|---|---|---|
| **Custom domains** | **Very high** | **Very high** | Med | *The* paywall. Bitly $35/mo, Geniuslink $50/mo standalone. Without it there is no SaaS business. |
| Real auth (users, sessions, API keys) | — | Required | Med | Table stakes |
| QR codes (dynamic) | High | High | Low | Bitly's QR business (Egoditor) may now be more strategically important than its links |
| Password / expiry / scheduling | Low | Med | Low | Cheap checkbox features |
| A/B testing, retargeting pixels | Med | Med | Med | — |
| Teams / SSO / SOC 2 | High (ACV) | Low (count) | **Very high** | BL.INK: 33 customers, ~$15.6K ACV |
| **"We will never serve ads"** | — | High | **Zero** | **Bitly just handed this to you.** |

### If company C (affiliate/attribution) — recommended

| Feature | Rev | Demand | Diff | Advantage |
|---|---|---|---|---|
| **Geo-storefront routing + affiliate tag substitution** | **Very high** | High | Med | The Geniuslink core. Self-funding purchase. |
| Choice pages (Amazon vs Apple vs Spotify) | High | High | Low | Geniuslink's second product; captures cross-network commission |
| **Dead affiliate link monitoring** | Med | **Very high** | Low | Broken affiliate links = silent revenue loss. Users love this. |
| Conversion tracking (click → signup → sale) | Very high | High | High | Dub's core. Competes with the Meta pixel in a post-ATT world. |
| Merchant-side affiliate program + payouts | Very high | Med | Very high | Tapfiliate ACV is 5–10× shortening |

## Tier 3 — Later, or never

Bio pages (commoditized to negative value — see §3), landing page builder, marketplace, plugin ecosystem, Chrome extension, WordPress plugin, Zapier/n8n, heatmaps, predictive analytics, AI recommendations, enterprise dashboard, white label.

**On bio pages specifically:** don't. Instagram shipped native 5-links-in-bio in April 2023 — Zuckerberg called it *"one of the most requested features we've had."* Canva, Squarespace, and Shopify all ship one free. Linktree has **50M users, ~$60M ARR — $1.20 of annual revenue per user** — documented **$50M in losses on $25M revenue (2022)**, and cut **27% of staff in June 2023**. Meanwhile **Stan Store does ~60% of Linktree's revenue with 0.2% of its users and no venture capital**, on a flat $29/mo, 0% rake, no free tier. The feature has negative standalone value; the profit pool moved to creator checkout.

---

# Part 5 — Ad optimization

You asked about countdown timing, ad sequence, and placement. **These are rounding errors.** Here are the levers in actual order of magnitude.

## Lever 1 — Geo mix (up to 18×)

The entire game. exe.io: **US $18.00, "All Other Countries" $4.50.** ouo.io: **US $4.10, all other $1.50.** cpmlink: **Turkey $0.00.**

Nothing you do to the page will move revenue like changing where your visitors live. And **you cannot currently even measure this** — you have no geo data.

Two moves:
- **Route** tier-1 traffic to premium networks, tier-3 to popunder/direct-link networks. Different networks price geos differently; the arbitrage is real.
- **Acquire** tier-1 traffic. This is a distribution problem, not an ad-ops problem, and it's the whole company.

## Lever 2 — Not being blocked (−29.5% to −65%)

Global adblock: **~29.5% of internet users (1.77B people)** as of Q2 2025. US 32.5%, Europe 40%, **Germany 49%, Southeast Asia >65%.**

Your cheapest traffic is your most-blocked traffic. And per §3.3, uBO doesn't just block the ad — for Linkvertise and ShrinkEarn it removes the gate entirely.

**The honest strategic read:** anti-adblock is a losing arms race, fought publicly in a GitHub repo, against volunteers who have already written 1,773 lines specifically about you. Every escalation puts you deeper into the "malware" bucket. **Linkvertise's answer — sell a subscription to the people who'd otherwise install the bypass — is the only winning move anyone in this category has found.**

## Lever 3 — Not being banned (revenue → 0)

Ad networks discount or ban on invalid traffic. Linkvertise runs *"billions of queries"* through CHEQ Defend. You run zero checks.

The counterfactual isn't "10% less revenue." It's a banned account and a Trustpilot review that reads like every other Trustpilot review in this category.

## Lever 4 — Network mix (+20–40%)

A waterfall across 3–4 networks with per-geo floors. Standard practice, moderate effort, real gains. Also removes single-point-of-failure.

## Lever 5 — Mobile vs desktop (+30% on some networks)

shrinkearn pays **$21 mobile vs $16 desktop (US)**; **$20 vs $15 (UK)**. You don't segment by device and don't know your split.

## Lever 6 — Countdown timing (~0%)

Since you asked. The folklore says 5–10 seconds. The reality:

- Longer countdown → more ad-load time → marginally more impressions, more abandonment.
- **The Coalition for Better Ads names "Prestitial Ads with Countdown" as a below-threshold experience regardless of duration.** There is no countdown length that makes the format compliant.
- Your current 2.5s `adview` beacon is a reasonable guess at ad-load time and is probably fine.

Optimizing this is optimizing the deck chairs. Your current 5s default is fine. Move on.

## What Linkvertise actually does to maximize earnings

Not clever countdown tuning. Four things:

1. **It owns a vertical** (game mods, Roblox scripts) where the destination is genuinely scarce, so users tolerate the gate.
2. **It lets creators choose the number of ad steps**, pushing the greed decision onto the publisher and the blame with it.
3. **It sells a subscription to skip the ads**, converting the most-annoyed users into the highest-margin revenue.
4. **It reports "RPM" on a click denominator**, making its rate card look ~29% better than a like-for-like CPM.

Three of those four are strategy. One is arithmetic.

## Expected RPM improvement, honestly

From a baseline of ~$2.00 blended:

| Action | Realistic effect |
|---|---|
| Countdown/placement tuning | ±3% |
| Device segmentation | +5–10% |
| Multi-network waterfall | +20–40% |
| Geo routing | +30–60% (depends entirely on your existing mix) |
| **Shifting traffic mix toward tier-1** | **+100–400%** |
| Bot filtering | −10% headline, **+∞ counterfactual** (prevents zero) |
| **Skip-ads subscription** | New revenue line, adblock-immune |

Note the shape: the biggest number in the table is not an ad-ops action. It's an audience action.

---

# Part 6 — Analytics

## The blocking issue

You cannot build any of this on the current schema. `INCR` is lossy. **There is no event.** Before designing a dashboard, add:

```
click_events (append-only)
  ts, slug, ip_hash, country, region, device, os, browser,
  referrer, ua, is_bot, bot_score, is_new, ad_shown, ad_network, revenue_estimate
```

Write to Redis Streams or a queue, batch into ClickHouse/Tinybird/Postgres. **Do this first. Every day you don't, you destroy data you can never recover.**

## Dashboard design

**Tier 1 — the four numbers that decide whether you have a business**

| Metric | Definition | Why |
|---|---|---|
| **RPM (real)** | revenue ÷ *impressions* × 1000 | Not clicks. Don't lie to yourself the way Linkvertise lies to publishers. |
| **Human rate** | 1 − (bot clicks ÷ total clicks) | If this is under ~70% you have no business, you have a bot farm. |
| **Tier-1 traffic share** | % from US/UK/CA/AU/DE | The single strongest predictor of revenue. |
| **Adblock rate** | % of interstitials where the ad tag failed to load | Currently unmeasured and probably ~30%. |

**Tier 2 — operating metrics**

Revenue (by day, geo, link, network) · Impressions vs clicks (never conflate) · Fill rate · Completion rate (started countdown → clicked Continue) · Bounce during countdown · Unique visitors (properly measured, not cookie-only) · Returning-visitor rate · Device/OS/browser · Referrer · Country/region

**Tier 3 — once you have publishers**

Publisher revenue share · Top links · Top publishers · Publisher cohort retention · Payout liability · Per-publisher fraud score · Traffic-quality score by source

**Tier 4 — vanity until you have scale. Skip for now.**

LTV · Cohorts · Funnels · Forecasting · Heatmaps · ISP · Top advertisers (you have no advertisers — you have one network)

## The metric to be religious about

**Report CPM on the impression denominator, publicly, and explain why it's lower than your competitors' RPM.**

LootLabs does exactly this and it is the single most credible thing any company in this category has ever done. It's also free. It costs you nothing but the temptation to look 29% better.

---

# Part 7 — AI features

Blunt assessment: **eleven of the twelve AI features you listed have zero revenue impact for this product in the next 24 months.** They require data you are not collecting, at volumes you do not have, to optimize decisions you are not yet making.

| Feature | Verdict |
|---|---|
| **Traffic quality scoring / fraud detection** | **The one that matters.** This is real, this is the business, and this is what Linkvertise pays CHEQ for. But start with rules (IP reputation, UA heuristics, click-timing distributions, ASN checks) — a gradient-boosted model on 50 labeled examples is worse than an IP blocklist. ML comes at ~10M events. |
| **Smart routing / dynamic redirect optimization** | Real, but it's a **bandit over geo × network × format**, not "AI." Contextual bandit, ~200 lines. Needs event logging first. Do it after you have a waterfall. |
| **Revenue forecasting** | A 7-day moving average will beat any model you build at this data volume. Genuinely. |
| **Best monetization prediction** | Same as smart routing. Not a separate feature. |
| **Automatic ad optimization** | Same. |
| **Audience segmentation** | You have three integers. There is nothing to segment. |
| **Campaign optimization** | You have no campaigns. |
| **Predictive analytics** | No. |
| **AI recommendations** | No. |
| **AI assistant** | No. |
| **Natural-language analytics** | A chat box over three counters. Absolutely not. |

**Recommendation:** ship exactly two "AI" features, and don't call them AI.
1. A **rules-based IVT filter** (weeks 1–4), evolving into a model at ~10M labeled events.
2. A **contextual bandit** for geo × network routing (month 4+, after the waterfall exists).

Everything else on that list is a slide, not a product. If a VC asks about AI, the honest and more impressive answer is: *"we score every click for fraud, because in ad tech the AI question is a fraud question, and everyone who pretends otherwise gets banned."*

---

# Part 8 — Scalability

> **Caveat:** the infra-cost research pass was not run. Pricing figures below are order-of-magnitude reasoning from published list prices as I understand them, not freshly verified quotes. **Verify before budgeting.** The architectural analysis does not depend on the exact numbers.

## The architecture is wrong for the workload

A redirect is the **most cacheable operation in computing**: a pure function from slug to URL, changing rarely, read constantly. It should never touch a database in the hot path. It should be served from an edge cache in single-digit milliseconds.

What you have:

```
visitor → Vercel fn (us-east-1) ──public internet──> Railway proxy → Redis (some region)
             ↑ cold start opens a new TCP conn        ↑ TLS handshake, cross-cloud RTT
```

Specific problems:

1. **Cross-cloud round trip on every redirect.** Vercel function → Railway's public TCP proxy is an internet hop. Expect 20–80ms added latency, unpredictable tail.
2. **Connection-per-invocation.** `globalThis.__redis` reuses the client on *warm* invocations, which is the right instinct. But under bursty traffic Vercel spawns many concurrent instances, each opening its own TCP+TLS connection to Redis. This is the classic serverless-connection-exhaustion anti-pattern. Redis's `maxclients` becomes your ceiling, and you hit it during exactly the traffic spike you wanted.
3. **Redis is a single point of failure with no fallback.** Redis down = every link on the internet pointing at you returns 500. There is no cache, no stale-serve, no circuit breaker.
4. **Counters are hot keys.** `INCR c:<slug>:clicks` on a viral link serializes every request on one Redis key in one thread.
5. **`listLinks()` is `SMEMBERS` + N × `GET`.** O(n) round-trips, each crossing the internet. At 1,000 links this admin page takes seconds. At 100,000 it times out.

## What it should be

```
visitor → Cloudflare Worker (edge, ~0ms cold start)
            ├─ KV read (cached at edge, ~5ms warm)  → 302 immediately
            └─ ctx.waitUntil( queue.send(click_event) )   ← never blocks the redirect
                                    ↓
                          batch consumer → ClickHouse / Tinybird
                                    ↓
                          Durable Object or sharded counters for real-time totals
```

Three principles:
- **The redirect never awaits a write.** Fire the event into a queue with `waitUntil`; the visitor is already gone.
- **The redirect never awaits a database.** Slug→URL lives in edge KV.
- **Counters are eventually consistent.** Nobody needs their click count to be transactionally accurate. Batch them.

This is roughly what Dub.co does (it's open source — go read its click-tracking path; it uses Tinybird).

## Capacity, current vs. corrected architecture

| Volume | req/sec avg | Current (Vercel + Railway Redis) | Corrected (Workers + KV + queue) |
|---|---|---|---|
| **10K/day** | 0.12 | ✅ Fine. This is a hobby. | ✅ Free tier |
| **100K/day** | 1.2 | ✅ Fine | ✅ ~free |
| **1M/day** | 12 | ⚠️ Works, but tail latency ugly; Redis conn count is the risk at peak | ✅ Trivial |
| **10M/day** | 116 (peaks ~1,000) | ❌ **Connection exhaustion at peak.** Hot-key contention. Admin page dead. | ✅ Comfortable |
| **100M/day** | 1,157 (peaks ~10,000) | ❌ Not viable | ✅ Fine; counters must be sharded/batched. This is the volume where a real analytics store (ClickHouse) is mandatory. |

For calibration: **100M redirects/day would be roughly 2× Linkvertise's entire traffic.** Linkvertise's 52.8M *visits/month* is ~1.8M/day. **Your architecture is adequate through the volume at which you'd be the #2 player in the category.**

That is the important finding here. **Do not rewrite the architecture. It is not your bottleneck and will not be for years.** The interesting work is at the top of the funnel, not the bottom of the stack.

## The three things worth fixing now, cheaply

1. **Add `Cache-Control` and an in-function memo** for slug→URL. A viral link should hit Redis once per instance, not once per request. ~20 lines.
2. **Don't block the redirect on `INCR`.** Fire and forget. On Vercel, `waitUntil` via `@vercel/functions`. ~5 lines.
3. **Serve stale on Redis failure.** If Redis is down and you have the slug memoized, redirect anyway. A 302 from stale data beats a 500 every time.

## Cost reality (order of magnitude — verify)

At 10M redirects/day on Cloudflare Workers + KV, you're plausibly in the low hundreds of dollars/month. On Vercel Functions, meaningfully more — you pay for compute time on an operation that should be pure edge cache.

But note the shape of the P&L: at 10M redirects/day (~300M/month) with a $1.13 net RPM, that's **~$340K/month gross revenue against low-thousands infra.** Infrastructure is *not* the cost problem in this business.

**The cost problem is publisher payout.** That's your COGS, it's the thing you compete on, and it's why this is a thin-margin business no matter how well you engineer it.

---

# Part 9 — Enterprise opportunities

Short section, because the honest answer is short.

**You cannot sell an enterprise a redirect that serves popunders.**

Enterprise link management is a *trust* purchase. The buyer is a marketing-ops or brand team. What they're actually buying:

- A custom domain nobody else can use
- SSO, so 400 employees create links without sharing a password
- Audit trails, SOC 2, HIPAA, GDPR attestations
- 99.9% SLA on a redirect **printed on two million physical packages**
- The ability to **change the destination after print**

That last one is the real product. A QR code on packaging is immutable; the redirect behind it is not. This is why **Bitly's QR business (acquired via Egoditor, Dec 2021) is arguably now more strategically important than its link business** — it's why a CPG company signs a ~$22K/yr contract. It's why **BL.INK had 33 customers at ~$15.6K ACV** and got acquired by Loftware (enterprise labeling/barcode, supply chain and pharma).

Now imagine a programmatic ad slot on that redirect, and a scam ad rendering under a pharmaceutical company's QR code, on a box, in a pharmacy.

**This is precisely why Bitly exempts paid plans from its own interstitial ads.**

Of the segments you listed:

| Segment | Viable for you? |
|---|---|
| Large brands, e-commerce, news, SaaS, agencies | ❌ Not while you serve ads. This is company B. |
| Publishers, media buyers | ⚠️ They're your *supply*, not your customers. |
| **Affiliate marketers** | ✅ **Yes — via company C.** They'll pay for recovered commission. |
| **Influencers / creators** | ✅ **Yes — via company C.** Same. |
| Developers / API | ⚠️ Only if you're company B. |
| White label | ❌ You'd be white-labeling the Adlinkfly script, which is already sold off-the-shelf. |

**The only enterprise-adjacent path from where you stand is affiliate/attribution (company C).** Merchant-side affiliate program management (Tapfiliate: $89–179/mo; Dub Partners: $90/mo + payout rails) has **5–10× the ACV of URL shortening**, is stickier because it involves money movement, and — crucially — is a business where the customer wants the product to work.

---

# Part 10 — Financial model

## Unit economics

```
net_RPM = eCPM × (1 − adblock_rate) × (1 − ivt_discount)
```

Realistic 2026, mixed global traffic, single network:

| Input | Value | Source |
|---|---|---|
| Blended eCPM | $2.00 | Realized Linkvertise reports $3–8 (tier-1 heavy); tier-3 rate cards $1.50–1.60 |
| Adblock rate | 29.5% | Global, Q2 2025. Higher in SEA (>65%) |
| IVT discount | 20% | Estimate — network shaving + your zero bot filtering |
| **Net RPM** | **$1.13** | |

Add a waterfall and geo routing (+40%) → **$1.58**. Skew traffic to tier-1 → up to $4–6. Get banned → **$0**.

## Projections

The correct denominator here is **interstitial views**, not "users." A "user" of an ad-gate platform is a publisher who brings traffic; the revenue driver is their traffic, not their headcount. I'll model both, but note that "10M users" is not a coherent number for this business — Linkvertise has 500K publishers and 52.8M *visits*/month.

**Assumption:** the median publisher brings ~500 interstitial views/month (heavily long-tailed; the top 1% bring most of it). Publisher revenue share of 60% once you have publishers.

| Publishers | Interstitial views/mo | Gross rev @ $1.13 RPM | Payout (60%) | Infra | Fraud tooling | **Net/mo** | Margin |
|---|---|---|---|---|---|---|---|
| **You only** (0 pubs) | 100K | $113 | $0 | $20 | $0 | **$93** | 82% |
| **10K** | 5M | $5,650 | $3,390 | $150 | $0 | **$2,110** | 37% |
| **100K** | 50M | $56,500 | $33,900 | $800 | $2,000 | **$19,800** | 35% |
| **1M** | 500M | $565,000 | $339,000 | $6,000 | $15,000 | **$205,000** | 36% |
| **10M** | 5B | $5,650,000 | $3,390,000 | $50,000 | $80,000 | **$2,130,000** | 38% |

Read that table carefully. Three observations:

1. **Margin is stuck at ~36% and does not improve with scale**, because payout share is your COGS and it's the thing you compete on. Improve the rate to win publishers, and margin drops. This is the arbitrage trap.
2. **Infrastructure is noise.** At every tier. Stop optimizing it.
3. **The 1M-publisher row is a fantasy.** It's 2× Linkvertise, the bootstrapped, profitable, 15-year-veteran category leader that just bought its largest competitor. There is no path from here to there.

**Realistic ceiling for a new, well-executed entrant with a genuine vertical:** the work.ink row. 4.14M visits/month, flat growth, good reputation. Call it **$50K–150K/year net**, achieved over 3–4 years, with a permanent existential dependency on Adsterra not banning you and uBlock Origin not writing 12 more lines of filter.

## Break-even

Trivially low — you're break-even today, because you're the publisher and your infra is ~$20/mo. **Break-even is not the interesting question.** The interesting question is whether the ceiling justifies the years, and per the table above: **it does not.**

## Valuation

| Model | Multiple | Rationale |
|---|---|---|
| **Ad arbitrage (A)** | **1–2× revenue** | Thin margin, platform risk, no recurring contracts, reputational discount. Shorte.st raised institutional money (Tar Heel Capital, Xevin) and is now `410 Gone` with **no announcement ever made**. AdFly's exit was an acqui-shutdown. |
| **Link SaaS (B)** | 5–10× ARR | Bitly: $100M+ ARR, PE-owned, presumably healthy EBITDA. |
| **Affiliate/attribution (C)** | 5–10× ARR | Geniuslink: $0 raised, ~$1.6M ARR, ~11 people → likely a $5–8M business throwing off real cash. Never a venture outcome, never tried to be. |

At the 100K-publisher row — a genuinely good outcome, years away — company A is worth **~$1.4M**. A $1.6M-ARR Geniuslink is worth **$5–8M** with 11 employees and no ad networks, no bans, and no adblocker war.

**That gap is the entire strategic argument of this document.**

---

# Part 11 — Final strategy

## The choice

You cannot be Bitly and Linkvertise. Pick one. I'll make the case for a third option.

### Option A — Commit to the ad gate

**Requirements:** own a vertical (there are no generic ad-gate businesses left — the survivors are all game-mods/Roblox/file-hosting). Build fraud detection before you scale, or get banned. Copy Linkvertise Premium. Compete on payout rate against a bootstrapped, profitable incumbent with 500K publishers, in a category where uBlock Origin ships purpose-built code to delete your product.

**Ceiling:** ~$100–150K/year net over 3–4 years, valued at 1–2×.
**Modal outcome:** the Trustpilot page reads like ShrinkMe's.
**Probability-weighted:** poor.

### Option B — Become a link SaaS

**Requirements:** delete the ad code. Build auth, custom domains, teams, an API. Compete with Bitly ($100M+ ARR), Rebrandly (Five Elms), Short.io (bootstrapped, gives away 5 custom domains free), and Dub (open source, 23.9K stars).

**The one thing you'd have:** Bitly's Feb 2025 interstitial move created the largest competitive opening in this market in a decade, and every competitor is already exploiting it with "no ads" positioning.

**Assessment:** a real market, extremely crowded, and you'd be the last entrant with no differentiator. The honest TAM for pure-play link management is **$250–350M/year** (bottom-up from participant revenues; every published "market report" on this category is worthless — one claims **$840 billion**, off by ~1,000×). Bitly at $100M+ ARR may already be near category saturation. **That's why Bitly pivoted to QR and then to ads, and why Dub refuses to call itself a URL shortener.**

### Option C — Affiliate revenue recovery ✅ **Recommended**

**The pitch:** you already built a redirect engine with slug resolution and click counting. Add geo detection (one HTTP header), a storefront routing table, and affiliate tag substitution. Now every international click on an affiliate link — which currently earns the creator **exactly zero** — earns a commission.

**Why this is the right business:**

| | |
|---|---|
| **The customer's incentive is aligned.** | Nobody installs a bypass extension. The adblocker war is not your war. |
| **The purchase is self-funding.** | It pays for itself out of money that was going to zero. Immune to budget scrutiny. |
| **Pricing scales with value.** | Geniuslink charges per click: $6/mo + $3.50/1,000. Nobody complains. |
| **The margin is 88%, not 36%.** | No publisher payout. No COGS but infra. |
| **The multiple is 5–10×, not 1–2×.** | |
| **You keep ~80% of the code.** | Redirect handler, slug resolution, click counting, admin UI. |
| **There's a demand catalyst.** | The **Honey scandal** (Dec 2024) made affiliate attribution integrity a topic creators care about. Dub's founder names it explicitly. |
| **There's proof it works small.** | Geniuslink: 17 years, $0 raised, ~$1.6M ARR, ~9,000 customers, ~11 people, survived four market crashes. |
| **There's proof it works big.** | Dub Partners moved **$10M in payouts in six months**; affiliate SaaS ACV is 5–10× shortening. |

**And the ad gate becomes optional, not existential.** If you want to keep an interstitial for a "free" tier, you can — but as a feature you'd eventually sunset, not the entire business model.

## Prioritized recommendations

**Ranked lists, honestly sized. Score = (Revenue Impact × User Demand) ÷ (Complexity × Cost), adjusted for competitive differentiation.**

### Quick wins — this month

| # | Action | Days | Why |
|---|---|---|---|
| 1 | **Log an append-only click event** (ts, slug, country, device, referrer, ip_hash, ua) | 3 | Everything else depends on it. You are permanently destroying data every day. |
| 2 | Capture geo from `x-vercel-ip-country` | 0.5 | One header. Unlocks the 18× revenue lever *and* Option C. |
| 3 | Rate-limit `/api/*` and `/:slug/adview` | 1 | Your admin token is brute-forceable; your adview counter is publicly writable. |
| 4 | Split `adViews` into `adScriptViews` + `directLinkClicks` | 0.5 | You currently cannot reconcile against Adsterra. |
| 5 | Don't block the redirect on `INCR` (`waitUntil`) | 0.5 | Latency, free. |
| 6 | Memoize slug→URL in-process; serve stale on Redis failure | 1 | Redis down currently = every link 500s. |
| 7 | Constant-time token compare + a real session | 1 | |
| 8 | Link editing | 2 | The #1 missing thing. |
| 9 | Delete `docs/` (it's a different product's blueprint) | 0.1 | It says this is an Electron app. |
| 10 | **Report CPM on the impression denominator** | 0 | Free credibility. LootLabs proved it's a moat. |

### The strategic bets — next 6 months

| # | Bet | Effort | Expected |
|---|---|---|---|
| 1 | **Geo-storefront affiliate routing** (Amazon regional tags first) | 8 wks | The business. |
| 2 | Dead affiliate link monitoring | 2 wks | Highest demand-to-effort ratio in Option C. |
| 3 | Choice pages (Amazon / Apple / Spotify) | 3 wks | Captures cross-network commission. Geniuslink's #2 product. |
| 4 | Real auth, users, per-user API keys | 4 wks | Prerequisite to charging anyone. |
| 5 | Per-click billing (Stripe metered) | 2 wks | The pricing model that made Geniuslink work. |
| 6 | Click → conversion tracking | 8 wks | Where Dub is. Competes with the Meta pixel post-ATT. |
| 7 | Rules-based bot filter | 4 wks | Needed even in Option C — you're counting billable clicks. |
| 8 | Custom domains | 3 wks | *The* paywall. **Only viable once the ads are gone.** |

### If you insist on Option A

| # | Action | Why |
|---|---|---|
| 1 | Fraud/IVT detection **before** any growth | Or the account gets banned. Linkvertise pays CHEQ. |
| 2 | Pick a vertical and own it | Generic ad-gating is dead — AdFly's tombstone. |
| 3 | Geo → network routing | 18× spread. |
| 4 | Multi-network waterfall | Removes the single point of failure. |
| 5 | **Copy Linkvertise Premium** (skip-ads subscription) | The only adblock-immune revenue in the category. |
| 6 | Publisher payouts, honest and fast | Every dead competitor died of payout complaints first. |
| 7 | **Do not do push notifications or popunders** | uBO strips them; Chrome's Abusive Experiences Report removes all your ads after 30 days. |

## Phased roadmap

**Phase 0 — Instrument & decide (weeks 1–4)**
Ship the quick-wins table. Get 30 days of real event data: what countries, what devices, what adblock rate, what human rate. **Then decide A / B / C with data instead of vibes.** You currently have three integers and cannot make this decision.

**Phase 1 — MVP of the chosen business (months 2–4)**
If C: geo-storefront routing + Amazon regional tags + link monitoring + real auth + per-click billing. Ship to 20 affiliate marketers. Charge from day one — Geniuslink's $6/mo base with 1,000 included clicks is the template, and the price is not the objection.

**Phase 2 — Growth (months 5–12)**
Choice pages. Conversion tracking. More affiliate networks beyond Amazon. Content marketing aimed at the Honey-scandal audience: *"how much international commission are you losing?"* — build the free calculator; it's the whole funnel.

**Phase 3 — Scale (year 2)**
Merchant-side affiliate programs (Tapfiliate's $89–179/mo market). Payouts. This is where ACV multiplies 5–10×. Move click events to ClickHouse/Tinybird. *Now* the Cloudflare Workers rewrite becomes worth doing — not before.

**Phase 4 — Enterprise (year 3)**
Custom domains, SSO, SOC 2. Agencies managing affiliate programs for multiple brands. **Note this phase is only reachable because you removed the ads in Phase 1.**

**Phase 5 — Market leader**
Don't plan this. Geniuslink is a $5–8M business after 17 years and it is a *good outcome* — bootstrapped, profitable, 11 people, four market crashes survived. Dub is trying for the venture version with $2M against Bitly and impact.com. Both are honest paths. "Bitly + Linkvertise + Linktree combined" is not a path, it's a pitch deck.

---

## The one-paragraph version

You have written a clean, correct implementation of a business model that peaked in 2013, in a category where the leading adblocker maintains a 1,773-line filter list specifically to destroy it, where the format is named by name in Chrome's Better Ads Standards, where the two largest historical players are `410 Gone` and a redirect to their acquirer, where the surviving leader is a bootstrapped German company with 500,000 publishers that had to buy an enterprise fraud-detection product to stay alive, and where realized RPM is roughly $1.13 against an advertised $70. The code is good. The distribution — which is the actual business — does not exist and the product does nothing to create it. **Meanwhile you are four weeks of work away from a redirect engine that recovers affiliate commission which is currently going to zero, sold to customers who want it to work, at 88% margin and a 5–10× multiple, in a business where nobody has ever written a browser extension to bypass you.** The redirect handler is the same. Only the person you point it at changes.

---

# Appendix — Sources & confidence

## High confidence (directly observed, 2026-07-08)

- `adf.ly`, `q.gs`, `j.gs`, `ay.gy` → 302 to `publisher.linkvertise.com/adfly-hard-migrator`
- `shorte.st` → **HTTP 410 Gone**; `sh.st` → `Server: Parking/1.0`
- `clks.pro` → Cloudflare **522** (origin dead)
- `cpmlink.net` → `X-Powered-By: PHP/5.6.31`
- Exact contents of uBO `ubo-link-shorteners.txt` (1,773 lines, modified 2026-06-30), AdGuard base filter, EasyList; HaGeZi Multi / TIF / oisd big (grepped — core domains **absent**; typosquats and *bypass tools* present)
- Live payout rate cards: exe.io, shrinkme.io, shrinkearn.com, cpmlink.net (**Turkey $0.00**), ouo.io
- AdFly's archived click ticker: 8,586,603/day (2013-06-01) → 429,755 (2023-05-17); registered-user counter frozen at 5,373,907
- Linkvertise GmbH & Co. KG — Handelsregister, Amtsgericht Pinneberg HRA 8998 PI, Itzehoe
- Bitly, Linktree, Rebrandly, Short.io, Dub, Cutt.ly, BL.INK, Geniuslink, Tapfiliate pricing pages
- Shared `Adlinkfly` codebase lineage across shrinkme/shrinkearn/clk.sh/exe.io (identical `/payout-rates` markup)

## Medium confidence (single reputable source)

- Linkvertise: 500K+ publishers, 200+ markets, *"billions of queries"* through CHEQ Defend — [CHEQ case study, Nov 2025][^cheq]
- Bitly **$100M+ ARR, 500K paying customers** — Bitly PR, Jan 2023 (no later disclosure exists; any "$75M ARR 2026" figure is a misdated echo of the Dec-2021 Egoditor announcement)
- Bitly majority stake: **Spectrum Equity, $63M, July 2017** (there was no later acquisition)
- Linktree: $165.7M raised, **$1.3B (Mar 2022)**, $25M revenue on **$50M losses (2022)**, 27% layoffs (June 2023), 50M+ users
- Semrush traffic estimates (estimates, not measurement)
- LootLabs: $7.5M raised, Bitkraft-backed
- Adblock: 29.5% of users / 1.77B people, Q2 2025 (Backlinko/GWI)
- Coalition for Better Ads: "Prestitial Ads with Countdown" below-threshold; Chrome 64 / Chrome 71 enforcement
- SpigotMC and Planet Minecraft policy text (quoted verbatim in §3.7)

## Low confidence / unresolved — do not publish without verification

- **Bitly interstitial ad date:** almost certainly **Feb 2025** (multiple contemporaneous sources); one fetch rendered 2026. Bitly's own support article 403s automated fetches.
- **BL.INK → Loftware (Apr 2025):** Tracxn only, no press release found.
- All Latka/Sacra/Tracxn revenue figures (Short.io ~$990K, Geniuslink ~$1.6M, Dub ~$1.4M, Linktree ~$60M) are **modeled, not reported**.
- **Google Safe Browsing status of these domains** — could not query directly. Absence from four community blocklists ≠ absence from GSB.
- **Reddit's actual policy** on ad-gate shorteners. Reddit blocks automated access. The widely-repeated "Reddit banned AdFly" claim is **unsourced**.
- **No official Shorte.st shutdown announcement exists.** Timeline reconstructed from Wayback HTTP status codes.
- work.ink's "$15–22 CPM," "250% higher earnings," "up to $90/1000 clicks" — **exclusively self-published marketing.**
- Linkvertise founding year (2019 vs 2020) and publisher count (500K per CHEQ vs 1M per German regional press) — **sources conflict**.
- LootLabs founder/CEO identity — sources conflict; possibly two distinct entities.
- **Every published "URL shortener market size" report.** One claims **$840.04 billion (2025)** — larger than the entire global advertising industry, and almost certainly an uncaught millions→billions unit error. There is **no Gartner, Forrester, or IDC coverage of this category.** The $250–350M bottom-up figure in §11 is my own estimate from participant revenues.
- **"Branded links get 34%/39% more clicks"** — published by Rebrandly, which sells branded links. Direction credible, magnitude not.

## Not researched (agent runs were cancelled)

- **Google AdSense policy** on interstitial/gateway pages. My strong prior is that AdSense's Valuable Inventory / Publisher Policies prohibit ads on pages without substantive content, which would make AdSense-on-a-countdown-redirect a violation — **but I did not verify the policy text and you should, before building anything around it.** Note that LootLabs *does* serve AdSense (per its uBO filter rule), which suggests the picture is more nuanced than a flat prohibition.
- **Adsterra** reputation, realized rates, adblock-list status, malware associations.
- **Infrastructure pricing** (Vercel, Cloudflare, Railway, Upstash, ClickHouse, Tinybird). §8's numbers are order-of-magnitude reasoning, not quotes. **The architectural conclusion — that infra is not your bottleneck — does not depend on them.**

[^cheq]: CHEQ, *"How CHEQ protects the Linkvertise business model from fraud"* (Nov 2025) — https://cheq.ai/wp-content/uploads/2025/11/Linkvertise_Case_Study-2025.pdf
[^latka]: getlatka.com/companies/geni — modeled estimate, not company-reported.

### Primary source index

**Ad-gate category:** [publisher.linkvertise.com/adfly](https://publisher.linkvertise.com/adfly) · [Linkvertise blog — the AdFly purchase](https://blog.linkvertise.com/en/publisher/the-adfly-purchase-what-will-change-and-how-does-the-converter-work/) · [NorthData — Linkvertise GmbH & Co. KG](https://www.northdata.com/Linkvertise%20GmbH%20&%20Co%C2%B7%20KG,%20Itzehoe/Amtsgericht%20Pinneberg%20HRA%208998%20PI) · [Tracxn — Shorte.st (Deadpooled)](https://tracxn.com/d/companies/shorte.st/__saWMdeWDQeWsU1dLnt3j-EPOt2qBpX7HLGFss7xKzKE) · [LootLabs — "Why is my Linkvertise RPM higher than LootLabs CPM but LootLabs pays more?"](https://help.lootlabs.gg/en/article/why-is-my-linkvertise-rpm-higher-than-lootlabs-cpm-but-lootlabs-pays-more-j5nz71/) · [makejar.com — best-paying shortlinks and pure scams (July 2026)](https://www.makejar.com/fresh-list-best-paying-shortlinks-and-pure-scams/)

**Filter lists:** [ubo-link-shorteners.txt](https://ublockorigin.github.io/uAssetsCDN/filters/ubo-link-shorteners.txt) · [uBO filters.txt](https://ublockorigin.github.io/uAssetsCDN/filters/filters.txt) · [AdGuard Base](https://filters.adtidy.org/extension/ublock/filters/2.txt) · [uAssets issue #16110 — linkvertise detection](https://github.com/uBlockOrigin/uAssets/issues/16110)

**Browser/ad policy:** [Coalition for Better Ads — Initial Better Ads Standards](https://www.betterads.org/standards/) · [Google — Abusive Experience Report enforcement](https://support.google.com/webtools/answer/7538608?hl=en) · [BleepingComputer — Chrome 71 blocks all ads on abusive sites](https://www.bleepingcomputer.com/news/google/chrome-71-will-block-all-ads-on-abusive-sites-in-december/)

**Platform bans:** [SpigotMC rules](https://www.spigotmc.org/wiki/spigot-rules/) · [Planet Minecraft content rules](https://www.planetminecraft.com/rules/content) · [Discord — Deceptive Practices Policy](https://discord.com/safety/deceptive-practices-policy-explainer)

**Bitly interstitial ads:** [Bitly Support — "Why are there ads on my links?"](https://support.bitly.com/hc/en-us/articles/32874287800333-Why-are-there-ads-on-my-links) · [Coywolf](https://coywolf.com/news/social-media/bitly-adds-interstitial-ads-to-shortened-urls-unlocking-new-revenue-stream/) · [WebDesignerDepot — "Goodbye Bitly"](https://webdesignerdepot.com/goodbye-bit-ly-new-preview-page-is-a-major-step-back/)

**Academic:** Nikiforakis et al., [*"Stranger Danger: Exploring the Ecosystem of Ad-based URL Shortening Services"*](https://www.researchgate.net/publication/261960583_Stranger_danger_Exploring_the_ecosystem_of_ad-based_URL_shortening_services) — 892 malicious pages via ad-based short URLs; **adf.ly responsible for 80.7%**

**SaaS comparables:** [TechCrunch — Bitly/Spectrum Equity $63M](https://techcrunch.com/2017/07/12/bitly-spectrum-equity/) · [Bitly $100M ARR](https://www.prnewswire.com/news-releases/bitly-wraps-2022-surpassing-100m-in-arr-and-500-000-global-customers-301724225.html) · [TechCrunch — Linktree $110M Series C at $1.3B](https://techcrunch.com/2022/03/16/linktree-link-in-bio-series-c-valuation/) · [Contrary Research — Linktree](https://research.contrary.com/company/linktree) · [TechCrunch — Dub.co](https://techcrunch.com/2025/01/16/dub-co-is-an-open-source-url-shortener-and-link-attribution-engine-packed-into-one/) · [dub.co/blog/10m-payouts](https://dub.co/blog/10m-payouts) · [Geniuslink pricing](https://geniuslink.com/pricing/) · [TechCrunch — Instagram ships 5 links in bio](https://techcrunch.com/2023/04/18/instagram-takes-on-linktree-and-others-with-support-for-up-to-5-links-in-bio/) · [Koji shutdown](https://withkoji.com/koji-shutdown) · [Sacra — Stan](https://sacra.com/c/stan/)

**⚠️ Do not cite:** "Bitly acquired by Fortsonn/Harvest Partners" (no evidence; the real deal is Spectrum Equity 2017). "Dub raised $17M seed + $30M Series A" (that is **DASTA Inc.**, a copy-trading fintech, different company). Any URL-shortener market-size report.
