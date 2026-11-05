// Defence in depth for reviewed offline Node checks and their Node children.
// This is not an OS sandbox: non-Node children still require code review.
'use strict';
const net = require('node:net');
const {syncBuiltinESMExports} = require('node:module');
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let options = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (typeof options === 'number') options = {port:options,host:typeof args[1] === 'string' ? args[1] : 'localhost'};
  if (options && typeof options === 'object' && !options.path) {
    const host = String(options.host || 'localhost').toLowerCase();
    const local = host === 'localhost' || host === '::1' || host === '[::1]'
      || (net.isIP(host) === 4 && host.startsWith('127.'));
    if (!local) throw new Error('Offline release check refused an external connection (target omitted).');
    // Avoid DNS/hosts-file resolution even for the permitted localhost name.
    if (host === 'localhost') options.host = '127.0.0.1';
  } else if (typeof options === 'string' && !options.startsWith('\\\\.\\pipe\\') && !options.startsWith('/')) {
    throw new Error('Offline release check refused an unsupported connection target.');
  }
  return original.apply(this,args);
};
syncBuiltinESMExports();
