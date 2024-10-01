const http = require('http');

function checkVolumioStatus(onReady) {
    const options = {
        host: 'localhost',
        port: 3000,
        path: '/api/v1/getState',
        method: 'GET'
    };

    console.log('Checking Volumio status...');

    const request = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            try {
                const parsedData = JSON.parse(data);
                if (parsedData.status === 'play' || parsedData.status === 'stop' || parsedData.status === 'pause') {
                    console.log('Volumio is ready.');
                    onReady();
                } else {
                    console.log('Volumio is not ready yet. Retrying...');
                    setTimeout(() => checkVolumioStatus(onReady), 5000); // Check again after 5 seconds
                }
            } catch (e) {
                console.log('Error parsing Volumio status. Retrying...');
                setTimeout(() => checkVolumioStatus(onReady), 5000); // Check again after 5 seconds
            }
        });
    });

    request.on('error', (e) => {
        console.error(`Problem with request: ${e.message}`);
        setTimeout(() => checkVolumioStatus(onReady), 5000); // Check again after 5 seconds
    });

    request.end();
}

module.exports = { checkVolumioStatus };
