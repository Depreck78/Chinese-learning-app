# Notices

Copyright (C) 2026 Erick Xu

Hanzi Desk is free software: you can redistribute it and/or modify it under the terms of the
GNU Affero General Public License as published by the Free Software Foundation, either version 3
of the License, or (at your option) any later version. See [LICENSE](LICENSE).

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without
even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

## Third-party content

The AGPL covers this project's own code. The content below comes from others and keeps its own
license; it is not relicensed under the AGPL.

| Content | Source | License |
| --- | --- | --- |
| Pronunciation recordings (`public/audio/`) | Yue Tan and Chen Wang via [audio-cmn](https://github.com/hugolpz/audio-cmn); Yue Tan and Luilui6666 (Lingua Libre) via Wikimedia Commons | CC BY-SA 3.0 / 4.0 — details in [public/audio/CREDITS.txt](public/audio/CREDITS.txt) |
| Sentence recordings (`public/sentence-audio/`) | Generated with [Kokoro-82M v1.1-zh](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh) by hexgrad | Model under Apache 2.0 — details in [public/sentence-audio/CREDITS.txt](public/sentence-audio/CREDITS.txt) |
| Example sentences (`public/sentences/`) | [Tatoeba](https://tatoeba.org) contributors; sentences marked `hanzi-desk` were written for this app | CC BY 2.0 FR — details in [public/sentences/CREDITS.txt](public/sentences/CREDITS.txt) |
| Avatar images (`public/avatars/`) | [Noto Emoji](https://github.com/googlefonts/noto-emoji) by Google | Apache 2.0 — details in [public/avatars/CREDITS.txt](public/avatars/CREDITS.txt) |
| Character stroke data (copied into `public/strokes/` at build time) | [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data), derived from Arphic fonts via Make Me a Hanzi | Arphic Public License |
| Fonts (bundled at build time) | Noto Serif SC, Source Sans 3, Barlow Condensed via Fontsource | SIL Open Font License 1.1 |
| Character writing videos | [TrainChinese](https://www.trainchinese.com) on YouTube; only the video ids are stored and the videos are embedded from YouTube | Owned by TrainChinese |

Other npm dependencies are listed in `package.json` and keep their own licenses.
