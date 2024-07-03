import express, { Request, Response, NextFunction } from 'express';
import 'express-async-errors';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import multer from 'multer';
import xlsx from 'xlsx';
import os from 'os';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';

//#region app setup
const app = express();
const SWAGGER_OPTIONS = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'Dynamic Data Export/Import App',
      version: '1.0.0',
      description:
        'Think of this as a data converter. Want to export your mongoDB database as an excel sheet? No problem. Want to Import from a SQL database to CSV or JSON? No problem.',
      contact: {
        name: 'Orji Michael',
        email: 'orjimichael4886@gmail.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000', // Development environment
        description: 'Development Environment',
      },
      {
        url: 'https://live.onrender.com/api/v1', // Staging environment
        description: 'Staging Environment',
      },
      // {
      //   url: 'https://api.example.com/api/v1', // Production environment
      //   description: 'Production Environment',
      // },
    ],
    tags: [
      {
        name: 'Default',
        description: 'Default API Operations that come inbuilt',
      },
      {
        name: 'Excel',
        description: 'Excel file conversions',
      },
      {
        name: 'CSV',
        description: 'CSV file conversions',
      },
      {
        name: 'JSON',
        description: 'JSON file conversions',
      },
      {
        name: 'SQL',
        description: 'SQL file conversions',
      },
      {
        name: 'XML',
        description: 'XML file conversions',
      },
    ],
  },
  apis: ['**/*.ts'], // Define the paths to your API routes
};
const swaggerSpec = swaggerJSDoc(SWAGGER_OPTIONS);
app.use(express.json()); // Middleware to parse JSON or URL-encoded data
app.use(express.urlencoded({ extended: true })); // For complex form data
app.use(cors());
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
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

//#region code here

/**
 * @swagger
 * /excel-json:
 *   post:
 *     summary: Upload an excel file to be converted to json
 *     description: This will return a json file
 *     tags:
 *       - Excel
 *     requestBody:
 *       description: Excel file to be converted
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       '200':
 *         description: Successfully created a new document
 *       '400':
 *         description: Bad request
 */
app.post(
  '/excel-json',
  upload.single('file'),
  (req: Request, res: Response) => {
    if (!req.file) return res.status(400).send('No file uploaded.');

    const filePath = req.file.path;
    const workbook = xlsx.readFile(filePath);
    const sheetNames = workbook.SheetNames;
    const jsonResult: { [key: string]: any[] } = {};

    sheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      jsonResult[sheetName] = xlsx.utils.sheet_to_json(worksheet);
    });

    const tempDir = os.tmpdir();

    // Ensure the directory exists
    // const jsonDir = path.join(__dirname, 'uploads');
    // if (!fs.existsSync(jsonDir)) fs.mkdirSync(jsonDir);

    const jsonFilePath = path.join(tempDir, `${req.file.filename}.json`);

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
  }
);

/**
 * @swagger
 * /excel-csv:
 *   post:
 *     summary: Upload an excel file to be converted to csv
 *     description: This will return a csv file
 *     tags:
 *       - Excel
 *     requestBody:
 *       description: Excel file to be converted
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       '200':
 *         description: Successfully created a new document
 *       '400':
 *         description: Bad request
 */
app.post('/excel-csv', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).send('No file uploaded.');

  const filePath = req.file.path;
  const fileName = req.file.filename;
  const workbook = xlsx.readFile(filePath);
  const sheetNames = workbook.SheetNames;
  const tempDir = os.tmpdir();
  const csvFiles: string[] = [];

  sheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const csvData = xlsx.utils.sheet_to_csv(worksheet);
    const csvFilePath = path.join(tempDir, `${fileName}-${sheetName}.csv`);

    fs.writeFileSync(csvFilePath, csvData);
    csvFiles.push(csvFilePath);
  });

  const zip = new AdmZip();
  csvFiles.forEach((csvFile) => {
    zip.addLocalFile(csvFile);
  });

  const zipFilePath = path.join(tempDir, `${req.file.filename}.zip`);
  zip.writeZip(zipFilePath);

  res.setHeader(
    'Content-disposition',
    `attachment; filename=${req.file?.originalname}.zip`
  );
  res.setHeader('Content-type', 'application/zip');
  res.sendFile(zipFilePath, (err) => {
    if (err) {
      res.status(500).send('Error downloading the file.');
    } else {
      // Optional: clean up the uploaded Excel and CSV files
      // fs.unlink(filePath, (unlinkErr) => {
      //   if (unlinkErr) console.error(`Error deleting file ${filePath}`);
      // });
      // csvFiles.forEach((csvFile) => {
      //   fs.unlink(csvFile, (unlinkErr) => {
      //     if (unlinkErr) console.error(`Error deleting file ${csvFile}`);
      //   });
      // });
      // fs.unlink(zipFilePath, (unlinkErr) => {
      //   if (unlinkErr) console.error(`Error deleting file ${zipFilePath}`);
      // });
    }
  });
});

