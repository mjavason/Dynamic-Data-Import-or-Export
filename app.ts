import express, { Request, Response, NextFunction } from 'express';
import 'express-async-errors';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import multer from 'multer';
import os from 'os';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import xlsx from 'xlsx';
import { parse } from 'csv-parse';
import { create } from 'xmlbuilder2';

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
      }
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
const sanitizeKey = (key: string): string => {
  return key.replace(/^[^a-zA-Z_]+|[^a-zA-Z0-9_\-:.]/g, '_');
}; // Function to sanitize JSON keys for XML element names
//#endregion

//#region code here

//#region excel

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

/**
 * @swagger
 * /excel-xml:
 *   post:
 *     summary: Upload an excel file to be converted to XML
 *     description: This will return an XML file
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
app.post('/excel-xml', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const filePath = req.file.path;
  const workbook = xlsx.readFile(filePath);
  const sheetNames = workbook.SheetNames;
  const xmlFilePath = path.join(tempDir, `${req.file.filename}.xml`);
  let xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n<workbook>\n';
  xmlContent += '<?xml-stylesheet type="text/xsl" href="style.xsl"?>\n'; // Optional: Add a reference to an XSL stylesheet

  sheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet);

    xmlContent += `  <sheet name="${sheetName}">\n`;
    jsonData.forEach((row: any) => {
      xmlContent += `    <row>\n`;
      Object.entries(row).forEach(([key, value]) => {
        xmlContent += `      <${key}>${value}</${key}>\n`;
      });
      xmlContent += `    </row>\n`;
    });
    xmlContent += `  </sheet>\n`;
  });

  xmlContent += '</workbook>';

  fs.writeFileSync(xmlFilePath, xmlContent);

  res.setHeader(
    'Content-disposition',
    `attachment; filename=${req.file?.originalname}.xml`
  );
  res.setHeader('Content-type', 'application/xml');
  res.sendFile(xmlFilePath, (err) => {
    if (err) {
      res.status(500).send('Error downloading the file.');
    } else {
      // Optional: clean up the uploaded Excel and XML files
      // fs.unlink(filePath, (unlinkErr) => {
      //   if (unlinkErr) console.error(`Error deleting file ${filePath}`);
      // });
      // fs.unlink(xmlFilePath, (unlinkErr) => {
      //   if (unlinkErr) console.error(`Error deleting file ${xmlFilePath}`);
      // });
    }
  });
});
//#endregion excel

//#region csv

/**
 * @swagger
 * /csv-excel:
 *   post:
 *     summary: Upload a CSV file to be converted to Excel
 *     description: This will return an Excel file
 *     tags:
 *       - CSV
 *     requestBody:
 *       description: CSV file to be converted
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
app.post('/csv-excel', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).send('No file uploaded.');

  const filePath = req.file.path;
  const workbook = xlsx.utils.book_new();
  const sheetName = path.parse(req.file.originalname).name;

  // Read the CSV file
  const csvData = fs.readFileSync(filePath, 'utf8');
  const rows = csvData.split('\n').map((line) => line.split(','));

  // Create a worksheet from the CSV data
  const worksheet = xlsx.utils.aoa_to_sheet(rows);

  // Add the worksheet to the workbook
  xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Generate the Excel file
  const excelFilePath = path.join(tempDir, `${req.file.filename}.xlsx`);
  xlsx.writeFile(workbook, excelFilePath);

  res.setHeader(
    'Content-disposition',
    `attachment; filename=${req.file?.originalname}.xlsx`
  );
  res.setHeader(
    'Content-type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.sendFile(excelFilePath, (err) => {
    if (err) {
      res.status(500).send('Error downloading the file.');
    } else {
      // Optional: clean up the uploaded CSV and generated Excel files
      // fs.unlink(filePath, (unlinkErr) => {
      //   if (unlinkErr) console.error(`Error deleting file ${filePath}`);
      // });
      // fs.unlink(excelFilePath, (unlinkErr) => {
      //   if (unlinkErr) console.error(`Error deleting file ${excelFilePath}`);
      // });
    }
  });
});

/**
 * @swagger
 * /csv-json:
 *   post:
 *     summary: Upload a CSV file to be converted to JSON
 *     description: This will return a JSON file
 *     tags:
 *       - CSV
 *     requestBody:
 *       description: CSV file to be converted
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
app.post('/csv-json', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).send('No file uploaded.');

  const filePath = req.file.path;
  const fileName = req.file.filename;
  const csvData = fs.readFileSync(filePath, 'utf8');
  const records: any[] = [];

  parse(
    csvData,
    {
      columns: true,
      skip_empty_lines: true,
    },
    (err, parsedData) => {
      if (err) {
        return res.status(500).send('Error parsing CSV file.');
      }

      records.push(...parsedData);

      // Generate the JSON file
      const jsonFilePath = path.join(tempDir, `${fileName}.json`);
      fs.writeFileSync(jsonFilePath, JSON.stringify(records, null, 2));

      res.setHeader(
        'Content-disposition',
        `attachment; filename=${req.file?.originalname}.json`
      );
      res.setHeader('Content-type', 'application/json');
      res.sendFile(jsonFilePath, (err) => {
        if (err) {
          res.status(500).send('Error downloading the file.');
        } else {
          // Optional: clean up the uploaded CSV and generated JSON files
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

/**
 * @swagger
 * /csv-sql:
 *   post:
 *     summary: Upload a CSV file to be converted to SQL
 *     description: This will return a SQL file with INSERT statements
 *     tags:
 *       - CSV
 *     requestBody:
 *       description: CSV file to be converted
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
app.post('/csv-sql', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const filePath = req.file.path;
  const csvData = fs.readFileSync(filePath, 'utf8');
  const records: any[] = [];
  const tableName = path.parse(req.file.originalname).name;
  const fileName = req.file.filename;

  parse(
    csvData,
    {
      columns: true,
      skip_empty_lines: true,
    },
    (err, parsedData) => {
      if (err) {
        return res.status(500).send('Error parsing CSV file.');
      }

      records.push(...parsedData);

      let sqlContent = `CREATE TABLE ${tableName} (\n`;
      const columns = Object.keys(records[0]);

      // Define columns
      columns.forEach((col, index) => {
        sqlContent += `  ${col} TEXT${index < columns.length - 1 ? ',' : ''}\n`;
      });
      sqlContent += `);\n\n`;

      // Insert data
      records.forEach((record) => {
        sqlContent += `INSERT INTO ${tableName} (${columns.join(
          ', '
        )}) VALUES (`;
        sqlContent += columns.map((col) => `'${record[col]}'`).join(', ');
        sqlContent += `);\n`;
      });

      // Generate the SQL file
      const sqlFilePath = path.join(tempDir, `${fileName}.sql`);
      fs.writeFileSync(sqlFilePath, sqlContent);

      res.setHeader(
        'Content-disposition',
        `attachment; filename=${req.file?.originalname}.sql`
      );
      res.setHeader('Content-type', 'application/sql');
      res.sendFile(sqlFilePath, (err) => {
        if (err) {
          res.status(500).send('Error downloading the file.');
        } else {
          // Optional: clean up the uploaded CSV and generated SQL files
          // fs.unlink(filePath, (unlinkErr) => {
          //   if (unlinkErr) console.error(`Error deleting file ${filePath}`);
          // });
          // fs.unlink(sqlFilePath, (unlinkErr) => {
          //   if (unlinkErr) console.error(`Error deleting file ${sqlFilePath}`);
          // });
        }
      });
    }
  );
});

/**
 * @swagger
 * /csv-xml:
 *   post:
 *     summary: Upload a CSV file to be converted to XML
 *     description: This will return an XML file
 *     tags:
 *       - CSV
 *     requestBody:
 *       description: CSV file to be converted
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
app.post('/csv-xml', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const filePath = req.file.path;
  const fileName = req.file.filename;
  const csvData = fs.readFileSync(filePath, 'utf8');
  const records: any[] = [];
  const rootElementName = path.parse(req.file.originalname).name;

  parse(
    csvData,
    {
      columns: true,
      skip_empty_lines: true,
    },
    (err, parsedData) => {
      if (err) {
        return res.status(500).send('Error parsing CSV file.');
      }

      records.push(...parsedData);

      // Create XML content
      const xml = create({ version: '1.0', encoding: 'UTF-8' }).ele(
        rootElementName
      );

      records.forEach((record) => {
        const item = xml.ele('item');
        Object.keys(record).forEach((key) => {
          item.ele(key).txt(record[key]);
        });
      });

      const xmlContent = xml.end({ prettyPrint: true });

      // Generate the XML file
      const xmlFilePath = path.join(tempDir, `${fileName}.xml`);
      fs.writeFileSync(xmlFilePath, xmlContent);

      res.setHeader(
        'Content-disposition',
        `attachment; filename=${req.file?.originalname}.xml`
      );
      res.setHeader('Content-type', 'application/xml');
      res.sendFile(xmlFilePath, (err) => {
        if (err) {
          res.status(500).send('Error downloading the file.');
        } else {
          // Optional: clean up the uploaded CSV and generated XML files
          // fs.unlink(filePath, (unlinkErr) => {
          //   if (unlinkErr) console.error(`Error deleting file ${filePath}`);
          // });
          // fs.unlink(xmlFilePath, (unlinkErr) => {
          //   if (unlinkErr) console.error(`Error deleting file ${xmlFilePath}`);
          // });
        }
      });
    }
  );
});

//#endregion csv

//#region json

/**
 * @swagger
 * /json-csv:
 *   post:
 *     summary: Upload a JSON file to be converted to CSV
 *     description: This will return a CSV file
 *     tags:
 *       - JSON
 *     requestBody:
 *       description: JSON file to be converted
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
app.post('/json-csv', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const filePath = req.file.path;
  const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Convert JSON data to worksheet
  const worksheet = xlsx.utils.json_to_sheet(jsonData);

  // Convert worksheet to CSV
  const csvContent = xlsx.utils.sheet_to_csv(worksheet);

  // Generate the CSV file
  const csvFilePath = path.join(tempDir, `${req.file.filename}.csv`);
  fs.writeFileSync(csvFilePath, csvContent);

  res.setHeader(
    'Content-disposition',
    `attachment; filename=${req.file?.originalname}.csv`
  );
  res.setHeader('Content-type', 'text/csv');
  res.sendFile(csvFilePath, (err) => {
    if (err) {
      res.status(500).send('Error downloading the file.');
    } else {
      // Optional: clean up the uploaded JSON and generated CSV files
      // fs.unlink(filePath, (unlinkErr) => {
      //   if (unlinkErr) console.error(`Error deleting file ${filePath}`);
      // });
      // fs.unlink(csvFilePath, (unlinkErr) => {
      //   if (unlinkErr) console.error(`Error deleting file ${csvFilePath}`);
      // });
    }
  });
});

/**
 * @swagger
 * /json-excel:
 *   post:
 *     summary: Upload a JSON file to be converted to Excel
 *     description: This will return an Excel file
 *     tags:
 *       - JSON
 *     requestBody:
 *       description: JSON file to be converted
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
  '/json-excel',
  upload.single('file'),
  (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }

    const filePath = req.file.path;
    const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Convert JSON data to worksheet
    const worksheet = xlsx.utils.json_to_sheet(jsonData);

    // Create a new workbook and append the worksheet
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

    // Generate the Excel file
    const excelFilePath = path.join(tempDir, `${req.file.filename}.xlsx`);
    xlsx.writeFile(workbook, excelFilePath);

    res.setHeader(
      'Content-disposition',
      `attachment; filename=${req.file?.originalname}.xlsx`
    );
    res.setHeader(
      'Content-type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.sendFile(excelFilePath, (err) => {
      if (err) {
        res.status(500).send('Error downloading the file.');
      } else {
        // Optional: clean up the uploaded JSON and generated Excel files
        // fs.unlink(filePath, (unlinkErr) => {
        //   if (unlinkErr) console.error(`Error deleting file ${filePath}`);
        // });
        // fs.unlink(excelFilePath, (unlinkErr) => {
        //   if (unlinkErr) console.error(`Error deleting file ${excelFilePath}`);
        // });
      }
    });
  }
);

/**
 * @swagger
 * /json-sql:
 *   post:
 *     summary: Upload a JSON file to be converted to SQL
 *     description: This will return an SQL file with insert statements
 *     tags:
 *       - JSON
 *     requestBody:
 *       description: JSON file to be converted
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
app.post('/json-sql', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const filePath = req.file.path;
  const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (!Array.isArray(jsonData)) {
    return res
      .status(400)
      .send('Invalid JSON format. Expected an array of objects.');
  }

  // Convert JSON data to SQL insert statements
  const tableName = path.parse(req.file.originalname).name;
  const sqlStatements = jsonData
    .map((row) => {
      const columns = Object.keys(row).join(', ');
      const values = Object.values(row)
        .map((value) =>
          typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value
        )
        .join(', ');
      return `INSERT INTO ${tableName} (${columns}) VALUES (${values});`;
    })
    .join('\n');

  // Generate the SQL file
  const tempDir = os.tmpdir();
  const sqlFilePath = path.join(tempDir, `${req.file.filename}.sql`);
  fs.writeFileSync(sqlFilePath, sqlStatements);

  res.setHeader(
    'Content-disposition',
    `attachment; filename=${req.file?.originalname}.sql`
  );
  res.setHeader('Content-type', 'application/sql');
  res.sendFile(sqlFilePath, (err) => {
    if (err) {
      res.status(500).send('Error downloading the file.');
    } else {
      // Optional: clean up the uploaded JSON and generated SQL files
      // fs.unlink(filePath, (unlinkErr) => {
      //   if (unlinkErr) console.error(`Error deleting file ${filePath}`);
      // });
      // fs.unlink(sqlFilePath, (unlinkErr) => {
      //   if (unlinkErr) console.error(`Error deleting file ${sqlFilePath}`);
      // });
    }
  });
});

/**
 * @swagger
 * /json-xml:
 *   post:
 *     summary: Upload a JSON file to be converted to XML
 *     description: This will return an XML file
 *     tags:
 *       - JSON
 *     requestBody:
 *       description: JSON file to be converted
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
app.post('/json-xml', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const filePath = req.file.path;
  const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Convert JSON data to XML
  const root = create({ version: '1.0' }).ele('root');

  const buildXML = (obj: any, parent: any) => {
    Object.keys(obj).forEach((key) => {
      const sanitizedKey = sanitizeKey(key);
      if (Array.isArray(obj[key])) {
        obj[key].forEach((item: any) => {
          const child = parent.ele(sanitizedKey);
          buildXML(item, child);
        });
      } else if (typeof obj[key] === 'object') {
        const child = parent.ele(sanitizedKey);
        buildXML(obj[key], child);
      } else {
        parent.ele(sanitizedKey).txt(obj[key]);
      }
    });
  };

  buildXML(jsonData, root);
  const xmlContent = root.end({ prettyPrint: true });

  // Generate the XML file
  const tempDir = os.tmpdir();
  const xmlFilePath = path.join(tempDir, `${req.file.filename}.xml`);
  fs.writeFileSync(xmlFilePath, xmlContent);

  res.setHeader(
    'Content-disposition',
    `attachment; filename=${req.file?.originalname}.xml`
  );
  res.setHeader('Content-type', 'application/xml');
  res.sendFile(xmlFilePath, (err) => {
    if (err) {
      res.status(500).send('Error downloading the file.');
    } else {
      // Optional: clean up the uploaded JSON and generated XML files
      // fs.unlink(filePath, (unlinkErr) => {
      //   if (unlinkErr) console.error(`Error deleting file ${filePath}`);
      // });
      // fs.unlink(xmlFilePath, (unlinkErr) => {
      //   if (unlinkErr) console.error(`Error deleting file ${xmlFilePath}`);
      // });
    }
  });
});

//#endregion json

//#endregion code here

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
