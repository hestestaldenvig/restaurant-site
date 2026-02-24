const menuToggle = document.querySelector('.menu-toggle');
const primaryNav = document.querySelector('#primary-navigation');

if (menuToggle && primaryNav) {
  menuToggle.addEventListener('click', () => {
    const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!expanded));
    primaryNav.classList.toggle('is-open');
  });
}

const page = document.body.dataset.page;
const navLinks = document.querySelectorAll('.primary-nav a');

navLinks.forEach((link) => {
  if (link.dataset.page === page) {
    link.classList.add('active');
    link.setAttribute('aria-current', 'page');
  }

  link.addEventListener('click', () => {
    if (primaryNav && primaryNav.classList.contains('is-open')) {
      primaryNav.classList.remove('is-open');
      if (menuToggle) {
        menuToggle.setAttribute('aria-expanded', 'false');
      }
    }
  });
});
