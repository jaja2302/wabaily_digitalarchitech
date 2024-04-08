const {
    default: makeWASocket,
    MessageType,
    MessageOptions,
    Mimetype,
    DisconnectReason,
    BufferJSON,
    AnyMessageContent,
    delay,
    fetchLatestBaileysVersion,
    isJidBroadcast,
    makeCacheableSignalKeyStore,
    makeInMemoryStore,
    MessageRetryMap,
    useMultiFileAuthState,
    msgRetryCounterMap
} = require("@whiskeysockets/baileys");


const log = (pino = require("pino"));
const { session } = { "session": "baileys_auth_info" };
const { Boom } = require("@hapi/boom");
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require("express");
const fileUpload = require('express-fileupload');
const cors = require('cors');
const bodyParser = require("body-parser");
const app = require("express")()
const cron = require('node-cron');
const axios = require('axios');
const { DateTime } = require('luxon');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const { getdatataksasi } = require('./helper.js');
const moment = require('moment-timezone');
// enable files upload
app.use(fileUpload({
    createParentPath: true
}));

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const server = require("http").createServer(app);
const io = require("socket.io")(server);
const port = process.env.PORT || 8000;
const qrcode = require("qrcode");
const { Console } = require("console");

app.use("/assets", express.static(__dirname + "/client/assets"));

app.get("/scan", (req, res) => {
    res.sendFile("./client/server.html", {
        root: __dirname,
    });
});

app.get("/", (req, res) => {
    res.sendFile("./client/index.html", {
        root: __dirname,
    });
});
//fungsi suara capital 
function capital(textSound) {
    const arr = textSound.split(" ");
    for (var i = 0; i < arr.length; i++) {
        arr[i] = arr[i].charAt(0).toUpperCase() + arr[i].slice(1);
    }
    const str = arr.join(" ");
    return str;
}
const store = makeInMemoryStore({ logger: pino().child({ level: "silent", stream: "store" }) });

let sock;
let qr;
let soket;
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Adding 1 because getMonth() returns zero-based index
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Get the current date
const today = new Date();

// Format the current date to 'YYYY-MM-DD' format
const datetimeValue = formatDate(today);
const idgroup = '120363205553012899@g.us' 
// const idgroup = '120363204285862734@g.us'


async function senddata(groupID, destinationPath,fileName) {
    const pesankirim = fileName

    const messageOptions = {
        document: {
            url: destinationPath,
            caption: pesankirim
        },
        fileName: fileName
    };

    // Send the PDF file
    await sock.sendMessage(groupID, messageOptions);

    // Unlink the file after sending
    fs.unlink(destinationPath, (err) => {
        if (err) {
            console.error('Error unlinking the file:', err);
            
        }
    });

}

