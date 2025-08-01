import 'dotenv/config'
import fs from 'fs/promises';
import path from 'path';
import pool from '../../../lib/mysql';
import users from '../json/users.json';
import stores from '../json/stores.json';
import products from '../json/products.json';
import bills from '../json/bills.json';
import settings from '../json/settings.json';

async function uploadData() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Upload stores
    for (const store of stores as any[]) {
      const now = new Date();
      const createdAt = store.createdAt ? new Date(store.createdAt) : now;
      const updatedAt = store.updatedAt ? new Date(store.updatedAt) : now;
      await connection.execute(
        'INSERT IGNORE INTO Stores (id, name, address, phone, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [store.id, store.name, store.address, store.phone, store.status, createdAt, updatedAt]
      );
    }

    // Upload users
    for (const user of users as any[]) {
      await connection.execute(
        'INSERT IGNORE INTO Users (id, name, email, password, role, status, sessionDuration, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [user.id, user.name, user.email, user.password, user.role, user.status, user.sessionDuration ?? null, user.createdAt, user.updatedAt]
      );
      if (user.assignedStores) {
        for (const storeId of user.assignedStores) {
          await connection.execute(
            'INSERT IGNORE INTO UserStores (userId, storeId) VALUES (?, ?)',
            [user.id, storeId]
          );
        }
      }
    }

    // Upload categories and products
    const categoryIds = new Map<string, string>();
    for (const product of products as any[]) {
      await connection.execute(
        'INSERT IGNORE INTO Products (id, name, price, stock, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [product.id, product.name, product.price, product.stock, product.description, product.createdAt, product.updatedAt]
      );

      const categoryName = (product as any).category;
      if (categoryName) {
        let categoryId: string;
        const existingCategoryId = categoryIds.get(categoryName);

        if (existingCategoryId) {
          categoryId = existingCategoryId;
        } else {
          categoryId = categoryName.toLowerCase().replace(/\s+/g, '-');
          const now = new Date();
          await connection.execute(
            'INSERT IGNORE INTO Categories (id, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)',
            [categoryId, categoryName, now, now]
          );
          categoryIds.set(categoryName, categoryId);
        }
        
        await connection.execute(
          'INSERT IGNORE INTO ProductCategories (productId, categoryId) VALUES (?, ?)',
          [product.id, categoryId]
        );
      }

      if (product.barcodes) {
        for (const barcode of product.barcodes) {
          await connection.execute(
            'INSERT IGNORE INTO ProductBarcodes (productId, barcode) VALUES (?, ?)',
            [product.id, barcode]
          );
        }
      }
    }

    // Upload customers and bills
    for (const bill of bills as any[]) {
      let customerId = null;
      if (bill.customerPhone) {
        customerId = bill.customerPhone; // Use phone number as customer ID
        const now = new Date();
        await connection.execute(
          'INSERT IGNORE INTO Customers (id, name, phone, email, address, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [customerId, bill.customerName, bill.customerPhone, bill.customerEmail, bill.customerAddress, now, now]
        );
      }

      await connection.execute(
        'INSERT IGNORE INTO Bills (id, storeId, storeName, storeAddress, customerName, customerPhone, customerEmail, customerAddress, customerId, subtotal, taxPercentage, taxAmount, discountPercentage, discountAmount, total, paymentMethod, timestamp, notes, gstin, companyName, companyAddress, companyPhone, companyEmail, billFormat, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [bill.id, bill.storeId, bill.storeName, bill.storeAddress, bill.customerName, bill.customerPhone, bill.customerEmail, bill.customerAddress, customerId, bill.subtotal, bill.taxPercentage, bill.taxAmount, bill.discountPercentage, bill.discountAmount, bill.total, bill.paymentMethod, bill.timestamp, bill.notes, bill.gstin, bill.companyName, bill.companyAddress, bill.companyPhone, bill.companyEmail, bill.billFormat, bill.createdBy]
      );
      if (bill.items) {
        for (const item of bill.items) {
          await connection.execute(
            'INSERT IGNORE INTO BillItems (billId, productId, productName, quantity, price, total) VALUES (?, ?, ?, ?, ?, ?)',
            [bill.id, item.productId, item.productName, item.quantity, item.price, item.total]
          );
        }
      }
    }

    // Upload settings
    await connection.execute(
      'INSERT IGNORE INTO SystemSettings (gstin, taxPercentage, companyName, companyAddress, companyPhone, companyEmail) VALUES (?, ?, ?, ?, ?, ?)',
      [settings.systemSettings.gstin, settings.systemSettings.taxPercentage, settings.systemSettings.companyName, settings.systemSettings.companyAddress, settings.systemSettings.companyPhone, settings.systemSettings.companyEmail]
    );

    for (const [name, format] of Object.entries(settings.billFormats)) {
      await connection.execute(
        'INSERT IGNORE INTO BillFormats (name, format) VALUES (?, ?)',
        [name, JSON.stringify(format)]
      );
    }

    await connection.commit();
    console.log('Data uploaded successfully!');

    const logFilePath = path.join(process.cwd(), 'app', 'data', 'logs', 'sync.log');
    const logMessage = `Last sync: ${new Date().toISOString()}\n`;
    await fs.writeFile(logFilePath, logMessage);
    console.log(`Sync log updated at ${logFilePath}`);
  } catch (error) {
    await connection.rollback();
    console.error('Error uploading data:', error);
  } finally {
    connection.release();
    pool.end();
  }
}

uploadData();
