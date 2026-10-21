# Publishing clips to champion pages (2026-10-21)

## Built: local store on Unraid (2026-10-21)

The first version stores clips on the Unraid box, not R2. `CLIPS_STORE` is the one setting that picks where clips live.

- **Publish** in Studio's player (two clicks; the first says names on screen go public and only the game sound uploads).
  `app/clip-publish.js` streams the clip to the crawler's `POST /admin/clips` (LAN only, admin token). The token is
  saved from Studio › Capture › Publishing, encrypted with Electron safeStorage in `userData/publish-token.bin`, never
  in config.json. **Unpublish** calls `DELETE /admin/clips/<id>` and the files go.
- The crawler (`crawler/src/clips.js`) makes the web copy with ffmpeg (720p30 H.264, first audio track only, faststart,
  a 40 MB clip came out at 2.3 MB) plus a poster, stores both in `CLIPS_DIR`, and lists them at `GET /lol/clips`.
- Public files: SWAG's `clips.subdomain.conf` passes only `/<12 hex>.mp4|jpg` to the crawler's `/clips/` route, so
  `https://clips.olvyx.com` serves clips and nothing else. The admin routes refuse anything forwarded by a proxy.
- Champion pages show **Featured clips** under **Your top clips**, from `statsApi.clips(id)` (not memoised).
- Server: `.env` sets `CLIPS_STORE=local`, `CLIPS_DIR=/clips`, `CLIPS_PUBLIC_BASE=https://clips.olvyx.com`; the clips
  folder is `/mnt/cache/appdata/queuepop-crawler/clips` (in the server-only compose override).

**Moving to R2 later** (when queuePop goes public and home upload bandwidth matters): add an `r2` store to
`createStore`, copy the folder up once, point `clips.olvyx.com` at the bucket. Clip URLs stay the same. The plan
below still describes that setup.

## The original R2 plan

Today a champion page shows **Your <champion> clips**: your own Studio clips of that champion, played from your disk
(`recChampionClips` in `src/webui/recordings.js`). Nothing leaves your PC.

This plan adds **Publish**: you pick a clip, and everyone who opens that champion's page in queuePop sees it under
**Featured clips**. Nothing is published unless you press the button, and Unpublish takes it down everywhere.

## What it costs

Storage is Cloudflare R2. It's the cheapest fit because viewers watching clips is free: R2 charges nothing for egress.

| | Free every month | After that |
|---|---|---|
| Storage | 10 GB | $0.015 per GB-month |
| Uploads (class A ops) | 1 million | $4.50 per million |
| Views (class B ops) | 10 million | $0.36 per million |
| Bandwidth to viewers | unlimited | free |

A published clip is re-encoded to about 6 MB (720p, 30 fps, about 3 Mbps, 15 s). 10 GB holds about 1,600 clips, so
curating your own clips stays free.

The alternative is your Unraid box behind SWAG. It costs nothing, but every view uses your home upload, and it puts
a public endpoint on the server. Fine for testing; R2 for real.

## The flow

```
Studio player / Highlights          crawler (Unraid)                     Cloudflare R2
--------------------------          ----------------                     -------------
[Publish] on a clip  ──POST /admin/clips (Bearer admin token)──►  ffmpeg: 720p30 H.264
  champion, label, game,               multipart: the clip file            + poster .jpg
  role, patch, matchId                 stores a row in `clips`  ──PUT──►  clips/<id>.mp4
                                                                           clips/<id>.jpg
champion page  ◄──GET /lol/clips?champion=81 (public)── rows + public URLs (clips.olvyx.com/<id>.mp4)
[Unpublish]    ──DELETE /admin/clips/<id> (admin)──►  deletes the row ──DELETE──► both objects
```

- **Who can publish:** only you. The app sends the crawler's admin token, the same one the status page uses. The app
  keeps it with Electron `safeStorage` (Windows DPAPI), entered once in Studio > Capture > Publishing. It never goes in config.json.
- **R2 credentials:** they live only on the crawler (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET`, `R2_PUBLIC_BASE` in its `.env` on Unraid). The app never holds them.
- **Re-encoding:** the crawler does it, with ffmpeg added to its Docker image, so every published clip is the same small web
  format however you recorded it. Output: `-vf scale=-2:720 -r 30 -c:v libx264 -preset veryfast -crf 26 -maxrate 3500k
  -c:a aac -b:a 128k -movflags +faststart`, plus a poster frame at 0.5 s.
- **Sound:** only the mix track is published (track 1), so your separate mic track never leaves your PC.
- **The `clips` table:**

  | Column | Holds |
  |---|---|
  | `id` | id |
  | `game` | lol / tft |
  | `champion` | the champion's numeric id (`cid`) |
  | `role` | role |
  | `patch` | patch |
  | `label` | the clip's label |
  | `duration` | length |
  | `size` | file size |
  | `url` | video link |
  | `poster` | poster link |
  | `match_id` | the game |
  | `created_at` | when published |
  | `hidden` | unpublished (soft) |

- **Champion page:** a **Featured clips** row from `/lol/clips?champion=<cid>`, using the same filmstrip as Your clips, with
  posters and video loading only when played. Your clips stays first and stays local.
- **Studio:**
  - **Publish** and **Unpublish** buttons on a clip in the player and on Highlights cards. A published clip shows a "Published" chip.
  - The published URL is stored on the clip (`clip.published = { id, url }`).
  - A **Published** filter in Highlights.

## Before you publish a clip

- **What's on screen:** clips show what was on your screen: summoner names, chat, sometimes a party's names. The
  Publish dialog says so and shows the clip once more before it uploads. Blurring names is a later option, not part of v1.
- **Riot's rules:** gameplay videos are allowed under Riot's Legal Jibber Jabber policy. Keep the clip as recorded, with no
  Riot assets added on top.
- **Other players' clips:** if other queuePop players could ever publish clips, you would need moderation, a per-user
  quota, abuse reports and a real storage budget. This plan keeps publishing to you only, which avoids all of that.

## Build order

1. **R2 bucket.** Create it, add the `clips.olvyx.com` custom domain and an API token scoped to that bucket, and put the
   keys in the crawler's `.env`. This is your step: it needs your Cloudflare account.
2. **Crawler.**
   - ffmpeg in the image.
   - `POST /admin/clips` (transcode, upload, row), `GET /lol/clips` (public, cached 5 min) and
     `DELETE /admin/clips/:id`.
   - Tests with R2 stubbed.
3. **App host.**
   - `publish_clip(matchId, i)` and `unpublish_clip(matchId, i)`, uploading the clip file as multipart with the
     admin token from safeStorage.
   - Studio > Capture > Publishing: crawler address, token, and how much of the free 10 GB is used.
4. **App UI.** Publish and Unpublish in the player and on Highlights, the confirm step, Featured clips on champion pages,
   and the Published filter.
5. **Check.** Publish one clip, see it on the champion page from a second profile, unpublish it, and confirm the R2 object is gone.

## Open questions

- A custom domain (`clips.olvyx.com`) or R2's `r2.dev` URL? A custom domain is better (caching, no rate limit), but R2
  only attaches domains whose DNS zone is on Cloudflare. Check where olvyx.com's DNS lives first. `r2.dev` works either
  way, with a rate limit.
- Should TFT clips (boards, not champions) go on unit or comp pages? That's v2.
