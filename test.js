const axios = require('axios');

async function fetchPdfContent() {
  try {
    const response = await axios.get('https://srs-ssms.com/rekap_pdf/convert_taksasi_pdf_get.php?datetime=2024-03-13&estate=SPE', {
      responseType: 'arraybuffer' // Set responseType to arraybuffer to handle binary data
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching PDF:', error);
    throw error;
  }
}

// Usage example
(async () => {
  try {
    const pdfBuffer = await fetchPdfContent();
    // Now you can save the pdfBuffer to a file or do other processing
    // For example, saving to a file:
    const fs = require('fs');
    fs.writeFileSync('output.pdf', pdfBuffer);
    console.log('PDF downloaded successfully.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
