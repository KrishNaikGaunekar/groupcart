export function isOnboardingEnabled(): boolean {
  return window.groupcartDesktop?.guestOnboardingEnabled === true
}
