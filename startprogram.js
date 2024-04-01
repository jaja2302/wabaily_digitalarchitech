const axios = require('axios');
const { exec } = require('child_process');
const cron = require('node-cron');
const fs = require('fs');
const ping = require('ping');


let isFirstRun = true;
async function activeBot() {
    exec('pm2 list', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error checking PM2 status: ${error}`);
            return;
        }
  
        const processes = stdout.split('\n');
        let botStatus = 'offline';
  
        processes.forEach((process) => {
            if (process.includes('bot_da') && process.includes('online')) {
                botStatus = 'online';
            }
        });
  
        if (botStatus === 'online') {
            console.log('Bot already online');
        } else {
            // Bot is offline, start it
            exec('pm2 start index.js --name bot_da -o bot-da-out.log -e bot-da-error.log', (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error starting the PM2 process: ${error}`);
                    return;
                }
                console.log(`PM2 process started: ${stdout}`);
            });
        }
    });
}

async function offBot() {
    exec('pm2 list', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error checking PM2 status: ${error}`);
            return;
        }
  
        const processes = stdout.split('\n');
        let botStatus = 'offline';
  
        processes.forEach((process) => {
            if (process.includes('bot_da') && process.includes('online')) {
                botStatus = 'online';
            }
        });
  
        if (botStatus === 'offline') {
            console.error('Bot offline');
        } else {
            // Bot is online, stop it
            exec('pm2 stop bot_da', (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error stopping the PM2 process: ${error}`);
                    return;
                }
                console.log(`PM2 process stopped: ${stdout}`);
            });
        }
    });
}
// Check if it's the first run before scheduling the ping function
if (isFirstRun) {
    activeBot(); // Start the bot on the first run
    isFirstRun = false; // Update the flag after the first run
}
let isInternetAvailable = false;
let offlineDuration = 0;
const offlineThreshold = 60; // Threshold in seconds
let botStopped = false; // Flag to track if the bot has been stopped

// Function to stop counting and log a waiting message
function stopCounting() {
    offlineDuration = 0;
    botStopped = true;
    console.log('Internet is currently unavailable. Bot is waiting for the internet to become available...');
}

// Function to check internet connection
async function checkInternetConnection() {
    const host = 'www.whatsapp.com';
    ping.sys.probe(host, (isAlive) => {
        if (isAlive && !isInternetAvailable) {
            console.log(`Internet is available`);
            isInternetAvailable = true;
            offlineDuration = 0;
            if (botStopped) {
                botStopped = false;
                activeBot(); // Restart the bot when internet becomes available
            }
        } else if (!isAlive && isInternetAvailable) {
            console.log(`Internet is unavailable`);
            isInternetAvailable = false;
        } else if (!isAlive && !isInternetAvailable) {
            offlineDuration++;
            console.log(`Internet has been unavailable for ${offlineDuration} seconds`);

            if (offlineDuration >= offlineThreshold && !botStopped) {
                // console.log(`Internet has been offline for more than ${offlineThreshold} seconds. Stopping the bot.`);
                offBot(); // Stop the bot when the internet has been offline for more than the threshold
                stopCounting(); // Stop counting once the bot is stopped and log waiting message
            }
        }
    }, { timeout: 10 });
}

// Check internet connection status initially
checkInternetConnection();

setInterval(checkInternetConnection, 1000);
