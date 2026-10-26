import assert from "node:assert/strict";
import { test } from "node:test";
import { parseShell, type Redirect, type SimpleCommand } from "../shell-lexer.ts";

const wordCases: [string, string[]][] = [
  ["echo hello world", ["echo", "hello", "world"]],
  ["  echo\twords  ", ["echo", "words"]],
  ["echo 'hello world'", ["echo", "hello world"]],
  ['echo "hello world"', ["echo", "hello world"]],
  ['bash -c "r""m x"', ["bash", "-c", "rm x"]],
  ["echo 'a'b\"c\"", ["echo", "abc"]],
  ["echo '' \"\" a''b", ["echo", "", "", "ab"]],
  [String.raw`echo a\ b \"hi\" \'x\'`, ["echo", "a b", '"hi"', "'x'"]],
  [String.raw`echo "a\"b\\c\$d\`e\q"`, ["echo", 'a"b\\c$d`e\\q']],
  ["echo a\\\nb \"c\\\nd\"", ["echo", "ab", "cd"]],
  ["echo 'a\\b\nc'", ["echo", "a\\b\nc"]],
  ["grep 'a > b' f", ["grep", "a > b", "f"]],
  ["grep 'touch' log", ["grep", "touch", "log"]],
  ["echo $VAR ${HOME} * ?.txt", ["echo", "$VAR", "${HOME}", "*", "?.txt"]],
  ['echo ${X:-"hello world"}', ["echo", '${X:-"hello world"}']],
  ['echo "${X:-a b}"', ["echo", "${X:-a b}"]],
  ["echo ${X:-${Y}}", ["echo", "${X:-${Y}}"]],
  ["echo ${X:-'$(touch y)'}", ["echo", "${X:-'$(touch y)'}"]],
  ["echo $((1+2))", ["echo", "$((1+2))"]],
  ['echo "$((1 + (2)))"', ["echo", "$((1 + (2)))"]],
  ["echo '#literal' x#y \\#z # ignored", ["echo", "#literal", "x#y", "#z"]],
  ["echo '$(touch x)' '`rm y`'", ["echo", "$(touch x)", "`rm y`"]],
  ['"FOO=1" cmd', ["FOO=1", "cmd"]],
  ["F'OO'=1 cmd", ["FOO=1", "cmd"]],
  ["echo '{' \"}\"", ["echo", "{", "}"]],
  ["echo then done fi", ["echo", "then", "done", "fi"]],
  ["grep done log", ["grep", "done", "log"]],
  ["echo case function for select", ["echo", "case", "function", "for", "select"]],
  ["'then' x", ["then", "x"]],
  [String.raw`\if true`, ["if", "true"]],
];
for (const [source, words] of wordCases) {
  test(`words: ${JSON.stringify(source)}`, () => {
    assert.deepEqual(parseShell(source), result([command(words)]));
  });
}

const redirectCases: [string, string[], Redirect[]][] = [
  ["cmd >/dev/null 2>&1", ["cmd"], [{ op: ">", target: "/dev/null" }, { fd: "2", op: ">&", target: "1" }]],
  ["cmd > out.txt", ["cmd"], [{ op: ">", target: "out.txt" }]],
  ["cmd >> out.txt", ["cmd"], [{ op: ">>", target: "out.txt" }]],
  ["cmd &> log", ["cmd"], [{ op: "&>", target: "log" }]],
  ["cmd &>>log", ["cmd"], [{ op: "&>>", target: "log" }]],
  ["cat < in", ["cat"], [{ op: "<", target: "in" }]],
  ['cmd <<< "x"', ["cmd"], [{ op: "<<<", target: "x" }]],
  ["cmd >|out", ["cmd"], [{ op: ">|", target: "out" }]],
  ["cmd 0<&3", ["cmd"], [{ fd: "0", op: "<&", target: "3" }]],
  ["cmd 12>>'some log'", ["cmd"], [{ fd: "12", op: ">>", target: "some log" }]],
  ["cmd>&2", ["cmd"], [{ op: ">&", target: "2" }]],
  ["cmd 2> /tmp/err arg", ["cmd", "arg"], [{ fd: "2", op: ">", target: "/tmp/err" }]],
  ["cmd abc2>file", ["cmd", "abc2"], [{ op: ">", target: "file" }]],
  ['cmd "2">file', ["cmd", "2"], [{ op: ">", target: "file" }]],
  ["cmd > ''", ["cmd"], [{ op: ">", target: "" }]],
  ["> out cmd", ["cmd"], [{ op: ">", target: "out" }]],
  ["cmd > \\\n out", ["cmd"], [{ op: ">", target: "out" }]],
];
for (const [source, words, redirects] of redirectCases) {
  test(`redirects: ${JSON.stringify(source)}`, () => {
    assert.deepEqual(parseShell(source), result([command(words, false, redirects)]));
  });
}

