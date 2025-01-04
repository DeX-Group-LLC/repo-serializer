#!/usr/bin/env node

const { program } = require('commander');
const { serializeRepo } = require('../src/index');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function prompt(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.toLowerCase().trim());
        });
    });
}

async function handleExistingFiles(outputDir, structureFile, contentFile) {
    const structurePath = path.join(outputDir, structureFile);
    const contentPath = path.join(outputDir, contentFile);

    if (fs.existsSync(structurePath) || fs.existsSync(contentPath)) {
        const answer = await prompt('Output files already exist. Overwrite? [Y/n] ');
        if (answer === 'n' || answer === 'no') {
            console.log('Operation cancelled.');
            process.exit(0);
        }
    }
}

program
    .name('repo-serialize')
    .description('Serialize a repository\'s structure and contents into readable text files')
    .version('1.0.0')
    .option('-d, --dir <directory>', 'Target directory to serialize', process.cwd())
    .option('-o, --output <directory>', 'Output directory for generated files', process.cwd())
    .option('--structure-file <filename>', 'Name of the structure output file', 'repo_structure.txt')
    .option('--content-file <filename>', 'Name of the content output file', 'repo_content.txt')
    .option('--ignore <patterns...>', 'Additional patterns to ignore')
    .option('-f, --force', 'Overwrite existing files without prompting')
    .action(async (options) => {
        try {
            const config = {
                repoRoot: path.resolve(options.dir),
                outputDir: path.resolve(options.output),
                structureFile: options.structureFile,
                contentFile: options.contentFile,
                additionalIgnorePatterns: options.ignore || [],
                force: options.force,
                isCliCall: true
            };

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