const { serializeRepo, DEFAULT_IGNORE_PATTERNS } = require('../src/index');
const fs = require('fs');
const path = require('path');
const tmp = require('tmp');
const os = require('os');

describe('repo-serializer', () => {
    let tmpDir;
    let outputDir;

    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation();

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

    test('serializeRepo generates structure with root folder name', () => {
        const rootFolderName = path.basename(tmpDir.name);

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

        // First line should be the root folder name
        const lines = structure.split('\n');
        expect(lines[0]).toBe(rootFolderName + '/');

        // Rest of structure should be indented under root
        expect(structure).toContain('file1.txt');
        expect(structure).toContain('src/');
        expect(structure).toContain('file2.js');
        expect(structure).not.toContain('ignored.txt');
        expect(structure).not.toContain('test.log');
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
        const rootFolderName = path.basename(tmpDir.name);
        expect(structure).toContain(`${rootFolderName}/`);
        expect(structure).toContain('empty/');
    });

    test('serializeRepo handles nested empty directories', () => {
        fs.mkdirSync(path.join(tmpDir.name, 'level1'));
        fs.mkdirSync(path.join(tmpDir.name, 'level1', 'level2'));

        serializeRepo({
            repoRoot: tmpDir.name,
            outputDir: outputDir.name,
            structureFile: 'structure.txt',
            contentFile: 'content.txt'
        });

        const structure = fs.readFileSync(path.join(outputDir.name, 'structure.txt'), 'utf-8');
        const rootFolderName = path.basename(tmpDir.name);
        expect(structure).toContain(`${rootFolderName}/`);
        expect(structure).toContain('level1/');
        expect(structure).toContain('level2/');
    });

    test('serializeRepo handles binary files', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
        const repoDir = path.join(tmpDir, 'test-repo');
        fs.mkdirSync(repoDir);

        // Create a binary file
        const binaryFile = path.join(repoDir, 'test.bin');
        const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
        fs.writeFileSync(binaryFile, buffer);

        const outputDir = path.join(tmpDir, 'output');
        serializeRepo({
            repoRoot: repoDir,
            outputDir,
            structureFile: 'structure.txt',
            contentFile: 'content.txt'
        });

        const content = fs.readFileSync(path.join(outputDir, 'content.txt'), 'utf-8');
        expect(content).not.toContain('test.bin'); // Binary file should not be included in content
    });

    test('serializeRepo handles file read errors', () => {
        const testFile = path.join(tmpDir.name, 'error.txt');
        fs.writeFileSync(testFile, 'test content');

        // Mock fs.openSync to throw an error
        const originalOpenSync = fs.openSync;
        fs.openSync = jest.fn().mockImplementation((path) => {
            if (path.includes('error.txt')) {
                throw new Error('EACCES: permission denied');
            }
            return originalOpenSync(path);
        });

        // Spy on console.error
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        // Execute and expect no throw
        expect(() => {
            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                structureFile: 'structure.txt',
                contentFile: 'content.txt'
            });
        }).not.toThrow();

        // Verify error was logged
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining(`Error reading file ${testFile}: EACCES: permission denied`)
        );

        // Restore original fs.openSync
        fs.openSync = originalOpenSync;
        consoleErrorSpy.mockRestore();

        const content = fs.readFileSync(path.join(outputDir.name, 'content.txt'), 'utf-8');
        expect(content).not.toContain('error.txt'); // File with read error should not be included in content
    });

    test('serializeRepo handles empty files', () => {
        const emptyFile = path.join(tmpDir.name, 'empty.txt');
        fs.writeFileSync(emptyFile, '');

        serializeRepo({
            repoRoot: tmpDir.name,
            outputDir: outputDir.name,
            structureFile: 'structure.txt',
            contentFile: 'content.txt'
        });

        // Verify empty file is included in content
        const content = fs.readFileSync(path.join(outputDir.name, 'content.txt'), 'utf-8');
        expect(content).toContain('empty.txt');
        expect(content).toContain('FILE: empty.txt');
        expect(content).toContain('END FILE: empty.txt');
    });
});