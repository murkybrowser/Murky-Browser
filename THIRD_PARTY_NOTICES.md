# Third-party notices

Murky includes or uses the following third-party work.

## Lucide icons (src/lucide.js and inline SVG icons)

ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.

Source: https://lucide.dev

## Offline page music (src/error-music.data.js)

A royalty-free jazz track.

- Source site: Pixabay https://pixabay.com/
- Track / artist: AtlasAudio https://pixabay.com/users/atlasaudio-54514918/
- License: https://pixabay.com/service/license-summary/

## npm dependencies

Installed through npm, not bundled in this repository. Each is under its own license; see the package pages.

- Electron (MIT) - https://www.electronjs.org
- electron-builder (MIT) - https://www.electron.build
- electron-store (MIT)
- electron-updater (MIT)
- franc-min (MIT)
- @browsermt/bergamot-translator (MPL-2.0) - https://github.com/browsermt/bergamot-translator
- @fugood/whisper.node - https://www.npmjs.com/package/@fugood/whisper.node
- rcedit (MIT)

## Models downloaded at runtime

Not included in this repository. Downloaded to the user's machine on demand.

- Whisper speech model (ggml-base-q5_1.bin) from the whisper.cpp project on Hugging Face - https://huggingface.co/ggerganov/whisper.cpp
- Bergamot translation models from Mozilla's firefox-translations-models and the Hugging Face repo TiberiuCristianLeon/Bergamot. See those projects for their license terms.
