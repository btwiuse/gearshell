// app-plugin-manifests-bbtex.js — the `bbtex` plugin manifest (500-line
// split out of app-plugin-manifests.js). Pure data: a w9y-installed
// Bubble Tea playground whose examples land on /opfs/wanix/examples/<id>,
// with the pager demo's artichoke.md shipped as a /preset file.

export const BBTEX_PLUGIN = {
    id: "bbtex",
    name: "Bubble Tea Playground",
    version: "1.0.0",
    icon: "Sprout",
    entry: "/plugin/bbtex/bbtex-plugin.js",
    css: ["/plugin/bbtex/bbtex.css"],
    permissions: { api: ["terminal.embed"] },
    w9y: { mod: "bbtex", version: "v2.0.12" },
    preset: [
        { id: "pager-artichoke", dst: "preset/artichoke.md", content: `
Glow
====

A casual introduction. 你好世界!

## Let’s talk about artichokes

The _artichoke_ is mentioned as a garden plant in the 8th century BC by Homer
**and** Hesiod. The naturally occurring variant of the artichoke, the cardoon,
which is native to the Mediterranean area, also has records of use as a food
among the ancient Greeks and Romans. Pliny the Elder mentioned growing of
_carduus_ in Carthage and Cordoba.

> He holds him with a skinny hand,
> ‘There was a ship,’ quoth he.
> ‘Hold off! unhand me, grey-beard loon!’
> An artichoke, dropt he.

--Samuel Taylor Coleridge, [The Rime of the Ancient Mariner][rime]

[rime]: https://poetryfoundation.org/poems/43997/

## Other foods worth mentioning

1. Carrots
1. Celery
1. Tacos
    * Soft
    * Hard
1. Cucumber

## Things to eat today

* [x] Carrots
* [x] Ramen
* [ ] Currywurst

### Power levels of the aforementioned foods

| Name       | Power | Comment          |
| ---        | ---   | ---              |
| Carrots    | 9001  | It’s over 9000?! |
| Ramen      | 9002  | Also over 9000?! |
| Currywurst | 10000 | What?!           |

## Currying Artichokes

Here’s a bit of code in [Haskell](https://haskell.org), because we are fancy.
Remember that to compile Haskell you’ll need \`ghc\`.

\`\`\`haskell
module Main where

import Data.Function ( (&) )
import Data.List ( intercalculate )

hello :: String -> String
hello s =
    "Hello, " ++ s ++ "."

main :: IO ()
main =
    map hello [ "artichoke", "alcachofa" ] & intercalculate "\\n" & putStrLn
\`\`\`

***

_Alcachofa_, if you were wondering, is artichoke in Spanish.
` },
      ],
};

// iframe edition of the same playground: the page renders its own xterm
// and drives the example binaries through the terminal data bridge
// (terminal.create/write/resize/dispose + term.data/term.exit events),
// because terminal.embed cannot cross postMessage. Keep in sync with
// BBTEX_PLUGIN's w9y dependency so either plugin installs the examples.
export const BBTEX_IFRAME_PLUGIN = {
    id: "bbtex-iframe",
    name: "Bubble Tea Playground (iframe)",
    version: "1.0.0",
    icon: "Sprout",
    iframe: {
      src: "/plugin/bbtex-iframe/index.html",
      allow: "clipboard-read; clipboard-write; fullscreen",
      allowFullscreen: true,
    },
    permissions: {
      api: [
        "terminal.create",
        "terminal.write",
        "terminal.resize",
        "terminal.dispose",
        "events.on",
        "events.off",
        "w9y.status",
      ],
    },
    w9y: { mod: "bbtex", version: "v2.0.12" },
};
