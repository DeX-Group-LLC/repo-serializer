const { serializeRepo, DEFAULT_IGNORE_PATTERNS } = require('../src/index');
const fs = require('fs');
const path = require('path');
const tmp = require('tmp');
const os = require('os');

describe('repo-serializer', () => {
    let tmpDir;
    let outputDir;

    beforeEach(() => {
        // Create a temporary directory for test files
        tmpDir = tmp.dirSync({ unsafeCleanup: true });
        outputDir = tmp.dirSync({ unsafeCleanup: true });

        // Create a mock repository structure
        fs.writeFileSync(path.join(tmpDir.name, 'file1.txt'), 'Content of file 1');
        fs.mkdirSync(path.join(tmpDir.name, 'src'));
        fs.writeFileSync(path.join(tmpDir.name, 'src', 'file2.js'), 'console.log("Hello");');

        // Create a .gitignore
        fs.writeFileSync(path.join(tmpDir.name, '.gitignore'), 'ignored.txt\n*.log');

        // Create some files that should be ignored
        fs.writeFileSync(path.join(tmpDir.name, 'ignored.txt'), 'Should not appear');
        fs.writeFileSync(path.join(tmpDir.name, 'test.log'), 'Should not appear');
    });

    afterEach(() => {
        // Clean up temporary directories
        tmpDir.removeCallback();
        outputDir.removeCallback();
    });

    // Basic functionality tests
    describe('basic functionality', () => {
        test('generates structure with root folder name', () => {
            const rootFolderName = path.basename(tmpDir.name);

            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                structureFile: 'structure.txt',
                contentFile: 'content.txt'
            });

            const structure = fs.readFileSync(path.join(outputDir.name, 'structure.txt'), 'utf-8');
            const lines = structure.split('\n');
            expect(lines[0]).toBe(rootFolderName + '/');
            expect(structure).toContain('file1.txt');
            expect(structure).toContain('src/');
            expect(structure).toContain('file2.js');
        });

        test('generates structure and content files', () => {
            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                structureFile: 'structure.txt',
                contentFile: 'content.txt'
            });

            const structure = fs.readFileSync(path.join(outputDir.name, 'structure.txt'), 'utf-8');
            const content = fs.readFileSync(path.join(outputDir.name, 'content.txt'), 'utf-8');
            expect(content).toContain('Content of file 1');
            expect(content).toContain('console.log("Hello")');
        });

        test('DEFAULT_IGNORE_PATTERNS contains expected patterns', () => {
            expect(DEFAULT_IGNORE_PATTERNS).toContain('.git/');
            expect(DEFAULT_IGNORE_PATTERNS).toContain('package-lock.json');
            expect(DEFAULT_IGNORE_PATTERNS).toContain('node_modules/');
        });
    });

    // File ignoring tests
    describe('file ignoring', () => {
        test('handles .gitignore patterns', () => {
            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                structureFile: 'structure.txt',
                contentFile: 'content.txt'
            });

            const structure = fs.readFileSync(path.join(outputDir.name, 'structure.txt'), 'utf-8');
            expect(structure).not.toContain('ignored.txt');
            expect(structure).not.toContain('test.log');
        });

        test('handles additional ignore patterns', () => {
            fs.writeFileSync(path.join(tmpDir.name, 'custom.skip'), 'Skip this');

            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                structureFile: 'structure.txt',
                contentFile: 'content.txt',
                additionalIgnorePatterns: ['*.skip']
            });

            const structure = fs.readFileSync(path.join(outputDir.name, 'structure.txt'), 'utf-8');
            expect(structure).not.toContain('custom.skip');
        });
    });

    // Directory handling tests
    describe('directory handling', () => {
        test('handles empty directories', () => {
            fs.mkdirSync(path.join(tmpDir.name, 'empty'));

            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                structureFile: 'structure.txt',
                contentFile: 'content.txt'
            });

            const structure = fs.readFileSync(path.join(outputDir.name, 'structure.txt'), 'utf-8');
            expect(structure).toContain('empty/');
        });

        test('handles nested empty directories', () => {
            fs.mkdirSync(path.join(tmpDir.name, 'level1'));
            fs.mkdirSync(path.join(tmpDir.name, 'level1', 'level2'));

            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                structureFile: 'structure.txt',
                contentFile: 'content.txt'
            });

            const structure = fs.readFileSync(path.join(outputDir.name, 'structure.txt'), 'utf-8');
            expect(structure).toContain('level1/');
            expect(structure).toContain('level2/');
        });
    });

    // Library mode tests
    describe('library mode', () => {
        test('succeeds when no files exist', () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const repoDir = path.join(tmpDir, 'test-repo');
            const outputDir = path.join(tmpDir, 'output');
            fs.mkdirSync(repoDir);
            fs.mkdirSync(outputDir);

            fs.writeFileSync(path.join(repoDir, 'test.txt'), 'test content');

            serializeRepo({
                repoRoot: repoDir,
                outputDir,
                structureFile: 'structure.txt',
                contentFile: 'content.txt'
            });

            const structure = fs.readFileSync(path.join(outputDir, 'structure.txt'), 'utf-8');
            const content = fs.readFileSync(path.join(outputDir, 'content.txt'), 'utf-8');
            expect(structure).toContain('test.txt');
            expect(content).toContain('test content');
        });

        test('succeeds when no files exist with force=true', () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const repoDir = path.join(tmpDir, 'test-repo');
            const outputDir = path.join(tmpDir, 'output');
            fs.mkdirSync(repoDir);
            fs.mkdirSync(outputDir);

            fs.writeFileSync(path.join(repoDir, 'test.txt'), 'test content');

            serializeRepo({
                repoRoot: repoDir,
                outputDir,
                structureFile: 'structure.txt',
                contentFile: 'content.txt',
                force: true
            });

            const structure = fs.readFileSync(path.join(outputDir, 'structure.txt'), 'utf-8');
            const content = fs.readFileSync(path.join(outputDir, 'content.txt'), 'utf-8');
            expect(structure).toContain('test.txt');
            expect(content).toContain('test content');
        });

        test('throws error if output files exist without force', () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const repoDir = path.join(tmpDir, 'test-repo');
            const outputDir = path.join(tmpDir, 'output');
            fs.mkdirSync(repoDir);
            fs.mkdirSync(outputDir);

            fs.writeFileSync(path.join(repoDir, 'test.txt'), 'test content');
            fs.writeFileSync(path.join(outputDir, 'structure.txt'), 'existing structure');
            fs.writeFileSync(path.join(outputDir, 'content.txt'), 'existing content');

            expect(() => {
                serializeRepo({
                    repoRoot: repoDir,
                    outputDir,
                    structureFile: 'structure.txt',
                    contentFile: 'content.txt'
                });
            }).toThrow('Output files already exist. Set force=true to overwrite.');
        });

        test('overwrites existing files with force option', () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const repoDir = path.join(tmpDir, 'test-repo');
            const outputDir = path.join(tmpDir, 'output');
            fs.mkdirSync(repoDir);
            fs.mkdirSync(outputDir);

            fs.writeFileSync(path.join(repoDir, 'test.txt'), 'test content');
            fs.writeFileSync(path.join(outputDir, 'structure.txt'), 'old structure');
            fs.writeFileSync(path.join(outputDir, 'content.txt'), 'old content');

            serializeRepo({
                repoRoot: repoDir,
                outputDir,
                structureFile: 'structure.txt',
                contentFile: 'content.txt',
                force: true
            });

            const structure = fs.readFileSync(path.join(outputDir, 'structure.txt'), 'utf-8');
            const content = fs.readFileSync(path.join(outputDir, 'content.txt'), 'utf-8');
            expect(structure).toContain('test.txt');
            expect(content).toContain('test content');
            expect(structure).not.toBe('old structure');
            expect(content).not.toBe('old content');
        });
    });

    // CLI mode tests
    describe('CLI mode', () => {
        test('succeeds when no files exist', () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const repoDir = path.join(tmpDir, 'test-repo');
            const outputDir = path.join(tmpDir, 'output');
            fs.mkdirSync(repoDir);
            fs.mkdirSync(outputDir);

            fs.writeFileSync(path.join(repoDir, 'test.txt'), 'test content');

            serializeRepo({
                repoRoot: repoDir,
                outputDir,
                structureFile: 'structure.txt',
                contentFile: 'content.txt',
                isCliCall: true
            });

            const structure = fs.readFileSync(path.join(outputDir, 'structure.txt'), 'utf-8');
            const content = fs.readFileSync(path.join(outputDir, 'content.txt'), 'utf-8');
            expect(structure).toContain('test.txt');
            expect(content).toContain('test content');
        });

        test('succeeds when no files exist with force=true', () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const repoDir = path.join(tmpDir, 'test-repo');
            const outputDir = path.join(tmpDir, 'output');
            fs.mkdirSync(repoDir);
            fs.mkdirSync(outputDir);

            fs.writeFileSync(path.join(repoDir, 'test.txt'), 'test content');

            serializeRepo({
                repoRoot: repoDir,
                outputDir,
                structureFile: 'structure.txt',
                contentFile: 'content.txt',
                isCliCall: true,
                force: true
            });

            const structure = fs.readFileSync(path.join(outputDir, 'structure.txt'), 'utf-8');
            const content = fs.readFileSync(path.join(outputDir, 'content.txt'), 'utf-8');
            expect(structure).toContain('test.txt');
            expect(content).toContain('test content');
        });

        test('requires prompt when files exist without force', () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const repoDir = path.join(tmpDir, 'test-repo');
            const outputDir = path.join(tmpDir, 'output');
            fs.mkdirSync(repoDir);
            fs.mkdirSync(outputDir);

            fs.writeFileSync(path.join(repoDir, 'test.txt'), 'test content');
            fs.writeFileSync(path.join(outputDir, 'structure.txt'), 'old structure');

            expect(() => {
                serializeRepo({
                    repoRoot: repoDir,
                    outputDir,
                    structureFile: 'structure.txt',
                    contentFile: 'content.txt',
                    isCliCall: true
                });
            }).toThrow('PROMPT_REQUIRED');
        });

        test('overwrites files with force option', () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const repoDir = path.join(tmpDir, 'test-repo');
            const outputDir = path.join(tmpDir, 'output');
            fs.mkdirSync(repoDir);
            fs.mkdirSync(outputDir);

            fs.writeFileSync(path.join(repoDir, 'test.txt'), 'test content');
            fs.writeFileSync(path.join(outputDir, 'structure.txt'), 'old structure');
            fs.writeFileSync(path.join(outputDir, 'content.txt'), 'old content');

            serializeRepo({
                repoRoot: repoDir,
                outputDir,
                structureFile: 'structure.txt',
                contentFile: 'content.txt',
                isCliCall: true,
                force: true
            });

            const structure = fs.readFileSync(path.join(outputDir, 'structure.txt'), 'utf-8');
            const content = fs.readFileSync(path.join(outputDir, 'content.txt'), 'utf-8');
            expect(structure).toContain('test.txt');
            expect(content).toContain('test content');
            expect(structure).not.toBe('old structure');
            expect(content).not.toBe('old content');
        });
    });
});