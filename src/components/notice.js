export function showNotice(message) {
  const notice = document.createElement('div');

  notice.className = 'notice';
  notice.textContent = message;

  document.body.appendChild(notice);

  requestAnimationFrame(() => {
    notice.classList.add('visible');
  });

  setTimeout(() => {
    notice.classList.remove('visible');

    setTimeout(() => {
      notice.remove();
    }, 250);
  }, 2400);
}