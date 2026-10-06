// Draws a small yellow number on everything you can click ("Stuffy, show numbers").
window.stuffyNumbers.onShow((items) => {
  document.body.innerHTML = '';
  for (const it of items) {
    const tag = document.createElement('div');
    tag.className = 'n';
    tag.textContent = it.n;
    tag.style.left = `${it.x}px`;
    tag.style.top = `${it.y}px`;
    document.body.appendChild(tag);
  }
});
