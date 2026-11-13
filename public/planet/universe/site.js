(() => {
  for (const event of ['copy', 'cut', 'contextmenu', 'dragstart']) document.addEventListener(event, e => e.preventDefault());
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && ['c', 's', 'p', 'u'].includes(e.key.toLowerCase())) e.preventDefault();
  });
})();
