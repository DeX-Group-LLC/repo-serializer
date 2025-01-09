#!/usr/bin/env node

const { program, Option } = require('commander');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { version } = require('../package.json');
const { ALWAYS_IGNORE_PATTERNS, DEFAULT_IGNORE_PATTERNS, DEFAULT_MAX_FILE_SIZE, DEFAULT_REPLACEMENT_RATIO, MIN_FILE_SIZE, MAX_FILE_SIZE, parseFileSize, prettyFileSize, serializeRepo } = require('../src/index');

// Setup readline interface for prompts
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/**
 * Prompts the user with a question and returns their response
 * @param {string} question - The question to ask
 * @returns {Promise<string>} - The user's response in lowercase, trimmed
 */
async function prompt(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.toLowerCase().trim());
        });
    });
}

/**
 * Handles the case where output files already exist
 * Prompts user for confirmation to overwrite
 */
async function handleExistingFiles(outputDir, structureFile, contentFile) {
    const structurePath = path.join(outputDir, structureFile);
    const contentPath = path.join(outputDir, contentFile);

    if (fs.existsSync(structurePath) || fs.existsSync(contentPath)) {
        const answer = await prompt('Output files already exist. Overwrite? [Y/n] ');
        if (answer === 'n' || answer === 'no') {
            console.log('Operation cancelled.');
            process.exit(0);
        }
        console.log('');
    }
}

program
    .name('repo-serialize')
    .description([
        'Serialize a repository\'s structure and contents into readable text files',
        '',
        'Always ignored patterns (cannot be overridden):',
        ...ALWAYS_IGNORE_PATTERNS.map(pattern => `- ${pattern}`),
        '',
        'Default ignored patterns (can be included with --all):',
        ...DEFAULT_IGNORE_PATTERNS.map(pattern => `- ${pattern}`)
    ].join('\n'))

    // Input/Output Options
    .option('-d, --dir <directory>', 'Target directory to serialize', process.cwd())
    .option('-o, --output <directory>', 'Output directory for generated files', process.cwd())
    .option('-s, --structure-file <filename>', 'Name of the structure output file', 'repo_structure.txt')
    .option('-c, --content-file <filename>', 'Name of the content output file', 'repo_content.txt')

    // Processing Options
    .option('-m, --max-file-size <size>', `Maximum file size to process (${prettyFileSize(MIN_FILE_SIZE)}-${prettyFileSize(MAX_FILE_SIZE)}). Accepts units: B, KB, MB`, prettyFileSize(DEFAULT_MAX_FILE_SIZE))
    .option('-a, --all', 'Disable default ignore patterns')
    .option('-g, --no-gitignore', 'Disable .gitignore processing')
    .option('-i, --ignore <patterns...>', 'Additional patterns to ignore')
    .option('--hierarchical', 'Use hierarchical (alphabetical) ordering for content file', false)
    .option('-r, --max-replacement-ratio <ratio>', `Maximum ratio of replacement characters allowed (0-1)`, DEFAULT_REPLACEMENT_RATIO)
    .option('--keep-replacement-chars', 'Keep replacement characters in output', false)

    // Behavior Options
    .option('-f, --force', 'Overwrite existing files without prompting', false)
    .addOption(new Option('--silent', 'Suppress all console output', false).conflicts('verbose'))
    .addOption(new Option('--verbose', 'Enable verbose logging of all processed and ignored files', false).conflicts('silent'))

    // Information Options
    .version(version, '-v, --version', 'Display the version number')
    .helpOption('-h, --help', 'Display help information')

    .action(async (options) => {
        try {
            const config = {
                repoRoot: path.resolve(options.dir),
                outputDir: path.resolve(options.output),
                structureFile: options.structureFile,
                contentFile: options.contentFile,
                additionalIgnorePatterns: options.ignore || [],
                force: options.force,
                isCliCall: true,
                maxFileSize: parseFileSize(options.maxFileSize),
                ignoreDefaultPatterns: options.all,
                noGitignore: !options.gitignore,  // Commander sets gitignore=false when --no-gitignore is used
                silent: options.silent,
                verbose: options.verbose,
                hierarchicalContent: options.hierarchical,
                maxReplacementRatio: parseFloat(options.maxReplacementRatio),
                keepReplacementChars: options.keepReplacementChars || false
            };

            // Validate maxReplacementRatio
            if (isNaN(config.maxReplacementRatio) || config.maxReplacementRatio < 0 || config.maxReplacementRatio > 1) {
                throw new Error('Max replacement ratio must be a number between 0 and 1');
            }

            try {
                await serializeRepo(config);
            } catch (error) {
                if (error.message === 'PROMPT_REQUIRED') {
                    await handleExistingFiles(config.outputDir, config.structureFile, config.contentFile);
                    // Retry with force after user confirmation
                    await serializeRepo({ ...config, force: true });
                } else {
                    throw error;
                }
            }
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        } finally {
            rl.close();
        }
    });

program.parse();