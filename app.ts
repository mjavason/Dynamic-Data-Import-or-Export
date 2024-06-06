import express, { Request, Response, NextFunction } from 'express';
import 'express-async-errors';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import multer from 'multer';
import xlsx from 'xlsx';
import os from 'os';
import path from 'path';
import fs from 'fs';

//#region app setup
const app = express();
app.use(express.json()); // Middleware to parse JSON or URL-encoded data
app.use(express.urlencoded({ extended: true })); // For complex form data
app.use(cors());
dotenv.config({ path: './.env' });
const tempDir = os.tmpdir(); // Get the system temporary directory
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, tempDir); // Use the system temporary directory
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname); // Keep the original file name
  },
});
const upload = multer({ storage });
//#endregion

//#region keys and configs
const PORT = process.env.PORT || 3000;
const baseURL = 'https://httpbin.org';
//#endregion

app.get('/excel-json', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const filePath = req.file.path;
  const workbook = xlsx.readFile(filePath);
  const sheetNames = workbook.SheetNames;
  const jsonResult: { [key: string]: any[] } = {};

  sheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    jsonResult[sheetName] = xlsx.utils.sheet_to_json(worksheet);
  });

  // Create a JSON file from the result
  const jsonDir = path.join(__dirname, 'uploads');
  const jsonFilePath = path.join(jsonDir, `${req.file.filename}.json`);

  // Ensure the directory exists
  if (!fs.existsSync(jsonDir)) {
    fs.mkdirSync(jsonDir);
  }

  fs.writeFile(
    jsonFilePath,
    JSON.stringify(jsonResult, null, 2),
    (writeErr) => {
      if (writeErr) {
        return res.status(500).send('Error creating JSON file.');
      }

      // Set the file download headers and send the file
      res.setHeader(
        'Content-disposition',
        `attachment; filename=${req.file?.originalname}.json`
      );
      res.setHeader('Content-type', 'application/json');
      res.sendFile(jsonFilePath, (err) => {
        if (err) {
          res.status(500).send('Error downloading the file.');
        } else {
          // Optional: clean up the uploaded Excel and JSON files
          // fs.unlink(filePath, (unlinkErr) => {
          //   if (unlinkErr) console.error(`Error deleting file ${filePath}`);
          // });
          // fs.unlink(jsonFilePath, (unlinkErr) => {
          //   if (unlinkErr) console.error(`Error deleting file ${jsonFilePath}`);
          // });
        }
      });
    }
  );
});

//#region Server setup
// default message
app.get('/api', async (req: Request, res: Response) => {
  const result = await axios.get(baseURL);
  console.log(result.status);
  return res.send({
    message: 'Demo API called (httpbin.org)',
    data: result.status,
  });
});

//default message
app.get('/', (req: Request, res: Response) => {
  return res.send({ message: 'API is Live!' });
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  // throw Error('This is a sample error');

  console.log(`${'\x1b[31m'}${err.message}${'\x1b][0m]'}`);
  console.log('---');
  return res
    .status(500)
    .send({ success: false, status: 500, message: err.message });
});
//#endregion
