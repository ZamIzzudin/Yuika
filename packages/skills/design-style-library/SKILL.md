---
name: design-style-library
description: Catalog of 67 curated design style packs (clean, brutalism, glassmorphism, neobrutalism, editorial, bento, claymorphism, shadcn, stitch, and more). Each entry has vibe, color palette, font stack, radius and spacing tokens. Use when choosing or applying a visual style direction, matching a brief to a style family, or when the user names a style (bento, glassmorphism, neumorphism, etc).
license: MIT
metadata:
  author: typeui.sh (adapted for Yuika)
  yui:
    category: design
    status: ready
    personas: [yui-designer]
    tags: [design, styles, catalog]
---

# Design Style Library (67 packs)

One product = one style. Pick a single pack, lock its tokens, do not mix packs
in one product (mixing is slop).

## How to choose

1. Read the brief: audience (B2B/consumer/creative/enterprise), tone (calm/bold/
   playful/premium), density (content-heavy dashboard vs editorial landing).
2. Map to a family:
   - SaaS/product/clean UI: clean, shadcn, minimal, sleek, modern, spacious,
     contemporary, refined, professional
   - Enterprise/data: stitch, enterprise, corporate, power, material
   - Bold/expressive: bold, brutalism, neobrutalism, colorful, vibrant,
     expressive, creative, dramatic, pulse
   - Retro/nostalgic: retro, vintage, sega, matrix, pacman, tetris, dithered,
     riso, roku, paper, sketch, doodle
   - Premium/luxury: premium, high-end feel: elegant, editorial, terracotta,
     cafe, fiction, cosmic
   - Soft/friendly: friendly, claymorphism, neumorphism, flat, geometric
   - Tech/futuristic: futuristic, neon, matrix, immersive, agentic, lingo
   - Storytelling/art: storytelling, artistic, fantasy, perspective, mono,
     bento, claude, codex, ant, basic, levels, square, gradient, glassmorphism
3. State the pick in one line before designing (which pack, why it fits).
4. Use the pack tokens as-is for the first pass: palette, fonts, radius,
   spacing. Deviate only with a reason tied to the brief.
5. Brand overrides win: if the project has brand colors/fonts, keep them and
   borrow only structure (spacing, radius, hierarchy) from the pack.

## Packs

