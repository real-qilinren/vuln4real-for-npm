const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Use object to simulate enums to classify dependencies
const DependencyType = {
  DEVELOPMENT_ONLY: 'development-only',
  WITHIN_PROJECT: 'within-project',
  LAGGING: 'lagging',
  VULNERABLE: 'vulnerable',
  NORMAL: 'normal'
};

// Create an object for storing the report
let report = {
    paths: [],
    dependencies: {}
}

/**
 * Get the highest CVSS score for a dependency
 * @param dependency - The name of the dependency
 * @param vulnerabilitiesData - The list of vulnerabilities
 * @returns {number} - The highest CVSS score
 */
function getHighestCvssScoreForDependency(dependency, vulnerabilitiesData) {
  const relevantEntries = vulnerabilitiesData.filter(entry => entry.fileName.startsWith(dependency));
  const scores = relevantEntries.flatMap(entry => entry.vulnerabilities.map(vuln => vuln.cvss));
  return Math.max(-1, ...scores); // Returns -1 if there are no scores which means this dependency is not vulnerable
}

/**
 * Classify a dependency
 * @param dependency - The name of the dependency
 * @param devDependencies - The list of development-only dependencies
 * @param withinProjectDependencies - The list of within-project dependencies
 * @param laggingDependencies - The list of lagging dependencies
 * @param vulnerabilities - The list of vulnerable dependencies
 * @param vulnerabilitiesData - The list of vulnerabilities
 * @param releaseIntervals - The list of release intervals
 * @returns {{highestCvssScore: number, dependencyTypes: *[], intervals: number}}
 */
function classifyDependency(dependency, devDependencies, withinProjectDependencies, laggingDependencies, vulnerabilities, vulnerabilitiesData, releaseIntervals) {
    let types = [];
    let intervals = releaseIntervals[dependency] || -1; // Default interval value is -1 if not lagging or not found

    if (devDependencies.includes(dependency)) types.push(DependencyType.DEVELOPMENT_ONLY);
    if (withinProjectDependencies.includes(dependency)) types.push(DependencyType.WITHIN_PROJECT);
    if (laggingDependencies.includes(dependency)) types.push(DependencyType.LAGGING);
    if (vulnerabilities.includes(dependency)) types.push(DependencyType.VULNERABLE);

    const highestCvssScore = getHighestCvssScoreForDependency(dependency, vulnerabilitiesData);
    return { dependencyTypes: types, highestCvssScore, intervals };
}

/**
 * Initialize the queue with the nested dependencies
 * @param dependencyTree
 * @returns {*[]}
 */
function initializeQueueWithNestedDeps(dependencyTree) {
    let queue = [];
    let stack = [[dependencyTree, []]];

    while (stack.length > 0) {
        let [node, path] = stack.pop();
        Object.keys(node.dependencies || {}).forEach(dep => {
            let newPath = path.concat(dep);
            queue.push(newPath);
            stack.push([node.dependencies[dep], newPath]);
        });
    }
    return queue;
}

/**
 * Path simplification algorithm
 * @param path - The path to be simplified
 * @param withinProjectDependencies - The list of within-project dependencies
 * @returns {*[]} - The simplified path
 */
function simplifyPath(path, withinProjectDependencies) {
    let simplifiedPath = [];
    let withinProjectBuffer = [];

    for (let node of path) {
        if (withinProjectDependencies.includes(node)) {
            withinProjectBuffer.push(node);
        } else {
            if (withinProjectBuffer.length > 0) {
                // Choose the last within-project dependency as it is the closest to the vulnerable dependency
                simplifiedPath.push(withinProjectBuffer[withinProjectBuffer.length - 1]);
                withinProjectBuffer = [];
            }
            simplifiedPath.push(node);
        }
    }
    return simplifiedPath;
}

/**
 * Find the children of a node in the dependency tree
 * @param dependencyTree
 * @param currentPath
 * @returns {string[]|*[]}
 */
