// Clones (or updates) the team's data repo into data/tech-battle/.
// The CSVs are NOT committed to this repo, since the data repo is the source of truth.
// Override the source with DATA_REPO_URL, the target with DATA_DIR.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"

const repo =
  process.env.DATA_REPO_URL ?? "https://github.com/esakovaa/tech-battle.git"
const dir = path.resolve(process.env.DATA_DIR ?? "data/tech-battle")
const git = (...args) => execFileSync("git", args, { stdio: "inherit" })

if (existsSync(path.join(dir, ".git"))) {
  console.log(`Updating ${dir}…`)
  git("-C", dir, "pull", "--ff-only")
} else {
  mkdirSync(path.dirname(dir), { recursive: true })
  console.log(`Cloning ${repo} → ${dir}…`)
  git("clone", "--depth", "1", repo, dir)
}