const scriptCases: [string, SimpleCommand[], boolean?][] = [
  ["cmd 2>&1 | tail -50", [command(["cmd"], false, [{ fd: "2", op: ">&", target: "1" }]), command(["tail", "-50"], true)]],
  ["a | b | c", [command(["a"]), command(["b"], true), command(["c"], true)]],
  ["a |& b", [command(["a"]), command(["b"], true)]],
  ["a && b || c; d\ne;\n", [command(["a"]), command(["b"]), command(["c"]), command(["d"]), command(["e"])]],
  ["a | b && c", [command(["a"]), command(["b"], true), command(["c"])]],
  ["sleep 1 &", [command(["sleep", "1"])], true],
  ["a & b", [command(["a"]), command(["b"])], true],
  ["a && b", [command(["a"]), command(["b"])]],
  ['FOO=1 BAR="x y" cmd arg', [command(["cmd", "arg"], false, [], ["FOO=1", "BAR=x y"])]],
  ["FOO=1", [command([], false, [], ["FOO=1"])]],
  ["cmd FOO=1", [command(["cmd", "FOO=1"])]],
  ["FOO=1 >out cmd", [command(["cmd"], false, [{ op: ">", target: "out" }], ["FOO=1"])]],
  ["# comment\n\necho x # ignored\necho y", [command(["echo", "x"]), command(["echo", "y"])]],
  ["(echo a; echo b) && (echo c)", [command(["echo", "a"]), command(["echo", "b"]), command(["echo", "c"])]],
  ["a | (b)", [command(["a"]), command(["b"], true)]],
  ["(a;\n)", [command(["a"])]],
  ["(\na\n)\nb", [command(["a"]), command(["b"])]],
  ["((a))", [command(["a"])]],
  ["{ echo a; echo b; }", [command(["echo", "a"]), command(["echo", "b"])]],
  ["if true; then rm x; fi", [command(["true"]), command(["rm", "x"])]],
  ["if git status; then git diff; else echo no; fi", [command(["git", "status"]), command(["git", "diff"]), command(["echo", "no"])]],
  ["if false; then echo no; elif true; then rm x; fi", [command(["false"]), command(["echo", "no"]), command(["true"]), command(["rm", "x"])]],
  ["for f in a b; do rm \"$f\"; done", [command(["rm", "$f"])]],
  ["for f\ndo echo $f\ndone", [command(["echo", "$f"])]],
  ["select f in a b; do echo $f; done", [command(["echo", "$f"])]],
  ["until false; do echo x; done", [command(["false"]), command(["echo", "x"])]],
  ["! grep x f", [command(["grep", "x", "f"])]],
  ["if ! { true; }; then echo x; fi", [command(["true"]), command(["echo", "x"])]],
  ["if then ! {", []],
  ["fi; done; }", []],
  ["a &&\n b", [command(["a"]), command(["b"])]],
  ["a |\n b", [command(["a"]), command(["b"], true)]],
  ["", []], ["\n\n# only comment", []],
];
for (const [source, commands, background = false] of scriptCases) {
  test(`script: ${JSON.stringify(source)}`, () => assert.deepEqual(parseShell(source), result(commands, [], background)));
}

test("loop terminator redirects do not hide loop commands", () => {
  const parsed = parseShell("while read l; do tee -a log; done < in");
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.commands.map(({ words }) => words), [["read", "l"], ["tee", "-a", "log"]]);
});

for (const keyword of ["for", "select"]) {
  test(`${keyword} header words are data but substitutions are inspected`, () => {
    assert.deepEqual(parseShell(`${keyword} f in $(ls); do echo $f; done`), result([command(["echo", "$f"])], ["ls"]));
  });
}