### agentic (agentic)
- Vibe: Conversational AI-first interface with minimal controls, clear outcomes, and delegated task flows for agentic workflows.
- Palette: primary #FF5701, secondary #F6F6F1, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Playfair Display 2.5rem; body-md: Playfair Display 1rem; label-caps: JetBrains Mono 0.875rem
- Radius/spacing: 4px/8px, base 8px/16px
### ant (ant)
- Vibe: Structured, enterprise-focused design system emphasizing clarity, consistency, and efficiency for data-dense web applications.
- Palette: primary #1677ff, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Plus Jakarta Sans 2rem; body-md: Plus Jakarta Sans 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### artistic (artistic)
- Vibe: High-contrast, expressive style with creative typography and bold color choices for visually striking interfaces.
- Palette: primary #3B82F6, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Limelight 2.25rem; body-md: Limelight 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### basic (basic)
- Vibe: Print-inspired visual language for books, magazines, and reports with editorial grids and expressive typography.
- Palette: primary #A855F7, secondary #0A1829, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #0A1829
- Fonts: h1: Oswald 3rem; body-md: Nunito 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### bento (bento)
- Vibe: Modular grid layout with card-like blocks, clear hierarchy, soft spacing, and subtle visual contrast for organized, scannable interfaces.
- Palette: primary #FAD4C0, secondary #80A1C1, success #16A34A, warning #D97706, danger #DC2626, surface #FFF5E6, text #111827
- Fonts: h1: Inter 2rem; body-md: Inter 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### bold (bold)
- Vibe: Strong visual presence with heavyweight typography, high-contrast colors, and commanding layouts.
- Palette: primary #0077BC, secondary #009866, success #16A34A, warning #D97706, danger #DC2626, surface #111111, text #111827
- Fonts: h1: Archivo Black 3rem; body-md: Archivo Black 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### brutalism (brutalism)
- Vibe: Raw, anti-design aesthetic inspired by concrete architecture with unadorned elements, jarring layouts, and functional minimalism.
- Palette: primary #DD614C, secondary #DAA144, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Darker Grotesque 3rem; body-md: Darker Grotesque 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### cafe (cafe)
- Vibe: Cozy cafe-inspired interface with warm tones, soft typography, and clean layouts for a relaxed browsing experience.
- Palette: primary #5D4432, secondary #E9E3DD, success #16A34A, warning #D97706, danger #DC2626, surface #F9F7F5, text #3E2B1E
- Fonts: h1: Poppins 3rem; body-md: Poppins 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 2px/4px
### "claude" (claude)
- Vibe: "A research-journal aesthetic printed on warm stone - authoritative, editorial, almost achromatic. Pages live on warm ivory parchment (never pure white), wit...
- Palette: primary #141413, secondary #FAF9F6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Anthropic Sans 2rem; body-md: Anthropic Sans 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### claymorphism (claymorphism)
- Vibe: Soft, rounded 3D-like shapes mimicking malleable clay with playful, puffy elements and colorful surfaces.
- Palette: primary #3B82F6, secondary #FFFFFF, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #1C398E
- Fonts: h1: Poppins 3rem; body-md: Montserrat 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### clean (clean)
- Vibe: Simplicity-focused design with ample whitespace, legible typography, and a limited color palette to reduce visual clutter.
- Palette: primary #3B82F6, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Poppins 2rem; body-md: Roboto 1rem; label-caps: Inconsolata 0.75rem
- Radius/spacing: 4px/8px, base 8px/16px
### "codex" (codex)
- Vibe: "A radically minimal, blank-canvas interface built as a pure edge-to-edge surface, with almost no color and typography carrying the visual weight. Black serv...
- Palette: primary #000000, secondary #FFFFFF, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Open Sans 2rem; body-md: Open Sans 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### colorful (colorful)
- Vibe: Vibrant, high-contrast palettes and gradients for engaging, memorable, and modern user experiences.
- Palette: primary #3B82F6, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Inter 2rem; body-md: Inter 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 8px/16px
### contemporary (contemporary)
- Vibe: Current-era minimalist design with bento grids, dark mode support, and high-performance accessible layouts.
- Palette: primary #C800DF, secondary #E60076, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Jost 3rem; body-md: Jost 1rem; label-caps: Overpass Mono 0.75rem
- Radius/spacing: 4px/8px, base 8px/16px
### corporate (corporate)
- Vibe: Professional, brand-aligned design with structured grids, minimalist layouts, and consistent enterprise patterns.
- Palette: primary #3B82F6, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Poppins 3rem; body-md: Open Sans 1rem; label-caps: IBM Plex Mono 0.75rem
- Radius/spacing: 4px/8px, base 8px/16px
### cosmic (cosmic)
- Vibe: Futuristic sci-fi aesthetic with dark themes, vibrant neon accents, and immersive spatial elements.
- Palette: primary #3B82F6, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Audiowide 2rem; body-md: Audiowide 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### creative (creative)
- Vibe: Playful, character-driven design with expressive typography and bold graphics for landing pages and creative projects.
- Palette: primary #3B82F6, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Bangers 2rem; body-md: Bangers 1rem; label-caps: IBM Plex Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### dithered (dithered)
- Vibe: Dot-pattern rendering technique that simulates shades with a limited palette for nostalgic, retro, high-contrast visuals.
- Palette: primary #3B82F6, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Space Grotesk 2.5rem; body-md: Open Sans 1rem; label-caps: IBM Plex Mono 0.875rem
- Radius/spacing: 4px/8px, base 4px/8px
### doodle (doodle)
- Vibe: Hand-drawn, sketch-like style with doodles, handwritten fonts, and imperfect lines for a playful, informal feel.
- Palette: primary #49B6E5, secondary #263D5B, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Delius Swash Caps 2.5rem; body-md: Delius Swash Caps 1rem; label-caps: JetBrains Mono 0.875rem
- Radius/spacing: 4px/8px, base 4px/8px
### dramatic (dramatic)
- Vibe: High-contrast, theatrical design with bold layouts, immersive visuals, and unconventional compositions that command attention.
- Palette: primary #8B5CF6, secondary #F43F5E, success #16A34A, warning #D97706, danger #DC2626, surface #09090B, text #FAFAFA
- Fonts: h1: Outfit 2rem; body-md: Outfit 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### editorial (editorial)
- Vibe: Magazine-inspired editorial layout with refined serif typography, structured grids, and elegant reading experiences.
- Palette: primary #111111, secondary #f1f1f1, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Gelasio 2.5rem; body-md: Gelasio 1rem; label-caps: Ubuntu Mono 0.875rem
- Radius/spacing: 4px/8px, base 8px/16px
### enterprise (enterprise)
- Vibe: Dark-themed cloud-platform aesthetic with modular grids, glass-like panels, and strong data hierarchy for productivity dashboards.
- Palette: primary #0C5CAB, secondary #0a4a8a, success #10b981, warning #f59e0b, danger #ef4444, surface #09090b, text #fafafa
- Fonts: h1: IBM Plex Sans 2rem; body-md: IBM Plex Sans 1rem; label-caps: IBM Plex Sans 0.75rem
- Radius/spacing: 4px/8px, base 8px/16px
### expressive (expressive)
- Vibe: Vibrant, personality-driven design with bold colors, playful graphics, and dynamic layouts that balance creativity with structure.
- Palette: primary #db2777, secondary #2563eb, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: IBM Plex Mono 2.5rem; body-md: IBM Plex Mono 1rem; label-caps: IBM Plex Mono 0.875rem
- Radius/spacing: 4px/8px, base 4px/8px
### fantasy (fantasy)
- Vibe: Game-inspired fantasy aesthetic with bold, premium visuals, rich color palettes, and immersive thematic elements.
- Palette: primary #0250CC, secondary #FDC800, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: New Rocker 2rem; body-md: New Rocker 1rem; label-caps: IBM Plex Mono 0.75rem
- Radius/spacing: 4px/8px, base 8px/16px
### "fiction" (fiction)
- Vibe: "A playful, energetic, cartoonesque interface inspired by friendly children's-book illustrations - warm cream backgrounds, big bold custom display typography...
- Palette: primary #222222, secondary #FFE9CE, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Cossette Texte 2rem; body-md: Cossette Texte 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### flat (flat)
- Vibe: Two-dimensional minimalist style with vibrant colors, clean typography, and no 3D effects for fast, user-friendly interfaces.
- Palette: primary #F2673C, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Inter 2rem; body-md: Inter 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### friendly (friendly)
- Vibe: Approachable, intuitive design with rounded elements, ample whitespace, and soft pastel color palettes.
- Palette: primary #F2D9DC, secondary #D9F2D8, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Noto Serif Display 2.5rem; body-md: Noto Serif Display 1rem; label-caps: Space Mono 0.875rem
- Radius/spacing: 4px/8px, base 4px/8px
### futuristic (futuristic)
- Vibe: Forward-looking design with tech-inspired typography, modern layouts, and a sleek, innovation-driven aesthetic.
- Palette: primary #3B82F6, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Audiowide 3rem; body-md: Roboto 1rem; label-caps: Anonymous Pro 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### geometric (geometric)
- Vibe: Geometric, structured design with clean typography, neutral colors, precise shapes, and intuitive layouts that stay out of the way.
- Palette: primary #3B82F6, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Inter 2rem; body-md: Inter 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### glassmorphism (glassmorphism)
- Vibe: Frosted glass effect with translucent layers, subtle blur, and luminous borders for depth and modern elegance.
- Palette: primary #1856FF, secondary #3A344E, success #07CA6B, warning #E89558, danger #EA2143, surface #FFFFFF, text #141414
- Fonts: h1: Plus Jakarta Sans 3rem; body-md: Plus Jakarta Sans 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 8px/16px
### gradient (gradient)
- Vibe: Smooth color transitions and gradient-rich surfaces for modern, playful interfaces with visual depth.
- Palette: primary #990FFA, secondary #E60076, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Space Grotesk 2.25rem; body-md: Montserrat 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 8px/16px
### "immersive" (immersive)
- Vibe: "An immersive, interactive, exhibit-style interface that blends storytelling, animation, and gamified elements to create a playful, experience-driven journey...
- Palette: primary #00592B, secondary #0023D1, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Oswald 2rem; body-md: Oswald 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### "impeccable" (impeccable)
- Vibe: "A modern, graphic, editorial-poster aesthetic - warm and confident - built on alternating cream and burnt orange sections, an amber brand color."
- Palette: primary #CC8800, secondary #C55221, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Chakra Petch 2rem; body-md: Chakra Petch 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### levels (levels)
- Vibe: Conversion-focused design that removes friction and guides users toward action through clarity, trust, and speed.
- Palette: primary #27272A, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Inter 2rem; body-md: Inter 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### lingo (lingo)
- Vibe: Playful, minimal design with bright colors, rounded shapes, tactile 3D borders, and friendly illustrations for approachable interfaces.
- Palette: primary #58cc02, secondary #ce82ff, success #58cc02, warning #ffc800, danger #ff4b4b, surface #FFFFFF, text #3c3c3c
- Fonts: h1: Nunito 2rem; body-md: Nunito 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### material (material)
- Vibe: Google's Material Design with layered surfaces, dynamic theming, built-in motion, and responsive cross-platform patterns.
- Palette: primary #6442D6, secondary #C8B3FD, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Roboto 2rem; body-md: Inter 1rem; label-caps: Fira Code 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### "matrix" (matrix)
- Vibe: "A cyber-slick, dark-only Matrix-inspired interface defined by minimalist fashion, high-tech digital elements"
- Palette: primary #2DB58A, secondary #0B0C14, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Space Mono 2rem; body-md: Space Mono 1rem; label-caps: Space Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### minimal (minimal)
- Vibe: Stripped-back design emphasizing whitespace, clean typography, and restrained color for maximum clarity and focus.
- Palette: primary #0C0C09, secondary #312C85, success #16A34A, warning #D97706, danger #DC2626, surface #F4F4F1, text #0C0C09
- Fonts: h1: Inter 3rem; body-md: Open Sans 1rem; label-caps: Inconsolata 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### modern (modern)
- Vibe: Contemporary editorial style with serif typography, minimal palettes, and clean layouts for polished digital products.
- Palette: primary #553F83, secondary #111111, success #16A34A, warning #D97706, danger #DC2626, surface #553F83, text #ffffff
- Fonts: h1: IBM Plex Serif 2rem; body-md: IBM Plex Serif 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### mono (mono)
- Vibe: Monospace-driven, matrix-inspired design with high-contrast elements, compact density, and a hacker-chic aesthetic.
- Palette: primary #37F712, secondary #00A6F4, success #00A63D, warning #FE9900, danger #FF2157, surface #E7E5E4, text #78716B
- Fonts: h1: Space Mono 3rem; body-md: Space Mono 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### neobrutalism (neobrutalism)
- Vibe: Modern take on brutalism with bold borders, vivid accent colors, and raw, high-contrast layouts on warm surfaces.
- Palette: primary #FDC800, secondary #432DD7, success #16A34A, warning #D97706, danger #DC2626, surface #FBFBF9, text #1C293C
- Fonts: h1: Inter 2.1875rem; body-md: Inter 0.9375rem; label-caps: JetBrains Mono 0.8125rem
- Radius/spacing: 4px/8px, base 4px/8px
### neon (neon)
- Vibe: Electric neon glow effects with high-contrast color pairings for bold, attention-grabbing interfaces.
- Palette: primary #BBF351, secondary #00BCFF, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: STIX Two Text 2.5rem; body-md: Roboto 1rem; label-caps: Source Code Pro 0.875rem
- Radius/spacing: 4px/8px, base 4px/8px
### neumorphism (neumorphism)
- Vibe: Soft, extruded UI elements with inner and outer shadows on monochromatic surfaces for a tactile, embedded look.
- Palette: primary #006666, secondary #F1F2F5, success #00A63D, warning #FE9900, danger #FF2157, surface #E7E5E4, text #1E2938
- Fonts: h1: Space Mono 3rem; body-md: Space Mono 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### pacman (pacman)
- Vibe: Retro arcade-inspired design with pixel fonts, dotted borders, playful high-contrast colors, and 8-bit game aesthetics.
- Palette: primary #2A3FE5, secondary #F4B9B0, success #16A34A, warning #D97706, danger #DC2626, surface #000000, text #111827
- Fonts: h1: Press Start 2P 3rem; body-md: Press Start 2P 1rem; label-caps: Space Mono 0.75rem
- Radius/spacing: 4px/8px, base 8px/16px
### paper (paper)
- Vibe: Paper-textured, print-inspired design with minimal colors, clean serif/sans typography, and tactile surface qualities.
- Palette: primary #111111, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Montserrat 2.5rem; body-md: Roboto 1rem; label-caps: PT Mono 0.875rem
- Radius/spacing: 4px/8px, base 4px/8px
### perspective (perspective)
- Vibe: Spatial depth design with isometric views, vanishing points, and layered elements that guide attention through 3D-like realism.
- Palette: primary #00BD7D, secondary #00BD7D, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Oswald 2rem; body-md: Poppins 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### power (power)
- Vibe: High-end dark aesthetic with bold headings, monochromatic palette, and premium feel for premium brand experiences.
- Palette: primary #FAFAFA, secondary #FAFAFA, success #16A34A, warning #D97706, danger #DC2626, surface #000000, text #ffffff
- Fonts: h1: Oswald 3rem; body-md: Oswald 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 8px/16px
### premium (premium)
- Vibe: Apple-inspired premium aesthetic with precise spacing, modern typography, and a refined, polished visual language.
- Palette: primary #3B82F6, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Inter 2.25rem; body-md: Inter 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### professional (professional)
- Vibe: Polished, business-ready design with modern typography, structured layouts, and a trustworthy visual identity.
- Palette: primary #FECE14, secondary #000000, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Poppins 3rem; body-md: Poppins 1rem; label-caps: IBM Plex Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### pulse (pulse)
- Vibe: Dynamic, vibrant style with thick borders, geometric shapes, high-contrast colors, and expressive typography conveying motion and vitality.
- Palette: primary #EA580B, secondary #F59E0B, surface #FDBA74, text #EA580C
- Fonts: h1: Limelight 3rem; body-md: Limelight 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### refined (refined)
- Vibe: Carefully curated, modern minimal style with elegant serif typography and understated, sophisticated palettes.
- Palette: primary #3B82F6, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Playfair Display 2rem; body-md: Playfair Display 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### retro (retro)
- Vibe: Throwback design with vintage-inspired typography, high-contrast retro palettes, and nostalgic visual elements.
- Palette: primary #3B82F6, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Macondo 3rem; body-md: Macondo 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### "riso" (riso)
- Vibe: "A playful, joyful, two-color risograph print aesthetic built on a single warm off-white paper surface running through every section"
- Palette: primary #F237A1, secondary #2C40A7, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Space Grotesk 2rem; body-md: Space Grotesk 1rem; label-caps: Overpass Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### roku (roku)
- Vibe: App dashboard with purple-themed aesthetic, top-bar navigation, card-based layouts, and developer-first workflows.
- Palette: primary #9333ea, secondary #a855f7, success #10b981, warning #f59e0b, danger #ef4444, surface #FFFFFF, text #09090b
- Fonts: h1: Inter 2rem; body-md: Inter 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### "sega" (sega)
- Vibe: "A playful, arcade-inspired interface for games - built on the VT323 pixel typeface, hard-edged 0px corners, chunky pill buttons that physically press into s...
- Palette: primary #4502FF, secondary #FFDA14, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: VT323 2.1875rem; body-md: VT323 0.9375rem; label-caps: JetBrains Mono 0.8125rem
- Radius/spacing: 4px/8px, base 4px/8px
### shadcn (shadcn)
- Vibe: Shadcn/ui-inspired design with minimal, clean components, monochrome palette, and utility-first patterns.
- Palette: primary #000000, secondary #111111, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Geist 2rem; body-md: Geist 1rem; label-caps: Fira Code 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### "sketch" (sketch)
- Vibe: "A friendly, hand-drawn sketch interface inspired by pencil illustrations on warm cream paper. Soft teal brand accents, hand-written display headings, rounde...
- Palette: primary #1DAD97, secondary #F4EDE0, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Delicious Handrawn 2rem; body-md: Delicious Handrawn 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### skeumorphism (skeumorphism)
- Vibe: Real-world mimicry with textured surfaces, 3D effects, and familiar physical metaphors for intuitive digital interfaces.
- Palette: primary #FA3C00, secondary #F08321, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Germania One 2rem; body-md: Roboto 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### sleek (sleek)
- Vibe: Modern minimalist aesthetic with clean lines, intentional color palette, subtle interactions, and consistent spacing.
- Palette: primary #3B82F6, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Inter 3rem; body-md: Inter 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 8px/16px
### spacious (spacious)
- Vibe: Generous whitespace, consistent padding, and grid-based layouts for clean, readable, and breathing interfaces.
- Palette: primary #3B82F6, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Montserrat 2.25rem; body-md: Open Sans 1rem; label-caps: IBM Plex Mono 0.75rem
- Radius/spacing: 4px/8px, base 8px/16px
### square (square)
- Vibe: Graceful, refined aesthetic with delicate typography, minimal palettes, and polished layouts that exude sophistication.
- Palette: primary #3B82F6, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Google Sans 2.5rem; body-md: Google Sans 1rem; label-caps: Anonymous Pro 0.875rem
- Radius/spacing: 4px/8px, base 4px/8px
### stitch (stitch)
- Vibe: Clean, high-contrast enterprise design for data-driven workflows with intuitive drag-and-drop patterns and structured layouts.
- Palette: primary #072C2C, secondary #FF5F03, success #16A34A, warning #D97706, danger #DC2626, surface #EDEADE, text #111827
- Fonts: h1: Oswald 3rem; body-md: Ubuntu 1rem; label-caps: Ubuntu Mono 0.75rem
- Radius/spacing: 4px/8px, base 8px/16px
### storytelling (storytelling)
- Vibe: Narrative-driven design using visuals, copy, and interaction to guide users through engaging, emotionally resonant journeys.
- Palette: primary #3B82F6, secondary #8B5CF6, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: Abril Fatface 3rem; body-md: Inter 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### "terracotta" (terracotta)
- Vibe: "A sun-baked, clay-toned editorial interface built on warm cream surfaces, ink-brown headlines set in a display serif, and a single terracotta accent."
- Palette: primary #C56A3C, secondary #F3E9D8, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #111827
- Fonts: h1: DM Serif Display 2.5rem; body-md: DM Serif Display 1rem; label-caps: JetBrains Mono 0.875rem
- Radius/spacing: 4px/8px, base 4px/8px
### tetris (tetris)
- Vibe: Classic block-game inspired design with playful colors, bold display fonts, and compact, high-energy layouts.
- Palette: primary #1C202B, secondary #7107E7, success #16A34A, warning #D97706, danger #DC2626, surface #DFE7FF, text #1C398E
- Fonts: h1: Bangers 3rem; body-md: Bangers 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px
### vibrant (vibrant)
- Vibe: Lively, colorful design with bold playful typography, warm accents, and dynamic visual energy.
- Palette: primary #7C61D4, secondary #EAAE87, success #16A34A, warning #D97706, danger #DC2626, surface #FFFFFF, text #2F281D
- Fonts: h1: Fascinate 2.5rem; body-md: Noto Sans 1rem; label-caps: Fira Code 0.875rem
- Radius/spacing: 4px/8px, base 2px/4px
### vintage (vintage)
- Vibe: 1950s-1990s nostalgia with skeuomorphic touches, grainy textures, retro color palettes, and pixel-style typography.
- Palette: primary #008080, secondary #C0C0C0, success #16A34A, warning #D97706, danger #DC2626, surface #C0C0C0, text #000000
- Fonts: h1: Silkscreen 2rem; body-md: Silkscreen 1rem; label-caps: JetBrains Mono 0.75rem
- Radius/spacing: 4px/8px, base 4px/8px

## Anti-slop rules

- Never mix two packs in one product.
- Never invent a palette when a pack defines one; derive shades from it.
- Fonts: max 2 families + 1 mono, per the pack stack.
- If the user names a style not in this catalog, describe its rules back to
  them (palette, type, density) and confirm before designing.
