const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const reportFileName = 'dependency-check-report.json';

/**
 * Parse the OWASP Dependency-Check report to extract vulnerable dependencies
 * @param report
 * @returns {{fileName: *, filePath: *, vulnerabilities: *}[]}
 */
function parseVulnerableDependencies(report) {
    const vulnerableDependencies = report.dependencies.filter(dep => dep.vulnerabilities && dep.vulnerabilities.length > 0);

    return vulnerableDependencies.map(dep => ({
        fileName: dep.fileName,
        filePath: dep.filePath,
        vulnerabilities: dep.vulnerabilities.map(vuln => {
            // If cvssv2 exists, use the score of cvssv2, otherwise use the score of cvssv3
            const CVSS_Score = vuln.cvssv2 ? vuln.cvssv2.score : (vuln.cvssv3 ? vuln.cvssv3.baseScore : null);

            return {
                source: vuln.source,
                name: vuln.name,
                severity: vuln.severity,
                cvss: CVSS_Score
            };
        })
    }));
}

/**
 * Generate the OWASP Dependency-Check report for a project
 * @param projectPath
 * @param outputDir
 * @returns {*}
 */
exports.step5_vulnerableDeps = function(projectPath, outputDir) {
    return new Promise((resolve, reject) => {
        console.log('Step5 (identify vulnerable dependencies by OWASP Dependency-Check) for project <' + path.basename(projectPath) + "> starts")

        const projectName = path.basename(projectPath);
        const command = `dependency-check --project ${projectName} -s . --format JSON -o ${outputDir}`;
        exec(command, {cwd: projectPath}, (error, stdout, stderr) => {
            if (error) {
                // Error occurred due to the conflicts between the installed dependencies
            }
            const outputFilePath = path.join(outputDir, reportFileName);

            fs.readFile(outputFilePath, 'utf8', (err, data) => {
                if (err) {
                    console.error(`Error reading OWASP report file for ${projectPath}:`, err);
                    reject(err);
                    return;
                }
                const vulnerableDependencyReport = JSON.parse(data);
                const parsedData = parseVulnerableDependencies(vulnerableDependencyReport);

                // Save the purified report (extracted vulnerable dependencies) to a new separate JSON file
                const purifiedOutputFilePath = path.join(outputDir, 'step5_output.json');
                fs.writeFile(purifiedOutputFilePath, JSON.stringify(parsedData, null, 2), (writeErr) => {
                    if (writeErr) {
                        console.error(`Error writing purified report file for ${projectPath}:`, writeErr);
                        reject(writeErr);
                        return;
                    }
                    console.log('Step5 (identify vulnerable dependencies by OWASP Dependency-Check) for project <' + path.basename(projectPath) + "> ends\n---------------\n")

                    resolve(vulnerableDependencyReport);

                    // Delete the dependency-check-report.json file
                    fs.unlink(outputFilePath, (err) => {
                        if (err) {
                            console.error(`Error deleting OWASP report file ${outputFilePath}:`, err);
                        }
                    });
                });
            });
        });
    });
};