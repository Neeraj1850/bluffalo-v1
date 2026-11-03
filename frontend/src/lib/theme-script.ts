export const THEME_STORAGE_KEY = "np-theme";

/**
 * Runs before first paint (inlined in <head>) so a saved light theme
 * never flashes dark. Dark stays the default.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}})();`;
