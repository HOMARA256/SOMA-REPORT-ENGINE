(function () {
  var key = "soma.display-theme";
  var allowed = ["light", "dark", "system", "high-contrast"];
  var preference = "light";
  try {
    var saved = window.localStorage.getItem(key);
    if (allowed.indexOf(saved) !== -1) preference = saved;
  } catch (_) { /* Private browsing can disable storage. */ }
  document.documentElement.dataset.theme = preference;
  var dark = preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.colorMode = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#101827" : "#0b3a78");
})();
