import { Liquid } from "liquidjs";

// Strict mode ensures that templates referencing undefined variables fail
// loudly at render time rather than silently rendering an empty string.
const engine = new Liquid({ strictVariables: true });

/**
 * Renders a Liquid template string with the provided context variables.
 *
 * @param template - Liquid template source string (e.g. "Fix {{ issue }} in {{ repo }}")
 * @param context  - Key/value pairs bound to template variables
 * @returns Rendered string with all variables substituted
 * @throws {Error} When the template references a variable not present in context
 */
export async function renderPrompt(
  template: string,
  context: Record<string, string>,
): Promise<string> {
  return engine.parseAndRender(template, context);
}
