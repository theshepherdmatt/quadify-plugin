const { exec } = require('child_process');

function runScript(scriptName) {
    console.log(`Executing ${scriptName}.js...`);
    exec(`node ${scriptName}.js`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing ${scriptName}.js: ${error.message}`);
            return;
        }
        console.log(`${scriptName}.js output: ${stdout}`);
        if (stderr) console.error(`${scriptName}.js stderr: ${stderr}`);
    });
    console.log(`Finished executing ${scriptName}.js`);
}

function runButtonsLedsScript() {
    console.log("Running buttonsleds.js script...");
    runScript('buttonsleds');
}

module.exports = { runScript, runButtonsLedsScript };
