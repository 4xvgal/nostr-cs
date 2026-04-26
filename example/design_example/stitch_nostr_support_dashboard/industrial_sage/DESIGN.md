---
name: Industrial Sage
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#40493d'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f1f1f1'
  outline: '#707a6c'
  outline-variant: '#bfcaba'
  surface-tint: '#1b6d24'
  primary: '#0d631b'
  on-primary: '#ffffff'
  primary-container: '#2e7d32'
  on-primary-container: '#cbffc2'
  inverse-primary: '#88d982'
  secondary: '#286b33'
  on-secondary: '#ffffff'
  secondary-container: '#abf4ac'
  on-secondary-container: '#2e7238'
  tertiary: '#4d5950'
  on-tertiary: '#ffffff'
  tertiary-container: '#657167'
  on-tertiary-container: '#e8f5e9'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#a3f69c'
  primary-fixed-dim: '#88d982'
  on-primary-fixed: '#002204'
  on-primary-fixed-variant: '#005312'
  secondary-fixed: '#abf4ac'
  secondary-fixed-dim: '#90d792'
  on-secondary-fixed: '#002107'
  on-secondary-fixed-variant: '#07521d'
  tertiary-fixed: '#d9e6da'
  tertiary-fixed-dim: '#bdcabe'
  on-tertiary-fixed: '#131e17'
  on-tertiary-fixed-variant: '#3e4a41'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
typography:
  h1:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  h2:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  h3:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  code:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin: 24px
---

## Brand & Style

This design system is engineered for high-density enterprise environments where clarity, organization, and focus are paramount. Drawing inspiration from modern physical office spaces and industrial control software, the aesthetic leans heavily into **Corporate Minimalism**. 

The brand personality is reliable, systematic, and calm. It avoids visual noise in favor of high-functioning utility. By utilizing a "White-Label" surface philosophy—where the primary canvas is pure white—the interface feels airy yet structured. The emotional response should be one of "controlled efficiency," providing users with a digital workspace that feels as intentional as a well-organized physical desk.

## Colors

The palette is anchored in a monochromatic green spectrum to promote cognitive ease and focus. 

- **Primary Canvas**: Pure White (#FFFFFF) is used for all main work surfaces to maximize contrast with text and data.
- **Action Elements**: Deep Forest Green (#2E7D32) serves as the primary brand color for high-emphasis actions, successful states, and navigation headers.
- **Accents & Highlights**: Mint Green (#81C784) is used for active states and medium-emphasis components. 
- **Subtle Containers**: Sage Tint (#E8F5E9) provides a soft background for read-only areas, banners, or grouped information, differentiating them from the white canvas without adding visual weight.
- **Structural Lines**: A cool Neutral Gray (#E0E0E0) is used for all subtle borders, creating the "industrial" feel of partitioned spaces.

## Typography

This design system utilizes **Inter** exclusively to lean into its utilitarian and systematic roots. The type hierarchy is designed for legibility in complex data views.

- **Headlines**: Use tighter letter spacing and semi-bold weights to ground the page. 
- **Body Text**: Set primarily at 14px (body-md) for enterprise density, ensuring long-form data remains readable.
- **Labels**: Utilize a slightly heavier weight (500) and increased letter spacing for small-caps or metadata to ensure they remain distinct from body content.
- **Alignment**: Strict left-alignment is preferred across all modules to reinforce the organized, professional feel.

## Layout & Spacing

The layout philosophy follows a **Fixed-Fluid Hybrid Grid**. Main containers adhere to a 12-column grid system with 16px gutters, while individual modules within cards use an 8px (2x base) spacing rhythm.

- **Margins**: Use 24px (xl) page margins to provide breathing room against the industrial, high-density content.
- **Density**: Components should favor a "Compact" vertical rhythm to allow more information to be visible on-screen simultaneously, reflecting professional software standards.
- **Alignment**: Elements must snap to the 4px grid. No "floating" elements; everything should feel docked and intentional.

## Elevation & Depth

This design system rejects heavy shadows in favor of **Tonal Layering and Low-Contrast Outlines**.

- **Surfaces**: Depth is communicated via subtle background shifts. The primary background is #F5F5F5, while active work surfaces (cards, panels) are #FFFFFF.
- **Borders**: All containers are defined by 1px solid borders (#E0E0E0). This "partitioned" look mimics professional blueprints and office schematics.
- **Shadows**: When elevation is strictly necessary (e.g., dropdowns, modals), use a single "Industrial Shadow": `0px 2px 4px rgba(0, 0, 0, 0.05)`. It should be barely perceptible, serving only to separate the element from the layer immediately below it.

## Shapes

The shape language is strictly geometric and disciplined. 

- **Corners**: All UI elements (buttons, inputs, cards, tags) use a uniform **4px radius (ROUND_FOUR)**. This provides a subtle "softening" of the industrial edge without becoming playful or informal.
- **Consistency**: Icons should follow a linear, 2px stroke weight with slight rounding to match the component corners.

## Components

- **Buttons**: Primary buttons use the Forest Green (#2E7D32) background with white text. Secondary buttons use a white background with a #E0E0E0 border and Forest Green text. No gradients.
- **Input Fields**: 1px border (#E0E0E0) that shifts to #2E7D32 on focus. Background remains #FFFFFF. Labels are placed above the field in `label-sm` typography.
- **Cards**: Use a white background, 1px border (#E0E0E0), and the 4px corner radius. No shadow unless the card is interactive/hoverable.
- **Chips/Tags**: Use the Sage Tint (#E8F5E9) as a background with Forest Green text. These should have the same 4px radius as other components.
- **Checkboxes & Radios**: Square-ish (4px radius) for checkboxes. Use Forest Green for selected states.
- **Data Tables**: The hallmark of this design system. Use 1px horizontal dividers only. Header rows should have a very subtle #F5F5F5 background to distinguish them from the data rows.
- **Navigation**: Vertical sidebar navigation with a light gray border and a Sage Tint (#E8F5E9) active state indicator.