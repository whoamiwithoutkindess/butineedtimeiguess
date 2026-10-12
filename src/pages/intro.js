import { getApp } from '../main.js';
import { renderHome } from './home.js';

export function renderIntro() {
  const app = getApp();

  app.innerHTML = `
    <main class="intro-screen">
      <div class="mandala mandala-a"></div>
      <div class="mandala mandala-b"></div>
      <div class="intro-glow glow-a"></div>
      <div class="intro-glow glow-b"></div>

      <div class="intro-content">
        <div class="om-mark">ॐ</div>

        <p class="intro-kicker">
          PEMBELAJARAN AGAMA HINDU
        </p>

        <h1>
          Dharma<span>Learn</span>
        </h1>

        <p class="intro-subtitle">
          Belajar Dharma. Memahami Makna. Menjalani Nilai.
        </p>

        <div class="intro-loader">
          <span></span>
        </div>
      </div>
    </main>
  `;

  setTimeout(() => {
    app.classList.add('intro-finished');

    setTimeout(renderHome, 500);
  }, 2700);
}