async function checkAndDeleteFiles() {
    let attempts = 0;
    const maxAttempts = 5;
    const retryDelay = 3000; // 3 seconds in milliseconds

    while (attempts < maxAttempts) {
        try {
            const getStatus = await axios.get('https://srs-ssms.com/whatsapp_bot/checkfolderstatus.php');
            const { data: folderStatus } = getStatus;

            if (Array.isArray(folderStatus) && folderStatus.length > 0) {
                for (const file of folderStatus) {
                    if (file.hasOwnProperty('wilayah') && file.hasOwnProperty('filename')) {
                        const { wilayah, filename } = file;
                        await deleteFile(filename, wilayah);
                    }
                }
            } else {
                console.log('No files found or empty folder. Nothing to delete.');
            }
            // Break the loop if successful
            break;
        } catch (error) {
            attempts++;
            console.error('Error checking and deleting files:', error);
            if (attempts < maxAttempts) {
                console.log(`Retrying attempt ${attempts} after ${retryDelay / 1000} seconds`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            } else {
                console.error(`Max retry attempts (${maxAttempts}) reached. Exiting retry loop.`);
                throw error; // Throw the error after max attempts are reached
            }
        }
    }
}


// taksasi func 

async function deleteFile(filename, folder) {
    try {
        const response = await axios.head(`https://srs-ssms.com/whatsapp_bot/deletebot.php?filename=${filename}&path=${folder}`);

        if (response.status === 200) {
            await axios.get(`https://srs-ssms.com/whatsapp_bot/deletebot.php?filename=${filename}&path=${folder}`);
            console.log(`File '${filename}' in folder '${folder}' deleted successfully.`);
        } else if (response.status === 404) {
            console.log(`File '${filename}' in folder '${folder}' doesn't exist. Skipping deletion.`);
        } else {
            console.log(`Unexpected status code ${response.status} received. Skipping deletion.`);
        }
    } catch (error) {
        console.log(`Error checking or deleting file '${filename}' in folder '${folder}':`, error.message);
        await sock.sendMessage(idgroup, { text: 'Error checking or deleting file' })
    }
}

async function sendPdfToGroups(folder, groupID) {
    try {
        const response = await axios.get(`https://srs-ssms.com/whatsapp_bot/taksasiScan.php?folder=${folder}`);

        // Accessing the response data
        const files = response.data;

        if (!files || files.length === 0) {
            // return res.status(200).json({
            //     status: false,
            //     response: "Folder is empty"
            // });
            await sock.sendMessage(idgroup, { text: 'Folder is empty' })
            console.log('empty');
        }

        for (const key in files) {
            if (Object.hasOwnProperty.call(files, key)) {
                const fileName = files[key];
                const fileUrl = `https://srs-ssms.com/whatsapp_bot/taksasi/${folder}/${fileName}`;
                const destinationPath = `./uploads/${fileName}`;

                const file = fs.createWriteStream(destinationPath);

                await new Promise((resolve, reject) => {
                    https.get(fileUrl, function(response) {
                        response.pipe(file);
                        file.on('finish', function() {
                            file.close(() => {
                                console.log('File downloaded successfully.');
                                resolve(); // Resolve the promise after the file is downloaded
                            });
                        });
                    }).on('error', function(err) {
                        fs.unlink(destinationPath, () => {}); // Delete the file if there is an error
                        console.error('Error downloading the file:', err);
                        reject(err); // Reject the promise if there is an error
                    });
                });

                await senddata(groupID, destinationPath, fileName);
                await deleteFile(fileName, folder);
            }
        }
        await sock.sendMessage(idgroup, { text: 'Laporan berhasil di kirim ke grup' })
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

  
async function Generatedmapsest(estate, datetime) {
    const maxRetries = 5;
    let retryCount = 0;
    while (retryCount < maxRetries) {
        try {
            const formData = new URLSearchParams();
            formData.append('estate', estate);
            formData.append('datetime', datetime);

            // const response = await axios.post('http://localhost:3000/api/run', formData, {
            //     headers: {
            //         'Content-Type': 'application/x-www-form-urlencoded' // Set the proper content type for form data
            //     }
            // });
            const response = await axios.post('https://digi-kappa-lac.vercel.app/api/run', formData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded' // Set the proper content type for form data
                }
            });


            // console.log('Response data:', response.data); // Access the response data
            await sock.sendMessage(idgroup, { text: `Map ${estate} berhasil di generate` });
            return response.data;
        } catch (error) {
            console.error('Error fetching data:', error);
            await sock.sendMessage(idgroup, { text: `Map ${estate} gagal di generate ${error.status}`});
            retryCount++;
            if (retryCount === maxRetries) {
                await sock.sendMessage(idgroup, { text: `Terjadi kesalahan menarik ${estate} yang gagal di generate`});
                throw error;
            } else {
                console.log(`Retrying (${retryCount}/${maxRetries})...`);
                await sock.sendMessage(idgroup, { text: `Menarik ulang Map ${estate} yang gagal di generate`});
            }
        }
    }
}


  
async function GenDefaultTaksasi(est) {
    let attempts = 0;
    const maxAttempts = 5;
    const retryDelay = 3000; // 3 seconds in milliseconds

    while (attempts < maxAttempts) {
        try {
            const response = await axios.get(`https://srs-ssms.com/rekap_pdf/pdf_taksasi_folder.php?est=${est.toLowerCase()}`);
            await sock.sendMessage(idgroup, { text: `Pdf berhasil di generate ${est}` })
            return response;
        } catch (error) {
            console.error('Error fetching data:', error);
            attempts++;
            if (attempts < maxAttempts) {
                console.log(`Retrying attempt ${attempts} for ${est}`);
                await sock.sendMessage(idgroup, { text: `Mengulang Generate PDF ${est}` })
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            } else {
                await sock.sendMessage(idgroup, { text: `Sudah Max Generate PDF ${est} Gagal` })
                throw error; // Throw the error after max attempts are reached
            }
        }
    }
}
  
async function sendtaksasiest(est) {
    try {
        let folder;
        // Mapping the est value to the corresponding folder
        switch (est) {
            case 'PLE':
            case 'KNE':
            case 'RDE':
            case 'SLE':
                folder = 'Wilayah_1';
                break;
            case 'KDE':
            case 'BKE':
            case 'RGE':
            case 'SGE':
                folder = 'Wilayah_2';
                break;
            case 'SYE':
            case 'BGE':
            case 'NBE':
            case 'UPE':
                folder = 'Wilayah_3';
                break;
            case 'MRE':
            case 'NKE':
            case 'PDE':
            case 'SPE':
                folder = 'Wilayah_4';
                break;
            case 'BTE':
            case 'NNE':
            case 'SBE':
                folder = 'Wilayah_5';
                break;
            case 'MLE':
            case 'SCE':
                folder = 'Wilayah_6';
                break;
            case 'PKE':
            case 'BDE':
            case 'KTE':
            case 'MKE':
           
                folder = 'Wilayah_7';
                break;

            case 'BHE':

                folder = 'Wilayah_8';
                break;
        
            case 'TBE':
            case 'KTE4':
            case 'SJE':
            folder = 'Inti';
            break;
            case 'LME1':
            case 'LME2':
            folder = 'Plasma';
                break;
            case 'test':
            folder = 'Wilayah_testing';
                break;
            default:
                // Handle cases where est doesn't match any defined folders
                console.log('Invalid est value provided.');
                return 'invalid' ;
        }
      
        // await Generatedmapsest(est);
        await checkAndDeleteFiles(); 
        await Generatedmapsest(est,datetimeValue)
        // console.log();
        await GenDefaultTaksasi(est)
        // testing 
        if (folder === 'Wilayah_1') {
            await sendPdfToGroups(folder, '120363025737216061@g.us');
             // testing 
            //  await sendPdfToGroups(folder, '120363204285862734@g.us');
        } else if (folder === 'Wilayah_2') {
            await sendPdfToGroups(folder, '120363047670143778@g.us');
             // testing 
            //  await sendPdfToGroups(folder, '120363204285862734@g.us');
        } else if (folder === 'Wilayah_3') {
            await sendPdfToGroups(folder, '120363048442215265@g.us');
             // testing 
            //  await sendPdfToGroups(folder, '120363204285862734@g.us');
        }  else if (folder === 'Wilayah_4') {
            if (est === 'SPE') {
                await sendPdfToGroups(folder, '120363220419839708@g.us');
                // testing 
                // await sendPdfToGroups(folder, '120363204285862734@g.us');
            }else if (est === 'NKE'){
                await sendPdfToGroups(folder, '120363217152686034@g.us');
                  // testing 
                //   await sendPdfToGroups(folder, '120363204285862734@g.us');
            }  else if (est === 'PDE'){
                await sendPdfToGroups(folder, '120363217291038671@g.us');
                  // testing 
                // await sendPdfToGroups(folder, '120363204285862734@g.us');
            }else if (est === 'MRE'){
                // await sendPdfToGroups(folder, '120363217205685424@g.us');
                // testing 
                  await sendPdfToGroups(folder, '120363204285862734@g.us');
            }
        }else if (folder === 'Wilayah_5') {
            if (est === 'SBE') {
                await sendPdfToGroups(folder, '120363220146576654@g.us');
                  // testing 
                //  await sendPdfToGroups(folder, '120363204285862734@g.us');  
            } else if (est === 'BTE') {
                await sendPdfToGroups(folder, '120363226513991710@g.us');
                  // testing 
                //  await sendPdfToGroups(folder, '120363204285862734@g.us');
            }  else if (est === 'NNE') {
                await sendPdfToGroups(folder, '120363231670115838@g.us');
                  // testing 
            //  await sendPdfToGroups(folder, '120363204285862734@g.us');
            } 
        } else if (folder === 'Wilayah_6') {
            if (est === 'SCE') {
                await sendPdfToGroups(folder, '120363232871713646@g.us');
                  // testing 
            //  await sendPdfToGroups(folder, '120363204285862734@g.us');
            } else if (est === 'MLE'){
                await sendPdfToGroups(folder, '120363213054175770@g.us');
                  // testing 
            //  await sendPdfToGroups(folder, '120363204285862734@g.us');
            }
        } else if (folder === 'Wilayah_7') {
            if (est === 'KTE') {
                await sendPdfToGroups(folder, '120363170524329595@g.us');
                  // testing 
            //  await sendPdfToGroups(folder, '120363204285862734@g.us');
            } else if (est === 'BDE') {
                await sendPdfToGroups(folder, '120363166668733371@g.us');
                  // testing 
                //  await sendPdfToGroups(folder, '120363204285862734@g.us');
            }

            // testing 
            // grup asli = 120363166668733371@g.us
            // grup testing = 120363205553012899@g.us

        } else if (folder === 'Wilayah_8') {
            if (est === 'BHE') {
                await sendPdfToGroups(folder, '120363149785590346@g.us');
                  // testing 
            //  await sendPdfToGroups(folder, '120363204285862734@g.us');
            }
        }else if (folder === 'Inti') {
            if (est === 'SJE') {
                await sendPdfToGroups(folder, '120363207525577365@g.us');
                  // testing 
            //  await sendPdfToGroups(folder, '120363204285862734@g.us');
            } else if (est === 'KTE4'){
                await sendPdfToGroups(folder, '120363210871038595@g.us');
                  // testing 
            //  await sendPdfToGroups(folder, '120363204285862734@g.us');
            }
            else {
                await sendPdfToGroups(folder, '120363193125275627@g.us');
                  // testing 
                //  await sendPdfToGroups(folder, '120363204285862734@g.us');
            }
           
        }else if (folder === 'Plasma') {
            if (est === 'LME1') {
                await sendPdfToGroups(folder, '120363208984887370@g.us');
                  // testing 
            //  await sendPdfToGroups(folder, '120363204285862734@g.us');
            } else if (est === 'LME2'){
                await sendPdfToGroups(folder, '120363193243380343@g.us');
                  // testing 
            //  await sendPdfToGroups(folder, '120363204285862734@g.us');
            }
        }else if (folder === 'Wilayah_testing') {
            await sendPdfToGroups(folder, '120363204285862734@g.us');
        }
        // await sendMessage(`kirim pdf untuk ${est} sukses`);
 
        // await sendmsgAws(`kirim pdf untuk ${est} sukses`, '120363205553012899@g.us');

    } catch (error) {
        console.log(`Error fetching files:`, error);
        // logError(error);
    }
}

// end taksasi func 
function formatPhoneNumber(phoneNumber) {
    if (phoneNumber.startsWith("08")) {
        return "628" + phoneNumber.substring(2);
    } else {
        return phoneNumber;
    }
}

let phoneNumber = "082295204921";
let formattedNumber = formatPhoneNumber(phoneNumber);
console.log(formattedNumber);  // Output: 6282295204921

// smartlab func 
async function sendMessagesBasedOnData() {
    try {
        console.log('smartlabs');
        const response = await axios.get('https://srs-ssms.com/whatsapp_bot/getmsgsmartlab.php');
        const numberData = response.data;

        if (!Array.isArray(numberData) || numberData.length === 0) {
            console.log('Invalid or empty data.'); // Log the error
            return;
        }

            // Assuming this is inside a loop or function
        for (const data of numberData) {
            const numberWA = formatPhoneNumber(data.penerima) + "@s.whatsapp.net"; // Assuming penerima is the WhatsApp number
            console.log(numberWA); // Log the WhatsApp number for debugging

            if (isConnected) {
                
                const currentTime = moment().tz('Asia/Jakarta');
                const currentHour = currentTime.hours();
                let greeting;
                if (currentHour < 10) {
                    greeting = 'Selamat Pagi';
                } else if (currentHour < 15) {
                    greeting = 'Selamat Siang';
                } else if (currentHour < 19) {
                    greeting = 'Selamat Sore';
                } else {
                    greeting = 'Selamat Malam';
                }
            
                let chatContent; // Declare chatContent outside of the if-else block
                if (data.type === "input") {
                    chatContent = `Yth. Pelanggan Setia Lab CBI,\n\nSampel anda telah kami terima dengan no surat *${data.no_surat}*. \nprogress saat ini: *${data.progres}*. Progress anda dapat dilihat di website https://smartlab.srs-ssms.com/tracking_sampel dengan kode tracking sample : *${data.kodesample}*\nTerima kasih telah mempercayakan sampel anda untuk dianalisa di Lab kami.`;
                } else {
                    chatContent = `Yth. Pelanggan Setia Lab CBI,\n\nProgress Sampel anda telah *Terupdate* dengan no surat *${data.no_surat}*. \nProgress saat ini: *${data.progres}*. Progress anda dapat dilihat di website https://smartlab.srs-ssms.com/tracking_sampel dengan kode tracking sample : *${data.kodesample}*\nTerima kasih telah mempercayakan sampel anda untuk dianalisa di Lab kami.`;
                }
            
                const message = `${greeting}\n${chatContent}`;
            


                const result = await sock.sendMessage(numberWA, { text: message });

                console.log('Message sent:smartlab', data.id); // Log the result for debugging
                await deletemsg(data.id)
                // Stop the loop or function after the message is sent
                break;
            } else {
                console.log('WhatsApp belum terhubung.'); // Log if WhatsApp is not connected
            }
        }

    } catch (error) {
        console.error('Error fetching data or sending messages:', error); // Log the error if any occurs
    }
}

async function deletemsg(idmsg) {
    try {
        // await axios.post('http://localhost:52914/deletedata', { id: idmsg });
        await axios.post('https://srs-ssms.com/whatsapp_bot/getmsgsmartlab.php', { id: idmsg });
     
        console.log(`Message ID '${idmsg}' deleted successfully.`);
    } catch (error) {
        console.log(`Error deleting message ID '${idmsg}':`, error);
    }
}

// 5 menit sekali 
cron.schedule('*/1 * * * *', async () => {
    await sendMessagesBasedOnData();
}, {
    scheduled: true,
    timezone: 'Asia/Jakarta'
});

// end smartlab func 

// func untuk aws 


async function statusAWS() {
    try {
        const response = await axios.get('https://srs-ssms.com/iot/notif_wa_last_online_device.php');
        console.log('iot');
        // Check if response.data is not empty
        if (Array.isArray(response.data) && response.data.length > 0) {
            const jsonArray = response.data; // Use the response directly

            // Iterate through each object in the array
            for (const item of jsonArray) {
                // Check if 'online' is equal to 0 and 'group_id' is not empty
                if (item.online === 0 && item.group_id && item.group_id.trim() !== '') {
                     await sock.sendMessage(item.group_id, { text: item.message });
                     console.log(item.group_id, { text: item.message });
                }
            }
        }
    } catch (error) {
        console.error(`Error fetching files:`, error);
        // Handle the error accordingly
        logError(error);
    }
}
cron.schedule('0 * * * *', async () => {
    try {
        await statusAWS(); // Call the function to check AWS status and send message
    } catch (error) {
        console.error('Error in cron job:', error);
    }
}, {
    scheduled: true,
    timezone: 'Asia/Jakarta' // Set the timezone according to your location
});

// cron edit history 

function readLatestId() {
    try {
        if (fs.existsSync('latest_id.txt')) {
            const data = fs.readFileSync('latest_id.txt', 'utf8');
            return parseInt(data.trim()); // Parse the ID as an integer
        } else {
            // If the file doesn't exist, set the initial latest_id to 9
            writeLatestId(9);
            return 9;
        }
    } catch (err) {
        console.error('Error reading latest ID:', err);
        return null;
    }
}

// Function to write the latest ID to a file
function writeLatestId(id) {
    try {
        fs.writeFileSync('latest_id.txt', id.toString()); // Write the ID to the file
    } catch (err) {
        console.error('Error writing latest ID:', err);
    }
}
async function statusHistory() {
    try {
        // Get the latest ID from the file
        let latestId = readLatestId();

        // Fetch new data from the API using the latest ID
        const response = await axios.get('https://qc-apps.srs-ssms.com/api/history', {
            params: {
                id: latestId // Change the parameter name to "id"
            }
        });
        const numberData = response.data;

        if (Array.isArray(numberData) && numberData.length > 0) {
            for (const data of numberData) {
                if (isConnected) {
                    const maxId = Math.max(...response.data.map(item => item.id));
                    writeLatestId(maxId);
        
                    const pesankirim = data.menu;
                    const groupId = '120363205553012899@g.us'; // Update with your actual group ID
                    let existIdGroup = await sock.groupMetadata(groupId);
                    console.log(existIdGroup.id);
                    console.log("isConnected");

                    if (existIdGroup?.id || (existIdGroup && existIdGroup[0]?.id)) {
                        await sock.sendMessage(groupId, { text: `User ${data.nama_user} melakukan ${data.menu} pada ${data.tanggal}` });
                        console.log('Message sent successfully.');
                    } else {
                        console.log(`ID Group ${groupId} tidak terdaftar.`);
                    }
                    break;
                } else {
                    console.log('WhatsApp belum terhubung.');
                    break;
                }
            }
        } else {
            console.log('No data or invalid data received from the API.');
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        // Handle the error accordingly
    }
}
cron.schedule('0 * * * *', async () => {
    try {
        // console.log('Running message history');
        await statusHistory(); // Call the function to check history and send message
    } catch (error) {
        console.error('Error in cron job:', error);
    }
}, {
    scheduled: true,
    timezone: 'Asia/Jakarta' // Set the timezone according to your location
});

// end aws 

async function connectToWhatsApp() {

    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info')
    let { version, isLatest } = await fetchLatestBaileysVersion();
    sock = makeWASocket({
        printQRInTerminal: true,
        auth: state,
        logger: log({ level: "silent" }),
        version,
        shouldIgnoreJid: jid => isJidBroadcast(jid),
    });
    store.bind(sock.ev);
    sock.multi = true
    sock.ev.on('connection.update', async (update) => {
        //console.log(update);
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            let reason = new Boom(lastDisconnect.error).output.statusCode;
            if (reason === DisconnectReason.badSession) {
                console.log(`Bad Session File, Please Delete ${session} and Scan Again`);
                sock.logout();
            } else if (reason === DisconnectReason.connectionClosed) {
                console.log("Connection closed, reconnecting....");
                connectToWhatsApp();
            } else if (reason === DisconnectReason.connectionLost) {
                console.log("Connection Lost from Server, reconnecting...");
                connectToWhatsApp();
            } else if (reason === DisconnectReason.connectionReplaced) {
                console.log("Connection Replaced, Another New Session Opened, Please Close Current Session First");
                sock.logout();
            } else if (reason === DisconnectReason.loggedOut) {
                console.log(`Device Logged Out, Please Delete ${session} and Scan Again.`);
                sock.logout();
            } else if (reason === DisconnectReason.restartRequired) {
                console.log("Restart Required, Restarting...");
                connectToWhatsApp();
            } else if (reason === DisconnectReason.timedOut) {
                console.log("Connection TimedOut, Reconnecting...");
                connectToWhatsApp();
            } else {
                sock.end(`Unknown DisconnectReason: ${reason}|${lastDisconnect.error}`);
            }
        } else if (connection === 'open') {
            // console.log('opened connection');
            // let getGroups = await sock.groupFetchAllParticipating();
            // let groups = Object.values(await sock.groupFetchAllParticipating())
            // //console.log(groups);
            // for (let group of groups) {
            //     console.log("id_group: " + group.id + " || Nama Group: " + group.subject);
            // }
            return;
        }
        if (update.qr) {
            qr = update.qr;
            updateQR("qr");
        }
        else if (qr = undefined) {
            updateQR("loading");
        }
        else {
            if (update.connection === "open") {
                updateQR("qrscanned");
                return;
            }
        }
    });
    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("messages.upsert", async function handleUpsert({ messages, type }) {
        for (const message of messages) {
            if (!message.key.fromMe) {
                const text = message.message.conversation;
                if (!text) continue; // Skip processing if conversation text is null or empty
                const noWa = message.key.remoteJid;
                const lowerCaseMessage = text.toLowerCase();


                if (lowerCaseMessage === "!tarik") {
                    await sock.sendMessage(noWa, { text: "Masukan Estate Harus Huruf Besar ?\n Contoh : KNE \n _Perhatian Satu Perintah Untuk Per Estate_" }, { quoted: message });
                
                    // Define a function to handle the timeout
                    function handleTimeout() {
                        console.log('Time up! User did not input the estate.');
                        sock.sendMessage(noWa, { text: 'Waktu habis. Silakan coba lagi.' }, { quoted: message });
                        sock.ev.off("messages.upsert", handleResponse); // Stop listening for messages
                    }
                
                    // Set a timer for 5 seconds
                    const timer = setTimeout(handleTimeout, 60000); // 60 seconds (1 minute) in milliseconds

                    async function handleResponse({ messages: responseMessages }) {
                        for (const responseMessage of responseMessages) {
                            if (!responseMessage.key.fromMe && responseMessage.key.remoteJid === noWa) {
                                clearTimeout(timer); // Clear the timer as response is received
                
                                await sock.sendMessage(noWa, { text: 'Mohon Tunggu Laporan Sedang Di Proses' }, { quoted: message });
                                const estate = responseMessage.message.conversation.toUpperCase();
                                try {
                                    const result = await sendtaksasiest(estate);
                                    if (result === 'invalid') {
                                        console.error('Error: Invalid estate value provided.');
                                        await sock.sendMessage(noWa, { text: 'Estate yang anda maksud tidak tersedia harap pastikan penulisan benar atau sesuai.Silahkan Coba Tarik Kembali!' }, { quoted: message });
                                    }
                                    // Process other valid results here if needed
                                } catch (error) {
                                    console.error('Error fetching data:', error.message);
                                    // Handle other errors if needed
                                }
                                sock.ev.off("messages.upsert", handleResponse); // Ensure event handling is correct
                                break;
                            }
                        }
                    }
                
                    sock.ev.on("messages.upsert", handleResponse);
                }
                
                
                else if (lowerCaseMessage === "!menu") {
                    await sock.sendMessage(noWa, { text: "Perintah Bot Yang tersida \n1 = !tarik (Menarik Estate yang di pilih untuk di generate ke dalam grup yang sudah di tentukan) \n2= !help (Hubungi Kami Secara langsung untuk keluhan dan masalah)" }, { quoted: message });
                    break;
                }else if (lowerCaseMessage === "!getgrup") {
                    // console.log('ini group');
                    let getGroups = await sock.groupFetchAllParticipating();
                    let groups = Object.values(await sock.groupFetchAllParticipating());
                    let datagrup = []; // Initialize an empty array to store group information
                    
                    for (let group of groups) {
                        datagrup.push(`id_group: ${group.id} || Nama Group: ${group.subject}`);
                    }
                    
                    await sock.sendMessage(noWa, { text: `List ${datagrup.join('\n')}` }, { quoted: message }); 

                    break;
                }  else if (lowerCaseMessage === "!update") {
                    await fetchDataAndSaveAsJSON();
                    
                    await sock.sendMessage(noWa, { text: `Cronjob Database Patched Gan`}, { quoted: message }); 
                } else if (lowerCaseMessage === "!cast") {
                    // Send a message asking for the broadcast message
                    await sock.sendMessage(noWa, { text: "Masukan Kata kata yang ingin di broadcast ke dalam group?" }, { quoted: message });
                
                    // Define a function to handle the response
                    async function handleBroadcast({ messages: responseMessages }) {
                        let messageSent = false; // Flag to track if the message has been sent
                
                        for (const responseMessage of responseMessages) {
                            if (!responseMessage.key.fromMe && responseMessage.key.remoteJid === noWa) {
                                // Get the broadcast message from the user's response
                                const broadcastMessage = responseMessage.message.conversation;
                
                                console.log(broadcastMessage);
                
                                // Get the participating groups
                                let groups = Object.values(await sock.groupFetchAllParticipating());
                                let datagrup = groups.map((group) => ({
                                    id_group: group.id,
                                    nama: group.subject,
                                }));
                
                                let groupdont = [
                                    '120363200959267322@g.us',
                                    '120363164661400702@g.us',
                                    '120363214741096436@g.us',
                                    '120363158376501304@g.us',
                                ];
                
                                // Send a message indicating that the broadcast is being processed
                                await sock.sendMessage(noWa, { text: 'Mohon Tunggu, Broadcast Sedang Di Proses' }, { quoted: message });
                
                                // Set a timer for 60 seconds (1 minute)
                                const timer = setTimeout(async () => {
                                    if (!messageSent) {
                                        // If the message hasn't been sent within the time limit, notify the user
                                        await sock.sendMessage(noWa, { text: 'Waktu habis! Silahkan coba kembali.' }, { quoted: message });
                                    }
                                }, 60000); // 60 seconds in milliseconds
                
                                // Send the broadcast message to groups
                                for (const group of datagrup) {
                                    if (!groupdont.includes(group.id_group)) {
                                        await sock.sendMessage(group.id_group, { text: broadcastMessage });
                                        console.log(group.id_group, { text: broadcastMessage });
                                        messageSent = true; // Update the flag since the message has been sent
                                    }
                                }
                
                                // Clear the timer since the message has been sent or the timer has expired
                                clearTimeout(timer);
                
                                // Send a message indicating that the broadcast message has been sent to all groups
                                await sock.sendMessage(noWa, { text: 'Broadcast Pesan sudah di kirim Kesemua Grup' }, { quoted: message });
                
                                // Turn off the event listener for handling broadcast messages
                                sock.ev.off("messages.upsert", handleBroadcast);
                                break;
                            }
                        }
                    }
                
                    // Listen for the user's response to the broadcast message
                    sock.ev.on("messages.upsert", handleBroadcast);
                }
                
                
            }
        }
    });
}


io.on("connection", async (socket) => {
    soket = socket;
    // console.log(sock)
    if (isConnected) {
        updateQR("connected");
    } else if (qr) {
        updateQR("qr");
    }
});

// functions
const isConnected = () => {
    return (sock.user);
};

const updateQR = (data) => {
    switch (data) {
        case "qr":
            qrcode.toDataURL(qr, (err, url) => {
                soket?.emit("qr", url);
                soket?.emit("log", "QR Code received, please scan!");
            });
            break;
        case "connected":
            soket?.emit("qrstatus", "./assets/check.svg");
            soket?.emit("log", "WhatsApp terhubung!");
            break;
        case "qrscanned":
            soket?.emit("qrstatus", "./assets/check.svg");
            soket?.emit("log", "QR Code Telah discan!");
            break;
        case "loading":
            soket?.emit("qrstatus", "./assets/loader.gif");
            soket?.emit("log", "Registering QR Code , please wait!");
            break;
        default:
            break;
    }
};


// send text message to wa user
app.post("/send-message", async (req, res) => {
    //console.log(req);
    const pesankirim = req.body.message;
    const number = req.body.number;
    const fileDikirim = req.files;

    let numberWA;
    try {
        if (!req.files) {
            if (!number) {
                res.status(500).json({
                    status: false,
                    response: 'Nomor WA belum tidak disertakan!'
                });
            }
            else {
                numberWA = '62' + number.substring(1) + "@s.whatsapp.net";
                console.log(await sock.onWhatsApp(numberWA));
                if (isConnected) {
                    const exists = await sock.onWhatsApp(numberWA);
                    if (exists?.jid || (exists && exists[0]?.jid)) {
                        sock.sendMessage(exists.jid || exists[0].jid, { text: pesankirim })
                            .then((result) => {
                                res.status(200).json({
                                    status: true,
                                    response: result,
                                });
                            })
                            .catch((err) => {
                                res.status(500).json({
                                    status: false,
                                    response: err,
                                });
                            });
                    } else {
                        res.status(500).json({
                            status: false,
                            response: `Nomor ${number} tidak terdaftar.`,
                        });
                    }
                } else {
                    res.status(500).json({
                        status: false,
                        response: `WhatsApp belum terhubung.`,
                    });
                }
            }
        }
        else {
            //console.log('Kirim document');
            if (!number) {
                res.status(500).json({
                    status: false,
                    response: 'Nomor WA belum tidak disertakan!'
                });
            }
            else {

                numberWA = '62' + number.substring(1) + "@s.whatsapp.net";
                //console.log('Kirim document ke'+ numberWA);
                let filesimpan = req.files.file_dikirim;
                var file_ubah_nama = new Date().getTime() + '_' + filesimpan.name;
                //pindahkan file ke dalam upload directory
                filesimpan.mv('./uploads/' + file_ubah_nama);
                let fileDikirim_Mime = filesimpan.mimetype;
                //console.log('Simpan document '+fileDikirim_Mime);

                //console.log(await sock.onWhatsApp(numberWA));

                if (isConnected) {
                    const exists = await sock.onWhatsApp(numberWA);

                    if (exists?.jid || (exists && exists[0]?.jid)) {

                        let namafiledikirim = './uploads/' + file_ubah_nama;
                        let extensionName = path.extname(namafiledikirim);
                        //console.log(extensionName);
                        if (extensionName === '.jpeg' || extensionName === '.jpg' || extensionName === '.png' || extensionName === '.gif') {
                            await sock.sendMessage(exists.jid || exists[0].jid, {
                                image: {
                                    url: namafiledikirim
                                },
                                caption: pesankirim
                            }).then((result) => {
                                if (fs.existsSync(namafiledikirim)) {
                                    fs.unlink(namafiledikirim, (err) => {
                                        if (err && err.code == "ENOENT") {
                                            // file doens't exist
                                            console.info("File doesn't exist, won't remove it.");
                                        } else if (err) {
                                            console.error("Error occurred while trying to remove file.");
                                        }
                                        //console.log('File deleted!');
                                    });
                                }
                                res.send({
                                    status: true,
                                    message: 'Success',
                                    data: {
                                        name: filesimpan.name,
                                        mimetype: filesimpan.mimetype,
                                        size: filesimpan.size
                                    }
                                });
                            }).catch((err) => {
                                res.status(500).json({
                                    status: false,
                                    response: err,
                                });
                                console.log('pesan gagal terkirim');
                            });
                        } else if (extensionName === '.mp3' || extensionName === '.ogg') {
                            await sock.sendMessage(exists.jid || exists[0].jid, {
                                audio: {
                                    url: namafiledikirim,
                                    caption: pesankirim
                                },
                                mimetype: 'audio/mp4'
                            }).then((result) => {
                                if (fs.existsSync(namafiledikirim)) {
                                    fs.unlink(namafiledikirim, (err) => {
                                        if (err && err.code == "ENOENT") {
                                            // file doens't exist
                                            console.info("File doesn't exist, won't remove it.");
                                        } else if (err) {
                                            console.error("Error occurred while trying to remove file.");
                                        }
                                        //console.log('File deleted!');
                                    });
                                }
                                res.send({
                                    status: true,
                                    message: 'Success',
                                    data: {
                                        name: filesimpan.name,
                                        mimetype: filesimpan.mimetype,
                                        size: filesimpan.size
                                    }
                                });
                            }).catch((err) => {
                                res.status(500).json({
                                    status: false,
                                    response: err,
                                });
                                console.log('pesan gagal terkirim');
                            });
                        } else {
                            await sock.sendMessage(exists.jid || exists[0].jid, {
                                document: {
                                    url: namafiledikirim,
                                    caption: pesankirim
                                },
                                mimetype: fileDikirim_Mime,
                                fileName: filesimpan.name
                            }).then((result) => {
                                if (fs.existsSync(namafiledikirim)) {
                                    fs.unlink(namafiledikirim, (err) => {
                                        if (err && err.code == "ENOENT") {
                                            // file doens't exist
                                            console.info("File doesn't exist, won't remove it.");
                                        } else if (err) {
                                            console.error("Error occurred while trying to remove file.");
                                        }
                                        //console.log('File deleted!');
                                    });
                                }
                                /*
                                setTimeout(() => {
                                    sock.sendMessage(exists.jid || exists[0].jid, {text: pesankirim});
                                }, 1000);
                                */
                                res.send({
                                    status: true,
                                    message: 'Success',
                                    data: {
                                        name: filesimpan.name,
                                        mimetype: filesimpan.mimetype,
                                        size: filesimpan.size
                                    }
                                });
                            }).catch((err) => {
                                res.status(500).json({
                                    status: false,
                                    response: err,
                                });
                                console.log('pesan gagal terkirim');
                            });
                        }
                    } else {
                        res.status(500).json({
                            status: false,
                            response: `Nomor ${number} tidak terdaftar.`,
                        });
                    }
                } else {
                    res.status(500).json({
                        status: false,
                        response: `WhatsApp belum terhubung.`,
                    });
                }
            }
        }
    } catch (err) {
        res.status(500).send(err);
    }

});

// send group message
app.post("/send-group-message", async (req, res) => {
    //console.log(req);
    const pesankirim = req.body.message;
    const id_group = req.body.id_group;
    const fileDikirim = req.files;
    let idgroup;
    let exist_idgroup;
    try {
        if (isConnected) {
            if (!req.files) {
                if (!id_group) {
                    res.status(500).json({
                        status: false,
                        response: 'Nomor Id Group belum disertakan!'
                    });
                }
                else {
                    let exist_idgroup = await sock.groupMetadata(id_group);
                    console.log(exist_idgroup.id);
                    console.log("isConnected");
                    if (exist_idgroup?.id || (exist_idgroup && exist_idgroup[0]?.id)) {
                        sock.sendMessage(id_group, { text: pesankirim })
                            .then((result) => {
                                res.status(200).json({
                                    status: true,
                                    response: result,
                                });
                                console.log("succes terkirim");
                            })
                            .catch((err) => {
                                res.status(500).json({
                                    status: false,
                                    response: err,
                                });
                                console.log("error 500");
                            });
                    } else {
                        res.status(500).json({
                            status: false,
                            response: `ID Group ${id_group} tidak terdaftar.`,
                        });
                        console.log(`ID Group ${id_group} tidak terdaftar.`);
                    }
                }

            } else {
                //console.log('Kirim document');
                if (!id_group) {
                    res.status(500).json({
                        status: false,
                        response: 'Id Group tidak disertakan!'
                    });
                }
                else {
                    exist_idgroup = await sock.groupMetadata(id_group);
                    console.log(exist_idgroup.id);
                    //console.log('Kirim document ke group'+ exist_idgroup.subject);

                    let filesimpan = req.files.file_dikirim;
                    var file_ubah_nama = new Date().getTime() + '_' + filesimpan.name;
                    //pindahkan file ke dalam upload directory
                    filesimpan.mv('./uploads/' + file_ubah_nama);
                    let fileDikirim_Mime = filesimpan.mimetype;
                    //console.log('Simpan document '+fileDikirim_Mime);
                    if (isConnected) {
                        if (exist_idgroup?.id || (exist_idgroup && exist_idgroup[0]?.id)) {
                            let namafiledikirim = './uploads/' + file_ubah_nama;
                            let extensionName = path.extname(namafiledikirim);
                            //console.log(extensionName);
                            if (extensionName === '.jpeg' || extensionName === '.jpg' || extensionName === '.png' || extensionName === '.gif') {
                                await sock.sendMessage(exist_idgroup.id || exist_idgroup[0].id, {
                                    image: {
                                        url: namafiledikirim
                                    },
                                    caption: pesankirim
                                }).then((result) => {
                                    if (fs.existsSync(namafiledikirim)) {
                                        fs.unlink(namafiledikirim, (err) => {
                                            if (err && err.code == "ENOENT") {
                                                // file doens't exist
                                                console.info("File doesn't exist, won't remove it.");
                                            } else if (err) {
                                                console.error("Error occurred while trying to remove file.");
                                            }
                                            //console.log('File deleted!');
                                        });
                                    }
                                    res.send({
                                        status: true,
                                        message: 'Success',
                                        data: {
                                            name: filesimpan.name,
                                            mimetype: filesimpan.mimetype,
                                            size: filesimpan.size
                                        }
                                    });
                                }).catch((err) => {
                                    res.status(500).json({
                                        status: false,
                                        response: err,
                                    });
                                    console.log('pesan gagal terkirim');
                                });
                            } else if (extensionName === '.mp3' || extensionName === '.ogg') {
                                await sock.sendMessage(exist_idgroup.id || exist_idgroup[0].id, {
                                    audio: {
                                        url: namafiledikirim,
                                        caption: pesankirim
                                    },
                                    mimetype: 'audio/mp4'
                                }).then((result) => {
                                    if (fs.existsSync(namafiledikirim)) {
                                        fs.unlink(namafiledikirim, (err) => {
                                            if (err && err.code == "ENOENT") {
                                                // file doens't exist
                                                console.info("File doesn't exist, won't remove it.");
                                            } else if (err) {
                                                console.error("Error occurred while trying to remove file.");
                                            }
                                            //console.log('File deleted!');
                                        });
                                    }
                                    res.send({
                                        status: true,
                                        message: 'Success',
                                        data: {
                                            name: filesimpan.name,
                                            mimetype: filesimpan.mimetype,
                                            size: filesimpan.size
                                        }
                                    });
                                }).catch((err) => {
                                    res.status(500).json({
                                        status: false,
                                        response: err,
                                    });
                                    console.log('pesan gagal terkirim');
                                });
                            } else {
                                await sock.sendMessage(exist_idgroup.id || exist_idgroup[0].id, {
                                    document: {
                                        url: namafiledikirim,
                                        caption: pesankirim
                                    },
                                    mimetype: fileDikirim_Mime,
                                    fileName: filesimpan.name
                                }).then((result) => {
                                    if (fs.existsSync(namafiledikirim)) {
                                        fs.unlink(namafiledikirim, (err) => {
                                            if (err && err.code == "ENOENT") {
                                                // file doens't exist
                                                console.info("File doesn't exist, won't remove it.");
                                            } else if (err) {
                                                console.error("Error occurred while trying to remove file.");
                                            }
                                            //console.log('File deleted!');
                                        });
                                    }

                                    setTimeout(() => {
                                        sock.sendMessage(exist_idgroup.id || exist_idgroup[0].id, { text: pesankirim });
                                    }, 1000);

                                    res.send({
                                        status: true,
                                        message: 'Success',
                                        data: {
                                            name: filesimpan.name,
                                            mimetype: filesimpan.mimetype,
                                            size: filesimpan.size
                                        }
                                    });
                                }).catch((err) => {
                                    res.status(500).json({
                                        status: false,
                                        response: err,
                                    });
                                    console.log('pesan gagal terkirim');
                                });
                            }
                        } else {
                            res.status(500).json({
                                status: false,
                                response: `Nomor ${number} tidak terdaftar.`,
                            });
                        }
                    } else {
                        res.status(500).json({
                            status: false,
                            response: `WhatsApp belum terhubung.`,
                        });
                    }
                }
            }

            //end is connected
        } else {
            res.status(500).json({
                status: false,
                response: `WhatsApp belum terhubung.`,
            });
        }

        //end try
    } catch (err) {
        res.status(500).send(err);
    }

});



app.get("/testing", async (req, res) => {
    try {
        await statusHistory();
        // Send a response back to the client indicating success
        res.status(200).json({
            status: true,
            message: "Messages sent successfully"
        });
    } catch (error) {
        console.error("Error sending files:", error);
        // Send an error response back to the client
        res.status(500).json({
            status: false,
            response: error.message || "Internal Server Error"
        });
    }
});


async function sendhistorycron(estate) {
    try {
        const apiUrl = 'http://ssms-qc.test/api/recordcronjob';
        
        // Create the form data with variables estate and datetime
        const formData = new FormData();
        formData.append('est', estate); // Set the estate variable

        // Get the current date and time in the Jakarta timezone using Luxon
        const dateTime = DateTime.now().setZone('Asia/Jakarta').toISO(); 

        formData.append('datetime', dateTime); // Set the datetime variable to Jakarta timezone

        // Send the POST request with form data
        const response = await axios.post(apiUrl, formData);

        // Handle the response if needed
        console.log("Response:", response.data);
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}


const tasks = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
tasks.forEach(task => {
         const timeString = task.datetime
         // Split the time string into hours and minutes
         const [hours, minutes] = timeString.split(':');
         const cronTime = `${minutes} ${hours} * * *`;
        cron.schedule(cronTime, async () => {
            console.log(`Sending files at ${cronTime} (WIB)...`);
            // await sock.sendMessage(idgroup, { text: `Cronjob ${cronTime}`})
            try {
                await sock.sendMessage(idgroup, { text: `Check Cronjob Fail Tidak Terkirim Sebelumnya`})
                await sendfailcronjob();
            } catch (error) {
                console.error('Error performing task in cronjob:', error);
            }
        }, {
            scheduled: true,
            timezone: 'Asia/Jakarta' // Set the timezone to Asia/Jakarta for WIB
        });
});


// Function to fetch data from API and save as JSON
async function fetchDataAndSaveAsJSON() {
    try {
        const apiUrl = 'http://ssms-qc.test/api/getdatacron';
        const response = await axios.get(apiUrl);
    console.log('ada');
        // Save response data as JSON
        fs.writeFile('data.json', JSON.stringify(response.data, null, 2), err => {
            if (err) {
                console.error('Error saving data:', err);
            } else {
                console.log('Data saved as data.json');
            }
        });
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}
async function sendfailcronjob() {
    try {
        const apiUrl = 'http://ssms-qc.test/api/checkcronjob';
        const response = await axios.get(apiUrl);

        let data = response.data.cronfail; 

        console.log(data);

        for (const task of data) {
            try {
                // await sock.sendMessage(task.group_id, { text: `Cronjob ${task.estate}`});
                await checkAndDeleteFiles(); 
                await Generatedmapsest(task.estate, datetimeValue);
                await GenDefaultTaksasi(task.estate);
                await sendPdfToGroups(task.wilayah, task.group_id);
                await sendhistorycron(task.estate);
            } catch (error) {
                console.error('Error performing task in cronjob:', error);
            }
        }
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}


app.get("/getdataapi", async (req, res) => {
    try {
        // Call fetchDataAndSaveAsJSON function
        // await fetchDataAndSaveAsJSON();
        // await sendfailcronjob();
        // await GenDefaultTaksasi('SCE');
        // await sendPdfToGroups('Wilayah_6', '120363204285862734@g.us');

        // Send response to client
        res.status(200).json({
            status: true,
            response: "Data saved as data.json"
        });
    } catch (error) {
        console.error("Error sending files:", error);
        res.status(500).json({
            status: false,
            response: error.message || "Internal Server Error"
        });
    }
});




connectToWhatsApp()
    .catch(err => console.log("unexpected error: " + err)) // catch any errors
server.listen(port, () => {
    console.log("Server Berjalan pada Port : " + port);
});
