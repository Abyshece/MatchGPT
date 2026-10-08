# Where the logo comes from

`ring.png` (2048 × 2048, transparent background) is Shaadi24's logo: a silver solitaire ring with a
pale blue diamond. It was made for Shaadi24 on 8 October 2026 with an AI image generator (GPT Image
2.5, through the owner's Higgsfield account), from this text prompt alone, with no picture to copy:

> A single polished platinum solitaire engagement ring, glossy 3D illustration for a phone app icon.
> The smooth, rounded silver band is seen at a three-quarter angle from slightly above, slightly
> tilted, with soft reflections and gentle grey shading. On top sits one round brilliant-cut diamond
> with a pale icy-blue tint and visible sparkling facets, held by six slim silver prongs on a small
> raised setting. Clean studio lighting, crisp edges, smooth gradients, simple and friendly, no text,
> no hands, no box, no cast shadow. The ring is centred and fills about 80% of the square.
> Transparent background.

It looks like the 💍 iPhones show, but it isn't Apple's picture, which can't be used: Apple's emoji
pictures may only be shown as text on Apple's devices, and App Review rejects apps that use them.

`scripts/store-graphics.mjs` makes the app icons, launch screens, store graphics and the website's
icons from this file. To change the logo, replace `ring.png` (any size, transparent around the ring)
and run it.
