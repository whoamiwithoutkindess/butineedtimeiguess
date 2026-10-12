import './styles/base.css';
import './styles/intro.css'; 
import './styles/home.css'; 
import './styles/auth.css'; 
import './styles/dashboard.css'; 
import './styles/belajar.css'; 
import './styles/about.css'; 
import './styles/responsive.css';
import './styles/quiz.css';
import './styles/achievements.css';
import './styles/aitools.css';
import './styles/profile.css';
import { renderIntro } from './pages/intro.js';
import { installEasterEggs } from './pages/achievements.js';

const app = document.querySelector('#app');

export function getApp() {
  return app;
}

renderIntro();