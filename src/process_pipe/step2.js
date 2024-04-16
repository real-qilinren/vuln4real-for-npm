const fs = require('fs');
const path = require('path');

/**
 * Extract development-only dependencies for a project.
 * @param projectPath - The full path of the project.
 * @param outputDir - The full path of the output directory.
 * @returns {Promise<unknown>} - A promise that resolves to the development-only dependencies.
 */
exports.step2_devDeps = function(projectPath, outputDir) {
    return new Promise((resolve, reject) => {
        console.log('Step2 (identify development only dependencies) for project <' + path.basename(projectPath) + "> starts");
        const packageJsonPath = path.join(projectPath, 'package.json');

        fs.readFile(packageJsonPath, 'utf8', (err, data) => {
            if (err) {
                console.error(`Error reading package.json for project <${path.basename(projectPath)}>`, err);
                reject(err);
                return;
            }

            const packageJson = JSON.parse(data);
            // Development-only dependencies in npm are represented by the devDependencies property
            const devDependencies = packageJson.devDependencies || {};

            // Ensure the output directory exists
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // Define the output file path
            const outputFilePath = path.join(outputDir, 'step2_output.json');

            // Write the devDependencies to the output file
            fs.writeFile(outputFilePath, JSON.stringify(devDependencies, null, 2), (writeErr) => {
                if (writeErr) {
                    console.error(`Error writing devDependencies file for project <${path.basename(projectPath)}>`, writeErr);
                    reject(writeErr);
                    return;
                }

                console.log('Step2 (identify development only dependencies) for project <' + path.basename(projectPath) + "> ends\n---------------\n");
                resolve(devDependencies);
            });
        });
    });
};