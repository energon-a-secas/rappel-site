#!/usr/bin/env node
/**
 * Origin allowlist checks. Contract C6.4, which asks for exactly this file.
 *
 *   node tools/test-origin.mjs      # from inside projects/rappel-site
 *   make validate
 *
 * Nothing in root `make smoke` checks the allowlist and the negative case is
 * awkward to reach from a browser, so these assertions are the enforcement.
 * The five the contract names by hand are marked (C6.4).
 */

import { isAllowedOrigin, isAllowedDeckSrc, isLocalOrigin, isNeorgonHost, namespacedDeckId }
  from '../js/origin.js';

const ENGINE_PROD = 'https://rappel.neorgon.com';
const ENGINE_LOCAL = 'http://localhost:8879';

let pass = 0;
const fails = [];

function check(label, got, want) {
  const ok = got === want;
  if (ok) { pass += 1; console.log(`  ok   ${label}  -> ${got}`); }
  else { fails.push(label); console.log(`  FAIL ${label}  -> ${got}, want ${want}`); }
}
const allow = (o, self, label) => check(label, isAllowedOrigin(o, self), true);
const refuse = (o, self, label) => check(label, isAllowedOrigin(o, self), false);

console.log('\nAllowed, engine in production');
allow('https://runcible.neorgon.com', ENGINE_PROD, 'https://runcible.neorgon.com (C6.4)');
allow('https://neorgon.com', ENGINE_PROD, 'https://neorgon.com (C6.4)');
allow('https://rappel.neorgon.com', ENGINE_PROD, 'the engine embedding itself');
allow('https://glassbox.neorgon.com', ENGINE_PROD, 'any other fleet subdomain');
allow('https://a.b.neorgon.com', ENGINE_PROD, 'a deeper subdomain');

console.log('\nRefused, engine in production');
refuse('https://evil-neorgon.com', ENGINE_PROD, 'https://evil-neorgon.com (C6.4, the suffix bug)');
refuse('https://neorgon.com.evil.io', ENGINE_PROD, 'https://neorgon.com.evil.io (C6.4)');
refuse('https://xneorgon.com', ENGINE_PROD, 'a host that merely contains the name');
refuse('https://neorgon.com.', ENGINE_PROD, 'a trailing dot host');
refuse('http://neorgon.com', ENGINE_PROD, 'the apex over plain http');
refuse('http://runcible.neorgon.com', ENGINE_PROD, 'a subdomain over plain http');
refuse('https://runcible.neorgon.com.attacker.test', ENGINE_PROD, 'the name as a left label');
refuse('https://neorgonxcom', ENGINE_PROD, 'the dot replaced');
refuse('http://localhost:8878', ENGINE_PROD, 'localhost when the engine is NOT local (C6.4)');
refuse('http://127.0.0.1:8878', ENGINE_PROD, '127.0.0.1 when the engine is NOT local');
refuse('null', ENGINE_PROD, 'a sandboxed frame posting origin "null"');
refuse('', ENGINE_PROD, 'an empty origin');
refuse('https://', ENGINE_PROD, 'a bare scheme');
refuse('not a url', ENGINE_PROD, 'a string that is not a URL');
refuse('https://user:pw@neorgon.com', ENGINE_PROD, 'credentials in the origin');
refuse('https://neorgon.com/evil', ENGINE_PROD, 'a path, which an origin never has');
refuse('https://neorgon.com?x=1', ENGINE_PROD, 'a query, which an origin never has');
refuse('file://', ENGINE_PROD, 'a file URL');
refuse('data:text/html,x', ENGINE_PROD, 'a data URL');
refuse('javascript:alert(1)', ENGINE_PROD, 'a javascript URL');
refuse(undefined, ENGINE_PROD, 'undefined');
refuse(null, ENGINE_PROD, 'null');
refuse({ toString: () => 'https://neorgon.com' }, ENGINE_PROD, 'an object pretending to be a string');

console.log('\nThe localhost clause, engine on localhost');
allow('http://localhost:8878', ENGINE_LOCAL, 'http://localhost:8878 when the engine IS local (C6.4)');
allow('http://127.0.0.1:8878', ENGINE_LOCAL, '127.0.0.1 when the engine is local');
allow('https://neorgon.com', ENGINE_LOCAL, 'the apex is still allowed while local');
refuse('https://evil-neorgon.com', ENGINE_LOCAL, 'the suffix bug is still refused while local');
refuse('http://192.168.1.10:8878', ENGINE_LOCAL, 'a LAN address is not localhost');
refuse('http://localhost.evil.io', ENGINE_LOCAL, 'a host that starts with localhost');
refuse('https://localhost:8878', ENGINE_LOCAL, 'https localhost, since the clause is http only');

console.log('\nHelpers');
check('isNeorgonHost(neorgon.com)', isNeorgonHost('neorgon.com'), true);
check('isNeorgonHost(a.neorgon.com)', isNeorgonHost('a.neorgon.com'), true);
check('isNeorgonHost(evil-neorgon.com)', isNeorgonHost('evil-neorgon.com'), false);
check('isLocalOrigin(http://localhost:1)', isLocalOrigin('http://localhost:1'), true);
check('isLocalOrigin(https://localhost:1)', isLocalOrigin('https://localhost:1'), false);

console.log('\n?src= fetch rule (C6.1)');
check('https deck src, engine in production', isAllowedDeckSrc('https://runcible.neorgon.com/d.json', ENGINE_PROD), true);
check('https deck src from anywhere', isAllowedDeckSrc('https://example.test/d.json', ENGINE_PROD), true);
check('http deck src, engine in production', isAllowedDeckSrc('http://example.test/d.json', ENGINE_PROD), false);
check('localhost deck src, engine in production', isAllowedDeckSrc('http://localhost:8878/d.json', ENGINE_PROD), false);
check('localhost deck src, engine on localhost', isAllowedDeckSrc('http://localhost:8878/d.json', ENGINE_LOCAL), true);
check('a relative path is not a URL', isAllowedDeckSrc('data/decks/x.json', ENGINE_LOCAL), false);
check('a javascript URL', isAllowedDeckSrc('javascript:alert(1)', ENGINE_LOCAL), false);

console.log('\nDeck id namespacing (C4.4)');
check('built-in keeps its id', namespacedDeckId('jp-kana', null, 'abc'), 'jp-kana');
check('a neorgon.com src keeps its id', namespacedDeckId('jp-kana', 'https://runcible.neorgon.com/d.json', 'abc'), 'jp-kana');
check('a localhost src keeps its id', namespacedDeckId('jp-kana', 'http://localhost:8878/d.json', 'abc'), 'jp-kana');
check('a third-party src is namespaced', namespacedDeckId('jp-kana', 'https://example.test/d.json', 'abc123def456'), 'ext:abc123def456:jp-kana');
check('the suffix bug does not win a plain id', namespacedDeckId('jp-kana', 'https://evil-neorgon.com/d.json', 'deadbeef0000'), 'ext:deadbeef0000:jp-kana');

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  fails.forEach((f) => console.log(`  failed: ${f}`));
  process.exit(1);
}
