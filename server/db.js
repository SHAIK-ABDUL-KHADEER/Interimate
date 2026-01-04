const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

async function readJSON(filename) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return (filename.includes('quiz') || filename.includes('code')) ? [] : {};
    }
    throw error;
  }
}

async function writeJSON(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { readJSON, writeJSON };
