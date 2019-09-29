export {inProduction as default};

function getCookieValue(cookieName) {
  const value =
      document.cookie.match('(^|[^;]+)\\s*' + cookieName + '\\s*=\\s*([^;]+)');
  return value ? value.pop() : '';
}

function inProduction() {
  return !getCookieValue('IN_CYPRESS_TEST');
}
