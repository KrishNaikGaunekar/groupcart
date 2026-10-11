# Motion graphics for the demo video

Eleven short clips for the two-minute presentation video, made with [Remotion](https://www.remotion.dev)
(React rendered to video). 1920 x 1080, 30 fps. Remotion is free for teams of up to three.

Nine are **overlays**: they have no background and are rendered with transparency, to sit on a track
above footage of someone talking. They keep to the right-hand side of the frame, come in at the start
and leave at the end. Two **fill the frame**: the intro and the sign-off.

Everything wears the website's look (its glass boxes, its two typefaces, its pixel sprites, Justin's
minion) except the phones, which are drawn to match a real iPhone and a real Android phone.

```bash
npm install
```

```bash
npm run dev          # preview and scrub every clip in the browser
```

```bash
./render.sh          # everything into out/
```

`out/` is not committed; render it. It gets:

- `<clip>.mov` for each overlay: ProRes 4444 with an alpha channel. In DaVinci Resolve, drop it on a
  track above the footage and it composites by itself. Move it with the clip's Transform if the speaker
  is on the right.
- `02-title.mp4` and `11-outro.mp4`: ordinary video.
- `00-preview.mp4`: all eleven back to back, the overlays over a grey stand-in for the footage. For
  looking at, not for editing with.

## The clips, against the script

| Clip | Kind | Seconds | Script line it sits under |
|---|---|---|---|
| `01-hook` | overlay, phone | 10 | "We've all been there: you pay up front… awkward reminder messages in the group chat" |
| `02-title` | full frame | 6.3 | "Enter GroupCart… And it only takes 3 steps" |
| `03-step1-text` | overlay, phone | 9 | "First, you text GroupCart what items you want." |
| `04-pipeline` | overlay, panel | 10 | "Using Photon Spectrum, it directs the text message into Gemini… SerpAPI… prices, which retailer" |
| `05-step2-thumbs-up` | overlay, phone | 8 | "Then, you react with a 'thumbs up' to the specific item you want to buy." |
| `06-split` | overlay, panel | 8.3 | "…it will send a text detailing how much each person owes." |
| `07-step3-pay` | overlay, phone | 9.5 | "Finally, just react with a 'thumbs up' to confirm the payment." |
| `08-money-flow` | overlay, panel | 10 | "…Nessie API sandbox to collect all the funds securely first then pay the store… never hallucinates amounts." |
| `09-groups-relay` | overlay, panel | 11 | Not in the script: how a group works without a real group chat |
| `10-android` | overlay, panel | 9.3 | Not in the script: how Android phones are handled |
| `11-outro` | full frame | 5.3 | "With GroupCart, you can handle all the shopping… your group chat." |

## Where things are

- `src/Chat.tsx`: the phone and the conversation. A clip gives it rows with the frame each one appears on,
  plus reactions and text typed into the input; it handles typing dots, the reaction picker and scrolling.
  `os="android"` draws an Android phone instead.
- `src/Site.tsx`: the website's pieces at video size: the glass box and its title bar, the speech bubble,
  badges, the masthead, and the wrapper that brings an overlay in and takes it out.
- `src/Minion.tsx`, `src/Pixel.tsx`: the minion and the tiny pixel animations, driven by the frame.
- `src/clips/story.ts`: the one example every clip tells (group "movie night", three people, three items)
  and its numbers, which are what `app/spectrum-bot` would compute. Texts from GroupCart are worded as
  the bot words them.
- `src/clips/phones.tsx`, `panels.tsx`, `pages.tsx`: the clips. `src/Root.tsx` lists them.

## What comes from the website

Not copied by hand; regenerate them if the site's versions change:

```bash
python3 ../scripts/minion_sprite.py --layers public/minion    # the minion's parts as PNGs
```

```bash
node tools/export-sprites.mjs                                 # the pixel sprites, into src/sprites.json
```

`public/fonts/` and the two backgrounds in `public/` are copies of the files in `site/assets/`, under the
licences listed in `site/assets/CREDITS.md`. The phones use the system font, so render on a Mac to get
San Francisco and Apple's emoji.
