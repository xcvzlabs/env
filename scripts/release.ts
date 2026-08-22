import * as v from 'valibot';

const releaseTypeSchema = v.picklist(['patch', 'minor', 'major']);
type ReleaseType = v.InferOutput<typeof releaseTypeSchema>;

const versionSchema = v.pipe(
  v.string(),
  v.regex(/^\d+\.\d+\.\d+$/, 'Invalid semantic version'),
  v.transform((version) => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
    if (!match) throw new Error('unreachable: regex already validated shape');
    const [, major, minor, patch] = match;
    return { major: Number(major), minor: Number(minor), patch: Number(patch) };
  }),
);
type Version = v.InferOutput<typeof versionSchema>;

const packageJsonSchema = v.object({ version: versionSchema });

function run(cmd: string[]): void {
  const { success } = Bun.spawnSync(cmd, { stdio: ['inherit', 'inherit', 'inherit'] });
  if (!success) throw new Error(`command failed: ${cmd.join(' ')}`);
}

function computeNextVersion(version: Version, type: ReleaseType): string {
  const { major, minor, patch } = version;
  if (type === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  if (major === 0) return minor === 0 ? `${major}.${minor + 1}.0` : '1.0.0';
  return `${major + 1}.0.0`;
}

const releaseType = v.parse(releaseTypeSchema, Bun.argv[2]);
const packageJson = v.parse(packageJsonSchema, await Bun.file('package.json').json());
const nextVersion = computeNextVersion(packageJson.version, releaseType);
const tag = `v${nextVersion}`;

run(['bunx', 'changelogen', '-r', nextVersion, '--bump']);
run(['git', 'add', 'package.json', 'CHANGELOG.md']);
run(['git', 'commit', '-m', `chore(release): ${tag}`]);
run(['git', 'tag', '-a', tag, '-m', tag]);
run(['git', 'push', '--follow-tags']);
