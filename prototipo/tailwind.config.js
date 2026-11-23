/** Tokens de diseño copiados del proyecto Stitch "CittoFHIR Data Curator" (DESIGN.md). */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      "colors": {
        "surface-tint": "#495f82",
        "inverse-on-surface": "#eef1f8",
        "on-error-container": "#93000a",
        "on-surface-variant": "#44474e",
        "tertiary": "#190039",
        "background": "#f8f9ff",
        "tertiary-fixed-dim": "#d8b9ff",
        "on-tertiary-fixed-variant": "#55387d",
        "surface-dim": "#d7dae1",
        "on-secondary-container": "#004b69",
        "surface-bright": "#f8f9ff",
        "surface": "#f8f9ff",
        "on-tertiary-fixed": "#28054f",
        "surface-container": "#ebeef5",
        "on-surface": "#181c21",
        "on-primary-fixed-variant": "#314769",
        "surface-container-low": "#f1f4fb",
        "inverse-surface": "#2d3136",
        "primary-fixed-dim": "#b1c7f0",
        "on-background": "#181c21",
        "primary": "#001026",
        "on-secondary-fixed-variant": "#004c6b",
        "error": "#ba1a1a",
        "outline-variant": "#c4c6cf",
        "secondary-fixed": "#c6e7ff",
        "on-error": "#ffffff",
        "on-secondary-fixed": "#001e2d",
        "on-tertiary": "#ffffff",
        "on-primary-container": "#778db2",
        "on-primary": "#ffffff",
        "tertiary-container": "#321259",
        "inverse-primary": "#b1c7f0",
        "tertiary-fixed": "#eddcff",
        "secondary": "#00658d",
        "secondary-container": "#41befd",
        "surface-container-lowest": "#ffffff",
        "surface-container-highest": "#e0e2e9",
        "primary-fixed": "#d5e3ff",
        "surface-variant": "#e0e2e9",
        "surface-container-high": "#e5e8ef",
        "error-container": "#ffdad6",
        "secondary-fixed-dim": "#81cfff",
        "on-secondary": "#ffffff",
        "outline": "#74777f",
        "on-primary-fixed": "#001c3b",
        "on-tertiary-container": "#9d7dc9",
        "primary-container": "#0b2545",
        "clinical-success": "#10B981",
        "clinical-success-ink": "#065F46",
        "clinical-warning": "#B54708",
        "clinical-warning-ink": "#92400E",
        "clinical-critical": "#B42318",
        "clinical-critical-ink": "#991B1B",
        "diagnostic-cyan": "#00A3E0",
        "bio-violet": "#6A4C93",
        "hairline": "#E2E5EA",
        "specimen-frame": "#14171C"
      },
      "borderRadius": {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "0.75rem"
      },
      "spacing": {
        "margin": "1rem",
        "space-xs": "0.25rem",
        "gutter-lg": "1.5rem",
        "space-lg": "1rem",
        "space-xl": "1.5rem",
        "space-sm": "0.5rem",
        "gutter": "1rem",
        "margin-lg": "2.5rem",
        "margin-md": "1.5rem",
        "space-md": "0.75rem",
        "gutter-md": "1.25rem"
      },
      "fontFamily": {
        "body-sm": [
          "Inter"
        ],
        "code-mono-bold": [
          "JetBrains Mono"
        ],
        "code-mono": [
          "JetBrains Mono"
        ],
        "body-semibold": [
          "Inter"
        ],
        "headline-md": [
          "Plus Jakarta Sans"
        ],
        "headline-sm": [
          "Plus Jakarta Sans"
        ],
        "tag-xs": [
          "Inter"
        ],
        "display-lg-mobile": [
          "Plus Jakarta Sans"
        ],
        "label-sm": [
          "Inter"
        ],
        "body-base": [
          "Inter"
        ],
        "display-lg": [
          "Plus Jakarta Sans"
        ]
      },
      "fontSize": {
        "body-sm": [
          "13px",
          {
            "lineHeight": "19.5px",
            "fontWeight": "400"
          }
        ],
        "code-mono-bold": [
          "12px",
          {
            "lineHeight": "18px",
            "fontWeight": "600"
          }
        ],
        "code-mono": [
          "12px",
          {
            "lineHeight": "18px",
            "fontWeight": "400"
          }
        ],
        "body-semibold": [
          "15px",
          {
            "lineHeight": "22.5px",
            "fontWeight": "600"
          }
        ],
        "headline-md": [
          "20px",
          {
            "lineHeight": "28px",
            "letterSpacing": "-0.01em",
            "fontWeight": "600"
          }
        ],
        "headline-sm": [
          "17px",
          {
            "lineHeight": "24px",
            "fontWeight": "600"
          }
        ],
        "tag-xs": [
          "11px",
          {
            "lineHeight": "16px",
            "letterSpacing": "0.02em",
            "fontWeight": "600"
          }
        ],
        "display-lg-mobile": [
          "26px",
          {
            "lineHeight": "34px",
            "letterSpacing": "-0.015em",
            "fontWeight": "700"
          }
        ],
        "label-sm": [
          "13px",
          {
            "lineHeight": "18px",
            "fontWeight": "500"
          }
        ],
        "body-base": [
          "15px",
          {
            "lineHeight": "22.5px",
            "fontWeight": "400"
          }
        ],
        "display-lg": [
          "32px",
          {
            "lineHeight": "40px",
            "letterSpacing": "-0.02em",
            "fontWeight": "700"
          }
        ]
      }
    },
  },
  plugins: [],
};