function findChildren(dependencyTree, currentPath) {
    let node = dependencyTree;
    for (const dep of currentPath) {
        if (node.dependencies && node.dependencies[dep]) {
            node = node.dependencies[dep];
        } else {
            return [];
        }
    }
    return Object.keys(node.dependencies || {});
}

/**
 * Construct paths from the root project to the vulnerable dependencies
 * @param projectPath - The full path of the project
 * @param outputDir - The full path of the output directory
 */
exports.step6_constructPath = function(projectPath, outputDir) {
    console.log('Step6 (Path construction) for project <' + path.basename(projectPath) + '> starts');

    let foundVulnerableDeps = new Set();

    let report = {
        paths: [],
        dependencies: {}
    };

    const dependencyTree = JSON.parse(fs.readFileSync(path.join(outputDir, 'step1_output.json'), 'utf8'));
    const devDependencies = Object.keys(JSON.parse(fs.readFileSync(path.join(outputDir, 'step2_output.json'), 'utf8')));
    const withinProjectDependencies = Object.keys(JSON.parse(fs.readFileSync(path.join(outputDir, 'step3_output.json'), 'utf8')));
    const vulnerabilities = JSON.parse(fs.readFileSync(path.join(outputDir, 'step5_output.json'), 'utf8')).map(vuln => vuln.fileName.split(':')[0].replace('.min', '').replace('.js', ''));
    // Read the vulnerabilities data from step5's output
    const vulnerabilitiesData = JSON.parse(fs.readFileSync(path.join(outputDir, 'step5_output.json'), 'utf8'));
    const laggingDependenciesData = JSON.parse(fs.readFileSync(path.join(outputDir, 'step4_output.json'), 'utf8'));
    const laggingDependencies = Object.keys(laggingDependenciesData.laggingDependencies);
    const releaseIntervals = laggingDependenciesData.releaseInterval;


    // Mapping to store the exposure of each vulnerability
    let vulnerabilityExposure = {};

    let queue = initializeQueueWithNestedDeps(dependencyTree);

    while (queue.length > 0) {
        const currentPath = queue.shift();
        const currentNode = currentPath[currentPath.length - 1];

        if (!currentNode) continue;

        const { dependencyTypes, highestCvssScore, intervals } = classifyDependency(
            currentNode,
            devDependencies,
            withinProjectDependencies,
            laggingDependencies,
            vulnerabilities,
            vulnerabilitiesData,
            releaseIntervals
        );

        report.dependencies[currentNode] = { dependencyTypes, highestCvssScore, intervals };

        if (dependencyTypes.includes(DependencyType.VULNERABLE)) {
            vulnerabilityExposure[currentNode] = (vulnerabilityExposure[currentNode] || 0) + 1;
            let simplifiedPath = simplifyPath(currentPath, withinProjectDependencies);
            report.paths.push(simplifiedPath);
            foundVulnerableDeps.add(currentNode);
            continue;
        }

        if (!dependencyTypes.includes(DependencyType.DEVELOPMENT_ONLY)) {
            const children = findChildren(dependencyTree, currentPath);
            children.forEach(child => {
                if (!foundVulnerableDeps.has(child)) {
                    const newPath = currentPath.slice();
                    newPath.push(child);
                    queue.push(newPath);
                }
            });
        }
    }

    // Add the vulnerability exposure to the report
    report.vulnerabilityExposure = vulnerabilityExposure;

    // Sort the paths by the highest CVSS score present in each path
    report.paths.sort((a, b) => {
        const highestCvssScoreA = a.map(node => report.dependencies[node]?.highestCvssScore || 0).reduce((max, score) => Math.max(max, score), 0);
        const highestCvssScoreB = b.map(node => report.dependencies[node]?.highestCvssScore || 0).reduce((max, score) => Math.max(max, score), 0);
        return highestCvssScoreB - highestCvssScoreA;
    });

    fs.writeFileSync(path.join(outputDir, 'step6_output.json'), JSON.stringify(report, null, 2));
    console.log('Step6 (Path construction) for project <' + path.basename(projectPath) + '> ends\n---------------\n');
}