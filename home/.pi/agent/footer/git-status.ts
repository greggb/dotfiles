import { execFile } from "node:child_process";
import { promisify } from "node:util";

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: number;
  modified: number;
  untracked: number;
}

const run = promisify(execFile);

export function parseGitStatus(output: string): GitStatus | undefined {
  const status: GitStatus = { branch: "", ahead: 0, behind: 0, staged: 0, modified: 0, untracked: 0 };
  let oid = "";
  const records = output.split("\0");
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (record.startsWith("# branch.head ")) status.branch = record.slice(14);
    else if (record.startsWith("# branch.oid ")) oid = record.slice(13, 20);
    else if (record.startsWith("# branch.ab ")) {
      const match = /^# branch\.ab \+(\d+) -(\d+)$/.exec(record);
      if (match) { status.ahead = Number(match[1]); status.behind = Number(match[2]); }
    } else if (record.startsWith("1 ") || record.startsWith("2 ")) {
      if (record[2] !== ".") status.staged++;
      if (record[3] !== ".") status.modified++;
      if (record.startsWith("2 ")) index++;
    } else if (record.startsWith("u ")) status.modified++;
    else if (record.startsWith("? ")) status.untracked++;
  }
  if (status.branch === "(detached)") status.branch = oid;
  return status.branch ? status : undefined;
}

export async function readGitStatus(cwd: string): Promise<GitStatus | undefined> {
  try {
    const { stdout } = await run("git", ["--no-optional-locks", "-C", cwd, "status", "--porcelain=v2", "--branch", "-z"], { encoding: "utf8", timeout: 2000, maxBuffer: 1024 * 1024 });
    return parseGitStatus(stdout);
  } catch {
    return undefined;
  }
}
