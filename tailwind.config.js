export default {
    content: ["./index.html", "./src/**/*.{vue,js,ts}"],
    corePlugins: { preflight: false },
    theme: {
        extend: {
            colors: {
                primary: "#3C8527",
                "primary-dark": "#2A6419",
                "accent-diamond": "#50E0D4",
                "background-dark": "#1D1D1D",
                "surface-dark": "#282828",
                "border-dark": "#3E3E3E",
                "text-secondary": "#A0A0A0",
                "status-bg": "#22252A",
                "status-blue": "#1E88E5",
                "status-green": "#10B981",
            },
            boxShadow: {
                'pixel': '4px 4px 0px 0px rgba(0,0,0,0.5)',
                'pixel-sm': '2px 2px 0px 0px rgba(0,0,0,0.5)',
            },
            fontFamily: {
                display: ["Space Grotesk", "sans-serif"],
                body: ["Noto Sans", "sans-serif"],
                pixel: ["VT323", "monospace"],
            },
            borderRadius: {
                none: "0", DEFAULT: "0", sm: "0", md: "0", lg: "0", xl: "0", "2xl": "0", "3xl": "0", full: "0",
            },
        },
    },
}