const substitutionCases: [string, string[], string[]][] = [
  ["diff <(sort a) <(sort b)", ["diff", "<(sort a)", "<(sort b)"], ["sort a", "sort b"]],
  ["tee >(gzip > out.gz)", ["tee", ">(gzip > out.gz)"], ["gzip > out.gz"]],
  ['cat <(echo "a)b")', ["cat", '<(echo "a)b")'], ['echo "a)b"']],
  ["cat <(echo <(sort a))", ["cat", "<(echo <(sort a))"], ["echo <(sort a)"]],
  ["echo prefix<(sort a)suffix", ["echo", "prefix<(sort a)suffix"], ["sort a"]],
  ['echo "<(sort a)"', ["echo", "<(sort a)"], []],
  ["echo $(rm x)", ["echo", "$(rm x)"], ["rm x"]],
  ["echo `rm x`", ["echo", "`rm x`"], ["rm x"]],
  ["echo $(echo $(touch y))", ["echo", "$(echo $(touch y))"], ["echo $(touch y)"]],
  ['echo "prefix$(rm x)suffix"', ["echo", "prefix$(rm x)suffix"], ["rm x"]],
  ['echo "`rm x`"', ["echo", "`rm x`"], ["rm x"]],
  ["echo $(printf '%s' ')')", ["echo", "$(printf '%s' ')')"], ["printf '%s' ')'"]],
  ['echo $(echo "$(touch x)")', ["echo", '$(echo "$(touch x)")'], ['echo "$(touch x)"']],
  ["echo $((1 + $(touch x)))", ["echo", "$((1 + $(touch x)))"], ["touch x"]],
  ["echo $(a)$(b) `c`", ["echo", "$(a)$(b)", "`c`"], ["a", "b", "c"]],
  ["echo ${X:-$(touch y)}", ["echo", "${X:-$(touch y)}"], ["touch y"]],
  ["echo \"${X:-'$(touch y)'}\"", ["echo", "${X:-'$(touch y)'}"], ["touch y"]],
  ["echo $(echo ${X:-)})", ["echo", "$(echo ${X:-)})"], ["echo ${X:-)}"]],
  ["echo $( (echo x) )", ["echo", "$( (echo x) )"], [" (echo x) "]],
  ["echo $(echo x # ) ignored\n)", ["echo", "$(echo x # ) ignored\n)"], ["echo x # ) ignored\n"]],
  ["echo $(echo \\))", ["echo", "$(echo \\))"], ["echo \\)"]],
];
for (const [source, words, substitutions] of substitutionCases) {
  test(`substitutions: ${JSON.stringify(source)}`, () => {
    assert.deepEqual(parseShell(source), result([command(words)], substitutions));
  });
}

test("here-doc bodies are data, including apparent commands and substitutions", () => {
  for (const delimiter of ["EOF", "'EOF'", '"EOF"', "E\\OF"]) {
    assert.deepEqual(parseShell(`cat <<${delimiter}\nrm -rf /\n$(touch x)\nEOF\necho done`), result([
      command(["cat"], false, [{ op: "<<", target: "EOF" }]), command(["echo", "done"]),
    ]));
  }
});

test("multiple here-docs, tab stripping and a delimiter at EOF", () => {
  assert.deepEqual(parseShell("cat <<A <<-B\nfirst\nA\n\tsecond\n\tB\necho done"), result([
    command(["cat"], false, [{ op: "<<", target: "A" }, { op: "<<", target: "B" }]), command(["echo", "done"]),
  ]));
  assert.deepEqual(parseShell("cat <<EOF\ndata\nEOF"), result([command(["cat"], false, [{ op: "<<", target: "EOF" }])]));
});

test("substitutions in redirect targets and assignments are recorded", () => {
  assert.deepEqual(parseShell('X=$(a) cmd > "$(b)"'), result([
    command(["cmd"], false, [{ op: ">", target: "$(b)" }], ["X=$(a)"]),
  ], ["a", "b"]));
});

const unsupportedCases: [string, string][] = [
  ["case $x in a) rm y;; esac", "case"],
  ["if true; then case $x in a) rm y;; esac; fi", "case"],
  ["f() { rm x; }", "function definition"],
  ["f () { rm x; }", "function definition"],
  ["function f { rm x; }", "function definition"],
];
for (const [source, syntax] of unsupportedCases) {
  test(`unsupported: ${JSON.stringify(source)}`, () => {
    assert.deepEqual(parseShell(source), { ok: false, error: `unsupported shell syntax: ${syntax}` });
  });
}

for (const source of [
  "cat <(open", "tee >(open",
  "echo 'open", 'echo "open', "echo $(open", "echo `open", 'echo "$(open"', "echo $((1+2)", "echo ${open",
  "cat <<EOF\nbody", "cat <<EOF", "cat <<EOF\n EOF\n", "cat <<-EOF\n EOF\n", "cat <<A <<B\nA\n",
  "cmd >", "cmd 2>&", "cmd > | tail", "cmd > # comment", "cmd >\nnext", "cmd > >out",
  "a && && b", "| a", "a ||", "a &&", "a |", "a |&", "a ;; b", "; a", "a & & b",
  "echo trailing\\", "()", "(a", "a)", "a (b)", "(a)b", "a && )", "a\0b", "a &&\n",
]) {
  test(`error: ${JSON.stringify(source)}`, () => {
    const parsed = parseShell(source);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.ok(parsed.error.length > 0);
  });
}

function command(words: string[], piped = false, redirects: Redirect[] = [], assignments: string[] = []): SimpleCommand {
  return { assignments, words, redirects, piped };
}

function result(commands: SimpleCommand[], substitutions: string[] = [], background = false) {
  return { ok: true, commands, substitutions, background };
}
