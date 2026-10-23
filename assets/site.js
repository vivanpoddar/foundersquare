(() => {
  'use strict';
  document.querySelectorAll('.section h2,.section p,.event-row,.event-row h3,.event-date,.event-info p,.event-aside,.band-inner h2,.band-inner p,.footer-top,.page-head h1,.page-head p,.sponsorship article,.sponsorship h2,.sponsorship h3,.sponsorship p,.contact-grid h2,.contact-grid>div p,.contact-grid label,.schedule li,.questions details').forEach(el => el.classList.add('reveal'));

})();
document.querySelectorAll('[data-copy]').forEach(button => {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('team@foundersquare.org');
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = 'Copy address'; }, 1600);
    } catch {
      button.textContent = 'team@foundersquare.org';
    }
  });
});
