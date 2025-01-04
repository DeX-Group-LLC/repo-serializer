const { serializeRepo, ALWAYS_IGNORE_PATTERNS, DEFAULT_IGNORE_PATTERNS, parseFileSize, prettyFileSize, MIN_FILE_SIZE, MAX_FILE_SIZE, DEFAULT_MAX_FILE_SIZE } = require('../src/index');
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
        test('uses current working directory as default for repoRoot and outputDir', () => {
            // Mock process.cwd()
            const originalCwd = process.cwd;
            const mockCwd = jest.fn().mockReturnValue(tmpDir.name);
            process.cwd = mockCwd;

            // Create a test file in the current directory
            fs.writeFileSync(path.join(tmpDir.name, 'test.txt'), 'test content');

            // Call serializeRepo with minimal options
            serializeRepo({});

            // Verify files were created in the current directory
            const structure = fs.readFileSync(path.join(tmpDir.name, 'repo_structure.txt'), 'utf-8');
            const content = fs.readFileSync(path.join(tmpDir.name, 'repo_content.txt'), 'utf-8');

            expect(structure).toContain('test.txt');
            expect(content).toContain('test content');
            expect(mockCwd).toHaveBeenCalled();

            // Restore original process.cwd
            process.cwd = originalCwd;
        });

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

        test('respects noGitignore option', () => {
            // Create a nested .gitignore to ensure both functions are tested
            fs.mkdirSync(path.join(tmpDir.name, 'nested'));
            fs.writeFileSync(path.join(tmpDir.name, 'nested', '.gitignore'), '*.txt');
            fs.writeFileSync(path.join(tmpDir.name, 'nested', 'test.txt'), 'Should appear with noGitignore');

            // First test with default behavior (should respect .gitignore)
            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                structureFile: 'structure1.txt',
                contentFile: 'content1.txt'
            });

            const defaultStructure = fs.readFileSync(path.join(outputDir.name, 'structure1.txt'), 'utf-8');
            const defaultContent = fs.readFileSync(path.join(outputDir.name, 'content1.txt'), 'utf-8');
            expect(defaultStructure).not.toContain('test.txt');
            expect(defaultContent).not.toContain('Should appear with noGitignore');

            // Then test with noGitignore=true (should ignore .gitignore files)
            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                structureFile: 'structure2.txt',
                contentFile: 'content2.txt',
                noGitignore: true
            });

            const noGitignoreStructure = fs.readFileSync(path.join(outputDir.name, 'structure2.txt'), 'utf-8');
            const noGitignoreContent = fs.readFileSync(path.join(outputDir.name, 'content2.txt'), 'utf-8');
            expect(noGitignoreStructure).toContain('test.txt');
            expect(noGitignoreContent).toContain('Should appear with noGitignore');
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

        test('respects ignoreDefaultPatterns option', () => {
            // Create a dot file that would normally be ignored
            fs.writeFileSync(path.join(tmpDir.name, '.hidden'), 'Hidden file content');
            fs.writeFileSync(path.join(tmpDir.name, 'package-lock.json'), '{}');

            // First test with default behavior (should ignore dot files)
            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                structureFile: 'structure1.txt',
                contentFile: 'content1.txt'
            });

            const defaultStructure = fs.readFileSync(path.join(outputDir.name, 'structure1.txt'), 'utf-8');
            expect(defaultStructure).not.toContain('.hidden');
            expect(defaultStructure).not.toContain('package-lock.json');

            // Then test with ignoreDefaultPatterns=true (should include dot files)
            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                structureFile: 'structure2.txt',
                contentFile: 'content2.txt',
                ignoreDefaultPatterns: true
            });

            const noDefaultStructure = fs.readFileSync(path.join(outputDir.name, 'structure2.txt'), 'utf-8');
            expect(noDefaultStructure).toContain('.hidden');
            expect(noDefaultStructure).toContain('package-lock.json');
        });

        test('ALWAYS_IGNORE_PATTERNS contains expected patterns', () => {
            expect(ALWAYS_IGNORE_PATTERNS).toContain('.git/');
        });

        test('DEFAULT_IGNORE_PATTERNS contains expected patterns', () => {
            expect(DEFAULT_IGNORE_PATTERNS).toContain('.*');
            expect(DEFAULT_IGNORE_PATTERNS).toContain('.*/');
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

    // File size parsing tests
    describe('parseFileSize', () => {
        test('handles null/undefined input', () => {
            expect(parseFileSize(null)).toBe(DEFAULT_MAX_FILE_SIZE);
            expect(parseFileSize(undefined)).toBe(DEFAULT_MAX_FILE_SIZE);
        });

        test('handles numeric input', () => {
            expect(parseFileSize(1024)).toBe(1024);
            // Test string number without units
            expect(parseFileSize('1024')).toBe(1024);
            expect(parseFileSize('512')).toBe(512);
        });

        test('parses string inputs with different units', () => {
            // Test bytes unit explicitly
            expect(parseFileSize('512B')).toBe(512);
            expect(parseFileSize('1024B')).toBe(1024);
            // Test other units
            expect(parseFileSize('1KB')).toBe(1024);
            expect(parseFileSize('1 KB')).toBe(1024);
            expect(parseFileSize('1MB')).toBe(1024 * 1024);
            expect(parseFileSize('1GB')).toBe(1024 * 1024 * 1024);
            // Test no unit (defaults to bytes)
            expect(parseFileSize('1024')).toBe(1024);
        });

        test('throws error for invalid formats', () => {
            expect(() => parseFileSize('invalid')).toThrow('Invalid file size format: invalid');
            expect(() => parseFileSize('KB')).toThrow('Invalid file size format: KB');
            expect(() => parseFileSize('1.5KB')).toThrow('Invalid file size format: 1.5KB');
            expect(() => parseFileSize('-1KB')).toThrow('Invalid file size format: -1KB');
            expect(() => parseFileSize('1TB')).toThrow('Invalid file size format: 1TB');
            expect(() => parseFileSize('1PB')).toThrow('Invalid file size format: 1PB');
        });
    });

    // Pretty file size tests
    describe('prettyFileSize', () => {
        test('formats file sizes correctly', () => {
            expect(prettyFileSize(512)).toBe('512B');
            expect(prettyFileSize(1024)).toBe('1KB');
            expect(prettyFileSize(1024 * 1024)).toBe('1MB');
            expect(prettyFileSize(1024 * 1024 * 1024)).toBe('1GB');
        });
    });

    // File size limit tests
    describe('file size limits', () => {
        test('handles large files', () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const largeFile = path.join(tmpDir, 'large.txt');

            // Create a file larger than 8KB (default max size)
            const largeContent = Buffer.alloc(8193).fill('x');
            fs.writeFileSync(largeFile, largeContent);

            serializeRepo({
                repoRoot: tmpDir,
                outputDir: tmpDir,
                structureFile: 'structure.txt',
                contentFile: 'content.txt'
            });

            const content = fs.readFileSync(path.join(tmpDir, 'content.txt'), 'utf-8');
            expect(content).not.toContain('FILE: large.txt');
        });

        test('validates maxFileSize limits', () => {
            expect(() => serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                maxFileSize: MIN_FILE_SIZE - 1
            })).toThrow(`Max file size must be between`);

            expect(() => serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                maxFileSize: MAX_FILE_SIZE + 1
            })).toThrow(`Max file size must be between`);
        });
    });
});