// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  navToggle.classList.toggle('open', isOpen);
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

navLinks.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    navToggle.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

// Fade-in cards on scroll (progressive enhancement — see .reveal in style.css)
if ('IntersectionObserver' in window) {
  const revealTargets = document.querySelectorAll('.mod-card, .tip-card, .fun-card');
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  revealTargets.forEach((el, i) => {
    el.classList.add('reveal');
    el.style.transitionDelay = `${(i % 6) * 60}ms`;
    revealObserver.observe(el);
  });
}

// Email signup form (frontend-only demo — see README for wiring up a real backend)
const signupForm = document.getElementById('signupForm');
const emailInput = document.getElementById('emailInput');
const signupBtn = document.getElementById('signupBtn');
const formMessage = document.getElementById('formMessage');

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function setMessage(text, type) {
  formMessage.textContent = text;
  formMessage.className = `form-message${type ? ` ${type}` : ''}`;
}

signupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const email = emailInput.value.trim();

  if (!isValidEmail(email)) {
    emailInput.classList.add('input-error');
    setMessage('Please enter a valid email address.', 'error');
    emailInput.focus();
    return;
  }

  emailInput.classList.remove('input-error');
  signupBtn.disabled = true;
  signupBtn.textContent = 'Signing up...';
  setMessage('', '');

  // NOTE: This is a frontend-only placeholder. Replace this timeout with a real
  // request to your email service / serverless function, e.g.:
  //
  // fetch('/api/subscribe', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ email }),
  // })
  //   .then((res) => { if (!res.ok) throw new Error('Request failed'); })
  //   .then(() => showSuccess())
  //   .catch(() => showError());
  setTimeout(() => {
    signupBtn.disabled = false;
    signupBtn.textContent = 'Sign Me Up';
    setMessage(`You're on the list! Tips will start arriving at ${email}.`, 'success');
    signupForm.reset();
  }, 700);
});
