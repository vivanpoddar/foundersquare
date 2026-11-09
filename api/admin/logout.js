'use strict';
const lib = require('../_lib');
module.exports = async (req, res) => {
  res.setHeader('Set-Cookie', lib.cookieHeader('', 0));
  return lib.json(res, 200, { ok: true });
};
