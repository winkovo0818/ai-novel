# Storyboard — AI Novel Product Demo

**Format:** 1920×1080
**Audio:** TTS voiceover + underscore + SFX
**VO direction:** Male voice, calm and confident. Literary register — warm, measured. Pauses between sentences are intentional. "Audiobook narrator meets Apple keynote."
**Style basis:** DESIGN.md — warm ivory backgrounds, near-black ink typography, Instrument Serif headings, subtle borders, gradient blur orbs.

---

## Global Guardrails

- Brand identity is typography-first. Every beat features the serif/sans-serif pairing.
- Primary surface is warm ivory (`#FDFDFC`), cards are white (`#FFFFFF`), primary action is ink (`#1A1A1A`).
- No dark full-frame gradients. Use solid surfaces with localized radial glows.
- 2-3 visual techniques per beat: CSS fade-in-up, SVG path drawing, per-word kinetic typography, counter animations, Ken Burns zoom, float loops.
- Every beat must have foreground/midground/background depth layers.

**Underscore:** Minimal warm piano. Soft, never competing with VO. Swells during Beat 4, peaks at Beat 6. Drops to near-silence during Beat 1 and Beat 3.

---

## Asset Audit

No downloadable image assets were captured. All visuals are CSS/HTML-built from DESIGN.md.

| Visual Element | Type | Assign to Beat | Role |
|---------------|------|----------------|------|
| "A" Logo Mark | CSS shape | Beat 1, 3, 6 | Brand opener, solution, closer |
| Gradient blur orb | CSS radial | Beat 1, 4, 6 | Ambient depth |
| Feature card | CSS card | Beat 2, 4, 5 | Feature reveals |
| Pulse dot badge | CSS | Beat 3 | AI-ready indicator |
| Ink CTA pill | CSS | Beat 6 | Call to action |
| Serif heading | Typography | All beats | Brand voice |
| Sans-serif body | Typography | All beats | Supporting copy |

---

## BEAT 1 — THE SPARK (0.00–3.00s)

**VO:** "Every great novel begins with a single spark."

**Concept:** A single warm glowing dot centered on ivory canvas. Pulses softly, expands into a radial glow. Serif heading fades in above. Quiet, contemplative, inviting.

**Visual:** Center: small glowing dot (`#1A1A1A`, warm radial glow 10% opacity) pulses at 1.5s intervals. Above it: "Every Great Novel" fades in — Instrument Serif, 64px, `#0C0C0C`, per-word staggered 50ms delay. Below: gradient blur orb (400px, `#FDFDFC`→transparent) breathes (scale 1.0→1.05, sine.inOut, yoyo).

**Layers:** Ivory bg → breathing orb → pulsing dot + serif heading.

**Techniques:** Radial glow breathing, per-word fade-in typography, scale pulse.

**SFX:** Silence 1.5s, then soft piano strike on "spark."

**Transition OUT:** Fade to white 0.4s, dot scales 3x and dissolves.

---

## BEAT 2 — THE CHALLENGE (3.00–7.00s)

**VO:** "But turning that spark into a million-word epic takes more than inspiration — it takes infrastructure."

**Concept:** Structured layout. Left: feature card with body text. Right: SVG network of interconnected nodes drawing themselves — representing "infrastructure."

**Visual:** White bg with subtle horizontal manuscript lines (`#EEEBE6`, 30% opacity). Left: card (32px radius, 1px `#EEEBE6` border, 80px padding) with VO text as Instrument Sans 18px `#4A4A44`. Card fades in (opacity 0→1, y 30→0, 0.6s power2.out). Right: SVG nodes and lines in `#B5B5AF` drawing over 2.5s, then nodes pulse gently.

**Layers:** White bg with lines → SVG node network → feature card.

**Techniques:** SVG path drawing, card fade-in, node pulse loop.

**SFX:** Paper-rustle texture. Low ambient pad enters at 3.5s.

**Transition OUT:** Nodes converge to center forming "A" logo. Hard cut.

---

## BEAT 3 — THE SOLUTION (7.00–12.00s)

**VO:** "Meet AI Novel. The professional AI-assisted writing workbench built for serious long-form storytelling."

**Concept:** Confident brand reveal. "A" logo center-stage, brand name below, subtitle badge. Clean, authoritative, breathing room.

**Visual:** Center: "A" logo — `#1A1A1A` rounded square (80px, 16px radius) with white "A" (Instrument Serif 700, 48px) — fades in from converging nodes (0.4s). Below: "AI Novel" — Instrument Serif 700, 72px, `#0C0C0C`, fade + rise (y 20→0, 0.5s power2.out). After 0.8s: "PRO STUDIO" badge — Instrument Sans 700, 10px, `#B5B5AF`, 0.2em tracking. Behind logo: warm radial glow (600px) breathes.

**Layers:** Ivory bg → breathing glow → logo + brand + badge.

**Techniques:** CSS fade-in-up, scale settle, radial glow breathing.

