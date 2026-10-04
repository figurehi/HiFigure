# Third-Party Icon Notices

HiChart catalog `2026.08.06-v3` contains a frozen, local selection of open-source SVG artwork. The source SVG geometry is sanitized and wrapped in a HiChart preview card; no icon is downloaded at runtime.

| Artwork | Upstream version | Build package | Included | Artwork license |
| --- | ---: | ---: | ---: | --- |
| [Tabler Icons](https://github.com/tabler/tabler-icons) | 3.45.0 | `@iconify-json/tabler@1.2.38` | 239 | [MIT](https://github.com/tabler/tabler-icons/blob/main/LICENSE) |
| [Carbon Icons](https://github.com/carbon-design-system/carbon/tree/main/packages/icons) | 11.85.0 | `@iconify-json/carbon@1.2.25` | 191 | [Apache-2.0](https://github.com/carbon-design-system/carbon/blob/main/LICENSE) |
| [Health Icons](https://github.com/resolvetosavelives/healthicons) | 2.0.0 | `@iconify-json/healthicons@1.2.13` | 93 | [CC0-1.0 artwork](https://creativecommons.org/publicdomain/zero/1.0/) |
| [Phosphor Icons](https://github.com/phosphor-icons/core) | 2.1.1 | `@iconify-json/ph@1.2.2` | 128 | [MIT](https://github.com/phosphor-icons/core/blob/main/LICENSE) |
| [Iconoir](https://github.com/iconoir-icons/iconoir) | 7.11.0 | `@iconify-json/iconoir@1.2.11` | 113 | [MIT](https://github.com/iconoir-icons/iconoir/blob/main/LICENSE) |

Bioicons is not included in this catalog snapshot. Future Bioicons imports must use an explicit per-icon CC0, MIT, BSD-2-Clause, or BSD-3-Clause whitelist; CC-BY and CC-BY-SA assets must not enter the catalog without a separate attribution and redistribution review.

The Iconify JSON packages are build-time inputs only. They are pinned in `package-lock.json` and are not runtime/CDN dependencies. The Health Icons repository code and its Iconify JSON package are MIT licensed, while the upstream README explicitly dedicates the icon artwork to the public domain under CC0.

## Tabler Icons — MIT License

Copyright (c) 2020-2026 Paweł Kuna

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Carbon Icons — Apache License 2.0

Copyright IBM Corp. 2016, 2026

Carbon Icons is used under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0). HiChart preserves this notice and identifies its presentation-layer modifications. Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

## Phosphor Icons — MIT License

Copyright (c) 2023 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Iconoir — MIT License

Copyright (c) 2021 Luca Burgio

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Health Icons artwork — CC0 1.0

Health Icons states that its icon artwork is available in the public domain under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). Attribution is not required. HiChart records the source and modification metadata to make the catalog auditable.

The Health Icons repository code and packaging are also distributed under the MIT License:

Copyright (c) 2021 Resolve to Save Lives

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## SAM2 browser inference

The local interactive icon extractor is based in part on the browser-side
SAM2 inference approach demonstrated by
[`geronimi73/next-sam`](https://github.com/geronimi73/next-sam).

MIT License

Copyright (c) 2025 geronimi73

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

The extractor uses Meta's
[`facebookresearch/sam2`](https://github.com/facebookresearch/sam2) model under
the Apache License 2.0. The browser-compatible encoder and decoder artifacts
are downloaded from
[`g-ronimo/sam2-tiny`](https://huggingface.co/g-ronimo/sam2-tiny).

## tldraw SDK — commercial license required

The Edit canvas (`components/annotation-canvas.tsx`) is built on the
[tldraw SDK](https://github.com/tldraw/tldraw) under the
[tldraw license](https://github.com/tldraw/tldraw/blob/main/LICENSE.md). The
SDK is source-available, **not** open source: versions after 1.x carry a
bespoke commercial license, and production use requires a trial, hobby, or
commercial license key supplied through `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`.
Without a key the SDK runs in development mode only and displays a licensing
badge on the canvas. Under a hobby license the "made with tldraw" watermark
must remain visible. Redistributing HiChart does not convey any tldraw
license; downstream users must obtain their own. See
[tldraw.dev/pricing](https://tldraw.dev/pricing) and the
[trademark guidelines](https://github.com/tldraw/tldraw/blob/main/TRADEMARKS.md).
