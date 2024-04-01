const axios = require('axios');
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
async function GenDefaultTaksasi(est) {
    let attempts = 0;
    const maxAttempts = 5;
    const retryDelay = 3000; // 3 seconds in milliseconds

    while (attempts < maxAttempts) {
        try {
            const response = await axios.get(`https://srs-ssms.com/rekap_pdf/pdf_taksasi_folder.php?est=${est.toLowerCase()}`);
            // await sock.sendMessage(idgroup, { text: `Pdf berhasil di generate ${est}` })
            return response;
        } catch (error) {
            console.error('Error fetching data:', error);
            attempts++;
            if (attempts < maxAttempts) {
                console.log(`Retrying attempt ${attempts} for ${est}`);
                // await sock.sendMessage(idgroup, { text: `Mengulang Generate PDF ${est}` })
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            } else {
                // await sock.sendMessage(idgroup, { text: `Sudah Max Generate PDF ${est} Gagal` })
                throw error; // Throw the error after max attempts are reached
            }
        }
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

            const response = await axios.post('https://digi-kappa-lac.vercel.app/api/run', formData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded' // Set the proper content type for form data
                }
            });

            console.log('Response data:', response.data); // Access the response data
            // await sock.sendMessage(idgroup, { text: `Map ${estate} berhasil di generate` });
            return response.data;
        } catch (error) {
            console.error('Error fetching data:', error);
            // await sock.sendMessage(idgroup, { text: `Map ${estate} gagal di generate ${error.status}`});
            retryCount++;
            if (retryCount === maxRetries) {
                // await sock.sendMessage(idgroup, { text: `Terjadi kesalahan menarik ${estate} yang gagal di generate`});
                throw error;
            } else {
                console.log(`Retrying (${retryCount}/${maxRetries})...`);
                // await sock.sendMessage(idgroup, { text: `Menarik ulang Map ${estate} yang gagal di generate`});
            }
        }
    }
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
        // await sock.sendMessage(idgroup, { text: 'Error checking or deleting file' })
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
            // await sock.sendMessage(idgroup, { text: 'Folder is empty' })
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

                console.log(groupID);
                console.log(destinationPath);
                console.log(fileName);
                await deleteFile(fileName, folder);
            }
        }
        // await sock.sendMessage(idgroup, { text: 'Laporan berhasil di kirim ke grup' })
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

async function getdatataksasi(est) {
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
                // await sock.sendMessage(idgroup, { text: 'Kadidak ulun cari estate ni!'})

                return;
        }
      
        // await Generatedmapsest(est);
        await checkAndDeleteFiles(); 
        await Generatedmapsest(est,datetimeValue)
        await GenDefaultTaksasi(est)
        // await sendmsgAws(`Generate pdf untuk ${est} sukses`, '120363205553012899@g.us');

        // await client.sendMessage(`Generate pdf untuk ${est} sukses`);
        // console.log(`Files generated successfully for '${est}' in folder '${folder}'.`);

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
                await sendPdfToGroups(folder, '120363217205685424@g.us');
                // testing 
                //   await sendPdfToGroups(folder, '120363204285862734@g.us');
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

module.exports = {
    getdatataksasi
};