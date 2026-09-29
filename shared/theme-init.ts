/**
 * Applies the saved theme before first paint (no light/dark flash). Inlined into index.html at
 * build time to avoid a render-blocking request; the Content-Security-Policy allows exactly this
 * script by its SHA-256 hash, so inline scripts in general stay blocked.
 */
export const THEME_INIT_SCRIPT =
  '(function(){try{var t=localStorage.getItem("learnify-theme");var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})();';