/**
 * @swagger
 * /excel-sql:
 *   post:
 *     summary: Upload an excel file to be converted to SQL
 *     description: This will return a SQL file
 *     tags:
 *       - Excel
 *     requestBody:
 *       description: Excel file to be converted
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       '200':
 *         description: Successfully created a new document
 *       '400':
 *         description: Bad request
 */
app.post('/excel-sql', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).send('No file uploaded.');

  const filePath = req.file.path;
  const workbook = xlsx.readFile(filePath);
  const sheetNames = workbook.SheetNames;
  const tempDir = os.tmpdir();
  const sqlFilePath = path.join(tempDir, `${req.file.filename}.sql`);
  const sqlStatements: string[] = [];

  sheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData: any = xlsx.utils.sheet_to_json(worksheet);

    if (jsonData.length > 0) {
      const columns = Object.keys(jsonData[0])
        .map((col) => `\`${col}\``)
        .join(', ');

      jsonData.forEach((row: any) => {
        const values = Object.values(row)
          .map((value) =>
            typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value
          )
          .join(', ');
        sqlStatements.push(
          `INSERT INTO \`${sheetName}\` (${columns}) VALUES (${values});`
        );
      });
    }
  });

  fs.writeFileSync(sqlFilePath, sqlStatements.join('\n'));

  res.setHeader(
    'Content-disposition',
    `attachment; filename=${req.file?.originalname}.sql`
  );
  res.setHeader('Content-type', 'application/sql');
  res.sendFile(sqlFilePath, (err) => {
    if (err) {
      res.status(500).send('Error downloading the file.');
    } else {
      // Optional: clean up the uploaded Excel and SQL files
      // fs.unlink(filePath, (unlinkErr) => {
      //   if (unlinkErr) console.error(`Error deleting file ${filePath}`);
      // });
      // fs.unlink(sqlFilePath, (unlinkErr) => {
      //   if (unlinkErr) console.error(`Error deleting file ${sqlFilePath}`);
      // });
    }
  });
});

//#endregion

//#region Server setup
async function pingSelf() {
  try {
    const { data } = await axios.get(`http://localhost:5000`);

    console.log(`Server pinged successfully: ${data.message}`);
    return true;
  } catch (e: any) {
    console.log(`this the error message: ${e.message}`);
    return;
  }
}

// default message
/**
 * @swagger
 * /api:
 *   get:
 *     summary: Call a demo extenal API (httpbin.org)
 *     description: Returns an object containing demo content
 *     tags: [Default]
 *     responses:
 *       '200':
 *         description: Successful.
 *       '400':
 *         description: Bad request.
 */
app.get('/api', async (req: Request, res: Response) => {
  const result = await axios.get(baseURL);
  console.log(result.status);
  return res.send({
    message: 'Demo API called (httpbin.org)',
    data: result.status,
  });
});

//default message
/**
 * @swagger
 * /:
 *   get:
 *     summary: API Health check
 *     description: Returns an object containing demo content
 *     tags: [Default]
 *     responses:
 *       '200':
 *         description: Successful.
 *       '400':
 *         description: Bad request.
 */
app.get('/', (req: Request, res: Response) => {
  return res.send({ message: 'API is Live!' });
});

// Middleware to handle 404 Not Found
/**
 * @swagger
 * /obviously/this/route/cant/exist:
 *   get:
 *     summary: API 404 Response
 *     description: Returns a non crashing result when you try to run a route that doesnt exist
 *     tags: [Default]
 *     responses:
 *       '404':
 *         description: Route not found
 */
app.use((req: Request, res: Response) => {
  return res
    .status(404)
    .json({ success: false, message: 'API route does not exist' });
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
});

// (for render services) Keep the API awake by pinging it periodically
// setInterval(pingSelf, 600000);

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  // throw Error('This is a sample error');

  console.log(`${'\x1b[31m'}${err.message}${'\x1b][0m]'}`);
  return res
    .status(500)
    .send({ success: false, status: 500, message: err.message });
});
//#endregion
