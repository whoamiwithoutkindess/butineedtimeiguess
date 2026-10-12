import { getApp } from '../main.js';
import { renderHome } from './home.js';
import { renderLogin } from './login.js';
import { renderDashboard } from './dashboard.js';

export function renderAnonymous() {
  const app = getApp();

  app.innerHTML = `
    <main class="page auth-page">
      <div class="ambient ambient-a"></div>
      <div class="ambient ambient-b"></div>

      <section class="auth-card anonymous-card">
        <button class="back-button" id="backHome" aria-label="Kembali">
          ←
        </button>

        <div class="auth-brand">
          <span class="brand-symbol large">ॐ</span>
        </div>

        <div class="auth-heading">
          <span class="eyebrow">
            MODE ANONIM
          </span>

          <h1>Mulai belajar</h1>

          <p>
            Kamu dapat menjelajahi materi tanpa membuat akun.
            Progress pembelajaran tidak akan disimpan.
          </p>
        </div>

        <button
          class="primary-button full-button"
          id="startAnonymous"
        >
          Mulai Pembelajaran
        </button>

        <button
          class="secondary-button full-button"
          id="anonymousLogin"
        >
          Masuk dengan akun
        </button>
      </section>
    </main>
  `;

  document.querySelector('#backHome').onclick = renderHome;

  document.querySelector('#startAnonymous').onclick = () => {
    renderDashboard({
      name: 'Pembelajar',
      anonymous: true
    });
  };

  document.querySelector('#anonymousLogin').onclick =
    renderLogin;
}