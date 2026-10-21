import { describe, it, afterEach } from 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
    buildGitGenieIgnoreAppend,
    ensureGitGenieExcluded,
    GIT_GENIE_IGNORE_ENTRY
} from '../../utils/gitignore';

describe('buildGitGenieIgnoreAppend', () => {
    it('should create the section without a leading blank line for an empty file', () => {
        assert.strictEqual(
            buildGitGenieIgnoreAppend('', 'Ignore Git Commit GenieX data'),
            `# Ignore Git Commit GenieX data\n${GIT_GENIE_IGNORE_ENTRY}\n`
        );
    });

    it('should add a blank line when existing content has no trailing newline', () => {
        assert.strictEqual(
            buildGitGenieIgnoreAppend('__pycache__/', 'Ignore Git Commit GenieX data'),
            `\n\n# Ignore Git Commit GenieX data\n${GIT_GENIE_IGNORE_ENTRY}\n`
        );
    });

    it('should add one newline when existing content has one trailing newline', () => {
        assert.strictEqual(
            buildGitGenieIgnoreAppend('__pycache__/\n', 'Ignore Git Commit GenieX data'),
            `\n# Ignore Git Commit GenieX data\n${GIT_GENIE_IGNORE_ENTRY}\n`
        );
    });

    it('should not add another blank line when one already exists', () => {
        assert.strictEqual(
            buildGitGenieIgnoreAppend('__pycache__/\n\n', 'Ignore Git Commit GenieX data'),
            `# Ignore Git Commit GenieX data\n${GIT_GENIE_IGNORE_ENTRY}\n`
        );
    });

    it('should preserve CRLF line endings', () => {
        assert.strictEqual(
            buildGitGenieIgnoreAppend('__pycache__/\r\n', 'Ignore Git Commit GenieX data'),
            `\r\n# Ignore Git Commit GenieX data\r\n${GIT_GENIE_IGNORE_ENTRY}\r\n`
        );
    });

    it('should skip an existing generated entry', () => {
        assert.strictEqual(
            buildGitGenieIgnoreAppend(`${GIT_GENIE_IGNORE_ENTRY}\n`, 'Ignore Git Commit GenieX data'),
            null
        );
    });

    it('should skip an existing directory entry', () => {
        assert.strictEqual(
            buildGitGenieIgnoreAppend('.gitgenie/\n', 'Ignore Git Commit GenieX data'),
            null
        );
    });

    it('should not treat a comment mentioning the entry as an ignore rule', () => {
        assert.strictEqual(
            buildGitGenieIgnoreAppend(
                '# Keep .gitgenie/ local\n',
                'Ignore Git Commit GenieX data'
            ),
            `\n# Ignore Git Commit GenieX data\n${GIT_GENIE_IGNORE_ENTRY}\n`
        );
    });
});

describe('ensureGitGenieExcluded', () => {
    const tempRoots: string[] = [];

    // 每个用例都在独立临时目录里搭建仓库结构，结束后统一清理
    function makeTempRoot(): string {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgenie-exclude-'));
        tempRoots.push(root);
        return root;
    }

    afterEach(() => {
        while (tempRoots.length) {
            fs.rmSync(tempRoots.pop()!, { recursive: true, force: true });
        }
    });

    it('should write the entry into .git/info/exclude for a regular repository', () => {
        const root = makeTempRoot();
        fs.mkdirSync(path.join(root, '.git'));

        ensureGitGenieExcluded(root, 'Ignore Git Commit GenieX data');

        const excludePath = path.join(root, '.git', 'info', 'exclude');
        assert.strictEqual(
            fs.readFileSync(excludePath, 'utf-8'),
            `# Ignore Git Commit GenieX data\n${GIT_GENIE_IGNORE_ENTRY}\n`
        );
        // 不再触碰仓库里的 .gitignore
        assert.strictEqual(fs.existsSync(path.join(root, '.gitignore')), false);
    });

    it('should be idempotent when called twice', () => {
        const root = makeTempRoot();
        fs.mkdirSync(path.join(root, '.git'));

        ensureGitGenieExcluded(root, 'Ignore Git Commit GenieX data');
        ensureGitGenieExcluded(root, 'Ignore Git Commit GenieX data');

        const content = fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf-8');
        const occurrences = content.split(GIT_GENIE_IGNORE_ENTRY).length - 1;
        assert.strictEqual(occurrences, 1);
    });

    it('should append after existing exclude content', () => {
        const root = makeTempRoot();
        const excludePath = path.join(root, '.git', 'info', 'exclude');
        fs.mkdirSync(path.dirname(excludePath), { recursive: true });
        fs.writeFileSync(excludePath, '*.log\n', 'utf-8');

        ensureGitGenieExcluded(root, 'Ignore Git Commit GenieX data');

        assert.strictEqual(
            fs.readFileSync(excludePath, 'utf-8'),
            `*.log\n\n# Ignore Git Commit GenieX data\n${GIT_GENIE_IGNORE_ENTRY}\n`
        );
    });

    it('should resolve the .git file pointer used by worktrees and submodules', () => {
        const root = makeTempRoot();
        const gitDir = path.join(root, 'real-git-dir');
        fs.mkdirSync(gitDir, { recursive: true });
        fs.writeFileSync(path.join(root, '.git'), `gitdir: ${gitDir}\n`, 'utf-8');

        ensureGitGenieExcluded(root, 'Ignore Git Commit GenieX data');

        assert.strictEqual(
            fs.existsSync(path.join(gitDir, 'info', 'exclude')),
            true
        );
    });

    it('should write into the common dir when commondir is present', () => {
        const root = makeTempRoot();
        // 模拟 worktree 结构：.git 文件 -> 私有 gitdir -> commondir 指向公共目录
        const commonDir = path.join(root, 'main-checkout', '.git');
        const worktreeGitDir = path.join(commonDir, 'worktrees', 'feature');
        fs.mkdirSync(worktreeGitDir, { recursive: true });
        fs.writeFileSync(path.join(worktreeGitDir, 'commondir'), '../..\n', 'utf-8');
        const worktreeRoot = path.join(root, 'feature-checkout');
        fs.mkdirSync(worktreeRoot, { recursive: true });
        fs.writeFileSync(path.join(worktreeRoot, '.git'), `gitdir: ${worktreeGitDir}\n`, 'utf-8');

        ensureGitGenieExcluded(worktreeRoot, 'Ignore Git Commit GenieX data');

        assert.strictEqual(
            fs.existsSync(path.join(commonDir, 'info', 'exclude')),
            true
        );
        // 私有 gitdir 下不应生成 exclude
        assert.strictEqual(
            fs.existsSync(path.join(worktreeGitDir, 'info', 'exclude')),
            false
        );
    });

    it('should do nothing for a directory that is not a git repository', () => {
        const root = makeTempRoot();

        assert.doesNotThrow(() => ensureGitGenieExcluded(root, 'Ignore Git Commit GenieX data'));
        assert.strictEqual(fs.readdirSync(root).length, 0);
    });
});
