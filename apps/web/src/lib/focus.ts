/** Move keyboard focus to the main landmark after a client navigation. */
export function focusMain(): void {
  const main = document.getElementById('main');
  if (!main) return;
  if (!main.hasAttribute('tabindex')) {
    main.setAttribute('tabindex', '-1');
  }
  main.focus({ preventScroll: false });
}
