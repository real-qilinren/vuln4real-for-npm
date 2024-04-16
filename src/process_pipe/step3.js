const fs = require('fs');
const path = require('path');

/**
 * Extract within-project dependencies for a project.
 * @param projectPath - The full path of the project.
 * @param outputDir - The full path of the output directory.
 * @returns {Promise<unknown>} - A promise that resolves to the within-project dependencies.
 */
exports.step3_withinProjectDeps = function (projectPath, outputDir) {
    return new Promise((resolve, reject) => {
        console.log('Step3 (identify within-project dependencies) for project <' + path.basename(projectPath) + "> starts");

        const packageJsonPath = path.join(projectPath, 'package.json');
        const nodeModulesPath = path.join(projectPath, 'node_modules');

        // Read package.json file
        fs.readFile(packageJsonPath, 'utf8', (err, data) => {
            if (err) {
                console.error(`Error reading the package.json file for project:`, err);
                reject(err);
                return;
            }

            const packageJson = JSON.parse(data);
            Object.keys(packageJson.dependencies || {}).concat(Object.keys(packageJson.devDependencies || {}));

            // Read node_modules directory
            fs.readdir(nodeModulesPath, (err, files) => {
                if (err) {
                    console.error(`Error reading the node_modules directory for project:`, err);
                    reject(err);
                    return;
                }

                const withinProjectDependencies = [];

                // Check for dependencies declared with file path
                for (const [name, version] of Object.entries(packageJson.dependencies || {})) {
                    if (version.startsWith('file:')) {
                        withinProjectDependencies.push(name);
                    }
                }

                for (const [name, version] of Object.entries(packageJson.devDependencies || {})) {
                    if (version.startsWith('file:')) {
                        withinProjectDependencies.push(name);
                    }
                }

                const outputFilePath = path.join(outputDir, 'step3_output.json');

                fs.writeFile(outputFilePath, JSON.stringify(withinProjectDependencies, null, 2), (err) => {
                    if (err) {
                        console.error(`Error writing withinProjectDependencies file:`, err);
                        reject(err);
                        return;
                    }

                    console.log('Step3 (identify within-project dependencies) for project <' + path.basename(projectPath) + "> ends\n---------------\n");
                    resolve(withinProjectDependencies);
                });
            });
        });
    });
};