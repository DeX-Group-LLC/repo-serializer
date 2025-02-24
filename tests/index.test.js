/**
 * Tests for repo-serializer module
 * This test suite verifies the functionality of the repository serialization tool,
 * which creates text-based representations of repository contents and structure.
 * The tests cover basic functionality, file handling, CLI operations, and edge cases.
 */

const fs = require('fs');
const path = require('path');
const tmp = require('tmp');
const os = require('os');
const { serializeRepo, ALWAYS_IGNORE_PATTERNS, DEFAULT_IGNORE_PATTERNS, parseFileSize, prettyFileSize, MIN_FILE_SIZE, MAX_FILE_SIZE, DEFAULT_MAX_FILE_SIZE } = require('../src/index');

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
        /**
         * Tests core functionality of the serializer:
         * - Default directory handling
         * - Structure generation
         * - Content generation
         * - Basic file operations
         */

        test('uses current working directory as default for repoRoot and outputDir', () => {
            /**
             * Verifies that the serializer uses process.cwd() as the default
             * for both repository root and output directory when not specified
             */

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
            /**
             * Ensures that the generated structure file starts with
             * the root folder name and contains correct file hierarchy
             */

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
            /**
             * Verifies that both structure and content files are generated
             * with correct file contents and proper formatting
             */

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

        test('respects hierarchicalContent option for content ordering', () => {
            /**
             * Verifies that the hierarchicalContent option correctly affects
             * the ordering of files in the content file:
             * - Default (false): directories before files, then alphabetical within each type
             * - Hierarchical (true): pure alphabetical ordering at each level
             */

            // Create a specific structure to test ordering
            fs.mkdirSync(path.join(tmpDir.name, 'b_dir'));
            fs.writeFileSync(path.join(tmpDir.name, 'b_dir', 'z_file.txt'), 'z_file in b_dir');
            fs.writeFileSync(path.join(tmpDir.name, 'b_dir', 'a_file.txt'), 'a_file in b_dir');
            fs.mkdirSync(path.join(tmpDir.name, 'b_dir', 'c_subdir'));
            fs.writeFileSync(path.join(tmpDir.name, 'b_dir', 'c_subdir', 'file.txt'), 'file in c_subdir');
            fs.writeFileSync(path.join(tmpDir.name, 'a_file.txt'), 'a_file content');
            fs.writeFileSync(path.join(tmpDir.name, 'c_file.txt'), 'c_file content');

            // Test default ordering (directories first)
            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                structureFile: 'structure1.txt',
                contentFile: 'content1.txt',
                hierarchicalContent: false
            });

            const defaultContent = fs.readFileSync(path.join(outputDir.name, 'content1.txt'), 'utf-8');
            const defaultMatches = defaultContent.match(/FILE: [^\n]+/g);
            const defaultFiles = defaultMatches.map(match => match.replace('FILE: ', ''));

            // In default mode:
            // 1. b_dir/c_subdir/file.txt should come first (deepest directory)
            // 2. Then b_dir/a_file.txt and b_dir/z_file.txt (alphabetically within b_dir)
            // 3. Finally a_file.txt and c_file.txt (root files alphabetically)
            expect(defaultFiles.indexOf('b_dir/c_subdir/file.txt')).toBeLessThan(defaultFiles.indexOf('b_dir/a_file.txt'));
            expect(defaultFiles.indexOf('b_dir/a_file.txt')).toBeLessThan(defaultFiles.indexOf('b_dir/z_file.txt'));
            expect(defaultFiles.indexOf('b_dir/z_file.txt')).toBeLessThan(defaultFiles.indexOf('a_file.txt'));
            expect(defaultFiles.indexOf('a_file.txt')).toBeLessThan(defaultFiles.indexOf('c_file.txt'));

            // Test hierarchical ordering (pure alphabetical)
            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                structureFile: 'structure2.txt',
                contentFile: 'content2.txt',
                hierarchicalContent: true
            });

            const hierarchicalContent = fs.readFileSync(path.join(outputDir.name, 'content2.txt'), 'utf-8');
            const hierarchicalMatches = hierarchicalContent.match(/FILE: [^\n]+/g);
            const hierarchicalFiles = hierarchicalMatches.map(match => match.replace('FILE: ', ''));

            // In hierarchical mode:
            // 1. a_file.txt comes first (root level, alphabetically)
            // 2. Then b_dir/a_file.txt (b_dir content, alphabetically)
            // 3. Then b_dir/c_subdir/file.txt (subdir content)
            // 4. Then b_dir/z_file.txt (continuing b_dir content)
            // 5. Finally c_file.txt (root level)
            expect(hierarchicalFiles.indexOf('a_file.txt')).toBeLessThan(hierarchicalFiles.indexOf('b_dir/a_file.txt'));
            expect(hierarchicalFiles.indexOf('b_dir/a_file.txt')).toBeLessThan(hierarchicalFiles.indexOf('b_dir/c_subdir/file.txt'));
            expect(hierarchicalFiles.indexOf('b_dir/c_subdir/file.txt')).toBeLessThan(hierarchicalFiles.indexOf('b_dir/z_file.txt'));
            expect(hierarchicalFiles.indexOf('b_dir/z_file.txt')).toBeLessThan(hierarchicalFiles.indexOf('c_file.txt'));
        });
    });

    // File ignoring tests
    describe('file ignoring', () => {
        /**
         * Tests file exclusion functionality:
         * - .gitignore pattern handling
         * - Default ignore patterns
         * - Custom ignore patterns
         * - Ignore pattern overrides
         */

        test('handles .gitignore patterns', () => {
            /**
             * Ensures that files matching .gitignore patterns are properly
             * excluded from both structure and content files
             */

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
            /**
             * Verifies that the noGitignore option correctly overrides
             * .gitignore pattern handling when specified
             */

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
            /**
             * Tests that custom ignore patterns are properly applied
             * in addition to default and .gitignore patterns
             */

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
            /**
             * Verifies that the ignoreDefaultPatterns option correctly
             * disables the built-in default ignore patterns
             */

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
            /**
             * Ensures that critical patterns like .git/ are always
             * included in the ignore list
             */

            expect(ALWAYS_IGNORE_PATTERNS).toContain('.git/');
        });

        test('DEFAULT_IGNORE_PATTERNS contains expected patterns', () => {
            /**
             * Verifies that common ignore patterns are included
             * in the default ignore list
             */

            expect(DEFAULT_IGNORE_PATTERNS).toContain('.*');
            expect(DEFAULT_IGNORE_PATTERNS).toContain('.*/');
            expect(DEFAULT_IGNORE_PATTERNS).toContain('package-lock.json');
        });

        test('handles ignored files in subdirectories', () => {
            /**
             * Verifies that ignored files in subdirectories are properly excluded
             * and that the ignore patterns are correctly propagated through
             * recursive directory traversal
             */

            // Create nested directories with mix of ignored and non-ignored files
            fs.mkdirSync(path.join(tmpDir.name, 'nested'));
            fs.mkdirSync(path.join(tmpDir.name, 'nested', 'subdir'));
            fs.mkdirSync(path.join(tmpDir.name, 'ignored_dir'));

            // Create files that should be ignored at different levels
            fs.writeFileSync(path.join(tmpDir.name, 'nested', 'test.log'), 'Should be ignored');
            fs.writeFileSync(path.join(tmpDir.name, 'nested', 'subdir', 'test.log'), 'Should be ignored');
            fs.writeFileSync(path.join(tmpDir.name, 'nested', 'ignored.txt'), 'Should be ignored');
            fs.writeFileSync(path.join(tmpDir.name, 'nested', 'subdir', 'ignored.txt'), 'Should be ignored');

            // Create files in ignored directory
            fs.writeFileSync(path.join(tmpDir.name, 'ignored_dir', 'file1.txt'), 'Should be ignored - in ignored dir');
            fs.writeFileSync(path.join(tmpDir.name, 'ignored_dir', 'file2.txt'), 'Should be ignored - in ignored dir');

            // Create files that should not be ignored
            fs.writeFileSync(path.join(tmpDir.name, 'nested', 'keep.txt'), 'Should be kept');
            fs.writeFileSync(path.join(tmpDir.name, 'nested', 'subdir', 'keep.txt'), 'Should be kept');

            // Add ignored_dir to gitignore
            fs.appendFileSync(path.join(tmpDir.name, '.gitignore'), '\nignored_dir/');

            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                structureFile: 'structure.txt',
                contentFile: 'content.txt'
            });

            const structure = fs.readFileSync(path.join(outputDir.name, 'structure.txt'), 'utf-8');
            const content = fs.readFileSync(path.join(outputDir.name, 'content.txt'), 'utf-8');

            // Verify ignored files are not in structure
            expect(structure).not.toContain('test.log');
            expect(structure).not.toContain('ignored.txt');
            expect(structure).not.toContain('ignored_dir');

            // Verify non-ignored files are in structure
            expect(structure).toContain('keep.txt');

            // Verify ignored files are not in content
            expect(content).not.toContain('Should be ignored');
            expect(content).not.toContain('Should be ignored - in ignored dir');

            // Verify non-ignored files are in content
            expect(content).toContain('Should be kept');

            // Verify both levels of nesting for non-ignored directories
            expect(content).toContain('FILE: nested/keep.txt');
            expect(content).toContain('FILE: nested/subdir/keep.txt');

            // Test with noGitignore to ensure the directory is included when ignores are disabled
            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                structureFile: 'structure_no_ignore.txt',
                contentFile: 'content_no_ignore.txt',
                noGitignore: true
            });

            const structureNoIgnore = fs.readFileSync(path.join(outputDir.name, 'structure_no_ignore.txt'), 'utf-8');
            const contentNoIgnore = fs.readFileSync(path.join(outputDir.name, 'content_no_ignore.txt'), 'utf-8');

            // Verify previously ignored directory is now included
            expect(structureNoIgnore).toContain('ignored_dir');
            expect(contentNoIgnore).toContain('Should be ignored - in ignored dir');
        });

        test('skips recursive content generation for ignored directories', () => {
            /**
             * Verifies that generateContentFile is not called for ignored directories
             * by creating a complex directory structure with ignored and non-ignored paths
             */

            // Create a complex directory structure
            fs.mkdirSync(path.join(tmpDir.name, 'parent'));
            fs.mkdirSync(path.join(tmpDir.name, 'parent', 'ignored_dir'));
            fs.mkdirSync(path.join(tmpDir.name, 'parent', 'kept_dir'));

            // Create files in ignored directory
            fs.writeFileSync(path.join(tmpDir.name, 'parent', 'ignored_dir', 'test1.txt'), 'ignored content 1');
            fs.writeFileSync(path.join(tmpDir.name, 'parent', 'ignored_dir', 'test2.txt'), 'ignored content 2');
            fs.mkdirSync(path.join(tmpDir.name, 'parent', 'ignored_dir', 'subdir'));
            fs.writeFileSync(path.join(tmpDir.name, 'parent', 'ignored_dir', 'subdir', 'test3.txt'), 'ignored content 3');

            // Create files in kept directory
            fs.writeFileSync(path.join(tmpDir.name, 'parent', 'kept_dir', 'keep1.txt'), 'kept content 1');
            fs.writeFileSync(path.join(tmpDir.name, 'parent', 'kept_dir', 'keep2.txt'), 'kept content 2');
            fs.mkdirSync(path.join(tmpDir.name, 'parent', 'kept_dir', 'subdir'));
            fs.writeFileSync(path.join(tmpDir.name, 'parent', 'kept_dir', 'subdir', 'keep3.txt'), 'kept content 3');

            // Create a .gitignore in the parent directory
            fs.writeFileSync(path.join(tmpDir.name, 'parent', '.gitignore'), 'ignored_dir/\n');

            // First test: with gitignore enabled
            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                structureFile: 'structure1.txt',
                contentFile: 'content1.txt'
            });

            const structure1 = fs.readFileSync(path.join(outputDir.name, 'structure1.txt'), 'utf-8');
            const content1 = fs.readFileSync(path.join(outputDir.name, 'content1.txt'), 'utf-8');

            // Verify ignored directory and its contents are not included
            expect(structure1).not.toContain('ignored_dir');
            expect(content1).not.toContain('ignored content');
            // But kept directory and its contents are included
            expect(structure1).toContain('kept_dir');
            expect(content1).toContain('kept content');

            // Second test: with gitignore disabled
            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                structureFile: 'structure2.txt',
                contentFile: 'content2.txt',
                noGitignore: true
            });

            const structure2 = fs.readFileSync(path.join(outputDir.name, 'structure2.txt'), 'utf-8');
            const content2 = fs.readFileSync(path.join(outputDir.name, 'content2.txt'), 'utf-8');

            // Verify previously ignored directory and its contents are now included
            expect(structure2).toContain('ignored_dir');
            expect(content2).toContain('ignored content');
            // And kept directory and its contents are still included
            expect(structure2).toContain('kept_dir');
            expect(content2).toContain('kept content');
        });

        test('handles leading slash in gitignore patterns', () => {
            /**
             * Tests that patterns starting with '/' in .gitignore are treated as relative
             * to the directory containing the .gitignore file, not the entire repository
             */

            // Create nested directories with different .gitignore files
            fs.mkdirSync(path.join(tmpDir.name, 'nested'));
            fs.mkdirSync(path.join(tmpDir.name, 'nested', 'subdir'));

            // Create .gitignore in root with leading slash
            fs.writeFileSync(path.join(tmpDir.name, '.gitignore'), '/test.txt\n/nested/allowed.txt');

            // Create .gitignore in nested directory with leading slash
            fs.writeFileSync(path.join(tmpDir.name, 'nested', '.gitignore'), '/test.txt');

            // Create test files
            fs.writeFileSync(path.join(tmpDir.name, 'test.txt'), 'Should be ignored by root gitignore');
            fs.writeFileSync(path.join(tmpDir.name, 'nested', 'test.txt'), 'Should be ignored by nested gitignore');
            fs.writeFileSync(path.join(tmpDir.name, 'nested', 'allowed.txt'), 'Should be ignored by root gitignore');
            fs.writeFileSync(path.join(tmpDir.name, 'nested', 'subdir', 'test.txt'), 'Should NOT be ignored');

            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                structureFile: 'structure.txt',
                contentFile: 'content.txt'
            });

            const content = fs.readFileSync(path.join(outputDir.name, 'content.txt'), 'utf-8');

            // Root /test.txt should be ignored
            expect(content).not.toContain('FILE: test.txt');
            expect(content).not.toContain('Should be ignored by root gitignore');

            // /nested/allowed.txt should be ignored by root gitignore
            expect(content).not.toContain('FILE: nested/allowed.txt');
            expect(content).not.toContain('Should be ignored by root gitignore');

            // nested/test.txt should be ignored by nested gitignore
            expect(content).not.toContain('FILE: nested/test.txt');
            expect(content).not.toContain('Should be ignored by nested gitignore');

            // nested/subdir/test.txt should NOT be ignored
            expect(content).toContain('FILE: nested/subdir/test.txt');
            expect(content).toContain('Should NOT be ignored');
        });
    });

    // Directory handling tests
    describe('directory handling', () => {
        /**
         * Tests directory-specific functionality:
         * - Empty directory handling
         * - Nested directory structures
         * - Directory permissions
         */

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
        /**
         * Tests programmatic usage of the serializer:
         * - API behavior
         * - Error handling
         * - File overwrite protection
         * - Output file management
         */

        test('throws error when verbose and silent are used together', () => {
            expect(() => {
                serializeRepo({
                    repoRoot: tmpDir.name,
                    outputDir: outputDir.name,
                    verbose: true,
                    silent: true
                });
            }).toThrow('Cannot use verbose and silent options together');
        });

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
        /**
         * Tests command-line interface functionality:
         * - User interaction
         * - Command-line options
         * - Error messaging
         * - File overwrite prompts
         */

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
        expect(content).toContain('START OF FILE: empty.txt');
        expect(content).toContain('END OF FILE: empty.txt');
    });

    // File handling edge cases
    describe('file handling edge cases', () => {
        /**
         * Tests special file handling scenarios:
         * - Binary files
         * - Empty files
         * - Permission errors
         * - Size limits
         * - Replacement character ratios
         */

        test('handles binary files', () => {
            /**
             * Verifies that binary files are properly detected and
             * excluded from the content file while still appearing
             * in the structure file
             */

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

        test('accepts text with replacement characters when using higher ratio', () => {
            /**
             * Verifies that text files with replacement characters are accepted
             * when using a higher maxReplacementRatio
             */
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const repoDir = path.join(tmpDir, 'test-repo');
            fs.mkdirSync(repoDir);

            // Create a text file with 20% replacement characters
            const testFile = path.join(repoDir, 'test.txt');
            const content = 'Hello\uFFFDWorld\uFFFD'; // 2 replacement chars in 10 chars = 20%
            fs.writeFileSync(testFile, content);

            const outputDir = path.join(tmpDir, 'output');
            fs.mkdirSync(outputDir);

            // Should be rejected with default ratio (0)
            serializeRepo({
                repoRoot: repoDir,
                outputDir,
                structureFile: 'structure1.txt',
                contentFile: 'content1.txt'
            });

            const content1 = fs.readFileSync(path.join(outputDir, 'content1.txt'), 'utf-8');
            expect(content1).not.toContain('test.txt');

            // Should be accepted with ratio of 0.3 (30%)
            serializeRepo({
                repoRoot: repoDir,
                outputDir,
                structureFile: 'structure2.txt',
                contentFile: 'content2.txt',
                maxReplacementRatio: 0.3,
                keepReplacementChars: true
            });

            const content2 = fs.readFileSync(path.join(outputDir, 'content2.txt'), 'utf-8');
            expect(content2).toContain('test.txt');
            expect(content2).toContain('Hello\uFFFDWorld\uFFFD');

            // Should be accepted with ratio of 0.3 but strip replacement chars
            serializeRepo({
                repoRoot: repoDir,
                outputDir,
                structureFile: 'structure3.txt',
                contentFile: 'content3.txt',
                maxReplacementRatio: 0.3,
                keepReplacementChars: false
            });

            const content3 = fs.readFileSync(path.join(outputDir, 'content3.txt'), 'utf-8');
            expect(content3).toContain('test.txt');
            expect(content3).toContain('HelloWorld');
            expect(content3).not.toContain('\uFFFD');
        });

        test('accepts text without replacement characters regardless of ratio', () => {
            /**
             * Verifies that text files without replacement characters are accepted
             * regardless of the maxReplacementRatio value
             */
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const repoDir = path.join(tmpDir, 'test-repo');
            fs.mkdirSync(repoDir);

            // Create a text file with no replacement characters
            const testFile = path.join(repoDir, 'test.txt');
            const content = 'Hello World 123 ☺'; // Unicode but no replacement chars
            fs.writeFileSync(testFile, content);

            const outputDir = path.join(tmpDir, 'output');
            fs.mkdirSync(outputDir);

            // Should be accepted with any ratio
            serializeRepo({
                repoRoot: repoDir,
                outputDir,
                structureFile: 'structure.txt',
                contentFile: 'content.txt',
                maxReplacementRatio: 0.5 // Any value should work
            });

            const fileContent = fs.readFileSync(path.join(outputDir, 'content.txt'), 'utf-8');
            expect(fileContent).toContain('test.txt');
            expect(fileContent).toContain(content);
        });

        test('throws error for invalid maxReplacementRatio', () => {
            /**
             * Verifies that an error is thrown when maxReplacementRatio
             * is not between 0 and 1
             */
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const repoDir = path.join(tmpDir, 'test-repo');
            fs.mkdirSync(repoDir);

            const outputDir = path.join(tmpDir, 'output');
            fs.mkdirSync(outputDir);

            // Test negative ratio
            expect(() => {
                serializeRepo({
                    repoRoot: repoDir,
                    outputDir,
                    maxReplacementRatio: -0.1
                });
            }).toThrow('Max replacement ratio must be between 0 and 1');

            // Test ratio > 1
            expect(() => {
                serializeRepo({
                    repoRoot: repoDir,
                    outputDir,
                    maxReplacementRatio: 1.5
                });
            }).toThrow('Max replacement ratio must be between 0 and 1');
        });

        test('handles file read errors', () => {
            /**
             * Ensures that file read errors (e.g., permission denied)
             * are properly handled and logged without failing the
             * entire serialization process
             */

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

        test('handles empty files', () => {
            /**
             * Verifies that empty files are properly included in both
             * structure and content files with appropriate markers
             */

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
            expect(content).toContain('START OF FILE: empty.txt');
            expect(content).toContain('END OF FILE: empty.txt');
        });

        test('handles control characters correctly', () => {
            /**
             * Verifies that control characters are properly replaced with U+FFFD
             * and then either kept or stripped based on keepReplacementChars
             */
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const repoDir = path.join(tmpDir, 'test-repo');
            fs.mkdirSync(repoDir);

            // Create a text file with control characters
            const testFile = path.join(repoDir, 'test.txt');
            const content = 'Hello\u0000World\u0001'; // NUL and SOH control chars
            fs.writeFileSync(testFile, content);

            const outputDir = path.join(tmpDir, 'output');
            fs.mkdirSync(outputDir);

            // Should be rejected with default ratio (0)
            serializeRepo({
                repoRoot: repoDir,
                outputDir,
                structureFile: 'structure1.txt',
                contentFile: 'content1.txt'
            });

            const content1 = fs.readFileSync(path.join(outputDir, 'content1.txt'), 'utf-8');
            expect(content1).not.toContain('test.txt');

            // Should be accepted with ratio of 0.3 and keep replacement chars
            serializeRepo({
                repoRoot: repoDir,
                outputDir,
                structureFile: 'structure2.txt',
                contentFile: 'content2.txt',
                maxReplacementRatio: 0.3,
                keepReplacementChars: true
            });

            const content2 = fs.readFileSync(path.join(outputDir, 'content2.txt'), 'utf-8');
            expect(content2).toContain('test.txt');
            expect(content2).toContain('Hello\uFFFDWorld\uFFFD'); // Control chars replaced with U+FFFD

            // Should be accepted with ratio of 0.3 but strip replacement chars
            serializeRepo({
                repoRoot: repoDir,
                outputDir,
                structureFile: 'structure3.txt',
                contentFile: 'content3.txt',
                maxReplacementRatio: 0.3,
                keepReplacementChars: false
            });

            const content3 = fs.readFileSync(path.join(outputDir, 'content3.txt'), 'utf-8');
            expect(content3).toContain('test.txt');
            expect(content3).toContain('HelloWorld'); // Control chars stripped
            expect(content3).not.toContain('\uFFFD');
        });

        test('throws error for invalid maxReplacementRatio', () => {
            /**
             * Verifies that an error is thrown when maxReplacementRatio
             * is not between 0 and 1
             */
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
            const repoDir = path.join(tmpDir, 'test-repo');
            fs.mkdirSync(repoDir);

            const outputDir = path.join(tmpDir, 'output');
            fs.mkdirSync(outputDir);

            // Test negative ratio
            expect(() => {
                serializeRepo({
                    repoRoot: repoDir,
                    outputDir,
                    maxReplacementRatio: -0.1
                });
            }).toThrow('Max replacement ratio must be between 0 and 1');

            // Test ratio > 1
            expect(() => {
                serializeRepo({
                    repoRoot: repoDir,
                    outputDir,
                    maxReplacementRatio: 1.5
                });
            }).toThrow('Max replacement ratio must be between 0 and 1');
        });
    });

    describe('verbose logging', () => {
        test('logs detailed information when verbose is enabled', async () => {
            // Create a spy for console.log
            const consoleSpy = jest.spyOn(console, 'log');

            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                verbose: true,
                additionalIgnorePatterns: ['*.tmp', 'temp/']
            });

            // Verify verbose logging calls
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Added default ignore patterns'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Added additional ignore patterns'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Added gitignore patterns from: .gitignore'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Adding directory: src/'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Adding file: src/file2.js'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Ignoring: .gitignore'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Adding file: file1.txt'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Ignoring: ignored.txt'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Ignoring: test.log'));
        });

        test('logs detailed information for gitignore files in subfolders when verbose is enabled', () => {
            // Create a spy for console.log
            const consoleSpy = jest.spyOn(console, 'log');

            // Create nested directories with their own .gitignore files
            fs.mkdirSync(path.join(tmpDir.name, 'nested'));
            fs.mkdirSync(path.join(tmpDir.name, 'nested', 'subdir'));

            // Create .gitignore files at different levels
            fs.writeFileSync(path.join(tmpDir.name, 'nested', '.gitignore'), '*.secret\n');
            fs.writeFileSync(path.join(tmpDir.name, 'nested', 'subdir', '.gitignore'), '*.private\n');

            // Create mix of ignored and non-ignored files
            fs.writeFileSync(path.join(tmpDir.name, 'nested', 'test.secret'), 'secret content');
            fs.writeFileSync(path.join(tmpDir.name, 'nested', 'keep.txt'), 'kept content');
            fs.writeFileSync(path.join(tmpDir.name, 'nested', 'subdir', 'test.private'), 'private content');
            fs.writeFileSync(path.join(tmpDir.name, 'nested', 'subdir', 'keep.txt'), 'kept content');

            serializeRepo({
                repoRoot: tmpDir.name,
                outputDir: outputDir.name,
                verbose: true
            });

            // Verify verbose logging for nested .gitignore files and their effects
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Added gitignore patterns from: .gitignore'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Added gitignore patterns from: nested/.gitignore'));

            // Verify directory traversal logging
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Adding directory: nested/'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Adding directory: nested/subdir/'));

            // Verify file handling logging
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Adding file: nested/keep.txt'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Adding file: nested/subdir/keep.txt'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Ignoring: nested/test.secret'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Ignoring: nested/subdir/test.private'));

            // Verify the actual content to ensure ignored files are not included
            const content = fs.readFileSync(path.join(outputDir.name, 'repo_content.txt'), 'utf-8');
            expect(content).toContain('kept content');
            expect(content).not.toContain('secret content');
            expect(content).not.toContain('private content');
        });
    });

    describe('file size handling', () => {
        /**
         * Tests file size related functionality:
         * - Size parsing
         * - Size formatting
         * - Size limits
         * - Size validation
         */

        describe('parseFileSize', () => {
            /**
             * Tests the file size parsing utility:
             * - Unit conversions (B, KB, MB, GB)
             * - Default values
             * - Error handling
             */

            test('handles null/undefined input', () => {
                /**
                 * Verifies that undefined or null inputs return
                 * the default maximum file size
                 */

                expect(parseFileSize(null)).toBe(DEFAULT_MAX_FILE_SIZE);
                expect(parseFileSize(undefined)).toBe(DEFAULT_MAX_FILE_SIZE);
            });

            test('handles numeric input', () => {
                /**
                 * Ensures that numeric inputs are properly parsed
                 * both as numbers and numeric strings
                 */

                expect(parseFileSize(1024)).toBe(1024);
                // Test string number without units
                expect(parseFileSize('1024')).toBe(1024);
                expect(parseFileSize('512')).toBe(512);
            });

            test('parses string inputs with different units', () => {
                /**
                 * Verifies correct parsing of file sizes with
                 * various unit specifications (B, KB, MB, GB)
                 */

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
                /**
                 * Ensures proper error handling for invalid
                 * file size specifications
                 */

                expect(() => parseFileSize('invalid')).toThrow('Invalid file size format: invalid');
                expect(() => parseFileSize('KB')).toThrow('Invalid file size format: KB');
                expect(() => parseFileSize('1.5KB')).toThrow('Invalid file size format: 1.5KB');
                expect(() => parseFileSize('-1KB')).toThrow('Invalid file size format: -1KB');
                expect(() => parseFileSize('1TB')).toThrow('Invalid file size format: 1TB');
                expect(() => parseFileSize('1PB')).toThrow('Invalid file size format: 1PB');
            });
        });

        describe('prettyFileSize', () => {
            /**
             * Tests the file size formatting utility:
             * - Human-readable output
             * - Unit selection
             * - Formatting consistency
             */

            test('formats file sizes correctly', () => {
                /**
                 * Verifies that file sizes are formatted with
                 * appropriate units and consistent notation
                 */

                expect(prettyFileSize(512)).toBe('512B');
                expect(prettyFileSize(1024)).toBe('1KB');
                expect(prettyFileSize(1024 * 1024)).toBe('1MB');
                expect(prettyFileSize(1024 * 1024 * 1024)).toBe('1GB');
            });
        });

        describe('file size limits', () => {
            /**
             * Tests enforcement of file size limits:
             * - Maximum size handling
             * - Minimum size validation
             * - Size limit overrides
             */

            test('handles non-text files with silent option', () => {
                /**
                 * Verifies that non-text files are handled correctly
                 * with both silent=true and silent=false
                 */

                const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
                const repoDir = path.join(tmpDir, 'test-repo');
                const outputDir = path.join(tmpDir, 'output');
                fs.mkdirSync(repoDir);
                fs.mkdirSync(outputDir);

                // Create a binary file
                const binaryFile = path.join(repoDir, 'test.bin');
                const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
                fs.writeFileSync(binaryFile, buffer);

                // Mock console.log to track calls
                const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();

                // Test with silent=false (default)
                serializeRepo({
                    repoRoot: repoDir,
                    outputDir: outputDir,
                    structureFile: 'structure1.txt',
                    contentFile: 'content1.txt'
                });

                // Verify the non-text file message was logged
                const nonTextCalls = mockConsoleLog.mock.calls.filter(call =>
                    call[0].includes('Skipping non-text file from content file: test.bin')
                );
                expect(nonTextCalls.length).toBe(1);

                // Reset mock
                mockConsoleLog.mockClear();

                // Test with silent=true
                serializeRepo({
                    repoRoot: repoDir,
                    outputDir: outputDir,
                    structureFile: 'structure2.txt',
                    contentFile: 'content2.txt',
                    silent: true
                });

                // Verify no non-text file messages were logged
                const silentNonTextCalls = mockConsoleLog.mock.calls.filter(call =>
                    call[0].includes('Skipping non-text file from content file:')
                );
                expect(silentNonTextCalls.length).toBe(0);

                // Restore console.log
                mockConsoleLog.mockRestore();
            });

            test('handles large files', () => {
                /**
                 * Ensures that large files are included in the output
                 * while still being checked for human-readability up
                 * to the maxFileSize limit
                 */

                const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
                const repoDir = path.join(tmpDir, 'test-repo');
                const outputDir = path.join(tmpDir, 'output');
                fs.mkdirSync(repoDir);
                fs.mkdirSync(outputDir);

                // Create a file larger than 8KB (default max size) with text content
                const largeFile = path.join(repoDir, 'large.txt');
                const largeContent = Buffer.alloc(8194 * 16).fill('x');
                fs.writeFileSync(largeFile, largeContent);

                serializeRepo({
                    repoRoot: repoDir,
                    outputDir: outputDir,
                    structureFile: 'structure.txt',
                    contentFile: 'content.txt'
                });

                const content = fs.readFileSync(path.join(outputDir, 'content.txt'), 'utf-8');
                expect(content).toContain('FILE: large.txt');
                expect(content).toContain('x'.repeat(8194 * 16));
            });

            test('validates maxFileSize limits', () => {
                /**
                 * Verifies that file size limits are properly
                 * validated against min/max constraints
                 */

                const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-serializer-'));
                const repoDir = path.join(testDir, 'test-repo');
                const outputDir = path.join(testDir, 'output');
                fs.mkdirSync(repoDir);
                fs.mkdirSync(outputDir);

                expect(() => serializeRepo({
                    repoRoot: repoDir,
                    outputDir: outputDir,
                    maxFileSize: MIN_FILE_SIZE - 1
                })).toThrow(`Max file size must be between`);

                expect(() => serializeRepo({
                    repoRoot: repoDir,
                    outputDir: outputDir,
                    maxFileSize: MAX_FILE_SIZE + 1
                })).toThrow(`Max file size must be between`);
            });
        });
    });
});