import * as fs from 'fs';
import * as path from 'path';

export const GIT_GENIE_IGNORE_ENTRY = '.gitgenie/**';

/**
 * Builds an idempotent ignore section with a blank line boundary.
 *
 * The same layout is reused for both .gitignore and .git/info/exclude so
 * every writer produces identical ignore-file sections.
 *
 * @param existing Existing ignore-file content.
 * @param sectionLabel Human-readable comment for the generated section.
 * @returns Content to append, or null when Git Commit GenieX is already ignored.
 */
export function buildGitGenieIgnoreAppend(
    existing: string,
    sectionLabel: string
): string | null {
    const existingEntries = existing
        .split(/\r?\n/)
        .map(line => line.trim());

    if (existingEntries.includes(GIT_GENIE_IGNORE_ENTRY) || existingEntries.includes('.gitgenie/')) {
        return null;
    }

    const lineEnding = existing.includes('\r\n') ? '\r\n' : '\n';
    const section = `# ${sectionLabel}${lineEnding}${GIT_GENIE_IGNORE_ENTRY}${lineEnding}`;

    if (existing.length === 0 || existing.endsWith(`${lineEnding}${lineEnding}`)) {
        return section;
    }
    if (existing.endsWith(lineEnding)) {
        return `${lineEnding}${section}`;
    }
    return `${lineEnding}${lineEnding}${section}`;
}

/**
 * 解析仓库 git exclude 文件（info/exclude）的绝对路径。
 *
 * 兼容 worktree/submodule 下 .git 为文本指针文件的情况；
 * worktree 的 gitdir 里若存在 commondir 指针，exclude 位于公共 git 目录下。
 * 非 git 仓库返回 null。
 */
function resolveGitExcludeFilePath(repositoryRoot: string): string | null {
    const dotGitPath = path.join(repositoryRoot, '.git');
    if (!fs.existsSync(dotGitPath)) { return null; }

    let gitDir = dotGitPath;
    if (fs.statSync(dotGitPath).isFile()) {
        // .git 是文本文件，内容为 "gitdir: <真实 git 目录>"，路径可相对仓库根
        const pointer = fs.readFileSync(dotGitPath, 'utf-8').match(/^gitdir:\s*(.+)$/m);
        if (!pointer) { return null; }
        gitDir = path.resolve(repositoryRoot, pointer[1].trim());
    }

    // 关联 worktree 的 gitdir 通过 commondir 文件指向公共目录，info/exclude 在公共目录下
    const commonDirFilePath = path.join(gitDir, 'commondir');
    if (fs.existsSync(commonDirFilePath)) {
        try {
            const commonDirRel = fs.readFileSync(commonDirFilePath, 'utf-8').trim();
            if (commonDirRel) { gitDir = path.resolve(gitDir, commonDirRel); }
        } catch { /* commondir 读取失败时按 gitdir 本身处理 */ }
    }

    return path.join(gitDir, 'info', 'exclude');
}

/**
 * 确保 .gitgenie 的 ignore 条目写入仓库的 .git/info/exclude。
 *
 * exclude 只对本机生效、不会被提交共享，因此不再污染仓库里的 .gitignore；
 * 非 git 仓库或条目已存在时直接跳过。写入失败会抛错，由调用方决定降级策略。
 *
 * @param repositoryRoot 仓库根目录。
 * @param sectionLabel 生成的 ignore 小节使用的人类可读注释。
 */
export function ensureGitGenieExcluded(repositoryRoot: string, sectionLabel: string): void {
    const excludePath = resolveGitExcludeFilePath(repositoryRoot);
    if (!excludePath) { return; }

    let existing = '';
    if (fs.existsSync(excludePath)) {
        try { existing = fs.readFileSync(excludePath, 'utf-8'); } catch { existing = ''; }
    }

    const toAppend = buildGitGenieIgnoreAppend(existing, sectionLabel);
    if (!toAppend) { return; }

    // 首次写入时 info 目录可能不存在，先补齐再追加
    fs.mkdirSync(path.dirname(excludePath), { recursive: true });
    fs.appendFileSync(excludePath, toAppend, { encoding: 'utf-8' });
}
