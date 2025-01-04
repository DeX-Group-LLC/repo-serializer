const { serializeRepo, DEFAULT_IGNORE_PATTERNS } = require('../src/index');
const fs = require('fs');
const path = require('path');
const tmp = require('tmp');

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

    test('serializeRepo generates structure and content files', () => {
        serializeRepo({
            repoRoot: tmpDir.name,
            outputDir: outputDir.name,
            structureFile: 'structure.txt',
            contentFile: 'content.txt'
        });

        // Check if output files exist
        expect(fs.existsSync(path.join(outputDir.name, 'structure.txt'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir.name, 'content.txt'))).toBe(true);

        // Read and verify structure file
        const structure = fs.readFileSync(path.join(outputDir.name, 'structure.txt'), 'utf-8');
        expect(structure).toContain('file1.txt');
        expect(structure).toContain('src/');
        expect(structure).toContain('file2.js');
        expect(structure).not.toContain('ignored.txt');
        expect(structure).not.toContain('test.log');

        // Read and verify content file
        const content = fs.readFileSync(path.join(outputDir.name, 'content.txt'), 'utf-8');
        expect(content).toContain('Content of file 1');
        expect(content).toContain('console.log("Hello")');
        expect(content).not.toContain('Should not appear');
    });

    test('DEFAULT_IGNORE_PATTERNS contains expected patterns', () => {
        expect(DEFAULT_IGNORE_PATTERNS).toContain('.git/');
        expect(DEFAULT_IGNORE_PATTERNS).toContain('package-lock.json');
        expect(DEFAULT_IGNORE_PATTERNS).toContain('node_modules/');
    });

    test('serializeRepo handles additional ignore patterns', () => {
        // Create an additional file to ignore
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

    test('serializeRepo handles empty directories', () => {
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
});