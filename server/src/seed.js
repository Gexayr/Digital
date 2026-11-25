// Initial catalogue. Inserted only when the products table is empty.
// `updated` is an ISO date so "Newest" / "Latest uploads" sort correctly
// (the prototype sorted month names alphabetically).
// Images live in client/public/images/<img>.jpg and <img>-alt-<1..3>.jpg.

export const CATEGORIES = ['Photography', 'Digital Art', 'UI Kits', 'Presets', 'Fonts', '3D Assets', 'Templates', 'Audio'];

export const PRODUCTS = [
  { id: 'p1', title: 'Nordic Light — Film Preset Pack', category: 'Presets', creator: 'Elin Voss', price: 29, sale: null, rating: 4.9, sales: 2140, badge: 'Trending', tags: ['lightroom', 'moody', 'film'], img: 'prod-1', format: '.xmp / .lrtemplate', size: '48 MB', license: 'Standard', software: 'Lightroom Classic, Camera Raw', updated: '2026-06-12' },
  { id: 'p2', title: 'Monoline — UI Icon System', category: 'UI Kits', creator: 'Studio Marrow', price: 39, sale: 24, rating: 4.8, sales: 3820, badge: 'Sale', tags: ['icons', 'figma', 'ui'], img: 'prod-2', format: '.fig / .svg', size: '12 MB', license: 'Extended', software: 'Figma, Sketch', updated: '2026-07-08' },
  { id: 'p3', title: 'Halide — Grain & Texture Overlays', category: 'Photography', creator: 'Rowan Cole', price: 19, sale: null, rating: 4.7, sales: 1560, badge: null, tags: ['texture', 'film', 'overlay'], img: 'prod-3', format: '.jpg / .tiff', size: '310 MB', license: 'Standard', software: 'Photoshop, Affinity', updated: '2026-05-20' },
  { id: 'p4', title: 'Fieldwork — Notion Life OS', category: 'Templates', creator: 'Ada Lindqvist', price: 24, sale: null, rating: 4.9, sales: 5210, badge: 'Featured', tags: ['notion', 'productivity'], img: 'prod-4', format: '.notion', size: '—', license: 'Personal', software: 'Notion', updated: '2026-07-15' },
  { id: 'p5', title: 'Ghost Type — Variable Serif Family', category: 'Fonts', creator: 'Foundry Nine', price: 45, sale: 32, rating: 5.0, sales: 980, badge: 'Sale', tags: ['serif', 'variable', 'type'], img: 'prod-5', format: '.otf / .woff2', size: '6 MB', license: 'Commercial', software: 'Any', updated: '2026-04-03' },
  { id: 'p6', title: 'Aperture — Editorial Photo Set', category: 'Digital Art', creator: 'Mira Solberg', price: 34, sale: null, rating: 4.6, sales: 740, badge: 'New', tags: ['editorial', 'print', 'art'], img: 'prod-6', format: '.psd / .png', size: '820 MB', license: 'Extended', software: 'Photoshop', updated: '2026-07-22' },
  { id: 'p7', title: 'Terra — Low-Poly Environment Kit', category: '3D Assets', creator: 'Nine Dot Studio', price: 59, sale: null, rating: 4.8, sales: 410, badge: null, tags: ['3d', 'blender', 'environment'], img: 'prod-7', format: '.blend / .fbx / .glb', size: '1.2 GB', license: 'Standard', software: 'Blender, Unity, Unreal', updated: '2026-06-02' },
  { id: 'p8', title: 'Drift — Ambient Soundscapes Vol. 2', category: 'Audio', creator: 'Low Hum', price: 22, sale: 15, rating: 4.7, sales: 1290, badge: 'Sale', tags: ['ambient', 'loop', 'score'], img: 'prod-8', format: '.wav / .mp3', size: '640 MB', license: 'Standard', software: 'Any DAW', updated: '2026-03-18' },
  { id: 'p9', title: 'Dune — Warm Analog Wallpaper Set', category: 'Digital Art', creator: 'Mira Solberg', price: 14, sale: null, rating: 4.5, sales: 2870, badge: 'Trending', tags: ['wallpaper', 'minimal'], img: 'prod-9', format: '.png / .jpg', size: '190 MB', license: 'Personal', software: 'Any', updated: '2026-02-10' },
  { id: 'p10', title: 'Ledger — SaaS Dashboard UI Kit', category: 'UI Kits', creator: 'Studio Marrow', price: 69, sale: 49, rating: 4.9, sales: 1670, badge: 'Sale', tags: ['dashboard', 'saas', 'figma'], img: 'prod-10', format: '.fig', size: '34 MB', license: 'Extended', software: 'Figma', updated: '2026-07-01' },
  { id: 'p11', title: 'Salt Air — Coastal Lightroom Presets', category: 'Presets', creator: 'Elin Voss', price: 26, sale: null, rating: 4.8, sales: 1980, badge: null, tags: ['coastal', 'bright', 'film'], img: 'prod-11', format: '.xmp', size: '40 MB', license: 'Standard', software: 'Lightroom', updated: '2026-05-06' },
  { id: 'p12', title: 'Attic — Handwritten Display Font', category: 'Fonts', creator: 'Foundry Nine', price: 18, sale: null, rating: 4.6, sales: 640, badge: 'New', tags: ['display', 'script'], img: 'prod-12', format: '.otf / .ttf', size: '2 MB', license: 'Commercial', software: 'Any', updated: '2026-07-28' },
];

export const COUPONS = [
  { code: 'WELCOME10', percent: 10 },
  { code: 'CREATOR20', percent: 20 },
];

export const REVIEWS = [
  { name: 'Jordan M.', stars: 5, text: 'Exactly as described, files were clean and well organized.' },
  { name: 'Casey L.', stars: 4, text: 'Great quality, wish there were a couple more color variants.' },
];
