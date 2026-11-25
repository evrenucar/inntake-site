// The inn animates by default. The optional off URL follows the device preference.
window.inntakeFullMotion = new URLSearchParams(location.search).get('motion') !== 'off';
