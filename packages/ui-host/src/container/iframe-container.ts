/**
 * @file iframe-container.ts
 * Secure Sandboxed Iframe Container configuration and attribute generator for web UI plugins.
 */

export interface IframeSandboxConfig {
  pluginId: string;
  sourceUrl: string;
  width?: string;
  height?: string;
  title?: string;
}

export const STRICT_SANDBOX_ATTRIBUTES = [
  'allow-scripts',
  'allow-forms',
] as const;

export const FORBIDDEN_SANDBOX_ATTRIBUTES = [
  'allow-same-origin',
  'allow-top-navigation',
  'allow-top-navigation-by-user-activation',
  'allow-popups',
  'allow-modals',
] as const;

export const DEFAULT_PLUGIN_CSP =
  "default-src 'self' 'unsafe-inline' blob: data:; connect-src 'none'; script-src 'self' 'unsafe-eval'; frame-src 'none'; object-src 'none'; base-uri 'none';";

export class IframeContainer {
  private config: IframeSandboxConfig;

  constructor(config: IframeSandboxConfig) {
    this.config = config;
  }

  /**
   * Returns the canonical string of sandbox attribute flags.
   * Ensures 'allow-same-origin' and 'allow-top-navigation' are NEVER included.
   */
  public getSandboxAttributeString(): string {
    return STRICT_SANDBOX_ATTRIBUTES.join(' ');
  }

  /**
   * Returns the recommended Content Security Policy for the sandboxed document.
   */
  public getContentSecurityPolicy(): string {
    return DEFAULT_PLUGIN_CSP;
  }

  /**
   * Generates a declarative HTML markup string representing the sandboxed iframe.
   */
  public renderHtml(): string {
    const { pluginId, sourceUrl, width = '100%', height = '100%', title = `Plugin: ${pluginId}` } =
      this.config;

    const sandbox = this.getSandboxAttributeString();
    const safeTitle = title.replace(/"/g, '&quot;');
    const safeSrc = sourceUrl.replace(/"/g, '&quot;');

    return `<iframe src="${safeSrc}" title="${safeTitle}" width="${width}" height="${height}" sandbox="${sandbox}" allow="clipboard-read; clipboard-write;" loading="lazy" style="border: none; width: ${width}; height: ${height}; display: block;"></iframe>`;
  }

  /**
   * Generates inline HTML wrapping the plugin artifact with injected CSP metadata.
   */
  public wrapHtmlWithCsp(innerHtml: string): string {
    const csp = this.getContentSecurityPolicy();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plugin Sandbox</title>
</head>
<body style="margin: 0; padding: 0; overflow: hidden; background: transparent;">
  ${innerHtml}
</body>
</html>`;
  }
}
