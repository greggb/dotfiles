export type Redirect = { fd?: string; op: ">" | ">>" | "<" | "<<" | "<<<" | ">&" | "<&" | "&>" | "&>>" | ">|"; target: string };
export type SimpleCommand = { assignments: string[]; words: string[]; redirects: Redirect[]; piped: boolean };
export type ParsedScript = { ok: true; commands: SimpleCommand[]; substitutions: string[]; background: boolean } | { ok: false; error: string };

type Cursor = { source: string; index: number; substitutions: string[] };
type HereDoc = { delimiter: string; stripTabs: boolean };
const redirectOps: Redirect["op"][] = ["&>>", "<<<", ">>", ">|", ">&", "<&", "&>", "<<", ">", "<"];

export function parseShell(script: string): ParsedScript {
  const cursor: Cursor = { source: script, index: 0, substitutions: [] };
  const commands: SimpleCommand[] = [], hereDocs: HereDoc[] = [];
  const groups: number[] = [];
  let command = emptyCommand(), background = false, ready = false, required = false, reserved = false, data = false;
  const active = () => command.words.length + command.assignments.length + command.redirects.length > 0;
  const finish = () => {
    if (!active() && !reserved) return;
    if (active() && !data) commands.push(command);
    command = emptyCommand();
    ready = true;
    required = reserved = data = false;
  };
  try {
    if (script.includes("\0")) throw new Error("NUL is not shell text");
    while (cursor.index < script.length) {
      const char = script[cursor.index];
      if (char === " " || char === "\t" || char === "\r") { cursor.index++; continue; }
      if (script.startsWith("\\\n", cursor.index)) { cursor.index += 2; continue; }
      if (char === "#") {
        while (cursor.index < script.length && script[cursor.index] !== "\n") cursor.index++;
        continue;
      }
      if (char === "\n") {
        finish();
        cursor.index++;
        skipHereDocs(cursor, hereDocs);
        ready = false;
        continue;
      }
      const redirect = readRedirect(cursor);
      if (redirect) {
        if (ready) throw new Error("Missing operator after group");
        const stripTabs = script[cursor.index - 1] === "-" && redirect.op === "<<";
        while (/[ \t\r]/.test(script[cursor.index] ?? "") || script.startsWith("\\\n", cursor.index)) {
          cursor.index += script.startsWith("\\\n", cursor.index) ? 2 : 1;
        }
        if (cursor.index >= script.length || /[\n;|&()<>#]/.test(script[cursor.index]) && !/^[<>]\(/.test(script.slice(cursor.index))) throw new Error("Missing redirect target");
        redirect.target = readWord(cursor);
        command.redirects.push(redirect);
        if (redirect.op === "<<") hereDocs.push({ delimiter: redirect.target, stripTabs });
        required = false;
        continue;
      }
      if (char === "(") {
        if (command.words.length === 1 && /^\(\s*\)/.test(script.slice(cursor.index))) throw new Error("unsupported shell syntax: function definition");
        if (ready || active()) throw new Error("Unexpected (");
        groups.push(commands.length);
        required = true;
        cursor.index++;
        continue;
      }
      if (char === ")") {
        finish();
        const start = groups.pop();
        if (start === undefined || commands.length === start || required) throw new Error("Unexpected ) or empty group");
        ready = true;
        cursor.index++;
        continue;
      }
      if (char === ";" || char === "|" || char === "&") {
        finish();
        if (!ready || required) throw new Error("Empty command between operators");
        const pair = script.slice(cursor.index, cursor.index + 2);
        const operator = ["&&", "||", "|&"].includes(pair) ? pair : char;
        cursor.index += operator.length;
        background ||= operator === "&";
        required = ["&&", "||", "|", "|&"].includes(operator);
        command.piped = operator === "|" || operator === "|&";
        ready = false;
        continue;
      }
      if (ready) throw new Error("Missing operator after group");
      const start = cursor.index, word = readWord(cursor);
      if (data) continue;
      if (!command.words.length && script.slice(start, cursor.index) === word) {
        if (word === "case" || word === "esac") throw new Error("unsupported shell syntax: case");
        if (word === "function") throw new Error("unsupported shell syntax: function definition");
        if (["if", "then", "elif", "else", "while", "until", "do", "!", "{"].includes(word)) {
          reserved = true;
          required = false;
          continue;
        }
        if (["for", "select", "fi", "done", "}"].includes(word)) {
          reserved = data = true;
          required = false;
          continue;
        }
      }
      if (!command.words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(script.slice(start, cursor.index))) command.assignments.push(word);
      else command.words.push(word);
      required = false;
    }
    finish();
    if (required) throw new Error("Missing command after operator");
    if (groups.length) throw new Error("Unterminated group");
    if (hereDocs.length) throw new Error("Unterminated here-doc");
    return { ok: true, commands, substitutions: cursor.substitutions, background };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid shell text" };
  }
}

function emptyCommand(): SimpleCommand {
  return { assignments: [], words: [], redirects: [], piped: false };
}

function readRedirect(cursor: Cursor): Redirect | undefined {
  const rest = cursor.source.slice(cursor.index);
  const fd = rest.match(/^\d+(?=[<>])/)?.[0];
  const offset = fd?.length ?? 0;
  if (/^[<>]\(/.test(rest.slice(offset))) return undefined;
  const op = redirectOps.find((candidate) => rest.startsWith(candidate, offset));
  if (!op) return undefined;
  cursor.index += offset + op.length;
  if (op === "<<" && cursor.source[cursor.index] === "-") cursor.index++;
  return { ...(fd === undefined ? {} : { fd }), op, target: "" };
}

function readWord(cursor: Cursor): string {
  const { source } = cursor;
  let word = "";
  while (cursor.index < source.length) {
    const char = source[cursor.index];
    if (/^[<>]\(/.test(source.slice(cursor.index))) { word += readSubstitution(cursor); continue; }
    if (/[ \t\r\n;|&()<>]/.test(char)) break;
    if (char === "\\") {
      cursor.index++;
      if (cursor.index === source.length) throw new Error("Trailing backslash");
      if (source[cursor.index] !== "\n") word += source[cursor.index];
      cursor.index++;
    } else if (char === "'" || char === '"') word += readQuote(cursor);
    else if (source.startsWith("${", cursor.index)) word += readParameter(cursor);
    else if (source.startsWith("$(", cursor.index) || char === "`") word += readSubstitution(cursor);
    else { word += char; cursor.index++; }
  }
  return word;
}

function readQuote(cursor: Cursor): string {
  const { source } = cursor, quote = source[cursor.index++];
  let word = "";
  while (cursor.index < source.length) {
    const char = source[cursor.index];
    if (char === quote) { cursor.index++; return word; }
    if (quote === '"' && char === "\\" && /[\\"$`\n]/.test(source[cursor.index + 1] ?? "")) {
      cursor.index++;
      if (source[cursor.index] !== "\n") word += source[cursor.index];
      cursor.index++;
    } else if (quote === '"' && source.startsWith("${", cursor.index)) word += readParameter(cursor, true);
    else if (quote === '"' && (source.startsWith("$(", cursor.index) || char === "`")) word += readSubstitution(cursor);
    else { word += char; cursor.index++; }
  }
  throw new Error(`Unterminated ${quote === "'" ? "single" : "double"} quote`);
}

function readParameter(cursor: Cursor, doubleQuoted = false): string {
  const { source, index: start } = cursor;
  cursor.index += 2;
  while (cursor.index < source.length) {
    const char = source[cursor.index];
    if (char === "}") { cursor.index++; return source.slice(start, cursor.index); }
    if (char === "\\") cursor.index += 2;
    else if (char === '"' || char === "'" && !doubleQuoted) readQuote(cursor);
    else if (source.startsWith("${", cursor.index)) readParameter(cursor, doubleQuoted);
    else if (source.startsWith("$(", cursor.index) || char === "`") readSubstitution(cursor);
    else cursor.index++;
  }
  throw new Error("Unterminated ${ expansion");
}

function readSubstitution(cursor: Cursor): string {
  const { source, index: start, substitutions } = cursor;
  const arithmetic = source.startsWith("$((", start), backtick = source[start] === "`";
  cursor.index = backtick ? backtickEnd(source, start) : expansionEnd(source, start, arithmetic ? substitutions : undefined);
  if (!arithmetic) substitutions.push(source.slice(start + (backtick ? 1 : 2), cursor.index - 1));
  return source.slice(start, cursor.index);
}

// Bound substitutions without decoding their source. Callers parse that source separately.
function expansionEnd(source: string, start: number, substitutions?: string[]): number {
  let index = start + 2, depth = 1;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") { index += 2; continue; }
    if (char === "'" || char === '"') { index = quoteEnd(source, index, substitutions); continue; }
    if (source.startsWith("${", index) || source.startsWith("$(", index) || char === "`") {
      const cursor: Cursor = { source, index, substitutions: substitutions ?? [] };
      if (source.startsWith("${", index)) readParameter(cursor);
      else readSubstitution(cursor);
      index = cursor.index;
      continue;
    }
    if (char === "#" && (index === start + 2 || /[\s;|&()]/.test(source[index - 1]))) {
      while (index < source.length && source[index] !== "\n") index++;
      continue;
    }
    if (char === "(") depth++;
    if (char === ")" && --depth === 0) return index + 1;
    index++;
  }
  throw new Error("Unterminated $( expansion");
}

function quoteEnd(source: string, start: number, substitutions?: string[]): number {
  const cursor: Cursor = { source, index: start, substitutions: substitutions ?? [] };
  readQuote(cursor);
  return cursor.index;
}

function backtickEnd(source: string, start: number): number {
  for (let index = start + 1; index < source.length; index++) {
    if (source[index] === "\\") index++;
    else if (source[index] === "`") return index + 1;
  }
  throw new Error("Unterminated backtick substitution");
}

function skipHereDocs(cursor: Cursor, hereDocs: HereDoc[]): void {
  for (const { delimiter, stripTabs } of hereDocs) {
    let found = false;
    while (cursor.index < cursor.source.length) {
      const end = cursor.source.indexOf("\n", cursor.index);
      const line = cursor.source.slice(cursor.index, end < 0 ? undefined : end);
      cursor.index = end < 0 ? cursor.source.length : end + 1;
      if ((stripTabs ? line.replace(/^\t+/, "") : line) === delimiter) { found = true; break; }
    }
    if (!found) throw new Error("Unterminated here-doc");
  }
  hereDocs.length = 0;
}
