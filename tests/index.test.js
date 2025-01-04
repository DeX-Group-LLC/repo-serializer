const { serializeRepo, DEFAULT_IGNORE_PATTERNS } = require('../src/index');
const fs = require('fs');
const path = require('path');
const tmp = require('tmp');
const os = require('os');

describe('repo-serializer', () => {
    let tmpDir;
    let outputDir;

    beforeEach(() => {
        // Restore all mocks
        jest.restoreAllMocks();

        // Mock console.log to prevent output in tests
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

        test('DEFAULT_IGNORE_PATTERNS contains expected patterns', () => {
            expect(DEFAULT_IGNORE_PATTERNS).toContain('.git/');
            expect(DEFAULT_IGNORE_PATTERNS).toContain('package-lock.json');
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

        test('handles output files inside repository root', () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const repoDir = path.join(tmpDir, 'test-repo');
            fs.mkdirSync(repoDir);

            // Create test content and output files inside repo root
            fs.writeFileSync(path.join(repoDir, 'test.txt'), 'test content');
            fs.writeFileSync(path.join(repoDir, 'structure.txt'), 'old structure');
            fs.writeFileSync(path.join(repoDir, 'content.txt'), 'old content');

            serializeRepo({
                repoRoot: repoDir,
                outputDir: repoDir,  // Output to repo root
                structureFile: 'structure.txt',
                contentFile: 'content.txt',
                force: true
            });

            const structure = fs.readFileSync(path.join(repoDir, 'structure.txt'), 'utf-8');
            const content = fs.readFileSync(path.join(repoDir, 'content.txt'), 'utf-8');
            expect(structure).toContain('test.txt');
            expect(content).toContain('test content');
            // Output files should not be included in their own output
            expect(content).not.toContain('old structure');
            expect(content).not.toContain('old content');
        });

        test('handles output files outside repository root', () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const repoDir = path.join(tmpDir, 'test-repo');
            const outputDir = path.join(tmpDir, 'output');
            fs.mkdirSync(repoDir);
            fs.mkdirSync(outputDir);

            // Create test content and output files outside repo root
            fs.writeFileSync(path.join(repoDir, 'test.txt'), 'test content');
            fs.writeFileSync(path.join(outputDir, 'structure.txt'), 'old structure');
            fs.writeFileSync(path.join(outputDir, 'content.txt'), 'old content');

            serializeRepo({
                repoRoot: repoDir,
                outputDir: outputDir,
                structureFile: 'structure.txt',
                contentFile: 'content.txt',
                force: true
            });

            const structure = fs.readFileSync(path.join(outputDir, 'structure.txt'), 'utf-8');
            const content = fs.readFileSync(path.join(outputDir, 'content.txt'), 'utf-8');
            // Should include all repo files since output is outside
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

        test('handles case when only structure file exists', () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const repoDir = path.join(tmpDir, 'test-repo');
            const outputDir = path.join(tmpDir, 'output');
            fs.mkdirSync(repoDir);
            fs.mkdirSync(outputDir);

            // Create only the structure file
            fs.writeFileSync(path.join(outputDir, 'structure.txt'), 'old structure');

            expect(() => {
                serializeRepo({
                    repoRoot: repoDir,
                    outputDir,
                    structureFile: 'structure.txt',
                    contentFile: 'content.txt'
                });
            }).toThrow('Output files already exist. Set force=true to overwrite.');

            // Test with force=true
            serializeRepo({
                repoRoot: repoDir,
                outputDir,
                structureFile: 'structure.txt',
                contentFile: 'content.txt',
                force: true
            });

            // Verify old structure file was deleted and new files were created
            const structure = fs.readFileSync(path.join(outputDir, 'structure.txt'), 'utf-8');
            expect(structure).not.toBe('old structure');
        });

        test('handles case when only content file exists', () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const repoDir = path.join(tmpDir, 'test-repo');
            const outputDir = path.join(tmpDir, 'output');
            fs.mkdirSync(repoDir);
            fs.mkdirSync(outputDir);

            // Create only the content file
            fs.writeFileSync(path.join(outputDir, 'content.txt'), 'old content');

            expect(() => {
                serializeRepo({
                    repoRoot: repoDir,
                    outputDir,
                    structureFile: 'structure.txt',
                    contentFile: 'content.txt'
                });
            }).toThrow('Output files already exist. Set force=true to overwrite.');

            // Test with force=true
            serializeRepo({
                repoRoot: repoDir,
                outputDir,
                structureFile: 'structure.txt',
                contentFile: 'content.txt',
                force: true
            });

            // Verify old content file was deleted and new files were created
            const content = fs.readFileSync(path.join(outputDir, 'content.txt'), 'utf-8');
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

        test('handles case when only structure file exists', () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const repoDir = path.join(tmpDir, 'test-repo');
            const outputDir = path.join(tmpDir, 'output');
            fs.mkdirSync(repoDir);
            fs.mkdirSync(outputDir);

            // Create test content and only structure file
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

            // Test with force=true
            serializeRepo({
                repoRoot: repoDir,
                outputDir,
                structureFile: 'structure.txt',
                contentFile: 'content.txt',
                isCliCall: true,
                force: true
            });

            // Verify old structure file was deleted and new files were created
            const structure = fs.readFileSync(path.join(outputDir, 'structure.txt'), 'utf-8');
            expect(structure).not.toBe('old structure');
            expect(structure).toContain('test.txt');
        });

        test('handles case when only content file exists', () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const repoDir = path.join(tmpDir, 'test-repo');
            const outputDir = path.join(tmpDir, 'output');
            fs.mkdirSync(repoDir);
            fs.mkdirSync(outputDir);

            // Create test content and only content file
            fs.writeFileSync(path.join(repoDir, 'test.txt'), 'test content');
            fs.writeFileSync(path.join(outputDir, 'content.txt'), 'old content');

            expect(() => {
                serializeRepo({
                    repoRoot: repoDir,
                    outputDir,
                    structureFile: 'structure.txt',
                    contentFile: 'content.txt',
                    isCliCall: true
                });
            }).toThrow('PROMPT_REQUIRED');

            // Test with force=true
            serializeRepo({
                repoRoot: repoDir,
                outputDir,
                structureFile: 'structure.txt',
                contentFile: 'content.txt',
                isCliCall: true,
                force: true
            });

            // Verify old content file was deleted and new files were created
            const content = fs.readFileSync(path.join(outputDir, 'content.txt'), 'utf-8');
            expect(content).not.toBe('old content');
            expect(content).toContain('test content');
        });
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
        jest.spyOn(fs, 'openSync').mockImplementation((path, ...args) => {
            if (path.includes('error.txt')) {
                throw new Error('EACCES: permission denied');
            }
            return originalOpenSync(path, ...args);
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
        fs.openSync.mockRestore();
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