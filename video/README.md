# Motion graphics for the demo video

Eleven short clips for the two-minute presentation video, made with [Remotion](https://www.remotion.dev)
(React rendered to video). 1920 x 1080, 30 fps. Remotion is free for teams of up to three.

```bash
npm install
```

```bash
npm run dev          # preview and scrub every clip in the browser
```

```bash
./render.sh          # out/<clip>.mp4 for each, plus out/00-reel.mp4 with all of them back to back
```

`out/` is not committed; render it.

## The clips, against the script

| Clip | Seconds | Script line it sits under |
|---|---|---|
| `01-hook` | 10 | "We've all been there: you pay up front… awkward reminder messages in the group chat" |
| `02-title` | 5.5 | "Enter GroupCart… And it only takes 3 steps" |
| `03-step1-text` | 9 | "First, you text GroupCart what items you want." |
| `04-pipeline` | 11.5 | "Using Photon Spectrum, it directs the text message into Gemini… SerpAPI… prices, which retailer" |
| `05-step2-thumbs-up` | 8 | "Then, you react with a 'thumbs up' to the specific item you want to buy." |
| `06-split` | 8 | "…it will send a text detailing how much each person owes." |
| `07-step3-pay` | 9.5 | "Finally, just react with a 'thumbs up' to confirm the payment." |
| `08-money-flow` | 11 | "…Nessie API sandbox to collect all the funds securely first then pay the store… never hallucinates amounts." |
| `09-groups-relay` | 11.5 | Not in the script: how a group works without a real group chat |
| `10-android` | 10.5 | Not in the script: how Android phones are handled |
| `11-outro` | 5 | "With GroupCart, you can handle all the shopping… your group chat." |

## Where things are

- `src/Chat.tsx`: the phone and the conversation. A clip gives it rows with the frame each one appears on,
  plus reactions and text typed into the input; it handles typing dots, the reaction picker and scrolling.
  `os="android"` draws an Android phone instead.
- `src/clips/story.ts`: the one example every clip tells (group "movie night", three people, three items)
  and its numbers, which are what `app/spectrum-bot` would compute. Texts from GroupCart are worded as
  the bot words them.
- `src/clips/phones.tsx`, `diagrams.tsx`, `multi.tsx`: the clips. `src/Root.tsx` lists them and their lengths.
- `src/theme.ts`: colours (the palette of `assets/logo-mark.svg`), fonts and easing.

The phones use the system font, so render on a Mac to get San Francisco and Apple's emoji.
