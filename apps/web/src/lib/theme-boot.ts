export const THEME_KEY = "igloo.theme";

/**
 * Runs before first paint (inlined in the root layout) so the page never
 * flashes the wrong theme: the saved choice, else the system setting.
 */
export const themeBootScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t;}catch(e){}})();`;
