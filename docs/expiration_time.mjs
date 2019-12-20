export {getMillisecondsToExpiration};

function getMillisecondsToExpiration(expireTime) {
  return millisecondsFromNow(Date.parse(expireTime));
}

function millisecondsFromNow(date) {
  return date - Date.now();
}
