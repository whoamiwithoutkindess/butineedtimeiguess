import { getApp } from '../main.js';
import { setupPasswordToggle } from '../components/password.js';
import { renderHome } from './home.js';
import { renderLogin } from './login.js';
import { renderDashboard } from './dashboard.js';

export function renderRegister() {
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
            BUAT AKUN
          </span>

          <h1>Daftar</h1>

          <p>
            Buat akun untuk menyimpan perkembangan pembelajaranmu.
          </p>
        </div>

        <form id="registerForm">

          <label class="field">
            <span>Nama</span>

            <input
              id="registerName"
              type="text"
              placeholder="Nama lengkap"
              autocomplete="name"
              required
            />
          </label>

          <label class="field">
            <span>Kelas</span>

            <input
              id="registerClass"
              type="text"
              placeholder="Contoh: XI IPA 1"
              autocomplete="off"
              required
            />
          </label>

          <label class="field">
            <span>Sekolah</span>

            <input
              id="registerSchool"
              type="text"
              placeholder="Nama sekolah"
              autocomplete="organization"
              required
            />
          </label>

          <label class="field">
            <span>Email</span>

            <input
              id="registerEmail"
              type="email"
              placeholder="nama@email.com"
              autocomplete="email"
            />
          </label>

          <label class="field">
            <span>Kata sandi</span>

            <div class="password-wrap">
              <input
                id="registerPassword"
                type="password"
                placeholder="Buat kata sandi"
                autocomplete="new-password"
                required
              />

              <button
                type="button"
                class="show-password"
                id="registerPasswordToggle"
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

          <label class="field">
            <span>Konfirmasi kata sandi</span>

            <div class="password-wrap">
              <input
                id="registerPasswordConfirm"
                type="password"
                placeholder="Ulangi kata sandi"
                autocomplete="new-password"
                required
              />

              <button
                type="button"
                class="show-password"
                id="registerPasswordConfirmToggle"
                aria-label="Tampilkan kata sandi"
              >
                <svg class="eye-icon eye-open" viewBox="0 0 24 24" fill="none"
                     xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M2.5 12C4.7 7.8 8 5.7 12 5.7C16 5.7 19.3 7.8 21.5 12C19.3 16.2 16 18.3 16 18.3C8 18.3 4.7 16.2 2.5 12Z"
                        stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                  <circle cx="12" cy="12" r="3"
                          stroke="currentColor" stroke-width="1.7"/>
                </svg>
              </button>
            </div>
          </label>

          <button
            class="primary-button full-button"
            type="submit"
          >
            Buat Akun
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
          Sudah punya akun?

          <button
            class="text-button"
            id="goToLogin"
          >
            Masuk
          </button>
        </p>
      </section>
    </main>
  `;

  document.querySelector('#backHome').onclick = renderHome;

  setupPasswordToggle(
    'registerPassword',
    'registerPasswordToggle'
  );

  setupPasswordToggle(
    'registerPasswordConfirm',
    'registerPasswordConfirmToggle'
  );

  document.querySelector('#goToLogin').onclick =
    renderLogin;

  document.querySelector('#registerForm').onsubmit =
    (event) => {
      event.preventDefault();

      const name =
        document.querySelector('#registerName').value.trim();

      const password =
        document.querySelector('#registerPassword').value;

      const confirmPassword =
        document.querySelector('#registerPasswordConfirm').value;

      const message =
        document.querySelector('#formMessage');

      if (password !== confirmPassword) {
        message.textContent =
          'Konfirmasi kata sandi tidak cocok.';

        return;
      }

      renderDashboard({
        name,
        anonymous: false
      });
    };
}