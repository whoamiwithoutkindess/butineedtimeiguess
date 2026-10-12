const eyeIcon = `
  <svg class="eye-icon eye-open" viewBox="0 0 24 24" fill="none"
       xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M2.5 12C4.7 7.8 8 5.7 12 5.7C16 5.7 19.3 7.8 21.5 12C19.3 16.2 16 18.3 12 18.3C8 18.3 4.7 16.2 2.5 12Z"
          stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="12" r="3"
            stroke="currentColor" stroke-width="1.7"/>
  </svg>
`;

const eyeOffIcon = `
  <svg class="eye-icon eye-closed" viewBox="0 0 24 24" fill="none"
       xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M3 3L21 21"
          stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M10.6 5.9C11.05 5.77 11.52 5.7 12 5.7C16 5.7 19.3 7.8 21.5 12C20.8 13.35 19.9 14.55 18.85 15.5"
          stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6.05 7.05C4.65 8.15 3.45 9.8 2.5 12C4.7 16.2 8 18.3 12 18.3C13.2 18.3 14.35 18.08 15.4 17.65"
          stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

export function setupPasswordToggle(inputId, buttonId) {
  const input = document.querySelector(`#${inputId}`);
  const button = document.querySelector(`#${buttonId}`);

  if (!input || !button) {
    return;
  }

  button.onclick = () => {
    const visible = input.type === 'text';

    input.type = visible ? 'password' : 'text';

    button.innerHTML = visible
      ? eyeIcon
      : eyeOffIcon;

    button.setAttribute(
      'aria-label',
      visible
        ? 'Tampilkan kata sandi'
        : 'Sembunyikan kata sandi'
    );
  };
}

export { eyeIcon };