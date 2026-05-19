# Design System

## Overview

AI Novel is a professional AI-assisted novel-writing platform with a clean, warm, and literary visual identity. The design language is defined by an ultra-warm ivory background (`#FDFDFC`), near-black ink typography (`#0C0C0C`), and a restrained monochrome palette. Layouts are spacious, card-based, and sectioned with subtle borders. The brand uses Instrument Serif for major headings (conveying literary authority) and Instrument Sans for body copy and UI elements. Motion is subtle — CSS fade-in-up animations, hover card lifts, and soft gradient blurs create a polished, breathing quality without distracting from the writing experience.

## Colors

- **Background**: `#FDFDFC` — ultra-warm ivory, the primary canvas
- **Text Primary**: `#0C0C0C` — near-black ink for headings and key copy
- **Text Secondary**: `#4A4A44` — warm dark gray for body text
- **Text Muted**: `#82827C` — subdued gray for supporting text
- **Text Dim**: `#B5B5AF` — light gray for labels and tertiary elements
- **Primary Action**: `#1A1A1A` — pure ink for buttons and interactive elements
- **Primary Hover**: `#333333` — lighter ink for hover states
- **Border Subtle**: `#EEEBE6` — warm light border for cards and dividers
- **Border Strong**: `#DCD7CF` — stronger border for emphasis
- **Surface White**: `#FFFFFF` — pure white for cards and elevated surfaces
- **Accent Emerald**: `#00BC7D` — used in the Drafting Agent feature card
- **Accent Violet**: `#8E51FF` — used in the Memory RAG feature card
- **Secondary Surface**: `#F8F8F5` — slightly cooler light surface

## Typography

- **Serif**: Instrument Serif (700). Major headings only. Large sizes (60-128px), tight tracking. Conveys literary gravitas and creative authority.
- **Sans-Serif**: Instrument Sans (400, 500, 700). Body copy, UI elements, labels, buttons. Body at 15-16px, labels at 9-10px with high letter-spacing.
- **Heading Scale**: H1 hero at 128px, H2 section at 48-60px, H3 card at 20px
- **Body Scale**: Standard body at 15-16px, supporting copy at 18-24px

## Elevation

- **Flat with borders**: Depth is created through 1px subtle borders (`#EEEBE6`) rather than shadows. Cards sit on the same plane as the background, separated by border lines.
- **Glass navigation**: The sticky nav bar uses `backdrop-blur-xl` with `bg-white/70` for a frosted glass effect.
- **Hover lift**: Cards lift on hover (`-translate-y-2`) with a premium shadow (`shadow-premium`) and border color transition.
- **Gradient blurs**: Hero and CTA sections use large blurred circles (`blur-3xl`) as ambient background elements with 5-20% opacity.

## Components

- **Ink Logo Mark**: A dark rounded square (`#1A1A1A`) containing a white "A" letter — the primary brand mark, also used as favicon.
- **Status Badge**: Small pill with a pulsing colored dot, ultra-condensed uppercase label with 0.2em tracking. Used for the "AI Engine Ready" eyebrow above the hero.
- **Feature Cards**: Large rounded cards (32px border-radius) with icon circles, numbered labels (01/02/03), heading, and description. Each card has a unique accent color circle with inner glow.
- **Primary CTA Button**: Full-ink rounded button (`#1A1A1A` bg, white text, 16px border-radius) with strong shadow and active scale press.
- **Secondary Button**: Outlined or lighter button for secondary actions.
- **Dark CTA Card**: A large dark card (`#1A1A1A` bg with white text, 48px border-radius) with a gradient blur orb in the corner — used for the bottom CTA.
- **Footer**: Multi-column link grid with uppercase section labels (0.2em tracking), muted links, and a bottom bar with copyright.

## Do's and Don'ts

### Do's

- Use warm ivory (`#FDFDFC`) as the primary background — never pure cold white for large surfaces
- Use Instrument Serif exclusively for major headings — it defines the literary brand voice
- Keep borders subtle at 1px with warm tones (`#EEEBE6`)
- Use 32-48px border-radius on cards for a soft, approachable feel
- Use gradient blur orbs sparingly as ambient background elements, not as primary visual features

### Don'ts

- Do not use bright, saturated background colors — the canvas stays warm and neutral
- Do not use standard drop shadows as the primary depth mechanism — prefer borders and hover lifts
- Do not use sans-serif for hero or section headings — the serif voice is non-negotiable
- Do not use cold grays — all grays are warm-toned (brown-leaning)
- Do not make the interface feel like a generic SaaS dashboard — it's a writer's studio

