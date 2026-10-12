import { getApp } from '../main.js';
import { setupPasswordToggle } from '../components/password.js';
import { renderHome } from './home.js';
import { renderRegister } from './register.js';
import { renderDashboard } from './dashboard.js';

export function renderLogin() {
  const app = getApp();

  app.innerHTML = `
    <main class="page auth-page">
      <div class="ambient ambient-a"></div>
      <div class="ambient ambient-b"></div>

      <section class="auth-card">
        <button class="back-button" id="backHome" aria-label="Kembali">
          ←
        </button>

        <div class="auth-brand">
          <span class="brand-symbol large">ॐ</span>
        </div>

        <div class="auth-heading">
          <span class="eyebrow">
            SELAMAT DATANG KEMBALI
          </span>

          <h1>Masuk</h1>

          <p>
            Masuk untuk melanjutkan pembelajaranmu.
          </p>
        </div>

        <form id="loginForm">

          <label class="field">
            <span>Email</span>

            <input
              id="loginEmail"
              type="email"
              placeholder="nama@email.com"
              autocomplete="email"
              required
            />
          </label>

          <label class="field">
            <span>Kata sandi</span>

            <div class="password-wrap">
              <input
                id="loginPassword"
                type="password"
                placeholder="Masukkan kata sandi"
                autocomplete="current-password"
                required
              />

              <button
                type="button"
                class="show-password"
                id="loginPasswordToggle"
                aria-label="Tampilkan kata sandi"
              >
                <svg class="eye-icon eye-open" viewBox="0 0 24 24" fill="none"
                     xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M2.5 12C4.7 7.8 8 5.7 12 5.7C16 5.7 19.3 7.8 21.5 12C19.3 16.2 16 18.3 12 18.3C8 18.3 4.7 16.2 2.5 12Z"
                        stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                  <circle cx="12" cy="12" r="3"
                          stroke="currentColor" stroke-width="1.7"/>
                </svg>
              </button>
            </div>
          </label>

          <div class="form-row">
            <label class="remember">
              <input type="checkbox" />
              <span>Ingat saya</span>
            </label>

            <button
              type="button"
              class="text-button"
              id="forgotPassword"
            >
              Lupa kata sandi?
            </button>
          </div>

          <button
            class="primary-button full-button"
            type="submit"
          >
            Masuk
          </button>

          <p
            class="form-message"
            id="formMessage"
          ></p>
        </form>

        <div class="auth-divider">
          <span>atau</span>
        </div>

        <p class="bottom-text">
          Belum punya akun?

          <button
            class="text-button"
            id="createAccount"
          >
            Buat akun
          </button>
        </p>
      </section>
    </main>
  `;

  document.querySelector('#backHome').onclick = renderHome;

  setupPasswordToggle(
    'loginPassword',
    'loginPasswordToggle'
  );

  document.querySelector('#forgotPassword').onclick = () => {
    document.querySelector('#formMessage').textContent =
      'Fitur pemulihan kata sandi akan ditambahkan nanti.';
  };

  document.querySelector('#createAccount').onclick =
    renderRegister;

  document.querySelector('#loginForm').onsubmit = (event) => {
    event.preventDefault();

    renderDashboard({
      name: 'Pengguna',
      anonymous: false
    });
  };
}