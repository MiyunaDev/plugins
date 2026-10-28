import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  IframeContainer,
  STRICT_SANDBOX_ATTRIBUTES,
  FORBIDDEN_SANDBOX_ATTRIBUTES,
  DEFAULT_PLUGIN_CSP,
} from '../src/container/iframe-container.js';

describe('Iframe Container & Sandbox Security', () => {
  test('generates strict sandbox attributes without security vulnerabilities', () => {
    const container = new IframeContainer({
      pluginId: 'org.miyunadev.demo',
      sourceUrl: '/plugins/org.miyunadev.demo/dist/index.html',
    });

    const sandbox = container.getSandboxAttributeString();

    // Required permissions
    for (const attr of STRICT_SANDBOX_ATTRIBUTES) {
      assert.ok(sandbox.includes(attr), `Sandbox missing required attribute: ${attr}`);
    }

    // Forbidden permissions (NEVER allowed in unprivileged sandbox)
    for (const forbidden of FORBIDDEN_SANDBOX_ATTRIBUTES) {
      assert.equal(
        sandbox.includes(forbidden),
        false,
        `Sandbox dangerously contains forbidden attribute: ${forbidden}`
      );
    }
  });

  test('enforces strict Content Security Policy (CSP)', () => {
    const container = new IframeContainer({
      pluginId: 'org.miyunadev.demo',
      sourceUrl: '/plugins/org.miyunadev.demo/dist/index.html',
    });

    const csp = container.getContentSecurityPolicy();
    assert.equal(csp, DEFAULT_PLUGIN_CSP);
    assert.ok(csp.includes("connect-src 'none'"), 'CSP must block direct network connections');
    assert.ok(csp.includes("frame-src 'none'"), 'CSP must prevent nested iframe embedding');
    assert.ok(csp.includes("object-src 'none'"), 'CSP must block plugins/Flash/objects');
  });

  test('renders declarative HTML markup properly escaping variables', () => {
    const container = new IframeContainer({
      pluginId: 'org.miyunadev.test',
      sourceUrl: '/ext/test/index.html',
      title: 'Test <Iframe> Title',
    });

    const html = container.renderHtml();
    assert.ok(html.startsWith('<iframe '));
    assert.ok(html.includes('sandbox="allow-scripts allow-forms"'));
    assert.ok(html.includes('src="/ext/test/index.html"'));
    assert.ok(!html.includes('"<Iframe>"'));
  });

  test('wraps inner HTML document with CSP meta header', () => {
    const container = new IframeContainer({
      pluginId: 'org.miyunadev.test',
      sourceUrl: '/dummy',
    });

    const wrapped = container.wrapHtmlWithCsp('<div id="root">Game</div>');
    assert.ok(wrapped.includes('<meta http-equiv="Content-Security-Policy"'));
    assert.ok(wrapped.includes('<div id="root">Game</div>'));
  });
});