**SFX:** Clean chime on logo reveal. Underscore swells.

**Transition OUT:** Logo scales 0.3, moves top-left. CSS: scale 0.3, x -800, y -400, 0.5s power2.inOut.

---

## BEAT 4 — SYNTHETIC BIBLE (12.00–18.00s)

**VO:** "Our Synthetic Bible engine builds deep character profiles, world rules, and multi-thread outlines before you write a single word."

**Concept:** Three feature cards animate in staggered from below. Each represents a Bible component. Connection line draws between them.

**Visual:** White bg with manuscript lines. Three cards (280px wide, 54px gap) enter staggered (y 80→0, opacity 0→1, 0.25s delay each, 0.5s power2.out):
1. Characters — ink dot, "角色图谱" serif heading, "深度角色设定" sans body.
2. World — emerald dot (`#00BC7D`), "世界规则" serif heading, "物理与势力体系" sans body.
3. Outline — violet dot (`#8E51FF`), "多线大纲" serif heading, "章节节拍编排" sans body.

After entry, SVG line draws connecting the three dots. Cards float gently (y ±4px, sine.inOut, yoyo).

**Layers:** White bg + lines → connecting SVG → floating cards.

**Techniques:** Staggered card entrance, floating yoyo, SVG line drawing.

**SFX:** Three soft ticks as cards land. Underscore swells.

**Transition OUT:** Cards dissolve, center card emerges. Scale 0→1, 0.4s expo.out.

---

## BEAT 5 — DRAFTING AGENT (18.00–24.00s)

**VO:** "The Drafting Agent reads your entire bible and every previous chapter — then generates literary-grade prose that actually remembers your characters' voices."

**Concept:** Large central card with real-time typing effect. Orbiting Bible cards feed into it. Agent activity indicator glows.

**Visual:** Center: large card (800×400px, 32px radius, 1px `#EEEBE6` border, white bg). Text types character-by-character (Instrument Serif 700, 32px, `#0C0C0C`, ~80ms/char). Left edge: emerald pulse strip (`#00BC7D`, 10% opacity, 2px wide). Around: 4-5 small cards (120×80px, 16px radius) orbit in loose ellipse at varied speeds (8-12s orbit). Thin SVG lines connect orbiting cards to center.

**Layers:** Ivory bg + corner orb → orbiting Bible cards + lines → central prose card + pulse.

**Techniques:** Character typing effect, orbiting card animation, SVG lines, pulse indicator.

**SFX:** Soft keyboard clicks synced to typing. Agent "processing" hum.

**Transition OUT:** Cards collapse inward. Whip pan left: x -400, blur 24px, opacity 0.4, 0.3s power3.in.

---

## BEAT 6 — MEMORY + CLOSE (24.00–30.00s)

**VO:** "With built-in vector memory, no detail is ever lost. A passing remark from ten thousand words ago — retrieved, respected, woven back in. AI Novel. From spark to saga. Start your story."

**Concept:** Part A: constellation of memory nodes on dark card — RAG system visualized. Part B: brand mark returns with final CTA.

**Visual Part A (24.00–27.50s):** Dark ink card (`#1A1A1A`, 48px radius, centered, 900×500px) with 16-20 glowing nodes (white, emerald, violet, varying 4-12px). Thin connecting lines (`#FFFFFF` 20% opacity). On "retrieved": one node pulses bright, line draws to center. On "woven back in": center node glows. Constellation breathes (scale 1.0→1.02, sine.inOut, yoyo).

**Visual Part B (27.50–30.00s):** Constellation fades. "A" logo reappears center (larger than Beat 3). Below: "AI Novel" serif 72px. Below: "From Spark to Saga" sans-serif 18px `#4A4A44`. Bottom: CTA pill — "Start Your Story" — ink button white text, scale pulse (1.0→1.03, sine.inOut, yoyo). Warm orb breathes behind logo.

**Layers Part A:** Ivory bg → constellation card → active nodes.
**Layers Part B:** Ivory bg + orb → logo + brand → CTA button.

**Techniques:** Node constellation, SVG line drawing, radial glow, CTA scale pulse.

**SFX:** Chime cascade on connections. Final piano chord on brand reveal. Underscore fades over last 1.5s.

**Transition OUT:** Fade to ivory 0.8s. Logo holds 1s after audio, then fades.

---

## Production Architecture

```
videos/ai-novel-video/
├── index.html                      root — VO + underscore + beat orchestration
├── DESIGN.md                       brand reference
├── SCRIPT.md                       narration text
├── STORYBOARD.md                   THIS FILE
├── transcript.json                 word-level timestamps (Step 5)
├── narration.wav                   TTS audio (Step 5)
├── capture/                        captured website data
│   ├── screenshots/
│   ├── assets/
│   └── extracted/
└── compositions/
    ├── beat-1-spark.html
    ├── beat-2-challenge.html
    ├── beat-3-solution.html
    ├── beat-4-bible.html
    ├── beat-5-agent.html
    └── beat-6-memory.html
```

